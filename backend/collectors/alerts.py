"""Pipeline alerting via Discord webhook.

Send structured embed alerts when critical pipeline events occur:
- Circuit breaker opens (10 consecutive metadata failures)
- Jobs marked stale by watchdog (hung >2h)
- Dead letter queue accumulation (10+ items)
"""
import logging
from datetime import datetime

import httpx

logger = logging.getLogger(__name__)


async def send_discord_alert(webhook_url: str, title: str, message: str, level: str = "warning"):
    """Send a pipeline alert to Discord webhook."""
    if not webhook_url:
        return

    color = {"info": 3447003, "warning": 16776960, "error": 16711680}.get(level, 16776960)

    payload = {
        "embeds": [{
            "title": f"Horror Radar — {title}",
            "description": message,
            "color": color,
            "timestamp": datetime.utcnow().isoformat(),
            "footer": {"text": "Horror Radar Pipeline Monitor"}
        }]
    }

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(webhook_url, json=payload, timeout=10)
            if resp.status_code not in (200, 204):
                logger.warning(f"Discord webhook failed: {resp.status_code}")
    except Exception as e:
        logger.error(f"Discord alert error: {e}")
