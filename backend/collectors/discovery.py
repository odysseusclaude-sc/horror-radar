from __future__ import annotations

"""Stage 1: Game Discovery

Primary: SteamSpy tag endpoints for Horror, Psychological Horror, Survival Horror.
Secondary: Steam store search sorted by release date (catches recent games before
  SteamSpy indexes them — SteamSpy can lag 30-90 days for low-owner games).
Tertiary: Curated seed list for games that fall through automated discovery.
Output: list of AppIDs not yet in the DB, queued for metadata fetch (batched at 200/run).
"""
import logging
import re
from datetime import datetime, timezone

import httpx

from collectors._http import fetch_with_retry, steamspy_limiter
from database import SessionLocal
from models import CollectionRun, Game, DiscardedGame

logger = logging.getLogger(__name__)

STEAMSPY_TAG_URL = "https://steamspy.com/api.php"
STEAM_SEARCH_URL = "https://store.steampowered.com/search/results/"

# Query multiple horror-related tag endpoints to catch games SteamSpy
# categorizes under sub-tags but not the parent "Horror" tag
HORROR_TAGS_TO_QUERY = ["Horror", "Psychological Horror", "Survival Horror"]

# Steam tag IDs for store search (different from SteamSpy tag names)
# 1667=Horror, 1490=Psychological Horror, 4026=Survival Horror
STEAM_HORROR_TAG_IDS = ["1667", "1490", "4026"]

# How many pages of Steam store search results to fetch per tag (100 per page).
# 13 pages × 100 = 1,300 results, covering ~90 days of horror releases.
# Already-known AppIDs are filtered each run so this stays fast after initial backfill.
STEAM_SEARCH_PAGES = 13

# Curated seed AppIDs for games that fall through automated discovery.
# Primary use case: old AppID + recent full release (long-running EA titles).
CURATED_SEEDS: list[int] = [
    696220,   # Folklore Hunter — EA since ~2018, full release Jan 30 2026
]

# Max games to queue for metadata fetch per run (SteamSpy rate limit: 15s/call)
BATCH_SIZE = 200


async def _discover_from_steamspy_tags(client: httpx.AsyncClient) -> set[int]:
    """Fetch AppIDs from multiple SteamSpy horror-related tag endpoints."""
    discovered: set[int] = set()

    for tag in HORROR_TAGS_TO_QUERY:
        data = await fetch_with_retry(
            client,
            STEAMSPY_TAG_URL,
            params={"request": "tag", "tag": tag},
            limiter=steamspy_limiter,
        )

        if not data or isinstance(data, list):
            logger.warning(f"SteamSpy tag '{tag}' returned unexpected format")
            continue

        tag_ids = {int(appid) for appid in data.keys()}
        logger.info(f"SteamSpy tag '{tag}': {len(tag_ids)} AppIDs")
        discovered |= tag_ids

    logger.info(f"SteamSpy total unique AppIDs across all horror tags: {len(discovered)}")
    return discovered


async def _discover_from_steam_search(client: httpx.AsyncClient) -> set[int]:
    """Fetch recent AppIDs from Steam store search sorted by release date.

    SteamSpy lags 30-90 days for new low-owner games. This catches the gap
    by querying Steam's own search sorted by newest releases first.
    """
    discovered: set[int] = set()

    for tag_id in STEAM_HORROR_TAG_IDS:
        for page in range(STEAM_SEARCH_PAGES):
            try:
                r = await client.get(
                    STEAM_SEARCH_URL,
                    params={
                        "sort_by": "Released_DESC",
                        "tags": tag_id,
                        "json": "1",
                        "start": str(page * 100),
                        "count": "100",
                        "cc": "us",
                        "l": "en",
                    },
                    headers={"User-Agent": "Mozilla/5.0"},
                    timeout=30,
                )
                data = r.json()
                if not data or not isinstance(data, dict):
                    logger.warning(f"Steam search page {page} tag {tag_id}: unexpected response format")
                    break
                items = data.get("items") or []
                for item in items:
                    if not item:
                        continue
                    m = re.search(r"/apps/(\d+)/", item.get("logo", ""))
                    if m:
                        discovered.add(int(m.group(1)))
            except Exception as e:
                logger.warning(f"Steam search page {page} tag {tag_id} failed: {e}")

        logger.info(f"Steam search tag {tag_id}: {len(discovered)} total AppIDs so far")

    logger.info(f"Steam store search total unique AppIDs: {len(discovered)}")
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
    """Run game discovery and return batched list of new AppIDs for metadata fetch.

    Batch ordering:
    1. Steam search AppIDs first (ordered by actual release date, newest first) —
       catches recent full releases including long-running EA titles with low AppIDs.
    2. SteamSpy-only AppIDs after (sorted by AppID desc as a release-date proxy).
    This ensures a game like Folklore Hunter (AppID 696220, released Jan 2026 after
    years of EA) is processed within days rather than after 13,000+ higher AppIDs.
    """
    db = SessionLocal()
    run = CollectionRun(job_name="discovery", status="running")
    db.add(run)
    db.commit()
    db.refresh(run)

    try:
        async with httpx.AsyncClient() as client:
            spy_ids = await _discover_from_steamspy_tags(client)
            steam_ids = await _discover_from_steam_search(client)

        logger.info(f"Steam search found {len(steam_ids - spy_ids)} AppIDs not in SteamSpy (recency gap)")

        # Merge all sources with curated seeds
        all_discovered = spy_ids | steam_ids | set(CURATED_SEEDS)

        # Filter out already-known AppIDs
        known = _get_known_appids()
        new_steam_ids = [a for a in steam_ids if a not in known]  # already release-date ordered
        new_spy_only = sorted(
            (spy_ids | set(CURATED_SEEDS)) - steam_ids - known, reverse=True
        )  # AppID desc as release-date proxy for older catalog

        # Prioritise Steam search results (recent releases) over SteamSpy backlog
        new_appids = new_steam_ids + new_spy_only

        # Batch: only return up to BATCH_SIZE per run
        batch = new_appids[:BATCH_SIZE]

        remaining = len(new_appids) - len(batch)
        if remaining > 0:
            logger.info(f"Batching: {len(batch)} this run, {remaining} remaining for future runs")

        run.status = "success"
        run.items_processed = len(batch)
        run.finished_at = datetime.now(timezone.utc)
        db.commit()

        logger.info(f"Discovery complete: {len(batch)} AppIDs queued (of {len(new_appids)} new)")
        return batch

    except Exception as e:
        run.status = "failed"
        run.error_message = str(e)
        run.finished_at = datetime.now(timezone.utc)
        db.commit()
        logger.exception("Discovery failed")
        return []
    finally:
        db.close()
