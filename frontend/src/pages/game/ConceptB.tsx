import { useState, useMemo } from "react";
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
  ReferenceDot,
} from "recharts";
import {
  HOLLOWFIELD,
  SNAPSHOTS,
  GHOST_SNAPSHOTS,
  EVENTS,
  PHASES,
  CREATOR_IMPACTS,
  EVENT_COLORS,
  EVENT_LABELS,
  SERIES_COLORS,
  type TimelineEvent,
  type CreatorImpact,
} from "./mockData";

// ─── Style Injection ───────────────────────────────────────────────

const STYLES = `
@keyframes ping-ring {
  0% { transform: scale(1); opacity: 0.8; }
  100% { transform: scale(2.5); opacity: 0; }
}
@keyframes fade-in-up {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
.scanline-overlay {
  pointer-events: none;
  position: absolute;
  inset: 0;
  background: repeating-linear-gradient(
    0deg,
    transparent,
    transparent 2px,
    rgba(255,255,255,0.015) 2px,
    rgba(255,255,255,0.015) 4px
  );
  z-index: 1;
}
.signal-trace-tooltip {
  font-family: 'IBM Plex Mono', monospace;
  background: #0f0f11;
  border: 1px solid rgba(255,255,255,0.12);
  padding: 10px 14px;
  font-size: 12px;
  color: #e2e2e2;
  border-radius: 4px;
}
.signal-trace-tooltip .tt-date {
  color: rgba(255,255,255,0.4);
  margin-bottom: 6px;
}
.signal-trace-tooltip .tt-row {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  line-height: 1.6;
}
.intercept-card {
  font-family: 'IBM Plex Mono', monospace;
  background: #0f0f11;
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 4px;
  padding: 12px 14px;
  font-size: 12px;
  color: #d4d4d4;
  max-width: 320px;
  animation: fade-in-up 0.2s ease-out;
}
.intercept-card .ic-title {
  font-weight: 600;
  color: #fff;
  margin-bottom: 4px;
}
.intercept-card .ic-detail {
  color: rgba(255,255,255,0.55);
  line-height: 1.5;
}
.intercept-card .ic-meta {
  margin-top: 6px;
  color: rgba(255,255,255,0.35);
  font-size: 11px;
}
`;

// ─── Constants ─────────────────────────────────────────────────────

const FONT_MONO = "'IBM Plex Mono', monospace";
const FONT_SERIF = "'Instrument Serif', serif";

type ZoomPreset = "all" | "90d" | "30d" | "launch";
type SeriesKey = "ops" | "reviews" | "yt_views" | "peak_ccu" | "twitch";

const SERIES_CONFIG: Record<SeriesKey, { label: string; color: string; dataKey: string }> = {
  ops: { label: "OPS Score", color: SERIES_COLORS.ops, dataKey: "ops_score" },
  reviews: { label: "Reviews", color: SERIES_COLORS.reviews, dataKey: "review_count" },
  yt_views: { label: "YouTube Views", color: SERIES_COLORS.yt_views, dataKey: "yt_cumulative_views" },
  peak_ccu: { label: "Peak CCU", color: SERIES_COLORS.peak_ccu, dataKey: "peak_ccu" },
  twitch: { label: "Twitch Viewers", color: SERIES_COLORS.twitch, dataKey: "twitch_viewers" },
};

const DEFAULT_SERIES: SeriesKey[] = ["ops", "reviews", "yt_views"];

const ZOOM_RANGES: Record<ZoomPreset, { label: string; startDay: number; endDay: number }> = {
  all: { label: "All Time", startDay: 0, endDay: 243 },
  "90d": { label: "Last 90d", startDay: 243 - 90, endDay: 243 },
  "30d": { label: "Last 30d", startDay: 243 - 30, endDay: 243 },
  launch: { label: "Launch Week", startDay: 88, endDay: 104 },
};

const EVENT_SHAPES: Record<string, string> = {
  youtube_demo: "\u25CF",
  youtube_game: "\u25CF",
  reddit: "\u25C6",
  steam_update: "\u25A0",
  demo_launch: "\u2605",
  game_launch: "\u2605",
};

