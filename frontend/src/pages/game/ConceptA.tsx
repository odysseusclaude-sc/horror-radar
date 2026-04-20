import { useState, useEffect, useMemo, useCallback } from "react";
import { computeOps, DEFAULT_WEIGHTS } from "../../lib/opsCalculator";
import type { OpsWeights } from "../../lib/opsCalculator";
import { useParams, Link } from "react-router-dom";
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ReferenceArea,
  Brush,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
} from "recharts";

/* ── API Response Types ──────────────────────────────────────────── */

interface TimelineGame {
  appid: number;
  title: string;
  developer: string | null;
  publisher: string | null;
  release_date: string | null;
  price_usd: number | null;
  genres: string | null;
  tags: string | null;
  is_indie: boolean;
  is_horror: boolean;
  header_image_url: string | null;
  has_demo: boolean;
  demo_appid: number | null;
  demo_release_date: string | null;
}

interface TimelineSnapshotRaw {
  date: string;
  review_count: number | null;
  review_score_pct: number | null;
  peak_ccu: number | null;
  demo_review_count: number | null;
  demo_review_score_pct: number | null;
  ops_score: number | null;
  ops_confidence: string | null;
  review_component: number | null;
  velocity_component: number | null;
  decay_component: number | null;
  ccu_component: number | null;
  youtube_component: number | null;
  sentiment_component: number | null;
  twitch_component: number | null;
  raw_ops: number | null;
  twitch_viewers: number | null;
  twitch_streams: number | null;
  yt_cumulative_views: number;
  patch_count_30d: number | null;
  days_since_last_update: number | null;
}

interface TimelineSnapshot extends TimelineSnapshotRaw {
  day_index: number;
  review_velocity?: number;
}

type EventType =
  | "youtube_demo"
  | "youtube_game"
  | "reddit"
  | "steam_update"
  | "game_launch"
  | "demo_launch";

interface TimelineEvent {
  date: string;
  day_index: number;
  type: EventType;
  title: string;
  detail: string;
  channel_name?: string;
  subscriber_count?: number;
  view_count?: number;
  subreddit?: string;
  score?: number;
  num_comments?: number;
  post_url?: string;
}

interface TimelineVideo {
  video_id: string;
  channel_id: string;
  channel_name: string | null;
  subscriber_count: number | null;
  title: string;
  published_at: string | null;
  view_count: number | null;
  like_count: number | null;
  covers: string;
}

interface TimelineResponse {
  game: TimelineGame;
  snapshots: TimelineSnapshotRaw[];
  events: Array<{
    date: string;
    type: string;
    title: string;
    detail: string;
    channel_name?: string;
    subscriber_count?: number;
    view_count?: number;
    subreddit?: string;
    score?: number;
    num_comments?: number;
    post_url?: string;
  }>;
  videos: TimelineVideo[];
  reddit_mentions: Array<{
    post_id: string;
    subreddit: string;
    title: string;
    score: number | null;
    num_comments: number | null;
    post_url: string | null;
    posted_at: string | null;
  }>;
}

/* ── Derived types ───────────────────────────────────────────────── */

interface PhaseInfo {
  id: string;
  label: string;
  start_date: string;
  end_date: string;
  start_day: number;
  end_day: number;
  duration_days: number;
  summary: string;
  dominant_signal: string;
  key_event: string;
  insight: string;
}

interface CreatorImpact {
  channel_name: string;
  subscriber_count: number;
  video_title: string;
  upload_date: string;
  view_count: number;
  reviews_before_7d: number;
  reviews_after_7d: number;
  ccu_before_7d: number;
  ccu_after_7d: number;
  raw_review_delta: number;
  velocity_before: number;
  velocity_after: number;
  impact_score: number;
  covers: string;
  shared_date: boolean;
}

/* ── Palette (kept for Recharts inline colors) ──────────────────── */

const C = {
  bg: "#111314",
  surface: "#1a1a1c",
  border: "#2a2420",
  white: "#e8e0d4",
  dim: "#6b6058",
  ops: "#802626",
  reviews: "#e8e0d4",
  ccu: "#802626",
  score: "#bb7125",
  twitch: "#a36aa5",
  ghost: "rgba(255,255,255,0.06)",
  ghostStroke: "rgba(255,255,255,0.12)",
  green: "#5ec269",
} as const;

/* ── Keyframes ────────────────────────────────────────────────────── */

const styleTag = `
@keyframes autopsyFadeIn {
  from { opacity: 0; transform: translateY(12px); }
  to   { opacity: 1; transform: translateY(0); }
}
.autopsy-stagger-1 { animation: autopsyFadeIn 0.5s ease-out 0.1s both; }
.autopsy-stagger-2 { animation: autopsyFadeIn 0.5s ease-out 0.25s both; }
.autopsy-stagger-3 { animation: autopsyFadeIn 0.5s ease-out 0.4s both; }
.autopsy-stagger-4 { animation: autopsyFadeIn 0.5s ease-out 0.55s both; }
.autopsy-stagger-5 { animation: autopsyFadeIn 0.5s ease-out 0.7s both; }
.autopsy-phase-card { transition: all 0.25s ease; }
.autopsy-phase-card:hover { transform: translateY(-2px); }
.autopsy-event-flag { cursor: pointer; transition: opacity 0.15s; }
.autopsy-event-flag:hover { opacity: 0.8; }
`;

/* ── Phase band colors ─────────────────────────────────────────────── */

const PHASE_BAND_COLORS: Record<string, string> = {
  pre_launch:  "rgba(163,106,165,0.06)",
  launch_week: "rgba(128,38,38,0.08)",
  discovery:   "rgba(187,113,37,0.07)",
  settling:    "rgba(74,222,128,0.06)",
  long_tail:   "rgba(107,96,88,0.03)",
};

const PHASE_ACCENT_COLORS: Record<string, string> = {
  pre_launch:  "#a36aa5",
  launch_week: "#802626",
  discovery:   "#bb7125",
  settling:    "#5ec269",
  long_tail:   "#6b6058",
};

/* ── Event constants ─────────────────────────────────────────────── */

const EVENT_COLORS: Record<string, string> = {
  demo_launch:  "#a36aa5",
  game_launch:  "#802626",
  youtube_demo: "#a36aa5",
  youtube_game: "#a36aa5",
  reddit:       "#bb7125",
  steam_update: "#5ec269",
};

const EVENT_LABELS: Record<string, string> = {
  demo_launch:  "Demo Launch",
  game_launch:  "Game Launch",
  youtube_demo: "YouTube (Demo)",
  youtube_game: "YouTube (Game)",
  reddit:       "Reddit",
  steam_update: "Steam Update",
};

const EVENT_ICONS: Record<string, string> = {
  demo_launch:  "▶",
  game_launch:  "★",
  youtube_demo: "●",
  youtube_game: "●",
  reddit:       "◆",
  steam_update: "■",
};

/* ── Series toggle config ─────────────────────────────────────────── */

interface SeriesConfig {
  key: string;
  label: string;
  color: string;
  defaultOn: boolean;
  panel: 1 | 2 | 3;
}

const SERIES: SeriesConfig[] = [
  { key: "raw_ops",           label: "OPS (Raw)",     color: C.ops,      defaultOn: true,  panel: 1 },
  { key: "review_count",      label: "Reviews",       color: C.reviews,  defaultOn: true,  panel: 2 },
  { key: "review_velocity",   label: "Rev. Velocity", color: "#f97316",  defaultOn: true,  panel: 2 },
  { key: "peak_ccu",          label: "Peak CCU",      color: C.ccu,      defaultOn: false, panel: 2 },
  { key: "review_score_pct",  label: "Score %",       color: C.score,    defaultOn: true,  panel: 3 },
  { key: "demo_review_count", label: "Demo Reviews",  color: "#22d3ee",  defaultOn: false, panel: 2 },
  { key: "yt_cumulative_views", label: "YT Views",    color: "#38bdf8",  defaultOn: true,  panel: 3 },
];

/* ── Helpers ───────────────────────────────────────────────────────── */

function fmtNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(n >= 10_000 ? 0 : 1) + "K";
  return n.toLocaleString();
}

function fmtDate(d: string): string {
  return new Date(d + "T00:00:00Z").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function eventShape(type: string): string {
  return EVENT_ICONS[type] || "●";
}

function daysBetween(a: string, b: string): number {
  const da = new Date(a + "T00:00:00Z").getTime();
  const db = new Date(b + "T00:00:00Z").getTime();
  return Math.round((db - da) / 86400000);
}

function parseTags(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    if (typeof parsed === "object" && parsed !== null) return Object.keys(parsed);
    return [];
  } catch {
    return [];
  }
}

function parseGenres(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    return [];
  } catch {
    return [];
  }
}

