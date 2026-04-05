from __future__ import annotations

"""Stage 2: Metadata Fetch

For each discovered AppID:
1. Fetch appdetails from Steam
2. Fetch tags from SteamSpy (user-voted, more reliable than Steam categories)
3. Apply filters: is_indie, is_horror, not major_publisher
4. Pass → games table; Fail → discarded_games table with reason
"""
import asyncio
import json
import logging
import re
from datetime import date, datetime, timedelta, timezone

import httpx

from collectors._http import fetch_with_retry, steam_limiter, steamspy_limiter
from config import (
    CORE_HORROR_TAGS, HORROR_DESCRIPTION_KEYWORDS, INDIE_PUBLISHERS,
    MAJOR_PUBLISHER_TOKENS, AMBIGUOUS_HORROR_TAGS, STRONG_HORROR_TAGS, ANTI_HORROR_TAGS,
    NON_HORROR_GENRE_TAGS,
)
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
    # Major publishers are never indie, even if Steam genre says "Indie"
    if _is_major_publisher(publisher, developer):
        return False
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
    """5-layer horror classification chain with ambiguity filtering.

    Layer 0: Vote count filtering — ignore unvoted tags when real votes exist
    Layer 1: Strong horror tags — pass unless:
             (a) heavily overridden by anti-horror tags, OR
             (b) dominated by non-horror genre tags, OR
             (c) horror tag is a weak signal (bottom third by votes)
    Layer 2: Ambiguous tags (Zombies, Dark, Lovecraftian, etc.) — only pass if
             description confirms horror OR Steam genre confirms horror
    Layer 3: Steam genre categories
    Layer 4: Description keyword scan
    """
    tag_set = set(tags.keys())
    anti_matches = ANTI_HORROR_TAGS & tag_set

    # Layer 0: If vote counts are available, filter to tags with meaningful votes.
    # SteamSpy sometimes returns all tags with 0 votes; Steam store tags have real counts.
    has_vote_counts = any(v > 0 for v in tags.values())
    if has_vote_counts:
        # Only consider tags with at least 1 vote for classification
        voted_tags = {k for k, v in tags.items() if v > 0}
        tag_set = voted_tags
        anti_matches = ANTI_HORROR_TAGS & tag_set

    # Helper: does the description explicitly mention horror?
    desc_confirms_horror = False
    if description:
        desc_lower = description.lower()
        for kw in HORROR_DESCRIPTION_KEYWORDS:
            if kw in desc_lower:
                desc_confirms_horror = True
                break

    # Helper: do Steam genres include horror?
    genre_confirms_horror = False
    if genres:
        genre_confirms_horror = bool({"Horror", "Psychological Horror", "Survival Horror"} & set(genres))

    # Layer 1: Strong horror tags → pass unless heavily overridden by anti-horror
    #          or dominated by non-horror genre tags (Romance, Dating Sim, etc.)
    strong_matches = STRONG_HORROR_TAGS & tag_set
    non_horror_matches = NON_HORROR_GENRE_TAGS & tag_set
    if strong_matches:
        # If anti-horror tags significantly outnumber strong horror tags (3+ more),
        # this is likely a non-horror game with a minor/troll "Horror" tag.
        # Games like "cute horror" or "horror comedy" with 1-2 anti tags still pass.
        if len(anti_matches) >= len(strong_matches) + 3:
            return False
        # When tags are unvoted (all 0 votes), they're untrustworthy — a single "Horror"
        # tag on a romance dating sim is likely noise. Reject if non-horror genre tags
        # dominate and the description doesn't confirm horror.
        if not has_vote_counts and not desc_confirms_horror and len(non_horror_matches) >= len(strong_matches) + 1:
            return False
        # NON_HORROR_GENRE_TAGS (City Builder, Puzzle, Racing, etc.) are strong
        # non-horror identity signals. When tags have real vote counts, the presence
        # of these tags means the game's identity is primarily non-horror — reject
        # unless description or genre confirms horror.
        # E.g., "Beta Massage Parlor Simulator" with City Builder + Horror tags.
        # Only applies to voted tags — unvoted tags are unreliable (handled below).
        if has_vote_counts and non_horror_matches and not desc_confirms_horror and not genre_confirms_horror:
            return False
        # Even with voted tags: if the combined weight of anti-horror + non-horror
        # genre tags exceeds horror tag votes, the game's identity is primarily
        # non-horror (horror is just flavoring). Reject unless description or genre confirms.
        if has_vote_counts and not desc_confirms_horror and not genre_confirms_horror:
            all_non_horror = non_horror_matches | anti_matches
            if all_non_horror:
                horror_votes = sum(tags.get(t, 0) for t in strong_matches)
                non_horror_votes = sum(tags.get(t, 0) for t in all_non_horror)
                if non_horror_votes > horror_votes:
                    return False
        # Weak horror signal check: if all strong horror tags rank in the bottom
        # third of the game's tag list by vote count, horror is likely just
        # flavoring (e.g., a bullet-hell shooter with a minor "Horror" tag).
        # Require description or genre confirmation.
        if has_vote_counts and not desc_confirms_horror and not genre_confirms_horror:
            sorted_tags = sorted(
                [(k, v) for k, v in tags.items() if v > 0],
                key=lambda x: x[1], reverse=True,
            )
            voted_count = len(sorted_tags)
            if voted_count >= 6:
                bottom_third_start = voted_count * 2 // 3
                bottom_tag_names = {t[0] for t in sorted_tags[bottom_third_start:]}
                if strong_matches <= bottom_tag_names:
                    return False
        return True

    # Layer 2: Ambiguous horror tags — require validation
    ambiguous_matches = AMBIGUOUS_HORROR_TAGS & tag_set
    if ambiguous_matches:
        # If anti-horror tags are present, reject — not horror
        if anti_matches:
            return False
        # Ambiguous tags alone (Lovecraftian, Dark, Zombies, etc.) are not enough.
        # Many non-horror games use these for aesthetic (tactical RPGs, roguelikes,
        # card games). Require description keywords OR Steam genre confirmation.
        if desc_confirms_horror or genre_confirms_horror:
            return True
        return False

    # Layer 3: Check Steam genres
    if genre_confirms_horror:
        return True

    # Layer 4: Scan description for horror-related keywords
    if desc_confirms_horror:
        return True

    return False


