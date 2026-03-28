from __future__ import annotations

"""Twitch Stream Collector

For each game in the DB:
1. Resolve Steam title → Twitch game_id (3-pass name resolution, cached to JSON)
2. Fetch concurrent streams via /helix/streams
3. Write to twitch_snapshots table
4. Also denormalize peak_viewers + concurrent_streams onto the latest game_snapshot

Token management:
- POST /oauth2/token for Client Credentials
- Module-level state: _token, _token_expires_at
- On 401 mid-run: refresh once and retry
- Pre-emptive refresh if < 24h remaining at run start
"""

import json
import logging
import re
import time
from datetime import date, datetime, timezone
from pathlib import Path

import httpx

from collectors._http import fetch_with_retry, twitch_limiter
from config import settings
from database import SessionLocal
from models import CollectionRun, Game, GameSnapshot, TwitchSnapshot

logger = logging.getLogger(__name__)

TWITCH_TOKEN_URL = "https://id.twitch.tv/oauth2/token"
TWITCH_GAMES_URL = "https://api.twitch.tv/helix/games"
TWITCH_STREAMS_URL = "https://api.twitch.tv/helix/streams"

# Sidecar file to persist game_id mappings across restarts
_MAP_PATH = Path(__file__).parent.parent / "twitch_game_map.json"

# Module-level token state
_token: str | None = None
_token_expires_at: float = 0.0
_game_map: dict[str, int | None] = {}  # Twitch title → Twitch game_id (or None if not found)


def _load_game_map() -> None:
    global _game_map
    if _MAP_PATH.exists():
        try:
            _game_map = json.loads(_MAP_PATH.read_text())
        except Exception:
            _game_map = {}


def _save_game_map() -> None:
    try:
        _MAP_PATH.write_text(json.dumps(_game_map))
    except Exception as e:
        logger.warning(f"Could not save twitch_game_map.json: {e}")


async def _refresh_token(client: httpx.AsyncClient) -> bool:
    """Fetch a new Client Credentials token. Returns True on success."""
    global _token, _token_expires_at
    if not settings.twitch_client_id or not settings.twitch_client_secret:
        logger.warning("Twitch credentials not configured — skipping Twitch collection")
        return False
    try:
        resp = await client.post(
            TWITCH_TOKEN_URL,
            data={
                "client_id": settings.twitch_client_id,
                "client_secret": settings.twitch_client_secret,
                "grant_type": "client_credentials",
            },
            timeout=15.0,
        )
        if resp.status_code != 200:
            logger.error(f"Twitch token request failed: {resp.status_code} {resp.text}")
            return False
        body = resp.json()
        _token = body["access_token"]
        # expires_in is seconds; buffer by 60s
        _token_expires_at = time.time() + body.get("expires_in", 3600 * 24 * 58) - 60
        logger.info("Twitch token refreshed successfully")
        return True
    except Exception as e:
        logger.error(f"Twitch token refresh error: {e}")
        return False


def _twitch_headers() -> dict[str, str]:
    return {
        "Client-ID": settings.twitch_client_id,
        "Authorization": f"Bearer {_token}",
    }


async def _twitch_get(client: httpx.AsyncClient, url: str, params: dict) -> dict | None:
    """GET a Twitch API endpoint with automatic 401 token refresh."""
    await twitch_limiter.acquire()
    try:
        resp = await client.get(url, params=params, headers=_twitch_headers(), timeout=15.0)
        if resp.status_code == 401:
            logger.info("Twitch 401 — refreshing token and retrying")
            ok = await _refresh_token(client)
            if not ok:
                return None
            await twitch_limiter.acquire()
            resp = await client.get(url, params=params, headers=_twitch_headers(), timeout=15.0)
        if resp.status_code != 200:
            logger.warning(f"Twitch API error {resp.status_code} for {url}")
            return None
        return resp.json()
    except Exception as e:
        logger.warning(f"Twitch request error: {e}")
        return None


def _strip_subtitle(title: str) -> str:
    """Remove subtitle after ':' or '–' / '-' for fallback resolution."""
    for sep in (":", " – ", " - "):
        if sep in title:
            return title.split(sep)[0].strip()
    return title


