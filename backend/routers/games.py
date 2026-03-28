from __future__ import annotations

from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from database import get_db
from models import Game, GameSnapshot, OpsScore
from schemas import GameDetailOut, GameOut, GameSnapshotOut, OpsScoreOut, PaginatedResponse

router = APIRouter(tags=["games"])


@router.get("/games", response_model=PaginatedResponse[GameOut])
def list_games(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    days: int | None = Query(None, ge=1, le=365, description="Filter: released within N days"),
    max_price: float | None = Query(None, ge=0, description="Filter: max price USD"),
    sort_by: str = Query("newest", description="Sort: newest, reviews, velocity, ccu"),
    search: str | None = Query(None, description="Search by title"),
    db: Session = Depends(get_db),
):
    query = db.query(Game)

    if days:
        cutoff = date.today() - timedelta(days=days)
        query = query.filter(Game.release_date >= cutoff)

    if max_price is not None:
        query = query.filter((Game.price_usd <= max_price) | (Game.price_usd.is_(None)))

    if search:
        query = query.filter(Game.title.ilike(f"%{search}%"))

    # Sorting
    if sort_by == "newest":
        query = query.order_by(Game.release_date.desc().nullslast())
    elif sort_by == "reviews":
        query = query.order_by(Game.created_at.desc())  # TODO: join snapshot for review_count
    elif sort_by == "ccu":
        query = query.order_by(Game.created_at.desc())  # TODO: join snapshot for peak_ccu
    else:
        query = query.order_by(Game.release_date.desc().nullslast())

    total = query.count()
    items = query.offset((page - 1) * page_size).limit(page_size).all()

    return PaginatedResponse(
        data=[GameOut.model_validate(g) for g in items],
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
