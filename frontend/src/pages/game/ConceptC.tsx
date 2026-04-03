import { useState, useEffect, useRef, useMemo } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from "recharts";
import {
  HOLLOWFIELD,
  SNAPSHOTS,
  GHOST_SNAPSHOTS,
  EVENTS,
  PHASES,
  CREATOR_IMPACTS,
  EVENT_ICONS,
  EVENT_COLORS,
  EVENT_LABELS,
} from "./mockData";
import type { TimelineSnapshot, TimelineEvent, PhaseInfo } from "./mockData";

// ─── Chapter Configuration ─────────────────────────────────────────

interface ChapterConfig {
  phaseId: string;
  number: string;
  title: string;
  accent: string;
  series: { key: keyof TimelineSnapshot; label: string; color: string }[];
  statLabel: string;
  statKey: keyof TimelineSnapshot;
  statSuffix?: string;
}

const CHAPTERS: ChapterConfig[] = [
  {
    phaseId: "demo",
    number: "I",
    title: "The Demo",
    accent: "#a36aa5",
    series: [
      { key: "demo_review_count", label: "Demo Reviews", color: "#a36aa5" },
      { key: "peak_ccu", label: "Demo CCU", color: "#6d5dba" },
    ],
    statLabel: "Demo Reviews",
    statKey: "demo_review_count",
  },
  {
    phaseId: "launch_week",
    number: "II",
    title: "The Launch",
    accent: "#802626",
    series: [
      { key: "review_count", label: "Reviews", color: "#802626" },
      { key: "peak_ccu", label: "Peak CCU", color: "#802626" },
      { key: "ops_score", label: "OPS", color: "#802626" },
    ],
    statLabel: "Peak CCU",
    statKey: "peak_ccu",
  },
  {
    phaseId: "crisis",
    number: "III",
    title: "The Crisis",
    accent: "#bb7125",
    series: [
      { key: "review_score_pct", label: "Review Score %", color: "#bb7125" },
      { key: "peak_ccu", label: "CCU", color: "#ca8a04" },
    ],
    statLabel: "Review Score Low",
    statKey: "review_score_pct",
    statSuffix: "%",
  },
  {
    phaseId: "recovery",
    number: "IV",
    title: "The Recovery",
    accent: "#4ade80",
    series: [
      { key: "review_score_pct", label: "Review Score %", color: "#4ade80" },
      { key: "ops_score", label: "OPS", color: "#22c55e" },
    ],
    statLabel: "Score Recovered To",
    statKey: "review_score_pct",
    statSuffix: "%",
  },
  {
    phaseId: "breakout",
    number: "V",
    title: "The IGP Effect",
    accent: "#802626",
    series: [
      { key: "ops_score", label: "OPS", color: "#802626" },
      { key: "yt_cumulative_views", label: "YouTube Views", color: "#a36aa5" },
      { key: "review_count", label: "Reviews", color: "#e8e0d4" },
    ],
    statLabel: "Peak OPS",
    statKey: "ops_score",
  },
  {
    phaseId: "tail",
    number: "VI",
    title: "The Long Tail",
    accent: "#6b6058",
    series: [
      { key: "review_count", label: "Reviews", color: "#6b6058" },
      { key: "owners_estimate", label: "Owners", color: "#4ade80" },
    ],
    statLabel: "Total Owners",
    statKey: "owners_estimate",
  },
];

// ─── Helpers ───────────────────────────────────────────────────────

function formatNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(n >= 10_000 ? 0 : 1) + "K";
  return n.toLocaleString();
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function getPhaseSnapshots(phase: PhaseInfo): TimelineSnapshot[] {
  return SNAPSHOTS.filter(
    (s) => s.day_index >= phase.start_day && s.day_index <= phase.end_day
  );
}

function getPhaseEvents(phase: PhaseInfo): TimelineEvent[] {
  return EVENTS.filter(
    (e) => e.day_index >= phase.start_day && e.day_index <= phase.end_day
  );
}

function getChapterStat(snapshots: TimelineSnapshot[], chapter: ChapterConfig): string {
  if (snapshots.length === 0) return "—";
  const key = chapter.statKey;
  // For "low" stats like crisis review score, pick the min; otherwise pick the max
  let val: number;
  if (chapter.phaseId === "crisis" && key === "review_score_pct") {
    val = Math.min(...snapshots.map((s) => (s[key] as number) || 0));
  } else {
    val = Math.max(...snapshots.map((s) => (s[key] as number) || 0));
  }
  const suffix = chapter.statSuffix || "";
  return formatNum(val) + suffix;
}

// ─── Event Card Component ──────────────────────────────────────────

