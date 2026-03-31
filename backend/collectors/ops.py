from __future__ import annotations

"""Stage 10: OPS (Overperformance Score) Calculation — v4

Primary signal: age-adjusted velocity + velocity decay rate.

Components:
  age_velocity  = current_velocity / expected_velocity_at_age     weight: 0.35
  decay_rate    = normalized velocity retention (wk2-4 vs wk1)   weight: 0.20
  review_volume = (review_count / median_reviews) * price_mod     weight: 0.15
  yt_engagement = views/subs ratio normalized + breadth            weight: 0.15
  ccu           = peak_ccu / median_ccu * age_decay                weight: 0.15

  score = min(100, raw_ops * ops_score_multiplier)

All components capped at their max (velocity: 5, decay: 2, review: 5, youtube: ~1.8, ccu: 5).
All weights configurable via settings. NULL components redistribute weight.
Coverage penalty: 1 component = ×0.50, 2 = ×0.75, 3+ = ×1.0.
COLD START GUARD: No scores if genre_median_sample_size < 20.
"""
import logging
import math
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import func

from config import settings
from database import SessionLocal
from models import CollectionRun, Game, GameSnapshot, OpsScore, YoutubeVideo, YoutubeChannel

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
    """Get median review count and velocity for comparable games.

    Wide 120-day peer window for baseline stability.
    """
    cutoff_date = date.today() - timedelta(days=days_since_launch + 30)
    earliest_date = date.today() - timedelta(days=days_since_launch + 150)

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


# ── Age-adjusted velocity helpers ──────────────────────────────────

def _expected_velocity_at_age(days_since_launch: int) -> float:
    """Return the expected median velocity for a game at this age."""
    if days_since_launch <= 7:
        return settings.ops_velocity_baseline_week1
    if days_since_launch <= 28:
        return settings.ops_velocity_baseline_week2_4
    return settings.ops_velocity_baseline_month2_3


def _compute_current_velocity(db, appid: int, target_date: date) -> float | None:
    """Compute rolling 3-day average review velocity at target_date."""
    snap_now = (
        db.query(GameSnapshot)
        .filter(GameSnapshot.appid == appid, GameSnapshot.snapshot_date <= target_date,
                GameSnapshot.review_count.isnot(None))
        .order_by(GameSnapshot.snapshot_date.desc())
        .first()
    )
    if not snap_now or snap_now.review_count is None:
        return None

    three_days_ago = target_date - timedelta(days=3)
    snap_prev = (
        db.query(GameSnapshot)
        .filter(GameSnapshot.appid == appid, GameSnapshot.snapshot_date <= three_days_ago,
                GameSnapshot.review_count.isnot(None))
        .order_by(GameSnapshot.snapshot_date.desc())
        .first()
    )
    if not snap_prev or snap_prev.review_count is None:
        return None

    day_span = (snap_now.snapshot_date - snap_prev.snapshot_date).days
    if day_span <= 0:
        return None

    return max(0.0, (snap_now.review_count - snap_prev.review_count) / day_span)


# ── Velocity decay helpers ─────────────────────────────────────────

def _compute_velocity_decay(db, appid: int, release_date: date) -> float | None:
    """Compute velocity decay: week 2-4 velocity / week 1 velocity.

    Returns a ratio: 1.0 = no decay, 0.1 = 90% decay, >1.0 = accelerating.
    Returns None if not enough data (game too young or missing snapshots).
    """
    if not release_date:
        return None

    days_out = (date.today() - release_date).days
    if days_out < 14:
        return None  # too young to measure decay

    # Week 1 velocity
    s0 = (
        db.query(GameSnapshot)
        .filter_by(appid=appid, snapshot_date=release_date)
        .first()
    )
    d7 = release_date + timedelta(days=7)
    s7 = (
        db.query(GameSnapshot)
        .filter(GameSnapshot.appid == appid, GameSnapshot.snapshot_date <= d7,
                GameSnapshot.review_count.isnot(None))
        .order_by(GameSnapshot.snapshot_date.desc())
        .first()
    )

    if not s0 or not s7 or s0.review_count is None or s7.review_count is None:
        return None
    span1 = (s7.snapshot_date - release_date).days
    if span1 <= 0:
        return None
    v_week1 = (s7.review_count - (s0.review_count or 0)) / span1
    if v_week1 <= 0:
        return None

    # Week 2-4 velocity (or latest available window)
    d14 = release_date + timedelta(days=14)
    end_day = min(release_date + timedelta(days=28), date.today())
    s14 = (
        db.query(GameSnapshot)
        .filter(GameSnapshot.appid == appid, GameSnapshot.snapshot_date >= d14,
                GameSnapshot.review_count.isnot(None))
        .order_by(GameSnapshot.snapshot_date.asc())
        .first()
    )
    s_end = (
        db.query(GameSnapshot)
        .filter(GameSnapshot.appid == appid, GameSnapshot.snapshot_date <= end_day,
                GameSnapshot.review_count.isnot(None))
        .order_by(GameSnapshot.snapshot_date.desc())
        .first()
    )

    if not s14 or not s_end or s14.review_count is None or s_end.review_count is None:
        return None
    span2 = (s_end.snapshot_date - s14.snapshot_date).days
    if span2 <= 0:
        return None
    v_week2_4 = (s_end.review_count - s14.review_count) / span2

    return max(0.0, v_week2_4) / v_week1


