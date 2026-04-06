"""Weekly Newsletter Generator

Generates a Substack-ready HTML file each Monday. Open the output file,
copy the content, and paste it into a new Substack post.

Sections:
  1. Top 5 Breakouts (by current OPS)
  2. Biggest Movers (largest positive OPS delta vs. 7 days ago)
  3. New Releases Worth Watching (released ≤14 days ago, OPS > 0)
  4. Creator Coverage Highlights (games with recent YouTube coverage)

Output: backend/reports/newsletter_YYYY-MM-DD.html

Usage:
    python3 newsletter.py
"""
from __future__ import annotations

import argparse
import logging
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from sqlalchemy import and_, func

from config import settings
from database import SessionLocal
from models import Game, OpsScore, YoutubeChannel, YoutubeVideo

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s", datefmt="%H:%M:%S")
logger = logging.getLogger(__name__)

REPORTS_DIR = Path(__file__).parent / "reports"


# ── Data Queries ─────────────────────────────────────────────────────────────

def _latest_ops_subquery(db):
    return (
        db.query(OpsScore.appid, func.max(OpsScore.score_date).label("md"))
        .group_by(OpsScore.appid)
        .subquery()
    )


def get_top_breakouts(db, n: int = 5) -> list[dict]:
    """Top N games by current OPS (excluding games < 7 days old)."""
    sq = _latest_ops_subquery(db)
    cutoff = date.today() - timedelta(days=7)

    rows = (
        db.query(Game, OpsScore)
        .join(sq, Game.appid == sq.c.appid)
        .join(OpsScore, and_(OpsScore.appid == sq.c.appid, OpsScore.score_date == sq.c.md))
        .filter(OpsScore.score.isnot(None), OpsScore.score > 0)
        .filter(Game.release_date.isnot(None), Game.release_date <= cutoff)
        .order_by(OpsScore.score.desc())
        .limit(n)
        .all()
    )
    return [
        {
            "appid": g.appid,
            "title": g.title,
            "developer": g.developer or "Unknown",
            "release_date": g.release_date,
            "price_usd": g.price_usd,
            "is_multiplayer": g.is_multiplayer,
            "ops": o.score,
            "confidence": o.confidence,
        }
        for g, o in rows
    ]


def get_biggest_movers(db, n: int = 5) -> list[dict]:
    """Top N games by OPS delta over the past 7 days."""
    today = date.today()
    week_ago = today - timedelta(days=7)

    sq_now = (
        db.query(OpsScore.appid, func.max(OpsScore.score_date).label("md"))
        .filter(OpsScore.score_date >= today - timedelta(days=2))
        .group_by(OpsScore.appid)
        .subquery()
    )
    sq_prev = (
        db.query(OpsScore.appid, func.max(OpsScore.score_date).label("md"))
        .filter(OpsScore.score_date.between(week_ago - timedelta(days=2), week_ago))
        .group_by(OpsScore.appid)
        .subquery()
    )

    current: dict[int, float] = {
        appid: score
        for appid, score in db.query(OpsScore.appid, OpsScore.score)
        .join(sq_now, and_(OpsScore.appid == sq_now.c.appid, OpsScore.score_date == sq_now.c.md))
        .filter(OpsScore.score.isnot(None))
        .all()
    }
    prev: dict[int, float] = {
        appid: score
        for appid, score in db.query(OpsScore.appid, OpsScore.score)
        .join(sq_prev, and_(OpsScore.appid == sq_prev.c.appid, OpsScore.score_date == sq_prev.c.md))
        .filter(OpsScore.score.isnot(None))
        .all()
    }

    deltas = sorted(
        [(appid, current[appid], current[appid] - prev[appid])
         for appid in current if appid in prev and current[appid] - prev[appid] > 0],
        key=lambda x: x[2], reverse=True
    )[:n]

    games = {g.appid: g for g in db.query(Game).filter(
        Game.appid.in_([a for a, _, _ in deltas])
    ).all()}

    return [
        {
            "appid": appid,
            "title": games[appid].title,
            "developer": games[appid].developer or "Unknown",
            "release_date": games[appid].release_date,
            "ops": cur,
            "ops_delta": delta,
        }
        for appid, cur, delta in deltas
        if appid in games
    ]


