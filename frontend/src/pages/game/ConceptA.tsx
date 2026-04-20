import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useWatchlist } from "../../hooks/useWatchlist";
import { useCompare } from "../../hooks/useCompare";

/* ── API types (timeline endpoint) ─────────────────────────────────── */

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
}

interface TimelineEventRaw {
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
}

interface TimelineEvent extends TimelineEventRaw {
  day_index: number;
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
  events: TimelineEventRaw[];
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
    year: "numeric",
    timeZone: "UTC",
  });
}

function fmtDateShort(d: string): string {
  return new Date(d + "T00:00:00Z").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
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

function deriveSubgenre(tags: string[], genres: string[]): string {
  const all = [...tags, ...genres].map((t) => t.toLowerCase());
  if (all.some((t) => t.includes("psychological"))) return "Psychological Horror";
  if (all.some((t) => t.includes("survival horror"))) return "Survival Horror";
  if (all.some((t) => t.includes("lovecraft") || t.includes("cosmic"))) return "Cosmic Horror";
  if (all.some((t) => t.includes("slasher"))) return "Slasher";
  if (all.some((t) => t.includes("gothic"))) return "Gothic Horror";
  if (all.some((t) => t.includes("zombie"))) return "Zombie Horror";
  if (all.some((t) => t.includes("creature"))) return "Creature Horror";
  if (all.some((t) => t.includes("supernatural"))) return "Supernatural";
  return "Horror";
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

function opsTier(score: number): { label: string; cls: string } {
  if (score >= 60) return { label: "BREAKOUT", cls: "text-status-pos" };
  if (score >= 30) return { label: "WATCH", cls: "text-status-warn" };
  return { label: "COLD", cls: "text-status-neg" };
}

function getSteamRating(pct: number): string {
  if (pct >= 95) return "Overwhelmingly Positive";
  if (pct >= 80) return "Very Positive";
  if (pct >= 70) return "Mostly Positive";
  if (pct >= 40) return "Mixed";
  if (pct >= 20) return "Mostly Negative";
  return "Overwhelmingly Negative";
}

function priceBadge(price: number | null): string {
  if (price == null) return "Unknown";
  if (price === 0) return "Free";
  return `$${price.toFixed(2)}`;
}

/* ── Phase derivation ──────────────────────────────────────────────── */

interface Phase {
  id: "demo" | "launch" | "discovery" | "settling";
  label: string;
  range: string;
  start_day: number;
  end_day: number;
  color: string;
  bandClass: string;
  accentClass: string;
  icon: string;
  summary: string;
}

function derivePhases(snapshots: TimelineSnapshot[]): Phase[] {
  if (snapshots.length === 0) return [];
  const firstDay = snapshots[0].day_index;
  const lastDay = snapshots[snapshots.length - 1].day_index;
  const phases: Phase[] = [];

  if (firstDay < 0) {
    phases.push({
      id: "demo",
      label: "Demo Phase",
      range: `Day ${firstDay} to -1`,
      start_day: firstDay,
      end_day: Math.min(-1, lastDay),
      color: "#b07db2",
      bandClass: "bg-[rgba(176,125,178,0.06)] border border-[rgba(176,125,178,0.15)]",
      accentClass: "text-status-special",
      icon: "\u{1F579}",
      summary: "Pre-launch visibility and demo traction.",
    });
  }
  if (lastDay >= 0) {
    phases.push({
      id: "launch",
      label: "Launch Week",
      range: "Days 0 – 7",
      start_day: 0,
      end_day: Math.min(7, lastDay),
      color: "#5ec269",
      bandClass: "bg-[rgba(94,194,105,0.06)] border border-[rgba(94,194,105,0.15)]",
      accentClass: "text-status-pos",
      icon: "\u{1F680}",
      summary: "Initial reviews, CCU, and creator uploads.",
    });
  }
  if (lastDay > 7) {
    phases.push({
      id: "discovery",
      label: "Discovery",
      range: "Days 8 – 30",
      start_day: 8,
      end_day: Math.min(30, lastDay),
      color: "#e8a832",
      bandClass: "bg-[rgba(232,168,50,0.06)] border border-[rgba(232,168,50,0.15)]",
      accentClass: "text-status-warn",
      icon: "\u{1F50E}",
      summary: "Creator coverage drives organic discovery.",
    });
  }
  if (lastDay > 30) {
    phases.push({
      id: "settling",
      label: "Settling",
      range: "Day 31+",
      start_day: 31,
      end_day: lastDay,
      color: "#918377",
      bandClass: "bg-[rgba(145,131,119,0.06)] border border-[rgba(145,131,119,0.15)]",
      accentClass: "text-text-dim",
      icon: "\u{23F3}",
      summary: "Review accumulation slows; audience settles.",
    });
  }
  return phases;
}

/* ── Stat cards for Overview ───────────────────────────────────────── */

interface OverviewStat {
  icon: string;
  label: string;
  value: string;
  sub: string | null;
  tone?: "green" | "amber" | "neg" | null;
}

/* ── Events grouping ──────────────────────────────────────────────── */

interface EventGroup {
  key: "youtube" | "reddit" | "steam";
  label: string;
  icon: string;
  accentClass: string;
  dotClass: string;
  items: TimelineEvent[];
}

function groupEvents(events: TimelineEvent[]): EventGroup[] {
  const yt = events.filter((e) => e.type === "youtube_demo" || e.type === "youtube_game");
  const rd = events.filter((e) => e.type === "reddit");
  const st = events.filter(
    (e) => e.type === "steam_update" || e.type === "game_launch" || e.type === "demo_launch",
  );
  const groups: EventGroup[] = [];
  if (yt.length)
    groups.push({
      key: "youtube",
      label: "YouTube",
      icon: "\u25B6",
      accentClass: "text-status-neg",
      dotClass: "bg-status-neg",
      items: yt,
    });
  if (rd.length)
    groups.push({
      key: "reddit",
      label: "Reddit",
      icon: "\u{1F4AC}",
      accentClass: "text-secondary",
      dotClass: "bg-secondary",
      items: rd,
    });
  if (st.length)
    groups.push({
      key: "steam",
      label: "Steam",
      icon: "\u{1F6E0}",
      accentClass: "text-status-info",
      dotClass: "bg-status-info",
      items: st,
    });
  return groups;
}

/* ── Custom Tooltip (Recharts) ────────────────────────────────────── */

function ChartTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload as TimelineSnapshot | undefined;
  if (!d) return null;
  return (
    <div
      className="font-mono text-[11px] rounded-md px-3 py-2 leading-relaxed"
      style={{ background: "#1a1a1c", border: "1px solid #2a2420", color: "#e8e0d4" }}
    >
      <div className="text-text-dim mb-1">
        {fmtDateShort(d.date)} · Day {d.day_index}
      </div>
      {d.ops_score != null && (
        <div>
          <span style={{ color: "#5ec269" }}>OPS</span> {Math.round(d.ops_score)}
        </div>
      )}
      {d.review_count != null && (
        <div>
          <span className="text-text-mid">Reviews</span> {fmtNum(d.review_count)}
        </div>
      )}
      {d.peak_ccu != null && d.peak_ccu > 0 && (
        <div>
          <span style={{ color: "#802626" }}>CCU</span> {fmtNum(d.peak_ccu)}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   MAIN COMPONENT
   ============================================================ */

type ZoomRange = "7d" | "30d" | "all";
const SECTION_IDS = ["overview", "timeline", "creators", "events", "community"] as const;
type SectionId = (typeof SECTION_IDS)[number];

const SECTION_LABELS: Record<SectionId, { label: string; icon: string }> = {
  overview: { label: "Overview", icon: "\u{1F3AE}" },
  timeline: { label: "Timeline", icon: "\u{1F4C8}" },
  creators: { label: "Creator Impact", icon: "\u25B6" },
  events: { label: "Events", icon: "\u{1F4CB}" },
  community: { label: "Community", icon: "\u{1F465}" },
};

export default function Autopsy() {
  const { appid } = useParams<{ appid: string }>();
  const [data, setData] = useState<TimelineResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState<ZoomRange>("30d");
  const [activeSection, setActiveSection] = useState<SectionId>("overview");
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    youtube: true,
    reddit: true,
    steam: true,
  });

  const { isWatched, toggle: toggleWatch } = useWatchlist();
  const { isInCompare, toggle: toggleCompare, canAdd: canAddCompare } = useCompare();

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

  /* ── Derived series ── */
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
      day_index: daysBetween(releaseDate, e.date),
    }));
  }, [data, releaseDate]);

  const phases = useMemo(() => derivePhases(snapshots), [snapshots]);
  const tags = useMemo(() => parseTags(game?.tags ?? null), [game?.tags]);
  const genres = useMemo(() => parseGenres(game?.genres ?? null), [game?.genres]);
  const subgenre = useMemo(() => deriveSubgenre(tags, genres), [tags, genres]);

  const latestSnapshot = useMemo(() => {
    for (let i = snapshots.length - 1; i >= 0; i--) {
      if (snapshots[i].review_count != null) return snapshots[i];
    }
    return snapshots[snapshots.length - 1] ?? null;
  }, [snapshots]);

  const latestWithOps = useMemo(() => {
    for (let i = snapshots.length - 1; i >= 0; i--) {
      if (snapshots[i].ops_score != null) return snapshots[i];
    }
    return null;
  }, [snapshots]);

  const opsConfidence = latestWithOps?.ops_confidence ?? null;

  const maxCcu = useMemo(() => {
    return snapshots.reduce((mx, s) => Math.max(mx, s.peak_ccu ?? 0), 0);
  }, [snapshots]);

  const reviewsPerDay = useMemo(() => {
    if (!latestSnapshot?.review_count || !releaseDate) return null;
    const days = Math.max(1, daysBetween(releaseDate, latestSnapshot.date));
    return latestSnapshot.review_count / days;
  }, [latestSnapshot, releaseDate]);

  const patchCount = useMemo(() => {
    for (let i = snapshots.length - 1; i >= 0; i--) {
      const v = snapshots[i].patch_count_30d;
      if (v != null) return v;
    }
    return null;
  }, [snapshots]);

  const uniqueChannels = useMemo(() => {
    const seen = new Set<string>();
    data?.videos?.forEach((v) => v.channel_id && seen.add(v.channel_id));
    return seen.size;
  }, [data?.videos]);

  const daysSinceLaunch = useMemo(() => {
    if (!releaseDate) return null;
    return daysBetween(releaseDate, new Date().toISOString().slice(0, 10));
  }, [releaseDate]);

  const overviewStats: OverviewStat[] = useMemo(() => {
    const stats: OverviewStat[] = [];
    stats.push({
      icon: "\u26A1",
      label: "OPS",
      value: latestWithOps?.ops_score != null ? String(Math.round(latestWithOps.ops_score)) : "—",
      sub: latestWithOps?.ops_score != null
        ? `${opsTier(latestWithOps.ops_score).label} tier · ${opsConfidence ?? "—"} confidence`
        : "No OPS data yet",
      tone: latestWithOps?.ops_score != null
        ? latestWithOps.ops_score >= 60 ? "green" : latestWithOps.ops_score >= 30 ? "amber" : "neg"
        : null,
    });
    stats.push({
      icon: "\u2B50",
      label: "Reviews",
      value: latestSnapshot?.review_count != null ? fmtNum(latestSnapshot.review_count) : "—",
      sub:
        latestSnapshot?.review_score_pct != null
          ? `${Math.round(latestSnapshot.review_score_pct)}% positive${
              reviewsPerDay ? ` · ${reviewsPerDay.toFixed(1)}/day avg` : ""
            }`
          : reviewsPerDay
          ? `${reviewsPerDay.toFixed(1)}/day avg`
          : null,
    });
    stats.push({
      icon: "\u{1F3AE}",
      label: "Peak CCU",
      value: maxCcu > 0 ? fmtNum(maxCcu) : "—",
      sub: latestSnapshot?.peak_ccu != null && latestSnapshot.peak_ccu < maxCcu
        ? `Now ${fmtNum(latestSnapshot.peak_ccu)} current`
        : null,
    });
    stats.push({
      icon: "\u{1F4C5}",
      label: "Age",
      value: daysSinceLaunch != null ? `${daysSinceLaunch}d` : "—",
      sub: releaseDate ? `Released ${fmtDate(releaseDate)}` : null,
      tone: daysSinceLaunch != null ? (daysSinceLaunch <= 7 ? "green" : daysSinceLaunch <= 30 ? "amber" : null) : null,
    });
    stats.push({
      icon: "\u25B6",
      label: "YouTube",
      value: String(uniqueChannels),
      sub: uniqueChannels === 1 ? "Creator covering this game" : "Creators covering this game",
    });
    stats.push({
      icon: "\u{1F6E0}",
      label: "Patches",
      value: patchCount != null ? String(patchCount) : "—",
      sub: patchCount != null ? "Updates in first 30 days" : "No update data",
    });
    return stats;
  }, [latestWithOps, latestSnapshot, maxCcu, daysSinceLaunch, releaseDate, uniqueChannels, patchCount, reviewsPerDay, opsConfidence]);

  /* ── Chart data (zoom-windowed) ── */
  const chartData = useMemo(() => {
    if (snapshots.length === 0) return snapshots;
    if (zoom === "all") return snapshots;
    const windowDays = zoom === "7d" ? 7 : 30;
    const lastDay = snapshots[snapshots.length - 1].day_index;
    const minDay = lastDay - windowDays;
    return snapshots.filter((s) => s.day_index >= minDay);
  }, [snapshots, zoom]);

  const hasOps = snapshots.some((s) => s.ops_score != null);
  const todayDate = new Date().toISOString().slice(0, 10);

  /* ── YouTube videos with impact derivation ── */
  const creatorCards = useMemo(() => {
    if (!data?.videos || snapshots.length === 0) return [];
    const latestReviews = latestSnapshot?.review_count ?? 0;
    return data.videos
      .filter((v) => v.published_at)
      .map((v) => {
        const pubDate = v.published_at!.slice(0, 10);
        const findSnap = (offset: number) => {
          const d = new Date(pubDate + "T00:00:00Z");
          d.setUTCDate(d.getUTCDate() + offset);
          const target = d.toISOString().slice(0, 10);
          let best: TimelineSnapshot | null = null;
          let bestDist = Infinity;
          for (const s of snapshots) {
            const dist = Math.abs(daysBetween(s.date, target));
            if (dist < bestDist) {
              bestDist = dist;
              best = s;
            }
          }
          return best;
        };
        const before = findSnap(-7);
        const after = findSnap(7);
        const rawDelta = (after?.review_count ?? 0) - (before?.review_count ?? 0);
        const impact = latestReviews > 0
          ? Math.max(0, Math.min(100, Math.round((rawDelta / Math.max(1, latestReviews)) * 300)))
          : 0;
        const tierCls =
          impact >= 70 ? "status-pos" : impact >= 40 ? "status-warn" : "status-info";
        return {
          video_id: v.video_id,
          channel_name: v.channel_name || "Unknown",
          subscriber_count: v.subscriber_count ?? 0,
          title: v.title,
          published_at: pubDate,
          view_count: v.view_count ?? 0,
          review_delta: rawDelta,
          impact,
          tierCls,
          covers: v.covers,
          day_index: releaseDate ? daysBetween(releaseDate, pubDate) : 0,
        };
      })
      .sort((a, b) => b.impact - a.impact);
  }, [data?.videos, snapshots, latestSnapshot, releaseDate]);

  /* ── Events grouping ── */
  const eventGroups = useMemo(() => groupEvents(events), [events]);

  /* ── Community stats ── */
  const latestTwitchViewers = useMemo(() => {
    for (let i = snapshots.length - 1; i >= 0; i--) {
      if (snapshots[i].twitch_viewers != null) return snapshots[i].twitch_viewers;
    }
    return null;
  }, [snapshots]);

  const latestTwitchStreams = useMemo(() => {
    for (let i = snapshots.length - 1; i >= 0; i--) {
      if (snapshots[i].twitch_streams != null) return snapshots[i].twitch_streams;
    }
    return null;
  }, [snapshots]);

  const peakTwitch = useMemo(() => {
    return snapshots.reduce((mx, s) => Math.max(mx, s.twitch_viewers ?? 0), 0);
  }, [snapshots]);

  const redditCount = data?.reddit_mentions?.length ?? 0;
  const redditTopUpvotes = useMemo(() => {
    if (!data?.reddit_mentions?.length) return 0;
    return data.reddit_mentions.reduce((mx, r) => Math.max(mx, r.score ?? 0), 0);
  }, [data?.reddit_mentions]);

  /* ── Scrollspy for section nav ── */
  const sectionRefs = useRef<Partial<Record<SectionId, HTMLElement | null>>>({});

  useEffect(() => {
    if (loading || error) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id as SectionId);
          }
        }
      },
      { rootMargin: "-40% 0px -55% 0px", threshold: 0 },
    );
    for (const id of SECTION_IDS) {
      const el = sectionRefs.current[id];
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [loading, error]);

  const setSectionRef = useCallback((id: SectionId) => (el: HTMLElement | null) => {
    sectionRefs.current[id] = el;
  }, []);

  /* ── Loading / Error ── */
  if (loading) {
    return (
      <div className="bg-background-dark min-h-screen flex items-center justify-center">
        <div className="font-mono text-xs text-text-dim tracking-[2px]">LOADING SIGNAL TRACE…</div>
      </div>
    );
  }

  if (error || !data || !game) {
    return (
      <div className="bg-background-dark min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-xl font-bold text-primary mb-2">Game Not Found</div>
          <div className="font-mono text-xs text-text-dim mb-4">{error ?? "No data available."}</div>
          <Link to="/" className="font-mono text-xs text-secondary hover:underline">← Back to Database</Link>
        </div>
      </div>
    );
  }

  const watched = isWatched(game.appid);
  const inCompare = isInCompare(game.appid);
  const canAddToCompare = canAddCompare || inCompare;

  const coverInitials = game.title
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("") || "??";

  /* ============================================================
     RENDER
     ============================================================ */

  return (
    <>
      {/* Breadcrumb */}
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-2 px-4 md:px-6 xl:px-10 py-3 text-xs text-text-dim"
      >
        <Link to="/" className="hover:text-text-main transition-colors">Database</Link>
        <span aria-hidden="true" className="opacity-50">/</span>
        <span aria-current="page" className="text-text-mid truncate max-w-[60vw]">{game.title}</span>
      </nav>

      {/* Mobile section nav pill bar */}
      <nav
        className="md:hidden sticky top-[57px] z-40 bg-surface-dark border-b border-border-dark px-4 py-2 overflow-x-auto"
        aria-label="Page sections (mobile)"
        style={{ scrollbarWidth: "none" }}
      >
        <ul className="flex gap-1 whitespace-nowrap list-none">
          {SECTION_IDS.map((id) => {
            const active = activeSection === id;
            return (
              <li key={id}>
                <a
                  href={`#${id}`}
                  className={
                    "inline-flex items-center gap-1 px-3 py-2 rounded-full border text-xs font-medium transition-colors " +
                    (active
                      ? "text-secondary border-[rgba(187,113,37,0.3)] bg-[rgba(187,113,37,0.08)]"
                      : "text-text-mid border-transparent hover:text-text-main hover:bg-white/[0.04]")
                  }
                >
                  <span aria-hidden="true">{SECTION_LABELS[id].icon}</span>
                  {SECTION_LABELS[id].label}
                </a>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] xl:grid-cols-[220px_1fr] min-h-[calc(100vh-100px)]">
        {/* Sidebar nav (desktop) */}
        <nav
          className="hidden md:block sticky top-[57px] h-[calc(100vh-57px)] border-r border-border-dark bg-surface-dark py-5 overflow-y-auto"
          aria-label="Page sections"
        >
          <div className="text-xs font-semibold uppercase tracking-wider text-text-dim px-4 pb-3">
            Sections
          </div>
          <ul className="list-none">
            {SECTION_IDS.map((id) => {
              const active = activeSection === id;
              return (
                <li key={id}>
                  <a
                    href={`#${id}`}
                    className={
                      "flex items-center gap-2 px-4 py-2 text-sm border-l-2 transition-colors " +
                      (active
                        ? "text-text-main border-secondary bg-[rgba(187,113,37,0.05)]"
                        : "text-text-mid border-transparent hover:text-text-main hover:bg-white/[0.03]")
                    }
                  >
                    <span aria-hidden="true" className="w-5 text-center">{SECTION_LABELS[id].icon}</span>
                    {SECTION_LABELS[id].label}
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* MAIN CONTENT */}
        <main id="main-content" className="p-4 md:p-6 xl:p-8 max-w-[960px]">
          {/* OVERVIEW */}
          <section
            id="overview"
            ref={setSectionRef("overview")}
            className="mb-10 scroll-mt-20"
          >
            <div className="flex flex-col md:flex-row gap-5 mb-6 flex-wrap">
              {/* Cover */}
              <div
                className="w-full max-w-[200px] md:w-40 md:max-w-none aspect-[4/5] bg-border-dark rounded-lg flex-shrink-0 flex items-center justify-center text-2xl text-text-dim overflow-hidden self-center md:self-start"
                aria-hidden="true"
              >
                {game.header_image_url ? (
                  <img
                    src={game.header_image_url}
                    alt=""
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <span className="font-mono">{coverInitials}</span>
                )}
              </div>

              {/* Title + badges + actions */}
              <div className="flex-1 min-w-0">
                <h1 className="font-serif text-2xl md:text-[2.375rem] font-bold leading-[1.15] mb-2">
                  {game.title}
                </h1>
                <p className="text-sm text-text-mid mb-3">
                  by{" "}
                  {game.developer ? (
                    <span className="text-[#c04040]">{game.developer}</span>
                  ) : (
                    <span>Unknown developer</span>
                  )}
                </p>

                <div className="flex gap-2 flex-wrap mb-4">
                  <span className="inline-flex items-center gap-1 text-xs font-medium py-[3px] px-3 rounded-full border border-[rgba(163,106,165,0.3)] bg-[rgba(163,106,165,0.08)] text-tertiary">
                    <span aria-hidden="true">{"\u{1F47B}"}</span> {subgenre}
                  </span>
                  {game.has_demo && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium py-[3px] px-3 rounded-full border border-[rgba(107,157,219,0.3)] bg-[rgba(107,157,219,0.08)] text-status-info">
                      <span aria-hidden="true">{"\u{1F579}"}</span> Demo Available
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 text-xs font-medium py-[3px] px-3 rounded-full border border-[rgba(187,113,37,0.3)] bg-[rgba(187,113,37,0.08)] text-secondary">
                    <span aria-hidden="true">{"\u{1F4B0}"}</span> {priceBadge(game.price_usd)}
                  </span>
                  {latestSnapshot?.review_score_pct != null && latestSnapshot.review_count != null && latestSnapshot.review_count >= 10 && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium py-[3px] px-3 rounded-full border border-[rgba(94,194,105,0.3)] bg-[rgba(94,194,105,0.08)] text-status-pos">
                      <span aria-hidden="true">{"\u2714"}</span> {getSteamRating(latestSnapshot.review_score_pct)}
                    </span>
                  )}
                </div>

                {/* Action row: Steam link + Watchlist + Compare */}
                <div className="flex gap-2 flex-wrap">
                  <a
                    href={`https://store.steampowered.com/app/${game.appid}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-[11px] tracking-[1.5px] px-3.5 py-2 rounded bg-primary text-white uppercase font-bold hover:bg-primary-light transition-colors"
                  >
                    ▸ Open on Steam
                  </a>
                  <button
                    type="button"
                    onClick={() => toggleWatch(game.appid)}
                    aria-pressed={watched}
                    className={
                      "font-mono text-[11px] tracking-[1.5px] px-3.5 py-2 rounded border uppercase font-bold transition-colors " +
                      (watched
                        ? "border-[rgba(94,194,105,0.4)] bg-[rgba(94,194,105,0.08)] text-status-pos"
                        : "border-border-dark text-text-mid hover:text-text-main hover:border-text-dim")
                    }
                  >
                    {watched ? "★ Watching" : "☆ Watchlist"}
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleCompare(game.appid)}
                    disabled={!canAddToCompare}
                    aria-pressed={inCompare}
                    className={
                      "font-mono text-[11px] tracking-[1.5px] px-3.5 py-2 rounded border uppercase font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed " +
                      (inCompare
                        ? "border-[rgba(187,113,37,0.4)] bg-[rgba(187,113,37,0.08)] text-secondary"
                        : "border-border-dark text-text-mid hover:text-text-main hover:border-text-dim")
                    }
                    title={!canAddToCompare ? "Compare limit reached" : undefined}
                  >
                    {inCompare ? "⊟ In Compare" : "⊞ Compare"}
                  </button>
                </div>
              </div>
            </div>

            {/* Overview stats grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
              {overviewStats.map((stat) => (
                <article
                  key={stat.label}
                  className="bg-surface-dark border border-border-dark rounded-lg p-4"
                >
                  <div className="text-xs text-text-dim uppercase tracking-wider font-semibold mb-1 flex items-center gap-1">
                    <span className="text-sm" aria-hidden="true">{stat.icon}</span>
                    {stat.label}
                  </div>
                  <div
                    className={
                      "font-mono text-xl font-semibold " +
                      (stat.tone === "green"
                        ? "text-status-pos"
                        : stat.tone === "amber"
                        ? "text-status-warn"
                        : stat.tone === "neg"
                        ? "text-status-neg"
                        : "text-text-main")
                    }
                  >
                    {stat.value}
                  </div>
                  {stat.sub && (
                    <div className="text-xs text-text-dim mt-1 leading-snug">{stat.sub}</div>
                  )}
                </article>
              ))}
            </div>
          </section>

          {/* TIMELINE */}
          <section id="timeline" ref={setSectionRef("timeline")} className="mb-10 scroll-mt-20">
            <h2 className="text-lg font-bold mb-4 pb-2 border-b border-border-dark flex items-center gap-2">
              <span className="text-secondary text-base" aria-hidden="true">{"\u{1F4C8}"}</span>
              Timeline
            </h2>

            {snapshots.length === 0 ? (
              <div className="bg-surface-dark border border-border-dark rounded-lg p-10 text-center">
                <div className="text-text-dim text-sm">No snapshot data yet</div>
                <div className="font-mono text-xs text-text-dim mt-2">
                  Timeline populates after the first daily collection.
                </div>
              </div>
            ) : (
              <>
                <div className="bg-surface-dark border border-border-dark rounded-lg p-5 mb-4">
                  {/* Zoom controls */}
                  <div
                    className="flex items-center gap-3 mb-4 pb-3 border-b border-border-dark flex-wrap"
                    role="group"
                    aria-label="Zoom controls"
                  >
                    <span className="text-xs text-text-dim font-semibold flex items-center gap-1">
                      <span aria-hidden="true">{"\u{1F50D}"}</span> Zoom
                    </span>
                    {(["7d", "30d", "all"] as ZoomRange[]).map((z) => (
                      <button
                        key={z}
                        type="button"
                        onClick={() => setZoom(z)}
                        className={
                          "font-mono text-xs px-3 py-1 rounded border transition-colors " +
                          (zoom === z
                            ? "text-secondary border-[rgba(187,113,37,0.4)] bg-[rgba(187,113,37,0.08)]"
                            : "text-text-mid border-border-dark bg-white/[0.03] hover:text-text-main hover:border-text-dim")
                        }
                        aria-pressed={zoom === z}
                      >
                        {z === "7d" ? "7D" : z === "30d" ? "30D" : "All"}
                      </button>
                    ))}
                  </div>

                  <div className="w-full h-[220px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart
                        data={chartData}
                        margin={{ top: 12, right: 8, left: 0, bottom: 0 }}
                      >
                        <defs>
                          <linearGradient id="opsTimelineGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#5ec269" stopOpacity={0.25} />
                            <stop offset="100%" stopColor="#5ec269" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid stroke="#2a2420" strokeDasharray="2 4" vertical={false} />
                        {phases.map((p) => {
                          const startDate = snapshots.find((s) => s.day_index >= p.start_day)?.date;
                          const endDate = [...snapshots].reverse().find((s) => s.day_index <= p.end_day)?.date;
                          if (!startDate || !endDate) return null;
                          return (
                            <ReferenceArea
                              key={p.id}
                              x1={startDate}
                              x2={endDate}
                              fill={p.color}
                              fillOpacity={0.06}
                              stroke={p.color}
                              strokeOpacity={0.15}
                              ifOverflow="extendDomain"
                              label={{
                                value: p.label,
                                position: "insideTopLeft",
                                fill: p.color,
                                fontSize: 10,
                                fontFamily: "'JetBrains Mono', monospace",
                              }}
                            />
                          );
                        })}
                        <XAxis
                          dataKey="date"
                          tick={{ fill: "#918377", fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}
                          tickLine={false}
                          axisLine={{ stroke: "#2a2420" }}
                          tickFormatter={(v: string) => `D${daysBetween(releaseDate!, v)}`}
                          interval={Math.max(0, Math.floor(chartData.length / 8))}
                        />
                        <YAxis
                          tick={{ fill: "#918377", fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}
                          tickLine={false}
                          axisLine={false}
                          domain={[0, 100]}
                          width={36}
                        />
                        <Tooltip
                          content={<ChartTooltip />}
                          cursor={{ stroke: "#918377", strokeDasharray: "3 3" }}
                        />
                        {hasOps && (
                          <>
                            <Area
                              dataKey="ops_score"
                              stroke="none"
                              fill="url(#opsTimelineGrad)"
                              connectNulls
                              isAnimationActive={false}
                            />
                            <Line
                              dataKey="ops_score"
                              stroke="#5ec269"
                              strokeWidth={2}
                              dot={false}
                              connectNulls
                              activeDot={{ r: 4, fill: "#5ec269", stroke: "#111314", strokeWidth: 2 }}
                              isAnimationActive={false}
                            />
                          </>
                        )}
                        <ReferenceLine
                          x={todayDate}
                          stroke="#918377"
                          strokeDasharray="6 3"
                          label={{ value: "Today", fill: "#918377", fontSize: 10, position: "top" }}
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Phase cards */}
                {phases.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                    {phases.map((p) => (
                      <article
                        key={p.id}
                        className="bg-surface-dark border border-border-dark rounded-lg p-4"
                      >
                        <div
                          className={"text-xs font-semibold uppercase tracking-wider mb-2 flex items-center gap-1 " + p.accentClass}
                        >
                          <span aria-hidden="true">{p.icon}</span>
                          {p.label}
                        </div>
                        <div className="font-mono text-xs text-text-dim mb-2">{p.range}</div>
                        <div className="text-xs text-text-mid leading-relaxed">{p.summary}</div>
                      </article>
                    ))}
                  </div>
                )}
              </>
            )}
          </section>

          {/* CREATOR IMPACT */}
          <section id="creators" ref={setSectionRef("creators")} className="mb-10 scroll-mt-20">
            <h2 className="text-lg font-bold mb-4 pb-2 border-b border-border-dark flex items-center gap-2">
              <span className="text-secondary text-base" aria-hidden="true">{"\u25B6"}</span>
              Creator Impact
            </h2>

            {creatorCards.length === 0 ? (
              <div className="bg-surface-dark border border-border-dark rounded-lg p-8 text-center">
                <div className="text-text-dim text-sm">No YouTube coverage detected yet</div>
                <div className="font-mono text-xs text-text-dim mt-2">
                  Creator cards appear when matched uploads are found.
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {creatorCards.slice(0, 9).map((c) => {
                  const fillClass =
                    c.tierCls === "status-pos"
                      ? "bg-status-pos"
                      : c.tierCls === "status-warn"
                      ? "bg-status-warn"
                      : "bg-status-info";
                  const valueClass =
                    c.tierCls === "status-pos"
                      ? "text-status-pos"
                      : c.tierCls === "status-warn"
                      ? "text-status-warn"
                      : "text-status-info";
                  const initials =
                    c.channel_name
                      .split(/\s+/)
                      .filter(Boolean)
                      .slice(0, 2)
                      .map((w) => w[0]?.toUpperCase())
                      .join("") || "?";
                  return (
                    <article
                      key={c.video_id}
                      className="bg-surface-dark border border-border-dark rounded-lg p-5 hover:border-[#3a342e] transition-colors"
                    >
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-11 h-11 rounded-full bg-border-dark flex items-center justify-center text-sm font-semibold text-text-dim flex-shrink-0">
                          {initials}
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-sm truncate">{c.channel_name}</div>
                          <div className="font-mono text-xs text-text-dim">
                            {c.subscriber_count > 0 ? `${fmtNum(c.subscriber_count)} subscribers` : "—"}
                          </div>
                        </div>
                      </div>
                      <p
                        className="text-xs text-text-mid mb-3 leading-relaxed overflow-hidden"
                        style={{
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical",
                        }}
                        title={c.title}
                      >
                        <strong className="text-text-main font-medium">"{c.title}"</strong>
                      </p>
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-xs text-text-dim font-semibold w-[50px] flex-shrink-0">
                          Impact
                        </span>
                        <div
                          className="flex-1 h-4 bg-white/[0.03] border border-border-dark rounded-sm overflow-hidden relative"
                          role="progressbar"
                          aria-valuenow={c.impact}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-label={`Impact score ${c.impact}`}
                        >
                          <div
                            className={"absolute left-0 top-0 bottom-0 " + fillClass}
                            style={{ width: `${Math.max(2, c.impact)}%`, opacity: 0.85 }}
                          />
                        </div>
                        <span
                          className={"font-mono text-sm font-semibold w-9 text-right " + valueClass}
                        >
                          {c.impact}
                        </span>
                      </div>
                      <div className="font-mono text-[10px] text-text-dim mt-2">
                        Day {c.day_index} · {fmtNum(c.view_count)} views
                        {c.review_delta > 0 && (
                          <span className="text-status-pos"> · +{c.review_delta} rev</span>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          {/* EVENTS */}
          <section id="events" ref={setSectionRef("events")} className="mb-10 scroll-mt-20">
            <h2 className="text-lg font-bold mb-4 pb-2 border-b border-border-dark flex items-center gap-2">
              <span className="text-secondary text-base" aria-hidden="true">{"\u{1F4CB}"}</span>
              Events Timeline
            </h2>

            {eventGroups.length === 0 ? (
              <div className="bg-surface-dark border border-border-dark rounded-lg p-8 text-center">
                <div className="text-text-dim text-sm">No events tracked yet</div>
              </div>
            ) : (
              <div className="flex flex-col gap-5">
                {eventGroups.map((g) => {
                  const expanded = expandedGroups[g.key] ?? true;
                  return (
                    <div key={g.key}>
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedGroups((prev) => ({ ...prev, [g.key]: !expanded }))
                        }
                        aria-expanded={expanded}
                        aria-label={`${g.label} events, ${g.items.length} item${g.items.length === 1 ? "" : "s"}`}
                        className="w-full flex items-center justify-between px-4 py-3 bg-surface-dark border border-border-dark rounded-lg hover:bg-[#222224] transition-colors mb-2"
                      >
                        <div className={"flex items-center gap-2 text-sm font-semibold " + g.accentClass}>
                          <span aria-hidden="true" className="text-base">{g.icon}</span>
                          <span className="text-text-main">{g.label}</span>
                        </div>
                        <span className="font-mono text-xs text-text-dim bg-white/[0.03] py-[2px] px-2 rounded-full">
                          {g.items.length} event{g.items.length === 1 ? "" : "s"}
                        </span>
                        <span
                          aria-hidden="true"
                          className={
                            "text-text-dim text-base transition-transform ml-2 " +
                            (expanded ? "rotate-90" : "")
                          }
                        >
                          ›
                        </span>
                      </button>

                      {expanded && (
                        <div className="flex flex-col gap-2 pl-4" role="list">
                          {g.items.map((ev, i) => (
                            <div
                              key={`${g.key}-${i}`}
                              role="listitem"
                              className="flex items-start gap-3 px-4 py-3 bg-surface-dark border border-border-dark rounded-md text-sm"
                            >
                              <span
                                aria-hidden="true"
                                className={"w-2 h-2 rounded-full mt-[6px] flex-shrink-0 " + g.dotClass}
                              />
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-text-main mb-[2px]">{ev.title}</div>
                                <div className="text-xs text-text-dim flex gap-3 flex-wrap">
                                  {ev.channel_name && <span>{ev.channel_name}</span>}
                                  {ev.subscriber_count != null && <span>{fmtNum(ev.subscriber_count)} subs</span>}
                                  {ev.view_count != null && <span>{fmtNum(ev.view_count)} views</span>}
                                  {ev.subreddit && <span>r/{ev.subreddit}</span>}
                                  {ev.score != null && <span>{fmtNum(ev.score)} upvotes</span>}
                                  {ev.num_comments != null && <span>{ev.num_comments} comments</span>}
                                  {ev.detail && !ev.channel_name && !ev.subreddit && <span>{ev.detail}</span>}
                                </div>
                              </div>
                              <span className="font-mono text-xs text-text-dim whitespace-nowrap flex-shrink-0">
                                Day {ev.day_index}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* COMMUNITY */}
          <section id="community" ref={setSectionRef("community")} className="mb-10 scroll-mt-20">
            <h2 className="text-lg font-bold mb-4 pb-2 border-b border-border-dark flex items-center gap-2">
              <span className="text-secondary text-base" aria-hidden="true">{"\u{1F465}"}</span>
              Community Signals
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              <article className="bg-surface-dark border border-border-dark rounded-lg p-5">
                <div className="flex items-center gap-2 mb-3">
                  <span aria-hidden="true" className="text-base">{"\u{1F4AC}"}</span>
                  <span className="text-xs text-text-dim uppercase tracking-wider font-semibold">
                    Reddit Mentions
                  </span>
                </div>
                <div className="font-mono text-xl font-semibold text-text-main mb-1">{redditCount}</div>
                <div className="text-xs text-text-dim leading-snug">
                  {redditCount === 0
                    ? "No Reddit posts tracked yet."
                    : `Posts across r/HorrorGaming, r/IndieGaming.${redditTopUpvotes > 0 ? ` Highest: ${fmtNum(redditTopUpvotes)} upvotes.` : ""}`}
                </div>
              </article>

              <article className="bg-surface-dark border border-border-dark rounded-lg p-5">
                <div className="flex items-center gap-2 mb-3">
                  <span aria-hidden="true" className="text-base">{"\u{1F4E2}"}</span>
                  <span className="text-xs text-text-dim uppercase tracking-wider font-semibold">
                    Steam Reviews
                  </span>
                </div>
                <div className="font-mono text-xl font-semibold text-text-main mb-1">
                  {latestSnapshot?.review_count != null ? fmtNum(latestSnapshot.review_count) : "—"}
                </div>
                <div className="text-xs text-text-dim leading-snug">
                  {latestSnapshot?.review_score_pct != null
                    ? `${Math.round(latestSnapshot.review_score_pct)}% positive — ${getSteamRating(latestSnapshot.review_score_pct)}.`
                    : "Sentiment data not yet available."}
                </div>
              </article>

              <article className="bg-surface-dark border border-border-dark rounded-lg p-5">
                <div className="flex items-center gap-2 mb-3">
                  <span aria-hidden="true" className="text-base">{"\u{1F3A5}"}</span>
                  <span className="text-xs text-text-dim uppercase tracking-wider font-semibold">
                    Twitch Streams
                  </span>
                </div>
                <div className="font-mono text-xl font-semibold text-text-main mb-1">
                  {latestTwitchStreams != null ? latestTwitchStreams : "—"}
                </div>
                <div className="text-xs text-text-dim leading-snug">
                  {peakTwitch > 0
                    ? `Peak viewers: ${fmtNum(peakTwitch)}${latestTwitchViewers != null ? ` · now ${fmtNum(latestTwitchViewers)}` : ""}.`
                    : "No Twitch activity tracked."}
                </div>
              </article>

              <article className="bg-surface-dark border border-border-dark rounded-lg p-5">
                <div className="flex items-center gap-2 mb-3">
                  <span aria-hidden="true" className="text-base">{"\u25B6"}</span>
                  <span className="text-xs text-text-dim uppercase tracking-wider font-semibold">
                    YouTube Reach
                  </span>
                </div>
                <div className="font-mono text-xl font-semibold text-text-main mb-1">
                  {data.videos.length > 0
                    ? fmtNum(data.videos.reduce((s, v) => s + (v.view_count ?? 0), 0))
                    : "—"}
                </div>
                <div className="text-xs text-text-dim leading-snug">
                  {data.videos.length > 0
                    ? `Cumulative views across ${uniqueChannels} creator${uniqueChannels === 1 ? "" : "s"}.`
                    : "No videos matched yet."}
                </div>
              </article>
            </div>
          </section>
        </main>
      </div>
    </>
  );
}