function derivePhases(snapshots: TimelineSnapshot[], releaseDate: string): PhaseInfo[] {
  if (snapshots.length === 0) return [];
  const phases: PhaseInfo[] = [];
  const firstDay = snapshots[0].day_index;
  const lastDay = snapshots[snapshots.length - 1].day_index;
  const firstDate = snapshots[0].date;
  const lastDate = snapshots[snapshots.length - 1].date;

  function dateAtDay(day: number): string {
    const d = new Date(releaseDate + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + day);
    return d.toISOString().slice(0, 10);
  }

  if (firstDay < 0) {
    const endDay = Math.min(-1, lastDay);
    phases.push({
      id: "pre_launch", label: "Pre-Launch",
      start_date: firstDate, end_date: dateAtDay(endDay),
      start_day: firstDay, end_day: endDay,
      duration_days: endDay - firstDay + 1,
      summary: "Demo/wishlist phase before full game launch.",
      dominant_signal: "Demo reviews, wishlists",
      key_event: "Pre-release visibility building",
      insight: "Pre-launch activity helps gauge initial demand and build an audience.",
    });
  }
  if (lastDay >= 0) {
    const startDay = Math.max(0, firstDay);
    const endDay = Math.min(7, lastDay);
    phases.push({
      id: "launch_week", label: "Launch Week",
      start_date: dateAtDay(startDay), end_date: dateAtDay(endDay),
      start_day: startDay, end_day: endDay,
      duration_days: endDay - startDay + 1,
      summary: "Initial burst of reviews, CCU, and media coverage.",
      dominant_signal: "Review velocity, peak CCU",
      key_event: "Game launch on Steam",
      insight: "The first week sets the tone — strong velocity here often predicts sustained interest.",
    });
  }
  if (lastDay > 7) {
    const startDay = Math.max(8, firstDay);
    const endDay = Math.min(30, lastDay);
    phases.push({
      id: "discovery", label: "Discovery Window",
      start_date: dateAtDay(startDay), end_date: dateAtDay(endDay),
      start_day: startDay, end_day: endDay,
      duration_days: endDay - startDay + 1,
      summary: "YouTube and Twitch coverage drives organic discovery.",
      dominant_signal: "YouTube views, creator uploads",
      key_event: "Creator coverage and word-of-mouth",
      insight: "Games that get picked up by creators in this window have the best breakout odds.",
    });
  }
  if (lastDay > 30) {
    const startDay = Math.max(31, firstDay);
    const endDay = Math.min(90, lastDay);
    phases.push({
      id: "settling", label: "Settling",
      start_date: dateAtDay(startDay), end_date: dateAtDay(endDay),
      start_day: startDay, end_day: endDay,
      duration_days: endDay - startDay + 1,
      summary: "Review accumulation slows; game finds its steady audience.",
      dominant_signal: "Review score stability, owner growth",
      key_event: "Patch cadence and community response",
      insight: "Sustained review positivity and update cadence separate lasting hits from flash-in-the-pan.",
    });
  }
  if (lastDay > 90) {
    const startDay = Math.max(91, firstDay);
    phases.push({
      id: "long_tail", label: "Long Tail",
      start_date: dateAtDay(startDay), end_date: lastDate,
      start_day: startDay, end_day: lastDay,
      duration_days: lastDay - startDay + 1,
      summary: "Beyond the breakout window — organic trickle and sale bumps.",
      dominant_signal: "Slow review growth, sale events",
      key_event: "Outside active monitoring scope",
      insight: "Most OPS signal has decayed. The game's trajectory is largely set.",
    });
  }
  return phases;
}

function getSteamRating(pct: number): { label: string; color: string } {
  if (pct >= 95) return { label: "Overwhelmingly Positive", color: "#5ec269" };
  if (pct >= 80) return { label: "Very Positive",           color: "#5ec269" };
  if (pct >= 70) return { label: "Mostly Positive",         color: "#86efac" };
  if (pct >= 40) return { label: "Mixed",                   color: "#facc15" };
  if (pct >= 20) return { label: "Mostly Negative",         color: "#f87171" };
  return           { label: "Overwhelmingly Negative",      color: "#ef4444" };
}

function opsScoreColor(score: number): string {
  if (score >= 60) return "#5ec269";
  if (score >= 30) return "#e8a832";
  return "#e25535";
}

function opsScoreGlyph(score: number): string {
  if (score >= 60) return "▲";
  if (score >= 30) return "◆";
  return "▼";
}

function opsScoreTier(score: number): string {
  if (score >= 60) return "BREAKOUT";
  if (score >= 30) return "WATCH";
  return "COLD";
}

function compBarColor(pct: number): string {
  if (pct >= 70) return "#5ec269";
  if (pct >= 40) return "#e8a832";
  return "#6b6058";
}

function deriveCreatorImpacts(videos: TimelineVideo[], snapshots: TimelineSnapshot[]): CreatorImpact[] {
  if (videos.length === 0 || snapshots.length === 0) return [];

  function findClosestSnapshot(targetDate: string): TimelineSnapshot | null {
    let best: TimelineSnapshot | null = null;
    let bestDist = Infinity;
    for (const s of snapshots) {
      const dist = Math.abs(daysBetween(s.date, targetDate));
      if (dist < bestDist) { bestDist = dist; best = s; }
    }
    return best;
  }

  function findSnapshotNearDay(dayOffset: number, pubDate: string): TimelineSnapshot | null {
    const d = new Date(pubDate + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + dayOffset);
    return findClosestSnapshot(d.toISOString().slice(0, 10));
  }

  function velocityDelta(pubDate: string): { before: number; after: number } {
    const dayBefore3 = findSnapshotNearDay(-3, pubDate);
    const dayBefore0 = findClosestSnapshot(pubDate);
    const dayAfter3  = findSnapshotNearDay(3, pubDate);
    const revPre  = (dayBefore0?.review_count ?? 0) - (dayBefore3?.review_count ?? 0);
    const revPost = (dayAfter3?.review_count  ?? 0) - (dayBefore0?.review_count ?? 0);
    return { before: revPre / 3, after: revPost / 3 };
  }

  const latestSnap = snapshots[snapshots.length - 1];
  const maxReviews = latestSnap?.review_count ?? 1;

  const rawImpacts = videos
    .filter((v) => v.published_at)
    .map((v) => {
      const pubDate = v.published_at!.slice(0, 10);
      const before = findSnapshotNearDay(-7, pubDate);
      const after  = findSnapshotNearDay(7, pubDate);
      const reviewsBefore = before?.review_count ?? 0;
      const reviewsAfter  = after?.review_count  ?? reviewsBefore;
      const ccuBefore = before?.peak_ccu ?? 0;
      const ccuAfter  = after?.peak_ccu  ?? ccuBefore;
      const rawDelta  = reviewsAfter - reviewsBefore;
      const vel = velocityDelta(pubDate);
      return {
        channel_name: v.channel_name || "Unknown",
        subscriber_count: v.subscriber_count ?? 0,
        video_title: v.title,
        upload_date: pubDate,
        view_count: v.view_count ?? 0,
        reviews_before_7d: reviewsBefore,
        reviews_after_7d: reviewsAfter,
        ccu_before_7d: ccuBefore,
        ccu_after_7d: ccuAfter,
        raw_review_delta: rawDelta,
        velocity_before: vel.before,
        velocity_after: vel.after,
        impact_score: 0,
        covers: v.covers || "game",
        shared_date: false,
      };
    });

  // Split same-day attribution proportionally
  const byDate = new Map<string, typeof rawImpacts>();
  for (const imp of rawImpacts) {
    const group = byDate.get(imp.upload_date) || [];
    group.push(imp);
    byDate.set(imp.upload_date, group);
  }
  for (const [, group] of byDate) {
    if (group.length <= 1) continue;
    const totalSubs = group.reduce((s, g) => s + Math.max(1, g.subscriber_count), 0);
    const totalDelta = group[0].raw_review_delta;
    for (const imp of group) {
      const share = Math.max(1, imp.subscriber_count) / totalSubs;
      imp.raw_review_delta = Math.round(totalDelta * share);
      imp.shared_date = true;
    }
  }
  for (const imp of rawImpacts) {
    imp.impact_score = maxReviews > 0
      ? Math.max(0, Math.min(100, Math.round((imp.raw_review_delta / Math.max(1, maxReviews)) * 300)))
      : 0;
  }
  return rawImpacts.sort((a, b) => b.impact_score - a.impact_score);
}

/* ── Verdict builder ──────────────────────────────────────────────── */

