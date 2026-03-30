from __future__ import annotations

import json
import math
from collections import defaultdict
from datetime import date, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import get_db
from models import Game, GameSnapshot, OpsScore, YoutubeChannel, YoutubeVideo
from schemas import (
    InsightGame, InsightPastGem, InsightSignal, InsightSubGenre, InsightsResponse,
)

router = APIRouter(tags=["insights"])

HORROR_SUBGENRES = [
    "Psychological Horror", "Survival Horror", "Lovecraftian",
    "Zombies", "Supernatural", "Dark Comedy", "Gore", "Horror",
]


def _extract_genre(tags_json: str | None) -> str:
    if not tags_json:
        return "Horror"
    try:
        tags = json.loads(tags_json)
        if isinstance(tags, dict):
            tag_names = list(tags.keys())
        elif isinstance(tags, list):
            tag_names = tags
        else:
            return "Horror"
        for sg in HORROR_SUBGENRES:
            if sg in tag_names:
                return sg
        return "Horror"
    except Exception:
        return "Horror"


def _build_signals(
    yt_channels: int, review_score_pct: float, review_count: int,
    days_out: int, ops_score: float | None, peak_ccu: int | None,
    has_demo: bool = False, demo_review_count: int | None = None,
) -> list[InsightSignal]:
    signals: list[InsightSignal] = []
    if yt_channels == 0:
        signals.append(InsightSignal(label="Creator coverage", value="0 channels", detail="completely under radar"))
    if review_score_pct > 90 and review_count >= 10:
        signals.append(InsightSignal(label="Review quality", value=f"{review_score_pct:.0f}%", detail="exceptional sentiment"))
    elif review_score_pct > 90 and review_count < 10 and review_count > 0:
        signals.append(InsightSignal(label="Early signal", value=f"{review_count} reviews", detail=f"{review_score_pct:.0f}% positive"))
    if has_demo and demo_review_count and demo_review_count > 50:
        signals.append(InsightSignal(
            label="Demo buzz",
            value=f"{demo_review_count} demo reviews",
            detail="high demo engagement",
        ))
    elif has_demo and (not demo_review_count or demo_review_count == 0):
        signals.append(InsightSignal(label="Demo available", value="Free trial", detail="playable demo on Steam"))
    if days_out <= 5:
        signals.append(InsightSignal(label="Just launched", value=f"{days_out}d ago", detail="early discovery window"))
    if ops_score and ops_score > 60:
        signals.append(InsightSignal(label="OPS breakout", value=f"Score {ops_score:.0f}", detail="outperforming genre median"))
    if peak_ccu and peak_ccu > 50:
        signals.append(InsightSignal(label="Player activity", value=f"{peak_ccu} peak CCU", detail="active playerbase"))
    return signals[:3]


def _dominant_signal(
    yt_channels: int, quality: float, ops_score: float | None,
    review_count: int, review_score_pct: float, days_out: int,
    demo_review_count: int | None = None,
) -> str:
    if demo_review_count and demo_review_count > 200:
        return f"Demo generating buzz: {demo_review_count} demo reviews"
    if yt_channels == 0 and quality > 80:
        return "High quality with zero creator visibility"
    if ops_score and ops_score > 60:
        return f"OPS breakout score: {ops_score:.0f}"
    if review_count > 200:
        return f"{review_count} reviews in {days_out} days"
    if review_count > 0:
        return f"{review_score_pct:.0f}% positive from {review_count} reviews"
    return "Newly tracked — awaiting data"