def get_new_releases(db, n: int = 5) -> list[dict]:
    """Games released in the last 14 days with any OPS score."""
    cutoff = date.today() - timedelta(days=14)
    sq = _latest_ops_subquery(db)

    rows = (
        db.query(Game, OpsScore)
        .join(sq, Game.appid == sq.c.appid)
        .join(OpsScore, and_(OpsScore.appid == sq.c.appid, OpsScore.score_date == sq.c.md))
        .filter(Game.release_date.isnot(None), Game.release_date >= cutoff)
        .filter(OpsScore.score.isnot(None))
        .order_by(OpsScore.score.desc())
        .limit(n)
        .all()
    )
    return [
        {
            "appid": g.appid,
            "title": g.title,
            "developer": g.developer or "Unknown",
            "release_date": g.release_date,
            "price_usd": g.price_usd,
            "ops": o.score,
        }
        for g, o in rows
    ]


def get_creator_highlights(db, n: int = 4) -> list[dict]:
    """Games covered by tracked YouTube channels in the past 7 days."""
    week_ago = datetime.now(timezone.utc) - timedelta(days=7)

    rows = (
        db.query(
            Game.appid,
            Game.title,
            YoutubeChannel.name.label("channel_name"),
            YoutubeChannel.subscriber_count,
            YoutubeVideo.title.label("video_title"),
            YoutubeVideo.view_count,
            YoutubeVideo.video_id,
        )
        .join(YoutubeVideo, YoutubeVideo.matched_appid == Game.appid)
        .join(YoutubeChannel, YoutubeChannel.channel_id == YoutubeVideo.channel_id)
        .filter(
            YoutubeVideo.matched_appid.isnot(None),
            YoutubeVideo.view_count.isnot(None),
            YoutubeVideo.published_at >= week_ago.replace(tzinfo=None),
        )
        .order_by(YoutubeVideo.view_count.desc())
        .limit(n)
        .all()
    )
    return [
        {
            "appid": appid,
            "title": title,
            "channel": channel_name,
            "subs": subs or 0,
            "video_title": video_title,
            "views": views or 0,
            "video_url": f"https://www.youtube.com/watch?v={video_id}",
        }
        for appid, title, channel_name, subs, video_title, views, video_id in rows
    ]


# ── Formatters ───────────────────────────────────────────────────────────────

def _days_old(release_date) -> str:
    if release_date is None:
        return "?"
    return str((date.today() - release_date).days)


def _price(usd: float | None) -> str:
    if usd is None or usd == 0:
        return "Free"
    return f"${usd:.2f}"


def _fmt_views(n: int) -> str:
    if n >= 1_000_000:
        return f"{n / 1_000_000:.1f}M"
    if n >= 1_000:
        return f"{n / 1_000:.0f}K"
    return str(n)


def _fmt_subs(n: int) -> str:
    if n >= 1_000_000:
        return f"{n // 1_000_000}M"
    if n >= 1_000:
        return f"{n // 1_000}K"
    return str(n)


def _steam_url(appid: int) -> str:
    return f"https://store.steampowered.com/app/{appid}/"


# ── HTML Builder ─────────────────────────────────────────────────────────────

