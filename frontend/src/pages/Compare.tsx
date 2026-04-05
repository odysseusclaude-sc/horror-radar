import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { fetchOne } from "../api/client";
import {
  ResponsiveContainer,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
} from "recharts";

/* ── Types ── */
interface CompareGame {
  appid: number;
  title: string;
  developer: string | null;
  header_image_url: string | null;
  price_usd: number | null;
  release_date: string | null;
  latest_snapshot: {
    review_count: number | null;
    review_score_pct: number | null;
    peak_ccu: number | null;
  } | null;
  latest_ops: {
    score: number | null;
    confidence: string | null;
    velocity_component: number | null;
    decay_component: number | null;
    review_component: number | null;
    youtube_component: number | null;
    ccu_component: number | null;
  } | null;
  review_delta_7d: number | null;
  ops_delta_7d: number | null;
}

/* ── Palette (shared with autopsy) ── */
const C = {
  bg: "#111314",
  surface: "#1a1a1c",
  border: "#2a2420",
  white: "#e8e0d4",
  dim: "#6b6058",
  ops: "#802626",
};
const mono: React.CSSProperties = { fontFamily: "'JetBrains Mono', monospace" };

/* ── Component colours by index ── */
const GAME_COLORS = ["#802626", "#38bdf8", "#5ec269"];

function fmtNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(n >= 10_000 ? 0 : 1) + "K";
  return n.toLocaleString();
}

function opsColor(score: number): string {
  if (score >= 60) return "#5ec269";
  if (score >= 30) return "#e8a832";
  return "#e25535";
}

function buildRadar(game: CompareGame): Record<string, number> {
  const ops = game.latest_ops;
  if (!ops) return {};
  return {
    Velocity: ops.velocity_component != null ? Math.min(100, Math.round((ops.velocity_component / 5.0) * 100)) : 0,
    Decay: ops.decay_component != null ? Math.min(100, Math.round((ops.decay_component / 2.0) * 100)) : 0,
    Reviews: ops.review_component != null ? Math.min(100, Math.round((ops.review_component / 5.0) * 100)) : 0,
    YouTube: ops.youtube_component != null ? Math.min(100, Math.round((ops.youtube_component / 1.8) * 100)) : 0,
    CCU: ops.ccu_component != null ? Math.min(100, Math.round((ops.ccu_component / 5.0) * 100)) : 0,
  };
}

