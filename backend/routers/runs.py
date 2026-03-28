from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from database import get_db
from models import CollectionRun
from schemas import CollectionRunOut, HealthOut, PaginatedResponse

router = APIRouter(tags=["runs"])


@router.get("/runs", response_model=PaginatedResponse[CollectionRunOut])
def list_runs(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    job_name: str | None = Query(None, description="Filter by job name"),
    db: Session = Depends(get_db),
):
    query = db.query(CollectionRun)

    if job_name:
        query = query.filter(CollectionRun.job_name == job_name)

    query = query.order_by(CollectionRun.started_at.desc())
    total = query.count()
    items = query.offset((page - 1) * page_size).limit(page_size).all()

    return PaginatedResponse(
        data=[CollectionRunOut.model_validate(r) for r in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/health", response_model=HealthOut)
def health_check():
    return HealthOut(status="ok")
