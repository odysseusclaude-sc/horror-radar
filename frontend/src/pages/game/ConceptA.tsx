import { useState, useEffect, useMemo, useCallback } from "react";
import { computeOps, DEFAULT_WEIGHTS } from "../../lib/opsCalculator";
import type { OpsWeights } from "../../lib/opsCalculator";
import { useParams } from "react-router-dom";
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
  raw_ops: number | null;
  twitch_viewers: number | null;
  twitch_streams: number | null;
  yt_cumulative_views: number;
  patch_count_30d: number | null;
  days_since_last_update: number | null;
}

interface TimelineSnapshot extends TimelineSnapshotRaw {
  day_index: number;
  review_velocity?: number;  // computed: reviews gained per day (3-day rolling avg)
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

/* ── Palette ──────────────────────────────────────────────────────── */

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
  green: "#4ade80",
} as const;

const mono: React.CSSProperties = { fontFamily: "'JetBrains Mono', monospace" };
const heading: React.CSSProperties = { fontFamily: "'Public Sans', sans-serif" };

/* ── Keyframes ────────────────────────────────────────────────────── */

const styleTag = `
@keyframes autopsyFadeIn {
  from { opacity: 0; transform: translateY(12px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes autopsySlideIn {
  from { opacity: 0; transform: translateX(-20px); }
  to   { opacity: 1; transform: translateX(0); }
}
@keyframes pulseGlow {
  0%,100% { box-shadow: 0 0 0 0 rgba(128,38,38,0.3); }
  50%     { box-shadow: 0 0 12px 4px rgba(128,38,38,0.15); }
}
.autopsy-stagger-1 { animation: autopsyFadeIn 0.5s ease-out 0.1s both; }
.autopsy-stagger-2 { animation: autopsyFadeIn 0.5s ease-out 0.25s both; }
.autopsy-stagger-3 { animation: autopsyFadeIn 0.5s ease-out 0.4s both; }
.autopsy-stagger-4 { animation: autopsyFadeIn 0.5s ease-out 0.55s both; }
.autopsy-stagger-5 { animation: autopsyFadeIn 0.5s ease-out 0.7s both; }
.autopsy-stagger-6 { animation: autopsyFadeIn 0.5s ease-out 0.85s both; }
.autopsy-phase-card { transition: all 0.25s ease; }
.autopsy-phase-card:hover { transform: translateY(-2px); }
.autopsy-event-flag { cursor: pointer; transition: opacity 0.15s; }
.autopsy-event-flag:hover { opacity: 0.8; }
`;

/* ── Phase band colors (translucent) ──────────────────────────────── */

const PHASE_BAND_COLORS: Record<string, string> = {
  pre_launch: "rgba(163,106,165,0.06)",
  launch_week: "rgba(128,38,38,0.08)",
  discovery: "rgba(187,113,37,0.07)",
  settling: "rgba(74,222,128,0.06)",
  long_tail: "rgba(107,96,88,0.03)",
};

const PHASE_ACCENT_COLORS: Record<string, string> = {
  pre_launch: "#a36aa5",
  launch_week: "#802626",
  discovery: "#bb7125",
  settling: "#4ade80",
  long_tail: "#6b6058",
};

/* ── Event constants ─────────────────────────────────────────────── */

const EVENT_COLORS: Record<string, string> = {
  demo_launch: "#a36aa5",
  game_launch: "#802626",
  youtube_demo: "#a36aa5",
  youtube_game: "#a36aa5",
  reddit: "#bb7125",
  steam_update: "#4ade80",
};

const EVENT_LABELS: Record<string, string> = {
  demo_launch: "Demo Launch",
  game_launch: "Game Launch",
  youtube_demo: "YouTube (Demo)",
  youtube_game: "YouTube (Game)",
  reddit: "Reddit",
  steam_update: "Steam Update",
};

const EVENT_ICONS: Record<string, string> = {
  demo_launch: "\u25B6",
  game_launch: "\u2B50",
  youtube_demo: "\u25CF",
  youtube_game: "\u25CF",
  reddit: "\u25C6",
  steam_update: "\u25A0",
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
  { key: "raw_ops", label: "OPS (Raw)", color: C.ops, defaultOn: true, panel: 1 },
  { key: "review_count", label: "Reviews", color: C.reviews, defaultOn: true, panel: 2 },
  { key: "review_velocity", label: "Rev. Velocity", color: "#f97316", defaultOn: true, panel: 2 },
  { key: "peak_ccu", label: "Peak CCU", color: C.ccu, defaultOn: false, panel: 2 },
  { key: "review_score_pct", label: "Score %", color: C.score, defaultOn: true, panel: 3 },
  { key: "demo_review_count", label: "Demo Reviews", color: "#22d3ee", defaultOn: false, panel: 2 },
  { key: "yt_cumulative_views", label: "YT Views", color: "#38bdf8", defaultOn: true, panel: 3 },
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
  return EVENT_ICONS[type] || "\u25CF";
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

/** Derive phases from snapshots and release date */
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
      id: "pre_launch",
      label: "Pre-Launch",
      start_date: firstDate,
      end_date: dateAtDay(endDay),
      start_day: firstDay,
      end_day: endDay,
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
      id: "launch_week",
      label: "Launch Week",
      start_date: dateAtDay(startDay),
      end_date: dateAtDay(endDay),
      start_day: startDay,
      end_day: endDay,
      duration_days: endDay - startDay + 1,
      summary: "Initial burst of reviews, CCU, and media coverage.",
      dominant_signal: "Review velocity, peak CCU",
      key_event: "Game launch on Steam",
      insight: "The first week sets the tone -- strong velocity here often predicts sustained interest.",
    });
  }

  if (lastDay > 7) {
    const startDay = Math.max(8, firstDay);
    const endDay = Math.min(30, lastDay);
    phases.push({
      id: "discovery",
      label: "Discovery Window",
      start_date: dateAtDay(startDay),
      end_date: dateAtDay(endDay),
      start_day: startDay,
      end_day: endDay,
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
      id: "settling",
      label: "Settling",
      start_date: dateAtDay(startDay),
      end_date: dateAtDay(endDay),
      start_day: startDay,
      end_day: endDay,
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
      id: "long_tail",
      label: "Long Tail",
      start_date: dateAtDay(startDay),
      end_date: lastDate,
      start_day: startDay,
      end_day: lastDay,
      duration_days: lastDay - startDay + 1,
      summary: "Beyond the breakout window -- organic trickle and sale bumps.",
      dominant_signal: "Slow review growth, sale events",
      key_event: "Outside active monitoring scope",
      insight: "Most OPS signal has decayed. The game's trajectory is largely set.",
    });
  }

  return phases;
}

/** Get Steam rating label for a given percentage */
function getSteamRating(pct: number): { label: string; color: string } {
  if (pct >= 95) return { label: "Overwhelmingly Positive", color: "#22c55e" };
  if (pct >= 80) return { label: "Very Positive", color: "#22c55e" };
  if (pct >= 70) return { label: "Mostly Positive", color: "#86efac" };
  if (pct >= 40) return { label: "Mixed", color: "#facc15" };
  if (pct >= 20) return { label: "Mostly Negative", color: "#f87171" };
  return { label: "Overwhelmingly Negative", color: "#ef4444" };
}

