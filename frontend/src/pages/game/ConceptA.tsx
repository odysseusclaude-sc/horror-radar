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
}

interface TimelineSnapshotRaw {
  date: string;
  review_count: number | null;
  review_score_pct: number | null;
  peak_ccu: number | null;
  owners_estimate: number | null;
  demo_review_count: number | null;
  demo_review_score_pct: number | null;
  ops_score: number | null;
  ops_confidence: string | null;
  review_component: number | null;
  velocity_component: number | null;
  ccu_component: number | null;
  youtube_component: number | null;
  twitch_viewers: number | null;
  twitch_streams: number | null;
  yt_cumulative_views: number;
  patch_count_30d: number | null;
  days_since_last_update: number | null;
}

interface TimelineSnapshot extends TimelineSnapshotRaw {
  day_index: number;
}

type EventType =
  | "youtube_demo"
  | "youtube_game"
  | "reddit"
  | "steam_update"
  | "game_launch";

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
  impact_score: number;
  covers: string;
}

/* ── Palette ──────────────────────────────────────────────────────── */

const C = {
  bg: "#080809",
  surface: "#0f0f11",
  border: "#1e1e1e",
  white: "#e2e2e2",
  dim: "#888888",
  ops: "#ef4444",
  reviews: "#e2e2e2",
  ccu: "#c0392b",
  score: "#facc15",
  twitch: "#a855f7",
  ghost: "rgba(255,255,255,0.08)",
  ghostStroke: "rgba(255,255,255,0.18)",
  green: "#4ade80",
} as const;

const mono: React.CSSProperties = { fontFamily: "'Space Mono', monospace" };
const heading: React.CSSProperties = { fontFamily: "'Outfit', sans-serif" };

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
  0%,100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.3); }
  50%     { box-shadow: 0 0 12px 4px rgba(239,68,68,0.15); }
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
  pre_launch: "rgba(167,139,250,0.06)",
  launch_week: "rgba(192,57,43,0.08)",
  discovery: "rgba(250,204,21,0.07)",
  settling: "rgba(74,222,128,0.06)",
  long_tail: "rgba(136,136,136,0.03)",
};

const PHASE_ACCENT_COLORS: Record<string, string> = {
  pre_launch: "#a78bfa",
  launch_week: "#c0392b",
  discovery: "#facc15",
  settling: "#4ade80",
  long_tail: "#888888",
};

/* ── Event constants ─────────────────────────────────────────────── */

const EVENT_COLORS: Record<string, string> = {
  game_launch: "#c0392b",
  youtube_demo: "#22d3ee",
  youtube_game: "#22d3ee",
  reddit: "#f97316",
  steam_update: "#4ade80",
};

const EVENT_LABELS: Record<string, string> = {
  game_launch: "Game Launch",
  youtube_demo: "YouTube (Demo)",
  youtube_game: "YouTube (Game)",
  reddit: "Reddit",
  steam_update: "Steam Update",
};