# ── YouTube engagement helpers ─────────────────────────────────────

def _get_youtube_engagement(db, appid: int) -> tuple[float | None, float, int]:
    """YouTube engagement score using views/subs ratio + breadth.

    Returns (engagement_score, breadth_score, unique_channel_count).
    engagement_score is None if no videos.
    """
    videos = (
        db.query(YoutubeVideo, YoutubeChannel.subscriber_count)
        .join(YoutubeChannel, YoutubeVideo.channel_id == YoutubeChannel.channel_id)
        .filter(YoutubeVideo.matched_appid == appid)
        .all()
    )

    if not videos:
        return None, 0.0, 0

    # Views/subs ratio per video, then take the max (best-performing video)
    ratios = []
    unique_channels = set()
    for vid, subs in videos:
        unique_channels.add(vid.channel_id)
        if vid.view_count and subs and subs > 0:
            ratios.append(vid.view_count / subs)

    unique_count = len(unique_channels)
    breadth_score = min(1.0, unique_count / 10)

    if not ratios:
        # Videos exist but no view/sub data — use breadth only
        return breadth_score * 0.5 if unique_count > 0 else None, breadth_score, unique_count

    # Normalize best ratio against median
    best_ratio = max(ratios)
    median_ratio = settings.ops_yt_median_views_subs_ratio
    ratio_score = min(2.0, best_ratio / median_ratio) if median_ratio > 0 else 0.0

    combined = (
        settings.ops_yt_view_subweight * ratio_score
        + settings.ops_yt_breadth_subweight * breadth_score
    )

    return combined, breadth_score, unique_count


# ── CCU engagement ────────────────────────────────────────────────

def _compute_ccu_component(
    db, appid: int, release_date: date | None, baselines: dict,
) -> float | None:
    """CCU engagement: peak_ccu / median_ccu with age-based decay.

    Returns None if no CCU data available.
    Decays linearly to 0 over ops_ccu_decay_days from release.
    """
    snapshot = (
        db.query(GameSnapshot)
        .filter(
            GameSnapshot.appid == appid,
            GameSnapshot.peak_ccu.isnot(None),
            GameSnapshot.peak_ccu > 0,
        )
        .order_by(GameSnapshot.snapshot_date.desc())
        .first()
    )

    if not snapshot or not snapshot.peak_ccu:
        return None

    median_ccu = baselines.get("median_ccu")
    if not median_ccu or median_ccu <= 0:
        return None

    raw = snapshot.peak_ccu / median_ccu

    # Age decay: CCU matters most at launch, decays to 0 after N days
    if release_date:
        days_out = (date.today() - release_date).days
        decay_days = settings.ops_ccu_decay_days
        if days_out >= decay_days:
            return None  # too old for CCU to be relevant
        decay_factor = max(0.0, 1.0 - (days_out / decay_days))
        raw *= decay_factor

    return min(5.0, raw)


# ── Price modifier ────────────────────────────────────────────────

def _get_price_modifier(price_usd: float | None) -> float:
    if price_usd is None or price_usd <= 0:
        return settings.ops_price_free
    if price_usd < 5.0:
        return settings.ops_price_under5
    if price_usd < 10.0:
        return settings.ops_price_5to10
    if price_usd < 20.0:
        return settings.ops_price_10to20
    return settings.ops_price_over20


# ── Weight normalization ──────────────────────────────────────────

def _normalize_weights(components: dict[str, tuple[float | None, float]]) -> float:
    """Compute weighted sum, redistributing weight from NULL components.

    Applies a graduated coverage penalty based on active component count
    (out of 5 total) to prevent inflated scores from sparse data.
    """
    active = {k: (v, w) for k, (v, w) in components.items() if v is not None}
    if not active:
        return 0.0
    total_weight = sum(w for _, w in active.values())
    if total_weight <= 0:
        return 0.0
    raw = sum(v * (w / total_weight) for v, w in active.values())

    # Coverage penalty: fewer active signals = less confidence = lower score
    n = len(active)
    total = len(components)
    if n == 1:
        return raw * 0.50
    if n == 2:
        return raw * 0.70
    if n == 3:
        return raw * 0.85
    if n == 4:
        return raw * 0.95
    return raw  # 5/5 = full score


