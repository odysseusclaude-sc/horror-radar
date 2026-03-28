from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from database import get_db
from models import YoutubeChannel
from schemas import ChannelOut, PaginatedResponse

router = APIRouter(tags=["channels"])


@router.get("/channels", response_model=PaginatedResponse[ChannelOut])
def list_channels(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    query = db.query(YoutubeChannel).order_by(YoutubeChannel.subscriber_count.desc().nullslast())
    total = query.count()
    items = query.offset((page - 1) * page_size).limit(page_size).all()

    return PaginatedResponse(
        data=[ChannelOut.model_validate(ch) for ch in items],
        total=total,
        page=page,
        page_size=page_size,
    )