function buildVerdict(
  latestSnapshot: TimelineSnapshot | null,
  latestWithOps: TimelineSnapshot | null,
  creatorImpacts: CreatorImpact[],
): { headline: string; bullets: string[] } {
  const bullets: string[] = [];
  const opsScore = latestWithOps?.ops_score ?? 0;
  const velComp  = latestWithOps?.velocity_component ?? null;
  const decayComp = latestWithOps?.decay_component ?? null;
  const reviewPct = latestSnapshot?.review_score_pct ?? null;
  const reviewCount = latestSnapshot?.review_count ?? null;

  // Creator coverage
  const highImpact = creatorImpacts.filter(c => c.subscriber_count >= 400_000);
  if (creatorImpacts.length === 0) {
    bullets.push("No creator coverage yet — opportunity window is open.");
  } else if (highImpact.length > 0) {
    const top = highImpact[0];
    const delta = top.reviews_after_7d - top.reviews_before_7d;
    bullets.push(
      `${top.channel_name} (${fmtNum(top.subscriber_count)}) uploaded · reviews +${delta} in 7 days.`
    );
  } else {
    bullets.push(
      `${creatorImpacts.length} creator${creatorImpacts.length > 1 ? "s" : ""} covered — no mid-tier or above yet.`
    );
  }

  // Velocity
  if (velComp != null && velComp >= 2.0) {
    bullets.push(`Velocity ${velComp.toFixed(1)}× age-expected — accelerating past peers.`);
  } else if (velComp != null && velComp >= 1.0) {
    bullets.push(`Velocity ${velComp.toFixed(1)}× expected — tracking with strong peers.`);
  } else if (decayComp != null && decayComp >= 1.2) {
    bullets.push(`Decay retention ${decayComp.toFixed(1)}× — interest holding after launch week.`);
  }

  // Sentiment
  if (reviewPct != null && reviewCount != null && reviewCount >= 10) {
    const rating = getSteamRating(reviewPct);
    bullets.push(`${Math.round(reviewPct)}% positive (${fmtNum(reviewCount)} reviews) — ${rating.label}.`);
  }

  // Demo conversion
  const demoScore = latestSnapshot?.demo_review_score_pct ?? null;
  const demoCount = latestSnapshot?.demo_review_count ?? null;
  if (demoCount != null && demoCount > 0 && demoScore != null && reviewPct != null) {
    const diff = Math.round(reviewPct - demoScore);
    if (diff > 0) {
      bullets.push(`Demo converted upward: ${Math.round(demoScore)}% → ${Math.round(reviewPct)}% on full release.`);
    } else {
      bullets.push(`${fmtNum(demoCount)} demo reviews at ${Math.round(demoScore)}%.`);
    }
  }

  // Headline
  let headline: string;
  if (opsScore >= 60) {
    if (creatorImpacts.length === 0) {
      headline = "You're early — no creator coverage yet at breakout strength.";
    } else if (highImpact.length === 0) {
      headline = "Ride this before the mid-tier creators land.";
    } else {
      headline = "Creator-driven breakout — momentum is real.";
    }
  } else if (opsScore >= 30) {
    headline = velComp != null && velComp >= 1.5
      ? "Signals are building — watch for creator coverage to confirm."
      : "Moderate signal — needs a catalyst to break out.";
  } else if (opsScore > 0) {
    headline = "Too early to call — limited data, check back soon.";
  } else {
    headline = "No OPS data yet — check back after first daily collection.";
  }

  return { headline, bullets: bullets.slice(0, 4) };
}

/* ── Custom Tooltip ───────────────────────────────────────────────── */

