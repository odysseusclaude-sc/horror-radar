from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from database import get_db
from models import YoutubeVideo
from schemas import PaginatedResponse, VideoOut

router = APIRouter(tags=["videos"])


@router.get("/videos", response_model=PaginatedResponse[VideoOut])
def list_videos(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    channel_id: str | None = Query(None, description="Filter by channel_id"),
    matched_only: bool = Query(False, description="Only videos matched to a game"),
    days: int | None = Query(None, ge=1, le=365, description="Published within N days"),
    db: Session = Depends(get_db),
):
    query = db.query(YoutubeVideo)

    if channel_id:
        query = query.filter(YoutubeVideo.channel_id == channel_id)

    if matched_only:
        query = query.filter(YoutubeVideo.matched_appid.isnot(None))

    if days:
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)
        query = query.filter(YoutubeVideo.published_at >= cutoff)

    query = query.order_by(YoutubeVideo.published_at.desc())
    total = query.count()
    items = query.offset((page - 1) * page_size).limit(page_size).all()

    return PaginatedResponse(
        data=[VideoOut.model_validate(v) for v in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/videos/{video_id}", response_model=VideoOut)
def get_video(video_id: str, db: Session = Depends(get_db)):
    video = db.query(YoutubeVideo).filter_by(video_id=video_id).first()
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    return VideoOut.model_validate(video)
