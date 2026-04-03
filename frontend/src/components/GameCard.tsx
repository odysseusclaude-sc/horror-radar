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
  if (d <= 7) return "bg-green-950/40 text-green-400 border-green-900/40";
  if (d <= 30) return "bg-amber-950/40 text-amber-400 border-amber-900/40";
  return "bg-red-950/40 text-red-400 border-red-900/40";
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
            className="w-16 h-[24px] object-cover rounded border border-white/5 flex-shrink-0 mt-0.5"
            src={game.header_image_url}
            alt={game.title}
          />
        ) : (
          <div className="w-16 h-[24px] rounded border border-white/5 bg-border-dark flex-shrink-0 mt-0.5" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-sm leading-tight truncate">
              {game.title}
            </span>
            {game.has_demo && (
              <span className="px-1 py-0.5 rounded text-[7px] font-black tracking-widest bg-cyan-950/50 text-cyan-300 border border-cyan-800/40 flex-shrink-0">
                DEMO
              </span>
            )}
          </div>
          <span className="text-[10px] text-text-dim uppercase tracking-tight truncate block">
            {game.developer || "Unknown"}
          </span>
        </div>
        {/* OPS badge */}
        {ops?.score != null && ops.score > 0 ? (
          <div className="flex-shrink-0 text-right">
            <span
              className={`text-lg font-black tabular-nums ${
                ops.score >= 60
                  ? "text-green-400"
                  : ops.score >= 30
                  ? "text-amber-400"
                  : "text-red-400"
              }`}
            >
              {Math.round(ops.score)}
            </span>
            <div className="text-[8px] uppercase tracking-widest text-text-dim font-bold">OPS</div>
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
            <span className="text-green-400 font-bold">Free</span>
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
              <span className="text-green-400">+{reviewDelta}</span>
            )}
          </span>
        )}

        {/* Score */}
        {scorePct != null && (
          <span className={scorePct >= 80 ? "text-green-400" : scorePct >= 60 ? "text-amber-400" : "text-red-400"}>
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
