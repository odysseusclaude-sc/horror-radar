"""In-process TTL cache for hot API endpoints.

A lightweight alternative to Redis for a single-process deployment.
Hot endpoints (games list, radar pick, insights) update once per day
after the daily_snapshots → OPS chain — there's no benefit to hitting
the database on every request.

Usage:
    from cache import cache

    # In a router:
    cached = cache.get("radar-pick", ttl=1800)
    if cached is not None:
        return cached
    result = compute_result()
    cache.set("radar-pick", result)
    return result

    # Invalidate after a job completes:
    cache.invalidate("games")   # clears all keys starting with "games"
    cache.invalidate_all()      # clears everything
"""
import time
import threading
from typing import Any, Optional

# TTL constants (seconds)
TTL_GAMES = 300       # 5 minutes — game list with filters
TTL_RADAR = 1800      # 30 minutes — radar pick
TTL_INSIGHTS = 1800   # 30 minutes — trends/insights aggregates
TTL_STATUS = 30       # 30 seconds — pipeline status


class TTLCache:
    """Thread-safe in-process TTL cache backed by a plain dict.

    Keys are strings. Values can be any picklable object.
    Expired entries are evicted lazily on access and on explicit invalidation.
    """

    def __init__(self) -> None:
        self._store: dict[str, tuple[Any, float]] = {}  # key → (value, expires_at)
        self._lock = threading.Lock()

    def get(self, key: str, ttl: int) -> Optional[Any]:
        """Return cached value if it exists and hasn't expired.

        Args:
            key: Cache key.
            ttl: Maximum age in seconds. Entry is treated as expired if older.

        Returns:
            Cached value, or None on miss/expiry.
        """
        with self._lock:
            entry = self._store.get(key)
            if entry is None:
                return None
            value, expires_at = entry
            if time.monotonic() > expires_at:
                del self._store[key]
                return None
            return value

    def set(self, key: str, value: Any, ttl: int = TTL_GAMES) -> None:
        """Store a value with a TTL.

        Args:
            key:   Cache key.
            value: Value to store.
            ttl:   Time-to-live in seconds (default: TTL_GAMES = 5 min).
        """
        with self._lock:
            self._store[key] = (value, time.monotonic() + ttl)

    def invalidate(self, prefix: str) -> int:
        """Remove all keys that start with *prefix*.

        Returns the number of evicted entries.
        """
        with self._lock:
            keys = [k for k in self._store if k.startswith(prefix)]
            for k in keys:
                del self._store[k]
            return len(keys)

    def invalidate_all(self) -> int:
        """Clear the entire cache. Returns number of evicted entries."""
        with self._lock:
            count = len(self._store)
            self._store.clear()
            return count

    def stats(self) -> dict:
        """Return cache statistics for the /ready endpoint."""
        now = time.monotonic()
        with self._lock:
            total = len(self._store)
            live = sum(1 for _, (_, exp) in self._store.items() if exp > now)
            return {"total_keys": total, "live_keys": live, "expired_keys": total - live}


# Module-level singleton — import this everywhere
cache = TTLCache()
