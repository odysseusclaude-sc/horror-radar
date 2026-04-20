import { useState, useEffect, useMemo, useCallback } from "react";
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
      { label: "OPS", value: latestRawOps != null ? String(Math.min(100, Math.round(latestRawOps * 24))) : "--", color: C.ops, note: latestRawOps != null ? `Raw: ${latestRawOps.toFixed(1)}` : null },
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
            href="/browse"
            style={{ ...mono, display: "inline-block", marginTop: 20, fontSize: 12, color: C.ops, textDecoration: "underline" }}
          >
            Back to Browse
          </a>
        </div>
      </div>
    );
  }

  /* ── No snapshots state ── */
  if (snapshots.length === 0) {
    return (
      <div style={{ background: C.bg, minHeight: "100vh", color: C.white, padding: "32px 40px 60px" }}>
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
  return (
    <div style={{ background: C.bg, minHeight: "100vh", color: C.white, padding: "32px 40px 60px" }}>
      <style>{styleTag}</style>

      {/* --- ELEMENT 1: Game Identity Header --- */}
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
          <a
            href={`https://store.steampowered.com/app/${game.appid}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "inherit", textDecoration: "none", transition: "color 0.2s" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = C.ops)}
            onMouseLeave={(e) => (e.currentTarget.style.color = C.white)}
          >
            {game.title}
          </a>
        </h1>
        <div style={{ ...mono, fontSize: 12, color: C.dim, marginBottom: 12 }}>
          {game.developer || "Unknown developer"} &middot; {genres.join(", ") || "Horror"}
          {tags.length > 0 && (
            <span style={{ marginLeft: 12 }}>
              {tags.slice(0, 8).map((t) => (
                <span
                  key={t}
                  style={{
                    display: "inline-block",
                    padding: "2px 8px",
                    marginRight: 6,
                    borderRadius: 3,
                    background: "rgba(255,255,255,0.05)",
                    border: `1px solid ${C.border}`,
                    fontSize: 10,
                    color: C.dim,
                  }}
                >
                  {t}
                </span>
              ))}
            </span>
          )}
        </div>

        {/* Hero stats strip */}
        <div
          style={{
            display: "flex",
            gap: 28,
            flexWrap: "wrap",
            marginBottom: 14,
            paddingBottom: 14,
            borderBottom: `1px solid ${C.border}`,
          }}
        >
          {heroStats.map((stat: any) => (
            <div key={stat.label} style={{ minWidth: 80 }}>
              <div style={{ ...mono, fontSize: 9, textTransform: "uppercase", letterSpacing: 1.5, color: C.dim, marginBottom: 2 }}>
                {stat.label}
              </div>
              <div style={{ ...mono, fontSize: 20, fontWeight: 700, color: stat.color }}>
                {stat.value}
              </div>
              {stat.note && (
                <div style={{ ...mono, fontSize: 8, color: C.dim, marginTop: 2, opacity: 0.7 }}>
                  {stat.note}
                </div>
              )}
            </div>
          ))}
        </div>

        <p style={{ ...heading, fontSize: 14, color: C.dim, margin: 0, lineHeight: 1.6, maxWidth: 700 }}>
          {storySentence}
        </p>
      </header>

      {/* --- Series Toggle Pills --- */}
      <div className="autopsy-stagger-2" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16, alignItems: "center" }}>
        {SERIES.map((s) => (
          <button
            key={s.key}
            onClick={() => toggleSeries(s.key)}
            style={{
              ...mono,
              fontSize: 10,
              padding: "4px 12px",
              borderRadius: 4,
              cursor: "pointer",
              border: `1px solid ${visibleSeries[s.key] ? s.color : C.border}`,
              background: visibleSeries[s.key] ? `${s.color}15` : "transparent",
              color: visibleSeries[s.key] ? s.color : C.dim,
              transition: "all 0.2s",
            }}
          >
            {s.label}
          </button>
        ))}
        <span style={{ width: 1, height: 20, background: C.border, margin: "0 4px" }} />
        <button
          onClick={() => setShowGhost((g) => !g)}
          style={{
            ...mono,
            fontSize: 10,
            padding: "4px 12px",
            borderRadius: 4,
            cursor: "pointer",
            border: `1px solid ${showGhost ? C.ghostStroke : C.border}`,
            background: showGhost ? "rgba(255,255,255,0.04)" : "transparent",
            color: showGhost ? C.white : C.dim,
            transition: "all 0.2s",
          }}
        >
          {showGhost ? "Hide" : "Show"} Median Trajectory
        </button>
      </div>

      {showGhost && (
        <div style={{ ...mono, fontSize: 10, color: C.dim, marginBottom: 12, paddingLeft: 4 }}>
          Coming soon -- median trajectory comparison is not yet available.
        </div>
      )}

      {/* --- ELEMENT 2: Master Timeline --- */}
      <div className="autopsy-stagger-2">

        {/* Panel 1: OPS Score + Event Flags */}
        {hasOpsData && (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: "16px 12px 8px", marginBottom: 8 }}>
            <div style={{ ...mono, fontSize: 10, color: C.dim, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 8, paddingLeft: 8 }}>
              OPS (Raw) &mdash; Vital Sign
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <ComposedChart data={chartData} syncId="autopsy" margin={{ top: 20, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid {...gridProps} />
                {renderPhaseBands()}
                <XAxis {...xAxisProps} hide />
                <YAxis {...yAxisStyle} tickFormatter={(v: number) => v.toFixed(1)} />
                <Tooltip
                  content={(props: any) => (
                    <AutopsyTooltip {...props} visibleSeries={visibleSeries} events={events} />
                  )}
                  cursor={{ stroke: C.dim, strokeDasharray: "3 3" }}
                />
                {renderEventLines(true)}
                <ReferenceLine x={todayDate} stroke={C.dim} strokeDasharray="6 3" label={{ value: "Today", fill: C.dim, fontSize: 10, position: "top" }} />
                {visibleSeries.raw_ops && (
                  <Line
                    dataKey="raw_ops"
                    stroke={C.ops}
                    strokeWidth={2.5}
                    dot={false}
                    connectNulls
                    activeDot={{ r: 4, fill: C.ops, stroke: C.bg, strokeWidth: 2 }}
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
            {/* Clickable event flags row */}
            {events.length > 0 && (
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap", padding: "6px 8px 4px", borderTop: `1px solid ${C.border}` }}>
                {events.map((e, i) => (
                  <button
                    key={i}
                    className="autopsy-event-flag"
                    onClick={() => setSelectedEvent(e)}
                    title={e.title}
                    style={{
                      ...mono,
                      fontSize: 10,
                      background: `${EVENT_COLORS[e.type] || C.dim}15`,
                      border: `1px solid ${(EVENT_COLORS[e.type] || C.dim)}40`,
                      color: EVENT_COLORS[e.type] || C.dim,
                      borderRadius: 3,
                      padding: "2px 6px",
                      cursor: "pointer",
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
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: "16px 12px 8px", marginBottom: 8 }}>
          <div style={{ ...mono, fontSize: 10, color: C.dim, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 8, paddingLeft: 8 }}>
            Reviews + Concurrent Players
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <ComposedChart data={chartData} syncId="autopsy" margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid {...gridProps} />
              {renderPhaseBands()}
              <XAxis {...xAxisProps} hide />
              <YAxis yAxisId="reviews" {...yAxisStyle} tickFormatter={(v: number) => fmtNum(v)} />
              <YAxis yAxisId="ccu" orientation="right" {...yAxisStyle} tickFormatter={(v: number) => fmtNum(v)} />
              <Tooltip
                content={(props: any) => (
                  <AutopsyTooltip {...props} visibleSeries={visibleSeries} events={events} />
                )}
                cursor={{ stroke: C.dim, strokeDasharray: "3 3" }}
              />
              {renderEventLines(false)}
              <ReferenceLine x={todayDate} stroke={C.dim} strokeDasharray="6 3" yAxisId="reviews" />
              {visibleSeries.peak_ccu && (
                <Area
                  dataKey="peak_ccu"
                  yAxisId="ccu"
                  stroke={C.ccu}
                  fill={C.ccu}
                  fillOpacity={0.12}
                  strokeWidth={1.5}
                  connectNulls
                  dot={snapshots.filter(s => s.peak_ccu != null).length <= 3 ? { r: 3, fill: C.ccu } : false}
                />
              )}
              {visibleSeries.review_count && (
                <Line
                  dataKey="review_count"
                  yAxisId="reviews"
                  stroke={C.reviews}
                  strokeWidth={2}
                  dot={snapshots.filter(s => s.review_count != null).length <= 3 ? { r: 3, fill: C.reviews } : false}
                  connectNulls
                  activeDot={{ r: 3, fill: C.reviews, stroke: C.bg, strokeWidth: 2 }}
                />
              )}
              {visibleSeries.demo_review_count && (
                <Line
                  dataKey="demo_review_count"
                  yAxisId="reviews"
                  stroke="#22d3ee"
                  strokeWidth={1.5}
                  dot={false}
                  strokeDasharray="4 2"
                />
              )}
              {visibleSeries.review_velocity && (
                <Line
                  dataKey="review_velocity"
                  yAxisId="ccu"
                  stroke="#f97316"
                  strokeWidth={1.5}
                  dot={false}
                  connectNulls
                  strokeDasharray="4 2"
                  activeDot={{ r: 3, fill: "#f97316", stroke: C.bg, strokeWidth: 2 }}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Panel 3: Score % + YT Views */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: "16px 12px 8px", marginBottom: 8 }}>
          <div style={{ ...mono, fontSize: 10, color: C.dim, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 8, paddingLeft: 8 }}>
            Review Sentiment + YouTube Views
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <ComposedChart data={chartData} syncId="autopsy" margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid {...gridProps} />
              {renderPhaseBands()}
              <XAxis {...xAxisProps} />
              <YAxis yAxisId="score" {...yAxisStyle} domain={[0, 100]} tickFormatter={(v: number) => v + "%"} />
              <YAxis yAxisId="ytviews" orientation="right" {...yAxisStyle} tickFormatter={(v: number) => fmtNum(v)} />
              <Tooltip
                content={(props: any) => (
                  <AutopsyTooltip {...props} visibleSeries={visibleSeries} events={events} />
                )}
                cursor={{ stroke: C.dim, strokeDasharray: "3 3" }}
              />
              {/* Steam rating reference bands */}
              {visibleSeries.review_score_pct && (
                <>
                  <ReferenceArea yAxisId="score" y1={95} y2={100} fill="#22c55e" fillOpacity={0.04} />
                  <ReferenceArea yAxisId="score" y1={80} y2={95} fill="#22c55e" fillOpacity={0.03} />
                  <ReferenceArea yAxisId="score" y1={70} y2={80} fill="#86efac" fillOpacity={0.02} />
                  <ReferenceArea yAxisId="score" y1={40} y2={70} fill="#facc15" fillOpacity={0.02} />
                  <ReferenceLine yAxisId="score" y={80} stroke="#22c55e" strokeDasharray="8 6" strokeOpacity={0.25} label={{ value: "Very Positive", fill: "#22c55e", fontSize: 8, position: "insideTopLeft", fontFamily: "'JetBrains Mono', monospace" }} />
                  <ReferenceLine yAxisId="score" y={70} stroke="#86efac" strokeDasharray="8 6" strokeOpacity={0.2} label={{ value: "Mostly Positive", fill: "#86efac", fontSize: 8, position: "insideTopLeft", fontFamily: "'JetBrains Mono', monospace" }} />
                </>
              )}
              {renderEventLines(false)}
              <ReferenceLine x={todayDate} stroke={C.dim} strokeDasharray="6 3" yAxisId="score" />
              {visibleSeries.review_score_pct && (
                <Line
                  dataKey="review_score_pct"
                  yAxisId="score"
                  stroke={C.score}
                  strokeWidth={2}
                  dot={snapshots.filter(s => s.review_score_pct != null).length <= 3 ? { r: 3, fill: C.score } : false}
                  connectNulls
                  activeDot={{ r: 3, fill: C.score, stroke: C.bg, strokeWidth: 2 }}
                />
              )}
              {visibleSeries.yt_cumulative_views && (
                <Area
                  dataKey="yt_cumulative_views"
                  yAxisId="ytviews"
                  stroke="#38bdf8"
                  fill="#38bdf8"
                  fillOpacity={0.08}
                  strokeWidth={1.5}
                  dot={false}
                  connectNulls
                />
              )}
              {/* Brush control at the bottom of the last panel */}
              <Brush
                dataKey="date"
                height={28}
                stroke={C.border}
                fill={C.bg}
                tickFormatter={(v: string) => fmtDate(v)}
                onChange={handleBrushChange}
              />
            </ComposedChart>
          </ResponsiveContainer>
          {visibleSeries.yt_cumulative_views && (
            <div style={{ ...mono, fontSize: 9, color: C.dim, padding: "4px 8px 0", opacity: 0.6 }}>
              YT views are cumulative snapshots &mdash; step pattern reflects periodic collection, not actual view growth curve.
            </div>
          )}
        </div>
      </div>

      {/* --- ELEMENT 3: Phase Analysis Strip --- */}
      {phases.length > 0 && (
        <div className="autopsy-stagger-3" style={{ marginTop: 28, marginBottom: 36 }}>
          <div style={{ ...mono, fontSize: 10, color: C.dim, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 12 }}>
            Phase Analysis
          </div>
          <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
            {phases.map((p) => {
              const isActive = activePhase === p.id;
              return (
                <div
                  key={p.id}
                  className="autopsy-phase-card"
                  style={{
                    flex: "0 0 auto",
                    width: 200,
                    background: isActive ? `${PHASE_ACCENT_COLORS[p.id] || C.dim}10` : C.surface,
                    border: `1px solid ${isActive ? (PHASE_ACCENT_COLORS[p.id] || C.dim) + "60" : C.border}`,
                    borderTop: `3px solid ${PHASE_ACCENT_COLORS[p.id] || C.dim}`,
                    borderRadius: 6,
                    padding: "12px 14px",
                  }}
                >
                  <div style={{ ...heading, fontSize: 13, fontWeight: 700, color: PHASE_ACCENT_COLORS[p.id] || C.dim, marginBottom: 4 }}>
                    {p.label}
                  </div>
                  <div style={{ ...mono, fontSize: 10, color: C.dim, marginBottom: 8 }}>
                    {p.duration_days}d &middot; Day {p.start_day}-{p.end_day}
                  </div>
                  <div style={{ ...mono, fontSize: 10, color: C.white, marginBottom: 6, lineHeight: 1.5 }}>
                    {p.summary}
                  </div>
                  <div style={{ ...mono, fontSize: 9, color: C.dim, marginBottom: 4 }}>
                    <span style={{ color: PHASE_ACCENT_COLORS[p.id] || C.dim }}>Signal:</span> {p.dominant_signal}
                  </div>
                  <div style={{ ...mono, fontSize: 9, color: C.dim, marginBottom: 4 }}>
                    <span style={{ color: PHASE_ACCENT_COLORS[p.id] || C.dim }}>Event:</span> {p.key_event}
                  </div>
                  <div style={{ ...heading, fontSize: 10, color: C.dim, lineHeight: 1.5, fontStyle: "italic", borderTop: `1px solid ${C.border}`, paddingTop: 6, marginTop: 6 }}>
                    {p.insight}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* --- ELEMENT 4: Creator Impact Panel --- */}
      <div className="autopsy-stagger-4" style={{ marginBottom: 36 }}>
        <div style={{ ...mono, fontSize: 10, color: C.dim, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 12 }}>
          Creator Impact Analysis
        </div>
        {creatorImpacts.length === 0 ? (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: "24px 20px", textAlign: "center" }}>
            <div style={{ ...heading, fontSize: 14, color: C.dim }}>No YouTube coverage detected yet</div>
            <div style={{ ...mono, fontSize: 11, color: C.dim, marginTop: 6 }}>
              Creator impact data will appear when YouTube videos covering this game are found.
            </div>
          </div>
        ) : (
          <>
            {/* Hero card for #1 creator (breakout catalyst) */}
            {(() => {
              const hero = creatorImpacts[0];
              const velocityChange = hero.velocity_after - hero.velocity_before;
              const velocityPct = hero.velocity_before > 0 ? Math.round((velocityChange / hero.velocity_before) * 100) : velocityChange > 0 ? 999 : 0;
              return (
                <div
                  style={{
                    background: `linear-gradient(135deg, ${C.surface} 0%, rgba(34,211,238,0.06) 100%)`,
                    border: `1px solid #22d3ee40`,
                    borderLeft: `4px solid #22d3ee`,
                    borderRadius: 6,
                    padding: "20px 24px",
                    marginBottom: 12,
                    display: "flex",
                    gap: 24,
                    alignItems: "stretch",
                  }}
                >
                  {/* Left: Creator identity + verdict */}
                  <div style={{ flex: "1 1 auto", minWidth: 0 }}>
                    <div style={{ ...mono, fontSize: 9, textTransform: "uppercase", letterSpacing: 1.5, color: "#22d3ee", marginBottom: 6 }}>
                      Breakout Catalyst
                    </div>
                    <div style={{ ...heading, fontSize: 22, fontWeight: 800, color: C.white, marginBottom: 2 }}>
                      {hero.channel_name}
                    </div>
                    <div style={{ ...mono, fontSize: 11, color: C.dim, marginBottom: 10 }}>
                      {fmtNum(hero.subscriber_count)} subscribers &middot; {fmtDate(hero.upload_date)}
                    </div>
                    <div style={{ ...mono, fontSize: 11, color: C.white, marginBottom: 8, lineHeight: 1.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      &ldquo;{hero.video_title}&rdquo;
                    </div>
                    <div style={{ ...heading, fontSize: 12, color: C.dim, lineHeight: 1.6, maxWidth: 480 }}>
                      {hero.raw_review_delta > 0
                        ? `This creator's coverage drove +${hero.raw_review_delta} reviews in the 7 days following upload${hero.shared_date ? " (attributed share)" : ""}, accelerating review velocity by ${velocityPct > 0 ? `${Math.min(velocityPct, 999)}%` : "—"}.`
                        : `This creator had the highest measured impact of all covering channels.`}
                    </div>
                  </div>

                  {/* Right: Impact metrics grid */}
                  <div style={{ flex: "0 0 auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 24px", alignSelf: "center" }}>
                    <div>
                      <div style={{ ...mono, fontSize: 8, textTransform: "uppercase", letterSpacing: 1, color: C.dim }}>Views</div>
                      <div style={{ ...mono, fontSize: 20, fontWeight: 700, color: C.white }}>{fmtNum(hero.view_count)}</div>
                    </div>
                    <div>
                      <div style={{ ...mono, fontSize: 8, textTransform: "uppercase", letterSpacing: 1, color: C.dim }}>Impact</div>
                      <div style={{ ...mono, fontSize: 20, fontWeight: 700, color: hero.impact_score >= 70 ? C.ops : hero.impact_score >= 40 ? C.score : C.white }}>{hero.impact_score}</div>
                    </div>
                    <div>
                      <div style={{ ...mono, fontSize: 8, textTransform: "uppercase", letterSpacing: 1, color: C.dim }}>Rev +7d</div>
                      <div style={{ ...mono, fontSize: 20, fontWeight: 700, color: C.green }}>+{hero.reviews_after_7d - hero.reviews_before_7d}</div>
                    </div>
                    <div>
                      <div style={{ ...mono, fontSize: 8, textTransform: "uppercase", letterSpacing: 1, color: C.dim }}>Velocity</div>
                      <div style={{ ...mono, fontSize: 20, fontWeight: 700, color: velocityChange > 0 ? C.green : C.dim }}>
                        {velocityChange > 0 ? "+" : ""}{velocityChange.toFixed(1)}/d
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Remaining creators table */}
            {creatorImpacts.length > 1 && (
              <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, overflow: "hidden" }}>
                <table style={{ ...mono, width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                      {["Creator", "Subs", "Video", "Date", "Views", "Rev +/-", "Impact"].map((h) => (
                        <th
                          key={h}
                          style={{
                            padding: "8px 12px",
                            textAlign: "left",
                            color: C.dim,
                            fontWeight: 400,
                            fontSize: 9,
                            textTransform: "uppercase",
                            letterSpacing: 1,
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {creatorImpacts.slice(1).map((c) => (
                      <tr key={c.channel_name + c.upload_date} style={{ borderBottom: `1px solid ${C.border}` }}>
                        <td style={{ padding: "8px 12px" }}>
                          <span style={{ color: "#22d3ee" }}>{c.channel_name}</span>
                          {c.shared_date && <span style={{ ...mono, fontSize: 8, color: C.dim, marginLeft: 4 }} title="Shared upload date — impact split by subscriber count">*</span>}
                        </td>
                        <td style={{ padding: "8px 12px", color: C.dim }}>{fmtNum(c.subscriber_count)}</td>
                        <td style={{ padding: "8px 12px", color: C.white, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {c.video_title}
                        </td>
                        <td style={{ padding: "8px 12px", color: C.dim }}>{fmtDate(c.upload_date)}</td>
                        <td style={{ padding: "8px 12px", color: C.white }}>{fmtNum(c.view_count)}</td>
                        <td style={{ padding: "8px 12px" }}>
                          <span style={{ color: C.dim }}>{c.reviews_before_7d}</span>
                          <span style={{ color: C.green }}> +{c.reviews_after_7d - c.reviews_before_7d}</span>
                        </td>
                        <td style={{ padding: "8px 12px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <div style={{ width: 44, height: 6, background: C.border, borderRadius: 3, overflow: "hidden" }}>
                              <div style={{ width: `${c.impact_score}%`, height: "100%", background: c.impact_score >= 70 ? C.ops : c.impact_score >= 40 ? C.score : C.dim, borderRadius: 3 }} />
                            </div>
                            <span style={{ color: C.dim, fontSize: 10 }}>{c.impact_score}</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {/* Coverage + shared-date footnote */}
                <div style={{ display: "flex", gap: 8, padding: "6px 12px", borderTop: `1px solid ${C.border}`, alignItems: "center", flexWrap: "wrap" }}>
                  {creatorImpacts.map((c) => (
                    <span
                      key={c.channel_name + c.upload_date}
                      style={{
                        ...mono,
                        fontSize: 9,
                        padding: "2px 8px",
                        borderRadius: 3,
                        background: c.covers === "demo" ? "rgba(34,211,238,0.1)" : "rgba(192,57,43,0.1)",
                        color: c.covers === "demo" ? "#22d3ee" : C.ccu,
                        border: `1px solid ${c.covers === "demo" ? "#22d3ee30" : C.ccu + "30"}`,
                      }}
                    >
                      {c.channel_name}: {c.covers.toUpperCase()}
                    </span>
                  ))}
                  {creatorImpacts.some((c) => c.shared_date) && (
                    <span style={{ ...mono, fontSize: 8, color: C.dim, marginLeft: 8 }}>
                      * Same-day uploads &mdash; review delta split proportionally by subscriber count
                    </span>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* --- ELEMENT 5: OPS Score Spotlight --- */}
      {hasOpsData && (
        <div className="autopsy-stagger-5" style={{ marginBottom: 36 }}>
          <div style={{ ...mono, fontSize: 10, color: C.dim, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 12 }}>
            OPS Score Spotlight
          </div>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            {/* OPS mini chart */}
            <div style={{ flex: "1 1 400px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: "16px 12px" }}>
              <ResponsiveContainer width="100%" height={140}>
                <ComposedChart data={chartData.filter((d) => d.raw_ops != null)} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid {...gridProps} />
                  <XAxis {...xAxisProps} />
                  <YAxis {...yAxisStyle} tickFormatter={(v: number) => v.toFixed(1)} />
                  <Area
                    dataKey="raw_ops"
                    stroke={C.ops}
                    fill={C.ops}
                    fillOpacity={0.12}
                    strokeWidth={2}
                    dot={false}
                  />
                  {/* Peak annotation */}
                  {opsPeak.date && (
                    <ReferenceLine
                      x={opsPeak.date}
                      stroke={C.ops}
                      strokeDasharray="4 3"
                      label={{
                        value: `Day ${opsPeak.day}: OPS ${opsPeak.score}`,
                        fill: C.ops,
                        fontSize: 10,
                        fontFamily: "'JetBrains Mono', monospace",
                        position: "insideTopRight",
                      }}
                    />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
              <div style={{ ...mono, fontSize: 10, color: C.dim, padding: "8px 8px 0", lineHeight: 1.6 }}>
                Peak: Day {opsPeak.day} &mdash; OPS {opsPeak.score}
              </div>
            </div>

            {/* OPS stats panel */}
            <div style={{ flex: "0 0 280px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: "16px 18px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
              {/* Current OPS */}
              <div>
                <div style={{ ...mono, fontSize: 9, textTransform: "uppercase", letterSpacing: 1.5, color: C.dim, marginBottom: 4 }}>
                  Current OPS (Raw)
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <span style={{ ...mono, fontSize: 36, fontWeight: 700, color: C.ops }}>
                    {latestWithOps?.raw_ops != null ? latestWithOps.raw_ops.toFixed(1) : (latestWithOps?.ops_score ?? "--")}
                  </span>
                  {opsMomentum.arrow && (
                    <>
                      <span style={{ ...mono, fontSize: 16, color: C.dim }}>
                        {opsMomentum.arrow}
                      </span>
                      <span style={{ ...mono, fontSize: 10, color: C.dim }}>
                        {opsMomentum.label}
                      </span>
                    </>
                  )}
                </div>
                <div style={{ ...mono, fontSize: 10, color: C.dim, marginTop: 2, display: "flex", gap: 12 }}>
                  {latestWithOps?.ops_score != null && (
                    <span>Capped: <span style={{ color: C.ops }}>{latestWithOps.ops_score}</span>/100</span>
                  )}
                  {latestWithOps?.ops_confidence && (
                    <span>Confidence: <span style={{ color: C.green }}>{latestWithOps.ops_confidence}</span></span>
                  )}
                </div>
              </div>

              {/* Component breakdown */}
              <div style={{ marginTop: 16 }}>
                <div style={{ ...mono, fontSize: 9, textTransform: "uppercase", letterSpacing: 1.5, color: C.dim, marginBottom: 8 }}>
                  Latest Components
                </div>
                {latestWithOps && [
                  { label: "Velocity", value: latestWithOps.velocity_component, weight: 0.35, max: 10, color: C.score },
                  { label: "Decay", value: latestWithOps.decay_component, weight: 0.20, max: 2, color: "#f59e0b" },
                  { label: "Reviews", value: latestWithOps.review_component, weight: 0.15, max: 5, color: C.reviews },
                  { label: "YouTube", value: latestWithOps.youtube_component, weight: 0.15, max: 1.8, color: "#38bdf8" },
                  { label: "CCU", value: latestWithOps.ccu_component, weight: 0.15, max: 5, color: C.ccu },
                ].map((comp) => (
                  <div key={comp.label} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <span style={{ ...mono, fontSize: 10, color: C.dim, width: 52 }}>{comp.label}</span>
                    <div style={{ flex: 1, height: 8, background: C.border, borderRadius: 4, overflow: "hidden" }}>
                      <div
                        style={{
                          width: `${Math.min(100, ((comp.value || 0) / comp.max) * 100)}%`,
                          height: "100%",
                          background: comp.color,
                          borderRadius: 4,
                          opacity: 0.7,
                        }}
                      />
                    </div>
                    <span style={{ ...mono, fontSize: 10, color: comp.color, width: 40, textAlign: "right" }}>
                      {comp.value != null ? comp.value.toFixed(2) : "--"}
                    </span>
                  </div>
                ))}
              </div>

              {/* Explanation */}
              <div style={{ ...heading, fontSize: 11, color: C.dim, lineHeight: 1.6, marginTop: 16, borderTop: `1px solid ${C.border}`, paddingTop: 12 }}>
                OPS v3 measures breakout potential via age-adjusted velocity (35%), velocity decay rate (25%), review volume (15%), YouTube engagement (15%), and creator velocity response (10%). Low decay = sustained interest.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- ELEMENT 6: Comparable Ghost Overlay (info panel) --- */}
      <div className="autopsy-stagger-6" style={{ marginBottom: 24 }}>
        <div style={{ ...mono, fontSize: 10, color: C.dim, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 12 }}>
          Comparable Trajectory
        </div>
        <div
          style={{
            background: C.surface,
            border: `1px solid ${C.border}`,
            borderRadius: 6,
            padding: "16px 20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
          }}
        >
          <div>
            <div style={{ ...heading, fontSize: 14, color: C.white, marginBottom: 4 }}>
              Median Trajectory Comparison
            </div>
            <div style={{ ...mono, fontSize: 11, color: C.dim, lineHeight: 1.6 }}>
              Compare this game's trajectory against the median for similar horror indie games.
              This feature will overlay the typical review, CCU, and OPS curves for peer games
              with matching price range and subgenre. Coming soon.
            </div>
          </div>
          <button
            onClick={() => setShowGhost((g) => !g)}
            style={{
              ...mono,
              fontSize: 11,
              padding: "8px 20px",
              borderRadius: 4,
              cursor: "pointer",
              border: `1px solid ${showGhost ? C.ops : C.border}`,
              background: showGhost ? `${C.ops}15` : "transparent",
              color: showGhost ? C.ops : C.dim,
              whiteSpace: "nowrap",
              transition: "all 0.2s",
            }}
          >
            {showGhost ? "Hide Ghost" : "Show Ghost"}
          </button>
        </div>
      </div>

      {/* --- Event Card Overlay --- */}
      {selectedEvent && (
        <EventCard event={selectedEvent} onClose={() => setSelectedEvent(null)} />
      )}
    </div>
  );
}
