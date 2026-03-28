from __future__ import annotations

"""Achievement Completion Rate Collector

For each game in the DB:
1. GET /ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2/?gameid={appid}
2. Compute completion_rate (lowest achievement % — "beat the game" proxy)
   and median_achievement_pct
3. Write to the latest game_snapshot (completion_rate, median_achievement_pct)

Null handling:
- Games with no achievements → NULL (not 0) — OPS redistributes weight
- Games that returned NULL twice in a row are skipped to save Steam quota
"""

import logging
import statistics
from datetime import datetime, timezone

import httpx

from collectors._http import fetch_with_retry, steam_limiter
from database import SessionLocal
from models import CollectionRun, Game, GameSnapshot

logger = logging.getLogger(__name__)

STEAM_ACHIEVEMENTS_URL = (
    "https://api.steampowered.com/ISteamUserStats/"
    "GetGlobalAchievementPercentagesForApp/v2/"
)


def _compute_achievement_stats(achievements: list[dict]) -> tuple[float | None, float | None]:
    """Returns (completion_rate, median_achievement_pct) or (None, None) if no data."""
    if not achievements:
        return None, None

    percentages = [a.get("percent", 0.0) for a in achievements if a.get("percent") is not None]
    if not percentages:
        return None, None

    completion_rate = min(percentages)
    median_pct = statistics.median(percentages)
    return completion_rate, median_pct


async def run_achievement_stats() -> None:
    """Fetch achievement completion rates for all games and update latest snapshots."""
    db = SessionLocal()
    run = CollectionRun(job_name="achievement_stats", status="running")
    db.add(run)
    db.commit()
    db.refresh(run)

    processed = 0
    failed = 0
    skipped = 0

    try:
        games = db.query(Game).all()
        logger.info(f"Achievements: processing {len(games)} games")

        async with httpx.AsyncClient() as client:
            for game in games:
                try:
                    # Check if last two snapshots both had NULL completion_rate
                    # (skip to avoid wasting quota on games with no achievements)
                    recent_snaps = (
                        db.query(GameSnapshot)
                        .filter_by(appid=game.appid)
                        .order_by(GameSnapshot.snapshot_date.desc())
                        .limit(2)
                        .all()
                    )
                    null_count = sum(
                        1 for s in recent_snaps
                        if s.completion_rate is None and s.snapshot_date is not None
                    )
                    if len(recent_snaps) >= 2 and null_count == 2:
                        skipped += 1
                        continue

                    data = await fetch_with_retry(
                        client,
                        STEAM_ACHIEVEMENTS_URL,
                        params={"gameid": str(game.appid)},
                        limiter=steam_limiter,
                    )

                    achievements = []
                    if data:
                        ach_data = data.get("achievementpercentages", {})
                        achievements = ach_data.get("achievements", [])

                    completion_rate, median_pct = _compute_achievement_stats(achievements)

                    # Update latest snapshot
                    latest_snap = (
                        db.query(GameSnapshot)
                        .filter_by(appid=game.appid)
                        .order_by(GameSnapshot.snapshot_date.desc())
                        .first()
                    )
                    if latest_snap:
                        latest_snap.completion_rate = completion_rate
                        latest_snap.median_achievement_pct = median_pct
                        db.commit()
                        processed += 1

                except Exception as e:
                    logger.error(f"Achievement error for appid {game.appid}: {e}")
                    db.rollback()
                    failed += 1

        run.status = "success" if failed == 0 else "partial"
        run.items_processed = processed
        run.items_failed = failed
        run.finished_at = datetime.now(timezone.utc)
        db.commit()
        logger.info(
            f"Achievement stats: {processed} updated, {failed} failed, {skipped} skipped (no-ach)"
        )

    except Exception as e:
        run.status = "failed"
        run.error_message = str(e)
        run.finished_at = datetime.now(timezone.utc)
        db.commit()
        logger.exception("Achievement stats collection failed")
    finally:
        db.close()
