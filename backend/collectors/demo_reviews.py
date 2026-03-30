from __future__ import annotations

"""Demo Review Tracker

For games that have a demo (has_demo=True, demo_appid IS NOT NULL):
1. Fetch demo's review summary from Steam (same API as main game reviews)
2. Write demo_review_count + demo_review_score_pct onto the parent game's snapshot

Demo reviews are a proxy for demo engagement — a demo with 500+ reviews
signals high player interest before (or after) launch.

Cadence: runs as part of steam_extras (daily), only for games with demos.
"""

import logging
from datetime import date, datetime, timezone

import httpx
from sqlalchemy import func

from collectors._http import fetch_with_retry, steam_limiter
from database import SessionLocal
from models import CollectionRun, Game, GameSnapshot

logger = logging.getLogger(__name__)

REVIEWS_URL = "https://store.steampowered.com/appreviews/{appid}"


async def run_demo_review_snapshots() -> None:
    """Fetch review stats for demos and write to parent game's snapshot."""
    db = SessionLocal()
    run = CollectionRun(job_name="demo_reviews", status="running")
    db.add(run)
    db.commit()
    db.refresh(run)

    processed = 0
    failed = 0
    skipped = 0
    today = date.today()

    try:
        # Only games that have a demo with a known AppID
        games = (
            db.query(Game)
            .filter(Game.has_demo.is_(True))
            .filter(Game.demo_appid.isnot(None))
            .all()
        )
        logger.info(f"Demo reviews: {len(games)} games with demos to check")

        if not games:
            run.status = "success"
            run.items_processed = 0
            run.finished_at = datetime.now(timezone.utc)
            db.commit()
            return

        async with httpx.AsyncClient() as client:
            for game in games:
                try:
                    data = await fetch_with_retry(
                        client,
                        REVIEWS_URL.format(appid=game.demo_appid),
                        params={
                            "json": "1",
                            "language": "all",
                            "purchase_type": "all",
                            "num_per_page": "0",
                        },
                        limiter=steam_limiter,
                    )

                    if not data or "query_summary" not in data:
                        # Some demos have no reviews yet — not an error
                        skipped += 1
                        continue

                    summary = data["query_summary"]
                    total_pos = summary.get("total_positive", 0)
                    total_neg = summary.get("total_negative", 0)
                    total_reviews = total_pos + total_neg

                    if total_reviews == 0:
                        skipped += 1
                        continue

                    demo_score_pct = total_pos / total_reviews * 100

                    # Write to parent game's snapshot for today
                    existing = (
                        db.query(GameSnapshot)
                        .filter_by(appid=game.appid, snapshot_date=today)
                        .first()
                    )

                    if existing:
                        existing.demo_review_count = total_reviews
                        existing.demo_review_score_pct = demo_score_pct
                    else:
                        db.add(GameSnapshot(
                            appid=game.appid,
                            snapshot_date=today,
                            demo_review_count=total_reviews,
                            demo_review_score_pct=demo_score_pct,
                        ))

                    db.commit()
                    processed += 1

                except Exception as e:
                    logger.error(
                        f"Error fetching demo reviews for AppID {game.appid} "
                        f"(demo {game.demo_appid}): {e}"
                    )
                    db.rollback()
                    failed += 1

        run.status = "success" if failed == 0 else "partial"
        run.items_processed = processed
        run.items_failed = failed
        run.finished_at = datetime.now(timezone.utc)
        db.commit()

        logger.info(
            f"Demo reviews complete: {processed} tracked, "
            f"{skipped} skipped (no reviews), {failed} failed"
        )

    except Exception as e:
        run.status = "failed"
        run.error_message = str(e)
        run.finished_at = datetime.now(timezone.utc)
        db.commit()
        logger.exception("Demo review snapshots failed")
    finally:
        db.close()
