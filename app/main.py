"""
main.py — fastapi app.

Routes:
  GET  /                  → dashboard (static HTML)
  GET  /api/health        → {ok, version, sites_supported}
  POST /api/scrape        → body: {search_term, location, sites, hours_old, results_wanted}
                          → returns normalized job list (see scraper.py)
"""
from __future__ import annotations

import logging
import os
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import scraper

log_level = os.getenv("LOG_LEVEL", "INFO").upper()
logging.basicConfig(
    level=log_level,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
log = logging.getLogger("agent-jobs.main")

VERSION = "1.0.0"

app = FastAPI(
    title="Agent Jobs",
    description="Job board scraper (linkedin/indeed/glassdoor) with a tiny dashboard.",
    version=VERSION,
)


class ScrapeRequest(BaseModel):
    search_term: str = Field(..., min_length=1, max_length=200, description="job title / keywords")
    location: str = Field("", max_length=200, description='e.g. "Remote", "San Francisco", or empty')
    sites: list[str] | None = Field(None, description='subset of ["linkedin","indeed","glassdoor","zip_recruiter","google"]; default = all configured')
    hours_old: int | None = Field(None, ge=1, le=24 * 30, description="filter: posted within N hours")
    results_wanted: int | None = Field(None, ge=1, le=200, description="per-site cap")
    timeout_seconds: int | None = Field(None, ge=5, le=300, description="override default 90s timeout")


@app.get("/api/health")
async def health() -> dict:
    return {
        "ok": True,
        "version": VERSION,
        "sites_supported": sorted(scraper.ALLOWED_SITES),
        "sites_default": scraper.DEFAULT_SITES,
        "timeout_default_s": scraper.DEFAULT_TIMEOUT_SECONDS,
    }


@app.post("/api/scrape")
async def scrape(req: ScrapeRequest) -> dict:
    try:
        return await scraper.scrape(
            search_term=req.search_term,
            location=req.location,
            sites=req.sites,
            hours_old=req.hours_old,
            results_wanted=req.results_wanted,
            timeout_seconds=req.timeout_seconds,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# serve the dashboard from app/static/
STATIC_DIR = Path(__file__).parent / "static"
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/")
async def root() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")
