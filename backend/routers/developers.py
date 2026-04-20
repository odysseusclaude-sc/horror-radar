from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import get_db
from models import DeveloperProfile, Game, OpsScore
from schemas import DeveloperDetailOut, DeveloperGameItem

router = APIRouter(prefix="/developers", tags=["developers"])


@router.get("/{name}", response_model=DeveloperDetailOut)
def get_developer(name: str, db: Session = Depends(get_db)):
    """Return developer profile + their tracked horror games with latest OPS."""
    profile = (
        db.query(DeveloperProfile)
        .filter(func.lower(DeveloperProfile.developer_name) == name.lower())
        .first()
    )

    games = (
        db.query(Game)
        .filter(Game.developer == name, Game.is_horror == True)
        .order_by(Game.release_date.desc().nullslast())
        .all()
    )

    if not games and not profile:
        raise HTTPException(status_code=404, detail="Developer not found")

    latest_ops_sq = (
        db.query(OpsScore.appid, func.max(OpsScore.score_date).label("max_date"))
        .group_by(OpsScore.appid)
        .subquery()
    )

    game_items: list[DeveloperGameItem] = []
    for g in games:
        latest_ops = (
            db.query(OpsScore)
            .join(latest_ops_sq, (OpsScore.appid == latest_ops_sq.c.appid) & (OpsScore.score_date == latest_ops_sq.c.max_date))
            .filter(OpsScore.appid == g.appid)
            .first()
        )
        game_items.append(
            DeveloperGameItem(
                appid=g.appid,
                title=g.title,
                release_date=str(g.release_date) if g.release_date else None,
                price_usd=g.price_usd,
                header_image_url=g.header_image_url,
                ops_score=latest_ops.score if latest_ops else None,
                ops_confidence=latest_ops.confidence if latest_ops else None,
            )
        )

    return DeveloperDetailOut(
        developer_name=name,
        total_games=profile.total_games if profile else len(games),
        total_reviews=profile.total_reviews if profile else 0,
        avg_review_score=profile.avg_review_score if profile else None,
        best_game_appid=profile.best_game_appid if profile else None,
        computed_at=str(profile.computed_at) if profile else None,
        games=game_items,
    )
