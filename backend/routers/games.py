from __future__ import annotations

from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import get_db
from models import Game, GameSnapshot, OpsScore
from schemas import (
    GameDetailOut, GameListOut, GameSnapshotOut, OpsScoreOut,
    PaginatedResponse,
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

    # Join game with its latest snapshot
    query = (
        db.query(Game, GameSnapshot)
        .outerjoin(latest_date_sq, Game.appid == latest_date_sq.c.appid)
        .outerjoin(
            GameSnapshot,
            (GameSnapshot.appid == Game.appid)
            & (GameSnapshot.snapshot_date == latest_date_sq.c.max_date),
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
    else:  # "newest"
        query = query.order_by(Game.release_date.desc().nullslast())

    total = query.count()
    rows = query.offset((page - 1) * page_size).limit(page_size).all()

    results = []
    for game, snapshot in rows:
        out = GameListOut.model_validate(game)
        if snapshot:
            out.latest_snapshot = GameSnapshotOut.model_validate(snapshot)
        # Attach latest OPS score
        latest_ops = (
            db.query(OpsScore)
            .filter_by(appid=game.appid)
            .order_by(OpsScore.score_date.desc())
            .first()
        )
        if latest_ops:
            out.latest_ops = OpsScoreOut.model_validate(latest_ops)
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

    result = GameDetailOut.model_validate(game)
    result.snapshots = [GameSnapshotOut.model_validate(s) for s in snapshots]
    result.ops_history = [OpsScoreOut.model_validate(o) for o in ops_history]
    return result