def build_html(today: date) -> str:
    """Build Substack-paste-friendly HTML for the weekly newsletter."""
    db = SessionLocal()
    try:
        breakouts = get_top_breakouts(db)
        movers = get_biggest_movers(db)
        new_releases = get_new_releases(db)
        highlights = get_creator_highlights(db)
    finally:
        db.close()

    week_str = today.strftime("%B %d, %Y")
    parts: list[str] = []

    def w(s: str):
        parts.append(s)

    # Substack renders standard HTML tags well. Keep it simple: headings,
    # paragraphs, bold, links, horizontal rules. No table layouts.
    w(f"""<p><em>Weekly breakout detection report — {week_str}. Tracking indie horror games on Steam using the OPS (Overperformance Score) engine.</em></p>

<hr>
""")

    # ── Section 1: Top 5 Breakouts ───────────────────────────────────────────
    w("<h2>🔥 Top 5 Breakouts</h2>\n")
    w("<p>Games with the highest Overperformance Score this week — outpacing their peers in reviews, YouTube coverage, and live player engagement.</p>\n")

    if breakouts:
        medals = ["🥇", "🥈", "🥉", "4.", "5."]
        for i, g in enumerate(breakouts):
            mp_tag = " · <strong>Multiplayer</strong>" if g["is_multiplayer"] else ""
            w(f"""<p><strong>{medals[i]} <a href="{_steam_url(g['appid'])}">{g['title']}</a></strong> — OPS <strong>{g['ops']:.0f}</strong><br>
{g['developer']} · Day {_days_old(g['release_date'])} · {_price(g.get('price_usd'))}{mp_tag}</p>
""")
    else:
        w("<p><em>No scored games this week.</em></p>\n")

    w("<hr>\n")

    # ── Section 2: Biggest Movers ────────────────────────────────────────────
    w("<h2>📈 Biggest Movers</h2>\n")
    w("<p>Games whose OPS jumped the most over the past 7 days — accelerating breakouts worth watching closely.</p>\n")

    if movers:
        for g in movers:
            w(f"""<p><strong><a href="{_steam_url(g['appid'])}">{g['title']}</a></strong> — OPS <strong>{g['ops']:.0f}</strong> (<strong>+{g['ops_delta']:.1f}</strong> this week)<br>
{g['developer']} · Day {_days_old(g['release_date'])}</p>
""")
    else:
        w("<p><em>Not enough history for delta calculation yet.</em></p>\n")

    w("<hr>\n")

    # ── Section 3: New Releases Worth Watching ───────────────────────────────
    w("<h2>🆕 New Releases Worth Watching</h2>\n")
    w("<p>Games released in the last 14 days showing early breakout signals.</p>\n")

    if new_releases:
        for g in new_releases:
            days = _days_old(g["release_date"])
            w(f"""<p><strong><a href="{_steam_url(g['appid'])}">{g['title']}</a></strong> — OPS <strong>{g['ops']:.0f}</strong><br>
{g['developer']} · {_price(g.get('price_usd'))} · Released {days} days ago</p>
""")
    else:
        w("<p><em>No new releases with OPS data this week.</em></p>\n")

    w("<hr>\n")

    # ── Section 4: Creator Coverage Highlights ───────────────────────────────
    w("<h2>🎬 Creator Coverage Highlights</h2>\n")
    w("<p>Indie horror games covered by tracked YouTube channels in the past 7 days.</p>\n")

    if highlights:
        for h in highlights:
            subs_str = _fmt_subs(h["subs"])
            views_str = _fmt_views(h["views"])
            w(f"""<p><strong><a href="{_steam_url(h['appid'])}">{h['title']}</a></strong><br>
Covered by <strong>{h['channel']}</strong> ({subs_str} subs) · {views_str} views<br>
<a href="{h['video_url']}">▶ {h['video_title'][:80]}{'…' if len(h['video_title']) > 80 else ''}</a></p>
""")
    else:
        w("<p><em>No creator coverage detected this week.</em></p>\n")

    w("""<hr>

<p><em>Horror Radar monitors Steam, YouTube, Twitch, and Reddit to surface breakout indie horror games within their first 90 days. Data refreshed daily. <a href="https://horror-radar.com">horror-radar.com</a></em></p>
""")

    return "".join(parts)


# ── Entry Point ──────────────────────────────────────────────────────────────

def run_newsletter() -> None:
    """Generate the weekly newsletter HTML and write it to reports/."""
    today = date.today()
    logger.info(f"Generating weekly newsletter for {today}")

    html = build_html(today)
    REPORTS_DIR.mkdir(exist_ok=True)
    out_path = REPORTS_DIR / f"newsletter_{today.isoformat()}.html"
    out_path.write_text(html, encoding="utf-8")

    logger.info(f"Newsletter written to {out_path}")
    logger.info(f"Open the file, copy the content, and paste into a new Substack post.")
    logger.info(f"Suggested subject: Horror Radar: Weekly Breakout Report — {today.strftime('%B %d, %Y')}")


if __name__ == "__main__":
    run_newsletter()
