from __future__ import annotations

"""Stage 1: Game Discovery

Primary: SteamSpy tag endpoints for Horror, Psychological Horror, Survival Horror.
Secondary: Curated seed list for games that fall through automated discovery.
Output: list of AppIDs not yet in the DB, queued for metadata fetch (batched at 200/run).
"""
import logging
from datetime import datetime, timezone

import httpx

from collectors._http import fetch_with_retry, steamspy_limiter
from database import SessionLocal
from models import CollectionRun, Game, DiscardedGame

logger = logging.getLogger(__name__)

STEAMSPY_TAG_URL = "https://steamspy.com/api.php"

# Query multiple horror-related tag endpoints to catch games SteamSpy
# categorizes under sub-tags but not the parent "Horror" tag
HORROR_TAGS_TO_QUERY = ["Horror", "Psychological Horror", "Survival Horror"]

# Curated seed AppIDs for games that fall through automated discovery
# (too small for SteamSpy data, or tagged differently)
CURATED_SEEDS: list[int] = [
    # Add AppIDs here for games that aren't picked up by tag endpoints
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

    Returns up to BATCH_SIZE AppIDs per run, sorted by highest AppID first
    (newest games). The full catalog is seeded incrementally over multiple runs.
    """
    db = SessionLocal()
    run = CollectionRun(job_name="discovery", status="running")
    db.add(run)
    db.commit()
    db.refresh(run)

    try:
        async with httpx.AsyncClient() as client:
            spy_ids = await _discover_from_steamspy_tags(client)

        # Merge with curated seeds
        all_discovered = spy_ids | set(CURATED_SEEDS)

        # Filter out already-known AppIDs
        known = _get_known_appids()
        new_appids = sorted(all_discovered - known, reverse=True)  # newest first

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
