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
    demo_appid: int | None = None
    demo_release_date: date | None = None
    next_fest: bool = False
    is_multiplayer: bool = False
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
    demo_review_count: int | None = None
    demo_review_score_pct: float | None = None

    model_config = {"from_attributes": True}


class OpsScoreOut(BaseModel):
    score_date: date
    score: float | None = None
    confidence: str | None = None
    review_component: float | None = None
    velocity_component: float | None = None
    decay_component: float | None = None
    ccu_component: float | None = None
    youtube_component: float | None = None
    creator_response_component: float | None = None
    youtube_breadth: float | None = None
    wishlist_bonus: float | None = None
    raw_ops: float | None = None
    price_modifier: float | None = None
    formula_version: int | None = None

    model_config = {"from_attributes": True}


class YoutubeChannelBrief(BaseModel):
    channel_id: str
    name: str
    handle: str | None = None
    subscriber_count: int | None = None
    top_video_views: int | None = None


class GameListOut(GameOut):
    """Game with latest snapshot data and OPS for list views."""
    latest_snapshot: GameSnapshotOut | None = None
    latest_ops: OpsScoreOut | None = None
    youtube_channels: list[YoutubeChannelBrief] = []
    review_delta_7d: int | None = None
    ops_delta_7d: float | None = None


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


# --- Insights schemas ---

class InsightSignal(BaseModel):
    label: str
    value: str
    detail: str

class InsightGame(BaseModel):
    appid: int
    title: str
    developer: str | None = None
    header_image_url: str | None = None
    gem_score: float = 0
    review_count: int = 0
    review_score: float = 0
    price: float | None = None
    days_out: int = 0
    genre: str = ""
    visibility: float = 0
    quality: float = 0
    yt_channels: int = 0
    ops_score: float | None = None
    has_demo: bool = False
    demo_review_count: int | None = None
    demo_review_score_pct: float | None = None
    signals: list[InsightSignal] = []
    sparkline: list[float] = []
    dominant_signal: str = ""

class InsightSubGenre(BaseModel):
    name: str
    momentum: float = 0
    game_count: int = 0
    avg_score: float = 0
    top_game: str = ""

class InsightPastGem(BaseModel):
    title: str
    week: str = ""
    score_at_discovery: float = 0
    current_reviews: int = 0
    outcome: str = "steady"

class InsightsResponse(BaseModel):
    hero_gem: InsightGame | None = None
    scatter_games: list[InsightGame] = []
    rising_games: list[InsightGame] = []
    blindspot_games: list[InsightGame] = []
    sub_genres: list[InsightSubGenre] = []
    gem_history: list[InsightPastGem] = []


# --- Timeline / Autopsy schemas ---

class TimelineVideoOut(BaseModel):
    video_id: str
    channel_id: str
    channel_name: str | None = None
    subscriber_count: int | None = None
    title: str
    published_at: datetime | None = None
    view_count: int | None = None
    like_count: int | None = None
    covers: str = "game"  # "demo" or "game"

class TimelineSnapshotOut(BaseModel):
    date: date
    review_count: int | None = None
    review_score_pct: float | None = None
    peak_ccu: int | None = None
    owners_estimate: int | None = None
    demo_review_count: int | None = None
    demo_review_score_pct: float | None = None
    ops_score: float | None = None
    ops_confidence: str | None = None
    review_component: float | None = None
    velocity_component: float | None = None
    decay_component: float | None = None
    ccu_component: float | None = None
    youtube_component: float | None = None
    creator_response_component: float | None = None
    raw_ops: float | None = None
    twitch_viewers: int | None = None
    twitch_streams: int | None = None
    yt_cumulative_views: int = 0
    patch_count_30d: int | None = None
    days_since_last_update: int | None = None

class TimelineEventOut(BaseModel):
    date: date
    type: str  # "youtube_demo", "youtube_game", "reddit", "steam_update", "game_launch"
    title: str
    detail: str = ""
    channel_name: str | None = None
    subscriber_count: int | None = None
    view_count: int | None = None
    subreddit: str | None = None
    score: int | None = None
    num_comments: int | None = None
    post_url: str | None = None

class TimelineResponse(BaseModel):
    game: GameOut
    snapshots: list[TimelineSnapshotOut]
    events: list[TimelineEventOut]
    videos: list[TimelineVideoOut]
    reddit_mentions: list[RedditMentionOut]


# --- Radar Pick schemas ---

class RadarOpsComponent(BaseModel):
    key: str
    label: str
    value: float | None = None
    max: float
    weight: float
    color: str
    desc: str
    formula: str

class RadarOps(BaseModel):
    score: float
    delta_14d: float | None = None
    percentile: float | None = None
    components: list[RadarOpsComponent] = []

class RadarOpsHistoryPoint(BaseModel):
    day: int
    score: float

