from __future__ import annotations

"""Stage 2: Metadata Fetch

For each discovered AppID:
1. Fetch appdetails from Steam
2. Fetch tags from SteamSpy (user-voted, more reliable than Steam categories)
3. Apply filters: is_indie, is_horror, not major_publisher
4. Pass → games table; Fail → discarded_games table with reason
"""
import json
import logging
from datetime import date, datetime, timedelta, timezone

import httpx

from collectors._http import fetch_with_retry, steam_limiter, steamspy_limiter
from config import CORE_HORROR_TAGS, INDIE_PUBLISHERS, MAJOR_PUBLISHERS
from database import SessionLocal
from models import CollectionRun, DiscardedGame, Game

logger = logging.getLogger(__name__)

STEAM_APPDETAILS_URL = "https://store.steampowered.com/api/appdetails"
STEAMSPY_APPDETAILS_URL = "https://steamspy.com/api.php"
MAX_AGE_DAYS = 730  # ~24 months per original spec


def _parse_release_date(date_str: str) -> date | None:
    """Parse Steam's various release date formats."""
    for fmt in ("%b %d, %Y", "%d %b, %Y", "%B %d, %Y", "%Y-%m-%d", "%b %Y"):
        try:
            return datetime.strptime(date_str, fmt).date()
        except ValueError:
            continue
    logger.warning(f"Could not parse release date: {date_str}")
    return None


def _is_indie(genres: list[str], developer: str | None, publisher: str | None) -> bool:
    if "Indie" in genres:
        return True
    if developer and publisher and developer == publisher:
        return True
    if publisher and publisher in INDIE_PUBLISHERS:
        return True
    return False


def _is_horror(tags: dict[str, int], genres: list[str] | None = None) -> bool:
    # Check SteamSpy user-voted tags first
    if CORE_HORROR_TAGS & set(tags.keys()):
        return True
    # Fallback: check Steam genres (for new games without SteamSpy data yet)
    if genres:
        genre_horror = {"Horror", "Psychological Horror", "Survival Horror"}
        if genre_horror & set(genres):
            return True
    return False


def _is_major_publisher(publisher: str | None) -> bool:
    return publisher in MAJOR_PUBLISHERS if publisher else False


async def _fetch_and_classify(
    client: httpx.AsyncClient, appid: int, trust_horror: bool = False
) -> tuple[dict | None, str | None]:
    """Fetch metadata + tags, classify as game or discard.

    If trust_horror=True, skip horror tag verification (game came from
    SteamSpy Horror tag endpoint, so we already know it's horror-tagged).

    Returns (game_data, None) on pass, or (None, reason) on discard.
    """
    # Fetch Steam appdetails
    steam_data = await fetch_with_retry(
        client,
        STEAM_APPDETAILS_URL,
        params={"appids": str(appid), "cc": "us", "l": "en"},
        limiter=steam_limiter,
    )

    if not steam_data:
        return None, "fetch_failed"

    app_entry = steam_data.get(str(appid), {})
    if not app_entry.get("success"):
        return None, "not_found"

    data = app_entry.get("data", {})
    if data.get("type") != "game":
        return None, "not_a_game"

    # Parse release date and check age
    release_info = data.get("release_date", {})
    if release_info.get("coming_soon"):
        return None, "coming_soon"

    release_date = _parse_release_date(release_info.get("date", ""))
    if release_date:
        cutoff = date.today() - timedelta(days=MAX_AGE_DAYS)
        if release_date < cutoff:
            return None, "too_old"

    # Extract genres
    genres = [g["description"] for g in data.get("genres", [])]

    # Fetch SteamSpy for user-voted tags
    spy_data = await fetch_with_retry(
        client,
        STEAMSPY_APPDETAILS_URL,
        params={"request": "appdetails", "appid": str(appid)},
        limiter=steamspy_limiter,
    )
    raw_tags = spy_data.get("tags", {}) if spy_data else {}
    # SteamSpy returns tags as dict {"Horror": 142} or sometimes as list []
    if isinstance(raw_tags, dict):
        tags = raw_tags
    else:
        tags = {}

    # Extract metadata
    developer = data.get("developers", [None])[0] if data.get("developers") else None
    publisher = data.get("publishers", [None])[0] if data.get("publishers") else None

    # Apply filters
    if _is_major_publisher(publisher):
        return None, "major_publisher"

    if not trust_horror and not _is_horror(tags, genres):
        return None, "not_horror"

    indie = _is_indie(genres, developer, publisher)
    if not indie:
        return None, "not_indie"

    # Extract price
    price_usd = None
    price_overview = data.get("price_overview")
    if price_overview:
        price_usd = price_overview.get("final", 0) / 100
    elif data.get("is_free"):
        price_usd = 0.0

    game_data = {
        "appid": appid,
        "title": data.get("name", ""),
        "developer": developer,
        "publisher": publisher,
        "release_date": release_date,
        "price_usd": price_usd,
        "genres": json.dumps(genres),
        "tags": json.dumps(tags),
        "is_indie": True,
        "is_horror": True,
        "header_image_url": data.get("header_image"),
        "short_description": data.get("short_description"),
    }

    return game_data, None


async def run_metadata_fetch(appids: list[int], trust_horror: bool = False):
    """Fetch metadata for a list of AppIDs and persist results.

    If trust_horror=True, skip horror tag verification (AppIDs came from
    a known Horror tag source like SteamSpy).
    """
    if not appids:
        logger.info("No AppIDs to fetch metadata for")
        return

    db = SessionLocal()
    run = CollectionRun(job_name="metadata", status="running")
    db.add(run)
    db.commit()
    db.refresh(run)

    processed = 0
    failed = 0

    try:
        async with httpx.AsyncClient() as client:
            for appid in appids:
                try:
                    game_data, discard_reason = await _fetch_and_classify(client, appid, trust_horror=trust_horror)

                    if game_data:
                        existing = db.query(Game).filter_by(appid=appid).first()
                        if existing:
                            for key, value in game_data.items():
                                setattr(existing, key, value)
                        else:
                            db.add(Game(**game_data))
                        processed += 1
                    elif discard_reason:
                        existing = db.query(DiscardedGame).filter_by(appid=appid).first()
                        if not existing:
                            db.add(DiscardedGame(
                                appid=appid,
                                title=f"AppID:{appid}",
                                reason=discard_reason,
                            ))
                        failed += 1

                    db.commit()

                except Exception as e:
                    logger.error(f"Error processing AppID {appid}: {e}")
                    db.rollback()
                    failed += 1

        run.status = "success" if failed == 0 else "partial"
        run.items_processed = processed
        run.items_failed = failed
        run.finished_at = datetime.now(timezone.utc)
        db.commit()

        logger.info(f"Metadata fetch complete: {processed} games added, {failed} discarded/failed")

    except Exception as e:
        run.status = "failed"
        run.error_message = str(e)
        run.finished_at = datetime.now(timezone.utc)
        db.commit()
        logger.exception("Metadata fetch failed")
    finally:
        db.close()
