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
    has_demo: bool = False
    next_fest: bool = False
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
    review_velocity_7d: float | None = None
    completion_rate: float | None = None
    median_achievement_pct: float | None = None
    patch_count_30d: int | None = None
    days_since_last_update: int | None = None
    twitch_peak_viewers: int | None = None
    twitch_concurrent_streams: int | None = None

    model_config = {"from_attributes": True}


class OpsScoreOut(BaseModel):
    score_date: date
    score: float | None = None
    confidence: str | None = None
    review_component: float | None = None
    velocity_component: float | None = None
    ccu_component: float | None = None
    youtube_component: float | None = None
    youtube_breadth: float | None = None
    wishlist_bonus: float | None = None
    raw_ops: float | None = None
    price_modifier: float | None = None
    formula_version: int | None = None

    model_config = {"from_attributes": True}


class GameListOut(GameOut):
    """Game with latest snapshot data and OPS for list views."""
    latest_snapshot: GameSnapshotOut | None = None
    latest_ops: OpsScoreOut | None = None


class TwitchSnapshotOut(BaseModel):
    snapshot_date: date
    concurrent_streams: int | None = None
    peak_viewers: int | None = None
    total_viewers: int | None = None
    unique_streamers: int | None = None

    model_config = {"from_attributes": True}


class RedditMentionOut(BaseModel):
    post_id: str
    subreddit: str
    title: str
    score: int | None = None
    num_comments: int | None = None
    upvote_ratio: float | None = None
    post_url: str | None = None
    posted_at: datetime | None = None

    model_config = {"from_attributes": True}


class DeveloperProfileOut(BaseModel):
    developer_name: str
    total_games: int = 0
    total_reviews: int = 0
    avg_review_score: float | None = None
    best_game_appid: int | None = None
    best_game_reviews: int | None = None
    scope: str = "db_only"
    computed_at: datetime | None = None

    model_config = {"from_attributes": True}


class GameDetailOut(GameOut):
    snapshots: list[GameSnapshotOut] = []
    ops_history: list[OpsScoreOut] = []
    twitch_snapshots: list[TwitchSnapshotOut] = []
    reddit_mentions: list[RedditMentionOut] = []
    developer_profile: DeveloperProfileOut | None = None


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
