"""Weekly Newsletter Generator

Formats the weekly analysis as an email-friendly HTML newsletter and
sends (or drafts) it via the Buttondown API.

Sections:
  1. Top 5 Breakouts (by current OPS)
  2. Biggest Movers (largest positive OPS delta vs. 7 days ago)
  3. New Releases Worth Watching (released ≤14 days ago, OPS > 0)
  4. Creator Coverage Highlights (games with recent YouTube coverage)

Usage:
    # Send/draft the newsletter for today
    python3 newsletter.py

    # Dry-run: print HTML without posting to Buttondown
    python3 newsletter.py --dry-run

Buttondown integration:
    Set BUTTONDOWN_API_KEY in .env.
    Newsletter is created as a "draft" so you can review before sending.
"""
from __future__ import annotations

import argparse
import logging
import os
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import httpx
from sqlalchemy import and_, func

from config import settings
from database import SessionLocal
from models import Game, GameSnapshot, OpsScore, YoutubeChannel, YoutubeVideo

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s", datefmt="%H:%M:%S")
logger = logging.getLogger(__name__)

BUTTONDOWN_API_URL = "https://api.buttondown.email/v1/emails"

# ── Palette (Occult Amber — dark theme) ─────────────────────────────────────
COLORS = {
    "bg":          "#111314",
    "surface":     "#1a1b1d",
    "elevated":    "#242527",
    "primary":     "#802626",
    "primary_text":"#d45555",
    "text_main":   "#e8e0d6",
    "text_mid":    "#b5a595",
    "text_dim":    "#998c7e",
    "border":      "#4a4541",
    "ops_high":    "#2faa6e",
    "ops_mid":     "#e8a832",
    "ops_low":     "#6b635b",
    "accent_gold": "#d4a574",
    "status_pos":  "#2faa6e",
    "status_neg":  "#e25535",
}


# ── Helpers ──────────────────────────────────────────────────────────────────

def _ops_color(score: float) -> str:
    if score >= 60:
        return COLORS["ops_high"]
    if score >= 30:
        return COLORS["ops_mid"]
    return COLORS["ops_low"]


def _fmt_score(score: float | None) -> str:
    if score is None:
        return "—"
    return f"{score:.0f}"


def _steam_url(appid: int) -> str:
    return f"https://store.steampowered.com/app/{appid}/"


def _days_old(release_date: date | None) -> str:
    if release_date is None:
        return "?"
    delta = (date.today() - release_date).days
    return str(delta)


# ── Data Queries ─────────────────────────────────────────────────────────────

def _latest_ops_subquery(db):
    return (
        db.query(OpsScore.appid, func.max(OpsScore.score_date).label("md"))
        .group_by(OpsScore.appid)
        .subquery()
    )


def get_top_breakouts(db, n: int = 5) -> list[dict]:
    """Return top N games by current OPS, excluding very new games (<7 days)."""
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
            "ops": o.score,
            "confidence": o.confidence,
        }
        for g, o in rows
    ]


def get_biggest_movers(db, n: int = 5) -> list[dict]:
    """Return top N games by OPS delta over the past 7 days."""
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

    # Fetch current scores
    current: dict[int, float] = {}
    rows = (
        db.query(OpsScore.appid, OpsScore.score)
        .join(sq_now, and_(OpsScore.appid == sq_now.c.appid, OpsScore.score_date == sq_now.c.md))
        .filter(OpsScore.score.isnot(None))
        .all()
    )
    for appid, score in rows:
        current[appid] = score

    # Fetch previous scores
    prev: dict[int, float] = {}
    rows = (
        db.query(OpsScore.appid, OpsScore.score)
        .join(sq_prev, and_(OpsScore.appid == sq_prev.c.appid, OpsScore.score_date == sq_prev.c.md))
        .filter(OpsScore.score.isnot(None))
        .all()
    )
    for appid, score in rows:
        prev[appid] = score

    deltas = []
    for appid, cur_score in current.items():
        if appid in prev:
            delta = cur_score - prev[appid]
            if delta > 0:
                deltas.append((appid, cur_score, delta))

    deltas.sort(key=lambda x: x[2], reverse=True)
    top_appids = [appid for appid, _, _ in deltas[:n]]

    games = {g.appid: g for g in db.query(Game).filter(Game.appid.in_(top_appids)).all()}
    result = []
    for appid, cur_score, delta in deltas[:n]:
        g = games.get(appid)
        if not g:
            continue
        result.append({
            "appid": appid,
            "title": g.title,
            "developer": g.developer or "Unknown",
            "release_date": g.release_date,
            "ops": cur_score,
            "ops_delta": delta,
        })
    return result


