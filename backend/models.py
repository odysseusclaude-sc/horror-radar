from datetime import date, datetime, timezone
from sqlalchemy import (
    Boolean, Column, Date, DateTime, Float, ForeignKey, Integer, String, Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship

from database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Game(Base):
    __tablename__ = "games"

    id = Column(Integer, primary_key=True)
    appid = Column(Integer, unique=True, nullable=False, index=True)
    title = Column(String, nullable=False)
    developer = Column(String)
    publisher = Column(String)
    release_date = Column(Date, index=True)
    price_usd = Column(Float)
    original_price_usd = Column(Float)  # pre-discount price (price_overview.initial / 100)
    genres = Column(Text)  # JSON string, e.g. '["Indie","Action"]'
    tags = Column(Text)    # JSON string with vote counts, e.g. '{"Horror":142,"Indie":98}'
    is_indie = Column(Boolean, default=False)
    is_horror = Column(Boolean, default=False)
    header_image_url = Column(String)
    short_description = Column(Text)
    has_demo = Column(Boolean, default=False)
    demo_appid = Column(Integer)  # Steam AppID of the demo (if any)
    demo_release_date = Column(Date)  # When the demo was released on Steam
    next_fest = Column(Boolean, default=False)
    is_multiplayer = Column(Boolean, default=False)
    subgenre = Column(String)  # OPS v5 — e.g. "psychological", "supernatural", "cosmic"
    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)

    snapshots = relationship("GameSnapshot", back_populates="game", lazy="dynamic")
    ops_scores = relationship("OpsScore", back_populates="game", lazy="dynamic")


class DiscardedGame(Base):
    __tablename__ = "discarded_games"

    id = Column(Integer, primary_key=True)
    appid = Column(Integer, unique=True, nullable=False, index=True)
    title = Column(String)
    reason = Column(String, nullable=False)  # "not_indie", "not_horror", "major_publisher"
    checked_at = Column(DateTime, default=_utcnow)


class GameSnapshot(Base):
    __tablename__ = "game_snapshots"

    id = Column(Integer, primary_key=True)
    appid = Column(Integer, ForeignKey("games.appid"), nullable=False, index=True)
    snapshot_date = Column(Date, nullable=False, index=True)
    review_count = Column(Integer)
    review_score_pct = Column(Float)
    total_positive = Column(Integer)
    total_negative = Column(Integer)
    estimated_owners_low = Column(Integer)
    estimated_owners_high = Column(Integer)
    low_confidence_owners = Column(Boolean, default=False)
    peak_ccu = Column(Integer)
    current_ccu = Column(Integer)
    average_playtime_forever = Column(Integer)
    review_velocity_7d = Column(Float)  # avg reviews/day in first 7 days
    completion_rate = Column(Float)     # % of players with final achievement
    median_achievement_pct = Column(Float)  # median across all achievements
    patch_count_30d = Column(Integer)   # patches in last 30 days
    days_since_last_update = Column(Integer)
    twitch_peak_viewers = Column(Integer)
    twitch_concurrent_streams = Column(Integer)
    demo_review_count = Column(Integer)       # reviews on the demo itself
    demo_review_score_pct = Column(Float)     # positive % on the demo
    created_at = Column(DateTime, default=_utcnow)

    game = relationship("Game", back_populates="snapshots")

    __table_args__ = (
        UniqueConstraint("appid", "snapshot_date", name="uq_game_snapshot_date"),
    )


class YoutubeChannel(Base):
    __tablename__ = "youtube_channels"

    id = Column(Integer, primary_key=True)
    channel_id = Column(String, unique=True, nullable=False, index=True)
    handle = Column(String)
    name = Column(String, nullable=False)
    subscriber_count = Column(Integer)
    total_views = Column(Integer)
    video_count = Column(Integer)
    match_mode = Column(String, default="title")  # "title" or "description"
    tier = Column(Integer, default=1)  # 1=seed, 2=auto-discovered
    discovered_from = Column(String)   # channel_id of the seed channel that linked here
    collected_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)

    videos = relationship("YoutubeVideo", back_populates="channel", lazy="dynamic")


class YoutubeVideo(Base):
    __tablename__ = "youtube_videos"

    id = Column(Integer, primary_key=True)
    video_id = Column(String, unique=True, nullable=False, index=True)
    channel_id = Column(String, ForeignKey("youtube_channels.channel_id"), nullable=False, index=True)
    title = Column(String, nullable=False)
    description = Column(Text)
    published_at = Column(DateTime, index=True)
    view_count = Column(Integer)
    like_count = Column(Integer)
    comment_count = Column(Integer)
    duration_seconds = Column(Integer)
    view_48h = Column(Integer)  # views captured within 48h of publish
    matched_appid = Column(Integer, ForeignKey("games.appid"), nullable=True)
    match_score = Column(Float)
    collected_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)

    channel = relationship("YoutubeChannel", back_populates="videos")
    matched_game = relationship("Game", foreign_keys=[matched_appid])


class YoutubeVideoSnapshot(Base):
    __tablename__ = "youtube_video_snapshots"

    id = Column(Integer, primary_key=True)
    video_id = Column(String, ForeignKey("youtube_videos.video_id"), nullable=False, index=True)
    snapshot_date = Column(Date, nullable=False, index=True)
    view_count = Column(Integer)
    like_count = Column(Integer)
    comment_count = Column(Integer)
    created_at = Column(DateTime, default=_utcnow)

    video = relationship("YoutubeVideo")

    __table_args__ = (
        UniqueConstraint("video_id", "snapshot_date", name="uq_yt_video_snapshot_date"),
    )


