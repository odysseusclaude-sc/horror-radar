from __future__ import annotations

"""OPS Historical Backfill — v4

Computes OPS scores for each historical date where a game has
snapshot data. Uses the same v4 formula as ops.py but parameterized
by date instead of hardcoded to today().

Components:
  age_velocity  = current_velocity / expected_velocity_at_age     weight: 0.35
  decay_rate    = normalized velocity retention (wk2-4 vs wk1)   weight: 0.20
  review_volume = (review_count / median_reviews) * price_mod     weight: 0.15
  yt_engagement = views/subs ratio normalized + breadth            weight: 0.15
  ccu           = peak_ccu / median_ccu * age_decay                weight: 0.15
"""
import logging
import math
from datetime import date, timedelta

from sqlalchemy import func

from config import settings
from database import SessionLocal
from models import Game, GameSnapshot, OpsScore, YoutubeVideo, YoutubeChannel

logger = logging.getLogger(__name__)

MIN_BASELINE_GAMES = 20


def _median(values: list[float]) -> float:
    if not values:
        return 0.0
    s = sorted(values)
    n = len(s)
    if n % 2 == 1:
        return float(s[n // 2])
    return (s[n // 2 - 1] + s[n // 2]) / 2.0


def _get_baselines_at_date(db, target_date: date, days_since_launch: int) -> dict:
    """Get median baselines using snapshot data available at target_date.

    Wide 120-day peer window for baseline stability; games that released
    30-150 days before the reference point (adjusted by age) are included.
    """
    cutoff_date = target_date - timedelta(days=days_since_launch + 30)
    earliest_date = target_date - timedelta(days=days_since_launch + 150)

    latest_snap_sq = (
        db.query(
            GameSnapshot.appid,
            func.max(GameSnapshot.snapshot_date).label("max_date"),
        )
        .filter(GameSnapshot.snapshot_date <= target_date)
        .group_by(GameSnapshot.appid)
        .subquery()
    )

    rows = (
        db.query(
            GameSnapshot.review_count,
            GameSnapshot.peak_ccu,
            GameSnapshot.review_velocity_7d,
        )
        .join(latest_snap_sq, (
            (GameSnapshot.appid == latest_snap_sq.c.appid)
            & (GameSnapshot.snapshot_date == latest_snap_sq.c.max_date)
        ))
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


def _compute_current_velocity_at_date(db, appid: int, target_date: date) -> float | None:
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

def _compute_velocity_decay_at_date(db, appid: int, release_date: date, target_date: date) -> float | None:
    """Compute velocity decay at target_date: week 2-4 velocity / week 1 velocity.

    Returns a ratio: 1.0 = no decay, 0.1 = 90% decay, >1.0 = accelerating.
    Returns None if not enough data (game too young or missing snapshots).
    """
    if not release_date:
        return None

    days_out = (target_date - release_date).days
    if days_out < 14:
        return None  # too young to measure decay

    # Week 1 velocity
    s0 = (
        db.query(GameSnapshot)
        .filter(GameSnapshot.appid == appid, GameSnapshot.snapshot_date <= release_date,
                GameSnapshot.review_count.isnot(None))
        .order_by(GameSnapshot.snapshot_date.desc())
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
    span1 = (s7.snapshot_date - s0.snapshot_date).days if s0.snapshot_date != s7.snapshot_date else (s7.snapshot_date - release_date).days
    if span1 <= 0:
        return None
    v_week1 = (s7.review_count - (s0.review_count or 0)) / span1
    if v_week1 <= 0:
        return None

    # Week 2-4 velocity (or latest available up to target_date)
    d14 = release_date + timedelta(days=14)
    end_day = min(release_date + timedelta(days=28), target_date)
    s14 = (
        db.query(GameSnapshot)
        .filter(GameSnapshot.appid == appid, GameSnapshot.snapshot_date >= d14,
                GameSnapshot.snapshot_date <= end_day,
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

def _get_youtube_engagement_at_date(db, appid: int, target_date: date) -> tuple[float | None, float, int]:
    """YouTube engagement score using views/subs ratio + breadth.

    Only includes videos published on or before target_date.
    Returns (engagement_score, breadth_score, unique_channel_count).
    """
    videos = (
        db.query(YoutubeVideo, YoutubeChannel.subscriber_count)
        .join(YoutubeChannel, YoutubeVideo.channel_id == YoutubeChannel.channel_id)
        .filter(
            YoutubeVideo.matched_appid == appid,
            YoutubeVideo.published_at <= target_date.isoformat() + "T23:59:59",
        )
        .all()
    )

    if not videos:
        return None, 0.0, 0

    ratios = []
    unique_channels = set()
    for vid, subs in videos:
        unique_channels.add(vid.channel_id)
        if vid.view_count and subs and subs > 0:
            ratios.append(vid.view_count / subs)

    unique_count = len(unique_channels)
    breadth_score = min(1.0, unique_count / 10)

    if not ratios:
        return breadth_score * 0.5 if unique_count > 0 else None, breadth_score, unique_count

    best_ratio = max(ratios)
    median_ratio = settings.ops_yt_median_views_subs_ratio
    ratio_score = min(2.0, best_ratio / median_ratio) if median_ratio > 0 else 0.0

    combined = (
        settings.ops_yt_view_subweight * ratio_score
        + settings.ops_yt_breadth_subweight * breadth_score
    )

    return combined, breadth_score, unique_count


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


def _normalize_weights(components: dict[str, tuple[float | None, float]]) -> float:
    """Compute weighted sum with graduated coverage penalty."""
    active = {k: (v, w) for k, (v, w) in components.items() if v is not None}
    if not active:
        return 0.0
    total_weight = sum(w for _, w in active.values())
    if total_weight <= 0:
        return 0.0
    raw = sum(v * (w / total_weight) for v, w in active.values())

    n = len(active)
    if n == 1:
        return raw * 0.50
    if n == 2:
        return raw * 0.70
    if n == 3:
        return raw * 0.85
    if n == 4:
        return raw * 0.95
    return raw


def backfill_ops_history(appid: int) -> dict:
    """Compute historical OPS v3 scores for each day a game has snapshot data."""
    db = SessionLocal()
    try:
        game = db.query(Game).filter_by(appid=appid).first()
        if not game:
            return {"error": "Game not found"}
        if not game.release_date:
            return {"error": "No release date"}

        # Get all snapshot dates for this game
        snap_dates = (
            db.query(GameSnapshot.snapshot_date)
            .filter_by(appid=appid)
            .filter(GameSnapshot.review_count.isnot(None))
            .order_by(GameSnapshot.snapshot_date.asc())
            .all()
        )
        snap_dates = [row[0] for row in snap_dates]

        if not snap_dates:
            return {"error": "No snapshots with review data"}

        price_mod = _get_price_modifier(game.price_usd)
        created = 0
        skipped = 0

        for target_date in snap_dates:
            days_since_launch = (target_date - game.release_date).days

            # Get snapshot for this date
            snapshot = (
                db.query(GameSnapshot)
                .filter_by(appid=appid, snapshot_date=target_date)
                .first()
            )
            if not snapshot or not snapshot.review_count:
                skipped += 1
                continue

            # Get baselines at this date
            baselines = _get_baselines_at_date(db, target_date, days_since_launch)

            # If not enough baseline games, use stable fallback medians
            if baselines["sample_size"] < MIN_BASELINE_GAMES:
                baselines["median_reviews"] = 30.0
                baselines["median_ccu"] = max(baselines["median_ccu"], 5.0) if baselines["median_ccu"] else 5.0
                if baselines["median_velocity"] is None:
                    baselines["median_velocity"] = 3.0

            # --- 1. Age-adjusted velocity (weight 0.35, capped at 5.0) ---
            current_vel = _compute_current_velocity_at_date(db, appid, target_date)
            expected_vel = _expected_velocity_at_age(days_since_launch)
            velocity_component = None
            if current_vel is not None and expected_vel > 0:
                velocity_component = min(5.0, current_vel / expected_vel)

            # --- 2. Velocity decay rate (weight 0.25) ---
            decay_ratio = _compute_velocity_decay_at_date(db, appid, game.release_date, target_date)
            decay_component = None
            if decay_ratio is not None:
                decay_component = min(2.0, decay_ratio)

            # --- 3. Review volume (weight 0.15, capped at 5.0) ---
            review_component = None
            if snapshot.review_count and baselines["median_reviews"] > 0:
                review_component = min(5.0, (snapshot.review_count / baselines["median_reviews"]) * price_mod)

            # --- 4. YouTube engagement (weight 0.15) ---
            yt_engagement, yt_breadth, _ = _get_youtube_engagement_at_date(db, appid, target_date)
            youtube_component = yt_engagement

            # --- 5. CCU engagement (weight 0.15) ---
            ccu_component = None
            if snapshot.peak_ccu and snapshot.peak_ccu > 0 and baselines.get("median_ccu") and baselines["median_ccu"] > 0:
                raw_ccu = snapshot.peak_ccu / baselines["median_ccu"]
                # Age decay: CCU matters most at launch
                decay_days = settings.ops_ccu_decay_days
                if days_since_launch < decay_days:
                    decay_factor = max(0.0, 1.0 - (days_since_launch / decay_days))
                    ccu_component = min(5.0, raw_ccu * decay_factor)

            # --- Weighted sum with NULL redistribution ---
            components = {
                "velocity": (velocity_component, settings.ops_velocity_weight),
                "decay": (decay_component, settings.ops_decay_weight),
                "review": (review_component, settings.ops_review_weight),
                "youtube": (youtube_component, settings.ops_youtube_weight),
                "ccu": (ccu_component, settings.ops_ccu_weight),
            }
            raw_ops = _normalize_weights(components)
            score = min(100.0, raw_ops * settings.ops_score_multiplier)

            # Confidence
            active_count = sum(1 for _, (v, _) in components.items() if v is not None)
            if days_since_launch < 3:
                confidence = "low"
            elif active_count <= 2:
                confidence = "medium"
            else:
                confidence = "high"

            # Upsert OPS score
            existing = (
                db.query(OpsScore)
                .filter_by(appid=appid, score_date=target_date)
                .first()
            )
            score_data = {
                "appid": appid,
                "score_date": target_date,
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

            if existing:
                for k, v in score_data.items():
                    setattr(existing, k, v)
            else:
                db.add(OpsScore(**score_data))

            created += 1

        db.commit()
        logger.info(f"AppID {appid}: backfilled {created} OPS v4 scores, {skipped} skipped")

        return {
            "appid": appid,
            "title": game.title,
            "days_scored": created,
            "days_skipped": skipped,
        }

    except Exception as e:
        db.rollback()
        logger.exception(f"OPS backfill failed for {appid}")
        return {"error": str(e)}
    finally:
        db.close()
