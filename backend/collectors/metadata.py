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
import re
from datetime import date, datetime, timedelta, timezone

import httpx

from collectors._http import fetch_with_retry, steam_limiter, steamspy_limiter
from config import CORE_HORROR_TAGS, HORROR_DESCRIPTION_KEYWORDS, INDIE_PUBLISHERS, MAJOR_PUBLISHERS
from database import SessionLocal
from models import CollectionRun, DiscardedGame, Game

logger = logging.getLogger(__name__)

STEAM_APPDETAILS_URL = "https://store.steampowered.com/api/appdetails"
STEAM_STORE_PAGE_URL = "https://store.steampowered.com/app/{appid}/"
STEAMSPY_APPDETAILS_URL = "https://steamspy.com/api.php"
MAX_AGE_DAYS = 90  # ~3 months — focus on active breakout window

_STORE_PAGE_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    "Accept-Language": "en-US,en;q=0.9",
}
_STORE_PAGE_COOKIES = {"birthtime": "0", "mature_content": "1", "lastagecheckage": "1-0-2000"}


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


def _is_horror(
    tags: dict[str, int],
    genres: list[str] | None = None,
    description: str | None = None,
) -> bool:
    """5-layer horror classification chain.

    Layer 1: SteamSpy/store-page user-voted tags (most reliable)
    Layer 2: Steam genre categories
    Layer 3: Description keyword scan (broadened keyword list)
    """
    # Layer 1: Check user-voted tags against expanded CORE_HORROR_TAGS
    if CORE_HORROR_TAGS & set(tags.keys()):
        return True

    # Layer 2: Check Steam genres
    if genres:
        genre_horror = {"Horror", "Psychological Horror", "Survival Horror"}
        if genre_horror & set(genres):
            return True

    # Layer 3: Scan description for horror-related keywords
    if description:
        desc_lower = description.lower()
        for kw in HORROR_DESCRIPTION_KEYWORDS:
            if kw in desc_lower:
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
    # SteamSpy returns tags as dict {"Horror": 142} or sometimes as list ["Horror", "Adventure"]
    if isinstance(raw_tags, dict):
        tags = raw_tags
    elif isinstance(raw_tags, list):
        tags = {tag: 0 for tag in raw_tags}
    else:
        tags = {}

    # If SteamSpy has no tags yet (game too new), scrape them from the Steam store page.
    # Steam embeds user-voted tags as JSON in InitAppTagModal() on every store page.
    if not tags:
        try:
            r = await client.get(
                STEAM_STORE_PAGE_URL.format(appid=appid),
                headers=_STORE_PAGE_HEADERS,
                cookies=_STORE_PAGE_COOKIES,
                follow_redirects=True,
                timeout=15,
            )
            match = re.search(r"InitAppTagModal\(\s*\d+\s*,\s*(\[.*?\])\s*,", r.text, re.DOTALL)
            if match:
                store_tags = json.loads(match.group(1))
                tags = {t["name"]: 0 for t in store_tags if "name" in t}
                logger.debug(f"AppID {appid}: used store page tags (SteamSpy empty): {list(tags.keys())[:5]}")
        except Exception as e:
            logger.debug(f"AppID {appid}: store page tag scrape failed: {e}")

    # Extract metadata
    developer = data.get("developers", [None])[0] if data.get("developers") else None
    publisher = data.get("publishers", [None])[0] if data.get("publishers") else None

    # Apply filters
    if _is_major_publisher(publisher):
        return None, "major_publisher"

    # Build combined description: short_description + about_the_game (HTML stripped)
    short_desc = data.get("short_description") or ""
    about_raw = data.get("about_the_game") or ""
    about_clean = re.sub(r"<[^>]+>", " ", about_raw)
    combined_desc = f"{short_desc} {about_clean}".strip() or None

    if not trust_horror and not _is_horror(tags, genres, combined_desc):
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

    # Demo flag + AppID: Steam appdetails includes a "demos" list when a demo exists
    demos = data.get("demos")
    has_demo = bool(demos)
    demo_appid = None
    if demos and isinstance(demos, list) and len(demos) > 0:
        demo_appid = demos[0].get("appid")

    # Next Fest flag: check if any package group name or category mentions "Next Fest"
    # Steam sometimes includes this in categories or package group titles during events
    next_fest = False
    categories = data.get("categories", [])
    for cat in categories:
        if "next fest" in cat.get("description", "").lower():
            next_fest = True
            break
    if not next_fest:
        for pkg in data.get("package_groups", []):
            if "next fest" in pkg.get("title", "").lower():
                next_fest = True
                break

    game_data = {
        "appid": appid,
        "title": data.get("name", ""),
        "developer": developer,
        "publisher": publisher,
        "release_date": release_date,
        "price_usd": price_usd,
        "genres": json.dumps(genres),
        "tags": json.dumps(tags),
        "is_indie": indie,
        "is_horror": _is_horror(tags, genres, combined_desc),
        "header_image_url": data.get("header_image"),
        "short_description": data.get("short_description"),
        "has_demo": has_demo,
        "demo_appid": demo_appid,
        "next_fest": next_fest,
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
