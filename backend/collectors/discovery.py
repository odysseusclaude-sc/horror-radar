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
from config import STRONG_HORROR_TAGS, ANTI_HORROR_TAGS, NON_HORROR_GENRE_TAGS
from database import SessionLocal
from models import CollectionRun, Game, DiscardedGame, PendingMetadata

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


def _prefilter_horror_tags(tags: dict) -> str:
    """Run Layer 0+1 of horror classification on SteamSpy tags alone (no description/genre).

    Used during discovery to categorise games before calling appdetails:
    - "pass"     → strong horror tags, no hard override — skip Layer 1 in metadata
    - "ambiguous"→ needs description/genre confirmation — full metadata classification
    - "fail"     → anti-horror tags overwhelmingly dominate — discard immediately

    Mirror of the Layer 0+1 logic in metadata._is_horror but returns a tier rather
    than a boolean, and treats description-dependent failures as "ambiguous".
    """
    if not tags:
        return "ambiguous"

    tag_set = set(tags.keys()) if isinstance(tags, dict) else set(tags)
    anti_matches = ANTI_HORROR_TAGS & tag_set

    # Layer 0: when vote counts are present, ignore unvoted tags
    has_vote_counts = isinstance(tags, dict) and any(v > 0 for v in tags.values())
    if has_vote_counts:
        voted_tags = {k for k, v in tags.items() if v > 0}
        tag_set = voted_tags
        anti_matches = ANTI_HORROR_TAGS & tag_set

    strong_matches = STRONG_HORROR_TAGS & tag_set
    non_horror_matches = NON_HORROR_GENRE_TAGS & tag_set

    # Layer 1: strong horror tags present
    if strong_matches:
        # Hard fail: anti-horror overwhelmingly outnumbers strong horror (3+)
        # This rejection holds even if description mentions horror.
        if len(anti_matches) >= len(strong_matches) + 3:
            return "fail"

        # Non-horror genre identity without vote data — need description to confirm
        if not has_vote_counts and len(non_horror_matches) >= len(strong_matches) + 1:
            return "ambiguous"

        # Voted non-horror genre tags present (City Builder, Dating Sim, etc.)
        # Many of these are false positives even with strong tags — need description
        if has_vote_counts and non_horror_matches:
            return "ambiguous"

        # Combined anti+non-horror vote weight exceeds horror votes — need description
        if has_vote_counts:
            all_non_horror = non_horror_matches | anti_matches
            if all_non_horror:
                horror_votes = sum(tags.get(t, 0) for t in strong_matches)
                non_horror_votes = sum(tags.get(t, 0) for t in all_non_horror)
                if non_horror_votes > horror_votes:
                    return "ambiguous"

        # Horror tag is a weak signal (bottom third by votes) — need description
        if has_vote_counts:
            sorted_tags = sorted(
                [(k, v) for k, v in tags.items() if v > 0],
                key=lambda x: x[1], reverse=True,
            )
            voted_count = len(sorted_tags)
            if voted_count >= 6:
                bottom_third_start = voted_count * 2 // 3
                bottom_tag_names = {t[0] for t in sorted_tags[bottom_third_start:]}
                if strong_matches <= bottom_tag_names:
                    return "ambiguous"

        return "pass"

    # No strong horror tags — ambiguous (might pass via Layer 2 ambiguous tags + description)
    return "ambiguous"


async def _discover_from_steamspy_tags(
    client: httpx.AsyncClient,
) -> tuple[set[int], dict[int, dict]]:
    """Fetch AppIDs from multiple SteamSpy horror-related tag endpoints.

    Returns:
        (discovered_appids, appid_to_tags) — tag data per AppID for pre-filtering.
        Tags are the SteamSpy user-voted tags dict already included in the tag endpoint
        response (e.g. {"Horror": 142, "Survival Horror": 89}).
    """
    discovered: set[int] = set()
    appid_tags: dict[int, dict] = {}

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

        for appid_str, game_info in data.items():
            appid = int(appid_str)
            discovered.add(appid)
            # Capture tag data for pre-filtering (later tag query overwrites earlier — fine)
            if isinstance(game_info, dict):
                raw_tags = game_info.get("tags", {})
                if isinstance(raw_tags, dict):
                    appid_tags[appid] = raw_tags
                elif isinstance(raw_tags, list):
                    appid_tags[appid] = {t: 0 for t in raw_tags}

        logger.info(f"SteamSpy tag '{tag}': {len(data)} AppIDs")

    logger.info(f"SteamSpy total unique AppIDs across all horror tags: {len(discovered)}")
    return discovered, appid_tags


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
    """Get all AppIDs already in games, discarded_games, or pending_metadata tables."""
    db = SessionLocal()
    try:
        game_ids = {row[0] for row in db.query(Game.appid).all()}
        discarded_ids = {row[0] for row in db.query(DiscardedGame.appid).all()}
        pending_ids = {row[0] for row in db.query(PendingMetadata.appid).all()}
        return game_ids | discarded_ids | pending_ids
    finally:
        db.close()