class RadarYoutube(BaseModel):
    video_count: int = 0
    largest_subscriber_count: int | None = None
    total_views: int = 0
    channels: list[YoutubeChannelBrief] = []

class RadarDemo(BaseModel):
    review_count: int
    score_pct: float

class RadarPreviousPick(BaseModel):
    appid: int
    title: str
    picked_date: str
    ops_at_pick: float
    ops_now: float | None = None
    status: str  # "climbing" | "steady" | "peaked"

class RadarVelocitySpark(BaseModel):
    label: str
    value: int

class RadarPickSummary(BaseModel):
    appid: int
    title: str
    developer: str | None = None
    header_image_url: str | None = None
    price_usd: float | None = None
    days_since_launch: int | None = None
    review_count: int | None = None
    velocity_7d: int | None = None
    ops_score: float | None = None
    ops_delta_14d: float | None = None
    sentiment_pct: float | None = None


class RadarPickResponse(BaseModel):
    appid: int
    title: str
    developer: str | None = None
    header_image_url: str | None = None
    price_usd: float | None = None
    days_since_launch: int | None = None
    release_date: str | None = None

    review_count: int | None = None
    sentiment_pct: float | None = None
    velocity_7d: int | None = None
    velocity_prev_7d: int | None = None
    velocity_per_day: float | None = None
    estimated_owners: int | None = None
    peak_ccu: int | None = None
    current_ccu: int | None = None

    youtube: RadarYoutube | None = None
    demo: RadarDemo | None = None

    ops: RadarOps | None = None
    ops_history: list[RadarOpsHistoryPoint] = []
    velocity_spark: list[RadarVelocitySpark] = []
    previous_picks: list[RadarPreviousPick] = []
    runners_up: list[RadarPickSummary] = []


# --- Health check ---

class HealthOut(BaseModel):
    status: str
    version: str = "0.1.0"


class PipelineStatusOut(BaseModel):
    queue_depth: int = 0
    dead_letters: int = 0
    metadata_last_status: str | None = None
    metadata_last_run: str | None = None
    metadata_api_calls: int = 0


class StatusOut(BaseModel):
    active_scrapers: int = 0
    total_scrapers: int = 12
    last_sync: datetime | None = None
    pipeline: PipelineStatusOut | None = None


# --- Trends schemas ---

class TrendsWeekPoint(BaseModel):
    week_label: str          # "Mar 3"
    week_iso: str            # "2026-W10"
    active_games: int = 0
    total_new_reviews: int = 0
    avg_ops: float | None = None
    new_releases: int = 0


class TrendsSubgenre(BaseModel):
    name: str
    game_count: int = 0
    avg_ops: float | None = None
    avg_review_score: float | None = None
    avg_review_count: float | None = None
    ops_delta_4w: float | None = None
    top_mover_title: str | None = None
    top_mover_appid: int | None = None


class TrendsPriceBucket(BaseModel):
    label: str
    range_label: str
    game_count: int = 0
    median_reviews: float = 0
    median_sentiment: float = 0
    avg_ops: float | None = None
    demo_pct: float = 0


class TrendsDemoCohort(BaseModel):
    label: str
    game_count: int = 0
    median_reviews: float = 0
    median_sentiment: float = 0
    avg_ops: float | None = None
    median_peak_ccu: float = 0


class TrendsSurger(BaseModel):
    appid: int
    title: str
    developer: str | None = None
    header_image_url: str | None = None
    subgenre: str = "Horror"
    price: float | None = None
    has_demo: bool = False
    ops_score: float | None = None
    ops_prev: float | None = None
    ops_delta: float | None = None
    review_count: int = 0
    review_delta_7d: int = 0
    review_score_pct: float = 0
    velocity_spark: list[int] = []


class TrendsHeadline(BaseModel):
    total_games: int = 0
    new_last_30d: int = 0
    total_reviews: int = 0
    avg_sentiment: float = 0
    breakout_count: int = 0
    yt_videos_tracked: int = 0
    yt_channels_covering: int = 0
    demo_pct: float = 0


class TrendsYoutubeGame(BaseModel):
    appid: int
    title: str
    total_views: int = 0
    unique_channels: int = 0
    header_image_url: str | None = None


class TrendsResponse(BaseModel):
    headline: TrendsHeadline
    market_pulse: list[TrendsWeekPoint] = []
    market_narrative: str = ""
    subgenres: list[TrendsSubgenre] = []
    subgenre_narrative: str = ""
    price_buckets: list[TrendsPriceBucket] = []
    demo_cohorts: list[TrendsDemoCohort] = []
    price_narrative: str = ""
    surgers: list[TrendsSurger] = []
    youtube_top: list[TrendsYoutubeGame] = []
    generated_at: datetime | None = None
