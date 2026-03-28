from __future__ import annotations

import logging

from collectors.discovery import run_discovery
from collectors.metadata import run_metadata_fetch
from collectors.reviews import run_review_snapshots
from collectors.ccu import run_ccu_snapshots
from collectors.owners import run_owner_estimates
from collectors.youtube_scanner import run_youtube_scan
from collectors.youtube_stats import run_youtube_stats_refresh
from collectors.ops import run_ops_calculation
from collectors.twitch import run_twitch_snapshots
from collectors.achievements import run_achievement_stats
from collectors.updates import run_update_tracking
from collectors.reddit import run_reddit_scan
from collectors.dev_profile import run_dev_profiles

logger = logging.getLogger(__name__)


async def run_steam_extras() -> None:
    """Run update tracking then achievement stats sequentially (both use steam_limiter).

    Grouped into a single job to avoid concurrent SQLite write contention.
    """
    logger.info("Starting steam_extras pipeline: update tracking → achievement stats")
    await run_update_tracking()
    await run_achievement_stats()


__all__ = [
    "run_discovery",
    "run_metadata_fetch",
    "run_review_snapshots",
    "run_ccu_snapshots",
    "run_owner_estimates",
    "run_youtube_scan",
    "run_youtube_stats_refresh",
    "run_ops_calculation",
    "run_twitch_snapshots",
    "run_achievement_stats",
    "run_update_tracking",
    "run_reddit_scan",
    "run_dev_profiles",
    "run_steam_extras",
]