def get_new_releases(db, n: int = 5) -> list[dict]:
    """Return games released in the last 14 days with any OPS score."""
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
            "ops": o.score,
        }
        for g, o in rows
    ]


def get_creator_highlights(db, n: int = 4) -> list[dict]:
    """Return games with recent YouTube coverage (past 7 days), ordered by view count."""
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


# ── HTML Builder ─────────────────────────────────────────────────────────────

def _inline_style(**props) -> str:
    return "; ".join(f"{k.replace('_', '-')}: {v}" for k, v in props.items())


def build_html(today: date) -> str:
    db = SessionLocal()
    try:
        breakouts = get_top_breakouts(db)
        movers = get_biggest_movers(db)
        new_releases = get_new_releases(db)
        highlights = get_creator_highlights(db)
    finally:
        db.close()

    week_str = today.strftime("%B %d, %Y")
    subject_date = today.strftime("%Y-%m-%d")

    # ── CSS resets + layout ──────────────────────────────────────────────────
    html_parts = [f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Horror Radar — Week of {week_str}</title>
</head>
<body style="{_inline_style(margin='0', padding='0', background_color=COLORS['bg'], font_family='system-ui, -apple-system, sans-serif', color=COLORS['text_main'])}">

<!-- Outer wrapper -->
<table width="100%" cellpadding="0" cellspacing="0" border="0"
       style="{_inline_style(background_color=COLORS['bg'], min_width='100%')}">
  <tr><td align="center" style="padding: 24px 16px;">

  <!-- Email container -->
  <table width="600" cellpadding="0" cellspacing="0" border="0"
         style="{_inline_style(max_width='600px', width='100%', background_color=COLORS['surface'], border_radius='8px', overflow='hidden')}">

    <!-- Header -->
    <tr>
      <td style="{_inline_style(background_color=COLORS['primary'], padding='24px 32px', text_align='center')}">
        <h1 style="{_inline_style(margin='0 0 4px 0', font_size='22px', font_weight='700', color='#ffffff', letter_spacing='0.5px')}">
          HORROR RADAR
        </h1>
        <p style="{_inline_style(margin='0', font_size='13px', color='rgba(255,255,255,0.75)', letter_spacing='1px', text_transform='uppercase')}">
          Weekly Breakout Report &mdash; {week_str}
        </p>
      </td>
    </tr>

    <!-- Body padding -->
    <tr>
      <td style="padding: 28px 32px;">
"""]

    # ── Section helper ───────────────────────────────────────────────────────
    def section_header(title: str, subtitle: str = "") -> str:
        sub = f'<p style="{_inline_style(margin="4px 0 0 0", font_size="13px", color=COLORS["text_dim"])}">{subtitle}</p>' if subtitle else ""
        return f"""
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 6px;">
          <tr>
            <td style="{_inline_style(border_left=f'3px solid {COLORS["primary"]}', padding_left='12px', padding_bottom='8px')}">
              <h2 style="{_inline_style(margin='0', font_size='14px', font_weight='700', color=COLORS['accent_gold'], text_transform='uppercase', letter_spacing='1px')}">{title}</h2>
              {sub}
            </td>
          </tr>
        </table>"""

    def divider() -> str:
        return f'<hr style="{_inline_style(border="none", border_top=f"1px solid {COLORS[\"border\"]}", margin="28px 0")}">'

    def game_row(appid: int, title: str, developer: str, release_date, ops: float | None,
                 badge: str = "", badge_color: str = "") -> str:
        ops_col = _ops_color(ops) if ops is not None else COLORS["ops_low"]
        badge_html = ""
        if badge:
            badge_html = f'<span style="{_inline_style(display="inline-block", background_color=badge_color or COLORS["elevated"], color=COLORS["text_main"], font_size="10px", font_weight="600", padding="2px 6px", border_radius="3px", margin_left="8px", vertical_align="middle")}">{badge}</span>'

        days = _days_old(release_date)
        return f"""
        <table width="100%" cellpadding="0" cellspacing="0"
               style="{_inline_style(margin_bottom='12px', background_color=COLORS['elevated'], border_radius='6px', overflow='hidden')}">
          <tr>
            <td style="{_inline_style(padding='12px 14px')}">
              <a href="{_steam_url(appid)}"
                 style="{_inline_style(color=COLORS['text_main'], text_decoration='none', font_size='14px', font_weight='600')}">
                {title}</a>{badge_html}
              <span style="{_inline_style(display='block', font_size='12px', color=COLORS['text_dim'], margin_top='2px')}">
                {developer} &bull; Day {days}
              </span>
            </td>
            <td style="{_inline_style(padding='12px 14px', text_align='right', white_space='nowrap')}">
              <span style="{_inline_style(font_size='20px', font_weight='700', color=ops_col)}">{_fmt_score(ops)}</span>
              <span style="{_inline_style(font_size='10px', color=COLORS['text_dim'], display='block')}">OPS</span>
            </td>
          </tr>
        </table>"""

    # ── 1. Top 5 Breakouts ───────────────────────────────────────────────────
    html_parts.append(section_header(
        "🔥 Top 5 Breakouts",
        "Highest OPS scores this week — games overperforming their peers"
    ))
    if breakouts:
        for i, g in enumerate(breakouts, 1):
            medal = ["🥇", "🥈", "🥉", "4.", "5."][i - 1] if i <= 3 else f"{i}."
            html_parts.append(game_row(
                g["appid"], f"{medal} {g['title']}", g["developer"],
                g["release_date"], g["ops"]
            ))
    else:
        html_parts.append(f'<p style="color:{COLORS["text_dim"]}; font-size:13px;">No scored games yet.</p>')

    html_parts.append(divider())

    # ── 2. Biggest Movers ────────────────────────────────────────────────────
    html_parts.append(section_header(
        "📈 Biggest Movers",
        "Largest positive OPS delta over the past 7 days"
    ))
    if movers:
        for g in movers:
            delta_str = f"+{g['ops_delta']:.1f}"
            html_parts.append(game_row(
                g["appid"], g["title"], g["developer"],
                g["release_date"], g["ops"],
                badge=delta_str, badge_color=COLORS["status_pos"]
            ))
    else:
        html_parts.append(f'<p style="color:{COLORS["text_dim"]}; font-size:13px;">Not enough history for delta calculation.</p>')

    html_parts.append(divider())

    # ── 3. New Releases Worth Watching ───────────────────────────────────────
    html_parts.append(section_header(
        "🆕 New Releases Worth Watching",
        "Released in the last 14 days with early breakout signals"
    ))
    if new_releases:
        for g in new_releases:
            html_parts.append(game_row(
                g["appid"], g["title"], g["developer"],
                g["release_date"], g["ops"],
                badge="NEW", badge_color=COLORS["primary"]
            ))
    else:
        html_parts.append(f'<p style="color:{COLORS["text_dim"]}; font-size:13px;">No new releases with OPS data this week.</p>')

    html_parts.append(divider())

    # ── 4. Creator Coverage Highlights ───────────────────────────────────────
    html_parts.append(section_header(
        "🎬 Creator Coverage Highlights",
        "Games covered by tracked YouTube channels in the past 7 days"
    ))
    if highlights:
        for h in highlights:
            subs_str = f"{h['subs'] // 1000}K" if h['subs'] >= 1000 else str(h['subs'])
            views_str = f"{h['views'] // 1000}K" if h['views'] >= 1000 else str(h['views'])
            html_parts.append(f"""
        <table width="100%" cellpadding="0" cellspacing="0"
               style="{_inline_style(margin_bottom='12px', background_color=COLORS['elevated'], border_radius='6px')}">
          <tr>
            <td style="{_inline_style(padding='12px 14px')}">
              <a href="{_steam_url(h['appid'])}"
                 style="{_inline_style(color=COLORS['text_main'], text_decoration='none', font_size='14px', font_weight='600')}">{h['title']}</a>
              <span style="{_inline_style(display='block', font_size='12px', color=COLORS['text_dim'], margin_top='4px')}">
                <strong style="color:{COLORS['accent_gold']}">{h['channel']}</strong>
                ({subs_str} subs) &bull; {views_str} views
              </span>
              <a href="{h['video_url']}"
                 style="{_inline_style(display='block', font_size='12px', color=COLORS['accent_gold'], text_decoration='none', margin_top='4px', white_space='nowrap', overflow='hidden', text_overflow='ellipsis')}">
                ▶ {h['video_title'][:70]}{'…' if len(h['video_title']) > 70 else ''}
              </a>
            </td>
          </tr>
        </table>""")
    else:
        html_parts.append(f'<p style="color:{COLORS["text_dim"]}; font-size:13px;">No creator coverage detected this week.</p>')

    # ── Footer ───────────────────────────────────────────────────────────────
    html_parts.append(f"""
        {divider()}
        <p style="{_inline_style(font_size='11px', color=COLORS['text_dim'], text_align='center', line_height='1.6')}">
          Horror Radar monitors Steam, YouTube, Twitch, and Reddit to identify
          breakout indie horror games using the OPS (Overperformance Score) engine.<br>
          <a href="https://horror-radar.com" style="color:{COLORS['accent_gold']}; text_decoration: none;">horror-radar.com</a>
          &bull; Data refreshed daily
        </p>

      </td>
    </tr>
  </table>

  </td></tr>
</table>

</body>
</html>""")

    return "".join(html_parts)


# ── Buttondown Integration ───────────────────────────────────────────────────

def post_to_buttondown(subject: str, html_body: str) -> dict:
    """POST a draft email to Buttondown API.

    Returns the API response dict.
    Raises httpx.HTTPStatusError on 4xx/5xx.
    """
    api_key = settings.buttondown_api_key
    if not api_key:
        raise ValueError("BUTTONDOWN_API_KEY is not set in environment / .env")

    payload = {
        "subject": subject,
        "body": html_body,
        "status": "draft",        # Creates as draft so user can review before sending
        "email_type": "public",
    }

    with httpx.Client(timeout=30.0) as client:
        resp = client.post(
            BUTTONDOWN_API_URL,
            json=payload,
            headers={
                "Authorization": f"Token {api_key}",
                "Content-Type": "application/json",
            },
        )
        resp.raise_for_status()
        return resp.json()


# ── Entry Point ──────────────────────────────────────────────────────────────

def run_newsletter(dry_run: bool = False) -> None:
    """Generate and (optionally) post the weekly newsletter."""
    today = date.today()
    logger.info(f"Generating weekly newsletter for {today}")

    html = build_html(today)
    subject = f"Horror Radar: Weekly Breakout Report — {today.strftime('%B %d, %Y')}"

    if dry_run:
        out_dir = Path(__file__).parent / "reports"
        out_dir.mkdir(exist_ok=True)
        out_path = out_dir / f"newsletter_{today.isoformat()}.html"
        out_path.write_text(html, encoding="utf-8")
        logger.info(f"[dry-run] Newsletter HTML written to {out_path}")
        logger.info(f"[dry-run] Subject: {subject}")
        logger.info(f"[dry-run] HTML length: {len(html)} chars")
        return

    logger.info("Posting draft to Buttondown…")
    try:
        result = post_to_buttondown(subject, html)
        email_id = result.get("id", "unknown")
        logger.info(f"Newsletter draft created: id={email_id} subject='{subject}'")
    except ValueError as e:
        logger.error(f"Newsletter skipped: {e}")
    except httpx.HTTPStatusError as e:
        logger.error(f"Buttondown API error {e.response.status_code}: {e.response.text}")
    except Exception as e:
        logger.error(f"Newsletter failed: {e}", exc_info=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate and post weekly newsletter")
    parser.add_argument("--dry-run", action="store_true",
                        help="Write HTML to reports/ without posting to Buttondown")
    args = parser.parse_args()
    run_newsletter(dry_run=args.dry_run)
