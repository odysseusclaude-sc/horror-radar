import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { DeveloperDetailOut } from "../types";

const API_BASE = import.meta.env.VITE_API_URL ?? "/api";

function opsColor(score: number | null) {
  if (score === null) return "text-text-dim";
  if (score >= 60) return "text-status-pos";
  if (score >= 30) return "text-status-warn";
  return "text-status-neg";
}

function opsGlyph(score: number | null) {
  if (score === null) return "–";
  if (score >= 60) return "▲";
  if (score >= 30) return "◆";
  return "▼";
}

export default function Developer() {
  const { name } = useParams<{ name: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<DeveloperDetailOut | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!name) return;
    setLoading(true);
    setError(null);
    fetch(`${API_BASE}/developers/${encodeURIComponent(name)}`)
      .then((r) => {
        if (!r.ok) throw new Error(r.status === 404 ? "Developer not found" : `HTTP ${r.status}`);
        return r.json();
      })
      .then((d: DeveloperDetailOut) => {
        setData(d);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, [name]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background-dark flex items-center justify-center">
        <span className="font-mono text-text-dim text-sm animate-pulse">Loading developer…</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-background-dark flex flex-col items-center justify-center gap-4">
        <span className="font-mono text-status-neg text-sm">{error ?? "Unknown error"}</span>
        <button
          onClick={() => navigate(-1)}
          className="font-mono text-xs text-text-dim hover:text-text-primary uppercase tracking-wider"
        >
          ← Back
        </button>
      </div>
    );
  }

  const topOps = data.games.reduce<number | null>((best, g) => {
    if (g.ops_score === null) return best;
    return best === null ? g.ops_score : Math.max(best, g.ops_score);
  }, null);

  return (
    <div className="min-h-screen bg-background-dark text-text-primary">
      <div className="max-w-4xl mx-auto px-4 py-8">

        {/* Back link */}
        <button
          onClick={() => navigate(-1)}
          className="font-mono text-xs text-text-dim hover:text-text-primary uppercase tracking-wider mb-6 inline-block"
        >
          ← Back
        </button>

        {/* Header */}
        <div className="mb-8">
          <h1 className="font-display text-2xl font-bold text-text-primary">{data.developer_name}</h1>
          <p className="font-mono text-xs text-text-dim uppercase tracking-widest mt-1">Developer Profile</p>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          <StatCard label="Horror Games" value={String(data.games.length)} />
          <StatCard label="Total Reviews" value={data.total_reviews.toLocaleString()} />
          <StatCard
            label="Avg Score"
            value={data.avg_review_score !== null ? `${Math.round(data.avg_review_score)}%` : "—"}
          />
          <StatCard
            label="Top OPS"
            value={topOps !== null ? String(Math.round(topOps)) : "—"}
            valueClass={opsColor(topOps)}
          />
        </div>

        {/* Game list */}
        {data.games.length === 0 ? (
          <p className="font-mono text-xs text-text-dim">No tracked horror games found.</p>
        ) : (
          <div className="space-y-2">
            <p className="font-mono text-xs text-text-dim uppercase tracking-widest mb-3">
              Horror Games ({data.games.length})
            </p>
            {data.games.map((g) => (
              <Link
                key={g.appid}
                to={`/game/${g.appid}`}
                className="flex items-center gap-3 bg-surface-dark hover:bg-white/5 rounded p-3 transition-colors"
              >
                {g.header_image_url && (
                  <img
                    src={g.header_image_url}
                    alt=""
                    className="w-16 h-9 object-cover rounded flex-shrink-0 opacity-80"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-display text-sm font-medium text-text-primary truncate">{g.title}</p>
                  <div className="flex items-center gap-3 mt-0.5">
                    {g.release_date && (
                      <span className="font-mono text-[10px] text-text-dim">{g.release_date}</span>
                    )}
                    {g.price_usd !== null && (
                      <span className="font-mono text-[10px] text-text-dim">
                        {g.price_usd === 0 ? "Free" : `$${g.price_usd.toFixed(2)}`}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex-shrink-0 text-right">
                  {g.ops_score !== null ? (
                    <span className={`font-mono text-sm font-bold ${opsColor(g.ops_score)}`}>
                      {opsGlyph(g.ops_score)} {Math.round(g.ops_score)}
                    </span>
                  ) : (
                    <span className="font-mono text-xs text-text-dim">—</span>
                  )}
                  {g.ops_confidence && (
                    <p className="font-mono text-[10px] text-text-dim uppercase">{g.ops_confidence}</p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}

        {data.computed_at && (
          <p className="font-mono text-[10px] text-text-dim mt-6">
            Profile computed {data.computed_at.split("T")[0]}
          </p>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  valueClass = "text-text-primary",
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="bg-surface-dark rounded p-3">
      <p className="font-mono text-[10px] text-text-dim uppercase tracking-widest mb-1">{label}</p>
      <p className={`font-mono text-xl font-bold ${valueClass}`}>{value}</p>
    </div>
  );
}
