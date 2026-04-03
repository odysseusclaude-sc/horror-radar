import { Link } from "react-router-dom";
import type { GameListItem } from "../types";

interface GameCardProps {
  game: GameListItem;
}

function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
}

function daysBadgeColor(d: number): string {
  if (d <= 7) return "bg-status-pos/10 text-status-pos border-status-pos/20";
  if (d <= 30) return "bg-status-warn/10 text-status-warn border-status-warn/20";
  return "bg-status-neg/10 text-status-neg border-status-neg/20";
}

export default function GameCard({ game }: GameCardProps) {
  const days = daysSince(game.release_date);
  const snap = game.latest_snapshot;
  const reviewCount = snap?.review_count ?? null;
  const scorePct = snap?.review_score_pct ?? null;
  const peakCcu = snap?.peak_ccu ?? null;
  const reviewDelta = game.review_delta_7d ?? null;
  const ops = game.latest_ops;

  return (
    <Link
      to={`/game/${game.appid}`}
      className="block px-4 py-3 hover:bg-primary/5 active:bg-primary/10 transition-colors"
    >
      {/* Top row: image + title + OPS */}
      <div className="flex items-start gap-3">
        {game.header_image_url ? (
          <img
            className="w-14 aspect-[460/215] object-cover rounded border border-white/5 flex-shrink-0 mt-0.5"
            src={game.header_image_url}
            alt={game.title}
            loading="lazy"
          />
        ) : (
          <div className="w-14 aspect-[460/215] rounded border border-white/5 bg-border-dark flex-shrink-0 mt-0.5" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-sm leading-tight truncate">
              {game.title}
            </span>
            {game.has_demo && (
              <span className="px-1 py-0.5 rounded text-[7px] font-black tracking-widest bg-status-info/10 text-status-info border border-status-info/20 flex-shrink-0">
                DEMO
              </span>
            )}
          </div>
          <span className="text-[10px] text-text-dim uppercase tracking-tight truncate block">
            {game.developer || "Unknown"}
          </span>
        </div>
        {/* OPS badge — 3-layer */}
        {ops?.score != null && ops.score > 0 ? (
          <div className="flex-shrink-0 text-right">
            <div className="flex items-baseline gap-1 justify-end">
              <span
                className={`text-lg font-black tabular-nums ${
                  ops.score >= 60
                    ? "text-status-pos"
                    : ops.score >= 30
                    ? "text-status-warn"
                    : "text-status-neg"
                }`}
              >
                {Math.round(ops.score)}
              </span>
              {game.ops_delta_7d != null && Math.abs(game.ops_delta_7d) >= 2 && (
                <span
                  className={`text-[9px] font-bold tabular-nums ${
                    game.ops_delta_7d > 0 ? "text-status-pos" : "text-status-neg"
                  }`}
                >
                  {game.ops_delta_7d > 0 ? "↑" : "↓"}
                  {Math.abs(Math.round(game.ops_delta_7d))}
                </span>
              )}
            </div>
            <div className="flex items-center gap-0.5 justify-end mt-0.5">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className={`inline-block w-1 h-1 rounded-full ${
                    (ops.confidence === "high" && i <= 2) ||
                    (ops.confidence === "medium" && i <= 1) ||
                    (ops.confidence === "low" && i === 0)
                      ? "bg-text-mid"
                      : "bg-border-dark"
                  }`}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="flex-shrink-0 text-text-dim italic text-xs">--</div>
        )}
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-3 mt-2 text-[11px] font-mono">
        {/* Days badge */}
        {days !== null && (
          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${daysBadgeColor(days)}`}>
            {days}d
          </span>
        )}

        {/* Price */}
        <span className="text-text-dim">
          {game.price_usd === 0 ? (
            <span className="text-status-pos font-bold">Free</span>
          ) : game.price_usd != null ? (
            `$${game.price_usd.toFixed(2)}`
          ) : (
            "--"
          )}
        </span>

        {/* Reviews */}
        {reviewCount != null && reviewCount > 0 && (
          <span className="flex items-center gap-0.5">
            <span className="text-text-main font-bold">{reviewCount.toLocaleString()}</span>
            <span className="text-text-dim">rev</span>
            {reviewDelta != null && reviewDelta > 0 && (
              <span className="text-status-pos">+{reviewDelta}</span>
            )}
          </span>
        )}

        {/* Score */}
        {scorePct != null && (
          <span className={scorePct >= 80 ? "text-status-pos" : scorePct >= 60 ? "text-status-warn" : "text-status-neg"}>
            {Math.round(scorePct)}%
          </span>
        )}

        {/* CCU */}
        {peakCcu != null && peakCcu > 0 && (
          <span className="text-text-dim">
            CCU {peakCcu.toLocaleString()}
          </span>
        )}
      </div>

      {/* YouTube channels */}
      {game.youtube_channels && game.youtube_channels.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {game.youtube_channels.map((ch) => (
            <span
              key={ch.channel_id}
              className="px-1.5 py-0.5 rounded text-[9px] font-bold border bg-surface-dark text-text-dim border-border-dark"
            >
              {ch.name.toUpperCase()}
            </span>
          ))}
        </div>
      )}
    </Link>
  );
}
