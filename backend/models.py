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
    genres = Column(Text)  # JSON string, e.g. '["Indie","Action"]'
    tags = Column(Text)    # JSON string with vote counts, e.g. '{"Horror":142,"Indie":98}'
    is_indie = Column(Boolean, default=False)
    is_horror = Column(Boolean, default=False)
    header_image_url = Column(String)
    short_description = Column(Text)
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
    created_at = Column(DateTime, default=_utcnow)

    game = relationship("Game", back_populates="ops_scores")

    __table_args__ = (
        UniqueConstraint("appid", "score_date", name="uq_ops_score_date"),
    )
