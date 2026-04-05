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

// Palette constants used only in Recharts props and dynamic computed styles
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

// Recharts tick font-family prop (can't use Tailwind here)
const monoFont = { fontFamily: "'JetBrains Mono', 'Fira Code', monospace" };

function fmtK(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

function SectionHeader({ label, sub }: { label: string; sub?: string }) {
  return (
    <div className="mb-3">
      <div className="font-mono text-[11px] text-primary uppercase tracking-[2px] font-semibold">
        {label}
      </div>
      {sub && <div className="text-[13px] text-text-dim mt-0.5 italic">{sub}</div>}
    </div>
  );
}

function Narrative({ text }: { text: string }) {
  if (!text) return null;
  return (
    <div className="font-mono text-[13px] text-text-mid italic mb-4 leading-relaxed">
      {text}
    </div>
  );
}

/* ── Mini velocity spark (inline bar chart) ── */
function VelocitySpark({ data }: { data: number[] }) {
  const max = Math.max(...data, 1);
  return (
    <div className="flex items-end gap-0.5" style={{ height: 24, width: 64 }}>
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
      <div className="bg-background-dark min-h-screen flex items-center justify-center text-text-dim">
        <div className="font-mono text-sm">Loading market intelligence...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-background-dark min-h-screen flex items-center justify-center text-primary">
        <div className="font-mono text-sm">{error || "No data"}</div>
      </div>
    );
  }

  const h = data.headline;

  return (
    <div className="bg-background-dark min-h-screen text-text-main pb-20">

      {/* ═══ HEADLINE STRIP ═══ */}
      <section className="px-4 md:px-10 pt-6 md:pt-8">
        <div className="font-mono text-[11px] text-primary uppercase tracking-[3px] mb-1">
          The Pulse
        </div>
        <h1 className="font-display text-xl md:text-[32px] font-bold text-text-main mb-5">
          Indie Horror Market Intelligence
        </h1>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:flex md:flex-wrap gap-2 md:gap-3 mb-4">
          {[
            { label: "Games Tracked", value: fmtK(h.total_games), colorClass: "text-text-main" },
            { label: "New (30d)", value: String(h.new_last_30d), colorClass: "text-status-pos" },
            { label: "Total Reviews", value: fmtK(h.total_reviews), colorClass: "text-text-main" },
            { label: "Avg Sentiment", value: `${h.avg_sentiment}%`, colorClass: h.avg_sentiment >= 80 ? "text-status-pos" : "text-status-warn" },
            { label: "Breakouts", value: String(h.breakout_count), colorClass: "text-primary" },
            { label: "YT Videos", value: String(h.yt_videos_tracked), colorClass: "text-status-special" },
            { label: "Have Demos", value: `${h.demo_pct}%`, colorClass: "text-text-mid" },
          ].map((t) => (
            <div
              key={t.label}
              className="md:min-w-[110px] bg-[#1f1f22] border border-border-dark rounded-md px-[14px] py-[10px]"
            >
              <div className={`font-mono font-bold text-lg md:text-[22px] ${t.colorClass}`}>{t.value}</div>
              <div className="font-mono text-[9px] text-text-dim uppercase tracking-[1px] mt-0.5">{t.label}</div>
            </div>
          ))}
        </div>

        <Narrative text={data.market_narrative} />
      </section>

      {/* ═══ MARKET PULSE ═══ */}
      <section className="px-4 md:px-10 py-6">
        <SectionHeader label="Market Pulse" sub="12-week review velocity, OPS trend & new releases" />
        <div className="bg-surface-dark border border-border-dark rounded-lg px-4 pt-5 pb-2">
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={data.market_pulse}>
              <CartesianGrid stroke={C.border} strokeDasharray="3 3" />
              <XAxis dataKey="week_label" tick={{ fill: C.textDim, fontSize: 10, ...monoFont }} interval={1} />
              <YAxis yAxisId="reviews" tick={{ fill: C.green, fontSize: 10, ...monoFont }} tickFormatter={(v: number) => fmtK(v)} width={50} />
              <YAxis yAxisId="ops" orientation="right" tick={{ fill: C.textMid, fontSize: 10, ...monoFont }} domain={[0, 50]} width={35} />
              <Tooltip
                contentStyle={{ background: C.tile, border: `1px solid ${C.border}`, borderRadius: 6, ...monoFont, fontSize: 11 }}
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
          <div className="bg-surface-dark border border-border-dark rounded-lg px-4 py-3 flex-1">
            {data.subgenre_narrative && (
              <div className="text-[12px] text-text-mid italic mb-3 pb-2.5 border-b border-border-dark leading-[1.5]">
                {data.subgenre_narrative}
              </div>
            )}
            <table className="w-full border-collapse">
              <tbody>
                {data.subgenres.map((sg, i) => {
                  const delta = sg.ops_delta_4w ?? 0;
                  const barColor = delta > 2 ? C.green : delta < -2 ? C.red : C.amber;
                  const maxDelta = Math.max(...data.subgenres.map((s) => Math.abs(s.ops_delta_4w ?? 0)), 1);
                  const barWidth = Math.min(100, (Math.abs(delta) / maxDelta) * 100);
                  return (
                    <tr
                      key={sg.name}
                      className={i < data.subgenres.length - 1 ? "border-b border-border-dark" : ""}
                    >
                      <td className="text-[13px] text-text-main font-medium whitespace-nowrap py-2 pr-3">{sg.name}</td>
                      <td className="font-mono text-[10px] text-text-dim text-right py-2 pr-3 whitespace-nowrap">{sg.game_count}</td>
                      <td className="py-2 pr-3 w-full">
                        <div className="h-[6px] bg-border-dark rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-[width] duration-500"
                            style={{ width: `${barWidth}%`, background: barColor }}
                          />
                        </div>
                      </td>
                      <td
                        className="font-mono text-[11px] text-right font-semibold py-2 whitespace-nowrap"
                        style={{ color: barColor }}
                      >
                        {delta > 0 ? "+" : ""}{delta.toFixed(1)}
                      </td>
                      <td className="font-mono text-[10px] text-text-dim text-right py-2 pl-3 whitespace-nowrap">
                        OPS {sg.avg_ops?.toFixed(0) ?? "--"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Creator Radar */}
        <div className="flex flex-col">
          <SectionHeader label="Creator Radar" sub={`YouTube attention leaders (${data.youtube_top.length} games tracked)`} />
          <div className="bg-surface-dark border border-border-dark rounded-lg px-4 py-3 flex-1">
            {data.youtube_top.length === 0 ? (
              <div className="font-mono text-[12px] text-text-dim text-center p-5">No YouTube data yet</div>
            ) : (
              data.youtube_top.map((yt, i) => (
                <div
                  key={yt.appid}
                  onClick={() => navigate(`/game/${yt.appid}`)}
                  className={`flex items-center gap-2.5 py-2 cursor-pointer hover:opacity-80 transition-opacity ${
                    i < data.youtube_top.length - 1 ? "border-b border-border-dark" : ""
                  }`}
                >
                  <span className="font-mono text-lg text-text-dim w-[22px] font-bold text-center flex-shrink-0">
                    {i + 1}
                  </span>
                  {yt.header_image_url && (
                    <div className="w-12 h-[22px] rounded-sm overflow-hidden flex-shrink-0 border border-white/5">
                      <img src={yt.header_image_url} alt="" className="w-full h-full object-cover" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] text-text-main font-medium overflow-hidden text-ellipsis whitespace-nowrap">
                      {yt.title}
                    </div>
                    <div className="flex gap-2.5 mt-0.5">
                      <span className="font-mono text-[10px] text-status-special font-semibold">{fmtK(yt.total_views)} views</span>
                      <span className="font-mono text-[10px] text-text-dim">{yt.unique_channels} {yt.unique_channels === 1 ? "channel" : "channels"}</span>
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
          <div className="bg-surface-dark border border-border-dark rounded-lg px-4 pt-5 pb-2">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data.price_buckets}>
                <CartesianGrid stroke={C.border} strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fill: C.textDim, fontSize: 10, ...monoFont }} />
                <YAxis tick={{ fill: C.textDim, fontSize: 10, ...monoFont }} />
                <Tooltip
                  contentStyle={{ background: C.tile, border: `1px solid ${C.border}`, borderRadius: 6, ...monoFont, fontSize: 11 }}
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
            <div className="font-mono text-[9px] text-text-dim text-center mt-1">
              Bar color = avg OPS (green &gt; 25, amber &gt; 15)
            </div>
          </div>
        </div>

        {/* Demo Impact */}
        <div>
          <SectionHeader label="Demo Impact" sub="Performance with vs without demo" />
          <Narrative text={data.price_narrative} />
          <div className="bg-surface-dark border border-border-dark rounded-lg p-5">
            <div className="grid grid-cols-2 gap-4">
              {data.demo_cohorts.map((c) => {
                const isDemo = c.label === "With Demo";
                return (
                  <div key={c.label} className="text-center">
                    <div className={`font-mono text-[11px] ${isDemo ? "text-status-pos" : "text-text-dim"} uppercase tracking-[1px] mb-3 font-semibold`}>
                      {c.label}
                    </div>
                    {[
                      { label: "Games", value: String(c.game_count) },
                      { label: "Med. Reviews", value: String(Math.round(c.median_reviews)) },
                      { label: "Sentiment", value: `${c.median_sentiment}%` },
                      { label: "Avg OPS", value: c.avg_ops?.toFixed(1) ?? "--" },
                      { label: "Med. Peak CCU", value: String(Math.round(c.median_peak_ccu)) },
                    ].map((row) => (
                      <div key={row.label} className="flex justify-between py-1.5 border-b border-border-dark">
                        <span className="text-[12px] text-text-dim">{row.label}</span>
                        <span className="font-mono text-[13px] text-text-main font-medium">{row.value}</span>
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
        <div className="bg-surface-dark border border-border-dark rounded-lg overflow-hidden">
          {data.surgers.map((s, i) => (
            <div
              key={s.appid}
              onClick={() => navigate(`/game/${s.appid}`)}
              className={`flex items-center gap-3 md:gap-4 px-3 md:px-5 py-3 cursor-pointer hover:bg-[#1f1f22] transition-colors ${
                i < data.surgers.length - 1 ? "border-b border-border-dark" : ""
              }`}
            >
              {/* Rank */}
              <span className="font-mono font-bold text-primary text-base md:text-xl w-6 md:w-8 text-center flex-shrink-0">
                {i + 1}
              </span>

              {/* Thumbnail — hidden on mobile */}
              {s.header_image_url && (
                <img
                  src={s.header_image_url}
                  alt=""
                  className="hidden md:block rounded flex-shrink-0"
                  style={{ width: 120, height: 45, objectFit: "cover" }}
                />
              )}

              {/* Title + Developer */}
              <div className="flex-1 min-w-0">
                <div className="text-xs md:text-sm font-semibold text-text-main overflow-hidden text-ellipsis whitespace-nowrap">
                  {s.title}
                </div>
                <div className="text-[11px] text-text-dim mt-0.5">
                  {s.developer || "Unknown"} · {s.subgenre}
                </div>
              </div>

              {/* OPS + Delta */}
              <div className="flex-shrink-0 text-center w-12 md:w-[70px]">
                <div className={`font-mono font-bold text-base md:text-lg ${
                  (s.ops_score ?? 0) >= 60 ? "text-status-pos" : (s.ops_score ?? 0) >= 30 ? "text-status-warn" : "text-text-dim"
                }`}>
                  {s.ops_score?.toFixed(0) ?? "--"}
                </div>
                {s.ops_delta != null && (
                  <div className={`font-mono text-[10px] ${s.ops_delta > 0 ? "text-status-pos" : "text-status-neg"}`}>
                    {s.ops_delta > 0 ? "+" : ""}{s.ops_delta.toFixed(1)}
                  </div>
                )}
              </div>

              {/* Velocity Spark — hidden on mobile */}
              <div className="hidden md:block">
                <VelocitySpark data={s.velocity_spark} />
              </div>

              {/* Reviews */}
              <div className="hidden md:block text-right w-20">
                <div className="font-mono text-[13px] text-text-main">{fmtK(s.review_count)}</div>
                {s.review_delta_7d > 0 && (
                  <div className="font-mono text-[10px] text-status-pos">+{s.review_delta_7d}</div>
                )}
              </div>

              {/* Price */}
              <div className="hidden md:block font-mono text-[12px] text-text-dim w-[50px] text-right">
                {s.price != null && s.price > 0 ? `$${s.price.toFixed(0)}` : "Free"}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
