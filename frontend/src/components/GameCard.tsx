import { Link } from "react-router-dom";
import type { GameListItem } from "../types";
import OpsBadge from "./OpsBadge";
import DaysBadge from "./DaysBadge";
import ChannelBadges from "./ChannelBadges";

interface GameCardProps {
  game: GameListItem;
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

export default function GameCard({ game }: GameCardProps) {
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
        {/* OPS badge */}
        {ops?.score != null && ops.score > 0 ? (
          <div className="flex-shrink-0">
            <OpsBadge ops={ops} delta={game.ops_delta_7d} dotSize="w-[5px] h-[5px]" />
          </div>
        ) : (
          <div className="flex-shrink-0 text-text-dim italic text-xs">--</div>
        )}
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
