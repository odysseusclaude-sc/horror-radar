from __future__ import annotations

"""Steam Update Frequency Collector

For each game in the DB:
1. GET /ISteamNews/GetNewsForApp/v2/?appid={appid}&count=20&maxlength=0
2. Filter news items to feedname == "steam_updates" (actual patches)
3. Compute patch_count_30d and days_since_last_update
4. Write to the latest game_snapshot
"""

import logging
from datetime import date, datetime, timedelta, timezone

import httpx

from collectors._http import fetch_with_retry, steam_api_limiter
from database import SessionLocal
from models import CollectionRun, Game, GameSnapshot

logger = logging.getLogger(__name__)

STEAM_NEWS_URL = "https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/"


def _parse_update_stats(items: list[dict]) -> tuple[int, int | None]:
    """Returns (patch_count_30d, days_since_last_update)."""
    patch_items = [i for i in items if i.get("feedname") == "steam_updates"]
    if not patch_items:
        return 0, None

    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=30)

    patch_count_30d = 0
    most_recent_ts: int | None = None

    for item in patch_items:
        ts = item.get("date")
        if ts is None:
            continue
        try:
            ts = int(ts)
        except (ValueError, TypeError):
            continue

        if most_recent_ts is None or ts > most_recent_ts:
            most_recent_ts = ts

        item_dt = datetime.fromtimestamp(ts, tz=timezone.utc)
        if item_dt >= cutoff:
            patch_count_30d += 1

    days_since: int | None = None
    if most_recent_ts is not None:
        delta = now - datetime.fromtimestamp(most_recent_ts, tz=timezone.utc)
        days_since = max(0, delta.days)

    return patch_count_30d, days_since


async def run_update_tracking() -> None:
    """Fetch Steam news/patch data for all games and update latest snapshots."""
    db = SessionLocal()
    run = CollectionRun(job_name="update_tracking", status="running")
    db.add(run)
    db.commit()
    db.refresh(run)

    processed = 0
    failed = 0

    try:
        games = db.query(Game).all()
        logger.info(f"Update tracking: processing {len(games)} games")

        async with httpx.AsyncClient() as client:
            for game in games:
                try:
                    data = await fetch_with_retry(
                        client,
                        STEAM_NEWS_URL,
                        params={"appid": str(game.appid), "count": 20, "maxlength": 0},
                        limiter=steam_api_limiter,
                    )

                    items: list[dict] = []
                    if data:
                        items = data.get("appnews", {}).get("newsitems", [])

                    patch_count_30d, days_since = _parse_update_stats(items)

                    # Update latest snapshot
                    latest_snap = (
                        db.query(GameSnapshot)
                        .filter_by(appid=game.appid)
                        .order_by(GameSnapshot.snapshot_date.desc())
                        .first()
                    )
                    if latest_snap:
                        latest_snap.patch_count_30d = patch_count_30d
                        latest_snap.days_since_last_update = days_since
                        db.commit()
                        processed += 1

                except Exception as e:
                    logger.error(f"Update tracking error for appid {game.appid}: {e}")
                    db.rollback()
                    failed += 1

        run.status = "success" if failed == 0 else "partial"
        run.items_processed = processed
        run.items_failed = failed
        run.finished_at = datetime.now(timezone.utc)
        db.commit()
        logger.info(f"Update tracking: {processed} updated, {failed} failed")

    except Exception as e:
        run.status = "failed"
        run.error_message = str(e)
        run.finished_at = datetime.now(timezone.utc)
        db.commit()
        logger.exception("Update tracking collection failed")
    finally:
        db.close()
