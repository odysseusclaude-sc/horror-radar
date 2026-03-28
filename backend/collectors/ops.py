from __future__ import annotations

"""Stage 10: OPS (Overperformance Score) Calculation — v2

Formula:
  review_component   = (review_count / median_reviews) * price_modifier   weight: 0.30
  velocity_component = review_velocity_7d / median_velocity               weight: 0.25
  youtube_component  = 0.6 * view_score + 0.4 * breadth_score            weight: 0.25
  ccu_component      = peak_ccu / median_ccu (decays to 0 after 14d)     weight: 0.20

  score = min(100, raw_ops * 40)

All weights configurable via settings. NULL components redistribute weight.
COLD START GUARD: No scores if genre_median_sample_size < 20.
"""
import logging
import math
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import func

from config import settings
from database import SessionLocal
from models import CollectionRun, Game, GameSnapshot, OpsScore, YoutubeVideo

logger = logging.getLogger(__name__)

MIN_BASELINE_GAMES = 20


def _median(values: list[float]) -> float:
    """Compute true median of a list of numbers."""
    if not values:
        return 0.0
    s = sorted(values)
    n = len(s)
    if n % 2 == 1:
        return float(s[n // 2])
    return (s[n // 2 - 1] + s[n // 2]) / 2.0


def _get_genre_baselines(db, days_since_launch: int) -> dict:
    """Get median review count, CCU, and velocity for comparable games.

    Uses actual median (not average) to avoid outlier skew.
    """
    cutoff_date = date.today() - timedelta(days=days_since_launch + 30)
    earliest_date = date.today() - timedelta(days=days_since_launch + 60)

    rows = (
        db.query(
            GameSnapshot.review_count,
            GameSnapshot.peak_ccu,
            GameSnapshot.review_velocity_7d,
        )
        .join(Game, Game.appid == GameSnapshot.appid)
        .filter(
            Game.release_date.between(earliest_date, cutoff_date),
            GameSnapshot.review_count.isnot(None),
        )
        .all()
    )

    review_vals = [r[0] for r in rows if r[0] is not None and r[0] > 0]
    ccu_vals = [r[1] for r in rows if r[1] is not None and r[1] > 0]
    velocity_vals = [r[2] for r in rows if r[2] is not None and r[2] > 0]

    return {
        "median_reviews": _median(review_vals),
        "median_ccu": _median(ccu_vals),
        "median_velocity": _median(velocity_vals) if velocity_vals else None,
        "sample_size": len(review_vals),
    }


def _compute_review_velocity_7d(db, appid: int, release_date: date | None) -> float | None:
    """Compute average reviews/day in the first 7 days post-launch."""
    if not release_date:
        return None

    day7 = release_date + timedelta(days=7)
    snapshots = (
        db.query(GameSnapshot)
        .filter(
            GameSnapshot.appid == appid,
            GameSnapshot.snapshot_date.between(release_date, day7),
            GameSnapshot.review_count.isnot(None),
        )
        .order_by(GameSnapshot.snapshot_date.asc())
        .all()
    )

    if len(snapshots) < 2:
        return None

    first = snapshots[0].review_count or 0
    last = snapshots[-1].review_count or 0
    days_span = (snapshots[-1].snapshot_date - snapshots[0].snapshot_date).days

    if days_span <= 0:
        return None

    return (last - first) / days_span


def _get_price_modifier(price_usd: float | None) -> float:
    """Get price bracket modifier from settings."""
    if price_usd is None or price_usd <= 0:
        return settings.ops_price_free
    if price_usd < 5.0:
        return settings.ops_price_under5
    if price_usd < 10.0:
        return settings.ops_price_5to10
    if price_usd < 20.0:
        return settings.ops_price_10to20
    return settings.ops_price_over20


def _get_youtube_score(db, appid: int) -> tuple[float, float, int]:
    """Score based on YouTube coverage: view volume + channel breadth.

    Returns (combined_score, breadth_score, unique_channel_count).
    """
    videos = (
        db.query(YoutubeVideo)
        .filter(YoutubeVideo.matched_appid == appid)
        .all()
    )

    if not videos:
        return 0.0, 0.0, 0

    total_views = sum(v.view_count or 0 for v in videos)
    unique_channels = len({v.channel_id for v in videos})

    view_score = min(1.0, math.log10(max(total_views, 1)) / 6)
    breadth_score = min(1.0, unique_channels / 10)

    combined = (
        settings.ops_yt_view_subweight * view_score
        + settings.ops_yt_breadth_subweight * breadth_score
    )

    return combined, breadth_score, unique_channels


def _normalize_weights(components: dict[str, tuple[float | None, float]]) -> float:
    """Compute weighted sum, redistributing weight from NULL components.

    components: {name: (value_or_none, base_weight)}
    When a value is None, its weight is redistributed proportionally.
    """
    active = {k: (v, w) for k, (v, w) in components.items() if v is not None}
    if not active:
        return 0.0

    total_weight = sum(w for _, w in active.values())
    if total_weight <= 0:
        return 0.0

    return sum(v * (w / total_weight) for v, w in active.values())


def _calculate_ops_for_game(
    db, game: Game, snapshot: GameSnapshot, baselines: dict,
) -> dict | None:
    """Calculate OPS v2 for a single game."""
    days_since_launch = (
        (date.today() - game.release_date).days if game.release_date else 0
    )

    # --- Review component (price-adjusted) ---
    price_mod = _get_price_modifier(game.price_usd)
    review_component = None
    if snapshot.review_count and baselines["median_reviews"] > 0:
        review_component = (snapshot.review_count / baselines["median_reviews"]) * price_mod

    # --- Velocity component ---
    velocity = _compute_review_velocity_7d(db, game.appid, game.release_date)
    # Persist velocity on snapshot if computed
    if velocity is not None and snapshot.review_velocity_7d is None:
        snapshot.review_velocity_7d = velocity
        db.flush()

    velocity_component = None
    if velocity is not None and baselines["median_velocity"] and baselines["median_velocity"] > 0:
        velocity_component = velocity / baselines["median_velocity"]

    # --- YouTube component ---
    yt_combined, yt_breadth, _ = _get_youtube_score(db, game.appid)
    youtube_component = yt_combined if yt_combined > 0 else None

    # --- CCU component (time-decayed) ---
    ccu_component = None
    if snapshot.peak_ccu and baselines["median_ccu"] > 0:
        raw_ccu = snapshot.peak_ccu / baselines["median_ccu"]
        # Decay: full weight at day 0, zero at ops_ccu_decay_days
        if days_since_launch < settings.ops_ccu_decay_days:
            decay = 1.0 - (days_since_launch / settings.ops_ccu_decay_days)
            ccu_component = raw_ccu * decay
        # After decay period, ccu_component stays None → weight redistributes

    # --- Weighted sum with NULL redistribution ---
    components = {
        "review": (review_component, settings.ops_review_weight),
        "velocity": (velocity_component, settings.ops_velocity_weight),
        "youtube": (youtube_component, settings.ops_youtube_weight),
        "ccu": (ccu_component, settings.ops_ccu_weight),
    }
    raw_ops = _normalize_weights(components)

    # Normalize to 0-100
    score = min(100.0, raw_ops * settings.ops_score_multiplier)

    # Confidence
    if days_since_launch < 3:
        confidence = "low"
    elif snapshot.low_confidence_owners:
        confidence = "medium"
    elif velocity is None and youtube_component is None:
        confidence = "medium"
    else:
        confidence = "high"

    return {
        "appid": game.appid,
        "score_date": date.today(),
        "score": round(score, 1),
        "confidence": confidence,
        "review_component": round(review_component, 3) if review_component is not None else None,
        "velocity_component": round(velocity_component, 3) if velocity_component is not None else None,
        "ccu_component": round(ccu_component, 3) if ccu_component is not None else None,
        "youtube_component": round(yt_combined, 3) if youtube_component is not None else None,
        "youtube_breadth": round(yt_breadth, 3),
        "wishlist_bonus": 0.0,
        "raw_ops": round(raw_ops, 4),
        "price_modifier": round(price_mod, 2),
        "formula_version": 2,
    }


async def run_ops_calculation():
    """Calculate OPS v2 scores for all active games."""
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
        total_with_snapshots = (
            db.query(func.count(func.distinct(GameSnapshot.appid)))
            .filter(GameSnapshot.review_count.isnot(None))
            .scalar()
        )

        if total_with_snapshots < MIN_BASELINE_GAMES:
            logger.warning(
                f"Cold start guard: {total_with_snapshots} games with snapshots "
                f"(need {MIN_BASELINE_GAMES}). Deferring OPS."
            )
            run.status = "success"
            run.items_processed = 0
            run.error_message = f"Deferred: {total_with_snapshots}/{MIN_BASELINE_GAMES} baseline"
            run.finished_at = datetime.now(timezone.utc)
            db.commit()
            return

        for game in games:
            try:
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

                baselines = _get_genre_baselines(db, days_since_launch)

                if baselines["sample_size"] < MIN_BASELINE_GAMES:
                    continue

                score_data = _calculate_ops_for_game(db, game, snapshot, baselines)

                if not score_data:
                    continue

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

        logger.info(f"OPS v2 calculation complete: {processed} scored, {failed} failed")

    except Exception as e:
        run.status = "failed"
        run.error_message = str(e)
        run.finished_at = datetime.now(timezone.utc)
        db.commit()
        logger.exception("OPS calculation failed")
    finally:
        db.close()