@router.get("/insights", response_model=InsightsResponse)
def get_insights(db: Session = Depends(get_db)):
    today = date.today()

    # ── Fetch all horror games ──
    games = db.query(Game).filter(Game.is_horror == True).all()
    if not games:
        return InsightsResponse()

    appids = [g.appid for g in games]

    # Latest snapshot per game
    latest_date_sq = (
        db.query(GameSnapshot.appid, func.max(GameSnapshot.snapshot_date).label("max_date"))
        .group_by(GameSnapshot.appid)
        .subquery()
    )
    snap_rows = (
        db.query(GameSnapshot)
        .join(latest_date_sq,
              (GameSnapshot.appid == latest_date_sq.c.appid)
              & (GameSnapshot.snapshot_date == latest_date_sq.c.max_date))
        .all()
    )
    snaps = {s.appid: s for s in snap_rows}

    # Latest OPS per game
    latest_ops_sq = (
        db.query(OpsScore.appid, func.max(OpsScore.score_date).label("max_date"))
        .group_by(OpsScore.appid)
        .subquery()
    )
    ops_rows = (
        db.query(OpsScore)
        .join(latest_ops_sq,
              (OpsScore.appid == latest_ops_sq.c.appid)
              & (OpsScore.score_date == latest_ops_sq.c.max_date))
        .all()
    )
    ops_map = {o.appid: o for o in ops_rows}

    # YouTube video count + unique channel count per game
    yt_rows = (
        db.query(
            YoutubeVideo.matched_appid,
            func.count(YoutubeVideo.id).label("vid_count"),
            func.count(func.distinct(YoutubeVideo.channel_id)).label("ch_count"),
        )
        .filter(YoutubeVideo.matched_appid.in_(appids))
        .group_by(YoutubeVideo.matched_appid)
        .all()
    )
    yt_vids = {r.matched_appid: r.vid_count for r in yt_rows}
    yt_chs = {r.matched_appid: r.ch_count for r in yt_rows}

    # OPS sparkline (last 7 scores per game)
    sparkline_rows = (
        db.query(OpsScore.appid, OpsScore.score_date, OpsScore.score)
        .filter(OpsScore.appid.in_(appids), OpsScore.score.isnot(None))
        .order_by(OpsScore.appid, OpsScore.score_date.asc())
        .all()
    )
    sparklines: dict[int, list[float]] = defaultdict(list)
    for r in sparkline_rows:
        if len(sparklines[r.appid]) < 7:
            sparklines[r.appid].append(round(r.score, 1))

    # Max review count for visibility normalization
    max_reviews = max((snaps[a].review_count or 0 for a in snaps), default=1) or 1

    # ── Compute InsightGame for each game ──
    insight_games: list[InsightGame] = []

    for g in games:
        snap = snaps.get(g.appid)
        ops = ops_map.get(g.appid)
        review_count = snap.review_count or 0 if snap else 0
        review_score_pct = snap.review_score_pct or 0 if snap else 0
        peak_ccu = snap.peak_ccu if snap else None
        days_out = (today - g.release_date).days if g.release_date else 0
        yt_ch_count = yt_chs.get(g.appid, 0)
        yt_vid_count = yt_vids.get(g.appid, 0)
        ops_score = ops.score if ops else None

        # Visibility: 0-100
        vis_yt = min(60, yt_vid_count * 20)
        vis_rev = min(40, (review_count / max_reviews) * 40) if max_reviews > 0 else 0
        visibility = min(100, vis_yt + vis_rev)

        # Quality: confidence-weighted review score (0-100)
        confidence = min(1.0, review_count / 15) if review_count > 0 else 0
        quality = review_score_pct * confidence

        # Gem score
        age_bonus = 1.4 if days_out <= 3 else 1.2 if days_out <= 7 else 1.1 if days_out <= 14 else 1.0
        inv_vis = max(0, 1 - visibility / 100)
        gem_score = quality * (inv_vis ** 0.6) * age_bonus
        gem_score = min(100, gem_score)

        demo_review_count = snap.demo_review_count if snap else None

        genre = _extract_genre(g.tags)
        signals = _build_signals(
            yt_ch_count, review_score_pct, review_count, days_out, ops_score, peak_ccu,
            has_demo=g.has_demo, demo_review_count=demo_review_count,
        )
        dominant = _dominant_signal(
            yt_ch_count, quality, ops_score, review_count, review_score_pct, days_out,
            demo_review_count=demo_review_count,
        )
        spark = sparklines.get(g.appid, [round(gem_score, 1)])

        ig = InsightGame(
            appid=g.appid,
            title=g.title,
            developer=g.developer,
            header_image_url=g.header_image_url,
            gem_score=round(gem_score, 1),
            review_count=review_count,
            review_score=round(review_score_pct, 1),
            price=g.price_usd,
            days_out=days_out,
            genre=genre,
            visibility=round(visibility, 1),
            quality=round(quality, 1),
            yt_channels=yt_ch_count,
            ops_score=round(ops_score, 1) if ops_score is not None else None,
            has_demo=g.has_demo,
            demo_review_count=snap.demo_review_count if snap else None,
            demo_review_score_pct=round(snap.demo_review_score_pct, 1) if snap and snap.demo_review_score_pct else None,
            signals=signals,
            sparkline=spark,
            dominant_signal=dominant,
        )
        insight_games.append(ig)

    # ── Sort and select ──
    by_gem = sorted(insight_games, key=lambda x: x.gem_score, reverse=True)
    hero = by_gem[0] if by_gem else None
    rising = by_gem[:8]
    blindspot = sorted(
        [g for g in insight_games if g.yt_channels == 0 and g.quality > 70],
        key=lambda x: x.quality, reverse=True,
    )[:5]

    # ── Sub-genre momentum ──
    genre_groups: dict[str, list[InsightGame]] = defaultdict(list)
    for ig in insight_games:
        genre_groups[ig.genre].append(ig)

    sub_genres: list[InsightSubGenre] = []
    for name, members in sorted(genre_groups.items(), key=lambda x: -len(x[1])):
        avg_ops = 0.0
        ops_vals = [m.ops_score for m in members if m.ops_score is not None]
        if ops_vals:
            avg_ops = sum(ops_vals) / len(ops_vals)
        momentum = max(-1.0, min(1.0, (avg_ops - 50) / 50))
        avg_score = sum(m.review_score for m in members) / len(members) if members else 0
        top = max(members, key=lambda x: x.gem_score)
        sub_genres.append(InsightSubGenre(
            name=name,
            momentum=round(momentum, 2),
            game_count=len(members),
            avg_score=round(avg_score, 1),
            top_game=top.title,
        ))

    return InsightsResponse(
        hero_gem=hero,
        scatter_games=insight_games,
        rising_games=rising,
        blindspot_games=blindspot,
        sub_genres=sub_genres,
        gem_history=[],  # Will populate as data accumulates over weeks
    )
