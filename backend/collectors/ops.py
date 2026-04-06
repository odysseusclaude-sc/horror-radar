from __future__ import annotations

"""Stage 10: OPS (Overperformance Score) Calculation — v6

Components (7 total, weights sum to 1.00):
  review_momentum    = 0.55*velocity + 0.25*volume + 0.20*retention   weight: 0.28
  sentiment          = score_pct * trend_mult * (1 + early_bonus)     weight: 0.10
  youtube_signal     = 4 sub-signals (view_vel, breadth, engagement,  weight: 0.18
                       creator_tier)
  live_engagement    = 0.50*ccu + 0.30*twitch_streamer +              weight: 0.15
                       0.20*twitch_viewer
  community_buzz     = 0.50*mention_vel + 0.30*upvote_quality +       weight: 0.10
                       0.20*comment_depth
  demo_conversion    = demo_reviews / peer_median_demo_reviews         weight: 0.07
                       (NULL if no demo or demo_review_count < 5)
  discount_demand    = velocity_ratio * discount_dampening_factor      weight: 0.12

Final score: min(100, raw_ops * calibration_constant * coverage_penalty)

v6 changes from v5:
  - Merged velocity + volume + decay into Review Momentum (collinearity fix)
  - YouTube: 4 sub-signals using existing likes/comments/subs data
  - CCU + Twitch merged into Live Engagement; age decay extended to 30d (floor 0.3)
  - Community Buzz: reddit_mentions now scored (was collected but ignored)
  - Demo Conversion: demo review count as conversion signal (new)
  - Discount-Adjusted Demand: dampens velocity during sales (new)
  - Sentiment: early_bonus for >=90% score, >=50 reviews, <=14 days
  - Time-aware coverage penalty: age-bucketed (early/mid/mature)
  - Calibration constant: replaces hardcoded x24 with P95=85 weekly recalc
  - Multiplayer modifier: 1.12x on Review Momentum + Live Engagement
  - Two-pass calculation: raw_ops first, then calibration constant applied
"""
import logging
import math
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import func

from config import settings
from database import SessionLocal
from models import (
    CollectionRun, Game, GameSnapshot, OpsScore,
    TwitchSnapshot, YoutubeVideo, YoutubeChannel, YoutubeVideoSnapshot,
    RedditMention,
)

logger = logging.getLogger(__name__)

MIN_BASELINE_GAMES = 20

# Time-aware coverage penalty: age bucket -> expected active component count
_AGE_BUCKET_EXPECTED = {
    "early": 4,    # days 1-7:  Review Momentum, Sentiment, Live Engagement, Discount
    "mid": 6,      # days 8-30: + YouTube, Community Buzz
    "mature": 7,   # days 31-90: + Demo Conversion (if has_demo)
}
_AGE_BUCKET_PENALTY_PER_MISSING = {
    "early": 0.0,   # neutral -- new games missing social data is normal
    "mid": 0.10,    # 0.90 per missing component
    "mature": 0.20, # 0.80 per missing component
}


# ── Utilities ─────────────────────────────────────────────────────

