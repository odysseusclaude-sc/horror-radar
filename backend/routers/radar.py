from __future__ import annotations

from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from sqlalchemy import text as sql_text

from database import get_db
from models import Game, GameSnapshot, OpsScore, YoutubeChannel, YoutubeVideo
from schemas import (
    RadarDemo,
    RadarOps,
    RadarOpsComponent,
    RadarOpsHistoryPoint,
    RadarPickResponse,
    RadarPreviousPick,
    RadarVelocitySpark,
    RadarYoutube,
    YoutubeChannelBrief,
)

router = APIRouter(tags=["radar"])

OPS_COMPONENT_META = [
    {
        "key": "velocity",
        "db_field": "velocity_component",
        "label": "VELOCITY",
        "max": 5.0,
        "weight": 0.35,
        "color": "#e8e2d9",
        "desc": "Age-adjusted review velocity vs expected median",
        "formula": "current_velocity / expected_velocity_at_age",
    },
    {
        "key": "decay",
        "db_field": "decay_component",
        "label": "DECAY RETENTION",
        "max": 2.0,
        "weight": 0.20,
        "color": "#f59e0b",
        "desc": "Velocity sustain rate (1.0 = no decay)",
        "formula": "week2_4_velocity / week1_velocity",
    },
    {
        "key": "reviews",
        "db_field": "review_component",
        "label": "REVIEW VOLUME",
        "max": 5.0,
        "weight": 0.15,
        "color": "#c0392b",
        "desc": "Review count vs peer median x price modifier",
        "formula": "(review_count / peer_median) x price_modifier",
    },
    {
        "key": "youtube",
        "db_field": "youtube_component",
        "label": "YOUTUBE ENGAGEMENT",
        "max": 2.0,
        "weight": 0.15,
        "color": "#38bdf8",
        "desc": "Views/subscriber ratio + channel breadth",
        "formula": "0.6 x (best_views_subs_ratio / 0.074) + 0.4 x (channels / 10)",
    },
    {
        "key": "ccu",
        "db_field": "ccu_component",
        "label": "CONCURRENT PLAYERS",
        "max": 5.0,
        "weight": 0.15,
        "color": "#a78bfa",
        "desc": "Peak CCU vs peer median with launch decay",
        "formula": "(peak_ccu / peer_median_ccu) x age_decay",
    },
]


def _nearest_snapshot(
    db: Session, appid: int, target: date, window: int = 3
) -> GameSnapshot | None:
    return (
        db.query(GameSnapshot)
        .filter(
            GameSnapshot.appid == appid,
            GameSnapshot.snapshot_date.between(
                target - timedelta(days=window), target + timedelta(days=window)
            ),
        )
        .order_by(
            func.abs(
                func.julianday(GameSnapshot.snapshot_date) - func.julianday(target)
            )
        )
        .first()
    )


