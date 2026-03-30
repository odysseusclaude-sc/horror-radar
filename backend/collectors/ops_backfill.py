from __future__ import annotations

"""OPS Historical Backfill

Computes OPS scores for each historical date where a game has
snapshot data. Uses the same formula as ops.py but parameterized
by date instead of hardcoded to today().

Components available historically:
  - Review: ✅ (from backfilled review_count)
  - Velocity: ✅ (computed from 7-day review delta in backfilled data)
  - YouTube: ✅ (videos with publish dates)
  - CCU: ❌ (no historical data — weight redistributed)
"""
import logging
import math
from datetime import date, timedelta

from sqlalchemy import func

from config import settings
from database import SessionLocal
from models import Game, GameSnapshot, OpsScore, YoutubeVideo

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
    """Get median baselines using snapshot data available at target_date."""
    cutoff_date = target_date - timedelta(days=days_since_launch + 30)
    earliest_date = target_date - timedelta(days=days_since_launch + 60)

    # Use the latest snapshot on or before target_date for each game
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


def _compute_velocity_at_date(db, appid: int, release_date: date, target_date: date) -> float | None:
    """Compute review velocity: reviews gained in the 7 days leading up to target_date."""
    if not release_date:
        return None

    # For dates within first 7 days of launch, use launch-window velocity
    days_since = (target_date - release_date).days
    if days_since <= 7:
        snap_today = (
            db.query(GameSnapshot)
            .filter_by(appid=appid, snapshot_date=target_date)
            .first()
        )
        snap_launch = (
            db.query(GameSnapshot)
            .filter_by(appid=appid, snapshot_date=release_date)
            .first()
        )
        if snap_today and snap_launch and snap_today.review_count and snap_launch.review_count is not None:
            span = max(days_since, 1)
            return (snap_today.review_count - (snap_launch.review_count or 0)) / span
        return None

    # For later dates, use rolling 7-day delta
    week_ago = target_date - timedelta(days=7)
    snap_now = (
        db.query(GameSnapshot)
        .filter_by(appid=appid, snapshot_date=target_date)
        .first()
    )
    snap_prev = (
        db.query(GameSnapshot)
        .filter(
            GameSnapshot.appid == appid,
            GameSnapshot.snapshot_date <= week_ago,
        )
        .order_by(GameSnapshot.snapshot_date.desc())
        .first()
    )

    if snap_now and snap_prev and snap_now.review_count is not None and snap_prev.review_count is not None:
        day_span = (target_date - snap_prev.snapshot_date).days
        if day_span > 0:
            return (snap_now.review_count - snap_prev.review_count) / day_span
    return None


def _get_youtube_score_at_date(db, appid: int, target_date: date) -> tuple[float, float]:
    """YouTube score using only videos published on or before target_date."""
    videos = (
        db.query(YoutubeVideo)
        .filter(
            YoutubeVideo.matched_appid == appid,
            YoutubeVideo.published_at <= target_date.isoformat() + "T23:59:59",
        )
        .all()
    )

    if not videos:
        return 0.0, 0.0

    total_views = sum(v.view_count or 0 for v in videos)
    unique_channels = len({v.channel_id for v in videos})

    view_score = min(1.0, math.log10(max(total_views, 1)) / 6)
    breadth_score = min(1.0, unique_channels / 10)

    combined = (
        settings.ops_yt_view_subweight * view_score
        + settings.ops_yt_breadth_subweight * breadth_score
    )
    return combined, breadth_score


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
    active = {k: (v, w) for k, (v, w) in components.items() if v is not None}
    if not active:
        return 0.0
    total_weight = sum(w for _, w in active.values())
    if total_weight <= 0:
        return 0.0
    return sum(v * (w / total_weight) for v, w in active.values())


def backfill_ops_history(appid: int) -> dict:
    """Compute historical OPS scores for each day a game has snapshot data."""
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

            # If not enough baseline games, use a fallback median
            if baselines["sample_size"] < MIN_BASELINE_GAMES:
                # Use a reasonable fallback for indie horror games
                if baselines["median_reviews"] == 0:
                    baselines["median_reviews"] = 30.0  # typical indie horror median
                if baselines["median_velocity"] is None:
                    baselines["median_velocity"] = 3.0  # ~3 reviews/day median

            # Review component
            review_component = None
            if snapshot.review_count and baselines["median_reviews"] > 0:
                review_component = (snapshot.review_count / baselines["median_reviews"]) * price_mod

            # Velocity component
            velocity = _compute_velocity_at_date(db, appid, game.release_date, target_date)
            velocity_component = None
            if velocity is not None and baselines["median_velocity"] and baselines["median_velocity"] > 0:
                velocity_component = velocity / baselines["median_velocity"]

            # YouTube component
            yt_combined, yt_breadth = _get_youtube_score_at_date(db, appid, target_date)
            youtube_component = yt_combined if yt_combined > 0 else None

            # CCU component — None for historical (no data)
            ccu_component = None

            # Weighted sum
            components = {
                "review": (review_component, settings.ops_review_weight),
                "velocity": (velocity_component, settings.ops_velocity_weight),
                "youtube": (youtube_component, settings.ops_youtube_weight),
                "ccu": (ccu_component, settings.ops_ccu_weight),
            }
            raw_ops = _normalize_weights(components)
            score = min(100.0, raw_ops * settings.ops_score_multiplier)

            # Confidence
            if days_since_launch < 3:
                confidence = "low"
            elif velocity is None and youtube_component is None:
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
                "ccu_component": None,
                "youtube_component": round(yt_combined, 3) if youtube_component is not None else None,
                "youtube_breadth": round(yt_breadth, 3),
                "wishlist_bonus": 0.0,
                "raw_ops": round(raw_ops, 4),
                "price_modifier": round(price_mod, 2),
                "formula_version": 2,
            }

            if existing:
                for k, v in score_data.items():
                    setattr(existing, k, v)
            else:
                db.add(OpsScore(**score_data))

            created += 1

        db.commit()
        logger.info(f"AppID {appid}: backfilled {created} OPS scores, {skipped} skipped")

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
