from __future__ import annotations

import asyncio
import logging
import random

import httpx

logger = logging.getLogger(__name__)


class RateLimiter:
    """Per-host rate limiter using asyncio."""

    def __init__(self, min_interval: float = 1.0):
        self._min_interval = min_interval
        self._last_request = 0.0

    async def acquire(self):
        now = asyncio.get_event_loop().time()
        elapsed = now - self._last_request
        if elapsed < self._min_interval:
            await asyncio.sleep(self._min_interval - elapsed)
        self._last_request = asyncio.get_event_loop().time()


# Pre-configured rate limiters
steam_limiter = RateLimiter(min_interval=1.5)       # ~200 req/5min
steamspy_limiter = RateLimiter(min_interval=15.0)   # ~4 req/min
twitch_limiter = RateLimiter(min_interval=0.08)     # 800 req/min → use ~12/sec to be safe
reddit_limiter = RateLimiter(min_interval=0.8)      # ~75 req/min (conservative; Reddit headers unreliable)


async def fetch_with_retry(
    client: httpx.AsyncClient,
    url: str,
    params: dict | None = None,
    limiter: RateLimiter | None = None,
    max_retries: int = 3,
    timeout: float = 30.0,
) -> dict | None:
    """Fetch JSON with exponential backoff retry.

    Retries on 429, 5xx. Returns None on permanent failures (4xx except 429).
    For SteamSpy 429, waits 60s then retries once.
    """
    for attempt in range(max_retries):
        try:
            if limiter:
                await limiter.acquire()

            resp = await client.get(url, params=params, timeout=timeout)

            if resp.status_code == 429:
                # SteamSpy special handling: wait 60s
                if "steamspy.com" in url:
                    logger.warning("SteamSpy rate limit hit, waiting 60s")
                    await asyncio.sleep(60)
                    continue

                retry_after = resp.headers.get("Retry-After")
                wait = float(retry_after) if retry_after else (2 ** attempt) + random.uniform(0, 1)
                logger.warning(f"Rate limited on {url}, waiting {wait:.1f}s")
                await asyncio.sleep(wait)
                continue

            if resp.status_code >= 500:
                wait = (2 ** attempt) + random.uniform(0, 1)
                logger.warning(f"Server error {resp.status_code} on {url}, retry {attempt + 1}/{max_retries} in {wait:.1f}s")
                await asyncio.sleep(wait)
                continue

            if resp.status_code >= 400:
                logger.error(f"Client error {resp.status_code} on {url}, not retrying")
                return None

            return resp.json()

        except (httpx.TimeoutException, httpx.ConnectError) as e:
            if attempt == max_retries - 1:
                logger.error(f"Failed after {max_retries} attempts on {url}: {e}")
                return None
            wait = (2 ** attempt) + random.uniform(0, 1)
            logger.warning(f"Network error on {url}: {e}, retry {attempt + 1}/{max_retries} in {wait:.1f}s")
            await asyncio.sleep(wait)

    return None