@router.get("/radar-pick", response_model=RadarPickResponse)
def get_radar_pick(db: Session = Depends(get_db)):
    """Return the current top-OPS radar pick with full context."""

    today = date.today()
    min_release = today - timedelta(days=90)
    max_release = today - timedelta(days=7)

    # --- 1. Select the game: top OPS among eligible horror games ---
    latest_ops_sq = (
        db.query(
            OpsScore.appid,
            func.max(OpsScore.score_date).label("max_ops_date"),
        )
        .group_by(OpsScore.appid)
        .subquery()
    )

    row = (
        db.query(Game, OpsScore)
        .join(latest_ops_sq, Game.appid == latest_ops_sq.c.appid)
        .join(
            OpsScore,
            (OpsScore.appid == Game.appid)
            & (OpsScore.score_date == latest_ops_sq.c.max_ops_date),
        )
        .filter(
            Game.is_horror == True,
            Game.release_date >= min_release,
            Game.release_date <= max_release,
        )
        .order_by(OpsScore.score.desc().nullslast())
        .first()
    )

    if not row:
        raise HTTPException(status_code=404, detail="No eligible radar pick found")

    game, latest_ops = row

    # --- 2. Core metrics from latest snapshot ---
    latest_snap = (
        db.query(GameSnapshot)
        .filter_by(appid=game.appid)
        .order_by(GameSnapshot.snapshot_date.desc())
        .first()
    )

    review_count = latest_snap.review_count if latest_snap else None
    sentiment_pct = latest_snap.review_score_pct if latest_snap else None
    peak_ccu = latest_snap.peak_ccu if latest_snap else None
    current_ccu = latest_snap.current_ccu if latest_snap else None

    estimated_owners = None
    if latest_snap and latest_snap.estimated_owners_low is not None and latest_snap.estimated_owners_high is not None:
        estimated_owners = (latest_snap.estimated_owners_low + latest_snap.estimated_owners_high) // 2

    days_since_launch = None
    if game.release_date:
        days_since_launch = (today - game.release_date).days

    # --- 3. Velocity fields ---
    target_7d = today - timedelta(days=7)
    target_14d = today - timedelta(days=14)

    snap_7d = _nearest_snapshot(db, game.appid, target_7d)
    snap_14d = _nearest_snapshot(db, game.appid, target_14d)

    reviews_now = latest_snap.review_count if latest_snap and latest_snap.review_count else 0
    reviews_7d = snap_7d.review_count if snap_7d and snap_7d.review_count else 0
    reviews_14d = snap_14d.review_count if snap_14d and snap_14d.review_count else 0

    velocity_7d = reviews_now - reviews_7d if latest_snap and snap_7d else None
    velocity_prev_7d = reviews_7d - reviews_14d if snap_7d and snap_14d else None
    velocity_per_day = round(velocity_7d / 7.0, 2) if velocity_7d is not None else None

    # --- 4. Velocity spark (4 weekly data points) ---
    velocity_spark: list[RadarVelocitySpark] = []
    offsets = [28, 21, 14, 7, 0]
    week_labels = ["W-4", "W-3", "W-2", "W-1"]
    snap_at_offset: list[GameSnapshot | None] = []
    for off in offsets:
        target_date = today - timedelta(days=off)
        snap_at_offset.append(_nearest_snapshot(db, game.appid, target_date))

    for i in range(4):
        older = snap_at_offset[i]
        newer = snap_at_offset[i + 1]
        if older and newer and older.review_count is not None and newer.review_count is not None:
            delta = newer.review_count - older.review_count
        else:
            delta = 0
        velocity_spark.append(RadarVelocitySpark(label=week_labels[i], value=delta))

    # --- 5. OPS data ---
    ops_14d_ago = (
        db.query(OpsScore)
        .filter(
            OpsScore.appid == game.appid,
            OpsScore.score_date <= today - timedelta(days=14),
        )
        .order_by(OpsScore.score_date.desc())
        .first()
    )

    delta_14d = None
    if ops_14d_ago and latest_ops.score is not None and ops_14d_ago.score is not None:
        delta_14d = round(latest_ops.score - ops_14d_ago.score, 2)

    # Percentile
    total_with_ops = (
        db.query(func.count(func.distinct(OpsScore.appid)))
        .join(latest_ops_sq, (OpsScore.appid == latest_ops_sq.c.appid) & (OpsScore.score_date == latest_ops_sq.c.max_ops_date))
        .filter(OpsScore.score.isnot(None))
        .scalar()
    ) or 1

    lower_count = (
        db.query(func.count(func.distinct(OpsScore.appid)))
        .join(latest_ops_sq, (OpsScore.appid == latest_ops_sq.c.appid) & (OpsScore.score_date == latest_ops_sq.c.max_ops_date))
        .filter(OpsScore.score.isnot(None), OpsScore.score < latest_ops.score)
        .scalar()
    ) or 0

    percentile = round(lower_count / total_with_ops * 100, 1) if total_with_ops > 0 else None

    # Components
    components: list[RadarOpsComponent] = []
    for meta in OPS_COMPONENT_META:
        val = getattr(latest_ops, meta["db_field"], None)
        if val is not None:
            components.append(
                RadarOpsComponent(
                    key=meta["key"],
                    label=meta["label"],
                    value=round(val, 3),
                    max=meta["max"],
                    weight=meta["weight"],
                    color=meta["color"],
                    desc=meta["desc"],
                    formula=meta["formula"],
                )
            )

    ops = RadarOps(
        score=latest_ops.score or 0,
        delta_14d=delta_14d,
        percentile=percentile,
        components=components,
    )

    # --- 6. OPS history ---
    all_ops = (
        db.query(OpsScore)
        .filter_by(appid=game.appid)
        .filter(OpsScore.score.isnot(None))
        .order_by(OpsScore.score_date.asc())
        .all()
    )

    ops_history: list[RadarOpsHistoryPoint] = []
    if game.release_date:
        for o in all_ops:
            day = (o.score_date - game.release_date).days
            ops_history.append(RadarOpsHistoryPoint(day=day, score=o.score))

    # --- 7. YouTube data ---
    yt_rows = (
        db.query(
            YoutubeVideo.matched_appid,
            YoutubeChannel.channel_id,
            YoutubeChannel.name,
            YoutubeChannel.handle,
            YoutubeChannel.subscriber_count,
            func.max(YoutubeVideo.view_count).label("top_views"),
            func.sum(YoutubeVideo.view_count).label("total_views"),
            func.count(YoutubeVideo.id).label("vid_count"),
        )
        .join(YoutubeChannel, YoutubeVideo.channel_id == YoutubeChannel.channel_id)
        .filter(YoutubeVideo.matched_appid == game.appid)
        .group_by(YoutubeChannel.channel_id)
        .order_by(YoutubeChannel.subscriber_count.desc().nullslast())
        .all()
    )

    youtube = None
    if yt_rows:
        total_video_count = sum(r.vid_count for r in yt_rows)
        total_views = sum(r.total_views or 0 for r in yt_rows)
        largest_subs = max((r.subscriber_count or 0) for r in yt_rows)
        channel_briefs = [
            YoutubeChannelBrief(
                channel_id=r.channel_id,
                name=r.name,
                handle=r.handle,
                subscriber_count=r.subscriber_count,
                top_video_views=r.top_views,
            )
            for r in yt_rows[:3]
        ]
        youtube = RadarYoutube(
            video_count=total_video_count,
            largest_subscriber_count=largest_subs if largest_subs > 0 else None,
            total_views=total_views,
            channels=channel_briefs,
        )

    # --- 8. Demo data ---
    demo = None
    if game.has_demo and latest_snap and latest_snap.demo_review_count and latest_snap.demo_review_count > 0:
        demo = RadarDemo(
            review_count=latest_snap.demo_review_count,
            score_pct=latest_snap.demo_review_score_pct or 0.0,
        )

    # --- 9. Previous picks (top 4 other games by OPS) ---
    other_picks_rows = (
        db.query(Game, OpsScore)
        .join(latest_ops_sq, Game.appid == latest_ops_sq.c.appid)
        .join(
            OpsScore,
            (OpsScore.appid == Game.appid)
            & (OpsScore.score_date == latest_ops_sq.c.max_ops_date),
        )
        .filter(
            Game.is_horror == True,
            Game.release_date >= min_release,
            Game.release_date <= max_release,
            Game.appid != game.appid,
            OpsScore.score.isnot(None),
        )
        .order_by(OpsScore.score.desc())
        .limit(4)
        .all()
    )

    previous_picks: list[RadarPreviousPick] = []
    for other_game, other_ops in other_picks_rows:
        # Get OPS from 7 days ago for status
        ops_7d = (
            db.query(OpsScore)
            .filter(
                OpsScore.appid == other_game.appid,
                OpsScore.score_date <= today - timedelta(days=7),
            )
            .order_by(OpsScore.score_date.desc())
            .first()
        )

        current_score = other_ops.score or 0
        if ops_7d and ops_7d.score is not None:
            diff = current_score - ops_7d.score
            if diff >= 3:
                status = "climbing"
            elif diff <= -3:
                status = "peaked"
            else:
                status = "steady"
        else:
            status = "steady"

        previous_picks.append(
            RadarPreviousPick(
                appid=other_game.appid,
                title=other_game.title,
                picked_date=str(other_ops.score_date),
                ops_at_pick=current_score,
                ops_now=current_score,
                status=status,
            )
        )

    # --- 10. Latest editorial verdict (Agent 4 output, falls back to None) ---
    verdict_row = db.execute(sql_text(
        "SELECT verdict_text FROM radar_verdicts WHERE appid = :appid "
        "ORDER BY generated_at DESC LIMIT 1"
    ), {"appid": game.appid}).fetchone()
    verdict = verdict_row.verdict_text if verdict_row else None

    # --- Build response ---
    return RadarPickResponse(
        appid=game.appid,
        title=game.title,
        developer=game.developer,
        header_image_url=game.header_image_url,
        price_usd=game.price_usd,
        days_since_launch=days_since_launch,
        release_date=str(game.release_date) if game.release_date else None,
        review_count=review_count,
        sentiment_pct=sentiment_pct,
        velocity_7d=velocity_7d,
        velocity_prev_7d=velocity_prev_7d,
        velocity_per_day=velocity_per_day,
        estimated_owners=estimated_owners,
        peak_ccu=peak_ccu,
        current_ccu=current_ccu,
        youtube=youtube,
        demo=demo,
        ops=ops,
        ops_history=ops_history,
        velocity_spark=velocity_spark,
        previous_picks=previous_picks,
        verdict=verdict,
    )
