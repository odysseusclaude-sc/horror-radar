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
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
}

function daysBadgeColor(d: number): string {
  if (d <= 7) return "bg-status-pos/10 text-status-pos border-status-pos/20";
  if (d <= 30) return "bg-status-warn/10 text-status-warn border-status-warn/20";
  return "bg-status-neg/10 text-status-neg border-status-neg/20";
}

function channelBadgeTag(ch: YoutubeChannelBrief): string | null {
  if (ch.subscriber_count && ch.subscriber_count >= 5_000_000) return "HIGH REACH";
  if (ch.top_video_views && ch.top_video_views >= 500_000) return "VIRAL";
  return null;
}

function opsGlyph(score: number): string {
  if (score >= 60) return "▲";
  if (score >= 30) return "◆";
  return "▼";
}

function opsColor(score: number): string {
  if (score >= 60) return "text-status-pos";
  if (score >= 30) return "text-status-warn";
  return "text-status-neg";
}

function buildEvidenceSnippet(game: GameListItem): string {
  const parts: string[] = [];
  const ops = game.latest_ops;
  const snap = game.latest_snapshot;

  if (ops?.velocity_component != null && ops.velocity_component >= 1.5) {
    parts.push(`${ops.velocity_component.toFixed(1)}× velocity`);
  } else if ((game.review_delta_7d ?? 0) >= 10) {
    parts.push(`+${game.review_delta_7d} reviews/7d`);
  }

  const channelCount = (game.youtube_channels ?? []).length;
  if (channelCount === 1) parts.push("1 creator");
  else if (channelCount >= 2) parts.push(`${channelCount} creators`);

  const scorePct = snap?.review_score_pct;
  const reviewCount = snap?.review_count ?? 0;
  if (scorePct != null && scorePct >= 90 && reviewCount >= 10) {
    parts.push("overwhelmingly positive");
  } else if (ops?.decay_component != null && ops.decay_component >= 1.2) {
    parts.push("retention strong");
  }

  return parts.slice(0, 3).join(" · ");
}

export default function GameRow({
  game,
  even,
  isWatched = false,
  onToggleWatch,
  isInCompare = false,
  onToggleCompare,
  canAddToCompare = true,
}: GameRowProps) {
  const navigate = useNavigate();
  const days = daysSince(game.release_date);
  const snap = game.latest_snapshot;
  const reviewCount = snap?.review_count ?? null;
  const peakCcu = snap?.peak_ccu ?? null;
  const reviewDelta = game.review_delta_7d ?? null;
  const channels = game.youtube_channels ?? [];
  const demoReviews = snap?.demo_review_count ?? null;
  const evidence = buildEvidenceSnippet(game);

  return (
    <tr
      className={`hover:bg-primary/5 transition-colors group cursor-pointer ${even ? "bg-surface-dark/40" : ""}`}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("a, button")) return;
        navigate(`/game/${game.appid}`);
      }}
    >
      {/* Game & Developer + evidence sentence */}
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
          <div className="flex flex-col min-w-0 flex-1">
            {/* Title + DEMO badge */}
            <div className="flex items-center gap-1.5">
              <Link
                to={`/game/${game.appid}`}
                className="font-bold text-sm leading-tight group-hover:text-primary transition-colors truncate hover:underline"
              >
                {game.title}
              </Link>
              {game.has_demo && (
                <span className="px-1.5 py-0.5 rounded text-[8px] font-black tracking-widest bg-status-info/10 text-status-info border border-status-info/20 flex-shrink-0">
                  &#x2713; DEMO
                </span>
              )}
            </div>
            {/* Developer link + days badge */}
            <div className="flex items-center gap-1.5 mt-0.5">
              {game.developer ? (
                <Link
                  to={`/developers/${encodeURIComponent(game.developer)}`}
                  className="text-[10px] text-text-dim uppercase tracking-tight truncate hover:text-primary transition-colors"
                  onClick={(e) => e.stopPropagation()}
                >
                  {game.developer}
                  {demoReviews != null && demoReviews > 0 && (
                    <span className="text-status-info ml-1">
                      ({demoReviews.toLocaleString()} demo reviews)
                    </span>
                  )}
                </Link>
              ) : (
                <span className="text-[10px] text-text-dim uppercase tracking-tight truncate">Unknown</span>
              )}
              {days !== null && (
                <span className={`px-1 py-0 rounded text-[9px] font-bold border flex-shrink-0 ${daysBadgeColor(days)}`}>
                  {days}d
                </span>
              )}
            </div>
            {/* Evidence sentence */}
            {evidence && (
              <span className="text-[10px] text-text-dim/60 truncate leading-tight mt-0.5 font-mono">
                {evidence}
              </span>
            )}
          </div>
        </div>
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

      {/* Reviews — count + trend arrow */}
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
              ) : null}
            </>
          ) : (
            <span className="text-text-dim">—</span>
          )}
        </div>
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

      {/* OPS — glyph + score + delta + confidence dots */}
      <td className="px-6 py-2 text-right">
        {game.latest_ops?.score != null && game.latest_ops.score > 0 ? (
          <div className="flex flex-col items-end gap-0.5">
            <div className="flex items-baseline gap-1">
              <span className={`text-[10px] font-bold opacity-60 ${opsColor(game.latest_ops.score)}`}>
                {opsGlyph(game.latest_ops.score)}
              </span>
              <span className={`text-lg font-black tabular-nums ${opsColor(game.latest_ops.score)}`}>
                {Math.round(game.latest_ops.score)}
              </span>
              {game.ops_delta_7d != null && Math.abs(game.ops_delta_7d) >= 2 && (
                <span className={`text-[10px] font-bold tabular-nums ${game.ops_delta_7d > 0 ? "text-status-pos" : "text-status-neg"}`}>
                  {game.ops_delta_7d > 0 ? "↑" : "↓"}{Math.abs(Math.round(game.ops_delta_7d))}
                </span>
              )}
            </div>
            <div
              className="flex items-center gap-1"
              title={game.latest_ops.confidence === "high" ? "High data coverage" : game.latest_ops.confidence === "medium" ? "Moderate data coverage" : "Limited data coverage"}
              aria-label={`Confidence: ${game.latest_ops.confidence ?? "low"}`}
            >
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