# ── Main calculation ──────────────────────────────────────────────

def _calculate_ops_for_game(
    db, game: Game, snapshot: GameSnapshot, baselines: dict,
) -> dict | None:
    """Calculate OPS v3 for a single game."""
    today = date.today()
    days_since_launch = (
        (today - game.release_date).days if game.release_date else 0
    )

    # --- 1. Age-adjusted velocity (primary signal, weight 0.35) ---
    current_vel = _compute_current_velocity(db, game.appid, today)
    expected_vel = _expected_velocity_at_age(days_since_launch)
    velocity_component = None
    if current_vel is not None and expected_vel > 0:
        velocity_component = min(5.0, current_vel / expected_vel)

    # Persist velocity on snapshot if available
    if current_vel is not None and snapshot.review_velocity_7d is None:
        snapshot.review_velocity_7d = current_vel
        db.flush()

    # --- 2. Velocity decay rate (weight 0.25) ---
    decay_ratio = _compute_velocity_decay(db, game.appid, game.release_date)
    decay_component = None
    if decay_ratio is not None:
        # Normalize: 0% decay (ratio=1.0) → score 1.0
        #            50% decay (ratio=0.5) → score 0.5
        #            Accelerating (ratio>1.0) → capped at 2.0
        decay_component = min(2.0, decay_ratio)

    # --- 3. Review volume (weight 0.15) ---
    price_mod = _get_price_modifier(game.price_usd)
    review_component = None
    if snapshot.review_count and baselines["median_reviews"] > 0:
        review_component = min(5.0, (snapshot.review_count / baselines["median_reviews"]) * price_mod)

    # --- 4. YouTube engagement (weight 0.15) ---
    yt_engagement, yt_breadth, _ = _get_youtube_engagement(db, game.appid)
    youtube_component = yt_engagement

    # --- 5. CCU engagement (weight 0.15) ---
    ccu_component = _compute_ccu_component(db, game.appid, game.release_date, baselines)

    # --- Weighted sum with NULL redistribution ---
    components = {
        "velocity": (velocity_component, settings.ops_velocity_weight),
        "decay": (decay_component, settings.ops_decay_weight),
        "review": (review_component, settings.ops_review_weight),
        "youtube": (youtube_component, settings.ops_youtube_weight),
        "ccu": (ccu_component, settings.ops_ccu_weight),
    }
    raw_ops = _normalize_weights(components)

    # Normalize to 0-100
    score = min(100.0, raw_ops * settings.ops_score_multiplier)

    # Confidence
    active_count = sum(1 for _, (v, _) in components.items() if v is not None)
    if days_since_launch < 3:
        confidence = "low"
    elif active_count <= 2:
        confidence = "medium"
    else:
        confidence = "high"

    return {
        "appid": game.appid,
        "score_date": today,
        "score": round(score, 1),
        "confidence": confidence,
        "review_component": round(review_component, 3) if review_component is not None else None,
        "velocity_component": round(velocity_component, 3) if velocity_component is not None else None,
        "decay_component": round(decay_component, 3) if decay_component is not None else None,
        "ccu_component": round(ccu_component, 3) if ccu_component is not None else None,
        "youtube_component": round(yt_engagement, 3) if youtube_component is not None else None,
        "creator_response_component": None,  # removed in v4
        "youtube_breadth": round(yt_breadth, 3),
        "wishlist_bonus": 0.0,
        "raw_ops": round(raw_ops, 4),
        "price_modifier": round(price_mod, 2),
        "formula_version": 4,
    }


async def run_ops_calculation():
    """Calculate OPS v3 scores for all active games."""
    db = SessionLocal()
    run = CollectionRun(job_name="ops", status="running")
    db.add(run)
    db.commit()
    db.refresh(run)

    processed = 0
    failed = 0
    today = date.today()

    try:
        games = db.query(Game).filter(Game.is_horror == True).all()

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

                # Fallback medians when peer sample too small
                if baselines["sample_size"] < MIN_BASELINE_GAMES:
                    baselines["median_reviews"] = 30.0
                    baselines["median_ccu"] = max(baselines["median_ccu"], 5.0) if baselines["median_ccu"] else 5.0
                    if baselines["median_velocity"] is None:
                        baselines["median_velocity"] = 3.0

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

        logger.info(f"OPS v3 calculation complete: {processed} scored, {failed} failed")

    except Exception as e:
        run.status = "failed"
        run.error_message = str(e)
        run.finished_at = datetime.now(timezone.utc)
        db.commit()
        logger.exception("OPS calculation failed")
    finally:
        db.close()