class CollectionRun(Base):
    __tablename__ = "collection_runs"

    id = Column(Integer, primary_key=True)
    job_name = Column(String, nullable=False)  # "discovery", "metadata", "reviews", etc.
    status = Column(String, nullable=False, default="running")  # running|success|partial|failed
    items_processed = Column(Integer, default=0)
    items_failed = Column(Integer, default=0)
    error_message = Column(Text)
    started_at = Column(DateTime, default=_utcnow)
    finished_at = Column(DateTime)
    api_calls_made = Column(Integer, default=0)
    api_calls_rate_limited = Column(Integer, default=0)


class OpsScore(Base):
    __tablename__ = "ops_scores"

    id = Column(Integer, primary_key=True)
    appid = Column(Integer, ForeignKey("games.appid"), nullable=False, index=True)
    score_date = Column(Date, nullable=False, index=True)
    score = Column(Float)  # 0-100 normalized
    confidence = Column(String)  # "low", "medium", "high"
    review_component = Column(Float)
    ccu_component = Column(Float)
    youtube_component = Column(Float)
    wishlist_bonus = Column(Float, default=0.0)
    raw_ops = Column(Float)
    velocity_component = Column(Float)
    decay_component = Column(Float)       # v3: velocity decay rate
    creator_response_component = Column(Float)  # v3: velocity response to YT coverage
    price_modifier = Column(Float)
    youtube_breadth = Column(Float)
    formula_version = Column(String, default="v1")  # String from v6 onwards ("v6.0")
    # OPS v5 additions
    sentiment_component = Column(Float)
    twitch_component = Column(Float)
    forecast_7d = Column(Float)
    forecast_confidence = Column(String)  # "high", "medium", "low"
    # OPS v6 additions
    review_momentum_component = Column(Float)   # merged: velocity + volume + retention
    live_engagement_component = Column(Float)   # merged: CCU + Twitch
    community_buzz_component = Column(Float)    # new: Reddit grassroots
    demo_conversion_component = Column(Float)   # new: demo → launch funnel
    discount_demand_component = Column(Float)   # new: discount-dampened velocity
    calibration_constant = Column(Float)        # weekly P95=85 calibration constant
    created_at = Column(DateTime, default=_utcnow)

    game = relationship("Game", back_populates="ops_scores")

    __table_args__ = (
        UniqueConstraint("appid", "score_date", name="uq_ops_score_date"),
    )


class TwitchSnapshot(Base):
    __tablename__ = "twitch_snapshots"

    id = Column(Integer, primary_key=True)
    appid = Column(Integer, ForeignKey("games.appid"), nullable=False, index=True)
    snapshot_date = Column(Date, nullable=False, index=True)
    concurrent_streams = Column(Integer)
    peak_viewers = Column(Integer)
    total_viewers = Column(Integer)
    unique_streamers = Column(Integer)
    created_at = Column(DateTime, default=_utcnow)

    game = relationship("Game")

    __table_args__ = (
        UniqueConstraint("appid", "snapshot_date", name="uq_twitch_snapshot_date"),
    )


class RedditMention(Base):
    __tablename__ = "reddit_mentions"

    id = Column(Integer, primary_key=True)
    appid = Column(Integer, ForeignKey("games.appid"), nullable=False, index=True)
    post_id = Column(String, unique=True, nullable=False, index=True)
    subreddit = Column(String, nullable=False)
    title = Column(String, nullable=False)
    score = Column(Integer)
    num_comments = Column(Integer)
    upvote_ratio = Column(Float)
    post_url = Column(String)
    posted_at = Column(DateTime, index=True)
    collected_at = Column(DateTime, default=_utcnow)

    game = relationship("Game")


class DeveloperProfile(Base):
    __tablename__ = "developer_profiles"

    id = Column(Integer, primary_key=True)
    developer_name = Column(String, unique=True, nullable=False, index=True)
    total_games = Column(Integer, default=0)
    total_reviews = Column(Integer, default=0)
    avg_review_score = Column(Float)
    best_game_appid = Column(Integer)
    best_game_reviews = Column(Integer)
    scope = Column(String, default="db_only")  # "db_only" — future: "steam_full"
    computed_at = Column(DateTime, default=_utcnow)


class DataAnomaly(Base):
    __tablename__ = "data_anomalies"

    id = Column(Integer, primary_key=True)
    appid = Column(Integer, nullable=False, index=True, default=0)
    field_name = Column(String, nullable=False)
    expected_range = Column(String, nullable=False)
    actual_value = Column(Float, nullable=False)
    detected_at = Column(DateTime, nullable=False, default=_utcnow)
    resolved = Column(Integer, default=0)


class PendingMetadata(Base):
    __tablename__ = "pending_metadata"

    appid = Column(Integer, primary_key=True)
    source = Column(String, default="discovery")       # discovery | manual | requeue
    priority = Column(Integer, default=2)              # 1=urgent, 2=normal, 3=low
    added_at = Column(DateTime, default=datetime.utcnow)
    next_eligible_at = Column(DateTime, default=datetime.utcnow)
    attempt_count = Column(Integer, default=0)
    last_status = Column(String, nullable=True)        # pending | failed | success | dead
    last_attempted_at = Column(DateTime, nullable=True)
    last_error = Column(String, nullable=True)


class DeadLetter(Base):
    __tablename__ = "dead_letters"

    id = Column(Integer, primary_key=True, autoincrement=True)
    queue_name = Column(String, default="pending_metadata")
    item_key = Column(Integer)                         # appid
    error_class = Column(String, nullable=True)
    error_detail = Column(String, nullable=True)
    attempts = Column(Integer, default=0)
    first_failed_at = Column(DateTime, default=datetime.utcnow)
    last_failed_at = Column(DateTime, default=datetime.utcnow)
    expires_at = Column(DateTime)                      # 7 days TTL
    status = Column(String, default="dead")            # dead | reprocessing | resolved
