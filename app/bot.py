"""
bot.py — telegram bot polling loop, simplest possible.

runs as a background asyncio task on app startup. polls getUpdates
every BOT_POLL_INTERVAL seconds (default 3600 = 1 hour), processes
any /start messages by registering the sender as a subscriber in
sqlite, sends them a welcome message.

env vars:
  TELEGRAM_BOT_TOKEN    — bot token (required for bot to start)
  BOT_POLL_INTERVAL_S   — seconds between polls (default 3600)
"""
from __future__ import annotations

import asyncio
import logging
import os

import httpx

from . import admin

log = logging.getLogger("agent-jobs.bot")

POLL_INTERVAL_S = int(os.getenv("BOT_POLL_INTERVAL_S", "3600"))
POLL_TIMEOUT_S = 30
OFFSET_FILE = os.getenv("BOT_OFFSET_FILE", "/data/bot_offset")


def _load_offset() -> int:
    try:
        with open(OFFSET_FILE) as f:
            return int(f.read().strip() or "0")
    except (FileNotFoundError, ValueError):
        return 0


def _save_offset(offset: int) -> None:
    try:
        os.makedirs(os.path.dirname(OFFSET_FILE), exist_ok=True)
        with open(OFFSET_FILE, "w") as f:
            f.write(str(offset))
    except OSError as e:
        log.warning(f"could not save bot offset: {e}")


async def _send_message(token: str, chat_id: int, text: str) -> bool:
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    try:
        async with httpx.AsyncClient(timeout=POLL_TIMEOUT_S) as client:
            r = await client.post(url, json={"chat_id": chat_id, "text": text})
            if r.status_code != 200:
                log.warning(f"sendMessage {chat_id} failed: {r.status_code} {r.text[:200]}")
                return False
            return True
    except Exception as e:
        log.exception(f"sendMessage exception: {e}")
        return False


async def _handle_start(token: str, chat_id: int, user: dict) -> None:
    first = user.get("first_name") or ""
    username = user.get("username")
    admin.add_subscriber(chat_id, first or None, username)
    n = len(admin.list_subscribers())
    await _send_message(
        token, chat_id,
        f"👋 hi {first}! you're #{n} subscriber.\n\n"
        f"every search on the dashboard will now drop an xlsx of results here.",
    )
    log.info(f"new subscriber: chat_id={chat_id} username={username} total={n}")


async def _poll_once(token: str, offset: int) -> int:
    """fetch updates since offset, process /starts, return new offset."""
    url = f"https://api.telegram.org/bot{token}/getUpdates"
    params = {"offset": offset, "timeout": 0, "allowed_updates": '["message"]'}
    try:
        async with httpx.AsyncClient(timeout=POLL_TIMEOUT_S) as client:
            r = await client.get(url, params=params)
            if r.status_code != 200:
                log.warning(f"getUpdates failed: {r.status_code} {r.text[:200]}")
                return offset
            data = r.json()
    except Exception as e:
        log.exception(f"getUpdates exception: {e}")
        return offset

    if not data.get("ok"):
        return offset

    new_offset = offset
    for u in data.get("result", []):
        new_offset = max(new_offset, u["update_id"] + 1)
        msg = u.get("message") or {}
        chat = msg.get("chat") or {}
        chat_id = chat.get("id")
        text = (msg.get("text") or "").strip()
        if chat_id is None:
            continue
        if text.startswith("/start"):
            await _handle_start(token, chat_id, msg.get("from") or {})
        else:
            # minimal support: reply to anything with the subscriber count
            n = len(admin.list_subscribers())
            await _send_message(
                token, chat_id,
                f"send /start to subscribe. ({n} subscribers so far)",
            )
    if new_offset > offset:
        _save_offset(new_offset)
    return new_offset


async def start_polling(token: str) -> None:
    """background task. polls every POLL_INTERVAL_S."""
    if not token:
        log.info("bot polling skipped (TELEGRAM_BOT_TOKEN not set)")
        return
    log.info(f"bot polling starting (interval={POLL_INTERVAL_S}s)")
    offset = _load_offset()
    while True:
        try:
            offset = await _poll_once(token, offset)
        except Exception as e:
            log.exception(f"poll loop error: {e}")
        await asyncio.sleep(POLL_INTERVAL_S)
