from __future__ import annotations

from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import get_db
from models import DeveloperProfile, Game, GameSnapshot, OpsScore, RedditMention, TwitchSnapshot
from schemas import (
    DeveloperProfileOut, GameDetailOut, GameListOut, GameSnapshotOut, OpsScoreOut,
    PaginatedResponse, RedditMentionOut, TwitchSnapshotOut,
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

    if days:
        cutoff = date.today() - timedelta(days=days)
        query = query.filter(Game.release_date >= cutoff)

    if max_price is not None:
        query = query.filter((Game.price_usd <= max_price) | (Game.price_usd.is_(None)))

    if search:
        query = query.filter(Game.title.ilike(f"%{search}%"))

    # Sorting
    if sort_by == "reviews":
        query = query.order_by(GameSnapshot.review_count.desc().nullslast())
    elif sort_by == "ccu":
        query = query.order_by(GameSnapshot.peak_ccu.desc().nullslast())
    elif sort_by == "ops":
        query = query.order_by(OpsScore.score.desc().nullslast())
    else:  # "newest"
        query = query.order_by(Game.release_date.desc().nullslast())

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
