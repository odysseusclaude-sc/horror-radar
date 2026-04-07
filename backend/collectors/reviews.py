from __future__ import annotations

"""Stage 3: Review Snapshots

Fetches review summary stats using num_per_page=0 trick (no review bodies).
Writes to game_snapshots table.

Cadence: daily for games <90 days old, weekly after.
Always daily for games with <10 reviews (Early Radar).
"""
import logging
from datetime import date, datetime, timedelta, timezone

import httpx
from sqlalchemy import func

from collectors._http import fetch_with_retry, steam_limiter
from database import SessionLocal
from models import CollectionRun, Game, GameSnapshot
from validators import validate_review_count, validate_review_score

logger = logging.getLogger(__name__)

REVIEWS_URL = "https://store.steampowered.com/appreviews/{appid}"


def _should_snapshot(game: Game, latest_snapshot: GameSnapshot | None) -> bool:
    """Determine if this game needs a review snapshot today."""
    today = date.today()

    if not latest_snapshot:
        return True

    days_since_launch = (today - game.release_date).days if game.release_date else 999

    # Early Radar: always daily if <10 reviews
    if latest_snapshot.review_count is not None and latest_snapshot.review_count < 10:
        return latest_snapshot.snapshot_date < today

    # <90 days: daily
    if days_since_launch < 90:
        return latest_snapshot.snapshot_date < today

    # >90 days: weekly
    return (today - latest_snapshot.snapshot_date).days >= 7


async def run_review_snapshots():
    """Fetch review stats for all active games and write snapshots."""
    db = SessionLocal()
    run = CollectionRun(job_name="reviews", status="running")
    db.add(run)
    db.commit()
    db.refresh(run)

    processed = 0
    failed = 0
    today = date.today()

    try:
        games = db.query(Game).all()

        # Batch-load latest snapshot per game (1 query instead of N)
        latest_date_sub = (
            db.query(
                GameSnapshot.appid,
                func.max(GameSnapshot.snapshot_date).label("max_date"),
            )
            .group_by(GameSnapshot.appid)
            .subquery()
        )
        latest_snaps = (
            db.query(GameSnapshot)
            .join(
                latest_date_sub,
                (GameSnapshot.appid == latest_date_sub.c.appid)
                & (GameSnapshot.snapshot_date == latest_date_sub.c.max_date),
            )
            .all()
        )
        snap_by_appid: dict[int, GameSnapshot] = {s.appid: s for s in latest_snaps}

        async with httpx.AsyncClient() as client:
            for game in games:
                try:
                    # Check cadence
                    latest = snap_by_appid.get(game.appid)

                    if not _should_snapshot(game, latest):
                        continue

                    data = await fetch_with_retry(
                        client,
                        REVIEWS_URL.format(appid=game.appid),
                        params={
                            "json": "1",
                            "language": "all",
                            "purchase_type": "all",
                            "num_per_page": "0",
                        },
                        limiter=steam_limiter,
                    )

                    if not data or "query_summary" not in data:
                        failed += 1
                        continue

                    summary = data["query_summary"]
                    total_pos = summary.get("total_positive", 0)
                    total_neg = summary.get("total_negative", 0)
                    total_reviews = total_pos + total_neg

                    review_score_pct = (
                        (total_pos / total_reviews * 100) if total_reviews > 0 else 0.0
                    )

                    # Validate: reviews never decrease, score in 0-100
                    total_reviews = validate_review_count(
                        db, game.appid, total_reviews,
                        latest.review_count if latest else None,
                    )
                    review_score_pct = validate_review_score(db, game.appid, review_score_pct)

                    # Upsert snapshot for today
                    existing = (
                        db.query(GameSnapshot)
                        .filter_by(appid=game.appid, snapshot_date=today)
                        .first()
                    )

                    if existing:
                        existing.review_count = total_reviews
                        existing.review_score_pct = review_score_pct
                        existing.total_positive = total_pos
                        existing.total_negative = total_neg
                    else:
                        db.add(GameSnapshot(
                            appid=game.appid,
                            snapshot_date=today,
                            review_count=total_reviews,
                            review_score_pct=review_score_pct,
                            total_positive=total_pos,
                            total_negative=total_neg,
                        ))

                    db.commit()
                    processed += 1

                except Exception as e:
                    logger.error(f"Error fetching reviews for AppID {game.appid}: {e}")
                    db.rollback()
                    failed += 1

        run.status = "success" if failed == 0 else "partial"
        run.items_processed = processed
        run.items_failed = failed
        run.finished_at = datetime.now(timezone.utc)
        run.api_calls_made = steam_limiter.stats["calls_today"] if hasattr(steam_limiter, "stats") else 0
        run.api_calls_rate_limited = steam_limiter.stats["rate_limited_today"] if hasattr(steam_limiter, "stats") else 0
        db.commit()

        logger.info(f"Review snapshots complete: {processed} snapped, {failed} failed")

    except Exception as e:
        run.status = "failed"
        run.error_message = str(e)
        run.finished_at = datetime.now(timezone.utc)
        db.commit()
        logger.exception("Review snapshots failed")
    finally:
        db.close()
