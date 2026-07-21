# Agent Jobs

Scrape job boards (linkedin, indeed, glassdoor) through one HTTP API.
Comes with a tiny dashboard at `/`.

## one-click deploy to render

this repo includes a `render.yaml` blueprint, so clicking the button
creates the service on render with the right plan, region, and env vars.

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/Osaka-Research/Agent-Jobs)

## what you get

- `GET /` — dashboard (single page, no js framework)
- `GET /api/health` — `{ok, version, sites_supported, sites_default, timeout_default_s}`
- `POST /api/scrape` — body:
  ```json
  {
    "search_term": "python backend",
    "location": "Remote",
    "sites": ["linkedin", "indeed"],
    "hours_old": 168,
    "results_wanted": 50
  }
  ```

  returns:
  ```json
  {
    "ok": true,
    "jobs": [{ "id": "...", "title": "...", "company": "...", "url": "...", "description": "..." }],
    "count": 27,
    "sites": ["linkedin", "indeed"]
  }
  ```

## curl example

```bash
curl -X POST https://agent-jobs.onrender.com/api/scrape \
  -H "Content-Type: application/json" \
  -d '{"search_term":"python developer","location":"Remote","results_wanted":20}'
```

## config

env vars (set in `render.yaml`):
- `SCRAPE_DEFAULT_SITES` — comma list, default `linkedin,indeed,glassdoor`
- `SCRAPE_DEFAULT_HOURS_OLD` — default `168` (1 week)
- `SCRAPE_MAX_PER_SITE` — default `50`
- `SCRAPE_TIMEOUT_SECONDS` — default `90`

## local dev

```bash
uv venv .venv
. .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
# → http://127.0.0.1:8000
```

## notes

- jobspy uses the live linkedin/indeed/glassdoor sites; some sites rate-limit aggressively. if a scrape returns fewer results than expected, the upstream is throttling, not the api.
- per-call timeout is 90s. if you need longer, raise `SCRAPE_TIMEOUT_SECONDS`.
- this service is **public** by default on render. if you want auth, put a shared secret in a header and reject at the fastapi layer.

## license

MIT
