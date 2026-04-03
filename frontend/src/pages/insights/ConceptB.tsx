import { useCallback, useEffect, useState } from "react";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  AreaChart,
  Area,
  BarChart,
  Bar,
  Cell,
  ResponsiveContainer,
} from "recharts";
import { fetchOne } from "../../api/client";
import type { InsightGame, InsightPastGem, InsightsResponse } from "../../types";

/* ── palette (matched to Horror Radar front page) ── */
const C = {
  void: "#111314",      // background-dark
  primary: "#802626",   // horror red — accent, branding, UI chrome
  green: "#4ade80",     // positive data signals (scores, up-trends)
  dim: "#6b6058",       // text-dim — secondary labels, info
  white: "#e8e0d4",     // text-main
  red: "#802626",       // warnings, negative signals
  grid: "#1a1a1c",      // surface-dark
  line: "#2a2420",      // border-dark
} as const;

/* ── shared inline styles ── */
const scanline: React.CSSProperties = {
  background:
    "repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.05) 2px,rgba(0,0,0,0.05) 4px)",
  pointerEvents: "none" as const,
};

const mono: React.CSSProperties = { fontFamily: "'Space Mono', monospace" };
const heading: React.CSSProperties = { fontFamily: "'Outfit', sans-serif" };

/* ── keyframes injected once ── */
const styleTag = `
@keyframes signalPing {
  0%   { box-shadow: 0 0 0 0 rgba(128,38,38,0.4); }
  70%  { box-shadow: 0 0 0 20px rgba(128,38,38,0); }
  100% { box-shadow: 0 0 0 0 rgba(128,38,38,0); }
}
@keyframes signalReveal {
  from { opacity:0; transform:translateX(-16px); }
  to   { opacity:1; transform:translateX(0); }
}
@keyframes blink {
  0%,100% { opacity:1; }
  50%     { opacity:0.3; }
}
`;

/* ── helpers ── */
function dotColor(score: number) {
  if (score > 70) return C.green;
  if (score >= 40) return C.dim;
  return "#2a3444";
}

function outcomeColor(o: InsightPastGem["outcome"]) {
  if (o === "hit") return C.green;
  if (o === "steady") return C.primary;
  return "#556677";
}

/* ── custom radar tooltip ── */
function RadarTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as InsightGame;
  return (
    <div
      style={{
        ...mono,
        background: C.grid,
        border: `1px solid ${C.line}`,
        padding: "10px 14px",
        color: C.white,
        fontSize: 12,
        lineHeight: 1.6,
        maxWidth: 240,
      }}
    >
      <div style={{ color: C.primary, fontWeight: 700, marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}>
        {d.title}
        {d.has_demo && (
          <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: "rgba(163,106,165,0.15)", color: "#a36aa5", fontWeight: 800, letterSpacing: 1 }}>
            DEMO
          </span>
        )}
      </div>
      <div>VIS: {d.visibility} &nbsp; QUA: {d.quality}</div>
      <div>GEM: {d.gem_score} &nbsp; REV: {d.review_count}</div>
      {d.demo_review_count != null && d.demo_review_count > 0 && (
        <div style={{ color: "#a36aa5" }}>
          DEMO: {d.demo_review_count} reviews ({d.demo_review_score_pct?.toFixed(0)}%)
        </div>
      )}
      <div style={{ color: C.dim }}>{d.genre}</div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   CONCEPT B — DEAD SIGNAL
   ══════════════════════════════════════════════════════════════════════ */
