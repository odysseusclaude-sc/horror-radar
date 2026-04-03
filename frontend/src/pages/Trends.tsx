import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  Bar,
  BarChart,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from "recharts";
import type { TrendsResponse } from "../types";

const C = {
  bg: "#111314",
  surface: "#1a1a1c",
  tile: "#1f1f22",
  accent: "#802626",
  text: "#e8e0d4",
  textMid: "#a09080",
  textDim: "#6b6058",
  border: "#2a2420",
  green: "#5ec269",
  amber: "#e8a832",
  red: "#e25535",
  ccu: "#b07db2",
};

const mono: React.CSSProperties = { fontFamily: "'JetBrains Mono', 'Fira Code', monospace" };

function fmtK(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

function SectionHeader({ label, sub }: { label: string; sub?: string }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ ...mono, fontSize: 11, color: C.accent, textTransform: "uppercase", letterSpacing: 2, fontWeight: 600 }}>
        {label}
      </div>
      {sub && <div style={{ fontSize: 13, color: C.textDim, marginTop: 2, fontStyle: "italic" }}>{sub}</div>}
    </div>
  );
}

function Narrative({ text }: { text: string }) {
  if (!text) return null;
  return <div style={{ fontSize: 13, color: C.textMid, fontStyle: "italic", marginBottom: 16, lineHeight: 1.6 }}>{text}</div>;
}

/* ── Mini velocity spark (inline bar chart) ── */
function VelocitySpark({ data }: { data: number[] }) {
  const max = Math.max(...data, 1);
  return (
    <div style={{ display: "flex", gap: 2, alignItems: "flex-end", height: 24, width: 64 }}>
      {data.map((v, i) => (
        <div
          key={i}
          style={{
            width: 12,
            height: Math.max(2, (v / max) * 24),
            background: v > 0 ? C.green : C.border,
            borderRadius: 2,
            opacity: i === data.length - 1 ? 1 : 0.6,
          }}
        />
      ))}
    </div>
  );
}

