from __future__ import annotations

from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import get_db
from collections import defaultdict

from models import (
    CollectionRun, DeveloperProfile, Game, GameSnapshot, OpsScore,
    RedditMention, TwitchSnapshot, YoutubeChannel, YoutubeVideo, YoutubeVideoSnapshot,
)
from schemas import (
    DeveloperProfileOut, GameDetailOut, GameListOut, GameSnapshotOut, OpsScoreOut,
    PaginatedResponse, RedditMentionOut, StatusOut, TwitchSnapshotOut, YoutubeChannelBrief,
    TimelineVideoOut, TimelineSnapshotOut, TimelineEventOut, TimelineResponse,
)

router = APIRouter(tags=["games"])


def _get_latest_snapshot(db: Session, appid: int) -> GameSnapshot | None:
    return (
        db.query(GameSnapshot)
        .filter_by(appid=appid)
        .order_by(GameSnapshot.snapshot_date.desc())
        .first()
    )


@router.get("/games", response_model=PaginatedResponse[GameListOut])
def list_games(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    days: int | None = Query(None, ge=1, le=730, description="Filter: released within N days"),
    max_price: float | None = Query(None, ge=0, description="Filter: max price USD"),
    sort_by: str = Query("newest", description="Sort: newest, reviews, ccu, ops"),
    search: str | None = Query(None, description="Search by title"),
    db: Session = Depends(get_db),
):
    # Subquery: latest snapshot date per game
    latest_date_sq = (
        db.query(
            GameSnapshot.appid,
            func.max(GameSnapshot.snapshot_date).label("max_date"),
        )
        .group_by(GameSnapshot.appid)
        .subquery()
    )

    # Subquery: latest OPS score per game
    latest_ops_sq = (
        db.query(
            OpsScore.appid,
            func.max(OpsScore.score_date).label("max_ops_date"),
        )
        .group_by(OpsScore.appid)
        .subquery()
    )

    # Join game with its latest snapshot and latest OPS score
    query = (
        db.query(Game, GameSnapshot, OpsScore)
        .outerjoin(latest_date_sq, Game.appid == latest_date_sq.c.appid)
        .outerjoin(
            GameSnapshot,
            (GameSnapshot.appid == Game.appid)
            & (GameSnapshot.snapshot_date == latest_date_sq.c.max_date),
        )
        .outerjoin(latest_ops_sq, Game.appid == latest_ops_sq.c.appid)
        .outerjoin(
            OpsScore,
            (OpsScore.appid == Game.appid)
            & (OpsScore.score_date == latest_ops_sq.c.max_ops_date),
        )
    )

    # Only show horror games
    query = query.filter(Game.is_horror == True)

    if days:
        cutoff = date.today() - timedelta(days=days)
        query = query.filter(Game.release_date >= cutoff)

    if max_price is not None:
        query = query.filter((Game.price_usd <= max_price) | (Game.price_usd.is_(None)))

    if search:
        query = query.filter(Game.title.ilike(f"%{search}%"))

    # Sorting
    release_desc = Game.release_date.desc().nullslast()
    if sort_by == "reviews":
        query = query.order_by(GameSnapshot.review_count.desc().nullslast(), release_desc)
    elif sort_by == "ccu":
        query = query.order_by(GameSnapshot.peak_ccu.desc().nullslast(), release_desc)
    elif sort_by == "ops":
        query = query.order_by(OpsScore.score.desc().nullslast(), release_desc)
    elif sort_by == "velocity":
        query = query.order_by(GameSnapshot.review_velocity_7d.desc().nullslast(), release_desc)
    else:  # "newest"
        query = query.order_by(release_desc)

    total = query.count()
    rows = query.offset((page - 1) * page_size).limit(page_size).all()

    results = []
    for game, snapshot, ops_score in rows:
        out = GameListOut.model_validate(game)
        if snapshot:
            out.latest_snapshot = GameSnapshotOut.model_validate(snapshot)
        if ops_score:
            out.latest_ops = OpsScoreOut.model_validate(ops_score)
        results.append(out)

    # Batch-load YouTube channels for all returned games
    appids = [out.appid for out in results]
    if appids:
        yt_rows = (
            db.query(
                YoutubeVideo.matched_appid,
                YoutubeChannel.channel_id,
                YoutubeChannel.name,
                YoutubeChannel.handle,
                YoutubeChannel.subscriber_count,
                func.max(YoutubeVideo.view_count).label("top_views"),
            )
            .join(YoutubeChannel, YoutubeVideo.channel_id == YoutubeChannel.channel_id)
            .filter(YoutubeVideo.matched_appid.in_(appids))
            .group_by(YoutubeVideo.matched_appid, YoutubeChannel.channel_id)
            .order_by(YoutubeChannel.subscriber_count.desc().nullslast())
            .all()
        )
        yt_by_appid: dict[int, list] = defaultdict(list)
        for row in yt_rows:
            if len(yt_by_appid[row.matched_appid]) < 2:
                yt_by_appid[row.matched_appid].append(
                    YoutubeChannelBrief(
                        channel_id=row.channel_id,
                        name=row.name,
                        handle=row.handle,
                        subscriber_count=row.subscriber_count,
                        top_video_views=row.top_views,
                    )
                )
        for out in results:
            out.youtube_channels = yt_by_appid.get(out.appid, [])

    # Batch-compute rolling 7-day review delta per game
    if appids:
        seven_days_ago = date.today() - timedelta(days=7)
        old_date_sq = (
            db.query(
                GameSnapshot.appid,
                func.max(GameSnapshot.snapshot_date).label("old_date"),
            )
            .filter(
                GameSnapshot.appid.in_(appids),
                GameSnapshot.snapshot_date <= seven_days_ago,
            )
            .group_by(GameSnapshot.appid)
            .subquery()
        )
        old_snap_rows = (
            db.query(GameSnapshot.appid, GameSnapshot.review_count)
            .join(
                old_date_sq,
                (GameSnapshot.appid == old_date_sq.c.appid)
                & (GameSnapshot.snapshot_date == old_date_sq.c.old_date),
            )
            .all()
        )
        old_reviews = {row.appid: row.review_count for row in old_snap_rows}
        for out in results:
            if out.latest_snapshot and out.latest_snapshot.review_count is not None:
                old = old_reviews.get(out.appid)
                if old is not None:
                    out.review_delta_7d = out.latest_snapshot.review_count - old

    return PaginatedResponse(
        data=results,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/games/{appid}", response_model=GameDetailOut)
def get_game(appid: int, db: Session = Depends(get_db)):
    game = db.query(Game).filter_by(appid=appid).first()
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")

    snapshots = (
        db.query(GameSnapshot)
        .filter_by(appid=appid)
        .order_by(GameSnapshot.snapshot_date.desc())
        .limit(90)
        .all()
    )

    ops_history = (
        db.query(OpsScore)
        .filter_by(appid=appid)
        .order_by(OpsScore.score_date.desc())
        .limit(30)
        .all()
    )

    twitch_snaps = (
        db.query(TwitchSnapshot)
        .filter_by(appid=appid)
        .order_by(TwitchSnapshot.snapshot_date.desc())
        .limit(30)
        .all()
    )

    reddit_mentions = (
        db.query(RedditMention)
        .filter_by(appid=appid)
        .order_by(RedditMention.posted_at.desc())
        .limit(50)
        .all()
    )

    dev_profile = None
    if game.developer:
        dev_profile = (
            db.query(DeveloperProfile)
            .filter_by(developer_name=game.developer)
            .first()
        )

    result = GameDetailOut.model_validate(game)
    result.snapshots = [GameSnapshotOut.model_validate(s) for s in snapshots]
    result.ops_history = [OpsScoreOut.model_validate(o) for o in ops_history]
    result.twitch_snapshots = [TwitchSnapshotOut.model_validate(t) for t in twitch_snaps]
    result.reddit_mentions = [RedditMentionOut.model_validate(r) for r in reddit_mentions]
    if dev_profile:
        result.developer_profile = DeveloperProfileOut.model_validate(dev_profile)
    return result


@router.get("/games/{appid}/timeline", response_model=TimelineResponse)
def get_game_timeline(appid: int, db: Session = Depends(get_db)):
    """Return full timeline/autopsy data for a single game."""
    from schemas import GameOut

    game = db.query(Game).filter_by(appid=appid).first()
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")

    # --- Fetch all raw data ---
    snapshots = (
        db.query(GameSnapshot)
        .filter_by(appid=appid)
        .order_by(GameSnapshot.snapshot_date.asc())
        .all()
    )

    ops_scores = (
        db.query(OpsScore)
        .filter_by(appid=appid)
        .order_by(OpsScore.score_date.asc())
        .all()
    )

    twitch_snaps = (
        db.query(TwitchSnapshot)
        .filter_by(appid=appid)
        .order_by(TwitchSnapshot.snapshot_date.asc())
        .all()
    )

    # YouTube videos matched to the game
    game_videos = (
        db.query(YoutubeVideo, YoutubeChannel.name, YoutubeChannel.subscriber_count)
        .join(YoutubeChannel, YoutubeVideo.channel_id == YoutubeChannel.channel_id)
        .filter(YoutubeVideo.matched_appid == appid)
        .order_by(YoutubeVideo.published_at.asc())
        .all()
    )

    # YouTube videos matched to the demo (if exists)
    demo_videos = []
    if game.demo_appid:
        demo_videos = (
            db.query(YoutubeVideo, YoutubeChannel.name, YoutubeChannel.subscriber_count)
            .join(YoutubeChannel, YoutubeVideo.channel_id == YoutubeChannel.channel_id)
            .filter(YoutubeVideo.matched_appid == game.demo_appid)
            .order_by(YoutubeVideo.published_at.asc())
            .all()
        )

    reddit_mentions = (
        db.query(RedditMention)
        .filter_by(appid=appid)
        .order_by(RedditMention.posted_at.asc())
        .all()
    )

    # --- Build index maps keyed by date ---
    ops_by_date = {o.score_date: o for o in ops_scores}
    twitch_by_date = {t.snapshot_date: t for t in twitch_snaps}

    # Build all video output objects
    all_videos: list[TimelineVideoOut] = []
    for vid, ch_name, ch_subs in game_videos:
        all_videos.append(TimelineVideoOut(
            video_id=vid.video_id,
            channel_id=vid.channel_id,
            channel_name=ch_name,
            subscriber_count=ch_subs,
            title=vid.title,
            published_at=vid.published_at,
            view_count=vid.view_count,
            like_count=vid.like_count,
            covers="game",
        ))
    for vid, ch_name, ch_subs in demo_videos:
        all_videos.append(TimelineVideoOut(
            video_id=vid.video_id,
            channel_id=vid.channel_id,
            channel_name=ch_name,
            subscriber_count=ch_subs,
            title=vid.title,
            published_at=vid.published_at,
            view_count=vid.view_count,
            like_count=vid.like_count,
            covers="demo",
        ))

    # --- Determine full timeline date range ---
    # Start from release date, but extend earlier only if there's real data
    # (snapshots, videos, reddit mentions, twitch) before release.
    # Demo release date alone shouldn't create months of empty timeline.
    candidate_dates: list[date] = []
    if game.release_date:
        candidate_dates.append(game.release_date)
    for snap in snapshots:
        candidate_dates.append(snap.snapshot_date)
    for o in ops_scores:
        candidate_dates.append(o.score_date)
    for v in all_videos:
        if v.published_at:
            candidate_dates.append(v.published_at.date())
    for rm in reddit_mentions:
        if rm.posted_at:
            candidate_dates.append(rm.posted_at.date())
    for t in twitch_snaps:
        candidate_dates.append(t.snapshot_date)
    # Only include demo release date if there's actual demo snapshot data
    if game.demo_release_date and any(
        s.demo_review_count is not None and s.demo_review_count > 0
        for s in snapshots
    ):
        candidate_dates.append(game.demo_release_date)

    if not candidate_dates:
        # No data at all — return empty timeline
        return TimelineResponse(
            game=GameOut.model_validate(game),
            snapshots=[],
            events=[],
            videos=all_videos,
            reddit_mentions=[RedditMentionOut.model_validate(r) for r in reddit_mentions],
        )

    start_date = min(candidate_dates)
    end_date = date.today()

    # --- Build index maps keyed by date for quick lookup ---
    snap_by_date = {s.snapshot_date: s for s in snapshots}

    # --- Build cumulative YT views using snapshot history ---
    # Collect all video_ids for this game (both game + demo)
    all_video_ids = [v.video_id for v in all_videos]

    # Fetch all youtube_video_snapshots for these videos
    yt_snaps: list[YoutubeVideoSnapshot] = []
    if all_video_ids:
        yt_snaps = (
            db.query(YoutubeVideoSnapshot)
            .filter(YoutubeVideoSnapshot.video_id.in_(all_video_ids))
            .order_by(YoutubeVideoSnapshot.snapshot_date.asc())
            .all()
        )

    # Build a map: date → {video_id → view_count} from snapshots
    yt_snap_by_date: dict[date, dict[str, int]] = {}
    for ys in yt_snaps:
        yt_snap_by_date.setdefault(ys.snapshot_date, {})[ys.video_id] = ys.view_count or 0

    has_yt_snapshots = len(yt_snaps) > 0

    # For dates WITH snapshot data: sum view_counts across all videos that have
    # a snapshot on or before that date (use most recent snapshot per video)
    # For dates WITHOUT snapshot data (pre-history): use static view_count from
    # videos published on/before that date (the old staircase approach)

    # Build sorted video publish info for fallback
    sorted_videos = sorted(all_videos, key=lambda v: v.published_at or datetime.min)
    video_dates_views = []
    for v in sorted_videos:
        if v.published_at:
            video_dates_views.append((v.published_at.date(), v.view_count or 0))

    # Get all unique snapshot dates sorted
    yt_snap_dates = sorted(yt_snap_by_date.keys()) if yt_snap_by_date else []

    def _yt_cumulative_views_at(d: date) -> int:
        if not has_yt_snapshots:
            # No snapshot history yet — use static staircase
            total = 0
            for vd, views in video_dates_views:
                if vd <= d:
                    total += views
                else:
                    break
            return total

        # Use snapshot history: for each video, find its latest snapshot on or before d
        total = 0
        for vid in all_video_ids:
            best_views = None
            # Walk snapshot dates to find latest <= d for this video
            for sd in yt_snap_dates:
                if sd > d:
                    break
                vid_views = yt_snap_by_date.get(sd, {}).get(vid)
                if vid_views is not None:
                    best_views = vid_views
            if best_views is not None:
                total += best_views
            else:
                # No snapshot exists yet for this video — check if published before d
                # and use current view_count as static fallback
                for v in all_videos:
                    if v.video_id == vid and v.published_at and v.published_at.date() <= d:
                        total += v.view_count or 0
                        break
        return total

    # --- Build merged snapshots: one per day across full lifecycle ---
    timeline_snapshots: list[TimelineSnapshotOut] = []
    current = start_date
    while current <= end_date:
        snap = snap_by_date.get(current)
        ops = ops_by_date.get(current)
        twitch = twitch_by_date.get(current)

        timeline_snapshots.append(TimelineSnapshotOut(
            date=current,
            review_count=snap.review_count if snap else None,
            review_score_pct=snap.review_score_pct if snap else None,
            peak_ccu=snap.peak_ccu if snap else None,
            owners_estimate=snap.estimated_owners_low if snap else None,
            demo_review_count=snap.demo_review_count if snap else None,
            demo_review_score_pct=snap.demo_review_score_pct if snap else None,
            ops_score=ops.score if ops else None,
            ops_confidence=ops.confidence if ops else None,
            review_component=ops.review_component if ops else None,
            velocity_component=ops.velocity_component if ops else None,
            decay_component=ops.decay_component if ops else None,
            ccu_component=ops.ccu_component if ops else None,
            youtube_component=ops.youtube_component if ops else None,
            creator_response_component=ops.creator_response_component if ops else None,
            raw_ops=ops.raw_ops if ops else None,
            twitch_viewers=twitch.peak_viewers if twitch else None,
            twitch_streams=twitch.concurrent_streams if twitch else None,
            yt_cumulative_views=_yt_cumulative_views_at(current),
            patch_count_30d=snap.patch_count_30d if snap else None,
            days_since_last_update=snap.days_since_last_update if snap else None,
        ))
        current += timedelta(days=1)

    # --- Build events ---
    events: list[TimelineEventOut] = []

    # Demo launch event (before game launch)
    if game.demo_release_date:
        events.append(TimelineEventOut(
            date=game.demo_release_date,
            type="demo_launch",
            title=f"{game.title} demo releases on Steam",
        ))

    # Game launch event
    if game.release_date:
        events.append(TimelineEventOut(
            date=game.release_date,
            type="game_launch",
            title=f"{game.title} launches on Steam",
        ))

    # YouTube game events
    for vid, ch_name, ch_subs in game_videos:
        if vid.published_at:
            events.append(TimelineEventOut(
                date=vid.published_at.date(),
                type="youtube_game",
                title=vid.title,
                channel_name=ch_name,
                subscriber_count=ch_subs,
                view_count=vid.view_count,
            ))

    # YouTube demo events
    for vid, ch_name, ch_subs in demo_videos:
        if vid.published_at:
            events.append(TimelineEventOut(
                date=vid.published_at.date(),
                type="youtube_demo",
                title=vid.title,
                channel_name=ch_name,
                subscriber_count=ch_subs,
                view_count=vid.view_count,
            ))

    # Reddit events (score >= 50 only)
    for rm in reddit_mentions:
        if rm.score is not None and rm.score >= 50 and rm.posted_at:
            events.append(TimelineEventOut(
                date=rm.posted_at.date(),
                type="reddit",
                title=rm.title,
                subreddit=rm.subreddit,
                score=rm.score,
                num_comments=rm.num_comments,
                post_url=rm.post_url,
            ))

    # Steam update events: detect resets in days_since_last_update
    for i in range(1, len(snapshots)):
        prev = snapshots[i - 1]
        curr = snapshots[i]
        if (
            prev.days_since_last_update is not None
            and curr.days_since_last_update is not None
            and curr.days_since_last_update < prev.days_since_last_update
        ):
            events.append(TimelineEventOut(
                date=curr.snapshot_date,
                type="steam_update",
                title="Steam update detected",
                detail=f"days_since_last_update reset from {prev.days_since_last_update} to {curr.days_since_last_update}",
            ))

    # Sort events by date
    events.sort(key=lambda e: e.date)

    return TimelineResponse(
        game=GameOut.model_validate(game),
        snapshots=timeline_snapshots,
        events=events,
        videos=all_videos,
        reddit_mentions=[RedditMentionOut.model_validate(r) for r in reddit_mentions],
    )


@router.get("/status", response_model=StatusOut)
def get_status(db: Session = Depends(get_db)):
    """Return active scraper count and last sync time."""
    active = db.query(func.count(CollectionRun.id)).filter_by(status="running").scalar() or 0
    last_run = (
        db.query(func.max(CollectionRun.finished_at))
        .filter(CollectionRun.finished_at.isnot(None))
        .scalar()
    )
    return StatusOut(active_scrapers=active, last_sync=last_run)
