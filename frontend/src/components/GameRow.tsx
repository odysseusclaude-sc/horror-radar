import { Link, useNavigate } from "react-router-dom";
import type { GameListItem, YoutubeChannelBrief } from "../types";

interface GameRowProps {
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

function daysBadge(d: number) {
  if (d <= 7)  return { cls: "bg-status-pos/12 text-status-pos",   icon: "✨" };
  if (d <= 30) return { cls: "bg-status-warn/12 text-status-warn", icon: "◐" };
  return { cls: "bg-status-neg/12 text-status-neg", icon: "◐" };
}

function scoreColor(pct: number) {
  if (pct >= 80) return "text-status-pos";
  if (pct >= 60) return "text-status-warn";
  return "text-status-neg";
}

function opsTier(score: number) {
  if (score >= 60) return { name: "Breakout", cls: "text-status-pos" };
  if (score >= 30) return { name: "Rising",   cls: "text-status-warn" };
  return { name: "Quiet", cls: "text-text-dim" };
}

function confidenceClass(conf: string | null) {
  if (conf === "high")   return "bg-status-pos/15 text-status-pos";
  if (conf === "medium") return "bg-status-warn/15 text-status-warn";
  return "bg-status-neg/15 text-status-neg";
}

function confidenceLabel(conf: string | null): string {
  if (conf === "high") return "HIGH";
  if (conf === "medium") return "MED";
  return "LOW";
}

function channelTag(ch: YoutubeChannelBrief): { label: string; cls: string } | null {
  if (ch.subscriber_count && ch.subscriber_count >= 5_000_000) {
    return { label: "HIGH REACH", cls: "bg-status-info/12 text-status-info" };
  }
  if (ch.top_video_views && ch.top_video_views >= 500_000) {
    return { label: "VIRAL", cls: "bg-status-neg/12 text-status-neg" };
  }
  return null;
}

function firstSubgenre(tagsJson: string | null): string | null {
  if (!tagsJson) return null;
  try {
    const obj = JSON.parse(tagsJson) as Record<string, number>;
    const priority = [
      "Psychological Horror",
      "Survival Horror",
      "Cosmic Horror",
      "Action Horror",
      "Horror",
    ];
    for (const p of priority) if (p in obj) return p;
  } catch { /* ignore */ }
  return null;
}

export default function GameRow({
  game,
  isWatched = false,
  onToggleWatch,
}: GameRowProps) {
  const navigate = useNavigate();
  const days = daysSince(game.release_date);
  const snap = game.latest_snapshot;
  const ops = game.latest_ops;
  const reviewCount = snap?.review_count ?? null;
  const peakCcu = snap?.peak_ccu ?? null;
  const reviewDelta = game.review_delta_7d ?? null;
  const scorePct = snap?.review_score_pct ?? null;
  const channels = (game.youtube_channels ?? []).slice(0, 2);
  const subgenre = firstSubgenre(game.tags);

  const onRowClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("a, button")) return;
    navigate(`/game/${game.appid}`);
  };

  return (
    <tr
      className="hover:bg-surface-dark/60 transition-colors cursor-pointer group"
      onClick={onRowClick}
    >
      {/* Game & Developer */}
      <td className="px-4 py-3 align-middle">
        <div className="flex items-center gap-3 min-w-[220px]">
          <div className="w-12 h-12 rounded bg-border-dark flex-shrink-0 overflow-hidden flex items-center justify-center text-xs text-text-dim">
            {game.header_image_url ? (
              <img
                src={game.header_image_url}
                alt=""
                className="w-full h-full object-cover grayscale-[20%] group-hover:grayscale-0 transition-all"
                loading="lazy"
              />
            ) : (
              <span aria-hidden="true">{game.title.slice(0, 2).toUpperCase()}</span>
            )}
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-sm text-text-main truncate max-w-[200px]">
              <Link to={`/game/${game.appid}`} className="hover:text-primary-light transition-colors">
                {game.title}
              </Link>
            </div>
            <div className="text-xs text-text-dim truncate max-w-[200px]">
              {game.developer ? (
                <Link
                  to={`/developers/${encodeURIComponent(game.developer)}`}
                  className="hover:text-text-main transition-colors"
                  onClick={(e) => e.stopPropagation()}
                >
                  {game.developer}
                </Link>
              ) : (
                "Unknown"
              )}
            </div>
            {subgenre && (
              <span className="inline-block mt-1 text-[10px] text-tertiary bg-tertiary/10 px-1.5 rounded">
                {subgenre}
              </span>
            )}
          </div>
        </div>
      </td>

      {/* Days */}
      <td className="px-4 py-3 align-middle">
        {days !== null ? (() => {
          const b = daysBadge(days);
          return (
            <span className={`inline-flex items-center gap-1 font-mono text-xs font-medium px-2 py-0.5 rounded-full ${b.cls}`}>
              <span className="text-[10px]" aria-hidden="true">{b.icon}</span>
              {days}d
            </span>
          );
        })() : <span className="text-text-dim">—</span>}
      </td>

      {/* Price */}
      <td className="px-4 py-3 align-middle font-mono text-sm">
        {game.price_usd === 0 ? (
          <span className="text-status-pos font-medium">Free</span>
        ) : game.price_usd !== null ? (
          <span className="text-text-main">${game.price_usd.toFixed(2)}</span>
        ) : (
          <span className="text-text-dim">—</span>
        )}
      </td>

      {/* Reviews */}
      <td className="px-4 py-3 align-middle">
        {reviewCount !== null && reviewCount > 0 ? (
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm text-text-main">{reviewCount.toLocaleString()}</span>
            {reviewDelta !== null && reviewDelta !== 0 && (
              <span
                className={`text-xs ${reviewDelta > 0 ? "text-status-pos" : "text-status-neg"}`}
                aria-label={reviewDelta > 0 ? "Trending up" : "Trending down"}
              >
                {reviewDelta > 0 ? "▲" : "▼"} {reviewDelta > 0 ? "+" : ""}{reviewDelta}
              </span>
            )}
          </div>
        ) : (
          <span className="text-text-dim">—</span>
        )}
      </td>

      {/* Score % */}
      <td className="px-4 py-3 align-middle">
        {scorePct !== null ? (
          <div className="flex items-center gap-1">
            <span aria-hidden="true" className="text-sm">💀</span>
            <span className={`font-mono text-sm font-medium ${scoreColor(scorePct)}`}>
              {Math.round(scorePct)}%
            </span>
          </div>
        ) : (
          <span className="text-text-dim">—</span>
        )}
      </td>

      {/* Δ Rev 7D */}
      <td className="px-4 py-3 align-middle font-mono text-sm">
        {reviewDelta !== null && reviewDelta !== 0 ? (
          <span className={reviewDelta > 0 ? "text-status-pos" : "text-status-neg"}>
            {reviewDelta > 0 ? "+" : ""}{reviewDelta}
          </span>
        ) : (
          <span className="text-text-dim">0</span>
        )}
      </td>

      {/* Peak CCU */}
      <td className="px-4 py-3 align-middle font-mono text-sm text-text-main">
        {peakCcu !== null && peakCcu > 0 ? peakCcu.toLocaleString() : <span className="text-text-dim">—</span>}
      </td>

      {/* YouTube */}
      <td className="px-4 py-3 align-middle">
        {channels.length === 0 ? (
          <span className="text-text-dim italic text-xs">
            {days !== null && days <= 14 ? "No coverage" : "—"}
          </span>
        ) : (
          <div className="flex flex-wrap gap-1 max-w-[180px]">
            {channels.map((ch) => (
              <span
                key={ch.channel_id}
                className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-status-neg/10 text-status-neg whitespace-nowrap"
              >
                {ch.name}
              </span>
            ))}
            {channels.some((ch) => channelTag(ch)?.label === "HIGH REACH") && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-status-info/12 text-status-info whitespace-nowrap">
                HIGH REACH
              </span>
            )}
            {channels.some((ch) => channelTag(ch)?.label === "VIRAL") && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-status-neg/12 text-status-neg whitespace-nowrap">
                VIRAL
              </span>
            )}
          </div>
        )}
      </td>

      {/* OPS */}
      <td className="px-4 py-3 align-middle">
        {ops?.score != null && ops.score > 0 ? (() => {
          const tier = opsTier(ops.score);
          return (
            <div className="flex items-center gap-2">
              <span className={`font-mono text-base font-semibold min-w-[28px] ${tier.cls}`}>
                {Math.round(ops.score)}
              </span>
              <div className="flex flex-col gap-[1px]">
                <span className={`font-mono text-[10px] font-semibold tracking-wider uppercase ${tier.cls}`}>
                  {tier.name}
                </span>
                <span className={`font-mono text-[10px] font-medium tracking-wide px-1 rounded self-start ${confidenceClass(ops.confidence)}`}>
                  {confidenceLabel(ops.confidence)}
                </span>
              </div>
              {onToggleWatch && (
                <button
                  onClick={(e) => { e.stopPropagation(); onToggleWatch(game.appid); }}
                  title={isWatched ? "Remove from watchlist" : "Add to watchlist"}
                  aria-label={isWatched ? "Remove from watchlist" : "Add to watchlist"}
                  className={`ml-1 transition-colors ${isWatched ? "text-status-warn" : "text-border-dark hover:text-text-dim"}`}
                >
                  <span
                    className="material-symbols-outlined"
                    style={{ fontSize: 16, fontVariationSettings: isWatched ? "'FILL' 1" : "'FILL' 0" }}
                  >
                    bookmark
                  </span>
                </button>
              )}
            </div>
          );
        })() : (
          <span className="text-text-dim italic text-xs">—</span>
        )}
      </td>
    </tr>
  );
}