def _is_major_publisher(publisher: str | None, developer: str | None = None) -> bool:
    """Substring match against known major publisher tokens (case-insensitive)."""
    for field in (publisher, developer):
        if not field:
            continue
        lower = field.lower()
        for token in MAJOR_PUBLISHER_TOKENS:
            if token in lower:
                return True
    return False


MULTIPLAYER_TAGS = {
    "Multiplayer", "Co-op", "Online Co-Op", "Local Co-Op",
    "Local Multiplayer", "Online PvP", "Co-op Campaign",
}


def _is_multiplayer(tags: dict) -> bool:
    """Check if a game has multiplayer/co-op tags."""
    return bool(MULTIPLAYER_TAGS & set(tags.keys()))


# Subgenre classification maps (OPS v5)
# Keys are subgenre slugs; values are lists of Steam tags that vote for them.
# Priority order matters for ties: first key in the dict wins.
_SUBGENRE_TAG_MAP: dict[str, list[str]] = {
    "psychological": ["Psychological Horror", "Psychological", "Atmospheric"],
    "supernatural":  ["Ghosts", "Supernatural", "Paranormal", "Demons"],
    "cosmic":        ["Lovecraftian", "Cosmic Horror"],
    "survival":      ["Survival Horror", "Stealth", "Survival"],
    "action_horror": ["Action", "Shooter", "Combat"],
    "slasher":       ["Gore", "Violent"],
}

# Description keyword signals (contribute 30 synthetic votes each match)
_SUBGENRE_KW_MAP: dict[str, list[str]] = {
    "psychological": ["psychological", "sanity", "mind", "hallucin", "paranoia"],
    "supernatural":  ["ghost", "supernatural", "paranormal", "demon", "possess"],
    "cosmic":        ["lovecraft", "cosmic", "eldritch", "old one", "void"],
    "survival":      ["survive", "survival", "stealth", "hide", "escape"],
    "action_horror": ["action", "shoot", "combat", "fight", "weapon"],
    "slasher":       ["slasher", "gore", "blood", "killer", "serial"],
}
_SUBGENRE_KW_VOTES = 30  # synthetic votes per keyword match