def _median(values: list) -> float:
    """Compute true median of a list of numbers."""
    if not values:
        return 0.0
    s = sorted(values)
    n = len(s)
    if n % 2 == 1:
        return float(s[n // 2])
    return (s[n // 2 - 1] + s[n // 2]) / 2.0


def _weighted_sub(values_weights: list) -> Optional[float]:
    """Compute normalized weighted average, redistributing NULL sub-weights.

    values_weights: list of (value_or_None, weight) tuples.
    Returns None if all sub-components are None.
    """
    active = [(v, w) for v, w in values_weights if v is not None]
    if not active:
        return None
    total_w = sum(w for _, w in active)
    if total_w <= 0:
        return None
    return sum(v * w for v, w in active) / total_w


# ── Genre baselines ────────────────────────────────────────────────

def _get_genre_baselines(db, days_since_launch: int) -> dict:
    """Get peer medians for all v6 components.

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

    # Twitch peer baseline
    twitch_rows = (
        db.query(TwitchSnapshot.peak_viewers)
        .join(Game, Game.appid == TwitchSnapshot.appid)
        .filter(
            Game.release_date.between(earliest_date, cutoff_date),
            TwitchSnapshot.peak_viewers.isnot(None),
            TwitchSnapshot.peak_viewers > 0,
        )
        .all()
    )
    twitch_vals = [r[0] for r in twitch_rows]

    # Reddit peer baseline (7-day window)
    seven_days_ago_dt = datetime.combine(
        date.today() - timedelta(days=7), datetime.min.time()
    )
    reddit_rows = (
        db.query(
            RedditMention.appid,
            RedditMention.score,
            RedditMention.num_comments,
        )
        .join(Game, Game.appid == RedditMention.appid)
        .filter(
            Game.release_date.between(earliest_date, cutoff_date),
            RedditMention.posted_at >= seven_days_ago_dt,
        )
        .all()
    )
    # Group by appid to get per-game stats
    reddit_by_game: dict[int, list] = {}
    for appid, score, comments in reddit_rows:
        reddit_by_game.setdefault(appid, []).append((score, comments))

    game_mention_counts = [len(v) for v in reddit_by_game.values()]
    game_avg_upvotes = [
        sum(s or 0 for s, _ in v) / len(v)
        for v in reddit_by_game.values() if v
    ]
    game_avg_comments = [
        sum(c or 0 for _, c in v) / len(v)
        for v in reddit_by_game.values() if v
    ]

    # Demo review peer baseline
    demo_rows = (
        db.query(GameSnapshot.demo_review_count)
        .join(Game, Game.appid == GameSnapshot.appid)
        .filter(
            Game.release_date.between(earliest_date, cutoff_date),
            Game.has_demo == True,
            GameSnapshot.demo_review_count.isnot(None),
            GameSnapshot.demo_review_count >= 5,
        )
        .all()
    )
    demo_vals = [r[0] for r in demo_rows if r[0] is not None and r[0] > 0]

    return {
        "median_reviews": _median(review_vals),
        "median_ccu": _median(ccu_vals),
        "median_velocity": _median(velocity_vals) if velocity_vals else None,
        "median_twitch_peak": _median(twitch_vals) if twitch_vals else None,
        "median_reddit_mentions_7d": max(1.0, _median(game_mention_counts)) if game_mention_counts else 1.0,
        "median_reddit_upvotes": max(1.0, _median(game_avg_upvotes)) if game_avg_upvotes else 1.0,
        "median_reddit_comments": max(1.0, _median(game_avg_comments)) if game_avg_comments else 1.0,
        "median_demo_reviews": max(5.0, _median(demo_vals)) if demo_vals else 10.0,
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


def _compute_current_velocity(db, appid: int, target_date: date) -> Optional[float]:
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


# ── Velocity decay / retention ────────────────────────────────────

def _compute_velocity_decay(db, appid: int, release_date: Optional[date]) -> Optional[float]:
    """Compute week2-4 velocity / week1 velocity ratio (retention sub-signal)."""
    if not release_date:
        return None

    days_out = (date.today() - release_date).days
    if days_out < 14:
        return None

    s0 = db.query(GameSnapshot).filter_by(appid=appid, snapshot_date=release_date).first()
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


# ── Price modifier ────────────────────────────────────────────────

def _get_price_modifier(price_usd: Optional[float]) -> float:
    if price_usd is None or price_usd <= 0:
        return settings.ops_price_free
    if price_usd < 5.0:
        return settings.ops_price_under5
    if price_usd < 10.0:
        return settings.ops_price_5to10
    if price_usd < 20.0:
        return settings.ops_price_10to20
    return settings.ops_price_over20


# ── Component 1: Review Momentum ──────────────────────────────────

def _compute_review_momentum(
    db, game: Game, snapshot: GameSnapshot, baselines: dict, days_since_launch: int,
) -> Optional[float]:
    """Review Momentum: merged velocity + volume + retention (weight 0.28).

    Sub-weights: velocity=0.55, volume=0.25, retention=0.20
    Multiplayer boost: 1.12x if game.is_multiplayer
    """
    today = date.today()

    # velocity_ratio: current_velocity / expected_velocity_at_age (cap 5.0)
    current_vel = _compute_current_velocity(db, game.appid, today)
    expected_vel = _expected_velocity_at_age(days_since_launch)
    velocity_ratio = None
    if current_vel is not None and expected_vel > 0:
        velocity_ratio = min(5.0, current_vel / expected_vel)

    # Persist velocity on snapshot if not yet stored
    if current_vel is not None and snapshot.review_velocity_7d is None:
        snapshot.review_velocity_7d = current_vel
        db.flush()

    # volume_ratio: (review_count / median) * price_mod (cap 5.0)
    price_mod = _get_price_modifier(game.price_usd)
    volume_ratio = None
    if snapshot.review_count and baselines["median_reviews"] > 0:
        volume_ratio = min(5.0, (snapshot.review_count / baselines["median_reviews"]) * price_mod)

    # retention_ratio: week2-4 velocity / week1 velocity (cap 2.0)
    decay_val = _compute_velocity_decay(db, game.appid, game.release_date)
    retention_ratio = min(2.0, decay_val) if decay_val is not None else None

    result = _weighted_sub([
        (velocity_ratio,  settings.ops_rm_velocity_subweight),
        (volume_ratio,    settings.ops_rm_volume_subweight),
        (retention_ratio, settings.ops_rm_retention_subweight),
    ])

    if result is None:
        return None

    if game.is_multiplayer:
        result *= settings.ops_multiplayer_boost

    return min(5.0, result)


# ── Component 2: Sentiment (enhanced) ────────────────────────────

def _compute_sentiment_v6(db, game: Game, snapshot: GameSnapshot) -> Optional[float]:
    """Sentiment: score trend + early_bonus for quick high-quality breakouts (weight 0.10).

    early_bonus = 0.15 if review_count >= 50 AND score_pct >= 90 AND days <= 14
    Formula: min(2.0, base * multiplier * (1 + early_bonus))
    """
    latest = (
        db.query(GameSnapshot)
        .filter(
            GameSnapshot.appid == game.appid,
            GameSnapshot.review_score_pct.isnot(None),
            GameSnapshot.review_count.isnot(None),
        )
        .order_by(GameSnapshot.snapshot_date.desc())
        .first()
    )
    if not latest or latest.review_count is None or latest.review_count < 10:
        return None
    if latest.review_score_pct is None:
        return None

    base = latest.review_score_pct / 100.0

    delta = 0.0
    if game.release_date:
        day7 = game.release_date + timedelta(days=7)
        snap_d7 = (
            db.query(GameSnapshot)
            .filter(
                GameSnapshot.appid == game.appid,
                GameSnapshot.snapshot_date <= day7,
                GameSnapshot.review_score_pct.isnot(None),
            )
            .order_by(GameSnapshot.snapshot_date.desc())
            .first()
        )
        if snap_d7 and snap_d7.review_score_pct is not None:
            delta = latest.review_score_pct - snap_d7.review_score_pct

    if delta >= 5:
        multiplier = 1.30
    elif delta >= -5:
        multiplier = 1.00
    elif delta >= -15:
        multiplier = 0.85
    else:
        multiplier = 0.65

    # Early bonus: games hitting 90%+ with 50+ reviews in first 2 weeks
    early_bonus = 0.0
    if game.release_date:
        days_out = (date.today() - game.release_date).days
        if (days_out <= 14
                and latest.review_count >= 50
                and latest.review_score_pct >= 90):
            early_bonus = 0.15

    return min(2.0, base * multiplier * (1.0 + early_bonus))


# ── Component 3: YouTube Signal (enhanced) ───────────────────────

def _compute_youtube_signal_v6(db, appid: int) -> Optional[float]:
    """YouTube Signal: 4 sub-signals using existing DB data (weight 0.18).

    Sub-weights: view_velocity=0.35, channel_breadth=0.30,
                 engagement=0.20, creator_tier=0.15
    No additional API calls -- all data already in youtube_* tables.
    """
    videos = (
        db.query(YoutubeVideo, YoutubeChannel)
        .join(YoutubeChannel, YoutubeVideo.channel_id == YoutubeChannel.channel_id)
        .filter(YoutubeVideo.matched_appid == appid)
        .all()
    )

    if not videos:
        return None

    unique_channels: set = set()
    total_views = 0
    seen_channel_subs: dict = {}
    engagement_scores = []
    max_creator_tier = 0.4

    for vid, channel in videos:
        unique_channels.add(vid.channel_id)
        if vid.view_count:
            total_views += vid.view_count

        # Track one sub count per unique channel
        if vid.channel_id not in seen_channel_subs and channel.subscriber_count:
            seen_channel_subs[vid.channel_id] = channel.subscriber_count

        # Engagement: normalized like_ratio * comment_rate
        views = vid.view_count or 0
        if views > 100:
            likes = vid.like_count or 0
            comments = vid.comment_count or 0
            like_ratio = (likes / views) / 0.04        # baseline 0.04
            comment_rate = (comments / views) / 0.002  # baseline 0.002
            eng = min(2.0, (like_ratio + comment_rate) / 2.0)
            engagement_scores.append(eng)

        # Creator tier by subscriber count
        subs = channel.subscriber_count or 0
        if subs > 5_000_000:
            tier = 2.0
        elif subs > 1_000_000:
            tier = 1.5
        elif subs > 500_000:
            tier = 1.2
        elif subs > 100_000:
            tier = 1.0
        elif subs > 10_000:
            tier = 0.7
        else:
            tier = 0.4
        max_creator_tier = max(max_creator_tier, tier)

    unique_count = len(unique_channels)
    total_subs = sum(seen_channel_subs.values())

    # Sub-signal 1: view_velocity = total_views / total_subs (normalized against 0.074)
    view_velocity: Optional[float] = None
    if total_subs > 0:
        raw_ratio = total_views / total_subs
        view_velocity = min(4.0, raw_ratio / settings.ops_yt_median_views_subs_ratio)
    elif total_views > 0:
        view_velocity = min(1.0, total_views / 10_000)

    # Sub-signal 2: channel_breadth with tier bonus
    breadth_raw = min(1.0, unique_count / 10)
    if unique_count >= 5:
        breadth_bonus = 1.20
    elif unique_count >= 3:
        breadth_bonus = 1.10
    else:
        breadth_bonus = 1.00
    channel_breadth = min(1.5, breadth_raw * breadth_bonus)

    # Sub-signal 3: engagement (avg across videos with sufficient views)
    engagement: Optional[float] = (
        min(2.0, sum(engagement_scores) / len(engagement_scores))
        if engagement_scores else None
    )

    # Sub-signal 4: creator tier (max across covering channels)
    creator_tier = min(2.0, max_creator_tier)

    result = _weighted_sub([
        (view_velocity,  settings.ops_yt_view_velocity_subweight),
        (channel_breadth, settings.ops_yt_channel_breadth_subweight),
        (engagement,     settings.ops_yt_engagement_subweight),
        (creator_tier,   settings.ops_yt_creator_tier_subweight),
    ])

    if result is None and unique_count > 0:
        # Fallback: breadth alone provides weak signal
        return min(0.5, channel_breadth * 0.5)

    return result


# ── Component 4: Live Engagement ──────────────────────────────────

def _compute_live_engagement(
    db, game: Game, baselines: dict, days_since_launch: int,
) -> Optional[float]:
    """Live Engagement: CCU + Twitch merged (weight 0.15).

    Sub-weights: ccu_ratio=0.50, twitch_streamer=0.30, twitch_viewer=0.20
    CCU age decay: linear from 1.0 at day 0 to floor (0.3) at day 30.
    Multiplayer boost: 1.12x if game.is_multiplayer.
    """
    # CCU sub-signal
    snap_ccu = (
        db.query(GameSnapshot)
        .filter(
            GameSnapshot.appid == game.appid,
            GameSnapshot.peak_ccu.isnot(None),
            GameSnapshot.peak_ccu > 0,
        )
        .order_by(GameSnapshot.snapshot_date.desc())
        .first()
    )

    ccu_ratio: Optional[float] = None
    median_ccu = baselines.get("median_ccu")
    if snap_ccu and snap_ccu.peak_ccu and median_ccu and median_ccu > 0:
        raw_ccu = snap_ccu.peak_ccu / median_ccu
        decay_days = settings.ops_ccu_decay_days
        decay_floor = settings.ops_ccu_decay_floor
        if days_since_launch >= decay_days:
            decay_factor = decay_floor
        else:
            progress = days_since_launch / decay_days
            decay_factor = 1.0 - (1.0 - decay_floor) * progress
        ccu_ratio = min(5.0, raw_ccu * decay_factor)

    # Twitch sub-signals
    seven_days_ago = date.today() - timedelta(days=7)
    twitch_snaps = (
        db.query(TwitchSnapshot)
        .filter(
            TwitchSnapshot.appid == game.appid,
            TwitchSnapshot.snapshot_date >= seven_days_ago,
        )
        .all()
    )

    twitch_streamer: Optional[float] = None
    twitch_viewer: Optional[float] = None

    if twitch_snaps:
        peak_viewers_7d = max((s.peak_viewers or 0) for s in twitch_snaps)
        unique_streamers_7d = max((s.unique_streamers or 0) for s in twitch_snaps)

        if unique_streamers_7d > 0:
            twitch_streamer = min(1.0, unique_streamers_7d / 5)

        median_twitch = baselines.get("median_twitch_peak")
        if peak_viewers_7d > 0:
            if median_twitch and median_twitch > 0:
                twitch_viewer = min(5.0, peak_viewers_7d / median_twitch)
            else:
                twitch_viewer = min(1.0, peak_viewers_7d / 50)

    result = _weighted_sub([
        (ccu_ratio,       settings.ops_le_ccu_subweight),
        (twitch_streamer, settings.ops_le_twitch_streamer_subweight),
        (twitch_viewer,   settings.ops_le_twitch_viewer_subweight),
    ])

    if result is None:
        return None

    if game.is_multiplayer:
        result *= settings.ops_multiplayer_boost

    return min(4.0, result)


# ── Component 5: Community Buzz ───────────────────────────────────

def _compute_community_buzz(db, appid: int, baselines: dict) -> Optional[float]:
    """Community Buzz: Reddit grassroots word-of-mouth (weight 0.10).

    Sub-weights: mention_velocity=0.50, upvote_quality=0.30, comment_depth=0.20
    """
    seven_days_ago_dt = datetime.combine(
        date.today() - timedelta(days=7), datetime.min.time()
    )
    mentions = (
        db.query(RedditMention)
        .filter(
            RedditMention.appid == appid,
            RedditMention.posted_at >= seven_days_ago_dt,
        )
        .all()
    )

    if not mentions:
        return None

    mention_count = len(mentions)
    peer_median_mentions = baselines.get("median_reddit_mentions_7d", 1.0)
    mention_velocity = min(5.0, mention_count / max(1.0, peer_median_mentions))

    avg_upvotes = sum(m.score or 0 for m in mentions) / len(mentions)
    peer_median_upvotes = baselines.get("median_reddit_upvotes", 1.0)
    upvote_quality = min(3.0, avg_upvotes / max(1.0, peer_median_upvotes))

    avg_comments = sum(m.num_comments or 0 for m in mentions) / len(mentions)
    peer_median_comments = baselines.get("median_reddit_comments", 1.0)
    comment_depth = min(3.0, avg_comments / max(1.0, peer_median_comments))

    result = _weighted_sub([
        (mention_velocity, settings.ops_cb_mention_velocity_subweight),
        (upvote_quality,   settings.ops_cb_upvote_quality_subweight),
        (comment_depth,    settings.ops_cb_comment_depth_subweight),
    ])

    return min(3.0, result) if result is not None else None


# ── Component 6: Demo Conversion ──────────────────────────────────

def _compute_demo_conversion(
    db, game: Game, snapshot: GameSnapshot, baselines: dict,
) -> Optional[float]:
    """Demo Conversion: only activates for games with demo data (weight 0.07).

    Measures demo traction relative to peers -- games where demo interest
    translated to genuine pre-launch buzz.
    Returns NULL for games without demos (redistributed to other components).
    """
    if not game.has_demo:
        return None

    demo_review_count = snapshot.demo_review_count
    if demo_review_count is None or demo_review_count < 5:
        return None

    peer_median_demo = baselines.get("median_demo_reviews", 10.0)
    conversion_signal = demo_review_count / max(5.0, peer_median_demo)
    return min(2.5, conversion_signal)


# ── Component 7: Discount-Adjusted Demand ─────────────────────────

def _compute_discount_adjusted_demand(
    db, game: Game, baselines: dict, days_since_launch: int,
) -> Optional[float]:
    """Discount-Adjusted Demand: velocity dampened by current discount level (weight 0.12).

    Dampening: 0% discount->1.00, <=25%->0.90, <=50%->0.75, >50%->0.60
    Uses original_price_usd from v6 schema (added by database.py migration).
    """
    current_price = game.price_usd
    original_price = game.original_price_usd

    if current_price is None or current_price <= 0:
        discount_pct = 0.0  # free game -- no discount concept
    elif original_price and original_price > 0 and original_price > current_price:
        discount_pct = 1.0 - (current_price / original_price)
    else:
        discount_pct = 0.0

    if discount_pct <= 0:
        dampening = 1.00
    elif discount_pct <= 0.25:
        dampening = 0.90
    elif discount_pct <= 0.50:
        dampening = 0.75
    else:
        dampening = 0.60

    today = date.today()
    current_vel = _compute_current_velocity(db, game.appid, today)
    expected_vel = _expected_velocity_at_age(days_since_launch)

    if current_vel is None or expected_vel <= 0:
        return None

    velocity_ratio = min(5.0, current_vel / expected_vel)
    return min(3.0, velocity_ratio * dampening)


# ── Time-aware coverage penalty ───────────────────────────────────

def _time_aware_coverage_penalty(
    days_since_launch: int, active_count: int, has_demo: bool,
) -> float:
    """Age-bucketed coverage penalty.

    Early (1-7d): neutral -- missing social data is expected for new games.
    Mid (8-30d): 0.90 per missing expected component.
    Mature (31-90d): 0.80 per missing expected component.
    """
    if days_since_launch <= 7:
        age_bucket = "early"
    elif days_since_launch <= 30:
        age_bucket = "mid"
    else:
        age_bucket = "mature"

    expected = _AGE_BUCKET_EXPECTED[age_bucket]
    # Demo Conversion only expected for mature games with demos
    if age_bucket == "mature" and not has_demo:
        expected = 6

    missing = max(0, expected - active_count)
    penalty_rate = _AGE_BUCKET_PENALTY_PER_MISSING[age_bucket]

    if penalty_rate == 0.0:
        return 1.0

    return (1.0 - penalty_rate) ** missing


# ── Calibration constant ──────────────────────────────────────────

def _compute_calibration_constant(raw_ops_values: list) -> float:
    """Compute calibration constant so P95 game scores approximately 85.

    Uses raw_ops values from the current two-pass run.
    Bounds: [ops_calibration_min, ops_calibration_max].
    """
    if not raw_ops_values:
        return settings.ops_calibration_default

    sorted_vals = sorted(raw_ops_values, reverse=True)
    n = len(sorted_vals)
    p95_idx = max(0, int(n * 0.05))
    p95_val = sorted_vals[min(p95_idx, n - 1)]

    if p95_val <= 0:
        return settings.ops_calibration_default

    raw_constant = settings.ops_calibration_p95_target / p95_val
    return max(settings.ops_calibration_min, min(settings.ops_calibration_max, raw_constant))


# ── Weighted sum with NULL redistribution ─────────────────────────

def _compute_raw_ops(components: dict) -> float:
    """Weighted sum of components, redistributing weight from NULL components."""
    active = {k: (v, w) for k, (v, w) in components.items() if v is not None}
    if not active:
        return 0.0
    total_weight = sum(w for _, w in active.values())
    if total_weight <= 0:
        return 0.0
    return sum(v * (w / total_weight) for v, w in active.values())


# ── EWLR forecast (carried from v5) ──────────────────────────────

def _predict_ops_7d(db, appid: int) -> tuple:
    """Exponentially Weighted Linear Regression 7-day OPS forecast.

    lambda=0.15. Requires >=4 data points.
    Returns (forecast_7d, confidence) or (None, None).
    """
    LAMBDA = 0.15
    MIN_POINTS = 4

    scores = (
        db.query(OpsScore.score_date, OpsScore.score)
        .filter(OpsScore.appid == appid, OpsScore.score.isnot(None))
        .order_by(OpsScore.score_date.asc())
        .all()
    )

    if len(scores) < MIN_POINTS:
        return None, None

    base_date = scores[0][0]
    xs = [(s[0] - base_date).days for s in scores]
    ys = [s[1] for s in scores]
    n = len(xs)

    weights = [math.exp(-LAMBDA * (n - 1 - i)) for i in range(n)]
    W = sum(weights)
    Wx = sum(w * x for w, x in zip(weights, xs))
    Wy = sum(w * y for w, y in zip(weights, ys))
    Wxx = sum(w * x * x for w, x in zip(weights, xs))
    Wxy = sum(w * x * y for w, x, y in zip(weights, xs, ys))

    denom = W * Wxx - Wx * Wx
    if abs(denom) < 1e-9:
        return None, None

    slope = (W * Wxy - Wx * Wy) / denom
    intercept = (Wy - slope * Wx) / W

    future_x = xs[-1] + 7
    forecast = max(0.0, min(100.0, intercept + slope * future_x))

    if n >= 7:
        y_hat = [intercept + slope * x for x in xs]
        variance = sum(w * (y - yh) ** 2 for w, y, yh in zip(weights, ys, y_hat)) / W
        confidence = "high" if variance < 25 else "medium"
    else:
        confidence = "low"

    return round(forecast, 1), confidence


# ── Single-game raw OPS (pass 1) ─────────────────────────────────

def _compute_raw_ops_for_game(
    db, game: Game, snapshot: GameSnapshot, baselines: dict,
) -> Optional[dict]:
    """Compute all v6 components and raw_ops for one game (pass 1 of 2).

    Returns a dict with raw_ops and all component values.
    Final calibrated score is applied in pass 2.
    """
    today = date.today()
    days_since_launch = (today - game.release_date).days if game.release_date else 0

    # ── 7 components ──────────────────────────────────────────────
    review_momentum = _compute_review_momentum(
        db, game, snapshot, baselines, days_since_launch
    )
    sentiment = _compute_sentiment_v6(db, game, snapshot)
    youtube_signal = _compute_youtube_signal_v6(db, game.appid)
    live_engagement = _compute_live_engagement(db, game, baselines, days_since_launch)
    community_buzz = _compute_community_buzz(db, game.appid, baselines)
    demo_conversion = _compute_demo_conversion(db, game, snapshot, baselines)
    discount_demand = _compute_discount_adjusted_demand(db, game, baselines, days_since_launch)

    components = {
        "review_momentum": (review_momentum,  settings.ops_review_momentum_weight),
        "sentiment":       (sentiment,         settings.ops_sentiment_weight),
        "youtube":         (youtube_signal,    settings.ops_youtube_weight),
        "live_engagement": (live_engagement,   settings.ops_live_engagement_weight),
        "community_buzz":  (community_buzz,    settings.ops_community_buzz_weight),
        "demo_conversion": (demo_conversion,   settings.ops_demo_conversion_weight),
        "discount_demand": (discount_demand,   settings.ops_discount_demand_weight),
    }

    raw_ops = _compute_raw_ops(components)
    active_count = sum(1 for _, (v, _) in components.items() if v is not None)

    def _r(val):
        return round(val, 3) if val is not None else None

    return {
        "appid": game.appid,
        "days_since_launch": days_since_launch,
        "has_demo": bool(game.has_demo),
        "raw_ops": raw_ops,
        "active_count": active_count,
        "review_momentum_component": _r(review_momentum),
        "sentiment_component":       _r(sentiment),
        "youtube_component":         _r(youtube_signal),
        "live_engagement_component": _r(live_engagement),
        "community_buzz_component":  _r(community_buzz),
        "demo_conversion_component": _r(demo_conversion),
        "discount_demand_component": _r(discount_demand),
        # Legacy v5 fields kept NULL in v6 for schema compatibility
        "review_component":    None,
        "velocity_component":  None,
        "decay_component":     None,
        "ccu_component":       None,
        "twitch_component":    None,
        "youtube_breadth":     0.0,
        "wishlist_bonus":      0.0,
        "price_modifier":      round(_get_price_modifier(game.price_usd), 2),
    }


# ── Main calculation ──────────────────────────────────────────────

async def run_ops_calculation():
    """Calculate OPS v6 scores for all active horror games.

    Two-pass approach:
    Pass 1: Compute raw_ops for all games + collect active component counts.
    Pass 2: Compute calibration constant from P95, apply coverage penalty,
            finalize scores, and persist to ops_scores.
    """
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

        # ── Pass 1: compute raw_ops for all games ──────────────────
        pass1_results: list = []
        pass1_pairs: list = []  # (game, snapshot) tuples

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
                    baselines["median_reviews"] = max(baselines["median_reviews"], 30.0)
                    if not baselines["median_ccu"]:
                        baselines["median_ccu"] = 5.0
                    if baselines["median_velocity"] is None:
                        baselines["median_velocity"] = 3.0

                result = _compute_raw_ops_for_game(db, game, snapshot, baselines)
                if result is None:
                    continue

                pass1_results.append(result)
                pass1_pairs.append((game, snapshot))

            except Exception as e:
                logger.error(f"OPS pass 1 error for AppID {game.appid}: {e}")
                failed += 1

        # ── Compute calibration constant from this run's P95 ───────
        raw_ops_values = [r["raw_ops"] for r in pass1_results if r["raw_ops"] > 0]
        calibration_constant = _compute_calibration_constant(raw_ops_values)
        logger.info(
            f"OPS v6 calibration: {len(raw_ops_values)} games scored, "
            f"constant={calibration_constant:.3f} "
            f"(P95 target={settings.ops_calibration_p95_target})"
        )

        # ── Pass 2: apply calibration, coverage penalty, persist ───
        for result, (game, snapshot) in zip(pass1_results, pass1_pairs):
            try:
                days_since_launch = result["days_since_launch"]
                raw_ops = result["raw_ops"]
                active_count = result["active_count"]
                has_demo = result["has_demo"]

                # Time-aware coverage penalty
                coverage_penalty = _time_aware_coverage_penalty(
                    days_since_launch, active_count, has_demo
                )

                # Next Fest multiplier (carried from v5): 1.10x for first 30 days
                next_fest_multiplier = 1.10 if (
                    getattr(game, "next_fest", False) and days_since_launch <= 30
                ) else 1.00

                score = min(
                    100.0,
                    raw_ops * calibration_constant * coverage_penalty * next_fest_multiplier
                )

                # Confidence
                if days_since_launch < 3:
                    confidence = "low"
                elif active_count <= 2:
                    confidence = "medium"
                else:
                    confidence = "high"

                # 7-day EWLR forecast
                forecast_7d, forecast_confidence = _predict_ops_7d(db, game.appid)

                score_data = {
                    "appid":          result["appid"],
                    "score_date":     today,
                    "score":          round(score, 1),
                    "confidence":     confidence,
                    "raw_ops":        round(raw_ops, 4),
                    "calibration_constant": round(calibration_constant, 3),
                    "formula_version": "v6.0",
                    # v6 components
                    "review_momentum_component": result["review_momentum_component"],
                    "sentiment_component":       result["sentiment_component"],
                    "youtube_component":         result["youtube_component"],
                    "live_engagement_component": result["live_engagement_component"],
                    "community_buzz_component":  result["community_buzz_component"],
                    "demo_conversion_component": result["demo_conversion_component"],
                    "discount_demand_component": result["discount_demand_component"],
                    # Legacy v5 fields (NULL in v6)
                    "review_component":           result["review_component"],
                    "velocity_component":         result["velocity_component"],
                    "decay_component":            result["decay_component"],
                    "ccu_component":              result["ccu_component"],
                    "twitch_component":           result["twitch_component"],
                    "youtube_breadth":            result["youtube_breadth"],
                    "wishlist_bonus":             result["wishlist_bonus"],
                    "price_modifier":             result["price_modifier"],
                    "creator_response_component": None,
                    "forecast_7d":               forecast_7d,
                    "forecast_confidence":        forecast_confidence,
                }

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
                logger.error(f"OPS pass 2 error for AppID {game.appid}: {e}")
                db.rollback()
                failed += 1

        run.status = "success" if failed == 0 else "partial"
        run.items_processed = processed
        run.items_failed = failed
        run.finished_at = datetime.now(timezone.utc)
        db.commit()

        logger.info(
            f"OPS v6 complete: {processed} scored, {failed} failed, "
            f"calibration_constant={calibration_constant:.3f}"
        )

    except Exception as e:
        run.status = "failed"
        run.error_message = str(e)
        run.finished_at = datetime.now(timezone.utc)
        db.commit()
        logger.exception("OPS calculation failed")
    finally:
        db.close()
