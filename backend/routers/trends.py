"""Trends endpoint — market intelligence dashboard.

Single GET /trends returns all aggregated data for the Trends page:
market pulse, subgenre momentum, price analysis, demo impact, surging games.
"""
from __future__ import annotations

import json
import statistics
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import get_db
from models import Game, GameSnapshot, OpsScore, YoutubeVideo
from routers.insights import HORROR_SUBGENRES, _extract_genre
from schemas import (
    TrendsDemoCohort,
    TrendsHeadline,
    TrendsPriceBucket,
    TrendsResponse,
    TrendsSubgenre,
    TrendsSurger,
    TrendsWeekPoint,
    TrendsYoutubeGame,
)

router = APIRouter(tags=["trends"])


def _median(vals: list[float]) -> float:
    if not vals:
        return 0.0
    return statistics.median(vals)


def _price_bucket(price: float | None) -> tuple[str, str, int]:
    """Return (label, range_label, sort_order) for a price."""
    if price is None or price == 0:
        return ("Free", "$0", 0)
    if price < 5:
        return ("Budget", "$1–5", 1)
    if price < 10:
        return ("Mid", "$5–10", 2)
    if price < 20:
        return ("Standard", "$10–20", 3)
    return ("Premium", "$20+", 4)


@router.get("/trends", response_model=TrendsResponse)
def get_trends(db: Session = Depends(get_db)):
    today = date.today()

    # ── Shared subqueries (compute once) ──────────────────────────

    latest_snap_sq = (
        db.query(
            GameSnapshot.appid,
            func.max(GameSnapshot.snapshot_date).label("max_date"),
        )
        .group_by(GameSnapshot.appid)
        .subquery()
    )

    latest_ops_sq = (
        db.query(
            OpsScore.appid,
            func.max(OpsScore.score_date).label("max_date"),
        )
        .group_by(OpsScore.appid)
        .subquery()
    )

    # All horror games with latest snapshot + OPS
    rows = (
        db.query(Game, GameSnapshot, OpsScore)
        .filter(Game.is_horror == True)
        .outerjoin(latest_snap_sq, Game.appid == latest_snap_sq.c.appid)
        .outerjoin(
            GameSnapshot,
            (GameSnapshot.appid == Game.appid)
            & (GameSnapshot.snapshot_date == latest_snap_sq.c.max_date),
        )
        .outerjoin(latest_ops_sq, Game.appid == latest_ops_sq.c.appid)
        .outerjoin(
            OpsScore,
            (OpsScore.appid == Game.appid)
            & (OpsScore.score_date == latest_ops_sq.c.max_date),
        )
        .all()
    )

    # Unpack for easy access
    games_data: list[tuple[Game, GameSnapshot | None, OpsScore | None]] = rows

    # ── F: Headline stats ─────────────────────────────────────────

    total_games = len(games_data)
    cutoff_30d = today - timedelta(days=30)
    new_last_30d = sum(
        1 for g, _, _ in games_data
        if g.release_date and g.release_date >= cutoff_30d
    )

    review_counts = [s.review_count for _, s, _ in games_data if s and s.review_count]
    sentiments = [s.review_score_pct for _, s, _ in games_data if s and s.review_score_pct]
    ops_scores_list = [o.score for _, _, o in games_data if o and o.score is not None]

    breakout_count = sum(1 for x in ops_scores_list if x >= 60)
    demo_count = sum(1 for g, _, _ in games_data if g.has_demo)

    yt_videos = db.query(func.count(YoutubeVideo.id)).filter(
        YoutubeVideo.matched_appid.isnot(None)
    ).scalar() or 0
    yt_channels = db.query(func.count(func.distinct(YoutubeVideo.channel_id))).filter(
        YoutubeVideo.matched_appid.isnot(None)
    ).scalar() or 0

    headline = TrendsHeadline(
        total_games=total_games,
        new_last_30d=new_last_30d,
        total_reviews=sum(review_counts),
        avg_sentiment=round(statistics.mean(sentiments), 1) if sentiments else 0,
        breakout_count=breakout_count,
        yt_videos_tracked=yt_videos,
        yt_channels_covering=yt_channels,
        demo_pct=round(demo_count / total_games * 100, 1) if total_games else 0,
    )

    # ── A: Market Pulse (12-week time-series) ─────────────────────

    twelve_weeks_ago = today - timedelta(weeks=12)

    # Per-game weekly review deltas via grouped query
    week_review_data = (
        db.query(
            GameSnapshot.appid,
            func.strftime("%Y-%W", GameSnapshot.snapshot_date).label("week"),
            func.max(GameSnapshot.review_count).label("max_rev"),
            func.min(GameSnapshot.review_count).label("min_rev"),
        )
        .filter(
            GameSnapshot.snapshot_date >= twelve_weeks_ago,
            GameSnapshot.review_count.isnot(None),
        )
        .group_by(GameSnapshot.appid, "week")
        .all()
    )

    # Aggregate per week
    week_reviews: dict[str, int] = defaultdict(int)
    week_games: dict[str, set] = defaultdict(set)
    for appid, week, max_rev, min_rev in week_review_data:
        delta = (max_rev or 0) - (min_rev or 0)
        if delta > 0:
            week_reviews[week] += delta
        week_games[week].add(appid)

    # OPS averages per week
    week_ops_data = (
        db.query(
            func.strftime("%Y-%W", OpsScore.score_date).label("week"),
            func.avg(OpsScore.score),
        )
        .filter(OpsScore.score_date >= twelve_weeks_ago, OpsScore.score.isnot(None))
        .group_by("week")
        .all()
    )
    week_avg_ops = {w: round(avg, 1) for w, avg in week_ops_data if avg}

    # New releases per week
    week_releases_data = (
        db.query(
            func.strftime("%Y-%W", Game.release_date).label("week"),
            func.count(Game.appid),
        )
        .filter(Game.release_date >= twelve_weeks_ago, Game.is_horror == True)
        .group_by("week")
        .all()
    )
    week_releases = {w: c for w, c in week_releases_data}

    # Build 12 week points
    # SQLite strftime('%Y-%W') produces e.g. "2026-13" (no W prefix, week number)
    market_pulse: list[TrendsWeekPoint] = []
    for i in range(12):
        week_start = today - timedelta(weeks=12 - i)
        monday = week_start - timedelta(days=week_start.weekday())
        # Match SQLite's strftime('%Y-%W') format exactly
        sqlite_week = monday.strftime("%Y-%W")
        week_label = monday.strftime("%b %d")

        market_pulse.append(TrendsWeekPoint(
            week_label=week_label,
            week_iso=sqlite_week,
            active_games=len(week_games.get(sqlite_week, set())),
            total_new_reviews=week_reviews.get(sqlite_week, 0),
            avg_ops=week_avg_ops.get(sqlite_week),
            new_releases=week_releases.get(sqlite_week, 0),
        ))

    # Market narrative
    if len(market_pulse) >= 5:
        recent = sum(p.total_new_reviews for p in market_pulse[-4:])
        earlier = sum(p.total_new_reviews for p in market_pulse[-8:-4])
        if earlier > 0:
            pct_change = round((recent - earlier) / earlier * 100)
            direction = "UP" if pct_change > 0 else "DOWN"
            market_narrative = (
                f"Review velocity {direction} {abs(pct_change)}% vs 4 weeks ago. "
                f"{new_last_30d} new games entered the market in the past 30 days."
            )
        else:
            market_narrative = f"{new_last_30d} new games entered the market in the past 30 days."
    else:
        market_narrative = ""

    # ── B: Subgenre Momentum ──────────────────────────────────────

    # Group games by subgenre
    subgenre_groups: dict[str, list[tuple[Game, GameSnapshot | None, OpsScore | None]]] = defaultdict(list)
    for g, s, o in games_data:
        sg = _extract_genre(g.tags)
        subgenre_groups[sg].append((g, s, o))

    # Get OPS from 28 days ago for momentum delta
    target_28d = today - timedelta(days=28)
    ops_28d_data = (
        db.query(OpsScore.appid, OpsScore.score)
        .filter(
            OpsScore.score_date <= target_28d,
            OpsScore.score_date >= target_28d - timedelta(days=3),  # 3-day window
            OpsScore.score.isnot(None),
        )
        .order_by(OpsScore.score_date.desc())
        .all()
    )
    # Keep latest per appid
    ops_28d_map: dict[int, float] = {}
    for appid, score in ops_28d_data:
        if appid not in ops_28d_map:
            ops_28d_map[appid] = score

    subgenres: list[TrendsSubgenre] = []
    for sg_name, group in subgenre_groups.items():
        if len(group) < 2:
            continue
        sg_ops = [o.score for _, _, o in group if o and o.score is not None]
        sg_scores = [s.review_score_pct for _, s, _ in group if s and s.review_score_pct]
        sg_revs = [float(s.review_count) for _, s, _ in group if s and s.review_count]

        avg_ops_now = statistics.mean(sg_ops) if sg_ops else None
        # Momentum: avg OPS now vs avg OPS 28 days ago
        sg_ops_28d = [ops_28d_map[g.appid] for g, _, _ in group if g.appid in ops_28d_map]
        avg_ops_28d = statistics.mean(sg_ops_28d) if sg_ops_28d else None

        ops_delta = None
        if avg_ops_now is not None and avg_ops_28d is not None:
            ops_delta = round(avg_ops_now - avg_ops_28d, 1)

        # Top mover: highest current OPS in this subgenre
        top_mover = max(
            ((g, o) for g, _, o in group if o and o.score is not None),
            key=lambda x: x[1].score,
            default=(None, None),
        )

        subgenres.append(TrendsSubgenre(
            name=sg_name,
            game_count=len(group),
            avg_ops=round(avg_ops_now, 1) if avg_ops_now else None,
            avg_review_score=round(statistics.mean(sg_scores), 1) if sg_scores else None,
            avg_review_count=round(statistics.mean(sg_revs), 0) if sg_revs else None,
            ops_delta_4w=ops_delta,
            top_mover_title=top_mover[0].title if top_mover[0] else None,
            top_mover_appid=top_mover[0].appid if top_mover[0] else None,
        ))

    subgenres.sort(key=lambda x: x.ops_delta_4w or 0, reverse=True)

    # Subgenre narrative
    if subgenres:
        top = subgenres[0]
        bottom = subgenres[-1]
        parts = []
        if top.ops_delta_4w and top.ops_delta_4w > 0:
            parts.append(f"{top.name} surging (+{top.ops_delta_4w} OPS)")
        if bottom.ops_delta_4w and bottom.ops_delta_4w < 0:
            parts.append(f"{bottom.name} fading ({bottom.ops_delta_4w} OPS)")
        subgenre_narrative = ", while ".join(parts) + "." if parts else ""
    else:
        subgenre_narrative = ""

    # ── C: Price Buckets ──────────────────────────────────────────

    bucket_groups: dict[str, dict] = {}
    for g, s, o in games_data:
        label, range_label, order = _price_bucket(g.price_usd)
        if label not in bucket_groups:
            bucket_groups[label] = {
                "range_label": range_label, "order": order,
                "reviews": [], "sentiments": [], "ops": [], "demos": 0, "count": 0,
            }
        b = bucket_groups[label]
        b["count"] += 1
        if s and s.review_count:
            b["reviews"].append(float(s.review_count))
        if s and s.review_score_pct:
            b["sentiments"].append(s.review_score_pct)
        if o and o.score is not None:
            b["ops"].append(o.score)
        if g.has_demo:
            b["demos"] += 1

    price_buckets: list[TrendsPriceBucket] = []
    for label, b in sorted(bucket_groups.items(), key=lambda x: x[1]["order"]):
        price_buckets.append(TrendsPriceBucket(
            label=label,
            range_label=b["range_label"],
            game_count=b["count"],
            median_reviews=round(_median(b["reviews"])),
            median_sentiment=round(_median(b["sentiments"]), 1),
            avg_ops=round(statistics.mean(b["ops"]), 1) if b["ops"] else None,
            demo_pct=round(b["demos"] / b["count"] * 100, 1) if b["count"] else 0,
        ))

    # ── D: Demo Impact ────────────────────────────────────────────

    demo_yes = {"reviews": [], "sentiments": [], "ops": [], "ccus": [], "count": 0}
    demo_no = {"reviews": [], "sentiments": [], "ops": [], "ccus": [], "count": 0}

    for g, s, o in games_data:
        bucket = demo_yes if g.has_demo else demo_no
        bucket["count"] += 1
        if s and s.review_count:
            bucket["reviews"].append(float(s.review_count))
        if s and s.review_score_pct:
            bucket["sentiments"].append(s.review_score_pct)
        if o and o.score is not None:
            bucket["ops"].append(o.score)
        if s and s.peak_ccu:
            bucket["ccus"].append(float(s.peak_ccu))

    demo_cohorts = []
    for label, d in [("With Demo", demo_yes), ("Without Demo", demo_no)]:
        demo_cohorts.append(TrendsDemoCohort(
            label=label,
            game_count=d["count"],
            median_reviews=round(_median(d["reviews"])),
            median_sentiment=round(_median(d["sentiments"]), 1),
            avg_ops=round(statistics.mean(d["ops"]), 1) if d["ops"] else None,
            median_peak_ccu=round(_median(d["ccus"])),
        ))

    # Price/demo narrative
    best_bucket = max(price_buckets, key=lambda b: b.avg_ops or 0) if price_buckets else None
    demo_lift = ""
    if demo_cohorts[0].median_reviews and demo_cohorts[1].median_reviews and demo_cohorts[1].median_reviews > 0:
        ratio = demo_cohorts[0].median_reviews / demo_cohorts[1].median_reviews
        if ratio > 1:
            demo_lift = f"Games with demos collect {ratio:.1f}x more reviews."
    price_narrative = ""
    if best_bucket:
        price_narrative = f"{best_bucket.label} ({best_bucket.range_label}) games lead in OPS."
        if demo_lift:
            price_narrative += f" {demo_lift}"

    # ── E: Surging Games ──────────────────────────────────────────

    # Get OPS 14 days ago for each game
    target_14d = today - timedelta(days=14)
    ops_14d_data = (
        db.query(OpsScore.appid, OpsScore.score)
        .filter(
            OpsScore.score_date <= target_14d,
            OpsScore.score_date >= target_14d - timedelta(days=3),
            OpsScore.score.isnot(None),
        )
        .order_by(OpsScore.score_date.desc())
        .all()
    )
    ops_14d_map: dict[int, float] = {}
    for appid, score in ops_14d_data:
        if appid not in ops_14d_map:
            ops_14d_map[appid] = score

    # Get review count 7 days ago for each game
    target_7d = today - timedelta(days=7)
    snap_7d_data = (
        db.query(GameSnapshot.appid, GameSnapshot.review_count)
        .filter(
            GameSnapshot.snapshot_date <= target_7d,
            GameSnapshot.snapshot_date >= target_7d - timedelta(days=3),
            GameSnapshot.review_count.isnot(None),
        )
        .order_by(GameSnapshot.snapshot_date.desc())
        .all()
    )
    snap_7d_map: dict[int, int] = {}
    for appid, rc in snap_7d_data:
        if appid not in snap_7d_map:
            snap_7d_map[appid] = rc

    # Compute 4-week velocity sparks in bulk
    # Fetch snapshots at week boundaries for all games
    offsets = [28, 21, 14, 7, 0]
    snap_at_offset: dict[int, dict[int, int]] = defaultdict(dict)  # appid -> {offset: review_count}
    for off in offsets:
        target = today - timedelta(days=off)
        snap_data = (
            db.query(GameSnapshot.appid, GameSnapshot.review_count)
            .filter(
                GameSnapshot.snapshot_date <= target,
                GameSnapshot.snapshot_date >= target - timedelta(days=3),
                GameSnapshot.review_count.isnot(None),
            )
            .order_by(GameSnapshot.snapshot_date.desc())
            .all()
        )
        seen = set()
        for appid, rc in snap_data:
            if appid not in seen:
                snap_at_offset[appid][off] = rc
                seen.add(appid)

    # Score and rank games
    surger_candidates = []
    for g, s, o in games_data:
        if not o or o.score is None:
            continue
        ops_prev = ops_14d_map.get(g.appid)
        ops_delta = round(o.score - ops_prev, 1) if ops_prev is not None else None

        rev_now = s.review_count if s and s.review_count else 0
        rev_7d = snap_7d_map.get(g.appid, rev_now)
        rev_delta = rev_now - rev_7d

        # Build velocity spark
        offsets_for_spark = snap_at_offset.get(g.appid, {})
        spark = []
        for i in range(4):
            older = offsets_for_spark.get(offsets[i])
            newer = offsets_for_spark.get(offsets[i + 1])
            if older is not None and newer is not None:
                spark.append(newer - older)
            else:
                spark.append(0)

        surger_candidates.append((g, s, o, ops_delta, rev_delta, spark))

    # Sort by OPS delta (or by absolute OPS if delta unavailable)
    surger_candidates.sort(
        key=lambda x: (x[3] if x[3] is not None else -999, x[2].score or 0),
        reverse=True,
    )

    surgers: list[TrendsSurger] = []
    for g, s, o, ops_delta, rev_delta, spark in surger_candidates[:10]:
        surgers.append(TrendsSurger(
            appid=g.appid,
            title=g.title,
            developer=g.developer,
            header_image_url=g.header_image_url,
            subgenre=_extract_genre(g.tags),
            price=g.price_usd,
            has_demo=g.has_demo,
            ops_score=o.score,
            ops_prev=ops_14d_map.get(g.appid),
            ops_delta=ops_delta,
            review_count=s.review_count if s and s.review_count else 0,
            review_delta_7d=rev_delta,
            review_score_pct=s.review_score_pct if s and s.review_score_pct else 0,
            velocity_spark=spark,
        ))

    # ── G: YouTube Top ────────────────────────────────────────────

    yt_data = (
        db.query(
            YoutubeVideo.matched_appid,
            func.sum(YoutubeVideo.view_count).label("total_views"),
            func.count(func.distinct(YoutubeVideo.channel_id)).label("channels"),
        )
        .filter(YoutubeVideo.matched_appid.isnot(None))
        .group_by(YoutubeVideo.matched_appid)
        .order_by(func.sum(YoutubeVideo.view_count).desc())
        .limit(5)
        .all()
    )

    game_map = {g.appid: g for g, _, _ in games_data}
    youtube_top: list[TrendsYoutubeGame] = []
    for appid, total_views, channels in yt_data:
        g = game_map.get(appid)
        if g:
            youtube_top.append(TrendsYoutubeGame(
                appid=appid,
                title=g.title,
                total_views=total_views or 0,
                unique_channels=channels or 0,
                header_image_url=g.header_image_url,
            ))

    # ── Assemble response ─────────────────────────────────────────

    return TrendsResponse(
        headline=headline,
        market_pulse=market_pulse,
        market_narrative=market_narrative,
        subgenres=subgenres,
        subgenre_narrative=subgenre_narrative,
        price_buckets=price_buckets,
        demo_cohorts=demo_cohorts,
        price_narrative=price_narrative,
        surgers=surgers,
        youtube_top=youtube_top,
        generated_at=datetime.now(timezone.utc),
    )