export default function ConceptB() {
  const [data, setData] = useState<InsightsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const resp = await fetchOne<InsightsResponse>("/insights");
      setData(resp);
    } catch (err) {
      console.error("Failed to fetch insights:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const delay = (i: number) => `${i * 0.12}s`;

  if (loading) {
    return (
      <div style={{ background: C.void, minHeight: "100vh", color: C.white }}
        className="flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <span className="material-symbols-outlined text-4xl animate-spin" style={{ color: C.primary }}>
            progress_activity
          </span>
          <span style={{ ...mono, fontSize: 12, color: C.dim }}>SCANNING FREQUENCIES...</span>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ background: C.void, minHeight: "100vh", color: C.white }}
        className="flex items-center justify-center">
        <span style={{ ...mono, color: C.red }}>SIGNAL LOST — FAILED TO LOAD DATA</span>
      </div>
    );
  }

  const { hero_gem, scatter_games, rising_games, blindspot_games, sub_genres, gem_history } = data;
  const heroGem = hero_gem;

  /* scatter data including hero */
  const allScatter = heroGem
    ? [
        { ...heroGem, _hero: true },
        ...scatter_games.filter(g => g.appid !== heroGem.appid).map((g) => ({ ...g, _hero: false })),
      ]
    : scatter_games.map((g) => ({ ...g, _hero: false }));

  return (
    <div
      style={{ background: C.void, minHeight: "100vh", color: C.white }}
      className="relative"
    >
      {/* inject keyframes */}
      <style>{styleTag}</style>

      {/* global scan-line overlay */}
      <div
        className="pointer-events-none fixed inset-0 z-50"
        style={scanline}
      />

      <div className="mx-auto max-w-6xl px-4 py-12 space-y-16">
        {/* ── SECTION 1 — SIGNAL DETECTED ── */}
        {heroGem && (
        <section
          className="relative overflow-hidden rounded-lg p-8"
          style={{
            background: `radial-gradient(ellipse at center, rgba(128,38,38,0.08) 0%, ${C.grid} 60%, ${C.void} 100%)`,
            border: `1px solid ${C.line}`,
            animation: "signalReveal 0.5s ease-out both",
            animationDelay: delay(0),
          }}
        >
          {/* scan-line local */}
          <div className="absolute inset-0" style={scanline} />

          <p
            style={{ ...mono, fontSize: 11, color: C.dim, letterSpacing: 2 }}
            className="mb-1 uppercase"
          >
            Signal Detected
          </p>

          {/* score ring */}
          <div className="flex items-center gap-6 mb-6">
            <div
              className="flex items-center justify-center rounded-full"
              style={{
                width: 88,
                height: 88,
                border: `2px solid ${C.primary}`,
                animation: "signalPing 2s infinite",
                flexShrink: 0,
              }}
            >
              <span
                style={{ ...mono, fontSize: 32, color: C.primary, fontWeight: 700 }}
              >
                {heroGem.gem_score}
              </span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1
                  style={{ ...heading, fontSize: 28, fontWeight: 700, lineHeight: 1.2 }}
                  className="text-white"
                >
                  {heroGem.title}
                </h1>
                {heroGem.has_demo && (
                  <span style={{
                    ...mono, fontSize: 9, padding: "2px 8px", borderRadius: 4,
                    background: "rgba(163,106,165,0.12)", color: "#a36aa5",
                    fontWeight: 800, letterSpacing: 1.5, border: "1px solid rgba(163,106,165,0.25)",
                  }}>
                    DEMO
                  </span>
                )}
              </div>
              <p style={{ ...mono, fontSize: 13, color: C.dim }}>
                {heroGem.developer} &mdash; {heroGem.genre}
              </p>
            </div>
          </div>

          {/* signal metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            {(heroGem.signals ?? []).map((s, i) => (
              <div
                key={i}
                style={{
                  ...mono,
                  background: C.void,
                  border: `1px solid ${C.line}`,
                  padding: "10px 14px",
                  fontSize: 12,
                  animation: "signalReveal .4s ease-out both",
                  animationDelay: `${0.2 + i * 0.1}s`,
                }}
                className="rounded"
              >
                <span style={{ color: "#778899", textTransform: "uppercase" }}>
                  {s.label}
                </span>
                <div
                  style={{ color: C.primary, fontSize: 18, fontWeight: 700, marginTop: 2 }}
                >
                  {s.value}
                </div>
                <span style={{ color: C.dim, fontSize: 11 }}>{s.detail}</span>
              </div>
            ))}
          </div>

          <p style={{ ...mono, fontSize: 11, color: C.dim }}>
            INTERCEPTED 6H AGO &nbsp;&bull;&nbsp; {heroGem.review_count} REVIEWS
            &nbsp;&bull;&nbsp; ${heroGem.price}
            {heroGem.demo_review_count != null && heroGem.demo_review_count > 0 && (
              <span style={{ color: "#a36aa5" }}>
                &nbsp;&bull;&nbsp; {heroGem.demo_review_count} DEMO REVIEWS ({heroGem.demo_review_score_pct?.toFixed(0)}%)
              </span>
            )}
          </p>
        </section>
        )}

        {/* ── SECTION 2 — RADAR QUADRANT ── */}
        <section
          style={{
            animation: "signalReveal .5s ease-out both",
            animationDelay: delay(1),
          }}
        >
          <h2
            style={{ ...heading, fontSize: 20, fontWeight: 700 }}
            className="mb-1"
          >
            Radar Quadrant
          </h2>
          <p
            style={{ ...mono, fontSize: 11, color: C.dim, letterSpacing: 1.5 }}
            className="mb-4 uppercase"
          >
            Visibility vs Quality &mdash; {scatter_games.length} signals tracked
          </p>

          <div
            className="rounded-lg overflow-hidden"
            style={{
              background: C.grid,
              border: `1px solid ${C.line}`,
              padding: "16px 8px 8px 0",
            }}
          >
            <ResponsiveContainer width="100%" height={380}>
              <ScatterChart margin={{ top: 10, right: 20, bottom: 10, left: 10 }}>
                <CartesianGrid stroke={C.line} strokeDasharray="3 3" />
                <XAxis
                  dataKey="visibility"
                  type="number"
                  domain={[0, 100]}
                  name="Visibility"
                  tick={{ fill: C.dim, fontSize: 11, fontFamily: "'Space Mono'" }}
                  label={{
                    value: "VISIBILITY",
                    position: "insideBottom",
                    offset: -4,
                    fill: C.dim,
                    fontSize: 10,
                    fontFamily: "'Space Mono'",
                  }}
                  stroke={C.line}
                />
                <YAxis
                  dataKey="quality"
                  type="number"
                  domain={[0, 100]}
                  name="Quality"
                  tick={{ fill: C.dim, fontSize: 11, fontFamily: "'Space Mono'" }}
                  label={{
                    value: "QUALITY",
                    angle: -90,
                    position: "insideLeft",
                    offset: 12,
                    fill: C.dim,
                    fontSize: 10,
                    fontFamily: "'Space Mono'",
                  }}
                  stroke={C.line}
                />
                <Tooltip content={<RadarTooltip />} />
                <ReferenceLine x={50} stroke={C.line} strokeDasharray="6 4" />
                <ReferenceLine y={50} stroke={C.line} strokeDasharray="6 4" />

                {/* non-hero dots */}
                <Scatter
                  data={allScatter.filter((g) => !g._hero)}
                  shape={(props: any) => {
                    const { cx, cy, payload } = props;
                    const r = Math.max(4, payload.gem_score / 12);
                    const fill = dotColor(payload.gem_score);
                    return (
                      <g>
                        <circle cx={cx} cy={cy} r={r} fill={fill} fillOpacity={0.85} />
                        {payload.has_demo && (
                          <circle cx={cx} cy={cy} r={r + 3} fill="none" stroke="#a36aa5" strokeWidth={1.5} strokeOpacity={0.6} />
                        )}
                      </g>
                    );
                  }}
                />

                {/* hero dot — pulsing */}
                <Scatter
                  data={allScatter.filter((g) => g._hero)}
                  shape={(props: any) => {
                    const { cx, cy } = props;
                    return (
                      <g>
                        <circle
                          cx={cx}
                          cy={cy}
                          r={10}
                          fill={C.primary}
                          style={{ animation: "signalPing 2s infinite" }}
                        />
                        <circle cx={cx} cy={cy} r={5} fill="#fff" fillOpacity={0.9} />
                      </g>
                    );
                  }}
                />
              </ScatterChart>
            </ResponsiveContainer>

            {/* quadrant labels */}
            <div
              className="flex justify-between px-6 pb-2"
              style={{ ...mono, fontSize: 10, color: "#445566" }}
            >
              <span>NOISE &darr;</span>
              <span>&uarr; SIGNAL</span>
            </div>
          </div>
        </section>

        {/* ── SECTION 3 — ACTIVE FREQUENCIES ── */}
        <section
          style={{
            animation: "signalReveal .5s ease-out both",
            animationDelay: delay(2),
          }}
        >
          <h2
            style={{ ...heading, fontSize: 20, fontWeight: 700 }}
            className="mb-1"
          >
            Active Frequencies
          </h2>
          <p
            style={{ ...mono, fontSize: 11, color: C.dim, letterSpacing: 1.5 }}
            className="mb-4 uppercase"
          >
            Rising signal feed &mdash; {rising_games.length} tracked
          </p>

          <div className="space-y-2">
            {rising_games.map((g, i) => (
              <div
                key={g.appid}
                className="flex items-center gap-4 rounded px-4 py-3"
                style={{
                  background: C.grid,
                  border: `1px solid ${C.line}`,
                  animation: "signalReveal .4s ease-out both",
                  animationDelay: `${0.24 + i * 0.08}s`,
                }}
              >
                {/* freq number */}
                <span
                  style={{ ...mono, color: C.primary, fontSize: 13, width: 32, flexShrink: 0 }}
                >
                  #{String(i + 1).padStart(2, "0")}
                </span>

                {/* title + dev */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      style={{ ...heading, fontWeight: 600, fontSize: 14 }}
                      className="truncate"
                    >
                      {g.title}
                    </span>
                    {g.has_demo && (
                      <span style={{
                        ...mono, fontSize: 8, padding: "1px 5px", borderRadius: 3, flexShrink: 0,
                        background: "rgba(163,106,165,0.12)", color: "#a36aa5",
                        fontWeight: 800, letterSpacing: 1,
                      }}>
                        DEMO
                      </span>
                    )}
                  </div>
                  <div style={{ ...mono, fontSize: 10, color: C.dim }}>
                    {g.dominant_signal || g.genre}
                    {g.demo_review_count != null && g.demo_review_count > 0 && (
                      <span style={{ color: "#a36aa5", marginLeft: 8 }}>
                        {g.demo_review_count} demo reviews
                      </span>
                    )}
                  </div>
                </div>

                {/* gem score */}
                <span
                  style={{
                    ...mono,
                    color: C.green,
                    fontSize: 18,
                    fontWeight: 700,
                    width: 48,
                    textAlign: "right",
                    flexShrink: 0,
                  }}
                >
                  {g.gem_score}
                </span>

                {/* sparkline */}
                <div style={{ width: 120, height: 30, flexShrink: 0 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={g.sparkline.map((v, j) => ({ v, d: j }))}>
                      <defs>
                        <linearGradient
                          id={`sf-${g.appid}`}
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop offset="0%" stopColor={C.primary} stopOpacity={0.4} />
                          <stop offset="100%" stopColor={C.primary} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <Area
                        dataKey="v"
                        stroke={C.primary}
                        strokeWidth={1.5}
                        fill={`url(#sf-${g.appid})`}
                        dot={false}
                        isAnimationActive={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                {/* track button */}
                <button
                  className="rounded px-3 py-1 text-xs uppercase transition-colors hover:bg-opacity-20"
                  style={{
                    ...mono,
                    color: C.primary,
                    border: `1px solid ${C.primary}`,
                    background: "transparent",
                    cursor: "pointer",
                    fontSize: 10,
                    letterSpacing: 1,
                    flexShrink: 0,
                  }}
                >
                  Track
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* ── SECTION 4 — DEAD AIR ── */}
        <section
          style={{
            animation: "signalReveal .5s ease-out both",
            animationDelay: delay(3),
          }}
        >
          <h2
            style={{ ...heading, fontSize: 20, fontWeight: 700 }}
            className="mb-1"
          >
            Dead Air
          </h2>
          <p
            style={{ ...mono, fontSize: 11, color: C.dim, letterSpacing: 1.5 }}
            className="mb-4 uppercase"
          >
            0 creator signals &mdash; quality games with no coverage
          </p>

          {blindspot_games.length === 0 ? (
            <p style={{ ...mono, fontSize: 12, color: C.dim }}>
              All tracked games have creator coverage
            </p>
          ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {blindspot_games.map((g, i) => (
              <div
                key={g.appid}
                className="rounded p-4 flex flex-col gap-2"
                style={{
                  background: C.grid,
                  border: `1px solid ${C.line}`,
                  animation: "signalReveal .4s ease-out both",
                  animationDelay: `${0.36 + i * 0.08}s`,
                }}
              >
                <div className="flex items-center gap-2">
                  <span style={{ ...heading, fontWeight: 600, fontSize: 14 }}>
                    {g.title}
                  </span>
                  {g.has_demo && (
                    <span style={{
                      ...mono, fontSize: 8, padding: "1px 4px", borderRadius: 3, flexShrink: 0,
                      background: "rgba(163,106,165,0.12)", color: "#a36aa5",
                      fontWeight: 800, letterSpacing: 1,
                    }}>
                      DEMO
                    </span>
                  )}
                </div>
                <div style={{ ...mono, fontSize: 11, color: "#667788" }}>
                  {g.genre} &bull; {g.days_out}d active
                  {g.demo_review_count != null && g.demo_review_count > 0 && (
                    <span style={{ color: "#a36aa5" }}> &bull; {g.demo_review_count} demo rev</span>
                  )}
                </div>
                <div
                  style={{ ...mono, fontSize: 22, fontWeight: 700, color: C.primary }}
                >
                  {g.quality}
                </div>
                <div
                  style={{
                    ...mono,
                    fontSize: 11,
                    color: C.red,
                    animation: "blink 1.6s infinite",
                    letterSpacing: 1,
                  }}
                >
                  0 SIGNALS
                </div>
                <button
                  className="mt-auto rounded px-2 py-1 text-xs uppercase transition-colors"
                  style={{
                    ...mono,
                    color: C.primary,
                    border: `1px solid ${C.primary}`,
                    background: "transparent",
                    cursor: "pointer",
                    fontSize: 10,
                    letterSpacing: 1,
                  }}
                >
                  Broadcast
                </button>
              </div>
            ))}
          </div>
          )}
        </section>

        {/* ── SECTION 5 — FREQUENCY SPECTRUM ── */}
        <section
          style={{
            animation: "signalReveal .5s ease-out both",
            animationDelay: delay(4),
          }}
        >
          <h2
            style={{ ...heading, fontSize: 20, fontWeight: 700 }}
            className="mb-1"
          >
            Frequency Spectrum
          </h2>
          <p
            style={{ ...mono, fontSize: 11, color: C.dim, letterSpacing: 1.5 }}
            className="mb-4 uppercase"
          >
            Sub-genre momentum &mdash; signal strength analysis
          </p>

          <div
            className="rounded-lg overflow-hidden"
            style={{
              background: C.grid,
              border: `1px solid ${C.line}`,
              padding: "16px 8px 8px 0",
            }}
          >
            <ResponsiveContainer width="100%" height={sub_genres.length * 44 + 20}>
              <BarChart
                data={sub_genres}
                layout="vertical"
                margin={{ top: 0, right: 30, bottom: 0, left: 130 }}
              >
                <CartesianGrid
                  horizontal={false}
                  stroke={C.line}
                  strokeDasharray="3 3"
                />
                <XAxis
                  type="number"
                  domain={[-1, 1]}
                  tick={{ fill: C.dim, fontSize: 10, fontFamily: "'Space Mono'" }}
                  stroke={C.line}
                  tickFormatter={(v: number) => v.toFixed(1)}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fill: C.white, fontSize: 12, fontFamily: "'Space Mono'" }}
                  stroke="transparent"
                  width={120}
                />
                <ReferenceLine x={0} stroke={C.line} />
                <Tooltip
                  contentStyle={{
                    ...mono,
                    background: C.grid,
                    border: `1px solid ${C.line}`,
                    fontSize: 12,
                    color: C.white,
                  }}
                  formatter={(value: any, _name: any, entry: any) => [
                    `${Number(value) > 0 ? "+" : ""}${Number(value).toFixed(2)} (${entry?.payload?.game_count ?? 0} games)`,
                    "Momentum",
                  ]}
                />
                <Bar dataKey="momentum" radius={[0, 4, 4, 0]}>
                  {sub_genres.map((sg, i) => (
                    <Cell
                      key={i}
                      fill={sg.momentum >= 0 ? C.green : C.red}
                      fillOpacity={0.8}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* ── SECTION 6 — SIGNAL ARCHIVE ── */}
        <section
          style={{
            animation: "signalReveal .5s ease-out both",
            animationDelay: delay(5),
          }}
        >
          <h2
            style={{ ...heading, fontSize: 20, fontWeight: 700 }}
            className="mb-1"
          >
            Signal Archive
          </h2>
          <p
            style={{ ...mono, fontSize: 11, color: C.dim, letterSpacing: 1.5 }}
            className="mb-4 uppercase"
          >
            Transmission log &mdash; {gem_history.length} archived signals
          </p>

          {gem_history.length === 0 ? (
            <p style={{ ...mono, fontSize: 12, color: C.dim }}>
              Signal archive will populate after the first week of collection
            </p>
          ) : (
          <div
            className="flex gap-3 overflow-x-auto pb-3"
            style={{ scrollbarWidth: "thin", scrollbarColor: `${C.line} ${C.void}` }}
          >
            {gem_history.map((pg, i) => (
              <div
                key={i}
                className="rounded flex-shrink-0 p-4"
                style={{
                  background: C.grid,
                  border: `1px solid ${C.line}`,
                  width: 220,
                  animation: "signalReveal .4s ease-out both",
                  animationDelay: `${0.6 + i * 0.06}s`,
                }}
              >
                <div
                  style={{
                    ...mono,
                    fontSize: 10,
                    color: C.dim,
                    letterSpacing: 1,
                    marginBottom: 6,
                  }}
                >
                  WEEK: {pg.week}
                </div>
                <div
                  style={{
                    ...heading,
                    fontWeight: 600,
                    fontSize: 14,
                    marginBottom: 8,
                  }}
                >
                  {pg.title}
                </div>
                <div
                  style={{
                    ...mono,
                    fontSize: 12,
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: 4,
                  }}
                >
                  <span style={{ color: "#667788" }}>SIGNAL</span>
                  <span style={{ color: C.primary, fontWeight: 700 }}>
                    {pg.score_at_discovery}
                  </span>
                </div>
                <div
                  style={{
                    ...mono,
                    fontSize: 12,
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: 8,
                  }}
                >
                  <span style={{ color: "#667788" }}>OUTCOME</span>
                  <span style={{ color: outcomeColor(pg.outcome), fontWeight: 700 }}>
                    {pg.current_reviews} reviews
                  </span>
                </div>
                <div
                  className="rounded px-2 py-1 text-center uppercase"
                  style={{
                    ...mono,
                    fontSize: 10,
                    letterSpacing: 1,
                    color: outcomeColor(pg.outcome),
                    border: `1px solid ${outcomeColor(pg.outcome)}33`,
                    background: `${outcomeColor(pg.outcome)}0d`,
                  }}
                >
                  {pg.outcome}
                </div>
              </div>
            ))}
          </div>
          )}
        </section>
      </div>
    </div>
  );
}
