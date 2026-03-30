from __future__ import annotations

"""Reddit Mention Collector

For each active game (released < 90 days, title ≥ 5 chars):
1. OAuth2 Client Credentials token (refresh hourly)
2. Batch up to 5 game titles per subreddit search using OR queries
3. Filter: post title or selftext must contain the game title; score ≥ 3
4. Deduplicate by post_id; store in reddit_mentions table
5. Abort if HTTP 429 with no Retry-After (quota exhausted for today)

Subreddits default: HorrorGaming,IndieGaming
Expand to r/Steam,r/pcgaming only for games with ≥100 reviews.
"""

import asyncio
import logging
import time
from datetime import date, datetime, timedelta, timezone

import httpx
from sqlalchemy import func

from collectors._http import reddit_limiter
from config import settings
from database import SessionLocal
from models import CollectionRun, Game, GameSnapshot, RedditMention

logger = logging.getLogger(__name__)

REDDIT_TOKEN_URL = "https://www.reddit.com/api/v1/access_token"
REDDIT_SEARCH_URL = "https://oauth.reddit.com/r/{subreddit}/search"

# Module-level token state
_token: str | None = None
_token_expires_at: float = 0.0
_token_lock = asyncio.Lock()

BATCH_SIZE = 5  # Titles per OR query
MIN_SCORE = 3   # Filter out low-quality posts
MIN_TITLE_LENGTH = 5
ACTIVE_DAYS = 90  # Only scan games released within N days
HIGH_REVIEW_THRESHOLD = 100  # Expand subreddits above this review count


async def _refresh_reddit_token(client: httpx.AsyncClient) -> bool:
    """Fetch a new Reddit OAuth2 Client Credentials token."""
    global _token, _token_expires_at
    if not settings.reddit_client_id or not settings.reddit_client_secret:
        logger.warning("Reddit credentials not configured — skipping Reddit collection")
        return False
    try:
        resp = await client.post(
            REDDIT_TOKEN_URL,
            data={"grant_type": "client_credentials"},
            auth=(settings.reddit_client_id, settings.reddit_client_secret),
            headers={"User-Agent": settings.reddit_user_agent},
            timeout=15.0,
        )
        if resp.status_code != 200:
            logger.error(f"Reddit token request failed: {resp.status_code} {resp.text[:200]}")
            return False
        body = resp.json()
        _token = body["access_token"]
        _token_expires_at = time.time() + body.get("expires_in", 3600) - 30
        logger.info("Reddit token refreshed")
        return True
    except Exception as e:
        logger.error(f"Reddit token refresh error: {e}")
        return False


def _reddit_headers() -> dict[str, str]:
    return {
        "Authorization": f"Bearer {_token}",
        "User-Agent": settings.reddit_user_agent,
    }


def _title_matches(game_title: str, post_title: str, selftext: str) -> bool:
    """Check if game title appears in post title or body (case-insensitive)."""
    lowered = game_title.lower()
    return lowered in post_title.lower() or lowered in selftext.lower()


async def _search_subreddit_batch(
    client: httpx.AsyncClient,
    subreddit: str,
    titles: list[str],
) -> list[dict] | None:
    """Search a subreddit for a batch of game titles. Returns raw post data or None on quota fail."""
    global _token, _token_expires_at

    # Refresh token if near expiry (lock prevents concurrent double-refresh)
    async with _token_lock:
        if _token is None or time.time() > _token_expires_at:
            ok = await _refresh_reddit_token(client)
            if not ok:
                return None

    query = " OR ".join(f'"{t}"' for t in titles)
    url = REDDIT_SEARCH_URL.format(subreddit=subreddit)

    await reddit_limiter.acquire()
    try:
        resp = await client.get(
            url,
            params={"q": query, "sort": "new", "t": "month", "limit": 100},
            headers=_reddit_headers(),
            timeout=20.0,
        )
    except Exception as e:
        logger.warning(f"Reddit request error for r/{subreddit}: {e}")
        return []

    if resp.status_code == 429:
        retry_after = resp.headers.get("Retry-After")
        if retry_after:
            wait = float(retry_after)
            logger.warning(f"Reddit rate limited, waiting {wait:.0f}s")
            await asyncio.sleep(wait)
            return []  # Don't abort; just skip this batch
        else:
            logger.error("Reddit quota exhausted (429 with no Retry-After) — aborting for today")
            return None  # Signal caller to abort

    if resp.status_code == 401:
        ok = await _refresh_reddit_token(client)
        if not ok:
            return []
        # Retry once
        await reddit_limiter.acquire()
        try:
            resp = await client.get(
                url,
                params={"q": query, "sort": "new", "t": "month", "limit": 100},
                headers=_reddit_headers(),
                timeout=20.0,
            )
        except Exception as e:
            logger.warning(f"Reddit retry error: {e}")
            return []

    if resp.status_code != 200:
        logger.warning(f"Reddit search error {resp.status_code} for r/{subreddit}")
        return []

    try:
        data = resp.json()
        return data.get("data", {}).get("children", [])
    except Exception:
        return []


