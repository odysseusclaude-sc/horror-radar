import logging

from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import sessionmaker, DeclarativeBase

logger = logging.getLogger(__name__)

from config import settings

connect_args = {}
if settings.database_url.startswith("sqlite"):
    connect_args["check_same_thread"] = False

engine = create_engine(settings.database_url, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# SQLite PRAGMA tuning — applied on every new connection
if settings.database_url.startswith("sqlite"):
    @event.listens_for(engine, "connect")
    def _set_sqlite_pragma(dbapi_conn, _connection_record):
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")    # write-ahead logging — allows concurrent reads
        cursor.execute("PRAGMA busy_timeout=5000")   # wait up to 5s on write locks
        cursor.execute("PRAGMA synchronous=NORMAL")  # safe + faster than FULL
        cursor.execute("PRAGMA cache_size=-65536")   # 64MB page cache
        cursor.close()


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
    _cleanup_stale_runs()


def _cleanup_stale_runs():
    """Mark any 'running' collection_runs as 'crashed' on startup.

    If the server is starting, no jobs can actually be running — these are
    orphans from a previous process that died mid-run.
    """
    with engine.connect() as conn:
        result = conn.execute(text(
            "UPDATE collection_runs SET status = 'crashed', "
            "error_message = 'Process died mid-run (cleaned up on restart)', "
            "finished_at = CURRENT_TIMESTAMP "
            "WHERE status = 'running'"
        ))
        conn.commit()
        if result.rowcount > 0:
            logger.warning(f"Cleaned up {result.rowcount} stale 'running' jobs from previous session")


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
        # Demo review tracking
        "ALTER TABLE games ADD COLUMN demo_appid INTEGER",
        "ALTER TABLE games ADD COLUMN demo_release_date DATE",
        "ALTER TABLE game_snapshots ADD COLUMN demo_review_count INTEGER",
        "ALTER TABLE game_snapshots ADD COLUMN demo_review_score_pct REAL",
        # OPS v3 components
        "ALTER TABLE ops_scores ADD COLUMN decay_component REAL",
        "ALTER TABLE ops_scores ADD COLUMN creator_response_component REAL",
        # Multiplayer classification
        "ALTER TABLE games ADD COLUMN is_multiplayer INTEGER DEFAULT 0",
        # Original (pre-discount) price in USD
        "ALTER TABLE games ADD COLUMN original_price_usd REAL",
        # OPS v5 — new scoring components and forecast
        "ALTER TABLE games ADD COLUMN subgenre TEXT",
        "ALTER TABLE ops_scores ADD COLUMN sentiment_component REAL",
        "ALTER TABLE ops_scores ADD COLUMN twitch_component REAL",
        "ALTER TABLE ops_scores ADD COLUMN forecast_7d REAL",
        "ALTER TABLE ops_scores ADD COLUMN forecast_confidence TEXT",
        # OPS v6 — 7-component engine additions
        "ALTER TABLE ops_scores ADD COLUMN review_momentum_component REAL",
        "ALTER TABLE ops_scores ADD COLUMN live_engagement_component REAL",
        "ALTER TABLE ops_scores ADD COLUMN community_buzz_component REAL",
        "ALTER TABLE ops_scores ADD COLUMN demo_conversion_component REAL",
        "ALTER TABLE ops_scores ADD COLUMN discount_demand_component REAL",
        "ALTER TABLE ops_scores ADD COLUMN calibration_constant REAL",
    ]
    with engine.connect() as conn:
        for stmt in alter_statements:
            try:
                conn.execute(text(stmt))
                conn.commit()
            except Exception:
                conn.rollback()  # column already exists, safe to ignore

    # Backfill is_multiplayer from tags JSON for existing games
    import json as _json
    _mp_tags = {"Multiplayer", "Co-op", "Online Co-Op", "Local Co-Op",
                "Local Multiplayer", "Online PvP", "Co-op Campaign"}
    with engine.connect() as conn:
        rows = conn.execute(text(
            "SELECT appid, tags FROM games WHERE (is_multiplayer IS NULL OR is_multiplayer = 0) AND tags IS NOT NULL"
        )).fetchall()
        updated = 0
        for appid, tags_json in rows:
            try:
                tags = _json.loads(tags_json)
                if _mp_tags & set(tags.keys()):
                    conn.execute(text("UPDATE games SET is_multiplayer = 1 WHERE appid = :appid"), {"appid": appid})
                    updated += 1
            except (ValueError, TypeError):
                pass
        conn.commit()
        if updated:
            logger.info(f"Backfilled is_multiplayer for {updated} games")
