"""Stage 5: Owner Estimates (SteamSpy)

Fetches estimated owner ranges and playtime from SteamSpy.
Stores both low/high bounds — never use midpoint as accurate.
Flags low_confidence_owners when range is "0 .. 20,000".
"""
import logging
from datetime import date, datetime, timezone

import httpx

from collectors._http import fetch_with_retry, steamspy_limiter
from database import SessionLocal
from models import CollectionRun, Game, GameSnapshot

logger = logging.getLogger(__name__)

STEAMSPY_URL = "https://steamspy.com/api.php"


def _parse_owners_range(owners_str: str) -> tuple[int, int]:
    """Parse '20,000 .. 50,000' into (20000, 50000)."""
    parts = owners_str.split("..")
    if len(parts) != 2:
        return 0, 0
    low = int(parts[0].replace(",", "").strip())
    high = int(parts[1].replace(",", "").strip())
    return low, high


async def run_owner_estimates():
    """Fetch SteamSpy owner estimates for all tracked games."""
    db = SessionLocal()
    run = CollectionRun(job_name="owners", status="running")
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
                    data = await fetch_with_retry(
                        client,
                        STEAMSPY_URL,
                        params={"request": "appdetails", "appid": str(game.appid)},
                        limiter=steamspy_limiter,
                    )

                    if not data:
                        failed += 1
                        continue

                    owners_str = data.get("owners", "0 .. 0")
                    owners_low, owners_high = _parse_owners_range(owners_str)
                    low_confidence = owners_low == 0 and owners_high == 20000
                    avg_playtime = data.get("average_forever", 0)

                    # Upsert today's snapshot
                    existing = (
                        db.query(GameSnapshot)
                        .filter_by(appid=game.appid, snapshot_date=today)
                        .first()
                    )

                    if existing:
                        existing.estimated_owners_low = owners_low
                        existing.estimated_owners_high = owners_high
                        existing.low_confidence_owners = low_confidence
                        existing.average_playtime_forever = avg_playtime
                    else:
                        db.add(GameSnapshot(
                            appid=game.appid,
                            snapshot_date=today,
                            estimated_owners_low=owners_low,
                            estimated_owners_high=owners_high,
                            low_confidence_owners=low_confidence,
                            average_playtime_forever=avg_playtime,
                        ))

                    db.commit()
                    processed += 1

                except Exception as e:
                    logger.error(f"Error fetching owners for AppID {game.appid}: {e}")
                    db.rollback()
                    failed += 1

        run.status = "success" if failed == 0 else "partial"
        run.items_processed = processed
        run.items_failed = failed
        run.finished_at = datetime.now(timezone.utc)
        db.commit()

        logger.info(f"Owner estimates complete: {processed} updated, {failed} failed")

    except Exception as e:
        run.status = "failed"
        run.error_message = str(e)
        run.finished_at = datetime.now(timezone.utc)
        db.commit()
        logger.exception("Owner estimates failed")
    finally:
        db.close()