const PHASE_EMOJI: Record<string, string> = {
  demo: "\uD83C\uDFAE",
  launch_week: "\uD83D\uDE80",
  crisis: "\u26A0\uFE0F",
  recovery: "\uD83D\uDEE0\uFE0F",
  breakout: "\uD83D\uDCA5",
  tail: "\uD83C\uDF19",
};

// ─── Helpers ───────────────────────────────────────────────────────

function fmtNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(n >= 10_000 ? 0 : 1) + "K";
  return n.toLocaleString();
}

function fmtDate(d: string): string {
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function todayDayIndex(): number {
  return 243; // mock "today"
}

// ─── Custom Event Dot ──────────────────────────────────────────────

interface EventDotProps {
  cx?: number;
  cy?: number;
  event: TimelineEvent;
  index: number;
  isSelected: boolean;
  onClick: (e: TimelineEvent) => void;
}

function EventDot({ cx, cy, event, index, isSelected, onClick }: EventDotProps) {
  if (cx === undefined || cy === undefined) return null;
  const color = EVENT_COLORS[event.type];
  const r = isSelected ? 8 : 6;
  return (
    <g
      style={{ cursor: "pointer" }}
      onClick={(e) => { e.stopPropagation(); onClick(event); }}
    >
      {/* Ping ring */}
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        style={{
          animation: `ping-ring 1.8s ease-out ${index * 0.3}s`,
          animationFillMode: "forwards",
          transformOrigin: `${cx}px ${cy}px`,
        }}
      />
      {/* Solid dot */}
      <circle cx={cx} cy={cy} r={r} fill={color} fillOpacity={0.9} stroke="#080809" strokeWidth={1.5} />
      {/* Shape glyph */}
      <text
        x={cx}
        y={cy + 1}
        textAnchor="middle"
        dominantBaseline="central"
        fill="#080809"
        fontSize={r < 7 ? 7 : 9}
        fontFamily={FONT_MONO}
      >
        {EVENT_SHAPES[event.type]}
      </text>
      {/* Selected glow */}
      {isSelected && (
        <circle cx={cx} cy={cy} r={12} fill="none" stroke={color} strokeWidth={1} opacity={0.5} />
      )}
    </g>
  );
}

// ─── Custom Tooltip ────────────────────────────────────────────────

interface ChartTooltipProps {
  active?: boolean;
  payload?: { dataKey: string; value: number; color: string; name: string }[];
  label?: number;
  activeSeries: SeriesKey[];
  ghostOn: boolean;
}

function ChartTooltip({ active, payload, label, activeSeries, ghostOn }: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const snap = SNAPSHOTS.find((s) => s.day_index === label);
  if (!snap) return null;
  return (
    <div className="signal-trace-tooltip">
      <div className="tt-date">{snap.date} &mdash; Day {snap.day_index}</div>
      {activeSeries.map((k) => {
        const cfg = SERIES_CONFIG[k];
        const val = (snap as unknown as Record<string, unknown>)[cfg.dataKey];
        if (val === null || val === undefined) return null;
        return (
          <div className="tt-row" key={k}>
            <span style={{ color: cfg.color }}>{cfg.label}</span>
            <span style={{ color: "#fff" }}>
              {k === "yt_views" ? fmtNum(val as number) : (val as number).toLocaleString()}
              {k === "ops" ? "/100" : ""}
            </span>
          </div>
        );
      })}
      {ghostOn && (
        <div className="tt-row">
          <span style={{ color: "rgba(255,255,255,0.25)" }}>Median OPS</span>
          <span style={{ color: "rgba(255,255,255,0.35)" }}>
            {GHOST_SNAPSHOTS.find((g) => g.day_index === label)?.ops_score ?? "—"}
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Intercept Card (event detail popup) ───────────────────────────

function InterceptCard({ event, onClose }: { event: TimelineEvent; onClose: () => void }) {
  const color = EVENT_COLORS[event.type];
  return (
    <div
      className="intercept-card"
      style={{ borderLeft: `3px solid ${color}`, position: "relative" }}
    >
      <button
        onClick={onClose}
        style={{
          position: "absolute",
          top: 6,
          right: 8,
          background: "none",
          border: "none",
          color: "rgba(255,255,255,0.3)",
          cursor: "pointer",
          fontFamily: FONT_MONO,
          fontSize: 14,
        }}
      >
        x
      </button>
      <div style={{ color, fontSize: 10, letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>
        {EVENT_LABELS[event.type]}
      </div>
      <div className="ic-title">{event.title}</div>
      <div className="ic-detail">{event.detail}</div>
      <div className="ic-meta">
        {fmtDate(event.date)} &middot; Day {event.day_index}
        {event.channel_name && ` \u00b7 ${event.channel_name} (${fmtNum(event.subscriber_count!)} subs)`}
        {event.view_count && ` \u00b7 ${fmtNum(event.view_count)} views`}
        {event.subreddit && ` \u00b7 r/${event.subreddit} \u00b7 ${event.score} pts`}
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────

export default function SignalTrace() {
  const [zoom, setZoom] = useState<ZoomPreset>("all");
  const [activeSeries, setActiveSeries] = useState<SeriesKey[]>(DEFAULT_SERIES);
  const [selectedEvent, setSelectedEvent] = useState<TimelineEvent | null>(null);
  const [ghostOn, setGhostOn] = useState(false);

  const range = ZOOM_RANGES[zoom];

  const filteredSnaps = useMemo(
    () => SNAPSHOTS.filter((s) => s.day_index >= range.startDay && s.day_index <= range.endDay),
    [range.startDay, range.endDay],
  );

  const filteredGhost = useMemo(
    () => GHOST_SNAPSHOTS.filter((s) => s.day_index >= range.startDay && s.day_index <= range.endDay),
    [range.startDay, range.endDay],
  );

  const visibleEvents = useMemo(
    () => EVENTS.filter((e) => e.day_index >= range.startDay && e.day_index <= range.endDay),
    [range.startDay, range.endDay],
  );

  const visiblePhases = useMemo(
    () => PHASES.filter((p) => p.end_day >= range.startDay && p.start_day <= range.endDay),
    [range.startDay, range.endDay],
  );

  // Merge ghost OPS into filtered snaps for ghost line
  const chartData = useMemo(() => {
    if (!ghostOn) return filteredSnaps;
    return filteredSnaps.map((s, i) => ({
      ...s,
      ghost_ops: filteredGhost[i]?.ops_score ?? null,
    }));
  }, [filteredSnaps, filteredGhost, ghostOn]);

  // Determine if only OPS is visible (lock y to 0-100)
  const opsOnly = activeSeries.length === 1 && activeSeries[0] === "ops";

  // Find OPS peak for spotlight
  const opsPeak = useMemo(() => {
    let best = SNAPSHOTS[0];
    for (const s of SNAPSHOTS) {
      if ((s.ops_score ?? 0) > (best.ops_score ?? 0)) best = s;
    }
    return best;
  }, []);

  const latestSnap = SNAPSHOTS[SNAPSHOTS.length - 1];
  const latestOps = latestSnap.ops_score ?? 0;

  const toggleSeries = (k: SeriesKey) => {
    setActiveSeries((prev) =>
      prev.includes(k) ? prev.filter((s) => s !== k) : [...prev, k],
    );
  };

  // OPS component breakdown from latest snapshot
  const components = [
    { label: "Review", value: latestSnap.review_component ?? 0, color: SERIES_COLORS.reviews },
    { label: "Velocity", value: latestSnap.velocity_component ?? 0, color: "#facc15" },
    { label: "CCU", value: latestSnap.ccu_component ?? 0, color: SERIES_COLORS.peak_ccu },
    { label: "YouTube", value: latestSnap.youtube_component ?? 0, color: SERIES_COLORS.yt_views },
  ];

  // Find peak phase for peak label
  const peakPhase = PHASES.find(
    (p) => opsPeak.day_index >= p.start_day && opsPeak.day_index <= p.end_day,
  );

  // Current phase
  const today = todayDayIndex();
  const currentPhase = PHASES.find((p) => today >= p.start_day && today <= p.end_day);

  // Sort creators by impact
  const sortedCreators = [...CREATOR_IMPACTS].sort((a, b) => b.impact_score - a.impact_score);

  // Reddit events for creator panel
  const redditEvents = EVENTS.filter((e) => e.type === "reddit");

  return (
    <>
      <style>{STYLES}</style>
      <div style={{ background: "#080809", minHeight: "100vh", color: "#e2e2e2", padding: "0 0 48px" }}>

        {/* ═══════ Element 1: Game Identity Header ═══════ */}
        <header
          style={{
            position: "relative",
            padding: "32px 40px 24px",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <div className="scanline-overlay" />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", position: "relative", zIndex: 2 }}>
            {/* Left block */}
            <div>
              <h1 style={{ fontFamily: FONT_SERIF, fontSize: 36, fontWeight: 400, margin: 0, color: "#fff", lineHeight: 1.1 }}>
                {HOLLOWFIELD.title}
              </h1>
              <div style={{ fontFamily: FONT_MONO, fontSize: 13, color: "rgba(255,255,255,0.35)", marginTop: 6 }}>
                {HOLLOWFIELD.developer}
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                {HOLLOWFIELD.tags.slice(0, 5).map((t) => (
                  <span
                    key={t}
                    style={{
                      fontFamily: FONT_MONO,
                      fontSize: 10,
                      padding: "2px 8px",
                      border: "1px solid rgba(255,255,255,0.12)",
                      borderRadius: 3,
                      color: "rgba(255,255,255,0.45)",
                      letterSpacing: 0.5,
                    }}
                  >
                    {t}
                  </span>
                ))}
              </div>
              <p style={{ fontFamily: FONT_SERIF, fontSize: 15, color: "rgba(255,255,255,0.4)", fontStyle: "italic", marginTop: 12, maxWidth: 560 }}>
                {HOLLOWFIELD.story_sentence}
              </p>
            </div>
            {/* Right stat block */}
            <div style={{ display: "flex", gap: 28, fontFamily: FONT_MONO, fontSize: 12, textAlign: "center" }}>
              {[
                { label: "Owners", value: fmtNum(HOLLOWFIELD.owners_estimate) },
                { label: "Peak CCU", value: HOLLOWFIELD.peak_ccu_ever.toLocaleString() },
                { label: "Reviews", value: HOLLOWFIELD.total_reviews.toLocaleString() },
                { label: "Score", value: HOLLOWFIELD.review_score_pct + "%" },
                { label: "OPS", value: String(HOLLOWFIELD.current_ops) },
              ].map(({ label, value }) => (
                <div key={label}>
                  <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>
                    {label}
                  </div>
                  <div style={{ color: label === "OPS" ? SERIES_COLORS.ops : "#fff", fontSize: 20, fontWeight: 600 }}>
                    {value}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </header>

        {/* ═══════ Element 2: Master Timeline ═══════ */}
        <section style={{ padding: "24px 40px 0" }}>
          {/* Controls row */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
            {/* Zoom presets */}
            <div style={{ display: "flex", gap: 6 }}>
              {(Object.keys(ZOOM_RANGES) as ZoomPreset[]).map((k) => (
                <button
                  key={k}
                  onClick={() => setZoom(k)}
                  style={{
                    fontFamily: FONT_MONO,
                    fontSize: 11,
                    padding: "5px 14px",
                    borderRadius: 3,
                    border: zoom === k ? "1px solid rgba(239,68,68,0.6)" : "1px solid rgba(255,255,255,0.1)",
                    background: zoom === k ? "rgba(239,68,68,0.12)" : "transparent",
                    color: zoom === k ? "#ef4444" : "rgba(255,255,255,0.45)",
                    cursor: "pointer",
                    transition: "all 0.15s",
                  }}
                >
                  {ZOOM_RANGES[k].label}
                </button>
              ))}
            </div>
            {/* Series toggles + Ghost */}
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {(Object.keys(SERIES_CONFIG) as SeriesKey[]).map((k) => {
                const on = activeSeries.includes(k);
                const cfg = SERIES_CONFIG[k];
                return (
                  <button
                    key={k}
                    onClick={() => toggleSeries(k)}
                    style={{
                      fontFamily: FONT_MONO,
                      fontSize: 11,
                      padding: "4px 12px",
                      borderRadius: 12,
                      border: `1px solid ${on ? cfg.color : "rgba(255,255,255,0.1)"}`,
                      background: on ? cfg.color + "18" : "transparent",
                      color: on ? cfg.color : "rgba(255,255,255,0.3)",
                      cursor: "pointer",
                      transition: "all 0.15s",
                    }}
                  >
                    {cfg.label}
                  </button>
                );
              })}
              <div style={{ width: 1, height: 20, background: "rgba(255,255,255,0.08)", margin: "0 4px" }} />
              <button
                onClick={() => setGhostOn(!ghostOn)}
                style={{
                  fontFamily: FONT_MONO,
                  fontSize: 11,
                  padding: "4px 12px",
                  borderRadius: 12,
                  border: ghostOn ? "1px solid rgba(255,255,255,0.25)" : "1px solid rgba(255,255,255,0.08)",
                  background: ghostOn ? "rgba(255,255,255,0.06)" : "transparent",
                  color: ghostOn ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.2)",
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
              >
                Compare to median
              </button>
            </div>
          </div>

          {/* Selected event card overlay */}
          {selectedEvent && (
            <div style={{ marginBottom: 12 }}>
              <InterceptCard event={selectedEvent} onClose={() => setSelectedEvent(null)} />
            </div>
          )}

          {/* Hero chart */}
          <div style={{ height: 420, position: "relative" }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={chartData}
                margin={{ top: 12, right: 24, bottom: 4, left: 8 }}
                onClick={() => setSelectedEvent(null)}
              >
                <CartesianGrid stroke="rgba(255,255,255,0.04)" strokeDasharray="3 3" />
                <XAxis
                  dataKey="day_index"
                  tick={{ fill: "rgba(255,255,255,0.3)", fontFamily: FONT_MONO, fontSize: 10 }}
                  tickLine={false}
                  axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
                  tickFormatter={(d: number) => {
                    const snap = SNAPSHOTS.find((s) => s.day_index === d);
                    return snap ? fmtDate(snap.date) : "";
                  }}
                  interval={Math.max(1, Math.floor(filteredSnaps.length / 10))}
                />
                {/* Primary Y axis for OPS */}
                <YAxis
                  yAxisId="ops"
                  domain={opsOnly ? [0, 100] : ["auto", "auto"]}
                  tick={{ fill: "rgba(255,255,255,0.25)", fontFamily: FONT_MONO, fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  width={40}
                />
                {/* Secondary Y for large-scale series */}
                {!opsOnly && (
                  <YAxis
                    yAxisId="scale"
                    orientation="right"
                    tick={{ fill: "rgba(255,255,255,0.15)", fontFamily: FONT_MONO, fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    width={50}
                    tickFormatter={(v: number) => fmtNum(v)}
                  />
                )}
                <Tooltip
                  content={<ChartTooltip activeSeries={activeSeries} ghostOn={ghostOn} />}
                  cursor={{ stroke: "rgba(255,255,255,0.08)" }}
                />

                {/* Phase bands */}
                {visiblePhases.map((p) => (
                  <ReferenceArea
                    key={p.id}
                    yAxisId="ops"
                    x1={Math.max(p.start_day, range.startDay)}
                    x2={Math.min(p.end_day, range.endDay)}
                    fill={p.id === "crisis" ? "rgba(239,68,68,0.04)" : "rgba(255,255,255,0.015)"}
                    fillOpacity={1}
                    ifOverflow="hidden"
                  />
                ))}

                {/* Today line */}
                <ReferenceLine
                  yAxisId="ops"
                  x={today}
                  stroke="rgba(255,255,255,0.15)"
                  strokeDasharray="4 4"
                  label={{
                    value: "Today",
                    position: "insideTopRight",
                    fill: "rgba(255,255,255,0.2)",
                    fontFamily: FONT_MONO,
                    fontSize: 10,
                  }}
                />

                {/* Ghost line */}
                {ghostOn && (
                  <Line
                    yAxisId="ops"
                    type="monotone"
                    dataKey="ghost_ops"
                    stroke="rgba(255,255,255,0.12)"
                    strokeWidth={1}
                    strokeDasharray="6 4"
                    dot={false}
                    connectNulls
                  />
                )}

                {/* OPS Area fill */}
                {activeSeries.includes("ops") && (
                  <defs>
                    <linearGradient id="opsGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#ef4444" stopOpacity={0.25} />
                      <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                )}
                {activeSeries.includes("ops") && (
                  <Area
                    yAxisId="ops"
                    type="monotone"
                    dataKey="ops_score"
                    fill="url(#opsGrad)"
                    stroke="none"
                    connectNulls
                  />
                )}

                {/* OPS Line — the signal trace */}
                {activeSeries.includes("ops") && (
                  <Line
                    yAxisId="ops"
                    type="monotone"
                    dataKey="ops_score"
                    stroke="#ef4444"
                    strokeWidth={3}
                    dot={false}
                    connectNulls
                    style={{ filter: "drop-shadow(0 0 6px #ef444440)" }}
                  />
                )}

                {/* Reviews line */}
                {activeSeries.includes("reviews") && (
                  <Line
                    yAxisId={opsOnly ? "ops" : "scale"}
                    type="monotone"
                    dataKey="review_count"
                    stroke={SERIES_COLORS.reviews}
                    strokeWidth={1.5}
                    dot={false}
                  />
                )}

                {/* YouTube views line */}
                {activeSeries.includes("yt_views") && (
                  <Line
                    yAxisId={opsOnly ? "ops" : "scale"}
                    type="monotone"
                    dataKey="yt_cumulative_views"
                    stroke={SERIES_COLORS.yt_views}
                    strokeWidth={1.5}
                    dot={false}
                  />
                )}

                {/* CCU line */}
                {activeSeries.includes("peak_ccu") && (
                  <Line
                    yAxisId={opsOnly ? "ops" : "scale"}
                    type="monotone"
                    dataKey="peak_ccu"
                    stroke={SERIES_COLORS.peak_ccu}
                    strokeWidth={1.5}
                    dot={false}
                  />
                )}

                {/* Twitch line */}
                {activeSeries.includes("twitch") && (
                  <Line
                    yAxisId={opsOnly ? "ops" : "scale"}
                    type="monotone"
                    dataKey="twitch_viewers"
                    stroke={SERIES_COLORS.twitch}
                    strokeWidth={1.5}
                    dot={false}
                  />
                )}

                {/* Event dots on OPS line */}
                {activeSeries.includes("ops") &&
                  visibleEvents.map((ev, i) => {
                    const snap = filteredSnaps.find((s) => s.day_index === ev.day_index);
                    if (!snap || snap.ops_score === null) return null;
                    return (
                      <ReferenceDot
                        key={ev.date + ev.type}
                        yAxisId="ops"
                        x={ev.day_index}
                        y={snap.ops_score}
                        shape={(props: { cx?: number; cy?: number }) => (
                          <EventDot
                            cx={props.cx}
                            cy={props.cy}
                            event={ev}
                            index={i}
                            isSelected={selectedEvent?.date === ev.date && selectedEvent?.type === ev.type}
                            onClick={setSelectedEvent}
                          />
                        )}
                      />
                    );
                  })}
              </ComposedChart>
            </ResponsiveContainer>

            {/* Ghost label at right edge */}
            {ghostOn && (
              <div
                style={{
                  position: "absolute",
                  right: 64,
                  top: 60,
                  fontFamily: FONT_MONO,
                  fontSize: 10,
                  color: "rgba(255,255,255,0.2)",
                  letterSpacing: 0.5,
                }}
              >
                Median Psych Horror
              </div>
            )}
          </div>
        </section>

        {/* ═══════ Element 3: Phase Analysis Strip ═══════ */}
        <section style={{ padding: "32px 40px 0" }}>
          <h2 style={{ fontFamily: FONT_SERIF, fontSize: 22, fontWeight: 400, color: "#fff", margin: "0 0 16px" }}>
            Signal Phases
          </h2>
          <div style={{ position: "relative" }}>
            {/* Connecting line */}
            <div
              style={{
                position: "absolute",
                top: 28,
                left: 20,
                right: 20,
                height: 1,
                background: "rgba(255,255,255,0.08)",
                zIndex: 0,
              }}
            />
            <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 8, position: "relative", zIndex: 1 }}>
              {PHASES.map((p) => {
                const isCurrent = currentPhase?.id === p.id;
                return (
                  <div
                    key={p.id}
                    style={{
                      flex: "0 0 200px",
                      background: "#0f0f11",
                      border: isCurrent ? "1px solid rgba(239,68,68,0.4)" : "1px solid rgba(255,255,255,0.06)",
                      borderRadius: 6,
                      padding: "14px 16px",
                      fontFamily: FONT_MONO,
                      fontSize: 11,
                      position: "relative",
                    }}
                  >
                    {/* Dot connector */}
                    <div
                      style={{
                        position: "absolute",
                        top: -5,
                        left: "50%",
                        transform: "translateX(-50%)",
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: isCurrent ? "#ef4444" : "rgba(255,255,255,0.15)",
                        border: "2px solid #0f0f11",
                      }}
                    />
                    <div style={{ marginBottom: 6 }}>
                      <span style={{ marginRight: 6 }}>{PHASE_EMOJI[p.id] || ""}</span>
                      <span style={{ color: "#fff", fontWeight: 600 }}>{p.label}</span>
                    </div>
                    <div
                      style={{
                        display: "inline-block",
                        padding: "1px 8px",
                        background: "rgba(255,255,255,0.06)",
                        borderRadius: 3,
                        color: "rgba(255,255,255,0.4)",
                        fontSize: 10,
                        marginBottom: 8,
                      }}
                    >
                      {p.duration_days}d
                    </div>
                    <div style={{ color: "rgba(255,255,255,0.55)", lineHeight: 1.45, marginBottom: 6 }}>
                      {p.dominant_signal}
                    </div>
                    <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, lineHeight: 1.45 }}>
                      {p.insight.slice(0, 100)}{p.insight.length > 100 ? "..." : ""}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ═══════ Elements 4 & 5: Two-column layout ═══════ */}
        <section style={{ padding: "36px 40px 0", display: "flex", gap: 28 }}>

          {/* ── Element 4: Creator Impact Panel (left, 60%) ── */}
          <div style={{ flex: "0 0 58%" }}>
            <h2 style={{ fontFamily: FONT_SERIF, fontSize: 22, fontWeight: 400, color: "#fff", margin: "0 0 16px" }}>
              Creator Impact
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {sortedCreators.map((c) => (
                <CreatorCard key={c.channel_name} creator={c} />
              ))}
            </div>

            {/* Reddit mentions */}
            {redditEvents.length > 0 && (
              <>
                <h3
                  style={{
                    fontFamily: FONT_SERIF,
                    fontSize: 18,
                    fontWeight: 400,
                    color: "#fff",
                    margin: "24px 0 12px",
                  }}
                >
                  Reddit Mentions
                </h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {redditEvents.map((r) => (
                    <div
                      key={r.date}
                      style={{
                        background: "#0f0f11",
                        border: "1px solid rgba(255,255,255,0.06)",
                        borderLeft: `3px solid ${EVENT_COLORS.reddit}`,
                        borderRadius: 4,
                        padding: "12px 16px",
                        fontFamily: FONT_MONO,
                        fontSize: 12,
                      }}
                    >
                      <div style={{ color: "#fff", fontWeight: 600, marginBottom: 4 }}>{r.title}</div>
                      <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 11 }}>{r.detail}</div>
                      <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, marginTop: 6 }}>
                        r/{r.subreddit} &middot; {r.score} pts &middot; {r.num_comments} comments &middot; {fmtDate(r.date)}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* ── Element 5: OPS Score Spotlight (right, 40%) ── */}
          <div style={{ flex: 1 }}>
            <h2 style={{ fontFamily: FONT_SERIF, fontSize: 22, fontWeight: 400, color: "#fff", margin: "0 0 16px" }}>
              OPS Spotlight
            </h2>
            <div
              style={{
                background: "#0f0f11",
                border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: 8,
                padding: "24px",
              }}
            >
              {/* Big OPS number */}
              <div style={{ textAlign: "center", marginBottom: 20 }}>
                <div
                  style={{
                    fontFamily: FONT_MONO,
                    fontSize: 56,
                    fontWeight: 700,
                    color: latestOps >= 60 ? "#22c55e" : latestOps >= 30 ? "#facc15" : "#ef4444",
                    lineHeight: 1,
                  }}
                >
                  {latestOps}
                </div>
                <div style={{ fontFamily: FONT_MONO, fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 4, textTransform: "uppercase", letterSpacing: 1 }}>
                  Confidence: {HOLLOWFIELD.ops_confidence}
                </div>
              </div>

              {/* Mini OPS trajectory */}
              <div style={{ height: 80, marginBottom: 20 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={SNAPSHOTS.filter((s) => s.ops_score !== null)} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                    <Area
                      type="monotone"
                      dataKey="ops_score"
                      fill="url(#opsGradMini)"
                      stroke="#ef4444"
                      strokeWidth={1.5}
                    />
                    <defs>
                      <linearGradient id="opsGradMini" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#ef4444" stopOpacity={0.2} />
                        <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              {/* Peak callout */}
              <div
                style={{
                  fontFamily: FONT_MONO,
                  fontSize: 12,
                  background: "rgba(255,255,255,0.04)",
                  borderRadius: 4,
                  padding: "10px 14px",
                  marginBottom: 16,
                }}
              >
                <span style={{ color: "#facc15" }}>Peak: {opsPeak.ops_score}</span>
                <span style={{ color: "rgba(255,255,255,0.35)" }}>
                  {" "}
                  &mdash; Day {opsPeak.day_index - 92}
                  {peakPhase ? ` (${peakPhase.label})` : ""}
                </span>
              </div>

              {/* Momentum */}
              <div style={{ fontFamily: FONT_MONO, fontSize: 12, color: "rgba(255,255,255,0.35)", marginBottom: 20, display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ color: "#ef4444" }}>{"\u2193"}</span> Declining &mdash; post-breakout stabilization
              </div>

              {/* Component breakdown bars */}
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
                {components.map((c) => (
                  <div key={c.label}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontFamily: FONT_MONO, fontSize: 11, marginBottom: 4 }}>
                      <span style={{ color: "rgba(255,255,255,0.5)" }}>{c.label}</span>
                      <span style={{ color: c.color }}>{(c.value * 100).toFixed(0)}%</span>
                    </div>
                    <div style={{ height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 3 }}>
                      <div
                        style={{
                          height: "100%",
                          width: `${Math.min(100, c.value * 100)}%`,
                          background: c.color,
                          borderRadius: 3,
                          opacity: 0.7,
                          transition: "width 0.4s ease",
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Explainer */}
              <p style={{ fontFamily: FONT_SERIF, fontSize: 14, color: "rgba(255,255,255,0.4)", lineHeight: 1.6, margin: 0 }}>
                Hollowfield peaked at OPS 89 during the IGP-driven breakout window, placing it in the top 2% of indie horror launches.
                The score has since settled to {latestOps}, reflecting healthy long-tail organic activity with occasional Reddit-driven bumps.
              </p>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}

// ─── Creator Card Sub-component ────────────────────────────────────

function CreatorCard({ creator }: { creator: CreatorImpact }) {
  const reviewDelta = creator.reviews_after_7d - creator.reviews_before_7d;
  const ccuDelta = creator.ccu_after_7d - creator.ccu_before_7d;
  return (
    <div
      style={{
        background: "#0f0f11",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 6,
        padding: "14px 18px",
        fontFamily: FONT_MONO,
        fontSize: 12,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ color: "#fff", fontWeight: 600, fontSize: 13 }}>{creator.channel_name}</span>
          <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 11 }}>{fmtNum(creator.subscriber_count)} subs</span>
          <span
            style={{
              fontSize: 9,
              padding: "1px 6px",
              borderRadius: 3,
              background: creator.covers === "demo" ? "rgba(34,211,238,0.12)" : "rgba(239,68,68,0.12)",
              color: creator.covers === "demo" ? "#22d3ee" : "#ef4444",
              textTransform: "uppercase",
              letterSpacing: 0.5,
            }}
          >
            {creator.covers}
          </span>
        </div>
        <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 10 }}>{fmtDate(creator.upload_date)}</span>
      </div>
      <div style={{ color: "rgba(255,255,255,0.55)", marginBottom: 6 }}>{creator.video_title}</div>
      <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, marginBottom: 8 }}>
        {fmtNum(creator.view_count)} views
      </div>
      <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 11, marginBottom: 8 }}>
        Impact: +{reviewDelta > 0 ? reviewDelta.toLocaleString() : 0} reviews, +{ccuDelta > 0 ? ccuDelta : 0} CCU in 7 days
      </div>
      {/* Impact bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ flex: 1, height: 5, background: "rgba(255,255,255,0.06)", borderRadius: 3 }}>
          <div
            style={{
              height: "100%",
              width: `${creator.impact_score}%`,
              background: creator.impact_score >= 70 ? "#ef4444" : creator.impact_score >= 40 ? "#facc15" : "rgba(255,255,255,0.2)",
              borderRadius: 3,
              transition: "width 0.4s ease",
            }}
          />
        </div>
        <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, minWidth: 28, textAlign: "right" }}>
          {creator.impact_score}
        </span>
      </div>
    </div>
  );
}
