import { Link, useNavigate } from "react-router-dom";
import type { GameListItem, YoutubeChannelBrief } from "../types";

interface GameRowProps {
  game: GameListItem;
  even: boolean;
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
  const diff = Date.now() - d.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function daysBadgeColor(d: number): string {
  if (d <= 7) return "bg-status-pos/10 text-status-pos border-status-pos/20";
  if (d <= 30) return "bg-status-warn/10 text-status-warn border-status-warn/20";
  return "bg-status-neg/10 text-status-neg border-status-neg/20";
}

function scorePctColor(pct: number): string {
  if (pct >= 80) return "text-status-pos";
  if (pct >= 60) return "text-status-warn";
  return "text-status-neg";
}

function channelBadgeTag(ch: YoutubeChannelBrief): string | null {
  if (ch.subscriber_count && ch.subscriber_count >= 5_000_000) return "HIGH REACH";
  if (ch.top_video_views && ch.top_video_views >= 500_000) return "VIRAL";
  return null;
}

export default function GameRow({ game, even, isWatched = false, onToggleWatch, isInCompare = false, onToggleCompare, canAddToCompare = true }: GameRowProps) {
  const navigate = useNavigate();
  const days = daysSince(game.release_date);
  const snap = game.latest_snapshot;
  const reviewCount = snap?.review_count ?? null;
  const scorePct = snap?.review_score_pct ?? null;
  const peakCcu = snap?.peak_ccu ?? null;
  const reviewDelta = game.review_delta_7d ?? null;
  const channels = game.youtube_channels ?? [];
  const demoReviews = snap?.demo_review_count ?? null;

  return (
    <tr
      className={`h-14 hover:bg-primary/5 transition-colors group cursor-pointer ${
        even ? "bg-surface-dark/40" : ""
      }`}
      onClick={(e) => {
        // Don't navigate if clicking a link or button
        if ((e.target as HTMLElement).closest("a, button")) return;
        navigate(`/game/${game.appid}`);
      }}
    >
      {/* Game & Developer + YouTube badges */}
      <td className="px-6 py-2">
        <div className="flex items-center gap-3">
          {onToggleWatch && (
            <button
              onClick={(e) => { e.stopPropagation(); onToggleWatch(game.appid); }}
              title={isWatched ? "Remove from watchlist" : "Add to watchlist"}
              className={`flex-shrink-0 transition-colors ${isWatched ? "text-status-warn" : "text-border-dark hover:text-text-dim"}`}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16, fontVariationSettings: isWatched ? "'FILL' 1" : "'FILL' 0" }}>
                bookmark
              </span>
            </button>
          )}
          {onToggleCompare && (
            <button
              onClick={(e) => { e.stopPropagation(); onToggleCompare(game.appid); }}
              title={isInCompare ? "Remove from compare" : canAddToCompare ? "Add to compare" : "Compare is full (max 3)"}
              disabled={!isInCompare && !canAddToCompare}
              className={`flex-shrink-0 transition-colors ${isInCompare ? "text-status-pos" : canAddToCompare ? "text-border-dark hover:text-text-dim" : "text-border-dark opacity-40 cursor-not-allowed"}`}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                {isInCompare ? "check_box" : "check_box_outline_blank"}
              </span>
            </button>
          )}
          <a
            href={`https://store.steampowered.com/app/${game.appid}`}
            target="_blank"
            rel="noopener noreferrer"
            title="View on Steam"
          >
            <div className="w-[72px] h-[34px] rounded border border-white/5 overflow-hidden flex-shrink-0">
              {game.header_image_url ? (
                <img
                  className="w-full h-full object-cover grayscale-[30%] group-hover:grayscale-0 transition-all"
                  src={game.header_image_url}
                  alt={game.title}
                  loading="lazy"
                />
              ) : (
                <div className="w-full h-full bg-border-dark" />
              )}
            </div>
          </a>
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-1.5">
              <Link
                to={`/game/${game.appid}`}
                className="font-bold text-sm leading-tight group-hover:text-primary transition-colors truncate hover:underline"
              >
                {game.title}
              </Link>
              {game.is_multiplayer && (
                <span className="material-symbols-outlined text-status-info flex-shrink-0" style={{ fontSize: 14 }} title="Multiplayer">
                  group
                </span>
              )}
              {game.has_demo && (
                <span className="px-1.5 py-0.5 rounded text-[8px] font-black tracking-widest bg-status-info/10 text-status-info border border-status-info/20 flex-shrink-0">
                  &#x2713; DEMO
                </span>
              )}
            </div>
            <span className="text-[10px] text-text-dim uppercase tracking-tight truncate">
              {game.developer || "Unknown"}
              {demoReviews != null && demoReviews > 0 && (
                <span className="text-status-info ml-1">
                  ({demoReviews.toLocaleString()} demo reviews)
                </span>
              )}
            </span>
          </div>
        </div>
      </td>

      {/* Days */}
      <td className="px-4 py-2 text-center">
        {days !== null ? (
          <span
            className={`px-2 py-0.5 rounded text-[10px] font-bold border ${daysBadgeColor(days)}`}
          >
            {days}d
          </span>
        ) : (
          <span className="text-text-dim text-xs">—</span>
        )}
      </td>

      {/* Price */}
      <td className="px-4 py-2 font-mono text-sm">
        {game.price_usd === 0 ? (
          <span className="text-status-pos font-bold">Free</span>
        ) : game.price_usd !== null ? (
          <span>${game.price_usd.toFixed(2)}</span>
        ) : (
          <span className="text-text-dim">—</span>
        )}
      </td>