export default function Trends() {
  const [data, setData] = useState<TrendsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_URL || "/api"}/trends`)
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load trends");
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{ background: C.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: C.textDim }}>
        <div style={{ ...mono, fontSize: 14 }}>Loading market intelligence...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ background: C.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: C.accent }}>
        <div style={{ ...mono, fontSize: 14 }}>{error || "No data"}</div>
      </div>
    );
  }

  const h = data.headline;

  return (
    <div style={{ background: C.bg, minHeight: "100vh", color: C.text, paddingBottom: 80 }}>

      {/* ═══ HEADLINE STRIP ═══ */}
      <section className="px-4 md:px-10 pt-6 md:pt-8">
        <div style={{ ...mono, fontSize: 11, color: C.accent, textTransform: "uppercase", letterSpacing: 3, marginBottom: 4 }}>
          The Pulse
        </div>
        <h1 className="text-xl md:text-[32px]" style={{ fontWeight: 700, margin: "0 0 20px", fontFamily: "'Public Sans', sans-serif", color: C.text }}>
          Indie Horror Market Intelligence
        </h1>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:flex md:flex-wrap gap-2 md:gap-3 mb-4">
          {[
            { label: "Games Tracked", value: fmtK(h.total_games), color: C.text },
            { label: "New (30d)", value: String(h.new_last_30d), color: C.green },
            { label: "Total Reviews", value: fmtK(h.total_reviews), color: C.text },
            { label: "Avg Sentiment", value: `${h.avg_sentiment}%`, color: h.avg_sentiment >= 80 ? C.green : C.amber },
            { label: "Breakouts", value: String(h.breakout_count), color: C.accent },
            { label: "YT Videos", value: String(h.yt_videos_tracked), color: C.ccu },
            { label: "Have Demos", value: `${h.demo_pct}%`, color: C.textMid },
          ].map((t) => (
            <div key={t.label} className="md:min-w-[110px]" style={{ background: C.tile, border: `1px solid ${C.border}`, borderRadius: 6, padding: "10px 14px" }}>
              <div className="text-lg md:text-[22px]" style={{ ...mono, fontWeight: 700, color: t.color }}>{t.value}</div>
              <div style={{ ...mono, fontSize: 9, color: C.textDim, textTransform: "uppercase", letterSpacing: 1, marginTop: 2 }}>{t.label}</div>
            </div>
          ))}
        </div>

        <Narrative text={data.market_narrative} />
      </section>

      {/* ═══ MARKET PULSE ═══ */}
      <section className="px-4 md:px-10 py-6">
        <SectionHeader label="Market Pulse" sub="12-week review velocity, OPS trend & new releases" />
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: "20px 16px 8px" }}>
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={data.market_pulse}>
              <CartesianGrid stroke={C.border} strokeDasharray="3 3" />
              <XAxis dataKey="week_label" tick={{ fill: C.textDim, fontSize: 10, ...mono }} interval={1} />
              <YAxis yAxisId="reviews" tick={{ fill: C.green, fontSize: 10, ...mono }} tickFormatter={(v: number) => fmtK(v)} width={50} />
              <YAxis yAxisId="ops" orientation="right" tick={{ fill: C.textMid, fontSize: 10, ...mono }} domain={[0, 50]} width={35} />
              <Tooltip
                contentStyle={{ background: C.tile, border: `1px solid ${C.border}`, borderRadius: 6, ...mono, fontSize: 11 }}
                labelStyle={{ color: C.text }}
                itemStyle={{ color: C.textMid }}
              />
              <Bar dataKey="new_releases" yAxisId="reviews" fill={C.border} barSize={20} opacity={0.5} name="New Releases" />
              <Area dataKey="total_new_reviews" yAxisId="reviews" fill={C.green} fillOpacity={0.15} stroke={C.green} strokeWidth={2} name="New Reviews" />
              <Line dataKey="avg_ops" yAxisId="ops" stroke={C.text} strokeWidth={2} strokeDasharray="6 3" dot={false} connectNulls name="Avg OPS" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* ═══ SUBGENRE MOMENTUM + CREATOR RADAR (side by side) ═══ */}
      <section className="px-4 md:px-10 py-6 grid grid-cols-1 md:grid-cols-[1fr_380px] gap-6">

        {/* Subgenre Momentum */}
        <div className="flex flex-col">
          <SectionHeader label="Subgenre Momentum" sub="Where attention is flowing" />
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: "12px 16px", flex: 1 }}>
            {data.subgenre_narrative && (
              <div style={{ fontSize: 12, color: C.textMid, fontStyle: "italic", marginBottom: 12, lineHeight: 1.5, paddingBottom: 10, borderBottom: `1px solid ${C.border}` }}>
                {data.subgenre_narrative}
              </div>
            )}
            {data.subgenres.map((sg, i) => {
              const delta = sg.ops_delta_4w ?? 0;
              const barColor = delta > 2 ? C.green : delta < -2 ? C.red : C.amber;
              const maxDelta = Math.max(...data.subgenres.map((s) => Math.abs(s.ops_delta_4w ?? 0)), 1);
              const barWidth = Math.min(100, (Math.abs(delta) / maxDelta) * 100);
              return (
                <div
                  key={sg.name}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "140px 60px 1fr 50px 50px",
                    alignItems: "center",
                    gap: 12,
                    padding: "7px 0",
                    borderBottom: i < data.subgenres.length - 1 ? `1px solid ${C.border}` : "none",
                  }}
                >
                  <div style={{ fontSize: 13, color: C.text, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sg.name}</div>
                  <div style={{ ...mono, fontSize: 10, color: C.textDim }}>{sg.game_count} games</div>
                  <div style={{ height: 6, background: C.border, borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ width: `${barWidth}%`, height: "100%", background: barColor, borderRadius: 3, transition: "width 0.5s" }} />
                  </div>
                  <span style={{ ...mono, fontSize: 11, color: barColor, textAlign: "right", fontWeight: 600 }}>
                    {delta > 0 ? "+" : ""}{delta.toFixed(1)}
                  </span>
                  <div style={{ ...mono, fontSize: 10, color: C.textDim, textAlign: "right" }}>
                    OPS {sg.avg_ops?.toFixed(0) ?? "--"}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Creator Radar */}
        <div className="flex flex-col">
          <SectionHeader label="Creator Radar" sub={`YouTube attention leaders (${data.youtube_top.length} games tracked)`} />
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: "12px 16px", flex: 1 }}>
            {data.youtube_top.length === 0 ? (
              <div style={{ ...mono, fontSize: 12, color: C.textDim, textAlign: "center", padding: 20 }}>No YouTube data yet</div>
            ) : (
              data.youtube_top.map((yt, i) => (
                <div
                  key={yt.appid}
                  onClick={() => navigate(`/game/${yt.appid}`)}
                  style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "8px 0",
                    borderBottom: i < data.youtube_top.length - 1 ? `1px solid ${C.border}` : "none",
                    cursor: "pointer",
                  }}
                  className="hover:opacity-80 transition-opacity"
                >
                  <span style={{ ...mono, fontSize: 18, color: C.textDim, width: 22, fontWeight: 700, textAlign: "center", flexShrink: 0 }}>{i + 1}</span>
                  {yt.header_image_url && (
                    <div style={{ width: 48, height: 22, borderRadius: 3, overflow: "hidden", flexShrink: 0, border: `1px solid rgba(255,255,255,0.05)` }}>
                      <img src={yt.header_image_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: C.text, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{yt.title}</div>
                    <div style={{ display: "flex", gap: 10, marginTop: 2 }}>
                      <span style={{ ...mono, fontSize: 10, color: C.ccu, fontWeight: 600 }}>{fmtK(yt.total_views)} views</span>
                      <span style={{ ...mono, fontSize: 10, color: C.textDim }}>{yt.unique_channels} {yt.unique_channels === 1 ? "channel" : "channels"}</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      {/* ═══ PRICE & DEMO INTELLIGENCE (side by side) ═══ */}
      <section className="px-4 md:px-10 py-6 grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* Price Tiers */}
        <div>
          <SectionHeader label="Price Intelligence" sub="Performance by price tier" />
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: "20px 16px 8px" }}>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data.price_buckets}>
                <CartesianGrid stroke={C.border} strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fill: C.textDim, fontSize: 10, ...mono }} />
                <YAxis tick={{ fill: C.textDim, fontSize: 10, ...mono }} />
                <Tooltip
                  contentStyle={{ background: C.tile, border: `1px solid ${C.border}`, borderRadius: 6, ...mono, fontSize: 11 }}
                  formatter={(value: number, name: string) => {
                    if (name === "avg_ops") return [value?.toFixed(1), "Avg OPS"];
                    return [value, name];
                  }}
                />
                <Bar dataKey="median_reviews" name="Median Reviews" fill={C.textDim} barSize={28}>
                  {data.price_buckets.map((b, i) => (
                    <Cell key={i} fill={(b.avg_ops ?? 0) > 25 ? C.green : (b.avg_ops ?? 0) > 15 ? C.amber : C.textDim} opacity={0.7} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div style={{ ...mono, fontSize: 9, color: C.textDim, textAlign: "center", marginTop: 4 }}>
              Bar color = avg OPS (green &gt; 25, amber &gt; 15)
            </div>
          </div>
        </div>

        {/* Demo Impact */}
        <div>
          <SectionHeader label="Demo Impact" sub="Performance with vs without demo" />
          <Narrative text={data.price_narrative} />
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 20 }}>
            <div className="grid grid-cols-2 gap-4">
              {data.demo_cohorts.map((c) => {
                const isDemo = c.label === "With Demo";
                return (
                  <div key={c.label} style={{ textAlign: "center" }}>
                    <div style={{ ...mono, fontSize: 11, color: isDemo ? C.green : C.textDim, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12, fontWeight: 600 }}>
                      {c.label}
                    </div>
                    {[
                      { label: "Games", value: String(c.game_count) },
                      { label: "Med. Reviews", value: String(Math.round(c.median_reviews)) },
                      { label: "Sentiment", value: `${c.median_sentiment}%` },
                      { label: "Avg OPS", value: c.avg_ops?.toFixed(1) ?? "--" },
                      { label: "Med. Peak CCU", value: String(Math.round(c.median_peak_ccu)) },
                    ].map((row) => (
                      <div key={row.label} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${C.border}` }}>
                        <span style={{ fontSize: 12, color: C.textDim }}>{row.label}</span>
                        <span style={{ ...mono, fontSize: 13, color: C.text, fontWeight: 500 }}>{row.value}</span>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ═══ SURGING NOW ═══ */}
      <section className="px-4 md:px-10 py-6">
        <SectionHeader label="Surging Now" sub="Games gaining the most momentum this week" />
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
          {data.surgers.map((s, i) => (
            <div
              key={s.appid}
              onClick={() => navigate(`/game/${s.appid}`)}
              className="flex items-center gap-3 md:gap-4 px-3 md:px-5 py-3"
              style={{
                borderBottom: i < data.surgers.length - 1 ? `1px solid ${C.border}` : "none",
                cursor: "pointer",
                transition: "background 0.15s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = C.tile; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              {/* Rank */}
              <span style={{ ...mono, fontWeight: 700, color: C.accent }} className="text-base md:text-xl w-6 md:w-8 text-center flex-shrink-0">
                {i + 1}
              </span>

              {/* Thumbnail — hidden on mobile */}
              {s.header_image_url && (
                <img
                  src={s.header_image_url}
                  alt=""
                  className="hidden md:block"
                  style={{ width: 120, height: 45, objectFit: "cover", borderRadius: 4, flexShrink: 0 }}
                />
              )}

              {/* Title + Developer */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="text-xs md:text-sm" style={{ fontWeight: 600, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {s.title}
                </div>
                <div style={{ fontSize: 11, color: C.textDim, marginTop: 1 }}>
                  {s.developer || "Unknown"} · {s.subgenre}
                </div>
              </div>

              {/* OPS + Delta */}
              <div className="flex-shrink-0 text-center w-12 md:w-[70px]">
                <div style={{ ...mono, fontWeight: 700, color: (s.ops_score ?? 0) >= 60 ? C.green : (s.ops_score ?? 0) >= 30 ? C.amber : C.textDim }} className="text-base md:text-lg">
                  {s.ops_score?.toFixed(0) ?? "--"}
                </div>
                {s.ops_delta != null && (
                  <div style={{ ...mono, fontSize: 10, color: s.ops_delta > 0 ? C.green : C.red }}>
                    {s.ops_delta > 0 ? "+" : ""}{s.ops_delta.toFixed(1)}
                  </div>
                )}
              </div>

              {/* Velocity Spark — hidden on mobile */}
              <div className="hidden md:block">
                <VelocitySpark data={s.velocity_spark} />
              </div>

              {/* Reviews */}
              <div className="hidden md:block" style={{ textAlign: "right", width: 80 }}>
                <div style={{ ...mono, fontSize: 13, color: C.text }}>{fmtK(s.review_count)}</div>
                {s.review_delta_7d > 0 && (
                  <div style={{ ...mono, fontSize: 10, color: C.green }}>+{s.review_delta_7d}</div>
                )}
              </div>

              {/* Price */}
              <div className="hidden md:block" style={{ ...mono, fontSize: 12, color: C.textDim, width: 50, textAlign: "right" }}>
                {s.price != null && s.price > 0 ? `$${s.price.toFixed(0)}` : "Free"}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