function AutopsyTooltip({ active, payload, visibleSeries, events }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload as TimelineSnapshot;
  if (!d) return null;
  const eventsOnDay = (events as TimelineEvent[]).filter((e) => e.date === d.date);

  return (
    <div
      className="font-mono text-[11px] leading-relaxed max-w-[260px] rounded"
      style={{ background: C.surface, border: `1px solid ${C.border}`, padding: "10px 14px", color: C.white }}
    >
      <div className="font-bold text-xs mb-1" style={{ color: C.dim }}>
        {fmtDate(d.date)} — Day {d.day_index}
      </div>
      {visibleSeries.raw_ops && d.raw_ops != null && (
        <div><span style={{ color: C.ops }}>OPS</span> {d.raw_ops.toFixed(1)}{" "}
          <span className="text-[9px]" style={{ color: C.dim }}>(capped: {d.ops_score})</span>
        </div>
      )}
      {visibleSeries.review_count && d.review_count != null && (
        <div><span style={{ color: C.reviews }}>Reviews</span> {fmtNum(d.review_count)}</div>
      )}
      {visibleSeries.peak_ccu && d.peak_ccu != null && (
        <div><span style={{ color: C.ccu }}>Peak CCU</span> {fmtNum(d.peak_ccu)}</div>
      )}
      {(d as any).review_velocity != null && visibleSeries.review_velocity && (
        <div><span style={{ color: "#f97316" }}>Velocity</span> {(d as any).review_velocity.toFixed(1)}/day</div>
      )}
      {visibleSeries.review_score_pct && d.review_score_pct != null && d.review_score_pct > 0 && (
        <div>
          <span style={{ color: C.score }}>Score</span> {d.review_score_pct.toFixed(1)}%{" "}
          <span className="text-[9px]" style={{ color: getSteamRating(d.review_score_pct).color }}>
            {getSteamRating(d.review_score_pct).label}
          </span>
        </div>
      )}
      {visibleSeries.demo_review_count && d.demo_review_count != null && d.demo_review_count > 0 && (
        <div><span style={{ color: "#22d3ee" }}>Demo Rev</span> {d.demo_review_count}</div>
      )}
      {visibleSeries.yt_cumulative_views && d.yt_cumulative_views > 0 && (
        <div><span style={{ color: "#38bdf8" }}>YT Views</span> {fmtNum(d.yt_cumulative_views)}</div>
      )}
      {eventsOnDay.length > 0 && (
        <div className="mt-1.5 pt-1 border-t" style={{ borderColor: C.border }}>
          {eventsOnDay.map((e, i) => (
            <div key={i} className="text-[10px]" style={{ color: EVENT_COLORS[e.type] || C.dim }}>
              {eventShape(e.type)} {e.title}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Event Flag Card Overlay ──────────────────────────────────────── */

function EventCard({ event, onClose }: { event: TimelineEvent; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="rounded-md w-[90%] max-w-[420px]"
        style={{
          background: C.surface,
          border: `1px solid ${C.border}`,
          borderTop: `3px solid ${EVENT_COLORS[event.type] || C.dim}`,
          padding: "24px 28px",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-start mb-3">
          <div>
            <span
              className="font-mono text-[10px] uppercase tracking-[1.5px]"
              style={{ color: EVENT_COLORS[event.type] || C.dim }}
            >
              {EVENT_LABELS[event.type] || event.type}
            </span>
            <h3 className="text-text-main text-lg font-bold mt-1">{event.title}</h3>
          </div>
          <button onClick={onClose} className="text-text-dim hover:text-text-main text-xl px-1 leading-none">
            &times;
          </button>
        </div>
        <div className="font-mono text-[11px] text-text-dim mb-2.5">
          {fmtDate(event.date)} — Day {event.day_index}
        </div>
        <p className="text-text-main text-sm leading-relaxed">{event.detail}</p>
        {event.channel_name && (
          <div className="font-mono text-[11px] text-text-dim mt-3">
            <span style={{ color: "#22d3ee" }}>{event.channel_name}</span>
            {event.subscriber_count && <> · {fmtNum(event.subscriber_count)} subs</>}
            {event.view_count && <> · {fmtNum(event.view_count)} views</>}
          </div>
        )}
        {event.subreddit && (
          <div className="font-mono text-[11px] text-text-dim mt-3">
            <span style={{ color: "#f97316" }}>r/{event.subreddit}</span>
            {event.score && <> · {fmtNum(event.score)} upvotes</>}
            {event.num_comments && <> · {event.num_comments} comments</>}
          </div>
        )}
      </div>
    </div>
  );
}

/* ==================================================================
   SIGNAL TRACE — Main Component
   ================================================================== */

export default function TheAutopsy() {
  const { appid } = useParams<{ appid: string }>();

  /* ── Data fetching ── */
  const [data, setData] = useState<TimelineResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!appid) { setError("No app ID specified"); setLoading(false); return; }
    setLoading(true);
    setError(null);
    fetch(`${import.meta.env.VITE_API_URL || "/api"}/games/${appid}/timeline`)
      .then((r) => { if (!r.ok) throw new Error("Game not found"); return r.json(); })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [appid]);

  /* ── State ── */
  const [visibleSeries, setVisibleSeries] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    SERIES.forEach((s) => (init[s.key] = s.defaultOn));
    return init;
  });
  const [selectedEvent, setSelectedEvent] = useState<TimelineEvent | null>(null);
  const [showSandbox, setShowSandbox] = useState(false);
  const [sandboxWeights, setSandboxWeights] = useState<OpsWeights>(DEFAULT_WEIGHTS);
  const [brushRange, setBrushRange] = useState<{ startIndex: number; endIndex: number }>({
    startIndex: 0, endIndex: 0,
  });

  const toggleSeries = useCallback((key: string) => {
    setVisibleSeries((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  /* ── Derived data ── */
  const game = data?.game ?? null;
  const releaseDate = game?.release_date ?? null;

  const snapshots: TimelineSnapshot[] = useMemo(() => {
    if (!data?.snapshots || !releaseDate) return [];
    return data.snapshots.map((s) => ({ ...s, day_index: daysBetween(releaseDate, s.date) }));
  }, [data, releaseDate]);

  const events: TimelineEvent[] = useMemo(() => {
    if (!data?.events || !releaseDate) return [];
    return data.events.map((e) => ({ ...e, type: e.type as EventType, day_index: daysBetween(releaseDate, e.date) }));
  }, [data, releaseDate]);

  const phases = useMemo(() => {
    if (!releaseDate) return [];
    return derivePhases(snapshots, releaseDate);
  }, [snapshots, releaseDate]);

  const creatorImpacts = useMemo(() => {
    if (!data?.videos) return [];
    return deriveCreatorImpacts(data.videos, snapshots);
  }, [data?.videos, snapshots]);

  const tags = useMemo(() => parseTags(game?.tags ?? null), [game?.tags]);
  // parseGenres is available but not currently used in render
  void parseGenres;

  /* ── Brush + chartData ── */
  useEffect(() => {
    if (snapshots.length > 0) setBrushRange({ startIndex: 0, endIndex: snapshots.length - 1 });
  }, [snapshots.length]);

  const chartData = useMemo(() => {
    if (snapshots.length === 0) return snapshots;
    return snapshots.map((s, i) => {
      let velocity: number | undefined;
      if (i >= 3 && s.review_count != null) {
        const prev = snapshots[i - 3];
        if (prev?.review_count != null) velocity = Math.max(0, (s.review_count - prev.review_count) / 3);
      } else if (i > 0 && s.review_count != null) {
        const prev = snapshots[i - 1];
        if (prev?.review_count != null) velocity = Math.max(0, s.review_count - prev.review_count);
      }
      return { ...s, review_velocity: velocity };
    });
  }, [snapshots]);

  const activePhase = useMemo(() => {
    if (snapshots.length === 0) return null;
    const mid = Math.round((brushRange.startIndex + brushRange.endIndex) / 2);
    const snap = snapshots[mid];
    if (!snap) return null;
    for (const p of phases) {
      if (snap.day_index >= p.start_day && snap.day_index <= p.end_day) return p.id;
    }
    return null;
  }, [brushRange, snapshots, phases]);

  /* ── Key snapshots ── */
  const opsPeak = useMemo(() => {
    let best = { score: 0, day: 0, date: "" };
    snapshots.forEach((s) => {
      const raw = s.raw_ops ?? s.ops_score ?? 0;
      if (raw > best.score) best = { score: Math.round(raw * 10) / 10, day: s.day_index, date: s.date };
    });
    return best;
  }, [snapshots]);

  const latestWithOps = useMemo(() => {
    for (let i = snapshots.length - 1; i >= 0; i--) {
      if (snapshots[i].ops_score != null) return snapshots[i];
    }
    return snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;
  }, [snapshots]);

  const latestSnapshot = useMemo(() => {
    for (let i = snapshots.length - 1; i >= 0; i--) {
      if (snapshots[i].review_count != null) return snapshots[i];
    }
    return snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;
  }, [snapshots]);

  const latestVelocity = useMemo(() => {
    const withVel = chartData.filter((d) => d.review_velocity != null);
    return withVel.length > 0 ? withVel[withVel.length - 1].review_velocity! : null;
  }, [chartData]);

  const reviewDelta7d = useMemo(() => {
    const last = latestSnapshot;
    if (!last?.review_count) return null;
    const targetDay = last.day_index - 7;
    let best: TimelineSnapshot | null = null;
    let bestDist = Infinity;
    for (const s of snapshots) {
      if (s.review_count == null || s.date === last.date) continue;
      const dist = Math.abs(s.day_index - targetDay);
      if (dist < bestDist) { bestDist = dist; best = s; }
    }
    if (!best?.review_count || bestDist > 4) return null;
    return last.review_count - best.review_count;
  }, [snapshots, latestSnapshot]);

  /* ── OPS momentum ── */
  const opsMomentum = useMemo(() => {
    const opsSnaps = snapshots.filter((s) => s.ops_score != null);
    if (opsSnaps.length < 2) return { arrow: "", label: "" };
    const latest = opsSnaps[opsSnaps.length - 1].ops_score!;
    const prev   = opsSnaps[opsSnaps.length - 2].ops_score!;
    if (latest > prev) return { arrow: "↗", label: "rising" };
    if (latest < prev) return { arrow: "↘", label: "falling" };
    return { arrow: "→", label: "stable" };
  }, [snapshots]);

  /* ── Story sentence ── */
  const storySentence = useMemo(() => {
    if (!game || !latestSnapshot) return "";
    const daysSinceLaunch = releaseDate ? daysBetween(releaseDate, new Date().toISOString().slice(0, 10)) : 0;
    const maxCcu = snapshots.reduce((mx, s) => Math.max(mx, s.peak_ccu ?? 0), 0);
    const parts: string[] = [`${game.title}${game.developer ? ` by ${game.developer}` : ""}`];
    if (daysSinceLaunch > 0) parts.push(`launched ${daysSinceLaunch} days ago`);
    if (latestSnapshot.review_count != null) {
      let p = `with ${fmtNum(latestSnapshot.review_count)} reviews`;
      if (latestSnapshot.review_score_pct != null) p += ` (${Math.round(latestSnapshot.review_score_pct)}% positive)`;
      parts.push(p);
    }
    if (maxCcu > 0) parts.push(`and a peak of ${fmtNum(maxCcu)} concurrent players`);
    return parts.join(" ") + ".";
  }, [game, latestSnapshot, releaseDate, snapshots]);

  /* ── Receipts rows (milestone snapshots) ── */
  const receiptRows = useMemo(() => {
    if (snapshots.length === 0) return [];
    const milestones = [0, 7, 14, 30, 60, 90];
    const usedDates = new Set<string>();
    const rows: TimelineSnapshot[] = [];

    for (const m of milestones) {
      let closest: TimelineSnapshot | null = null;
      let bestDist = Infinity;
      for (const s of snapshots) {
        const dist = Math.abs(s.day_index - m);
        if (dist < bestDist) { bestDist = dist; closest = s; }
      }
      if (closest && bestDist <= 3 && !usedDates.has(closest.date)) {
        rows.push(closest);
        usedDates.add(closest.date);
      }
    }
    const latest = snapshots[snapshots.length - 1];
    if (latest && !usedDates.has(latest.date)) rows.push(latest);

    return rows.sort((a, b) => a.day_index - b.day_index);
  }, [snapshots]);

  /* ── OPS radar + sandbox (MUST be before early returns) ── */
  const radarData = useMemo(() => {
    if (!latestWithOps) return null;
    const comps = [
      { label: "Velocity",  value: latestWithOps.velocity_component,  max: 5.0 },
      { label: "Decay",     value: latestWithOps.decay_component,     max: 2.0 },
      { label: "Reviews",   value: latestWithOps.review_component,    max: 5.0 },
      { label: "YouTube",   value: latestWithOps.youtube_component,   max: 2.0 },
      { label: "CCU",       value: latestWithOps.ccu_component,       max: 5.0 },
      { label: "Sentiment", value: latestWithOps.sentiment_component, max: 2.0 },
      { label: "Twitch",    value: latestWithOps.twitch_component,    max: 3.0 },
    ];
    if (!comps.some((c) => c.value != null && c.value > 0)) return null;
    return comps.map((c) => ({
      axis: c.label,
      score: c.value != null && c.max > 0 ? Math.min(100, Math.round((c.value / c.max) * 100)) : 0,
      peer: 50,
    }));
  }, [latestWithOps]);

  const ytVideoCount = data?.videos?.length ?? 0;

  const sandboxScore = useMemo(() => {
    if (!latestWithOps) return null;
    return computeOps(
      {
        velocity:  latestWithOps.velocity_component  ?? null,
        decay:     latestWithOps.decay_component     ?? null,
        reviews:   latestWithOps.review_component    ?? null,
        youtube:   latestWithOps.youtube_component   ?? null,
        ccu:       latestWithOps.ccu_component       ?? null,
        sentiment: latestWithOps.sentiment_component ?? null,
        twitch:    latestWithOps.twitch_component    ?? null,
      },
      sandboxWeights,
    );
  }, [latestWithOps, sandboxWeights]);

  /* ── Shared chart props ── */
  const gridProps = { stroke: C.border, strokeDasharray: "2 4", vertical: false };
  const xAxisProps = {
    dataKey: "date",
    tick: { fill: C.dim, fontSize: 10, fontFamily: "'JetBrains Mono', monospace" },
    tickLine: false,
    axisLine: { stroke: C.border },
    tickFormatter: (v: string) => fmtDate(v),
    interval: Math.max(1, Math.floor(snapshots.length / 12)),
  };
  const yAxisStyle = {
    tick: { fill: C.dim, fontSize: 10, fontFamily: "'JetBrains Mono', monospace" },
    tickLine: false, axisLine: false, width: 50,
  };

  const renderPhaseBands = () =>
    phases.map((p) => (
      <ReferenceArea
        key={p.id} x1={p.start_date} x2={p.end_date}
        fill={PHASE_BAND_COLORS[p.id] || "transparent"} fillOpacity={1} ifOverflow="extendDomain"
      />
    ));

  const renderEventLines = (showIcons: boolean) =>
    events.map((e, i) => (
      <ReferenceLine
        key={`ev-${i}`} x={e.date}
        stroke={EVENT_COLORS[e.type] || C.dim} strokeDasharray="3 3" strokeOpacity={0.4}
        label={showIcons ? { value: eventShape(e.type), position: "top", fill: EVENT_COLORS[e.type] || C.dim, fontSize: 14, fontFamily: "'JetBrains Mono', monospace" } : undefined}
      />
    ));

  const todayDate = new Date().toISOString().slice(0, 10);

  const handleBrushChange = useCallback((range: any) => {
    if (range?.startIndex != null && range?.endIndex != null) {
      setBrushRange({ startIndex: range.startIndex, endIndex: range.endIndex });
    }
  }, []);

  /* ── Loading / Error states ── */
  if (loading) {
    return (
      <div className="bg-background-dark min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="font-mono text-sm text-primary mb-2">Loading signal trace…</div>
          <div className="font-mono text-xs text-text-dim">Fetching data for app {appid}</div>
        </div>
      </div>
    );
  }

  if (error || !data || !game) {
    return (
      <div className="bg-background-dark min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-2xl font-bold text-primary mb-2">Game Not Found</div>
          <div className="font-mono text-xs text-text-dim">{error || "No data available for this game."}</div>
          <Link to="/browse" className="font-mono inline-block mt-5 text-xs text-primary underline">
            Back to Browse
          </Link>
        </div>
      </div>
    );
  }

  if (snapshots.length === 0) {
    return (
      <div className="bg-background-dark min-h-screen text-text-main px-10 py-8">
        <style>{styleTag}</style>
        <div className="font-mono text-[10px] text-primary uppercase tracking-[2px] mb-1">Signal Trace</div>
        <h1 className="font-serif text-2xl font-bold mb-1">{game.title}</h1>
        <div className="font-mono text-xs text-text-dim mb-6">{game.developer || "Unknown developer"}</div>
        <div className="bg-surface-dark border border-border-dark rounded-md p-10 text-center">
          <div className="text-text-dim text-base">No snapshot data yet</div>
          <div className="font-mono text-xs text-text-dim mt-2">
            Timeline data will appear after the first daily snapshot collection.
          </div>
        </div>
      </div>
    );
  }

  /* ── Computed display values ── */
  const hasOpsData = snapshots.some((s) => s.ops_score != null);
  const maxCcu = snapshots.reduce((mx, s) => Math.max(mx, s.peak_ccu ?? 0), 0);
  const daysSinceLaunch = releaseDate ? daysBetween(releaseDate, todayDate) : null;
  const opsScore = latestWithOps?.ops_score ?? 0;
  const verdict = buildVerdict(latestSnapshot, latestWithOps, creatorImpacts);

  const opsComponents = latestWithOps
    ? [
        { label: "VELOCITY", value: latestWithOps.velocity_component, max: 5.0 },
        { label: "DECAY",    value: latestWithOps.decay_component,    max: 2.0 },
        { label: "REVIEWS",  value: latestWithOps.review_component,   max: 5.0 },
        { label: "YOUTUBE",  value: latestWithOps.youtube_component,  max: 1.8 },
        { label: "CCU",      value: latestWithOps.ccu_component,      max: 5.0 },
      ]
    : [];

  /* ── Stat cards ── */
  const statCards = [
    {
      label: "Reviews",
      value: latestSnapshot?.review_count != null ? fmtNum(latestSnapshot.review_count) : "—",
      sub: reviewDelta7d != null && reviewDelta7d > 0 ? `+${fmtNum(reviewDelta7d)} this week` : null,
      borderColor: "#802626",
    },
    {
      label: "Velocity",
      value: latestVelocity != null ? `${latestVelocity.toFixed(1)}/day` : "—",
      sub: latestVelocity != null ? "3-day rolling avg" : null,
      borderColor: "#5ec269",
    },
    {
      label: "Peak CCU",
      value: maxCcu > 0 ? fmtNum(maxCcu) : "—",
      sub: (() => {
        const cur = latestSnapshot?.peak_ccu;
        if (!cur || !maxCcu || cur >= maxCcu) return null;
        return `→ ${fmtNum(cur)} current`;
      })(),
      borderColor: "#b07db2",
    },
    {
      label: "Sentiment",
      value: latestSnapshot?.review_score_pct != null ? `${Math.round(latestSnapshot.review_score_pct)}%` : "—",
      sub: (() => {
        const pct = latestSnapshot?.review_score_pct ?? null;
        const demo = latestSnapshot?.demo_review_score_pct ?? null;
        if (pct == null || demo == null) return pct != null ? getSteamRating(pct).label : null;
        const diff = Math.round(pct - demo);
        return `${diff >= 0 ? "+" : ""}${diff} vs demo`;
      })(),
      borderColor: "#6b9ddb",
    },
  ];

  /* ================================================================
     RENDER
     ================================================================ */
  return (
    <div className="bg-background-dark min-h-screen text-text-main">
      <style>{styleTag}</style>

      {/* ── Breadcrumb ── */}
      <div className="px-10 py-3.5 font-mono text-[11px] tracking-[1.5px] text-text-dim uppercase">
        <Link to="/browse" className="text-text-mid hover:text-secondary transition-colors">← BROWSE</Link>
        {" · "}
        <span>{game.title}</span>
      </div>

      {/* ═══════════════════════════════════════════════════════
          HERO: 2-column — title/verdict left, OPS sidecar right
      ══════════════════════════════════════════════════════════ */}
      <section className="max-w-[1200px] mx-auto px-10 pb-9 grid md:grid-cols-[1fr_320px] gap-10 items-start border-b border-border-dark autopsy-stagger-1">

        {/* Left column */}
        <div>
          <h1 className="font-serif text-3xl font-bold leading-[1.05] mb-2 tracking-tight">
            {game.title}
          </h1>
          <div className="font-mono text-xs tracking-[2px] text-text-mid uppercase mb-7">
            {[
              game.developer,
              game.price_usd != null ? (game.price_usd === 0 ? "Free" : `$${game.price_usd.toFixed(2)}`) : null,
              daysSinceLaunch != null ? `Day ${daysSinceLaunch} since launch` : null,
              game.has_demo ? "Demo available" : null,
            ].filter(Boolean).join(" · ")}
          </div>

          {/* Steam tags strip */}
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-6">
              {tags.slice(0, 8).map((t) => (
                <span key={t} className="font-mono text-[9px] px-1.5 py-0.5 rounded border border-border-dark text-text-dim bg-white/[0.04]">
                  {t}
                </span>
              ))}
            </div>
          )}

          {/* Streamer Verdict card */}
          <div
            className="rounded-lg relative"
            style={{
              padding: "22px 26px",
              background: "linear-gradient(135deg, rgba(94,194,105,0.08), rgba(94,194,105,0.02))",
              border: "1px solid rgba(94,194,105,0.25)",
              borderLeft: "4px solid #5ec269",
            }}
          >
            <div className="font-mono text-[10px] tracking-[2.5px] text-status-pos mb-2.5 flex items-center gap-2">
              <span className="text-[9px]">▶</span> STREAMER VERDICT
            </div>
            <h2 className="font-serif text-[22px] font-bold leading-[1.3] mb-3.5 text-text-main">
              {verdict.headline}
            </h2>
            {verdict.bullets.length > 0 && (
              <ul className="grid sm:grid-cols-2 gap-2.5 list-none mb-0">
                {verdict.bullets.map((b, i) => (
                  <li key={i} className="text-sm text-text-main flex items-start gap-2 leading-relaxed py-1.5">
                    <span className="text-status-pos font-bold flex-shrink-0">✓</span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex gap-3 mt-4 pt-4 border-t border-border-dark flex-wrap">
              <a
                href={`https://store.steampowered.com/app/${game.appid}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-[11px] tracking-[1.5px] px-3.5 py-2 rounded bg-primary text-white uppercase font-bold hover:bg-primary-light transition-colors"
              >
                ▸ Open on Steam
              </a>
              <a
                href={`https://store.steampowered.com/app/${game.appid}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-[11px] tracking-[1.5px] px-3.5 py-2 rounded border border-border-dark text-text-mid uppercase font-bold hover:border-text-dim transition-colors"
              >
                ★ Wishlist
              </a>
            </div>
          </div>
        </div>

        {/* Right column — OPS sidecar */}
        <aside className="bg-surface-dark border border-border-dark rounded-[10px] p-6 autopsy-stagger-2">
          <div className="font-mono text-[10px] tracking-[2px] text-text-dim uppercase mb-2.5">
            OPS Breakdown
          </div>

          {opsScore > 0 ? (
            <>
              <div className="flex items-baseline gap-2 mb-1">
                <span className="text-base font-bold" style={{ color: opsScoreColor(opsScore) }}>
                  {opsScoreGlyph(opsScore)}
                </span>
                <span
                  className="font-mono text-[56px] font-bold leading-none"
                  style={{ color: opsScoreColor(opsScore) }}
                >
                  {Math.round(opsScore)}
                </span>
                <span className="font-mono text-sm text-text-dim">/ 100</span>
              </div>
              <div className="font-mono text-[11px] tracking-[1.5px] mb-3.5" style={{ color: opsScoreColor(opsScore) }}>
                {opsScoreTier(opsScore)}
                {opsMomentum.arrow && (
                  <span className="ml-2 text-text-dim">{opsMomentum.arrow} {opsMomentum.label}</span>
                )}
              </div>

              {/* Percentile bar */}
              <div className="w-full h-1 bg-border-dark rounded overflow-hidden mb-1.5">
                <div
                  className="h-full rounded"
                  style={{ width: `${opsScore}%`, background: opsScoreColor(opsScore) }}
                />
              </div>
              <div className="font-mono text-[10px] text-text-dim tracking-[1px] mb-4 uppercase">
                Score within 0–100 range
              </div>

              {/* Component bars */}
              {opsComponents.length > 0 && (
                <div className="flex flex-col gap-2" role="list" aria-label="OPS component breakdown">
                  {opsComponents.map((comp) => {
                    const pct = comp.value != null ? Math.min(100, (comp.value / comp.max) * 100) : 0;
                    return (
                      <div key={comp.label} className="grid grid-cols-[70px_1fr_40px] gap-2 items-center font-mono text-[10px]" role="listitem">
                        <span className="text-text-mid tracking-[1px]">{comp.label}</span>
                        <div className="h-1 bg-border-dark rounded overflow-hidden">
                          <div
                            className="h-full rounded"
                            style={{ width: `${pct}%`, background: compBarColor(pct) }}
                          />
                        </div>
                        <span className="text-right text-text-main">
                          {comp.value != null ? comp.value.toFixed(1) : "—"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              {latestWithOps?.ops_confidence && (
                <div className="mt-3 pt-3 border-t border-border-dark font-mono text-[10px] text-text-dim">
                  Confidence: <span className="text-text-mid">{latestWithOps.ops_confidence}</span>
                  {" · "} Formula v5
                </div>
              )}
            </>
          ) : (
            <div className="text-text-dim text-sm italic">No OPS score yet</div>
          )}
        </aside>
      </section>

      {/* ═══════════════════════════════════════════════════════
          4 STAT CARDS
      ══════════════════════════════════════════════════════════ */}
      <section className="max-w-[1200px] mx-auto px-10 py-12 border-b border-border-dark autopsy-stagger-2">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
          {statCards.map((card) => (
            <div
              key={card.label}
              className="px-4 py-3.5 rounded"
              style={{
                background: "#1f1f22",
                borderLeft: `3px solid ${card.borderColor}`,
              }}
            >
              <div className="font-mono text-[9px] tracking-[2px] text-text-dim uppercase mb-1">
                {card.label}
              </div>
              <div className="font-mono text-[22px] font-bold leading-tight text-text-main">
                {card.value}
              </div>
              {card.sub && (
                <div className="font-mono text-[11px] mt-0.5" style={{ color: "#5ec269" }}>
                  {card.sub}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════
          SIGNAL TRACE — Charts
      ══════════════════════════════════════════════════════════ */}
      <section className="max-w-[1200px] mx-auto px-10 py-12 border-b border-border-dark autopsy-stagger-3">
        <p className="font-mono text-[11px] tracking-[3px] text-primary uppercase mb-2">Signal trace</p>
        <h2 className="font-serif text-[32px] font-bold mb-3 tracking-tight">The shape of its breakout</h2>
        <p className="text-sm text-text-mid mb-7 max-w-[680px] leading-[1.55]">{storySentence}</p>

        {/* Series toggle pills */}
        <div className="flex gap-2 flex-wrap mb-4 items-center">
          {SERIES.map((s) => (
            <button
              key={s.key}
              onClick={() => toggleSeries(s.key)}
              className="font-mono text-[10px] px-3 py-1 rounded transition-colors"
              style={{
                border: `1px solid ${visibleSeries[s.key] ? s.color : C.border}`,
                background: visibleSeries[s.key] ? `${s.color}20` : "transparent",
                color: visibleSeries[s.key] ? s.color : C.dim,
              }}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Panel 1: OPS */}
        {hasOpsData && (
          <div className="bg-surface-dark border border-border-dark rounded-md mb-2 px-3 pt-4 pb-2">
            <div className="font-mono text-[10px] text-text-dim uppercase tracking-[1.5px] mb-2 pl-2">
              OPS Score
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <ComposedChart data={chartData} syncId="signal" margin={{ top: 20, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid {...gridProps} />
                {renderPhaseBands()}
                <XAxis {...xAxisProps} hide />
                <YAxis {...yAxisStyle} tickFormatter={(v: number) => v.toFixed(1)} />
                <Tooltip content={(props: any) => <AutopsyTooltip {...props} visibleSeries={visibleSeries} events={events} />} cursor={{ stroke: C.dim, strokeDasharray: "3 3" }} />
                {renderEventLines(true)}
                <ReferenceLine x={todayDate} stroke={C.dim} strokeDasharray="6 3" label={{ value: "Today", fill: C.dim, fontSize: 10, position: "top" }} />
                {visibleSeries.raw_ops && (
                  <Line dataKey="raw_ops" stroke={C.ops} strokeWidth={2.5} dot={false} connectNulls activeDot={{ r: 4, fill: C.ops, stroke: C.bg, strokeWidth: 2 }} />
                )}
              </ComposedChart>
            </ResponsiveContainer>
            {events.length > 0 && (
              <div className="flex gap-1 flex-wrap px-2 pt-1.5 pb-1 border-t border-border-dark">
                {events.map((e, i) => (
                  <button
                    key={i}
                    className="autopsy-event-flag font-mono text-[10px] px-1.5 py-0.5 rounded"
                    onClick={() => setSelectedEvent(e)}
                    title={e.title}
                    style={{
                      background: `${EVENT_COLORS[e.type] || C.dim}18`,
                      border: `1px solid ${(EVENT_COLORS[e.type] || C.dim)}40`,
                      color: EVENT_COLORS[e.type] || C.dim,
                    }}
                  >
                    {eventShape(e.type)} D{e.day_index}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Panel 2: Reviews + CCU */}
        <div className="bg-surface-dark border border-border-dark rounded-md mb-2 px-3 pt-4 pb-2">
          <div className="font-mono text-[10px] text-text-dim uppercase tracking-[1.5px] mb-2 pl-2">
            Reviews + Concurrent Players
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <ComposedChart data={chartData} syncId="signal" margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid {...gridProps} />
              {renderPhaseBands()}
              <XAxis {...xAxisProps} hide />
              <YAxis yAxisId="reviews" {...yAxisStyle} tickFormatter={(v: number) => fmtNum(v)} />
              <YAxis yAxisId="ccu" orientation="right" {...yAxisStyle} tickFormatter={(v: number) => fmtNum(v)} />
              <Tooltip content={(props: any) => <AutopsyTooltip {...props} visibleSeries={visibleSeries} events={events} />} cursor={{ stroke: C.dim, strokeDasharray: "3 3" }} />
              {renderEventLines(false)}
              <ReferenceLine x={todayDate} stroke={C.dim} strokeDasharray="6 3" yAxisId="reviews" />
              {visibleSeries.peak_ccu && (
                <Area dataKey="peak_ccu" yAxisId="ccu" stroke={C.ccu} fill={C.ccu} fillOpacity={0.12} strokeWidth={1.5} connectNulls dot={snapshots.filter(s => s.peak_ccu != null).length <= 3 ? { r: 3, fill: C.ccu } : false} />
              )}
              {visibleSeries.review_count && (
                <Line dataKey="review_count" yAxisId="reviews" stroke={C.reviews} strokeWidth={2} connectNulls dot={snapshots.filter(s => s.review_count != null).length <= 3 ? { r: 3, fill: C.reviews } : false} activeDot={{ r: 3, fill: C.reviews, stroke: C.bg, strokeWidth: 2 }} />
              )}
              {visibleSeries.demo_review_count && (
                <Line dataKey="demo_review_count" yAxisId="reviews" stroke="#22d3ee" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
              )}
              {visibleSeries.review_velocity && (
                <Line dataKey="review_velocity" yAxisId="ccu" stroke="#f97316" strokeWidth={1.5} dot={false} connectNulls strokeDasharray="4 2" activeDot={{ r: 3, fill: "#f97316", stroke: C.bg, strokeWidth: 2 }} />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Panel 3: Score % + YT Views */}
        <div className="bg-surface-dark border border-border-dark rounded-md px-3 pt-4 pb-2">
          <div className="font-mono text-[10px] text-text-dim uppercase tracking-[1.5px] mb-2 pl-2">
            Review Sentiment + YouTube Views
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <ComposedChart data={chartData} syncId="signal" margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid {...gridProps} />
              {renderPhaseBands()}
              <XAxis {...xAxisProps} />
              <YAxis yAxisId="score" {...yAxisStyle} domain={[0, 100]} tickFormatter={(v: number) => v + "%"} />
              <YAxis yAxisId="ytviews" orientation="right" {...yAxisStyle} tickFormatter={(v: number) => fmtNum(v)} />
              <Tooltip content={(props: any) => <AutopsyTooltip {...props} visibleSeries={visibleSeries} events={events} />} cursor={{ stroke: C.dim, strokeDasharray: "3 3" }} />
              {visibleSeries.review_score_pct && (
                <>
                  <ReferenceArea yAxisId="score" y1={95} y2={100} fill="#22c55e" fillOpacity={0.04} />
                  <ReferenceArea yAxisId="score" y1={80} y2={95} fill="#22c55e" fillOpacity={0.03} />
                  <ReferenceArea yAxisId="score" y1={70} y2={80} fill="#86efac" fillOpacity={0.02} />
                  <ReferenceLine yAxisId="score" y={80} stroke="#22c55e" strokeDasharray="8 6" strokeOpacity={0.25} label={{ value: "Very Positive", fill: "#22c55e", fontSize: 8, position: "insideTopLeft", fontFamily: "'JetBrains Mono', monospace" }} />
                </>
              )}
              {renderEventLines(false)}
              <ReferenceLine x={todayDate} stroke={C.dim} strokeDasharray="6 3" yAxisId="score" />
              {visibleSeries.review_score_pct && (
                <Line dataKey="review_score_pct" yAxisId="score" stroke={C.score} strokeWidth={2} connectNulls dot={snapshots.filter(s => s.review_score_pct != null).length <= 3 ? { r: 3, fill: C.score } : false} activeDot={{ r: 3, fill: C.score, stroke: C.bg, strokeWidth: 2 }} />
              )}
              {visibleSeries.yt_cumulative_views && (
                <Area dataKey="yt_cumulative_views" yAxisId="ytviews" stroke="#38bdf8" fill="#38bdf8" fillOpacity={0.08} strokeWidth={1.5} dot={false} connectNulls />
              )}
              <Brush dataKey="date" height={28} stroke={C.border} fill={C.bg} tickFormatter={(v: string) => fmtDate(v)} onChange={handleBrushChange} />
            </ComposedChart>
          </ResponsiveContainer>
          {visibleSeries.yt_cumulative_views && (
            <div className="font-mono text-[9px] text-text-dim px-2 pt-1 opacity-60">
              YT views are cumulative snapshots — step pattern reflects periodic collection.
            </div>
          )}
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════
          RECEIPTS TABLE — Snapshot history
      ══════════════════════════════════════════════════════════ */}
      <section className="max-w-[1200px] mx-auto px-10 py-12 border-b border-border-dark autopsy-stagger-3">
        <p className="font-mono text-[11px] tracking-[3px] text-primary uppercase mb-2">Track record</p>
        <h2 className="font-serif text-[32px] font-bold mb-3 tracking-tight">Snapshot history</h2>
        <p className="text-sm text-text-mid mb-7 max-w-[680px] leading-[1.55]">
          Key milestones from launch to today — reviews, sentiment, and OPS at each checkpoint.
        </p>

        <div className="bg-surface-dark border border-border-dark rounded-lg overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-[100px_1fr_110px_110px_90px] gap-4 px-5 py-3.5 bg-[#1f1f22] font-mono text-[10px] tracking-[2px] text-text-dim uppercase border-b border-border-dark">
            <span>Date</span>
            <span>Event</span>
            <span className="text-right">Reviews</span>
            <span className="text-right">Sentiment</span>
            <span className="text-right">OPS</span>
          </div>

          {receiptRows.map((s, idx) => {
            const eventsOnDay = events.filter((e) => e.date === s.date);
            const isLatest = idx === receiptRows.length - 1;
            const eventNote = eventsOnDay.length > 0
              ? eventsOnDay.map((e) => e.title).join(", ")
              : s.day_index === 0
              ? "Game launched"
              : isLatest
              ? "Latest snapshot"
              : "—";

            return (
              <div
                key={s.date}
                className="grid grid-cols-[100px_1fr_110px_110px_90px] gap-4 px-5 py-3.5 border-b border-border-dark text-sm items-center last:border-0"
                style={isLatest ? { background: "rgba(94,194,105,0.05)" } : undefined}
              >
                <span className="font-mono text-[11px] text-text-mid">
                  {fmtDate(s.date)} · D{s.day_index}
                </span>
                <span className="text-text-main text-sm truncate">{eventNote}</span>
                <span className={`font-mono text-right ${s.review_count != null && s.review_count > 0 ? "text-text-main" : "text-text-dim"}`}>
                  {s.review_count != null ? fmtNum(s.review_count) : "—"}
                </span>
                <span className={`font-mono text-right ${s.review_score_pct != null ? "text-text-main" : "text-text-dim"}`}>
                  {s.review_score_pct != null ? `${Math.round(s.review_score_pct)}%` : "—"}
                </span>
                <span
                  className="font-mono text-right font-bold"
                  style={{ color: s.ops_score != null && s.ops_score > 0 ? opsScoreColor(s.ops_score) : C.dim }}
                >
                  {s.ops_score != null && s.ops_score > 0 ? Math.round(s.ops_score) : "—"}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════
          PHASE ANALYSIS
      ══════════════════════════════════════════════════════════ */}
      {phases.length > 0 && (
        <section className="max-w-[1200px] mx-auto px-10 py-12 border-b border-border-dark autopsy-stagger-4">
          <p className="font-mono text-[11px] tracking-[3px] text-primary uppercase mb-2">Phase analysis</p>
          <h2 className="font-serif text-[32px] font-bold mb-6 tracking-tight">Lifecycle breakdown</h2>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {phases.map((p) => {
              const isActive = activePhase === p.id;
              const accent = PHASE_ACCENT_COLORS[p.id] || C.dim;
              return (
                <div
                  key={p.id}
                  className="autopsy-phase-card flex-shrink-0 w-[200px] rounded-md p-3.5"
                  style={{
                    background: isActive ? `${accent}10` : C.surface,
                    border: `1px solid ${isActive ? accent + "60" : C.border}`,
                    borderTop: `3px solid ${accent}`,
                  }}
                >
                  <div className="font-bold text-sm mb-1" style={{ color: accent }}>{p.label}</div>
                  <div className="font-mono text-[10px] text-text-dim mb-2">
                    {p.duration_days}d · Day {p.start_day}–{p.end_day}
                  </div>
                  <div className="font-mono text-[10px] text-text-main mb-1.5 leading-relaxed">{p.summary}</div>
                  <div className="font-mono text-[9px] text-text-dim mb-1">
                    <span style={{ color: accent }}>Signal:</span> {p.dominant_signal}
                  </div>
                  <div className="text-[10px] text-text-dim leading-relaxed italic border-t border-border-dark pt-1.5 mt-1.5">
                    {p.insight}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ═══════════════════════════════════════════════════════
          CREATOR IMPACT
      ══════════════════════════════════════════════════════════ */}
      <section className="max-w-[1200px] mx-auto px-10 py-12 border-b border-border-dark autopsy-stagger-4">
        <p className="font-mono text-[11px] tracking-[3px] text-primary uppercase mb-2">Creator impact</p>
        <h2 className="font-serif text-[32px] font-bold mb-6 tracking-tight">YouTube coverage analysis</h2>

        {creatorImpacts.length === 0 ? (
          <div className="bg-surface-dark border border-border-dark rounded-md px-5 py-10 text-center">
            <div className="text-text-dim text-sm">No YouTube coverage detected yet</div>
            <div className="font-mono text-[11px] text-text-dim mt-2">
              Creator impact data will appear when videos covering this game are found.
            </div>
          </div>
        ) : (
          <>
            {/* Top creator hero card */}
            {(() => {
              const hero = creatorImpacts[0];
              const velChange = hero.velocity_after - hero.velocity_before;
              const velPct = hero.velocity_before > 0 ? Math.round((velChange / hero.velocity_before) * 100) : velChange > 0 ? 999 : 0;
              return (
                <div
                  className="rounded-md mb-3 flex gap-6 items-stretch p-5"
                  style={{
                    background: `linear-gradient(135deg, ${C.surface} 0%, rgba(34,211,238,0.06) 100%)`,
                    border: "1px solid rgba(34,211,238,0.25)",
                    borderLeft: "4px solid #22d3ee",
                  }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-[9px] uppercase tracking-[1.5px] text-[#22d3ee] mb-1.5">
                      Breakout Catalyst
                    </div>
                    <div className="text-[22px] font-extrabold text-text-main mb-0.5">{hero.channel_name}</div>
                    <div className="font-mono text-[11px] text-text-dim mb-2.5">
                      {fmtNum(hero.subscriber_count)} subscribers · {fmtDate(hero.upload_date)}
                    </div>
                    <div className="font-mono text-[11px] text-text-main mb-2 overflow-hidden overflow-ellipsis whitespace-nowrap">
                      "{hero.video_title}"
                    </div>
                    <p className="text-xs text-text-dim leading-relaxed max-w-[480px]">
                      {hero.raw_review_delta > 0
                        ? `Coverage drove +${hero.raw_review_delta} reviews in 7 days after upload${hero.shared_date ? " (attributed share)" : ""}${velPct > 0 ? `, accelerating velocity by ${Math.min(velPct, 999)}%` : ""}.`
                        : "Highest measured impact of all covering channels."}
                    </p>
                  </div>
                  <div className="flex-shrink-0 grid grid-cols-2 gap-x-6 gap-y-3 self-center">
                    {[
                      { l: "Views", v: fmtNum(hero.view_count), c: C.white },
                      { l: "Impact", v: String(hero.impact_score), c: hero.impact_score >= 70 ? C.ops : hero.impact_score >= 40 ? C.score : C.white },
                      { l: "Rev +7d", v: `+${hero.reviews_after_7d - hero.reviews_before_7d}`, c: C.green },
                      { l: "Velocity", v: `${velChange > 0 ? "+" : ""}${velChange.toFixed(1)}/d`, c: velChange > 0 ? C.green : C.dim },
                    ].map(({ l, v, c }) => (
                      <div key={l}>
                        <div className="font-mono text-[8px] uppercase tracking-[1px] text-text-dim">{l}</div>
                        <div className="font-mono text-xl font-bold" style={{ color: c }}>{v}</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Remaining creators table */}
            {creatorImpacts.length > 1 && (
              <div className="bg-surface-dark border border-border-dark rounded-md overflow-hidden">
                <table className="w-full font-mono text-[11px] border-collapse">
                  <thead>
                    <tr className="border-b border-border-dark">
                      {["Creator", "Subs", "Video", "Date", "Views", "Rev ±", "Impact"].map((h) => (
                        <th key={h} className="px-3 py-2 text-left text-[9px] uppercase tracking-[1px] text-text-dim font-normal">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {creatorImpacts.slice(1).map((c) => (
                      <tr key={c.channel_name + c.upload_date} className="border-b border-border-dark">
                        <td className="px-3 py-2">
                          <span style={{ color: "#22d3ee" }}>{c.channel_name}</span>
                          {c.shared_date && <span className="text-[8px] text-text-dim ml-1" title="Impact split by subs">*</span>}
                        </td>
                        <td className="px-3 py-2 text-text-dim">{fmtNum(c.subscriber_count)}</td>
                        <td className="px-3 py-2 text-text-main max-w-[180px] overflow-hidden overflow-ellipsis whitespace-nowrap">{c.video_title}</td>
                        <td className="px-3 py-2 text-text-dim">{fmtDate(c.upload_date)}</td>
                        <td className="px-3 py-2 text-text-main">{fmtNum(c.view_count)}</td>
                        <td className="px-3 py-2">
                          <span className="text-text-dim">{c.reviews_before_7d}</span>
                          <span style={{ color: C.green }}> +{c.reviews_after_7d - c.reviews_before_7d}</span>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1.5">
                            <div className="w-11 h-1.5 bg-border-dark rounded overflow-hidden">
                              <div
                                className="h-full rounded"
                                style={{ width: `${c.impact_score}%`, background: c.impact_score >= 70 ? C.ops : c.impact_score >= 40 ? C.score : C.dim }}
                              />
                            </div>
                            <span className="text-text-dim text-[10px]">{c.impact_score}</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="flex gap-2 px-3 py-1.5 border-t border-border-dark flex-wrap items-center">
                  {creatorImpacts.map((c) => (
                    <span
                      key={c.channel_name + c.upload_date}
                      className="font-mono text-[9px] px-2 py-0.5 rounded"
                      style={{
                        background: c.covers === "demo" ? "rgba(34,211,238,0.1)" : "rgba(128,38,38,0.1)",
                        color: c.covers === "demo" ? "#22d3ee" : C.ccu,
                        border: `1px solid ${c.covers === "demo" ? "#22d3ee30" : C.ccu + "30"}`,
                      }}
                    >
                      {c.channel_name}: {c.covers.toUpperCase()}
                    </span>
                  ))}
                  {creatorImpacts.some((c) => c.shared_date) && (
                    <span className="font-mono text-[8px] text-text-dim ml-2">
                      * Same-day uploads — delta split proportionally by subscriber count
                    </span>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </section>

      {/* ═══════════════════════════════════════════════════════
          OPS COMPONENT RADAR (when data available)
      ══════════════════════════════════════════════════════════ */}
      {radarData && (
        <section className="max-w-[1200px] mx-auto px-10 py-12 border-b border-border-dark autopsy-stagger-5">
          <p className="font-mono text-[11px] tracking-[3px] text-primary uppercase mb-2">OPS anatomy</p>
          <h2 className="font-serif text-[32px] font-bold mb-6 tracking-tight">Component radar</h2>
          <div className="bg-surface-dark border border-border-dark rounded-md p-5 flex items-center gap-6">
            <div className="flex-shrink-0 w-[200px]">
              <div className="font-mono text-[9px] uppercase tracking-[1.5px] text-text-dim mb-1">
                Each axis = normalised 0–100
              </div>
              <div className="font-mono text-[10px] text-text-dim leading-relaxed mb-3">
                White ring = peer median (50).
              </div>
              <div className="flex flex-col gap-1">
                {radarData.map((d) => (
                  <div key={d.axis} className="flex justify-between font-mono text-[10px]">
                    <span className="text-text-dim">{d.axis}</span>
                    <span style={{ color: opsScoreColor(d.score) }}>{d.score}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <ResponsiveContainer width="100%" height={220}>
                <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="70%">
                  <PolarGrid stroke={C.border} />
                  <PolarAngleAxis dataKey="axis" tick={{ fill: C.dim, fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }} />
                  <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                  <Radar name="Peer Median" dataKey="peer" stroke="rgba(255,255,255,0.2)" fill="rgba(255,255,255,0.04)" strokeDasharray="4 3" strokeWidth={1} dot={false} isAnimationActive={false} />
                  <Radar name="This Game" dataKey="score" stroke={C.ops} fill={`${C.ops}25`} strokeWidth={2} dot={{ fill: C.ops, r: 3 }} isAnimationActive={false} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
            <div className="flex-shrink-0 w-[240px] text-xs text-text-dim leading-relaxed border-l border-border-dark pl-5">
              <div className="font-bold text-text-main mb-1">OPS v5 · 7 signals</div>
              <p>Velocity (30%), Decay (20%), Review vol. (13%), YouTube (13%), CCU (10%), Sentiment (8%), Twitch (6%). NULL signals redistribute weight. Coverage penalty 0.40–1.00.</p>
              <div className="mt-3 flex flex-col gap-1 font-mono text-[10px]">
                <span><span style={{ color: "#5ec269" }}>▲</span> Breakout ≥60</span>
                <span><span style={{ color: "#e8a832" }}>◆</span> Watch 30–59</span>
                <span><span style={{ color: "#6b6058" }}>▼</span> Cold &lt;30</span>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ═══════════════════════════════════════════════════════
          OPS WEIGHT SANDBOX
      ══════════════════════════════════════════════════════════ */}
      {latestWithOps && (
        <section className="max-w-[1200px] mx-auto px-10 py-12 border-b border-border-dark autopsy-stagger-5">
          <button
            onClick={() => setShowSandbox((v) => !v)}
            className="font-mono text-[10px] px-3 py-1.5 rounded transition-colors mb-3"
            style={{
              border: `1px solid ${showSandbox ? C.ops : C.border}`,
              background: showSandbox ? `${C.ops}15` : "transparent",
              color: showSandbox ? C.ops : C.dim,
            }}
          >
            {showSandbox ? "▲" : "▼"} Weight Sandbox
          </button>

          {showSandbox && (
            <div
              className="bg-surface-dark border border-border-dark rounded-md p-5 grid grid-cols-[1fr_auto] gap-4 items-start"
            >
              <div>
                <div className="font-mono text-[9px] uppercase tracking-[1.5px] text-text-dim mb-3">
                  Adjust component weights — see how OPS changes in real-time
                </div>
                <div className="flex flex-col gap-2.5">
                  {(Object.entries(sandboxWeights) as [keyof OpsWeights, number][]).map(([key, val]) => (
                    <div key={key} className="flex items-center gap-2.5">
                      <span className="font-mono text-[10px] text-text-dim capitalize w-16">{key}</span>
                      <input
                        type="range" min={0} max={0.6} step={0.01} value={val}
                        onChange={(e) => setSandboxWeights((prev) => ({ ...prev, [key]: Number(e.target.value) }))}
                        className="flex-1"
                        style={{ accentColor: C.ops }}
                      />
                      <span className="font-mono text-[10px] text-text-main w-9 text-right">
                        {(val * 100).toFixed(0)}%
                      </span>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => setSandboxWeights(DEFAULT_WEIGHTS)}
                  className="font-mono text-[9px] mt-2.5 px-2.5 py-1 rounded border border-border-dark bg-transparent text-text-dim hover:text-text-main transition-colors"
                >
                  Reset to defaults
                </button>
              </div>

              <div className="text-center min-w-[90px]">
                <div className="font-mono text-[9px] uppercase tracking-[1.5px] text-text-dim mb-1.5">Sandbox OPS</div>
                <div
                  className="font-mono text-[40px] font-bold leading-none"
                  style={{ color: sandboxScore != null ? opsScoreColor(sandboxScore) : C.dim }}
                >
                  {sandboxScore ?? "—"}
                </div>
                <div className="font-mono text-[9px] text-text-dim mt-1">
                  vs actual{" "}
                  <span style={{ color: C.ops }}>
                    {latestWithOps?.ops_score != null ? Math.round(latestWithOps.ops_score) : "—"}
                  </span>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {/* ── OPS peak note + YT video count footer ── */}
      {hasOpsData && (opsPeak.score > 0 || ytVideoCount > 0) && (
        <div className="max-w-[1200px] mx-auto px-10 py-8 flex gap-8 flex-wrap font-mono text-[11px] text-text-dim">
          {opsPeak.score > 0 && (
            <span>OPS peak: Day {opsPeak.day} at <span style={{ color: C.ops }}>{opsPeak.score}</span></span>
          )}
          {ytVideoCount > 0 && (
            <span><span style={{ color: "#38bdf8" }}>{ytVideoCount}</span> YouTube videos tracked</span>
          )}
        </div>
      )}

      {/* ── Event Card Overlay ── */}
      {selectedEvent && (
        <EventCard event={selectedEvent} onClose={() => setSelectedEvent(null)} />
      )}
    </div>
  );
}