async def _resolve_twitch_game_id(client: httpx.AsyncClient, steam_title: str) -> int | None:
    """Resolve Steam title → Twitch game_id with 3-pass fallback. Returns None if unresolved."""
    # Check cache (both resolved and known-unresolvable)
    if steam_title in _game_map:
        return _game_map[steam_title]

    candidates = [steam_title, _strip_subtitle(steam_title)]
    # Deduplicate (e.g. if no subtitle present)
    candidates = list(dict.fromkeys(candidates))

    for candidate in candidates:
        data = await _twitch_get(client, TWITCH_GAMES_URL, {"name": candidate})
        if data and data.get("data"):
            game_id = int(data["data"][0]["id"])
            _game_map[steam_title] = game_id
            logger.debug(f"Twitch resolved '{steam_title}' → {game_id} (queried: '{candidate}')")
            return game_id

    # Not found on Twitch
    _game_map[steam_title] = None
    return None


async def _fetch_stream_stats(client: httpx.AsyncClient, twitch_game_id: int) -> dict:
    """Fetch concurrent stream stats for a Twitch game_id."""
    data = await _twitch_get(client, TWITCH_STREAMS_URL, {"game_id": str(twitch_game_id), "first": 100})
    if not data or not data.get("data"):
        return {"concurrent_streams": 0, "peak_viewers": 0, "total_viewers": 0, "unique_streamers": 0}

    streams = data["data"]
    concurrent_streams = len(streams)
    peak_viewers = max((s.get("viewer_count", 0) for s in streams), default=0)
    total_viewers = sum(s.get("viewer_count", 0) for s in streams)
    unique_streamers = len({s.get("user_id") for s in streams if s.get("user_id")})

    return {
        "concurrent_streams": concurrent_streams,
        "peak_viewers": peak_viewers,
        "total_viewers": total_viewers,
        "unique_streamers": unique_streamers,
    }


async def run_twitch_snapshots() -> None:
    """Collect Twitch stream data for all games in the DB."""
    if not settings.twitch_client_id or not settings.twitch_client_secret:
        logger.info("Twitch credentials not set — skipping Twitch collection")
        return

    _load_game_map()

    db = SessionLocal()
    run = CollectionRun(job_name="twitch_snapshots", status="running")
    db.add(run)
    db.commit()
    db.refresh(run)

    processed = 0
    failed = 0
    today = date.today()

    try:
        async with httpx.AsyncClient() as client:
            # Pre-emptive token refresh if needed
            global _token, _token_expires_at
            if _token is None or time.time() > _token_expires_at - 86400:
                ok = await _refresh_token(client)
                if not ok:
                    run.status = "failed"
                    run.error_message = "Could not obtain Twitch token"
                    run.finished_at = datetime.now(timezone.utc)
                    db.commit()
                    return

            games = db.query(Game).all()
            logger.info(f"Twitch: resolving {len(games)} games")

            for game in games:
                try:
                    twitch_game_id = await _resolve_twitch_game_id(client, game.title)
                    if twitch_game_id is None:
                        continue

                    stats = await _fetch_stream_stats(client, twitch_game_id)

                    # Upsert twitch_snapshots
                    existing = (
                        db.query(TwitchSnapshot)
                        .filter_by(appid=game.appid, snapshot_date=today)
                        .first()
                    )
                    if existing:
                        for k, v in stats.items():
                            setattr(existing, k, v)
                    else:
                        db.add(TwitchSnapshot(appid=game.appid, snapshot_date=today, **stats))

                    # Denormalize onto latest game_snapshot
                    latest_snap = (
                        db.query(GameSnapshot)
                        .filter_by(appid=game.appid)
                        .order_by(GameSnapshot.snapshot_date.desc())
                        .first()
                    )
                    if latest_snap:
                        latest_snap.twitch_peak_viewers = stats["peak_viewers"]
                        latest_snap.twitch_concurrent_streams = stats["concurrent_streams"]

                    db.commit()
                    processed += 1

                except Exception as e:
                    logger.error(f"Twitch error for appid {game.appid} ({game.title}): {e}")
                    db.rollback()
                    failed += 1

        _save_game_map()

        run.status = "success" if failed == 0 else "partial"
        run.items_processed = processed
        run.items_failed = failed
        run.finished_at = datetime.now(timezone.utc)
        db.commit()
        logger.info(f"Twitch snapshots: {processed} collected, {failed} failed/skipped")

    except Exception as e:
        run.status = "failed"
        run.error_message = str(e)
        run.finished_at = datetime.now(timezone.utc)
        db.commit()
        logger.exception("Twitch snapshot collection failed")
        _save_game_map()
    finally:
        db.close()