function EventCard({ event }: { event: TimelineEvent }) {
  const isYouTube = event.type === "youtube_demo" || event.type === "youtube_game";
  const icon = EVENT_ICONS[event.type];
  const color = EVENT_COLORS[event.type];
  const label = EVENT_LABELS[event.type];

  return (
    <div className="chapter-event-card" style={{ borderLeftColor: color }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: "16px" }}>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: "50%",
            background: color + "18",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color,
            fontSize: 18,
            flexShrink: 0,
          }}
        >
          {icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#666" }}>
              {formatDate(event.date)}
            </span>
            <span
              style={{
                fontSize: 10,
                padding: "2px 8px",
                borderRadius: 4,
                background: color + "18",
                color,
                fontFamily: "'JetBrains Mono', monospace",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              {label}
            </span>
          </div>
          <div
            style={{
              fontFamily: "'Instrument Serif', serif",
              fontSize: 18,
              color: "#e8e0d4",
              marginBottom: 6,
            }}
          >
            {event.title}
          </div>
          <div style={{ fontSize: 13, color: "#6b6058", lineHeight: 1.5 }}>
            {event.detail}
          </div>
          {isYouTube && event.channel_name && (
            <div
              style={{
                marginTop: 12,
                padding: "10px 14px",
                background: "#1a1a1c",
                borderRadius: 8,
                display: "flex",
                alignItems: "center",
                gap: 14,
              }}
            >
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 8,
                  background: "#1f1f22",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#a36aa5",
                  fontSize: 20,
                }}
              >
                ▶
              </div>
              <div>
                <div style={{ fontSize: 13, color: "#e8e0d4", fontWeight: 500 }}>
                  {event.channel_name}
                </div>
                <div style={{ fontSize: 11, color: "#666", fontFamily: "'JetBrains Mono', monospace" }}>
                  {formatNum(event.subscriber_count!)} subs · {formatNum(event.view_count!)} views
                </div>
              </div>
            </div>
          )}
          {event.type === "reddit" && (
            <div
              style={{
                marginTop: 10,
                fontSize: 12,
                color: "#bb7125",
                fontFamily: "'JetBrains Mono', monospace",
              }}
            >
              r/{event.subreddit} · {formatNum(event.score!)} pts · {event.num_comments} comments
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Chapter Chart Component ───────────────────────────────────────

function ChapterChart({
  data,
  chapter,
}: {
  data: TimelineSnapshot[];
  chapter: ChapterConfig;
}) {
  if (data.length === 0) return null;

  // For multi-axis, we use the first series as the area and the rest as lines
  const primarySeries = chapter.series[0];
  const secondarySeries = chapter.series.slice(1);

  return (
    <div style={{ width: "100%", height: 220 }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={`grad-${chapter.phaseId}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={primarySeries.color} stopOpacity={0.3} />
              <stop offset="100%" stopColor={primarySeries.color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#2a2420" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: "#555", fontFamily: "'JetBrains Mono', monospace" }}
            tickFormatter={(v: string) => {
              const d = new Date(v + "T00:00:00");
              return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
            }}
            stroke="#2a2420"
            interval="preserveStartEnd"
          />
          <YAxis
            yAxisId="left"
            tick={{ fontSize: 10, fill: "#555", fontFamily: "'JetBrains Mono', monospace" }}
            stroke="#2a2420"
            width={50}
            tickFormatter={(v: number) => formatNum(v)}
          />
          {secondarySeries.length > 0 && (
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fontSize: 10, fill: "#555", fontFamily: "'JetBrains Mono', monospace" }}
              stroke="#2a2420"
              width={50}
              tickFormatter={(v: number) => formatNum(v)}
            />
          )}
          <Tooltip
            contentStyle={{
              background: "#1f1f22",
              border: "1px solid #2a2420",
              borderRadius: 8,
              fontSize: 12,
              fontFamily: "'JetBrains Mono', monospace",
            }}
            labelFormatter={(v) => formatDate(String(v))}
            formatter={(value, name) => [formatNum(Math.round(Number(value))), String(name)]}
          />
          <Area
            yAxisId="left"
            type="monotone"
            dataKey={primarySeries.key as string}
            name={primarySeries.label}
            stroke={primarySeries.color}
            fill={`url(#grad-${chapter.phaseId})`}
            strokeWidth={2}
          />
          {secondarySeries.map((s, i) => (
            <Area
              key={s.key as string}
              yAxisId={i === 0 && secondarySeries.length > 0 ? "right" : "left"}
              type="monotone"
              dataKey={s.key as string}
              name={s.label}
              stroke={s.color}
              fill="transparent"
              strokeWidth={1.5}
              strokeDasharray={i > 0 ? "4 4" : undefined}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Creator Row Component ─────────────────────────────────────────

function CreatorRow({ creator }: { creator: (typeof CREATOR_IMPACTS)[0] }) {
  const reviewDelta = creator.reviews_after_7d - creator.reviews_before_7d;
  const ccuDelta = creator.ccu_after_7d - creator.ccu_before_7d;
  const maxReview = Math.max(creator.reviews_before_7d, creator.reviews_after_7d, 1);
  const maxCcu = Math.max(creator.ccu_before_7d, creator.ccu_after_7d, 1);

  return (
    <div className="creator-row">
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 4 }}>
          <span
            style={{
              fontFamily: "'Instrument Serif', serif",
              fontSize: 22,
              color: "#e8e0d4",
            }}
          >
            {creator.channel_name}
          </span>
          <span
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 11,
              color: "#666",
            }}
          >
            {formatNum(creator.subscriber_count)} subs
          </span>
          <span
            style={{
              fontSize: 10,
              padding: "2px 6px",
              borderRadius: 4,
              background: creator.covers === "demo" ? "#a36aa518" : "#80262618",
              color: creator.covers === "demo" ? "#a36aa5" : "#802626",
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            {creator.covers}
          </span>
        </div>
        <div style={{ fontSize: 14, color: "#999", marginBottom: 2 }}>
          {creator.video_title}
        </div>
        <div style={{ fontSize: 11, color: "#555", fontFamily: "'JetBrains Mono', monospace" }}>
          {formatDate(creator.upload_date)} · {formatNum(creator.view_count)} views
        </div>
      </div>

      {/* Impact bars */}
      <div style={{ display: "flex", gap: 24, alignItems: "center", flexShrink: 0 }}>
        {/* Reviews bar pair */}
        <div style={{ width: 100 }}>
          <div style={{ fontSize: 9, color: "#555", fontFamily: "'JetBrains Mono', monospace", marginBottom: 4, textTransform: "uppercase" }}>
            Reviews 7d
          </div>
          <div style={{ display: "flex", gap: 3, alignItems: "flex-end", height: 32 }}>
            <div
              style={{
                width: 20,
                height: Math.max(4, (creator.reviews_before_7d / maxReview) * 32),
                background: "#333",
                borderRadius: 2,
              }}
              title={`Before: ${creator.reviews_before_7d}`}
            />
            <div
              style={{
                width: 20,
                height: Math.max(4, (creator.reviews_after_7d / maxReview) * 32),
                background: reviewDelta > 0 ? "#4ade80" : "#802626",
                borderRadius: 2,
              }}
              title={`After: ${creator.reviews_after_7d}`}
            />
          </div>
          <div style={{ fontSize: 10, color: reviewDelta > 0 ? "#4ade80" : "#802626", fontFamily: "'JetBrains Mono', monospace", marginTop: 2 }}>
            {reviewDelta > 0 ? "+" : ""}{formatNum(reviewDelta)}
          </div>
        </div>

        {/* CCU bar pair */}
        <div style={{ width: 100 }}>
          <div style={{ fontSize: 9, color: "#555", fontFamily: "'JetBrains Mono', monospace", marginBottom: 4, textTransform: "uppercase" }}>
            CCU 7d
          </div>
          <div style={{ display: "flex", gap: 3, alignItems: "flex-end", height: 32 }}>
            <div
              style={{
                width: 20,
                height: Math.max(4, (creator.ccu_before_7d / maxCcu) * 32),
                background: "#333",
                borderRadius: 2,
              }}
              title={`Before: ${creator.ccu_before_7d}`}
            />
            <div
              style={{
                width: 20,
                height: Math.max(4, (creator.ccu_after_7d / maxCcu) * 32),
                background: ccuDelta > 0 ? "#4ade80" : "#802626",
                borderRadius: 2,
              }}
              title={`After: ${creator.ccu_after_7d}`}
            />
          </div>
          <div style={{ fontSize: 10, color: ccuDelta > 0 ? "#4ade80" : "#802626", fontFamily: "'JetBrains Mono', monospace", marginTop: 2 }}>
            {ccuDelta > 0 ? "+" : ""}{formatNum(ccuDelta)}
          </div>
        </div>

        {/* Impact score */}
        <div style={{ textAlign: "center", minWidth: 56 }}>
          <div style={{ fontSize: 9, color: "#555", fontFamily: "'JetBrains Mono', monospace", marginBottom: 4, textTransform: "uppercase" }}>
            Impact
          </div>
          <div
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 28,
              fontWeight: 700,
              color: creator.impact_score >= 70 ? "#802626" : creator.impact_score >= 40 ? "#bb7125" : "#888",
            }}
          >
            {creator.impact_score}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────

export default function ConceptC() {
  const [activeChapter, setActiveChapter] = useState(0);
  const [showGhost, setShowGhost] = useState(false);
  const [visibleSections, setVisibleSections] = useState<Set<string>>(new Set());

  const chapterRefs = useRef<(HTMLDivElement | null)[]>([]);
  const heroRef = useRef<HTMLDivElement | null>(null);
  const creatorsRef = useRef<HTMLDivElement | null>(null);
  const opsRef = useRef<HTMLDivElement | null>(null);
  const summaryRef = useRef<HTMLDivElement | null>(null);

  // Intersection Observer for fade-in animations
  useEffect(() => {
    const allRefs = [
      heroRef.current,
      ...chapterRefs.current,
      summaryRef.current,
      creatorsRef.current,
      opsRef.current,
    ].filter(Boolean) as HTMLDivElement[];

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const id = entry.target.getAttribute("data-section-id");
            if (id) {
              setVisibleSections((prev) => new Set(prev).add(id));
            }
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -60px 0px" }
    );

    allRefs.forEach((ref) => observer.observe(ref));
    return () => observer.disconnect();
  }, []);

  // Scroll-based active chapter tracking
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const idx = Number(entry.target.getAttribute("data-chapter-idx"));
            if (!isNaN(idx)) setActiveChapter(idx);
          }
        });
      },
      { threshold: 0.35 }
    );

    chapterRefs.current.filter(Boolean).forEach((ref) => observer.observe(ref!));
    return () => observer.disconnect();
  }, []);

  // Prepare chapter data
  const chapterData = useMemo(() => {
    return CHAPTERS.map((chapter) => {
      const phase = PHASES.find((p) => p.id === chapter.phaseId)!;
      const snapshots = getPhaseSnapshots(phase);
      const events = getPhaseEvents(phase);
      const stat = getChapterStat(snapshots, chapter);
      return { chapter, phase, snapshots, events, stat };
    });
  }, []);

  // Full OPS timeline for spotlight
  const opsTimeline = useMemo(() => {
    return SNAPSHOTS.filter((s) => s.ops_score !== null);
  }, []);

  const ghostOpsTimeline = useMemo(() => {
    return GHOST_SNAPSHOTS.filter((s) => s.ops_score !== null);
  }, []);

  // Merge real and ghost for OPS chart
  const opsChartData = useMemo(() => {
    return opsTimeline.map((s, i) => ({
      date: s.date,
      day_index: s.day_index,
      ops_score: s.ops_score,
      ghost_ops: ghostOpsTimeline[i]?.ops_score ?? null,
      phase: s.phase,
    }));
  }, [opsTimeline, ghostOpsTimeline]);

  // Latest snapshot for header stats
  const latest = SNAPSHOTS[SNAPSHOTS.length - 1];
  const peakOps = Math.max(...SNAPSHOTS.map((s) => s.ops_score ?? 0));

  // Reddit events for community voice
  const redditEvents = EVENTS.filter((e) => e.type === "reddit");

  // Sorted creators
  const sortedCreators = [...CREATOR_IMPACTS].sort((a, b) => b.impact_score - a.impact_score);

  const isVisible = (id: string) => visibleSections.has(id);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@400;500;700&display=swap');

        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(30px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .chapter-view {
          background: #111314;
          min-height: 100vh;
          color: #e8e0d4;
          position: relative;
        }

        .section-hidden {
          opacity: 0;
          transform: translateY(30px);
          transition: none;
        }

        .section-visible {
          animation: fadeInUp 0.7s ease-out forwards;
        }

        .chapter-nav {
          position: fixed;
          left: 16px;
          top: 50%;
          transform: translateY(-50%);
          z-index: 50;
          display: flex;
          flex-direction: column;
          gap: 12px;
          align-items: center;
        }

        .chapter-nav-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          border: 1.5px solid #333;
          background: transparent;
          cursor: pointer;
          transition: all 0.3s ease;
          position: relative;
        }

        .chapter-nav-dot.active {
          border-color: var(--dot-color);
          background: var(--dot-color);
          box-shadow: 0 0 8px var(--dot-color);
        }

        .chapter-nav-dot:hover::after {
          content: attr(data-label);
          position: absolute;
          left: 20px;
          top: 50%;
          transform: translateY(-50%);
          white-space: nowrap;
          font-family: 'JetBrains Mono', monospace;
          font-size: 10px;
          color: #888;
          background: #1f1f22;
          padding: 3px 8px;
          border-radius: 4px;
          border: 1px solid #2a2420;
        }

        .chapter-section {
          min-height: 60vh;
          padding: 80px 60px 80px 80px;
          border-bottom: 1px solid #111;
          position: relative;
        }

        .chapter-title-card {
          margin-bottom: 32px;
        }

        .chapter-number {
          font-family: 'JetBrains Mono', monospace;
          font-size: 12px;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          margin-bottom: 8px;
        }

        .chapter-title {
          font-family: 'Instrument Serif', serif;
          font-size: 42px;
          font-weight: 400;
          line-height: 1.1;
          margin: 0;
        }

        .chapter-narrative {
          font-family: 'Instrument Serif', serif;
          font-size: 18px;
          line-height: 1.7;
          color: #888;
          max-width: 680px;
          margin-bottom: 32px;
        }

        .chapter-event-card {
          background: #1f1f22;
          border: 1px solid #2a2420;
          border-left: 3px solid;
          border-radius: 8px;
          padding: 20px 24px;
          margin-bottom: 16px;
        }

        .chapter-stat-callout {
          margin-top: 32px;
          text-align: center;
        }

        .chapter-stat-label {
          font-family: 'JetBrains Mono', monospace;
          font-size: 11px;
          color: #555;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          margin-bottom: 6px;
        }

        .chapter-stat-value {
          font-family: 'JetBrains Mono', monospace;
          font-size: 48px;
          font-weight: 700;
        }

        .creator-row {
          display: flex;
          align-items: center;
          gap: 24px;
          padding: 20px 24px;
          background: #1a1a1c;
          border: 1px solid #2a2420;
          border-radius: 8px;
          margin-bottom: 12px;
        }

        .summary-strip {
          display: flex;
          gap: 2px;
          width: 100%;
        }

        .summary-cell {
          flex: 1;
          padding: 20px 16px;
          text-align: center;
          border-radius: 6px;
          background: #1a1a1c;
          border: 1px solid #2a2420;
        }

        .ops-ghost-toggle {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 6px 14px;
          border-radius: 6px;
          border: 1px solid #2a2420;
          background: transparent;
          color: #888;
          font-family: 'JetBrains Mono', monospace;
          font-size: 12px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .ops-ghost-toggle:hover {
          border-color: #333;
          color: #ccc;
        }

        .ops-ghost-toggle.active {
          border-color: #ffffff30;
          background: #ffffff08;
          color: #e8e0d4;
        }

        @media (max-width: 768px) {
          .chapter-section {
            padding: 40px 20px 40px 20px;
          }
          .chapter-nav {
            display: none;
          }
          .chapter-title {
            font-size: 28px;
          }
          .creator-row {
            flex-direction: column;
            align-items: flex-start;
          }
        }
      `}</style>

      <div className="chapter-view">
        {/* ── Fixed Chapter Navigator ── */}
        <nav className="chapter-nav">
          {CHAPTERS.map((ch, i) => (
            <div
              key={ch.phaseId}
              className={`chapter-nav-dot ${activeChapter === i ? "active" : ""}`}
              style={{ "--dot-color": ch.accent } as React.CSSProperties}
              data-label={`${ch.number}. ${ch.title}`}
              onClick={() => {
                chapterRefs.current[i]?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
            />
          ))}
        </nav>

        {/* ── Element 1: Game Identity Header ── */}
        <div
          ref={heroRef}
          data-section-id="hero"
          className={isVisible("hero") ? "section-visible" : "section-hidden"}
          style={{
            padding: "100px 80px 80px 80px",
            borderBottom: "1px solid #111",
            textAlign: "center",
          }}
        >
          <div style={{ marginBottom: 16 }}>
            <div
              style={{
                display: "inline-flex",
                gap: 8,
                marginBottom: 16,
              }}
            >
              {HOLLOWFIELD.tags.slice(0, 4).map((tag) => (
                <span
                  key={tag}
                  style={{
                    fontSize: 10,
                    padding: "3px 10px",
                    borderRadius: 4,
                    border: "1px solid #2a2420",
                    color: "#666",
                    fontFamily: "'JetBrains Mono', monospace",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>

          <h1
            style={{
              fontFamily: "'Instrument Serif', serif",
              fontSize: 64,
              fontWeight: 400,
              margin: "0 0 8px 0",
              color: "#e8e0d4",
            }}
          >
            {HOLLOWFIELD.title}
          </h1>
          <div
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 13,
              color: "#555",
              marginBottom: 32,
            }}
          >
            {HOLLOWFIELD.developer} · ${HOLLOWFIELD.price}
          </div>

          {/* Stats strip */}
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              gap: 40,
              marginBottom: 40,
            }}
          >
            {[
              { label: "Reviews", value: formatNum(HOLLOWFIELD.total_reviews) },
              { label: "Score", value: HOLLOWFIELD.review_score_pct + "%" },
              { label: "Peak CCU", value: formatNum(HOLLOWFIELD.peak_ccu_ever) },
              { label: "Owners", value: formatNum(HOLLOWFIELD.owners_estimate) },
              { label: "OPS", value: String(HOLLOWFIELD.current_ops) },
            ].map((stat) => (
              <div key={stat.label} style={{ textAlign: "center" }}>
                <div
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 10,
                    color: "#555",
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    marginBottom: 4,
                  }}
                >
                  {stat.label}
                </div>
                <div
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 22,
                    fontWeight: 700,
                    color: "#e8e0d4",
                  }}
                >
                  {stat.value}
                </div>
              </div>
            ))}
          </div>

          {/* Story sentence as pull quote */}
          <blockquote
            style={{
              fontFamily: "'Instrument Serif', serif",
              fontSize: 22,
              fontStyle: "italic",
              color: "#6b6058",
              maxWidth: 700,
              margin: "0 auto",
              lineHeight: 1.6,
              borderLeft: "3px solid #802626",
              paddingLeft: 24,
              textAlign: "left",
            }}
          >
            {HOLLOWFIELD.story_sentence}
          </blockquote>
        </div>

        {/* ── Element 2: Chapters ── */}
        {chapterData.map(({ chapter, phase, snapshots, events, stat }, idx) => (
          <div
            key={chapter.phaseId}
            ref={(el) => { chapterRefs.current[idx] = el; }}
            data-section-id={`chapter-${chapter.phaseId}`}
            data-chapter-idx={idx}
            className={`chapter-section ${
              isVisible(`chapter-${chapter.phaseId}`) ? "section-visible" : "section-hidden"
            }`}
          >
            {/* Title card */}
            <div className="chapter-title-card">
              <div className="chapter-number" style={{ color: chapter.accent }}>
                Chapter {chapter.number}
              </div>
              <h2 className="chapter-title" style={{ color: chapter.accent }}>
                {chapter.title}
              </h2>
              <div
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 11,
                  color: "#444",
                  marginTop: 8,
                }}
              >
                {formatDate(phase.start_date)} — {formatDate(phase.end_date)} ·{" "}
                {phase.duration_days} days
              </div>
            </div>

            {/* Narrative paragraph */}
            <p className="chapter-narrative">{phase.insight}</p>

            {/* Event cards */}
            {events.length > 0 && (
              <div style={{ marginBottom: 32 }}>
                {events.map((event, i) => (
                  <EventCard key={`${event.date}-${i}`} event={event} />
                ))}
              </div>
            )}

            {/* Focused chart */}
            <div
              style={{
                background: "#1a1a1c",
                borderRadius: 10,
                border: "1px solid #2a2420",
                padding: "16px 16px 8px 8px",
                marginBottom: 24,
              }}
            >
              <div
                style={{
                  display: "flex",
                  gap: 16,
                  padding: "0 8px 8px 8px",
                }}
              >
                {chapter.series.map((s) => (
                  <div
                    key={s.key as string}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: 10,
                      fontFamily: "'JetBrains Mono', monospace",
                      color: "#666",
                    }}
                  >
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: s.color,
                        display: "inline-block",
                      }}
                    />
                    {s.label}
                  </div>
                ))}
              </div>
              <ChapterChart data={snapshots} chapter={chapter} />
            </div>

            {/* Summary stat callout */}
            <div className="chapter-stat-callout">
              <div className="chapter-stat-label">{chapter.statLabel}</div>
              <div className="chapter-stat-value" style={{ color: chapter.accent }}>
                {stat}
              </div>
            </div>
          </div>
        ))}

        {/* ── Element 3: Phase Summary Strip ── */}
        <div
          ref={summaryRef}
          data-section-id="summary"
          className={`chapter-section ${isVisible("summary") ? "section-visible" : "section-hidden"}`}
          style={{ minHeight: "auto", paddingTop: 60, paddingBottom: 60 }}
        >
          <div style={{ textAlign: "center", marginBottom: 32 }}>
            <div
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 11,
                color: "#555",
                textTransform: "uppercase",
                letterSpacing: "0.15em",
                marginBottom: 8,
              }}
            >
              The Full Arc
            </div>
            <h2
              style={{
                fontFamily: "'Instrument Serif', serif",
                fontSize: 32,
                fontWeight: 400,
                color: "#e8e0d4",
                margin: 0,
              }}
            >
              Six Chapters, One Story
            </h2>
          </div>

          <div className="summary-strip">
            {chapterData.map(({ chapter, phase, stat }) => (
              <div key={chapter.phaseId} className="summary-cell">
                <div
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 10,
                    color: chapter.accent,
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    marginBottom: 8,
                  }}
                >
                  {chapter.number}
                </div>
                <div
                  style={{
                    fontFamily: "'Instrument Serif', serif",
                    fontSize: 16,
                    color: "#e8e0d4",
                    marginBottom: 4,
                  }}
                >
                  {chapter.title}
                </div>
                <div
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 10,
                    color: "#555",
                    marginBottom: 8,
                  }}
                >
                  {phase.duration_days}d
                </div>
                <div
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 22,
                    fontWeight: 700,
                    color: chapter.accent,
                  }}
                >
                  {stat}
                </div>
                <div
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 9,
                    color: "#444",
                    marginTop: 4,
                  }}
                >
                  {chapter.statLabel}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Element 4: Creator Impact Panel ── */}
        <div
          ref={creatorsRef}
          data-section-id="creators"
          className={`chapter-section ${isVisible("creators") ? "section-visible" : "section-hidden"}`}
        >
          <div style={{ textAlign: "center", marginBottom: 40 }}>
            <div
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 11,
                color: "#555",
                textTransform: "uppercase",
                letterSpacing: "0.15em",
                marginBottom: 8,
              }}
            >
              Creator Analysis
            </div>
            <h2
              style={{
                fontFamily: "'Instrument Serif', serif",
                fontSize: 32,
                fontWeight: 400,
                color: "#e8e0d4",
                margin: 0,
              }}
            >
              The Creators Who Shaped This Story
            </h2>
          </div>

          {sortedCreators.map((creator) => (
            <CreatorRow key={creator.channel_name} creator={creator} />
          ))}

          {/* Community Voice subsection */}
          {redditEvents.length > 0 && (
            <div style={{ marginTop: 48 }}>
              <h3
                style={{
                  fontFamily: "'Instrument Serif', serif",
                  fontSize: 24,
                  fontWeight: 400,
                  color: "#bb7125",
                  marginBottom: 20,
                }}
              >
                Community Voice
              </h3>
              {redditEvents.map((event, i) => (
                <EventCard key={`reddit-${i}`} event={event} />
              ))}
            </div>
          )}
        </div>

        {/* ── Element 5: OPS Score Spotlight ── */}
        <div
          ref={opsRef}
          data-section-id="ops-spotlight"
          className={`chapter-section ${isVisible("ops-spotlight") ? "section-visible" : "section-hidden"}`}
        >
          <div style={{ textAlign: "center", marginBottom: 40 }}>
            <div
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 11,
                color: "#555",
                textTransform: "uppercase",
                letterSpacing: "0.15em",
                marginBottom: 8,
              }}
            >
              Epilogue
            </div>
            <h2
              style={{
                fontFamily: "'Instrument Serif', serif",
                fontSize: 32,
                fontWeight: 400,
                color: "#e8e0d4",
                margin: "0 0 16px 0",
              }}
            >
              The Pulse
            </h2>

            {/* Element 6: Ghost toggle */}
            <button
              className={`ops-ghost-toggle ${showGhost ? "active" : ""}`}
              onClick={() => setShowGhost((v) => !v)}
            >
              <span style={{ fontSize: 14 }}>{showGhost ? "◉" : "○"}</span>
              Compare to median
            </button>
          </div>

          {/* Full OPS timeline chart */}
          <div
            style={{
              background: "#1a1a1c",
              borderRadius: 10,
              border: "1px solid #2a2420",
              padding: "16px 16px 8px 8px",
              marginBottom: 32,
            }}
          >
            <div style={{ width: "100%", height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={opsChartData}
                  margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="ops-full-grad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#802626" stopOpacity={0.25} />
                      <stop offset="100%" stopColor="#802626" stopOpacity={0.02} />
                    </linearGradient>
                    {/* Phase band backgrounds */}
                    {CHAPTERS.map((ch) => (
                      <linearGradient key={`band-${ch.phaseId}`} id={`band-${ch.phaseId}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={ch.accent} stopOpacity={0.06} />
                        <stop offset="100%" stopColor={ch.accent} stopOpacity={0.01} />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2a2420" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10, fill: "#555", fontFamily: "'JetBrains Mono', monospace" }}
                    tickFormatter={(v: string) => {
                      const d = new Date(v + "T00:00:00");
                      return d.toLocaleDateString("en-US", { month: "short" });
                    }}
                    stroke="#2a2420"
                    interval={29}
                  />
                  <YAxis
                    domain={[0, 100]}
                    tick={{ fontSize: 10, fill: "#555", fontFamily: "'JetBrains Mono', monospace" }}
                    stroke="#2a2420"
                    width={40}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "#1f1f22",
                      border: "1px solid #2a2420",
                      borderRadius: 8,
                      fontSize: 12,
                      fontFamily: "'JetBrains Mono', monospace",
                    }}
                    labelFormatter={(v) => formatDate(String(v))}
                    formatter={(value, name) => [
                      value !== null ? Math.round(Number(value)) : "—",
                      String(name),
                    ]}
                  />
                  <ReferenceLine
                    y={peakOps}
                    stroke="#802626"
                    strokeDasharray="3 3"
                    strokeOpacity={0.4}
                    label={{
                      value: `Peak: ${peakOps}`,
                      position: "right",
                      fill: "#802626",
                      fontSize: 10,
                      fontFamily: "'JetBrains Mono', monospace",
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="ops_score"
                    name="OPS Score"
                    stroke="#802626"
                    fill="url(#ops-full-grad)"
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                  />
                  {showGhost && (
                    <Line
                      type="monotone"
                      dataKey="ghost_ops"
                      name="Median Psych Horror"
                      stroke="#ffffff"
                      strokeWidth={1}
                      strokeDasharray="6 4"
                      strokeOpacity={0.25}
                      dot={false}
                      connectNulls
                    />
                  )}
                </AreaChart>
              </ResponsiveContainer>
            </div>
            {showGhost && (
              <div
                style={{
                  textAlign: "right",
                  padding: "8px 16px 4px",
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 10,
                  color: "#555",
                }}
              >
                <span
                  style={{
                    display: "inline-block",
                    width: 20,
                    height: 1,
                    borderTop: "2px dashed #ffffff40",
                    verticalAlign: "middle",
                    marginRight: 6,
                  }}
                />
                Median Psych Horror, $7-12
              </div>
            )}
          </div>

          {/* Current OPS + components */}
          <div
            style={{
              display: "flex",
              gap: 32,
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            <div style={{ textAlign: "center" }}>
              <div
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 10,
                  color: "#555",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  marginBottom: 6,
                }}
              >
                Current OPS
              </div>
              <div
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 56,
                  fontWeight: 700,
                  color:
                    HOLLOWFIELD.current_ops >= 60
                      ? "#4ade80"
                      : HOLLOWFIELD.current_ops >= 30
                      ? "#bb7125"
                      : "#802626",
                }}
              >
                {HOLLOWFIELD.current_ops}
              </div>
              <div
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 11,
                  color: "#555",
                  textTransform: "uppercase",
                }}
              >
                {HOLLOWFIELD.ops_confidence} confidence
              </div>
            </div>

            {/* Component breakdown */}
            {[
              { label: "Review", value: latest.review_component, color: "#e8e0d4" },
              { label: "Velocity", value: latest.velocity_component, color: "#bb7125" },
              { label: "CCU", value: latest.ccu_component, color: "#802626" },
              { label: "YouTube", value: latest.youtube_component, color: "#a36aa5" },
            ].map((comp) => (
              <div key={comp.label} style={{ textAlign: "center", minWidth: 70 }}>
                <div
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 10,
                    color: "#555",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    marginBottom: 6,
                  }}
                >
                  {comp.label}
                </div>
                <div
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 24,
                    fontWeight: 700,
                    color: comp.color,
                  }}
                >
                  {comp.value !== null ? (comp.value * 100).toFixed(0) : "—"}
                </div>
                {/* Mini bar */}
                <div
                  style={{
                    width: 50,
                    height: 3,
                    background: "#2a2420",
                    borderRadius: 2,
                    margin: "6px auto 0",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${(comp.value ?? 0) * 100}%`,
                      height: "100%",
                      background: comp.color,
                      borderRadius: 2,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Momentum indicator */}
          <div style={{ textAlign: "center", marginTop: 32 }}>
            {(() => {
              const recent = SNAPSHOTS.slice(-7);
              const weekAgo = recent[0]?.ops_score ?? 0;
              const now = recent[recent.length - 1]?.ops_score ?? 0;
              const delta = (now ?? 0) - (weekAgo ?? 0);
              const isUp = delta > 0;
              return (
                <div
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 13,
                    color: isUp ? "#4ade80" : delta < 0 ? "#802626" : "#555",
                  }}
                >
                  {isUp ? "▲" : delta < 0 ? "▼" : "—"} {Math.abs(delta)} pts 7-day momentum
                </div>
              );
            })()}
          </div>
        </div>

        {/* ── Footer ── */}
        <div
          style={{
            padding: "40px 80px",
            textAlign: "center",
            borderTop: "1px solid #111",
          }}
        >
          <div
            style={{
              fontFamily: "'Instrument Serif', serif",
              fontSize: 18,
              fontStyle: "italic",
              color: "#444",
            }}
          >
            End of file.
          </div>
          <div
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 10,
              color: "#333",
              marginTop: 8,
            }}
          >
            HORROR RADAR · CHAPTER VIEW · {HOLLOWFIELD.title.toUpperCase()}
          </div>
        </div>
      </div>
    </>
  );
}
