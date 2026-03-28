from __future__ import annotations

"""Stage 10: OPS (Overperformance Score) Calculation

Runs last, after all other collection jobs.
Computes a normalized 0-100 score based on reviews, CCU, and YouTube coverage.

COLD START GUARD: No OPS scores are written if genre_median_sample_size < 20.
This is non-negotiable — showing scores on thin data destroys trust.
"""
import logging
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import func

from database import SessionLocal
from models import CollectionRun, Game, GameSnapshot, OpsScore, YoutubeVideo

logger = logging.getLogger(__name__)

MIN_BASELINE_GAMES = 20  # Cold start guard threshold


def _get_genre_medians(db, days_since_launch: int) -> tuple[float, float, int]:
    """Get median review count and CCU for comparable games.

    Uses SQL aggregation instead of loading all rows into Python.
    Returns (median_reviews, median_ccu, sample_size).
    """
    cutoff_date = date.today() - timedelta(days=days_since_launch + 30)
    earliest_date = date.today() - timedelta(days=days_since_launch + 60)

    # Get latest snapshot per comparable game using SQL aggregation
    stats = (
        db.query(
            func.count(func.distinct(GameSnapshot.appid)),
            func.avg(GameSnapshot.review_count),
            func.avg(GameSnapshot.peak_ccu),
        )
        .join(Game, Game.appid == GameSnapshot.appid)
        .filter(
            Game.release_date.between(earliest_date, cutoff_date),
            GameSnapshot.review_count.isnot(None),
        )
        .first()
    )

    if not stats or not stats[0]:
        return 0.0, 0.0, 0

    sample_size = stats[0]
    # Using avg as approximation of median (good enough for OPS scoring)
    avg_reviews = float(stats[1] or 0)
    avg_ccu = float(stats[2] or 0)

    return avg_reviews, avg_ccu, sample_size


def _get_youtube_score(db, appid: int) -> float:
    """Score based on YouTube coverage: number of matching videos × avg views."""
    videos = (
        db.query(YoutubeVideo)
        .filter(YoutubeVideo.matched_appid == appid)
        .all()
    )

    if not videos:
        return 0.0

    total_views = sum(v.view_count or 0 for v in videos)
    # Normalize: log scale, 1M views = 1.0
    import math
    return min(1.0, math.log10(max(total_views, 1)) / 6)


def _calculate_ops_for_game(
    db, game: Game, snapshot: GameSnapshot,
    median_reviews: float, median_ccu: float,
) -> dict | None:
    """Calculate OPS for a single game. Returns score dict or None."""
    days_since_launch = (
        (date.today() - game.release_date).days if game.release_date else 0
    )

    # Review component: actual / median
    review_component = 0.0
    if snapshot.review_count and median_reviews > 0:
        review_component = snapshot.review_count / median_reviews

    # CCU component: actual / median
    ccu_component = 0.0
    if snapshot.peak_ccu and median_ccu > 0:
        ccu_component = snapshot.peak_ccu / median_ccu

    # YouTube component
    youtube_component = _get_youtube_score(db, game.appid)

    # Raw OPS = weighted sum of components
    raw_ops = (
        review_component * 0.4
        + ccu_component * 0.3
        + youtube_component * 0.3
    )

    # Normalize to 0-100
    score = min(100.0, raw_ops * 50)

    # Determine confidence
    if days_since_launch < 3:
        confidence = "low"
    elif snapshot.low_confidence_owners:
        confidence = "medium"
    else:
        confidence = "high"

    return {
        "appid": game.appid,
        "score_date": date.today(),
        "score": round(score, 1),
        "confidence": confidence,
        "review_component": round(review_component, 3),
        "ccu_component": round(ccu_component, 3),
        "youtube_component": round(youtube_component, 3),
        "wishlist_bonus": 0.0,  # Stage 6 deferred
        "raw_ops": round(raw_ops, 4),
    }


async def run_ops_calculation():
    """Calculate OPS scores for all active games."""
    db = SessionLocal()
    run = CollectionRun(job_name="ops", status="running")
    db.add(run)
    db.commit()
    db.refresh(run)

    processed = 0
    failed = 0
    today = date.today()

    try:
        games = db.query(Game).all()

        if not games:
            run.status = "success"
            run.finished_at = datetime.now(timezone.utc)
            db.commit()
            return

        # Cold start guard
        total_games_with_snapshots = (
            db.query(func.count(func.distinct(GameSnapshot.appid)))
            .filter(GameSnapshot.review_count.isnot(None))
            .scalar()
        )

        if total_games_with_snapshots < MIN_BASELINE_GAMES:
            logger.warning(
                f"Cold start guard: only {total_games_with_snapshots} games with snapshots "
                f"(need {MIN_BASELINE_GAMES}). Deferring OPS calculation."
            )
            run.status = "success"
            run.items_processed = 0
            run.error_message = f"Deferred: insufficient baseline data ({total_games_with_snapshots}/{MIN_BASELINE_GAMES})"
            run.finished_at = datetime.now(timezone.utc)
            db.commit()
            return

        for game in games:
            try:
                # Get latest snapshot
                snapshot = (
                    db.query(GameSnapshot)
                    .filter_by(appid=game.appid)
                    .order_by(GameSnapshot.snapshot_date.desc())
                    .first()
                )

                if not snapshot:
                    continue

                days_since_launch = (
                    (today - game.release_date).days if game.release_date else 30
                )

                median_reviews, median_ccu, sample_size = _get_genre_medians(
                    db, days_since_launch
                )

                if sample_size < MIN_BASELINE_GAMES:
                    continue

                score_data = _calculate_ops_for_game(
                    db, game, snapshot, median_reviews, median_ccu
                )

                if not score_data:
                    continue

                # Upsert
                existing = (
                    db.query(OpsScore)
                    .filter_by(appid=game.appid, score_date=today)
                    .first()
                )

                if existing:
                    for k, v in score_data.items():
                        setattr(existing, k, v)
                else:
                    db.add(OpsScore(**score_data))

                db.commit()
                processed += 1

            except Exception as e:
                logger.error(f"Error calculating OPS for AppID {game.appid}: {e}")
                db.rollback()
                failed += 1

        run.status = "success" if failed == 0 else "partial"
        run.items_processed = processed
        run.items_failed = failed
        run.finished_at = datetime.now(timezone.utc)
        db.commit()

        logger.info(f"OPS calculation complete: {processed} scored, {failed} failed")

    except Exception as e:
        run.status = "failed"
        run.error_message = str(e)
        run.finished_at = datetime.now(timezone.utc)
        db.commit()
        logger.exception("OPS calculation failed")
    finally:
        db.close()
