from __future__ import annotations

from datetime import date, datetime
from typing import Generic, TypeVar

from pydantic import BaseModel

T = TypeVar("T")


class PaginatedResponse(BaseModel, Generic[T]):
    data: list[T]
    total: int
    page: int
    page_size: int


# --- Game schemas ---

class GameOut(BaseModel):
    appid: int
    title: str
    developer: str | None = None
    publisher: str | None = None
    release_date: date | None = None
    price_usd: float | None = None
    genres: str | None = None
    tags: str | None = None
    is_indie: bool = False
    is_horror: bool = False
    header_image_url: str | None = None
    short_description: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None

    model_config = {"from_attributes": True}


class GameSnapshotOut(BaseModel):
    snapshot_date: date
    review_count: int | None = None
    review_score_pct: float | None = None
    total_positive: int | None = None
    total_negative: int | None = None
    estimated_owners_low: int | None = None
    estimated_owners_high: int | None = None
    low_confidence_owners: bool = False
    peak_ccu: int | None = None
    current_ccu: int | None = None
    average_playtime_forever: int | None = None

    model_config = {"from_attributes": True}


class OpsScoreOut(BaseModel):
    score_date: date
    score: float | None = None
    confidence: str | None = None
    review_component: float | None = None
    ccu_component: float | None = None
    youtube_component: float | None = None
    wishlist_bonus: float | None = None
    raw_ops: float | None = None

    model_config = {"from_attributes": True}


class GameDetailOut(GameOut):
    snapshots: list[GameSnapshotOut] = []
    ops_history: list[OpsScoreOut] = []


# --- YouTube schemas ---

class ChannelOut(BaseModel):
    channel_id: str
    handle: str | None = None
    name: str
    subscriber_count: int | None = None
    total_views: int | None = None
    video_count: int | None = None
    match_mode: str = "title"
    collected_at: datetime | None = None
    updated_at: datetime | None = None

    model_config = {"from_attributes": True}


class VideoOut(BaseModel):
    video_id: str
    channel_id: str
    title: str
    description: str | None = None
    published_at: datetime | None = None
    view_count: int | None = None
    like_count: int | None = None
    comment_count: int | None = None
    duration_seconds: int | None = None
    view_48h: int | None = None
    matched_appid: int | None = None
    match_score: float | None = None
    collected_at: datetime | None = None
    updated_at: datetime | None = None

    model_config = {"from_attributes": True}


# --- Collection run schemas ---

class CollectionRunOut(BaseModel):
    id: int
    job_name: str
    status: str
    items_processed: int = 0
    items_failed: int = 0
    error_message: str | None = None
    started_at: datetime | None = None
    finished_at: datetime | None = None

    model_config = {"from_attributes": True}


# --- Health check ---

class HealthOut(BaseModel):
    status: str
    version: str = "0.1.0"