/** Derive creator impacts from videos + snapshots with same-day attribution splitting */
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

  // Compute review velocity around upload: 3-day window before vs 3-day after
  function velocityDelta(pubDate: string): { before: number; after: number } {
    const dayBefore3 = findSnapshotNearDay(-3, pubDate);
    const dayBefore0 = findClosestSnapshot(pubDate);
    const dayAfter3 = findSnapshotNearDay(3, pubDate);
    const revPre = (dayBefore0?.review_count ?? 0) - (dayBefore3?.review_count ?? 0);
    const revPost = (dayAfter3?.review_count ?? 0) - (dayBefore0?.review_count ?? 0);
    return { before: revPre / 3, after: revPost / 3 };
  }

  const latestSnap = snapshots[snapshots.length - 1];
  const maxReviews = latestSnap?.review_count ?? 1;

  // First pass: compute raw impacts
  const rawImpacts = videos
    .filter((v) => v.published_at)
    .map((v) => {
      const pubDate = v.published_at!.slice(0, 10);
      const before = findSnapshotNearDay(-7, pubDate);
      const after = findSnapshotNearDay(7, pubDate);
      const reviewsBefore = before?.review_count ?? 0;
      const reviewsAfter = after?.review_count ?? reviewsBefore;
      const ccuBefore = before?.peak_ccu ?? 0;
      const ccuAfter = after?.peak_ccu ?? ccuBefore;
      const rawDelta = reviewsAfter - reviewsBefore;
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

  // Second pass: split same-day attribution proportionally by subscriber count
  const byDate = new Map<string, typeof rawImpacts>();
  for (const imp of rawImpacts) {
    const group = byDate.get(imp.upload_date) || [];
    group.push(imp);
    byDate.set(imp.upload_date, group);
  }

  for (const [, group] of byDate) {
    if (group.length <= 1) continue;
    const totalSubs = group.reduce((s, g) => s + Math.max(1, g.subscriber_count), 0);
    const totalDelta = group[0].raw_review_delta; // all share same 7-day window
    for (const imp of group) {
      const share = Math.max(1, imp.subscriber_count) / totalSubs;
      imp.raw_review_delta = Math.round(totalDelta * share);
      imp.shared_date = true;
    }
  }

  // Third pass: compute impact scores
  for (const imp of rawImpacts) {
    imp.impact_score = maxReviews > 0
      ? Math.max(0, Math.min(100, Math.round((imp.raw_review_delta / Math.max(1, maxReviews)) * 300)))
      : 0;
  }

  return rawImpacts.sort((a, b) => b.impact_score - a.impact_score);
}

/* ── Custom Tooltip ───────────────────────────────────────────────── */

function AutopsyTooltip({
  active,
  payload,
  visibleSeries,
  events,
}: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload as TimelineSnapshot;
  if (!d) return null;

  const eventsOnDay = (events as TimelineEvent[]).filter((e) => e.date === d.date);

  return (
    <div
      style={{
        ...mono,
        background: C.surface,
        border: `1px solid ${C.border}`,
        padding: "10px 14px",
        color: C.white,
        fontSize: 11,
        lineHeight: 1.7,
        maxWidth: 260,
        borderRadius: 4,
      }}
    >
      <div style={{ ...heading, fontWeight: 700, fontSize: 12, marginBottom: 4, color: C.dim }}>
        {fmtDate(d.date)} &mdash; Day {d.day_index}
      </div>
      {visibleSeries.raw_ops && d.raw_ops != null && (
        <div>
          <span style={{ color: C.ops }}>OPS</span> {(d.raw_ops).toFixed(1)} <span style={{ color: C.dim, fontSize: 9 }}>(capped: {d.ops_score})</span>
        </div>
      )}
      {visibleSeries.review_count && d.review_count != null && (
        <div>
          <span style={{ color: C.reviews }}>Reviews</span> {fmtNum(d.review_count)}
        </div>
      )}
      {visibleSeries.peak_ccu && d.peak_ccu != null && (
        <div>
          <span style={{ color: C.ccu }}>Peak CCU</span> {fmtNum(d.peak_ccu)}
        </div>
      )}
      {(d as any).review_velocity != null && visibleSeries.review_velocity && (
        <div>
          <span style={{ color: "#f97316" }}>Velocity</span> {(d as any).review_velocity.toFixed(1)}/day
        </div>
      )}
      {visibleSeries.review_score_pct && d.review_score_pct != null && d.review_score_pct > 0 && (
        <div>
          <span style={{ color: C.score }}>Score</span> {d.review_score_pct.toFixed(1)}%{" "}
          <span style={{ fontSize: 9, color: getSteamRating(d.review_score_pct).color }}>{getSteamRating(d.review_score_pct).label}</span>
        </div>
      )}
      {visibleSeries.twitch_viewers && d.twitch_viewers != null && d.twitch_viewers > 0 && (
        <div>
          <span style={{ color: C.twitch }}>Twitch</span> {fmtNum(d.twitch_viewers)} viewers
        </div>
      )}
      {visibleSeries.demo_review_count && d.demo_review_count != null && d.demo_review_count > 0 && (
        <div>
          <span style={{ color: "#22d3ee" }}>Demo Rev</span> {d.demo_review_count}
        </div>
      )}
      {visibleSeries.yt_cumulative_views && d.yt_cumulative_views > 0 && (
        <div>
          <span style={{ color: "#38bdf8" }}>YT Views</span> {fmtNum(d.yt_cumulative_views)}
        </div>
      )}
      {eventsOnDay.length > 0 && (
        <div style={{ marginTop: 6, borderTop: `1px solid ${C.border}`, paddingTop: 4 }}>
          {eventsOnDay.map((e, i) => (
            <div key={i} style={{ color: EVENT_COLORS[e.type] || C.dim, fontSize: 10 }}>
              {eventShape(e.type)} {e.title}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Event Flag Card Overlay ──────────────────────────────────────── */

function EventCard({
  event,
  onClose,
}: {
  event: TimelineEvent;
  onClose: () => void;
}) {
  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.6)",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: C.surface,
          border: `1px solid ${C.border}`,
          borderTop: `3px solid ${EVENT_COLORS[event.type] || C.dim}`,
          padding: "24px 28px",
          maxWidth: 420,
          width: "90%",
          borderRadius: 6,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
          <div>
            <span
              style={{
                ...mono,
                fontSize: 10,
                color: EVENT_COLORS[event.type] || C.dim,
                textTransform: "uppercase",
                letterSpacing: 1.5,
              }}
            >
              {EVENT_LABELS[event.type] || event.type}
            </span>
            <h3 style={{ ...heading, color: C.white, fontSize: 18, margin: "4px 0 0" }}>
              {event.title}
            </h3>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: C.dim,
              cursor: "pointer",
              fontSize: 18,
              padding: "0 4px",
            }}
          >
            &times;
          </button>
        </div>
        <div style={{ ...mono, color: C.dim, fontSize: 11, marginBottom: 10 }}>
          {fmtDate(event.date)} &mdash; Day {event.day_index}
        </div>
        <p style={{ ...heading, color: C.white, fontSize: 13, lineHeight: 1.6, margin: 0 }}>
          {event.detail}
        </p>
        {event.channel_name && (
          <div style={{ ...mono, marginTop: 12, fontSize: 11, color: C.dim }}>
            <span style={{ color: "#22d3ee" }}>{event.channel_name}</span>
            {event.subscriber_count && <> &middot; {fmtNum(event.subscriber_count)} subs</>}
            {event.view_count && <> &middot; {fmtNum(event.view_count)} views</>}
          </div>
        )}
        {event.subreddit && (
          <div style={{ ...mono, marginTop: 12, fontSize: 11, color: C.dim }}>
            <span style={{ color: "#f97316" }}>r/{event.subreddit}</span>
            {event.score && <> &middot; {fmtNum(event.score)} upvotes</>}
            {event.num_comments && <> &middot; {event.num_comments} comments</>}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Section label with rule ─────────────────────────────────────── */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <span
        style={{ fontFamily: "'Public Sans', sans-serif" }}
        className="text-[10px] font-bold uppercase tracking-[0.14em] text-text-dim whitespace-nowrap"
      >
        {children}
      </span>
      <div className="flex-1 h-px bg-border-dark" />
    </div>
  );
}

/* ==================================================================
   THE AUTOPSY -- Main Component
   ================================================================== */

export default function TheAutopsy() {
  const { appid } = useParams<{ appid: string }>();

  /* ── Data fetching ── */
  const [data, setData] = useState<TimelineResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!appid) {
      setError("No app ID specified");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    fetch(`${import.meta.env.VITE_API_URL || "/api"}/games/${appid}/timeline`)
      .then((r) => {
        if (!r.ok) throw new Error("Game not found");
        return r.json();
      })
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
  const [showGhost, setShowGhost] = useState(false);
  const [showSandbox, setShowSandbox] = useState(false);
  const [sandboxWeights, setSandboxWeights] = useState<OpsWeights>(DEFAULT_WEIGHTS);
  const [activeSignalTab, setActiveSignalTab] = useState<"youtube" | "reddit" | "twitch">("youtube");
  const [showOpsAnatomy, setShowOpsAnatomy] = useState(false);

  const toggleSeries = useCallback((key: string) => {
    setVisibleSeries((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  /* ── Derived data ── */
  const game = data?.game ?? null;
  const releaseDate = game?.release_date ?? null;

  const snapshots: TimelineSnapshot[] = useMemo(() => {
    if (!data?.snapshots || !releaseDate) return [];
    return data.snapshots.map((s) => ({
      ...s,
      day_index: daysBetween(releaseDate, s.date),
    }));
  }, [data, releaseDate]);

  const events: TimelineEvent[] = useMemo(() => {
    if (!data?.events || !releaseDate) return [];
    return data.events.map((e) => ({
      ...e,
      type: e.type as EventType,
      day_index: daysBetween(releaseDate, e.date),
    }));
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
  const genres = useMemo(() => parseGenres(game?.genres ?? null), [game?.genres]);

  /* ── Brush range ── */
  const [brushRange, setBrushRange] = useState<{ startIndex: number; endIndex: number }>({
    startIndex: 0,
    endIndex: 0,
  });

  // Reset brush when snapshots change
  useEffect(() => {
    if (snapshots.length > 0) {
      setBrushRange({ startIndex: 0, endIndex: snapshots.length - 1 });
    }
  }, [snapshots.length]);

  // Compute review velocity (3-day rolling average of daily review delta)
  const chartData = useMemo(() => {
    if (snapshots.length === 0) return snapshots;
    return snapshots.map((s, i) => {
      let velocity: number | undefined;
      if (i >= 3 && s.review_count != null) {
        const prev = snapshots[i - 3];
        if (prev?.review_count != null) {
          velocity = Math.max(0, (s.review_count - prev.review_count) / 3);
        }
      } else if (i > 0 && s.review_count != null) {
        const prev = snapshots[i - 1];
        if (prev?.review_count != null) {
          velocity = Math.max(0, s.review_count - prev.review_count);
        }
      }
      return { ...s, review_velocity: velocity };
    });
  }, [snapshots]);

  /* ── Active phase from brush ── */
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

  /* ── OPS peak info ── */
  const opsPeak = useMemo(() => {
    let best = { score: 0, day: 0, date: "" };
    snapshots.forEach((s) => {
      const raw = s.raw_ops ?? s.ops_score ?? 0;
      if (raw > best.score) {
        best = { score: Math.round(raw * 10) / 10, day: s.day_index, date: s.date };
      }
    });
    return best;
  }, [snapshots]);

  const latestWithOps = useMemo(() => {
    for (let i = snapshots.length - 1; i >= 0; i--) {
      if (snapshots[i].ops_score != null) return snapshots[i];
    }
    return snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;
  }, [snapshots]);

  // Use the last snapshot that actually has review data (today's row may be empty)
  const latestSnapshot = useMemo(() => {
    for (let i = snapshots.length - 1; i >= 0; i--) {
      if (snapshots[i].review_count != null) return snapshots[i];
    }
    return snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;
  }, [snapshots]);

  /* ── Hero stats ── */
  const heroStats = useMemo(() => {
    if (!game || !latestSnapshot) return [];
    const maxCcu = snapshots.reduce((mx, s) => Math.max(mx, s.peak_ccu ?? 0), 0);
    const latestRawOps = latestWithOps?.raw_ops;

    // CCU context: find first day with CCU data
    let ccuNote: string | null = null;
    if (maxCcu > 0) {
      const firstCcuSnap = snapshots.find((s) => s.peak_ccu != null && s.peak_ccu > 0);
      if (firstCcuSnap && firstCcuSnap.day_index > 7) {
        ccuNote = `First tracked Day ${firstCcuSnap.day_index}`;
      }
    }

    // Score with Steam rating label
    let scoreNote: string | null = null;
    if (latestSnapshot.review_score_pct != null) {
      scoreNote = getSteamRating(latestSnapshot.review_score_pct).label;
    }

    // Owners: estimated from reviews × 30 (SteamSpy disabled — too coarse/late)
    const REVIEW_MULTIPLIER = 30;
    let ownersValue: string;
    let ownersNote: string | null = null;
    if (latestSnapshot.review_count != null && latestSnapshot.review_count > 0) {
      ownersValue = "~" + fmtNum(latestSnapshot.review_count * REVIEW_MULTIPLIER);
      ownersNote = `Est. reviews × ${REVIEW_MULTIPLIER}`;
    } else {
      ownersValue = "--";
    }

    return [
      { label: "Est. Owners", value: ownersValue, color: C.green, note: ownersNote },
      { label: "Peak CCU", value: maxCcu > 0 ? fmtNum(maxCcu) : "--", color: C.ccu, note: ccuNote },
      { label: "Reviews", value: latestSnapshot.review_count != null ? fmtNum(latestSnapshot.review_count) : "--", color: C.reviews },
      { label: "Score", value: latestSnapshot.review_score_pct != null ? Math.round(latestSnapshot.review_score_pct) + "%" : "--", color: C.score, note: scoreNote },
      { label: "OPS", value: latestRawOps != null ? String(Math.min(100, Math.round(latestRawOps * 40))) : "--", color: C.ops, note: latestRawOps != null ? `Raw: ${latestRawOps.toFixed(1)}` : null },
      { label: "Price", value: game.price_usd != null ? "$" + game.price_usd.toFixed(2) : "Free", color: C.dim },
    ];
  }, [game, latestSnapshot, latestWithOps, snapshots]);

  /* ── Story sentence ── */
  const storySentence = useMemo(() => {
    if (!game || !latestSnapshot) return "";
    const daysSinceLaunch = releaseDate ? daysBetween(releaseDate, new Date().toISOString().slice(0, 10)) : 0;
    const maxCcu = snapshots.reduce((mx, s) => Math.max(mx, s.peak_ccu ?? 0), 0);
    const parts: string[] = [];
    parts.push(`${game.title}`);
    if (game.developer) parts[0] += ` by ${game.developer}`;
    if (daysSinceLaunch > 0) {
      parts.push(`launched ${daysSinceLaunch} days ago`);
    }
    if (latestSnapshot.review_count != null) {
      let reviewPart = `with ${fmtNum(latestSnapshot.review_count)} reviews`;
      if (latestSnapshot.review_score_pct != null) {
        reviewPart += ` (${Math.round(latestSnapshot.review_score_pct)}% positive)`;
      }
      parts.push(reviewPart);
    }
    if (maxCcu > 0) {
      parts.push(`and a peak of ${fmtNum(maxCcu)} concurrent players`);
    }
    return parts.join(" ") + ".";
  }, [game, latestSnapshot, releaseDate, snapshots]);

  /* ── OPS momentum ── */
  const opsMomentum = useMemo(() => {
    const opsSnapshots = snapshots.filter((s) => s.ops_score != null);
    if (opsSnapshots.length < 2) return { arrow: "", label: "" };
    const latest = opsSnapshots[opsSnapshots.length - 1].ops_score!;
    const prev = opsSnapshots[opsSnapshots.length - 2].ops_score!;
    if (latest > prev) return { arrow: "\u2197", label: "rising" };
    if (latest < prev) return { arrow: "\u2198", label: "falling" };
    return { arrow: "\u2192", label: "stable" };
  }, [snapshots]);

  /* ── Review delta 7d ── */
  const reviewDelta7d = useMemo(() => {
    if (!latestSnapshot?.review_count) return null;
    const target = latestSnapshot.day_index - 7;
    let closest: TimelineSnapshot | null = null;
    let minDist = Infinity;
    for (const s of snapshots) {
      if (s.review_count == null) continue;
      const dist = Math.abs(s.day_index - target);
      if (dist < minDist) { minDist = dist; closest = s; }
    }
    if (!closest?.review_count) return null;
    return latestSnapshot.review_count - closest.review_count;
  }, [snapshots, latestSnapshot]);

  /* ── OPS delta 7d ── */
  const opsDelta7d = useMemo(() => {
    const opsSnaps = snapshots.filter((s) => s.ops_score != null);
    if (opsSnaps.length < 2) return null;
    const latest = opsSnaps[opsSnaps.length - 1];
    const target = latest.day_index - 7;
    let closest: TimelineSnapshot | null = null;
    let minDist = Infinity;
    for (const s of opsSnaps) {
      const dist = Math.abs(s.day_index - target);
      if (dist < minDist) { minDist = dist; closest = s; }
    }
    if (!closest?.ops_score || !latest.ops_score) return null;
    return latest.ops_score - closest.ops_score;
  }, [snapshots]);

  /* ── Unique YouTube channels ── */
  const ytUniqueChannels = useMemo(() => {
    const ids = new Set((data?.videos ?? []).map((v) => v.channel_id));
    return ids.size;
  }, [data?.videos]);

  /* ── Shared chart props ── */
  const gridProps = {
    stroke: C.border,
    strokeDasharray: "2 4",
    vertical: false,
  };

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
    tickLine: false,
    axisLine: false,
    width: 50,
  };

  /* ── Render phase bands for a chart ── */
  const renderPhaseBands = () =>
    phases.map((p) => (
      <ReferenceArea
        key={p.id}
        x1={p.start_date}
        x2={p.end_date}
        fill={PHASE_BAND_COLORS[p.id] || "transparent"}
        fillOpacity={1}
        ifOverflow="extendDomain"
      />
    ));

  /* ── Render event reference lines ── */
  const renderEventLines = (showIcons: boolean) =>
    events.map((e, i) => (
      <ReferenceLine
        key={`ev-${i}`}
        x={e.date}
        stroke={EVENT_COLORS[e.type] || C.dim}
        strokeDasharray="3 3"
        strokeOpacity={0.4}
        label={
          showIcons
            ? {
                value: eventShape(e.type),
                position: "top",
                fill: EVENT_COLORS[e.type] || C.dim,
                fontSize: 14,
                fontFamily: "'JetBrains Mono', monospace",
              }
            : undefined
        }
      />
    ));

  /* ── Today line ── */
  const todayDate = new Date().toISOString().slice(0, 10);

  const handleBrushChange = useCallback((range: any) => {
    if (range && range.startIndex != null && range.endIndex != null) {
      setBrushRange({ startIndex: range.startIndex, endIndex: range.endIndex });
    }
  }, []);

  /* ── Loading state ── */
  if (loading) {
    return (
      <div style={{ background: C.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ ...mono, fontSize: 14, color: C.ops, marginBottom: 8 }}>Loading timeline...</div>
          <div style={{ ...mono, fontSize: 11, color: C.dim }}>Fetching data for app {appid}</div>
        </div>
      </div>
    );
  }

  /* ── Error state ── */
  if (error || !data || !game) {
    return (
      <div style={{ background: C.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ ...heading, fontSize: 24, color: C.ops, marginBottom: 8 }}>Game Not Found</div>
          <div style={{ ...mono, fontSize: 12, color: C.dim }}>{error || "No data available for this game."}</div>
          <a
            href="/"
            style={{ ...mono, display: "inline-block", marginTop: 20, fontSize: 12, color: C.ops, textDecoration: "underline" }}
          >
            Back to Database
          </a>
        </div>
      </div>
    );
  }

  /* ── No snapshots state ── */
  if (snapshots.length === 0) {
    return (
      <div className="bg-background-dark min-h-screen text-text-main px-4 md:px-10 pt-8 pb-16">
        <style>{styleTag}</style>
        <header className="autopsy-stagger-1" style={{ marginBottom: 36 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <span style={{ ...mono, color: C.ops, fontSize: 10, textTransform: "uppercase", letterSpacing: 2 }}>
              The Autopsy
            </span>
            <span style={{ color: C.border }}>|</span>
            <span style={{ ...mono, color: C.dim, fontSize: 10 }}>
              Forensic Timeline Analysis
            </span>
          </div>
          <h1 style={{ ...heading, fontSize: 36, fontWeight: 800, margin: "0 0 4px", color: C.white }}>
            {game.title}
          </h1>
          <div style={{ ...mono, fontSize: 12, color: C.dim }}>
            {game.developer || "Unknown developer"}
          </div>
        </header>
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: "40px 20px", textAlign: "center" }}>
          <div style={{ ...heading, fontSize: 16, color: C.dim }}>No snapshot data yet</div>
          <div style={{ ...mono, fontSize: 11, color: C.dim, marginTop: 8 }}>
            Timeline data will appear after the first daily snapshot collection.
          </div>
        </div>
      </div>
    );
  }

  const hasOpsData = snapshots.some((s) => s.ops_score != null);

  /* ================================================================
     RENDER
     ================================================================ */
  /* ── OPS Radar data ── */
  const radarData = useMemo(() => {
    if (!latestWithOps) return null;
    const comps = [
      { label: "Rev Momentum", value: latestWithOps.velocity_component, max: 5.0 },
      { label: "Sentiment", value: latestWithOps.review_component, max: 2.0 },
      { label: "YouTube Signal", value: latestWithOps.youtube_component, max: 3.0 },
      { label: "Live Engage", value: latestWithOps.ccu_component, max: 4.0 },
      { label: "Decay Retention", value: latestWithOps.decay_component, max: 2.0 },
    ];
    const hasAny = comps.some((c) => c.value != null && c.value > 0);
    if (!hasAny) return null;
    return comps.map((c) => ({
      axis: c.label,
      score: c.value != null && c.max > 0 ? Math.min(100, Math.round((c.value / c.max) * 100)) : 0,
      peer: 50,
    }));
  }, [latestWithOps]);

  /* ── YT video count ── */
  const ytVideoCount = data?.videos?.length ?? 0;

  /* ── Sandbox OPS score ── */
  const sandboxScore = useMemo(() => {
    if (!latestWithOps) return null;
    return computeOps(
      {
        velocity: latestWithOps.velocity_component ?? null,
        decay: latestWithOps.decay_component ?? null,
        reviews: latestWithOps.review_component ?? null,
        youtube: latestWithOps.youtube_component ?? null,
        ccu: latestWithOps.ccu_component ?? null,
      },
      sandboxWeights,
    );
  }, [latestWithOps, sandboxWeights]);

  return (
    <div className="bg-background-dark min-h-screen text-text-main">
      <style>{styleTag}</style>

      {/* ══ HERO BANNER ══════════════════════════════════════════════ */}
      {/* Full-bleed banner — header image with gradient overlay */}
      <section className="relative overflow-hidden" style={{ height: 320 }}>
        {game.header_image_url ? (
          <img
            src={game.header_image_url}
            alt={game.title}
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div
            className="absolute inset-0"
            style={{ background: "linear-gradient(135deg, #1a1012 0%, #2a1418 30%, #1a1a1c 70%, #111314 100%)" }}
          />
        )}
        {/* Gradient fade to base */}
        <div
          className="absolute inset-0"
          style={{ background: "linear-gradient(to top, #111314 0%, rgba(17,19,20,0.75) 45%, transparent 100%)" }}
        />
        {/* Red radial accent */}
        <div
          className="absolute inset-0"
          style={{ background: "radial-gradient(ellipse 60% 80% at 30% 40%, rgba(128,38,38,0.28), transparent)" }}
        />
        {/* Content at bottom */}
        <div className="absolute bottom-0 left-0 right-0 max-w-[1200px] mx-auto px-6 pb-8">
          {/* Breadcrumb */}
          <div className="font-mono text-[11px] text-text-dim mb-3">
            <Link to="/" className="hover:text-text-mid transition-colors">Home</Link>
            <span className="mx-1.5 opacity-40">/</span>
            <span className="text-text-mid">{game.title}</span>
          </div>
          {/* Title */}
          <h1
            className="font-serif text-[2.4rem] sm:text-[3rem] font-bold text-white leading-tight mb-3"
            style={{ textShadow: "0 2px 20px rgba(0,0,0,0.55)" }}
          >
            {game.title}
          </h1>
          {/* Meta */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mb-3 text-sm text-text-mid">
            {game.developer && <span>by {game.developer}</span>}
            {game.price_usd != null && (
              <span className="font-mono text-xs text-text-main bg-white/[0.06] px-2.5 py-0.5 rounded">
                {game.price_usd === 0 ? "Free" : `$${game.price_usd.toFixed(2)}`}
              </span>
            )}
            {releaseDate && (
              <span className="text-text-dim text-xs">
                {new Date(releaseDate + "T00:00:00Z").toLocaleDateString("en-US", {
                  month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
                })}
              </span>
            )}
            {releaseDate && (() => {
              const d = daysBetween(releaseDate, new Date().toISOString().slice(0, 10));
              if (d <= 0) return null;
              const cls = d <= 7
                ? "text-status-pos bg-status-pos/10 border-status-pos/20"
                : d <= 30
                ? "text-status-warn bg-status-warn/10 border-status-warn/20"
                : "text-status-neg bg-status-neg/10 border-status-neg/20";
              return (
                <span className={`font-mono text-[10px] font-bold px-2 py-0.5 rounded border ${cls}`}>
                  {d}d
                </span>
              );
            })()}
          </div>
          {/* Tags */}
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {tags.slice(0, 6).map((t) => (
                <span
                  key={t}
                  className="px-3 py-1 rounded-full text-[11px] font-semibold uppercase tracking-wide border border-border-dark text-text-mid bg-background-dark/80"
                >
                  {t}
                </span>
              ))}
            </div>
          )}
          {/* Actions */}
          <div className="flex items-center gap-3 flex-wrap">
            <a
              href={`https://store.steampowered.com/app/${game.appid}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-surface-dark border border-border-dark rounded-md text-xs font-semibold text-text-main hover:border-text-dim transition-all"
            >
              View on Steam ↗
            </a>
            {game.has_demo && (
              <span className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-xs font-semibold text-status-info border border-status-info/25 bg-status-info/10">
                ✓ Demo Available
              </span>
            )}
          </div>
        </div>
      </section>

      {/* ── MAIN CONTENT ─────────────────────────────────────────── */}
      <div className="max-w-[1200px] mx-auto px-6 pb-16">

      {/* Fallback title when no header image */}
      {!game.header_image_url && (
        <div className="autopsy-stagger-1" style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: C.ops, textTransform: "uppercase", letterSpacing: 2, marginBottom: 4 }}>
            The Autopsy · Forensic Timeline Analysis
          </div>
          <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 36, fontWeight: 700, margin: 0, color: C.white, lineHeight: 1.1 }}>
            {game.title}
          </h1>
        </div>
      )}

      {/* ══ VITAL SIGNS ══════════════════════════════════════════════ */}
      {/* ── Vital Signs 5-card grid ──────────────────────────────── */}
      <section className="py-8">
        <SectionLabel>Vital Signs</SectionLabel>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {/* OPS Score */}
          {(() => {
            const score = latestWithOps?.ops_score;
            const color = score == null ? "text-text-dim"
              : score >= 60 ? "text-status-pos"
              : score >= 30 ? "text-status-warn"
              : "text-status-neg";
            return (
              <div className="bg-surface-dark border border-border-dark rounded-xl p-5 hover:border-border-structural transition-all hover:-translate-y-0.5">
                <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-text-dim mb-2">OPS Score</div>
                <div className={`font-mono text-[2rem] font-bold leading-none mb-1.5 ${color}`}>
                  {score != null ? Math.round(score) : "--"}
                </div>
                <div className="font-mono text-xs text-text-dim">
                  {opsDelta7d != null && Math.abs(opsDelta7d) >= 1 && (
                    <span className={opsDelta7d > 0 ? "text-status-pos" : "text-status-neg"}>
                      {opsDelta7d > 0 ? "↑" : "↓"}{Math.abs(Math.round(opsDelta7d))} vs 7d ago
                    </span>
                  )}
                  {opsDelta7d == null && latestWithOps?.ops_confidence && (
                    <span>{latestWithOps.ops_confidence} confidence</span>
                  )}
                </div>
                {latestWithOps?.ops_confidence && (
                  <div className="flex gap-1 mt-2">
                    {[0, 1, 2].map((i) => (
                      <span key={i} className={`inline-block w-1.5 h-1.5 rounded-full ${
                        (latestWithOps.ops_confidence === "high" && i <= 2) ||
                        (latestWithOps.ops_confidence === "medium" && i <= 1) ||
                        (latestWithOps.ops_confidence === "low" && i === 0)
                          ? "bg-text-mid" : "bg-border-dark"
                      }`} />
                    ))}
                  </div>
                )}
              </div>
            );
          })()}
          {/* Reviews */}
          <div className="bg-surface-dark border border-border-dark rounded-xl p-5 hover:border-border-structural transition-all hover:-translate-y-0.5">
            <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-text-dim mb-2">Reviews</div>
            <div className="font-mono text-[2rem] font-bold leading-none text-text-main mb-1.5">
              {latestSnapshot?.review_count != null ? fmtNum(latestSnapshot.review_count) : "--"}
            </div>
            <div className="font-mono text-xs text-text-dim">
              {reviewDelta7d != null && reviewDelta7d > 0 && (
                <span className="text-status-pos">+{reviewDelta7d} in 7d</span>
              )}
            </div>
          </div>
          {/* Sentiment */}
          {(() => {
            const pct = latestSnapshot?.review_score_pct;
            const color = pct == null ? "text-text-dim"
              : pct >= 80 ? "text-status-pos"
              : pct >= 40 ? "text-status-warn"
              : "text-status-neg";
            const rating = pct != null ? getSteamRating(pct) : null;
            return (
              <div className="bg-surface-dark border border-border-dark rounded-xl p-5 hover:border-border-structural transition-all hover:-translate-y-0.5">
                <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-text-dim mb-2">Sentiment</div>
                <div className={`font-mono text-[2rem] font-bold leading-none mb-1.5 ${color}`}>
                  {pct != null ? Math.round(pct) + "%" : "--"}
                </div>
                <div className="font-mono text-xs text-text-dim">
                  {rating && <span style={{ color: rating.color }}>{rating.label}</span>}
                </div>
              </div>
            );
          })()}
          {/* Peak CCU */}
          {(() => {
            const maxCcu = snapshots.reduce((m, s) => Math.max(m, s.peak_ccu ?? 0), 0);
            return (
              <div className="bg-surface-dark border border-border-dark rounded-xl p-5 hover:border-border-structural transition-all hover:-translate-y-0.5">
                <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-text-dim mb-2">Peak CCU</div>
                <div className="font-mono text-[2rem] font-bold leading-none text-text-main mb-1.5">
                  {maxCcu > 0 ? fmtNum(maxCcu) : "--"}
                </div>
                <div className="font-mono text-xs text-text-dim">Concurrent players</div>
              </div>
            );
          })()}
          {/* YouTube */}
          <div className="bg-surface-dark border border-border-dark rounded-xl p-5 hover:border-border-structural transition-all hover:-translate-y-0.5">
            <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-text-dim mb-2">YouTube</div>
            <div className="font-mono text-[2rem] font-bold leading-none text-text-main mb-1.5">
              {ytVideoCount > 0 ? ytVideoCount : "--"}
            </div>
            <div className="font-mono text-xs text-text-dim">
              {ytVideoCount > 0 ? `videos · ${ytUniqueChannels} channel${ytUniqueChannels !== 1 ? "s" : ""}` : "No coverage yet"}
            </div>
          </div>
        </div>
      </section>

      {/* ── Story So Far ────────────────────────────────────────────── */}
      <section className="py-8 border-t border-border-dark">
        <SectionLabel>The Story So Far</SectionLabel>
        {/* Phase progress track */}
        {phases.length > 0 && (
          <div className="relative mb-6">
            <div className="absolute top-[14px] left-0 right-0 h-px bg-border-dark" />
            {activePhase && (
              <div
                className="absolute top-[14px] left-0 h-px transition-all"
                style={{
                  width: `${Math.min(100, ((phases.findIndex((p) => p.id === activePhase) + 0.5) / phases.length) * 100)}%`,
                  background: "linear-gradient(90deg, #6b6058, #802626)",
                }}
              />
            )}
            <div className="relative flex w-full">
              {phases.map((p, idx) => {
                const activIdx = phases.findIndex((ph) => ph.id === activePhase);
                const isActive = p.id === activePhase;
                const isPast = idx < activIdx;
                return (
                  <div key={p.id} className="flex-1 text-center relative z-10">
                    <div
                      className={`w-3 h-3 rounded-full mx-auto mb-2 border-2 border-background-dark transition-all ${
                        isActive
                          ? "bg-primary shadow-[0_0_0_4px_rgba(128,38,38,0.25)] w-3.5 h-3.5"
                          : isPast
                          ? "bg-text-dim"
                          : "bg-border-dark"
                      }`}
                    />
                    <div
                      className={`text-[10px] font-semibold uppercase tracking-wider ${
                        isActive ? "text-text-main" : isPast ? "text-text-mid" : "text-text-dim"
                      }`}
                    >
                      {p.label}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {/* Narrative prose */}
        <div className="bg-surface-dark border border-border-dark border-l-4 border-l-primary rounded-r-xl p-5 text-sm text-text-mid leading-relaxed">
          {storySentence}
        </div>
      </section>

      {/* ── Performance Timeline ─────────────────────────────────────── */}
      <section className="py-8 border-t border-border-dark">
        <SectionLabel>Performance Timeline</SectionLabel>

        {/* Panel 1 — OPS Trajectory */}
        <div className="bg-surface-dark border border-border-dark rounded-xl overflow-hidden mb-4">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-border-dark">
            <span className="text-sm font-semibold text-text-main">OPS Trajectory</span>
            <div className="flex gap-1">
              {SERIES.filter((s) => s.panel === 1).map((s) => (
                <button
                  key={s.key}
                  onClick={() => toggleSeries(s.key)}
                  className={`px-3 py-1 text-[10px] font-semibold uppercase tracking-wide border rounded transition-all ${
                    visibleSeries[s.key]
                      ? "bg-primary/15 border-primary/30 text-text-main"
                      : "bg-transparent border-transparent text-text-dim hover:text-text-mid"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          <div className="p-4" style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} syncId="autopsy" margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid {...gridProps} />
                <XAxis {...xAxisProps} />
                <YAxis {...yAxisStyle} domain={[0, 100]} tickFormatter={(v: number) => String(Math.round(v))} />
                <Tooltip content={<AutopsyTooltip visibleSeries={visibleSeries} events={events} />} />
                {renderPhaseBands()}
                {renderEventLines(true)}
                <ReferenceLine x={todayDate} stroke={C.dim} strokeDasharray="2 6" strokeOpacity={0.5} />
                {visibleSeries.raw_ops && (
                  <Line type="monotone" dataKey="raw_ops" stroke={C.ops} strokeWidth={2} dot={false} connectNulls />
                )}
                <Brush
                  dataKey="date"
                  height={20}
                  travellerWidth={6}
                  stroke={C.border}
                  fill={C.surface}
                  tickFormatter={(v: string) => fmtDate(v)}
                  onChange={handleBrushChange}
                  startIndex={brushRange.startIndex}
                  endIndex={brushRange.endIndex}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Panel 2 — Reviews & Engagement */}
        <div className="bg-surface-dark border border-border-dark rounded-xl overflow-hidden mb-4">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-border-dark flex-wrap gap-2">
            <span className="text-sm font-semibold text-text-main">Reviews &amp; Engagement</span>
            <div className="flex gap-1 flex-wrap">
              {SERIES.filter((s) => s.panel === 2).map((s) => (
                <button
                  key={s.key}
                  onClick={() => toggleSeries(s.key)}
                  className={`px-3 py-1 text-[10px] font-semibold uppercase tracking-wide border rounded transition-all ${
                    visibleSeries[s.key]
                      ? "bg-primary/15 border-primary/30 text-text-main"
                      : "bg-transparent border-transparent text-text-dim hover:text-text-mid"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          <div className="p-4" style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} syncId="autopsy" margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid {...gridProps} />
                <XAxis {...xAxisProps} />
                <YAxis {...yAxisStyle} tickFormatter={fmtNum} />
                <Tooltip content={<AutopsyTooltip visibleSeries={visibleSeries} events={events} />} />
                {renderPhaseBands()}
                {renderEventLines(false)}
                {visibleSeries.review_count && (
                  <Line type="monotone" dataKey="review_count" stroke={C.reviews} strokeWidth={2} dot={false} connectNulls />
                )}
                {visibleSeries.review_velocity && (
                  <Line type="monotone" dataKey="review_velocity" stroke="#f97316" strokeWidth={1.5} strokeDasharray="4 2" dot={false} connectNulls />
                )}
                {visibleSeries.peak_ccu && (
                  <Line type="monotone" dataKey="peak_ccu" stroke={C.ccu} strokeWidth={1.5} dot={false} connectNulls />
                )}
                {visibleSeries.demo_review_count && (
                  <Line type="monotone" dataKey="demo_review_count" stroke="#22d3ee" strokeWidth={1.5} strokeDasharray="3 3" dot={false} connectNulls />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Panel 3 — Sentiment & YouTube */}
        <div className="bg-surface-dark border border-border-dark rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-border-dark">
            <span className="text-sm font-semibold text-text-main">Sentiment &amp; YouTube</span>
            <div className="flex gap-1">
              {SERIES.filter((s) => s.panel === 3).map((s) => (
                <button
                  key={s.key}
                  onClick={() => toggleSeries(s.key)}
                  className={`px-3 py-1 text-[10px] font-semibold uppercase tracking-wide border rounded transition-all ${
                    visibleSeries[s.key]
                      ? "bg-primary/15 border-primary/30 text-text-main"
                      : "bg-transparent border-transparent text-text-dim hover:text-text-mid"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          <div className="p-4" style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} syncId="autopsy" margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid {...gridProps} />
                <XAxis {...xAxisProps} />
                <YAxis {...yAxisStyle} yAxisId="score" domain={[0, 100]} />
                <YAxis {...yAxisStyle} yAxisId="yt" orientation="right" tickFormatter={fmtNum} />
                <Tooltip content={<AutopsyTooltip visibleSeries={visibleSeries} events={events} />} />
                {[95, 80, 70, 40].map((pct) => (
                  <ReferenceLine
                    key={pct}
                    yAxisId="score"
                    y={pct}
                    stroke={getSteamRating(pct).color}
                    strokeDasharray="2 4"
                    strokeOpacity={0.3}
                    label={{ value: `${pct}%`, fill: getSteamRating(pct).color, fontSize: 9, position: "insideTopRight" }}
                  />
                ))}
                {visibleSeries.review_score_pct && (
                  <Line yAxisId="score" type="monotone" dataKey="review_score_pct" stroke={C.score} strokeWidth={2} dot={false} connectNulls />
                )}
                {visibleSeries.yt_cumulative_views && (
                  <Area yAxisId="yt" type="monotone" dataKey="yt_cumulative_views" stroke="#38bdf8" fill="rgba(56,189,248,0.08)" strokeWidth={1.5} dot={false} connectNulls />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      {/* ── Signal Breakdown (tabs) ──────────────────────────────────── */}
      <section className="py-8 border-t border-border-dark">
        <SectionLabel>Signal Breakdown</SectionLabel>
        {/* Tab bar */}
        <div className="flex gap-0 border-b border-border-dark mb-6">
          {(["youtube", "reddit", "twitch"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveSignalTab(tab)}
              className={`px-5 py-2.5 text-xs font-semibold uppercase tracking-wider border-b-2 -mb-px transition-all ${
                activeSignalTab === tab
                  ? "border-primary text-text-main"
                  : "border-transparent text-text-dim hover:text-text-mid"
              }`}
            >
              {tab === "youtube"
                ? `YouTube (${ytVideoCount})`
                : tab === "reddit"
                ? `Reddit (${data?.reddit_mentions?.length ?? 0})`
                : "Twitch"}
            </button>
          ))}
        </div>

        {/* YouTube tab */}
        {activeSignalTab === "youtube" && (
          <>
            {data?.videos && data.videos.length > 0 ? (
              <>
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-dim mb-4">
                  Creator Coverage
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-5">
                  {data.videos.slice(0, 6).map((v) => (
                    <a
                      key={v.video_id}
                      href={`https://www.youtube.com/watch?v=${v.video_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bg-surface-dark border border-border-dark rounded-xl overflow-hidden block hover:border-border-structural hover:-translate-y-0.5 transition-all"
                    >
                      <div className="relative h-[120px] overflow-hidden bg-background-dark">
                        <img
                          src={`https://img.youtube.com/vi/${v.video_id}/mqdefault.jpg`}
                          alt={v.title}
                          className="w-full h-full object-cover"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                        />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="w-10 h-10 rounded-full bg-black/60 flex items-center justify-center border-2 border-white/30">
                            <span className="text-white text-sm ml-0.5">▶</span>
                          </div>
                        </div>
                      </div>
                      <div className="p-3.5">
                        <div className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: "#d45555" }}>
                          {v.channel_name ?? "Unknown"}
                        </div>
                        <p className="text-xs font-semibold text-text-main leading-snug mb-2 line-clamp-2">
                          {v.title}
                        </p>
                        <div className="flex gap-3 font-mono text-[10px] text-text-dim">
                          {v.view_count != null && (
                            <span>
                              <span className="text-text-mid">{fmtNum(v.view_count)}</span> views
                            </span>
                          )}
                          {v.like_count != null && (
                            <span>
                              <span className="text-text-mid">{fmtNum(v.like_count)}</span> likes
                            </span>
                          )}
                        </div>
                        {v.subscriber_count != null && (
                          <div className="font-mono text-[10px] text-text-dim mt-1">
                            {fmtNum(v.subscriber_count)} subs
                            {v.subscriber_count >= 1_000_000 && (
                              <span className="ml-1.5 text-status-neg font-bold">HIGH REACH</span>
                            )}
                          </div>
                        )}
                      </div>
                    </a>
                  ))}
                </div>
                {/* Coverage bar */}
                <div className="flex items-center gap-4 bg-surface-dark border border-border-dark rounded-xl px-5 py-4">
                  <span className="text-sm font-semibold text-text-mid whitespace-nowrap">Coverage Score</span>
                  <div className="flex-1 h-1.5 bg-border-dark rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{
                        width: `${Math.min(100, (ytUniqueChannels / 10) * 100)}%`,
                        background: "linear-gradient(90deg, #802626, #2faa6e)",
                      }}
                    />
                  </div>
                  <span className="font-mono text-sm font-semibold text-text-main whitespace-nowrap">
                    {ytUniqueChannels} / 10
                  </span>
                </div>
              </>
            ) : (
              <div className="text-sm text-text-dim text-center py-8 bg-surface-dark border border-border-dark rounded-xl">
                No YouTube coverage detected yet.
              </div>
            )}
          </>
        )}

        {/* Reddit tab */}
        {activeSignalTab === "reddit" && (
          <>
            {data?.reddit_mentions && data.reddit_mentions.length > 0 ? (
              <div className="space-y-2">
                {data.reddit_mentions.slice(0, 12).map((m) => (
                  <a
                    key={m.post_id}
                    href={m.post_url ?? "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-start gap-4 bg-surface-dark border border-border-dark rounded-xl px-4 py-3 hover:border-border-structural transition-all block"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-status-warn mb-1">
                        r/{m.subreddit}
                      </div>
                      <p className="text-sm text-text-main font-medium leading-snug line-clamp-2">
                        {m.title}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0 font-mono text-xs text-text-dim">
                      {m.score != null && (
                        <div className="text-text-mid font-semibold">↑ {fmtNum(m.score)}</div>
                      )}
                      {m.num_comments != null && <div>{m.num_comments} comments</div>}
                    </div>
                  </a>
                ))}
              </div>
            ) : (
              <div className="text-sm text-text-dim text-center py-8 bg-surface-dark border border-border-dark rounded-xl">
                No Reddit mentions tracked yet.
              </div>
            )}
          </>
        )}

        {/* Twitch tab */}
        {activeSignalTab === "twitch" && (
          <div className="text-sm text-text-dim text-center py-10 bg-surface-dark border border-border-dark rounded-xl">
            Twitch data is shown in the <strong className="text-text-mid">Reviews &amp; Engagement</strong> chart above.
            <br />
            <span className="text-xs opacity-70 mt-1 block">Enable the "Peak CCU" toggle to see concurrent player data.</span>
          </div>
        )}
      </section>

      {/* ── OPS Anatomy (collapsible) ────────────────────────────────── */}
      <section className="py-8 border-t border-border-dark">
        <SectionLabel>OPS Anatomy</SectionLabel>
        {/* Collapsible trigger */}
        <button
          onClick={() => setShowOpsAnatomy((v) => !v)}
          className={`w-full flex items-center justify-between px-5 py-4 bg-surface-dark border border-border-dark text-left transition-all hover:border-border-structural ${
            showOpsAnatomy ? "rounded-t-xl border-b-transparent" : "rounded-xl"
          }`}
        >
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-text-main">OPS Component Breakdown</span>
            {latestWithOps?.ops_score != null && (
              <span className="text-xs text-text-dim">
                Score: {Math.round(latestWithOps.ops_score)}
                {latestWithOps.ops_confidence ? ` · ${latestWithOps.ops_confidence} confidence` : ""}
              </span>
            )}
          </div>
          <svg
            className={`w-5 h-5 text-text-dim transition-transform ${showOpsAnatomy ? "rotate-180" : ""}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {showOpsAnatomy && (
          <div className="bg-surface-dark border border-border-dark border-t-0 rounded-b-xl p-6">
            <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-8 items-start">
              {/* Radar chart */}
              {radarData && (
                <div className="flex justify-center">
                  <ResponsiveContainer width={250} height={230}>
                    <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="70%">
                      <PolarGrid stroke={C.border} />
                      <PolarAngleAxis
                        dataKey="axis"
                        tick={{ fill: C.dim, fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}
                      />
                      <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                      <Radar name="Peer median" dataKey="peer" stroke={C.dim} strokeDasharray="3 3" fill="none" strokeOpacity={0.5} />
                      <Radar
                        name={game.title}
                        dataKey="score"
                        stroke={C.ops}
                        fill={C.ops}
                        fillOpacity={0.25}
                        strokeWidth={2}
                      />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              )}
              {/* Component cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {[
                  { name: "Rev Momentum", val: latestWithOps?.velocity_component, max: 5.0, weight: "28%", color: "#5ec269" },
                  { name: "Sentiment",    val: latestWithOps?.review_component,   max: 2.0, weight: "10%", color: "#e8a832" },
                  { name: "YouTube",      val: latestWithOps?.youtube_component,  max: 3.0, weight: "18%", color: "#38bdf8" },
                  { name: "Live Engage",  val: latestWithOps?.ccu_component,      max: 4.0, weight: "15%", color: "#802626" },
                  { name: "Decay Ret.",   val: latestWithOps?.decay_component,    max: 2.0, weight: "20%", color: "#bb7125" },
                ].map((comp) => {
                  const pct = comp.val != null && comp.max > 0
                    ? Math.min(100, (comp.val / comp.max) * 100)
                    : 0;
                  return (
                    <div key={comp.name} className="bg-background-dark border border-border-dark rounded-xl p-4">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-dim mb-2">
                        {comp.name}
                      </div>
                      <div className="flex items-baseline gap-1.5 mb-2">
                        <span className="font-mono text-xl font-bold text-text-main">
                          {comp.val != null ? comp.val.toFixed(1) : "--"}
                        </span>
                        <span className="font-mono text-xs text-text-dim">/{comp.max.toFixed(1)}</span>
                      </div>
                      <div className="h-1 bg-border-dark rounded-full overflow-hidden mb-2">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${pct}%`, backgroundColor: comp.color }}
                        />
                      </div>
                      <div className="font-mono text-[10px] text-text-dim">{comp.weight} weight</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ── Phase Analysis ───────────────────────────────────────────── */}
      {phases.length > 0 && (
        <section className="py-8 border-t border-border-dark">
          <SectionLabel>Phase Analysis</SectionLabel>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {phases.map((p) => (
              <div
                key={p.id}
                className={`bg-surface-dark rounded-xl p-4 autopsy-phase-card border ${
                  p.id === activePhase ? "border-l-4 border-y border-r-border-dark" : "border-border-dark"
                }`}
                style={p.id === activePhase ? { borderLeftColor: PHASE_ACCENT_COLORS[p.id] } : {}}
              >
                <div
                  className="text-[10px] font-bold uppercase tracking-[0.12em] mb-1"
                  style={{ color: p.id === activePhase ? PHASE_ACCENT_COLORS[p.id] : C.dim }}
                >
                  {p.label}
                </div>
                <div className="font-mono text-xs text-text-dim mb-2">
                  Day {p.start_day}–{p.end_day} · {p.duration_days}d
                </div>
                <p className="text-xs text-text-mid leading-relaxed">{p.summary}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Creator Impact ───────────────────────────────────────────── */}
      {creatorImpacts.length > 0 && (
        <section className="py-8 border-t border-border-dark">
          <SectionLabel>Creator Impact</SectionLabel>
          {/* Hero impact — #1 breakout catalyst */}
          <div
            className="bg-surface-dark border border-border-dark rounded-xl overflow-hidden mb-4"
            style={{ borderLeft: "4px solid #22d3ee" }}
          >
            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-6 p-5">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-status-info mb-1.5">
                  Breakout Catalyst
                </div>
                <h3 className="font-semibold text-text-main text-base mb-0.5">
                  {creatorImpacts[0].channel_name}
                </h3>
                <div className="font-mono text-xs text-text-dim mb-2">
                  {fmtNum(creatorImpacts[0].subscriber_count)} subs
                  {creatorImpacts[0].subscriber_count >= 1_000_000 && (
                    <span className="ml-2 text-status-neg font-bold">HIGH REACH</span>
                  )}
                </div>
                <p className="text-sm italic text-text-mid leading-snug mb-3 line-clamp-2">
                  "{creatorImpacts[0].video_title}"
                </p>
                <div className="font-mono text-xs text-text-dim">
                  {fmtDate(creatorImpacts[0].upload_date)} · {fmtNum(creatorImpacts[0].view_count)} views
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 flex-shrink-0 self-start">
                {[
                  { label: "Views",   value: fmtNum(creatorImpacts[0].view_count) },
                  { label: "Impact",  value: String(creatorImpacts[0].impact_score) },
                  { label: "Rev +7d", value: `+${creatorImpacts[0].raw_review_delta}` },
                  { label: "Vel. ×",  value: creatorImpacts[0].velocity_before > 0
                      ? `${(creatorImpacts[0].velocity_after / Math.max(0.1, creatorImpacts[0].velocity_before)).toFixed(1)}×`
                      : "n/a" },
                ].map((stat) => (
                  <div key={stat.label} className="text-center bg-background-dark border border-border-dark rounded-lg p-3">
                    <div className="font-mono text-lg font-bold text-text-main">{stat.value}</div>
                    <div className="text-[10px] text-text-dim uppercase tracking-wide mt-0.5">{stat.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          {/* Remaining creators table */}
          {creatorImpacts.length > 1 && (
            <div className="bg-surface-dark border border-border-dark rounded-xl overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border-dark">
                    {["Creator", "Subs", "Video", "Date", "Views", "Rev ±7d", "Impact"].map((h) => (
                      <th
                        key={h}
                        className="text-left px-4 py-3 font-semibold uppercase tracking-wide text-text-dim text-[10px]"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {creatorImpacts.slice(1).map((imp, i) => (
                    <tr
                      key={i}
                      className="border-b border-border-dark/50 last:border-b-0 hover:bg-background-dark/50 transition-colors"
                    >
                      <td className="px-4 py-3 text-text-main font-medium">{imp.channel_name}</td>
                      <td className="px-4 py-3 font-mono text-text-dim">{fmtNum(imp.subscriber_count)}</td>
                      <td className="px-4 py-3 text-text-mid max-w-[180px] truncate" title={imp.video_title}>
                        {imp.video_title}
                      </td>
                      <td className="px-4 py-3 font-mono text-text-dim">{fmtDate(imp.upload_date)}</td>
                      <td className="px-4 py-3 font-mono text-text-dim">{fmtNum(imp.view_count)}</td>
                      <td className="px-4 py-3 font-mono">
                        <span className={imp.raw_review_delta >= 0 ? "text-status-pos" : "text-status-neg"}>
                          {imp.raw_review_delta >= 0 ? "+" : ""}{imp.raw_review_delta}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono font-bold text-text-main">{imp.impact_score}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      </div>{/* end max-w container */}

      {/* ── Event Card Modal ─────────────────────────────────────────── */}
      {selectedEvent && (
        <EventCard event={selectedEvent} onClose={() => setSelectedEvent(null)} />
      )}
    </div>
  );
}
