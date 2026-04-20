import { Link } from "react-router-dom";
import type { GameListItem } from "../types";
import OpsBadge from "./OpsBadge";
import DaysBadge from "./DaysBadge";
import ChannelBadges from "./ChannelBadges";

interface GameCardProps {
  game: GameListItem;
  isWatched?: boolean;
  onToggleWatch?: (appid: number) => void;
  isInCompare?: boolean;
  onToggleCompare?: (appid: number) => void;
  canAddToCompare?: boolean;
}

function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
}

function scorePctColor(pct: number): string {
  if (pct >= 80) return "text-status-pos";
  if (pct >= 60) return "text-status-warn";
  return "text-status-neg";
}

export default function GameCard({ game, isWatched = false, onToggleWatch, isInCompare = false, onToggleCompare, canAddToCompare = true }: GameCardProps) {
  const days = daysSince(game.release_date);
  const snap = game.latest_snapshot;
  const reviewCount = snap?.review_count ?? null;
  const scorePct = snap?.review_score_pct ?? null;
  const peakCcu = snap?.peak_ccu ?? null;
  const reviewDelta = game.review_delta_7d ?? null;
  const ops = game.latest_ops;
  const channels = game.youtube_channels ?? [];
  const hasBreakout = ops?.score != null && ops.score >= 60;

  return (
    <Link
      to={`/game/${game.appid}`}
      className={`block px-4 py-3 hover:bg-primary/5 active:bg-primary/10 transition-colors ${
        hasBreakout ? "border-l-2 border-status-pos" : "border-l-2 border-transparent"
      }`}
    >
      {/* Top row: image + title + OPS */}
      <div className="flex items-start gap-3">
        <div className="w-14 h-[26px] rounded border border-white/5 overflow-hidden flex-shrink-0 mt-0.5">
          {game.header_image_url ? (
            <img
              className="w-full h-full object-cover"
              src={game.header_image_url}
              alt={game.title}
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full bg-border-dark" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-sm leading-tight truncate">
              {game.title}
            </span>
            {game.has_demo && (
              <span className="px-1.5 py-0.5 rounded text-[8px] font-black tracking-widest bg-status-info/10 text-status-info border border-status-info/20 flex-shrink-0">
                &#x2713; DEMO
              </span>
            )}
          </div>
          <span className="text-[10px] text-text-dim uppercase tracking-tight truncate block">
            {game.developer || "Unknown"}
          </span>
        </div>
        {/* OPS badge + bookmark */}
        <div className="flex-shrink-0 flex flex-col items-end gap-1">
          {ops?.score != null && ops.score > 0 ? (
            <OpsBadge ops={ops} delta={game.ops_delta_7d} dotSize="w-[5px] h-[5px]" />
          ) : (
            <span className="text-text-dim italic text-xs">--</span>
          )}
          {onToggleWatch && (
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleWatch(game.appid); }}
              title={isWatched ? "Remove from watchlist" : "Add to watchlist"}
              className={`transition-colors ${isWatched ? "text-status-warn" : "text-border-dark hover:text-text-dim"}`}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 14, fontVariationSettings: isWatched ? "'FILL' 1" : "'FILL' 0" }}>
                bookmark
              </span>
            </button>
          )}
          {onToggleCompare && (
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleCompare(game.appid); }}
              title={isInCompare ? "Remove from compare" : canAddToCompare ? "Add to compare" : "Compare full"}
              disabled={!isInCompare && !canAddToCompare}
              className={`transition-colors ${isInCompare ? "text-status-pos" : canAddToCompare ? "text-border-dark hover:text-text-dim" : "text-border-dark opacity-40"}`}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                {isInCompare ? "check_box" : "check_box_outline_blank"}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[11px] font-mono">
        {/* Days badge */}
        {days !== null && <DaysBadge days={days} />}

        {/* Price */}
        <span>
          {game.price_usd === 0 ? (
            <span className="text-status-pos font-bold">Free</span>
          ) : game.price_usd != null ? (
            <span className="text-text-dim">${game.price_usd.toFixed(2)}</span>
          ) : (
            <span className="text-text-dim">--</span>
          )}
        </span>

        {/* Reviews + delta */}
        {reviewCount != null && reviewCount > 0 && (
          <span className="flex items-center gap-0.5">
            <span className="text-text-main font-bold">{reviewCount.toLocaleString()}</span>
            <span className="text-text-dim">rev</span>
            {reviewDelta != null && (
              <span className={reviewDelta > 0 ? "text-status-pos" : reviewDelta < 0 ? "text-status-neg" : "text-text-dim"}>
                {reviewDelta > 0 ? `+${reviewDelta}` : reviewDelta < 0 ? `${reviewDelta}` : ""}
              </span>
            )}
          </span>
        )}

        {/* Score % */}
        {scorePct != null && (
          <span className={`font-bold ${scorePctColor(scorePct)}`}>
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

      {/* YouTube channel badges with VIRAL/HIGH REACH */}
      {channels.length > 0 && (
        <div className="mt-1.5">
          <ChannelBadges channels={channels} maxVisible={3} daysSince={days} />
        </div>
      )}
    </Link>
  );
}
