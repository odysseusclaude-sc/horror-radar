from __future__ import annotations

"""Stage 4: CCU Snapshots

Uses Steam's official GetNumberOfCurrentPlayers API (free, no auth).
Stores current_ccu in game_snapshots, tracks peak_ccu as max over time.

Cadence: every 6h for first 7 days, daily after, weekly after 90 days.
"""
import logging
from datetime import date, datetime, timedelta, timezone

import httpx

from collectors._http import fetch_with_retry, steam_limiter
from database import SessionLocal
from models import CollectionRun, Game, GameSnapshot

logger = logging.getLogger(__name__)

STEAM_CCU_URL = "https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/"


def _needs_ccu_update(game: Game, latest_snapshot: GameSnapshot | None) -> bool:
    """Check cadence for CCU snapshots."""
    if not latest_snapshot or latest_snapshot.current_ccu is None:
        return True

    today = date.today()
    days_since_launch = (today - game.release_date).days if game.release_date else 999

    if days_since_launch <= 7:
        # Every 6h — but since we run on a scheduler, just always update
        return True
    elif days_since_launch <= 90:
        return latest_snapshot.snapshot_date < today
    else:
        return (today - latest_snapshot.snapshot_date).days >= 7


async def run_ccu_snapshots():
    """Fetch current player count for all active games."""
    db = SessionLocal()
    run = CollectionRun(job_name="ccu", status="running")
    db.add(run)
    db.commit()
    db.refresh(run)

    processed = 0
    failed = 0
    today = date.today()

    try:
        games = db.query(Game).all()

        async with httpx.AsyncClient() as client:
            for game in games:
                try:
                    latest = (
                        db.query(GameSnapshot)
                        .filter_by(appid=game.appid)
                        .order_by(GameSnapshot.snapshot_date.desc())
                        .first()
                    )

                    if not _needs_ccu_update(game, latest):
                        continue

                    data = await fetch_with_retry(
                        client,
                        STEAM_CCU_URL,
                        params={"appid": str(game.appid)},
                        limiter=steam_limiter,
                    )

                    if not data or "response" not in data:
                        failed += 1
                        continue

                    current_ccu = data["response"].get("player_count", 0)

                    # Compute peak CCU across all snapshots
                    max_historical = (
                        db.query(GameSnapshot.peak_ccu)
                        .filter(GameSnapshot.appid == game.appid, GameSnapshot.peak_ccu.isnot(None))
                        .order_by(GameSnapshot.peak_ccu.desc())
                        .first()
                    )
                    historical_peak = max_historical[0] if max_historical else 0
                    peak_ccu = max(current_ccu, historical_peak)

                    # Upsert today's snapshot
                    existing = (
                        db.query(GameSnapshot)
                        .filter_by(appid=game.appid, snapshot_date=today)
                        .first()
                    )

                    if existing:
                        existing.current_ccu = current_ccu
                        existing.peak_ccu = peak_ccu
                    else:
                        db.add(GameSnapshot(
                            appid=game.appid,
                            snapshot_date=today,
                            current_ccu=current_ccu,
                            peak_ccu=peak_ccu,
                        ))

                    db.commit()
                    processed += 1

                except Exception as e:
                    logger.error(f"Error fetching CCU for AppID {game.appid}: {e}")
                    db.rollback()
                    failed += 1

        run.status = "success" if failed == 0 else "partial"
        run.items_processed = processed
        run.items_failed = failed
        run.finished_at = datetime.now(timezone.utc)
        db.commit()

        logger.info(f"CCU snapshots complete: {processed} updated, {failed} failed")

    except Exception as e:
        run.status = "failed"
        run.error_message = str(e)
        run.finished_at = datetime.now(timezone.utc)
        db.commit()
        logger.exception("CCU snapshots failed")
    finally:
        db.close()