      {/* Reviews (7D) — count + trend arrow */}
      <td className="px-4 py-2">
        <div className="flex items-center gap-1 font-bold text-sm">
          {reviewCount !== null && reviewCount > 0 ? (
            <>
              <span>{reviewCount.toLocaleString()}</span>
              {reviewDelta !== null && reviewDelta > 0 ? (
                <span className="material-symbols-outlined text-status-pos" style={{ fontSize: 16 }}>
                  trending_up
                </span>
              ) : reviewDelta !== null && reviewDelta < 0 ? (
                <span className="material-symbols-outlined text-status-neg" style={{ fontSize: 16 }}>
                  trending_down
                </span>
              ) : (
                <span className="text-text-dim text-xs font-normal">—</span>
              )}
            </>
          ) : (
            <span className="text-text-dim">—</span>
          )}
        </div>
      </td>

      {/* Score % */}
      <td className="px-4 py-2">
        {scorePct !== null ? (
          <div className={`flex items-center gap-1 text-sm font-bold ${scorePctColor(scorePct)}`}>
            <span className="material-symbols-outlined text-primary" style={{ fontSize: 15 }}>
              skull
            </span>
            {Math.round(scorePct)}%
          </div>
        ) : (
          <span className="text-text-dim text-sm">—</span>
        )}
      </td>

      {/* Δ Rev 7D — rolling 7-day review delta */}
      <td className="px-4 py-2 font-mono text-sm">
        {reviewDelta !== null ? (
          <span className={reviewDelta > 0 ? "text-status-pos font-bold" : reviewDelta < 0 ? "text-status-neg font-bold" : "text-text-dim"}>
            {reviewDelta > 0 ? "+" : ""}{reviewDelta.toLocaleString()}
          </span>
        ) : (
          <span className="text-text-dim">—</span>
        )}
      </td>

      {/* Peak CCU */}
      <td className="px-4 py-2 font-mono text-sm">
        {peakCcu !== null && peakCcu > 0 ? (
          peakCcu.toLocaleString()
        ) : (
          <span className="text-text-dim">—</span>
        )}
      </td>

      {/* YouTube Visibility */}
      <td className="px-4 py-2">
        {channels.length === 0 ? (
          <span className="text-text-dim italic text-xs">
            {days !== null && days <= 14 ? "No coverage yet" : "—"}
          </span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {channels.slice(0, 3).map((ch) => {
              const tag = channelBadgeTag(ch);
              return (
                <span
                  key={ch.channel_id}
                  className={`px-1.5 py-0 rounded text-[9px] font-bold tracking-wide ${
                    tag === "HIGH REACH"
                      ? "bg-status-special/10 text-status-special border border-status-special/20"
                      : tag === "VIRAL"
                      ? "bg-status-neg/10 text-status-neg border border-status-neg/20"
                      : "bg-surface-dark text-text-dim border border-border-dark"
                  }`}
                >
                  {ch.name.toUpperCase()}
                  {tag && <span className="ml-1 text-[8px] opacity-70">{tag}</span>}
                </span>
              );
            })}
            {channels.length > 3 && (
              <span className="text-[9px] text-text-dim">+{channels.length - 3}</span>
            )}
          </div>
        )}
      </td>

      {/* OPS Score — 3-layer display */}
      <td className="px-6 py-2 text-right">
        {game.latest_ops?.score != null && game.latest_ops.score > 0 ? (
          <div className="flex flex-col items-end gap-0.5">
            {/* Layer 1: Score */}
            <div className="flex items-baseline gap-1.5">
              <span
                className={`text-lg font-black tabular-nums ${
                  game.latest_ops.score >= 60
                    ? "text-status-pos"
                    : game.latest_ops.score >= 30
                    ? "text-status-warn"
                    : "text-status-neg"
                }`}
              >
                {Math.round(game.latest_ops.score)}
              </span>
              {/* Layer 3: 7-day trend delta (only show if |delta| >= 2 to filter noise) */}
              {game.ops_delta_7d != null && Math.abs(game.ops_delta_7d) >= 2 && (
                <span
                  className={`text-[10px] font-bold tabular-nums ${
                    game.ops_delta_7d > 0 ? "text-status-pos" : "text-status-neg"
                  }`}
                >
                  {game.ops_delta_7d > 0 ? "↑" : "↓"}
                  {Math.abs(Math.round(game.ops_delta_7d))}
                </span>
              )}
            </div>
            {/* Layer 2: Visual confidence dots */}
            <div className="flex items-center gap-1" title={
              game.latest_ops.confidence === "high"
                ? "High data coverage"
                : game.latest_ops.confidence === "medium"
                ? "Moderate data coverage"
                : "Limited data coverage"
            }>
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className={`inline-block w-[5px] h-[5px] rounded-full ${
                    (game.latest_ops!.confidence === "high" && i <= 2) ||
                    (game.latest_ops!.confidence === "medium" && i <= 1) ||
                    (game.latest_ops!.confidence === "low" && i === 0)
                      ? "bg-text-mid"
                      : "bg-border-dark"
                  }`}
                />
              ))}
            </div>
          </div>
        ) : (
          <span className="text-text-dim italic text-xs">—</span>
        )}
      </td>
    </tr>
  );
}