def _classify_subgenre(tags: dict, description: str) -> str | None:
    """Classify a horror game into a subgenre slug.

    Uses tag vote counts + description keyword matches to score each subgenre.
    The highest-scoring subgenre wins; ties resolved by priority order in
    _SUBGENRE_TAG_MAP. Returns None if no signal is found.

    Args:
        tags:        SteamSpy tag dict {name: vote_count}.
        description: Combined game description (HTML-stripped).

    Returns:
        Subgenre slug string or None.
    """
    scores: dict[str, int] = {slug: 0 for slug in _SUBGENRE_TAG_MAP}
    lower_desc = description.lower() if description else ""

    # Score from tag votes
    for slug, tag_list in _SUBGENRE_TAG_MAP.items():
        for tag in tag_list:
            votes = tags.get(tag, 0)
            scores[slug] += votes if isinstance(votes, int) else 0

    # Score from description keywords (synthetic votes)
    for slug, keywords in _SUBGENRE_KW_MAP.items():
        for kw in keywords:
            if kw in lower_desc:
                scores[slug] += _SUBGENRE_KW_VOTES

    # Pick the highest-scoring subgenre; None if all zero
    best_slug = max(scores, key=lambda s: scores[s])
    if scores[best_slug] == 0:
        return None
    return best_slug


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
        # Steam returns {"appid": {"success": false}} for both genuinely
        # missing games AND rate-limited requests. If there's no "data" key
        # at all, this is likely a rate-limit (real 404s still include data:{}).
        # Signal as retriable rather than permanently discarding.
        if "data" not in app_entry:
            return None, "rate_limited"
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
    if _is_major_publisher(publisher, developer):
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
    original_price_usd = None
    price_overview = data.get("price_overview")
    if price_overview:
        price_usd = price_overview.get("final", 0) / 100
        original_price_usd = price_overview.get("initial", 0) / 100
    elif data.get("is_free"):
        price_usd = 0.0
        original_price_usd = 0.0

    # Multiplayer detection via Steam category IDs (supplement tag-based detection)
    # IDs: 1=Multi-player, 36=Online Multi-Player, 38=Online Co-Op, 9=Co-op
    _MULTIPLAYER_CATEGORY_IDS = {1, 9, 36, 38}
    is_multiplayer_by_category = any(
        cat.get("id") in _MULTIPLAYER_CATEGORY_IDS for cat in categories
    )

    # Demo flag + AppID: Steam appdetails includes a "demos" list when a demo exists
    demos = data.get("demos")
    has_demo = bool(demos)
    demo_appid = None
    demo_release_date = None
    if demos and isinstance(demos, list) and len(demos) > 0:
        demo_appid = demos[0].get("appid")
        # Fetch demo's release date from its own appdetails
        if demo_appid and client:
            try:
                demo_data = await fetch_with_retry(
                    client,
                    STEAM_APPDETAILS_URL,
                    params={"appids": str(demo_appid), "cc": "us", "l": "en"},
                    limiter=steam_limiter,
                )
                if demo_data:
                    demo_entry = demo_data.get(str(demo_appid), {})
                    if demo_entry.get("success"):
                        demo_info = demo_entry.get("data", {}).get("release_date", {})
                        demo_release_date = _parse_release_date(demo_info.get("date", ""))
            except Exception as e:
                logger.debug(f"Could not fetch demo release date for {demo_appid}: {e}")

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
        "is_multiplayer": _is_multiplayer(tags) or is_multiplayer_by_category,
        "original_price_usd": original_price_usd,
        "subgenre": _classify_subgenre(tags, combined_desc),
        "header_image_url": data.get("header_image"),
        "short_description": data.get("short_description"),
        "has_demo": has_demo,
        "demo_appid": demo_appid,
        "demo_release_date": demo_release_date,
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
    rate_limit_retries = 0  # Track consecutive rate limits for adaptive backoff

    try:
        async with httpx.AsyncClient() as client:
            # Build work queue — each item gets up to 3 attempts
            queue: list[tuple[int, int]] = [(appid, 0) for appid in appids]

            while queue:
                appid, attempt = queue.pop(0)
                try:
                    game_data, discard_reason = await _fetch_and_classify(client, appid, trust_horror=trust_horror)

                    # Transient failures: don't permanently discard, just skip
                    if discard_reason in ("rate_limited", "fetch_failed"):
                        if attempt < 3:
                            # Put back in queue for retry
                            queue.append((appid, attempt + 1))
                            rate_limit_retries += 1
                            # Adaptive backoff: longer pauses as rate limits pile up
                            if rate_limit_retries <= 3:
                                wait = 30
                            elif rate_limit_retries <= 10:
                                wait = 60
                            else:
                                wait = 90
                            logger.warning(
                                f"Steam rate-limited AppID {appid} (attempt {attempt + 1}/3), "
                                f"pausing {wait}s ({rate_limit_retries} consecutive rate limits)"
                            )
                            await asyncio.sleep(wait)
                        else:
                            logger.warning(f"AppID {appid}: rate-limited after 3 attempts, skipping (will retry next run)")
                            failed += 1
                        continue

                    # Successful API response (not rate-limited) — reset counter
                    rate_limit_retries = 0

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


def backfill_subgenres() -> int:
    """One-time backfill: classify subgenre for all games where subgenre IS NULL.

    Uses existing tags JSON and short_description from the DB — no API calls.
    Safe to call on every startup (idempotent, only touches NULL rows).

    Returns the number of rows updated.
    """
    updated = 0
    db = SessionLocal()
    try:
        games = db.query(Game).filter(Game.subgenre.is_(None)).all()
        for game in games:
            try:
                tags = json.loads(game.tags) if game.tags else {}
            except (ValueError, TypeError):
                tags = {}
            desc = game.short_description or ""
            subgenre = _classify_subgenre(tags, desc)
            if subgenre is not None:
                game.subgenre = subgenre
                updated += 1
        db.commit()
        if updated:
            logger.info(f"Backfilled subgenre for {updated} existing games")
    except Exception:
        db.rollback()
        logger.exception("subgenre backfill failed")
    finally:
        db.close()
    return updated
