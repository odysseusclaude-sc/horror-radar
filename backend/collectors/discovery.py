"""Stage 1: Game Discovery

Primary: Steam Store search with Horror tag (4659), sorted by release date.
Secondary: SteamSpy tag endpoint as cross-check.
Output: list of AppIDs not yet in the DB, queued for metadata fetch.
"""
import asyncio
import json
import logging
from datetime import datetime, timedelta, timezone

import httpx

from collectors._http import fetch_with_retry, steam_limiter, steamspy_limiter
from database import SessionLocal
from models import CollectionRun, Game, DiscardedGame

logger = logging.getLogger(__name__)

STEAM_SEARCH_URL = "https://store.steampowered.com/search/results/"
STEAMSPY_TAG_URL = "https://steamspy.com/api.php"
HORROR_TAG_ID = "4659"
DISCOVERY_WINDOW_DAYS = 90


async def _discover_from_steam_search(client: httpx.AsyncClient) -> set[int]:
    """Paginate Steam search for Horror-tagged games sorted by release date."""
    discovered: set[int] = set()
    cutoff = datetime.now(timezone.utc) - timedelta(days=DISCOVERY_WINDOW_DAYS)
    start = 0
    page_size = 50

    while True:
        data = await fetch_with_retry(
            client,
            STEAM_SEARCH_URL,
            params={
                "tags": HORROR_TAG_ID,
                "sort_by": "Released_DESC",
                "os": "win",
                "json": "1",
                "start": str(start),
                "count": str(page_size),
            },
            limiter=steam_limiter,
        )

        if not data or "items" not in data:
            break

        items = data["items"]
        if not items:
            break

        all_old = True
        for item in items:
            appid = item.get("id")
            if not appid:
                continue
            discovered.add(int(appid))
            # Check if we've gone past the cutoff
            # Release dates in search results are unreliable, so we keep going
            # and rely on metadata fetch (Stage 2) for accurate date filtering
            all_old = False

        start += page_size

        total = data.get("total_count", 0)
        if start >= total or start >= 500:
            # Cap at 500 results to avoid excessive pagination
            break

    logger.info(f"Steam search discovered {len(discovered)} AppIDs")
    return discovered


async def _discover_from_steamspy(client: httpx.AsyncClient) -> set[int]:
    """Cross-check via SteamSpy Horror tag endpoint."""
    data = await fetch_with_retry(
        client,
        STEAMSPY_TAG_URL,
        params={"request": "tag", "tag": "Horror"},
        limiter=steamspy_limiter,
    )

    if not data or isinstance(data, list):
        logger.warning("SteamSpy tag endpoint returned unexpected format")
        return set()

    discovered = {int(appid) for appid in data.keys()}
    logger.info(f"SteamSpy discovered {len(discovered)} Horror-tagged AppIDs")
    return discovered


def _get_known_appids() -> set[int]:
    """Get all AppIDs already in games or discarded_games tables."""
    db = SessionLocal()
    try:
        game_ids = {row[0] for row in db.query(Game.appid).all()}
        discarded_ids = {row[0] for row in db.query(DiscardedGame.appid).all()}
        return game_ids | discarded_ids
    finally:
        db.close()


async def run_discovery() -> list[int]:
    """Run game discovery and return list of new AppIDs for metadata fetch."""
    db = SessionLocal()
    run = CollectionRun(job_name="discovery", status="running")
    db.add(run)
    db.commit()
    db.refresh(run)

    try:
        async with httpx.AsyncClient() as client:
            # Run both discovery methods
            steam_ids, spy_ids = await asyncio.gather(
                _discover_from_steam_search(client),
                _discover_from_steamspy(client),
            )

        # Merge and deduplicate
        all_discovered = steam_ids | spy_ids
        known = _get_known_appids()
        new_appids = sorted(all_discovered - known)

        # Log cross-check stats
        only_steam = steam_ids - spy_ids
        only_spy = spy_ids - steam_ids
        if only_spy - known:
            logger.info(f"SteamSpy found {len(only_spy - known)} AppIDs missed by Steam search")

        run.status = "success"
        run.items_processed = len(new_appids)
        run.finished_at = datetime.now(timezone.utc)
        db.commit()

        logger.info(f"Discovery complete: {len(new_appids)} new AppIDs to fetch metadata for")
        return new_appids

    except Exception as e:
        run.status = "failed"
        run.error_message = str(e)
        run.finished_at = datetime.now(timezone.utc)
        db.commit()
        logger.exception("Discovery failed")
        return []
    finally:
        db.close()