export default function Compare() {
  const [params] = useSearchParams();
  const ids = (params.get("ids") ?? "").split(",").map(Number).filter(Boolean).slice(0, 3);
  const [games, setGames] = useState<(CompareGame | null)[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (ids.length === 0) { setLoading(false); return; }
    Promise.all(
      ids.map((id) =>
        fetchOne<CompareGame>(`/api/games/${id}`).catch(() => null)
      )
    ).then((results) => {
      setGames(results);
      setLoading(false);
    });
  }, [params.get("ids")]);

  const loaded = games.filter((g): g is CompareGame => g != null);

  // Build radar data (one row per axis, one key per game)
  const radarAxes = ["Velocity", "Decay", "Reviews", "YouTube", "CCU"];
  const radarData = radarAxes.map((axis) => {
    const row: Record<string, number | string> = { axis };
    loaded.forEach((g, i) => {
      const r = buildRadar(g);
      row[`g${i}`] = r[axis] ?? 0;
    });
    return row;
  });

  if (loading) {
    return (
      <div style={{ background: C.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span className="material-symbols-outlined text-primary text-4xl animate-spin">progress_activity</span>
      </div>
    );
  }

  if (ids.length < 2) {
    return (
      <div style={{ background: C.bg, minHeight: "100vh", color: C.white, padding: "60px 40px", textAlign: "center" }}>
        <div style={{ ...mono, fontSize: 11, color: C.dim, marginBottom: 12 }}>Select at least 2 games to compare</div>
        <Link to="/" style={{ ...mono, fontSize: 11, color: C.ops }}>← Back to database</Link>
      </div>
    );
  }

  /* ── Stat rows ── */
  const statRows = [
    {
      label: "OPS Score",
      values: loaded.map((g) => ({
        display: g.latest_ops?.score != null ? String(Math.round(g.latest_ops.score)) : "—",
        color: g.latest_ops?.score != null ? opsColor(g.latest_ops.score) : C.dim,
        numeric: g.latest_ops?.score ?? -1,
      })),
    },
    {
      label: "Reviews",
      values: loaded.map((g) => ({
        display: g.latest_snapshot?.review_count != null ? fmtNum(g.latest_snapshot.review_count) : "—",
        color: C.white,
        numeric: g.latest_snapshot?.review_count ?? -1,
      })),
    },
    {
      label: "Score %",
      values: loaded.map((g) => ({
        display: g.latest_snapshot?.review_score_pct != null ? Math.round(g.latest_snapshot.review_score_pct) + "%" : "—",
        color: g.latest_snapshot?.review_score_pct != null ? opsColor(g.latest_snapshot.review_score_pct) : C.dim,
        numeric: g.latest_snapshot?.review_score_pct ?? -1,
      })),
    },
    {
      label: "Peak CCU",
      values: loaded.map((g) => ({
        display: g.latest_snapshot?.peak_ccu != null && g.latest_snapshot.peak_ccu > 0 ? fmtNum(g.latest_snapshot.peak_ccu) : "—",
        color: C.white,
        numeric: g.latest_snapshot?.peak_ccu ?? -1,
      })),
    },
    {
      label: "Price",
      values: loaded.map((g) => ({
        display: g.price_usd === 0 ? "Free" : g.price_usd != null ? `$${g.price_usd.toFixed(2)}` : "—",
        color: g.price_usd === 0 ? "#5ec269" : C.white,
        numeric: g.price_usd ?? -1,
      })),
    },
    {
      label: "Δ Rev 7D",
      values: loaded.map((g) => ({
        display: g.review_delta_7d != null ? (g.review_delta_7d > 0 ? "+" : "") + g.review_delta_7d.toLocaleString() : "—",
        color: g.review_delta_7d != null ? (g.review_delta_7d > 0 ? "#5ec269" : g.review_delta_7d < 0 ? "#e25535" : C.dim) : C.dim,
        numeric: g.review_delta_7d ?? -999,
      })),
    },
    {
      label: "OPS Δ 7D",
      values: loaded.map((g) => ({
        display: g.ops_delta_7d != null && Math.abs(g.ops_delta_7d) >= 1 ? (g.ops_delta_7d > 0 ? "↑" : "↓") + Math.abs(Math.round(g.ops_delta_7d)) : "—",
        color: g.ops_delta_7d != null ? (g.ops_delta_7d > 0 ? "#5ec269" : "#e25535") : C.dim,
        numeric: g.ops_delta_7d ?? -999,
      })),
    },
  ];

  // Highlight best value per row
  function isBest(row: typeof statRows[0], idx: number): boolean {
    const best = Math.max(...row.values.map((v) => v.numeric));
    return best > 0 && row.values[idx].numeric === best;
  }

  return (
    <div style={{ background: C.bg, minHeight: "100vh", color: C.white, padding: "32px 40px 80px" }}
      className="page-enter"
    >
      {/* Header */}
      <div style={{ ...mono, fontSize: 10, color: C.dim, textTransform: "uppercase", letterSpacing: 2, marginBottom: 8 }}>
        <Link to="/" style={{ color: C.dim, textDecoration: "none" }}>← Database</Link>
        <span style={{ margin: "0 8px" }}>|</span>
        Side-by-Side Comparison
      </div>
      <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 28, fontWeight: 700, margin: "0 0 28px", color: C.white }}>
        Game Comparison
      </h1>

      {/* Game header cards */}
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${loaded.length}, 1fr)`, gap: 12, marginBottom: 28 }}>
        {loaded.map((g, i) => (
          <div key={g.appid} style={{ background: C.surface, border: `1px solid ${GAME_COLORS[i]}40`, borderRadius: 6, overflow: "hidden" }}>
            {g.header_image_url && (
              <img src={g.header_image_url} alt={g.title} style={{ width: "100%", height: 80, objectFit: "cover" }} />
            )}
            <div style={{ padding: "10px 12px" }}>
              <div style={{ fontFamily: "'Public Sans', sans-serif", fontSize: 13, fontWeight: 700, color: C.white, marginBottom: 2 }}>
                {g.title}
              </div>
              <div style={{ ...mono, fontSize: 9, color: C.dim }}>{g.developer || "Unknown"}</div>
              <div style={{ ...mono, fontSize: 9, color: GAME_COLORS[i], marginTop: 4, textTransform: "uppercase", letterSpacing: 1 }}>
                Game {i + 1}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Stat comparison table */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, marginBottom: 28, overflow: "hidden" }}>
        <div style={{
          display: "grid",
          gridTemplateColumns: `160px repeat(${loaded.length}, 1fr)`,
          borderBottom: `1px solid ${C.border}`,
          padding: "10px 16px",
          background: "#111314",
        }}>
          <div style={{ ...mono, fontSize: 9, color: C.dim, textTransform: "uppercase", letterSpacing: 1.5 }}>Metric</div>
          {loaded.map((g, i) => (
            <div key={g.appid} style={{ ...mono, fontSize: 9, color: GAME_COLORS[i], textTransform: "uppercase", letterSpacing: 1.5 }}>
              Game {i + 1}
            </div>
          ))}
        </div>
        {statRows.map((row) => (
          <div key={row.label} style={{
            display: "grid",
            gridTemplateColumns: `160px repeat(${loaded.length}, 1fr)`,
            padding: "12px 16px",
            borderBottom: `1px solid ${C.border}`,
          }}>
            <div style={{ ...mono, fontSize: 10, color: C.dim }}>{row.label}</div>
            {row.values.map((v, i) => (
              <div key={i} style={{
                ...mono,
                fontSize: 16,
                fontWeight: 700,
                color: v.color,
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}>
                {v.display}
                {isBest(row, i) && (
                  <span style={{ fontSize: 9, color: "#5ec269", background: "#5ec26920", border: "1px solid #5ec26940", borderRadius: 3, padding: "1px 4px" }}>
                    BEST
                  </span>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Radar overlay */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: "16px 20px" }}>
        <div style={{ ...mono, fontSize: 9, textTransform: "uppercase", letterSpacing: 1.5, color: C.dim, marginBottom: 16 }}>
          OPS Component Radar Overlay
        </div>
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <ResponsiveContainer width="100%" height={280}>
              <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="70%">
                <PolarGrid stroke={C.border} />
                <PolarAngleAxis dataKey="axis" tick={{ fill: C.dim, fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }} />
                <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                {loaded.map((g, i) => (
                  <Radar
                    key={g.appid}
                    name={g.title}
                    dataKey={`g${i}`}
                    stroke={GAME_COLORS[i]}
                    fill={`${GAME_COLORS[i]}20`}
                    strokeWidth={2}
                    dot={{ fill: GAME_COLORS[i], r: 3 }}
                    isAnimationActive={false}
                  />
                ))}
              </RadarChart>
            </ResponsiveContainer>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {loaded.map((g, i) => (
              <div key={g.appid} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 12, height: 3, background: GAME_COLORS[i], borderRadius: 2 }} />
                <div style={{ ...mono, fontSize: 11, color: C.white }}>{g.title}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