async def run_discovery() -> int:
    """Run game discovery and queue new AppIDs into pending_metadata.

    Batch ordering:
    1. Steam search AppIDs first (priority=1, ordered by actual release date, newest first) —
       catches recent full releases including long-running EA titles with low AppIDs.
    2. SteamSpy-only AppIDs after (priority=2, sorted by AppID desc as a release-date proxy).
    This ensures a game like Folklore Hunter (AppID 696220, released Jan 2026 after
    years of EA) is processed within days rather than after 13,000+ higher AppIDs.

    Returns the count of newly queued items.
    """
    db = SessionLocal()
    run = CollectionRun(job_name="discovery", status="running")
    db.add(run)
    db.commit()
    db.refresh(run)

    try:
        async with httpx.AsyncClient() as client:
            spy_ids, spy_tags = await _discover_from_steamspy_tags(client)
            steam_ids = await _discover_from_steam_search(client)

        logger.info(f"Steam search found {len(steam_ids - spy_ids)} AppIDs not in SteamSpy (recency gap)")

        # Filter out already-known AppIDs (games, discarded, pending)
        known = _get_known_appids()
        new_steam_ids = [a for a in steam_ids if a not in known]  # already release-date ordered
        new_spy_only_raw = sorted(
            (spy_ids | set(CURATED_SEEDS)) - steam_ids - known, reverse=True
        )  # AppID desc as release-date proxy for older catalog

        # Pre-filter SteamSpy-only games using tag data available from the tag endpoint.
        # This avoids calling appdetails for games that are clearly non-horror.
        prefiltered: list[int] = []   # passed Layer 0+1 on tags alone
        ambiguous: list[int] = []     # need description/genre check
        prefilter_rejected = 0

        from sqlalchemy import text as _text
        for appid in new_spy_only_raw:
            tags = spy_tags.get(appid, {})
            tier = _prefilter_horror_tags(tags)
            if tier == "fail":
                # Discard immediately — strong anti-horror, no appdetails call needed
                existing = db.query(DiscardedGame).filter_by(appid=appid).first()
                if not existing:
                    db.add(DiscardedGame(
                        appid=appid,
                        title=f"AppID:{appid}",
                        reason="prefilter_rejected",
                    ))
                prefilter_rejected += 1
            elif tier == "pass":
                prefiltered.append(appid)
            else:
                ambiguous.append(appid)

        if prefilter_rejected:
            db.commit()
            logger.info(
                f"Pre-filter: {len(prefiltered)} pass, {len(ambiguous)} ambiguous, "
                f"{prefilter_rejected} hard-rejected without appdetails"
            )

        # Batch: only queue up to BATCH_SIZE per run
        # Priority order: Steam search (newest) → prefiltered → ambiguous
        batch_steam = new_steam_ids[:BATCH_SIZE]
        remaining_capacity = BATCH_SIZE - len(batch_steam)
        batch_prefiltered = prefiltered[:remaining_capacity]
        remaining_capacity -= len(batch_prefiltered)
        batch_ambiguous = ambiguous[:remaining_capacity]

        total_new = len(new_steam_ids) + len(prefiltered) + len(ambiguous)
        total_queued = len(batch_steam) + len(batch_prefiltered) + len(batch_ambiguous)
        remaining = total_new - total_queued
        if remaining > 0:
            logger.info(f"Batching: {total_queued} this run, {remaining} deferred (already in pending_metadata next run)")

        # INSERT into pending_metadata with INSERT OR IGNORE
        queued = 0
        for appid in batch_steam:
            db.execute(_text(
                "INSERT OR IGNORE INTO pending_metadata (appid, source, priority) VALUES (:appid, :source, :priority)"
            ), {"appid": appid, "source": "discovery", "priority": 1})
            queued += 1
        for appid in batch_prefiltered:
            db.execute(_text(
                "INSERT OR IGNORE INTO pending_metadata (appid, source, priority) VALUES (:appid, :source, :priority)"
            ), {"appid": appid, "source": "steamspy_prefiltered", "priority": 1})
            queued += 1
        for appid in batch_ambiguous:
            db.execute(_text(
                "INSERT OR IGNORE INTO pending_metadata (appid, source, priority) VALUES (:appid, :source, :priority)"
            ), {"appid": appid, "source": "steamspy_ambiguous", "priority": 2})
            queued += 1

        run.status = "success"
        run.items_processed = queued
        run.finished_at = datetime.now(timezone.utc)
        db.commit()

        logger.info(f"Discovery complete: {queued} AppIDs queued into pending_metadata (of {total_new} new)")
        return queued

    except Exception as e:
        run.status = "failed"
        run.error_message = str(e)
        run.finished_at = datetime.now(timezone.utc)
        db.commit()
        logger.exception("Discovery failed")
        return 0
    finally:
        db.close()