const EVENT_ICONS: Record<string, string> = {
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
  { key: "ops_score", label: "OPS Score", color: C.ops, defaultOn: true, panel: 1 },
  { key: "review_count", label: "Reviews", color: C.reviews, defaultOn: true, panel: 2 },
  { key: "peak_ccu", label: "Peak CCU", color: C.ccu, defaultOn: true, panel: 2 },
  { key: "review_score_pct", label: "Score %", color: C.score, defaultOn: true, panel: 3 },
  // Twitch removed from panel 3 — not yet useful
  // { key: "twitch_viewers", label: "Twitch", color: C.twitch, defaultOn: false, panel: 3 },
  { key: "owners_estimate", label: "Owners", color: C.green, defaultOn: false, panel: 2 },
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

/** Derive creator impacts from videos + snapshots */
function deriveCreatorImpacts(videos: TimelineVideo[], snapshots: TimelineSnapshot[]): CreatorImpact[] {
  if (videos.length === 0 || snapshots.length === 0) return [];

  // Build date-indexed lookup
  function findClosestSnapshot(targetDate: string): TimelineSnapshot | null {
    // Find the snapshot with the closest date
    let best: TimelineSnapshot | null = null;
    let bestDist = Infinity;
    for (const s of snapshots) {
      const dist = Math.abs(daysBetween(s.date, targetDate));
      if (dist < bestDist) {
        bestDist = dist;
        best = s;
      }
    }
    return best;
  }

  function findSnapshotNearDay(dayOffset: number, pubDate: string): TimelineSnapshot | null {
    const d = new Date(pubDate + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + dayOffset);
    const target = d.toISOString().slice(0, 10);
    return findClosestSnapshot(target);
  }

  const latestSnap = snapshots[snapshots.length - 1];
  const maxReviews = latestSnap?.review_count ?? 1;

  return videos
    .filter((v) => v.published_at)
    .map((v) => {
      const pubDate = v.published_at!.slice(0, 10);
      const before = findSnapshotNearDay(-7, pubDate);
      const after = findSnapshotNearDay(7, pubDate);
      const reviewsBefore = before?.review_count ?? 0;
      const reviewsAfter = after?.review_count ?? reviewsBefore;
      const ccuBefore = before?.peak_ccu ?? 0;
      const ccuAfter = after?.peak_ccu ?? ccuBefore;
      const reviewDelta = reviewsAfter - reviewsBefore;
      const impactScore = maxReviews > 0
        ? Math.min(100, Math.round((reviewDelta / Math.max(1, maxReviews)) * 300))
        : 0;

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
        impact_score: Math.max(0, impactScore),
        covers: v.covers || "game",
      };
    })
    .sort((a, b) => b.impact_score - a.impact_score);
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
      {visibleSeries.ops_score && d.ops_score != null && (
        <div>
          <span style={{ color: C.ops }}>OPS</span> {d.ops_score}
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
      {visibleSeries.review_score_pct && d.review_score_pct != null && d.review_score_pct > 0 && (
        <div>
          <span style={{ color: C.score }}>Score</span> {d.review_score_pct.toFixed(1)}%
        </div>
      )}
      {visibleSeries.twitch_viewers && d.twitch_viewers != null && d.twitch_viewers > 0 && (
        <div>
          <span style={{ color: C.twitch }}>Twitch</span> {fmtNum(d.twitch_viewers)} viewers
        </div>
      )}
      {visibleSeries.owners_estimate && d.owners_estimate != null && d.owners_estimate > 0 && (
        <div>
          <span style={{ color: C.green }}>Owners</span> {fmtNum(d.owners_estimate)}
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
    fetch(`/api/games/${appid}/timeline`)
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

  const chartData = useMemo(() => snapshots, [snapshots]);

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
      if (s.ops_score != null && s.ops_score > best.score) {
        best = { score: s.ops_score, day: s.day_index, date: s.date };
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

  const latestSnapshot = snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;

  /* ── Hero stats ── */
  const heroStats = useMemo(() => {
    if (!game || !latestSnapshot) return [];
    const maxCcu = snapshots.reduce((mx, s) => Math.max(mx, s.peak_ccu ?? 0), 0);
    const latestOps = latestWithOps?.ops_score;
    // Owners: use SteamSpy data if available, otherwise estimate from reviews × 30
    const REVIEW_MULTIPLIER = 30;
    let ownersValue: string;
    let ownersNote: string | null = null;
    if (latestSnapshot.owners_estimate) {
      ownersValue = fmtNum(latestSnapshot.owners_estimate);
      ownersNote = "SteamSpy estimate";
    } else if (latestSnapshot.review_count != null && latestSnapshot.review_count > 0) {
      ownersValue = "~" + fmtNum(latestSnapshot.review_count * REVIEW_MULTIPLIER);
      ownersNote = `Est. reviews × ${REVIEW_MULTIPLIER}`;
    } else {
      ownersValue = "--";
    }

    return [
      { label: "Owners", value: ownersValue, color: C.green, note: ownersNote },
      { label: "Peak CCU", value: maxCcu > 0 ? fmtNum(maxCcu) : "--", color: C.ccu },
      { label: "Reviews", value: latestSnapshot.review_count != null ? fmtNum(latestSnapshot.review_count) : "--", color: C.reviews },
      { label: "Score", value: latestSnapshot.review_score_pct != null ? Math.round(latestSnapshot.review_score_pct) + "%" : "--", color: C.score },
      { label: "OPS", value: latestOps != null ? String(Math.round(latestOps)) : "--", color: C.ops },
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
    tick: { fill: C.dim, fontSize: 10, fontFamily: "'Space Mono', monospace" },
    tickLine: false,
    axisLine: { stroke: C.border },
    tickFormatter: (v: string) => fmtDate(v),
    interval: Math.max(1, Math.floor(snapshots.length / 12)),
  };

  const yAxisStyle = {
    tick: { fill: C.dim, fontSize: 10, fontFamily: "'Space Mono', monospace" },
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
                fontFamily: "'Space Mono', monospace",
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
          {game.title}
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
              OPS Score &mdash; Vital Sign
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <ComposedChart data={chartData} syncId="autopsy" margin={{ top: 20, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid {...gridProps} />
                {renderPhaseBands()}
                <XAxis {...xAxisProps} hide />
                <YAxis {...yAxisStyle} domain={[0, 100]} tickFormatter={(v: number) => String(v)} />
                <Tooltip
                  content={(props: any) => (
                    <AutopsyTooltip {...props} visibleSeries={visibleSeries} events={events} />
                  )}
                  cursor={{ stroke: C.dim, strokeDasharray: "3 3" }}
                />
                {renderEventLines(true)}
                <ReferenceLine x={todayDate} stroke={C.dim} strokeDasharray="6 3" label={{ value: "Today", fill: C.dim, fontSize: 10, position: "top" }} />
                {visibleSeries.ops_score && (
                  <Line
                    dataKey="ops_score"
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
                  dot={false}
                />
              )}
              {visibleSeries.review_count && (
                <Line
                  dataKey="review_count"
                  yAxisId="reviews"
                  stroke={C.reviews}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 3, fill: C.reviews, stroke: C.bg, strokeWidth: 2 }}
                />
              )}
              {visibleSeries.owners_estimate && (
                <Line
                  dataKey="owners_estimate"
                  yAxisId="reviews"
                  stroke={C.green}
                  strokeWidth={1.5}
                  dot={false}
                  strokeDasharray="6 3"
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
              {renderEventLines(false)}
              <ReferenceLine x={todayDate} stroke={C.dim} strokeDasharray="6 3" yAxisId="score" />
              {visibleSeries.review_score_pct && (
                <Line
                  dataKey="review_score_pct"
                  yAxisId="score"
                  stroke={C.score}
                  strokeWidth={2}
                  dot={false}
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
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, overflow: "hidden" }}>
            <table style={{ ...mono, width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  {["Creator", "Subs", "Video", "Date", "Views", "Rev +/-", "CCU +/-", "Impact"].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "10px 12px",
                        textAlign: "left",
                        color: C.dim,
                        fontWeight: 400,
                        fontSize: 10,
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
                {creatorImpacts.map((c) => (
                  <tr key={c.channel_name + c.upload_date} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: "10px 12px" }}>
                      <span style={{ color: "#22d3ee", fontWeight: 700 }}>{c.channel_name}</span>
                    </td>
                    <td style={{ padding: "10px 12px", color: C.dim }}>{fmtNum(c.subscriber_count)}</td>
                    <td style={{ padding: "10px 12px", color: C.white, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {c.video_title}
                    </td>
                    <td style={{ padding: "10px 12px", color: C.dim }}>{fmtDate(c.upload_date)}</td>
                    <td style={{ padding: "10px 12px", color: C.white }}>{fmtNum(c.view_count)}</td>
                    <td style={{ padding: "10px 12px" }}>
                      <span style={{ color: C.dim }}>{c.reviews_before_7d}</span>
                      <span style={{ color: C.green }}> +{c.reviews_after_7d - c.reviews_before_7d}</span>
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <span style={{ color: C.dim }}>{c.ccu_before_7d}</span>
                      <span style={{ color: c.ccu_after_7d >= c.ccu_before_7d ? C.green : C.ops }}>
                        {" "}{c.ccu_after_7d >= c.ccu_before_7d ? "+" : ""}{c.ccu_after_7d - c.ccu_before_7d}
                      </span>
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div
                          style={{
                            width: 60,
                            height: 8,
                            background: C.border,
                            borderRadius: 4,
                            overflow: "hidden",
                          }}
                        >
                          <div
                            style={{
                              width: `${c.impact_score}%`,
                              height: "100%",
                              background: c.impact_score >= 70 ? C.ops : c.impact_score >= 40 ? C.score : C.dim,
                              borderRadius: 4,
                            }}
                          />
                        </div>
                        <span style={{ color: c.impact_score >= 70 ? C.ops : C.white, fontWeight: 700 }}>
                          {c.impact_score}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {/* Coverage badges below the table */}
            <div style={{ display: "flex", gap: 8, padding: "8px 12px", borderTop: `1px solid ${C.border}` }}>
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
            </div>
          </div>
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
                <ComposedChart data={chartData.filter((d) => d.ops_score != null)} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid {...gridProps} />
                  <XAxis {...xAxisProps} />
                  <YAxis {...yAxisStyle} domain={[0, 100]} />
                  <Area
                    dataKey="ops_score"
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
                        fontFamily: "'Space Mono', monospace",
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
                  Current OPS
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <span style={{ ...mono, fontSize: 36, fontWeight: 700, color: C.ops }}>
                    {latestWithOps?.ops_score ?? "--"}
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
                {latestWithOps?.ops_confidence && (
                  <div style={{ ...mono, fontSize: 10, color: C.dim, marginTop: 2 }}>
                    Confidence: <span style={{ color: C.green }}>{latestWithOps.ops_confidence}</span>
                  </div>
                )}
              </div>

              {/* Component breakdown */}
              <div style={{ marginTop: 16 }}>
                <div style={{ ...mono, fontSize: 9, textTransform: "uppercase", letterSpacing: 1.5, color: C.dim, marginBottom: 8 }}>
                  Latest Components
                </div>
                {latestWithOps && [
                  { label: "Review", value: latestWithOps.review_component, weight: 0.30, color: C.reviews },
                  { label: "Velocity", value: latestWithOps.velocity_component, weight: 0.25, color: C.score },
                  { label: "CCU", value: latestWithOps.ccu_component, weight: 0.20, color: C.ccu },
                  { label: "YouTube", value: latestWithOps.youtube_component, weight: 0.25, color: "#38bdf8" },
                ].map((comp) => (
                  <div key={comp.label} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <span style={{ ...mono, fontSize: 10, color: C.dim, width: 52 }}>{comp.label}</span>
                    <div style={{ flex: 1, height: 8, background: C.border, borderRadius: 4, overflow: "hidden" }}>
                      <div
                        style={{
                          width: `${Math.min(100, (comp.value || 0) * 100)}%`,
                          height: "100%",
                          background: comp.color,
                          borderRadius: 4,
                          opacity: 0.7,
                        }}
                      />
                    </div>
                    <span style={{ ...mono, fontSize: 10, color: comp.color, width: 32, textAlign: "right" }}>
                      {comp.value != null ? (comp.value * 100).toFixed(0) + "%" : "--"}
                    </span>
                  </div>
                ))}
              </div>

              {/* Explanation */}
              <div style={{ ...heading, fontSize: 11, color: C.dim, lineHeight: 1.6, marginTop: 16, borderTop: `1px solid ${C.border}`, paddingTop: 12 }}>
                OPS (Overperformance Score) measures how much a game outperforms the median for its peer cohort across reviews, velocity, CCU, and YouTube signals. A score above 60 indicates breakout potential.
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