async def run_reddit_scan() -> None:
    """Scan Reddit for mentions of recently-released games."""
    if not settings.reddit_client_id or not settings.reddit_client_secret:
        logger.info("Reddit credentials not set — skipping Reddit scan")
        return

    db = SessionLocal()
    run = CollectionRun(job_name="reddit_scan", status="running")
    db.add(run)
    db.commit()
    db.refresh(run)

    processed = 0
    failed = 0
    abort = False

    try:
        # Get active games (released < ACTIVE_DAYS, title ≥ MIN_TITLE_LENGTH)
        cutoff_date = date.today() - timedelta(days=ACTIVE_DAYS)
        games = (
            db.query(Game)
            .filter(Game.release_date >= cutoff_date)
            .filter(Game.title.isnot(None))
            .all()
        )
        games = [g for g in games if g.title and len(g.title) >= MIN_TITLE_LENGTH]
        logger.info(f"Reddit scan: {len(games)} active games to scan")

        # Batch-load latest review counts (1 query instead of N)
        latest_date_sub = (
            db.query(
                GameSnapshot.appid,
                func.max(GameSnapshot.snapshot_date).label("max_date"),
            )
            .group_by(GameSnapshot.appid)
            .subquery()
        )
        review_rows = (
            db.query(GameSnapshot.appid, GameSnapshot.review_count)
            .join(
                latest_date_sub,
                (GameSnapshot.appid == latest_date_sub.c.appid)
                & (GameSnapshot.snapshot_date == latest_date_sub.c.max_date),
            )
            .all()
        )
        review_counts: dict[int, int] = {
            row.appid: row.review_count or 0 for row in review_rows
        }

        base_subreddits = [s.strip() for s in settings.reddit_subreddits.split(",") if s.strip()]
        high_traffic_subs = ["Steam", "pcgaming"]

        async with httpx.AsyncClient() as client:
            # Ensure we have a token upfront
            ok = await _refresh_reddit_token(client)
            if not ok:
                run.status = "failed"
                run.error_message = "Could not obtain Reddit token"
                run.finished_at = datetime.now(timezone.utc)
                db.commit()
                return

            # Split games into batches of BATCH_SIZE
            for batch_start in range(0, len(games), BATCH_SIZE):
                if abort:
                    break
                batch = games[batch_start: batch_start + BATCH_SIZE]
                batch_titles = [g.title for g in batch]
                title_to_game: dict[str, Game] = {g.title: g for g in batch}

                # Determine subreddits for this batch
                any_high_reviews = any(review_counts.get(g.appid, 0) >= HIGH_REVIEW_THRESHOLD for g in batch)
                subreddits = base_subreddits[:]
                if any_high_reviews:
                    subreddits += [s for s in high_traffic_subs if s not in subreddits]

                for subreddit in subreddits:
                    if abort:
                        break
                    posts = await _search_subreddit_batch(client, subreddit, batch_titles)
                    if posts is None:
                        abort = True
                        break
                    if not posts:
                        continue

                    for post_wrapper in posts:
                        post = post_wrapper.get("data", {})
                        post_id = post.get("id")
                        if not post_id:
                            continue

                        # Skip existing posts
                        if db.query(RedditMention).filter_by(post_id=post_id).first():
                            continue

                        post_title = post.get("title", "")
                        selftext = post.get("selftext", "")
                        score = post.get("score", 0)

                        if score < MIN_SCORE:
                            continue

                        # Match post to a game
                        matched_game = None
                        for title, game in title_to_game.items():
                            if _title_matches(title, post_title, selftext):
                                matched_game = game
                                break
                        if matched_game is None:
                            continue

                        created_utc = post.get("created_utc")
                        posted_at = (
                            datetime.fromtimestamp(created_utc, tz=timezone.utc)
                            if created_utc else None
                        )
                        permalink = post.get("permalink", "")
                        post_url = f"https://www.reddit.com{permalink}" if permalink else None

                        db.add(RedditMention(
                            appid=matched_game.appid,
                            post_id=post_id,
                            subreddit=subreddit,
                            title=post_title,
                            score=score,
                            num_comments=post.get("num_comments"),
                            upvote_ratio=post.get("upvote_ratio"),
                            post_url=post_url,
                            posted_at=posted_at,
                        ))
                        processed += 1

                    try:
                        db.commit()
                    except Exception as e:
                        logger.error(f"Reddit DB commit error: {e}")
                        db.rollback()
                        failed += 1

        run.status = "success" if failed == 0 else "partial"
        if abort:
            run.status = "partial"
            run.error_message = "Aborted: Reddit quota exhausted"
        run.items_processed = processed
        run.items_failed = failed
        run.finished_at = datetime.now(timezone.utc)
        db.commit()
        logger.info(f"Reddit scan: {processed} mentions stored, {failed} failed")

    except Exception as e:
        run.status = "failed"
        run.error_message = str(e)
        run.finished_at = datetime.now(timezone.utc)
        db.commit()
        logger.exception("Reddit scan failed")
    finally:
        db.close()
