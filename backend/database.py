import logging

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, DeclarativeBase

logger = logging.getLogger(__name__)

from config import settings

connect_args = {}
if settings.database_url.startswith("sqlite"):
    connect_args["check_same_thread"] = False

engine = create_engine(settings.database_url, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    import models  # noqa: F401 — ensure all models are registered
    Base.metadata.create_all(bind=engine)
    _run_migrations()


def _run_migrations():
    """Add columns that create_all cannot add to existing tables."""
    alter_statements = [
        "ALTER TABLE game_snapshots ADD COLUMN review_velocity_7d REAL",
        "ALTER TABLE ops_scores ADD COLUMN velocity_component REAL",
        "ALTER TABLE ops_scores ADD COLUMN price_modifier REAL",
        "ALTER TABLE ops_scores ADD COLUMN youtube_breadth REAL",
        "ALTER TABLE ops_scores ADD COLUMN formula_version INTEGER DEFAULT 2",
        # Tier 1 & 2 additions
        "ALTER TABLE games ADD COLUMN has_demo INTEGER DEFAULT 0",
        "ALTER TABLE games ADD COLUMN next_fest INTEGER DEFAULT 0",
        "ALTER TABLE game_snapshots ADD COLUMN completion_rate REAL",
        "ALTER TABLE game_snapshots ADD COLUMN median_achievement_pct REAL",
        "ALTER TABLE game_snapshots ADD COLUMN patch_count_30d INTEGER",
        "ALTER TABLE game_snapshots ADD COLUMN days_since_last_update INTEGER",
        "ALTER TABLE game_snapshots ADD COLUMN twitch_peak_viewers INTEGER",
        "ALTER TABLE game_snapshots ADD COLUMN twitch_concurrent_streams INTEGER",
    ]
    with engine.connect() as conn:
        for stmt in alter_statements:
            try:
                conn.execute(text(stmt))
                conn.commit()
            except Exception:
                conn.rollback()  # column already exists, safe to ignore
