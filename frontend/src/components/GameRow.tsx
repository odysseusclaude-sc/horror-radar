import type { GameListItem, YoutubeChannelBrief } from "../types";

interface GameRowProps {
  game: GameListItem;
  even: boolean;
}

function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const diff = Date.now() - new Date(dateStr).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function daysBadgeColor(d: number): string {
  if (d <= 7) return "bg-green-950/40 text-green-400 border-green-900/40";
  if (d <= 30) return "bg-amber-950/40 text-amber-400 border-amber-900/40";
  return "bg-red-950/40 text-red-400 border-red-900/40";
}

function scorePctColor(pct: number): string {
  if (pct >= 80) return "text-green-400";
  if (pct >= 60) return "text-amber-400";
  return "text-red-400";
}

function channelBadgeTag(ch: YoutubeChannelBrief): string | null {
  if (ch.subscriber_count && ch.subscriber_count >= 5_000_000) return "HIGH REACH";
  if (ch.top_video_views && ch.top_video_views >= 500_000) return "VIRAL";
  return null;
}

function channelBadgeColor(tag: string | null): string {
  if (tag === "HIGH REACH") return "bg-purple-950/50 text-purple-300 border-purple-800/50";
  if (tag === "VIRAL") return "bg-red-950/50 text-red-300 border-red-800/50";
  return "bg-surface-dark text-text-dim border-border-dark";
}

function tagColor(tag: string): string {
  if (tag === "HIGH REACH") return "bg-purple-700/30 text-purple-200";
  if (tag === "VIRAL") return "bg-red-700/30 text-red-200";
  return "";
}

export default function GameRow({ game, even }: GameRowProps) {
  const days = daysSince(game.release_date);
  const snap = game.latest_snapshot;
  const reviewCount = snap?.review_count ?? null;
  const scorePct = snap?.review_score_pct ?? null;
  const peakCcu = snap?.peak_ccu ?? null;
  const velocity = snap?.review_velocity_7d ?? null;
  const reviewDelta = game.review_delta_7d ?? null;
  const channels = game.youtube_channels ?? [];

  return (
    <tr
      className={`h-14 hover:bg-primary/5 transition-colors group ${
        even ? "bg-surface-dark/40" : ""
      }`}
    >
      {/* Game & Developer */}
      <td className="px-6 py-2">
        <div className="flex items-center gap-3">
          {game.header_image_url ? (
            <img
              className="w-20 h-[30px] object-cover rounded border border-white/5 grayscale-[30%] group-hover:grayscale-0 transition-all flex-shrink-0"
              src={game.header_image_url}
              alt={game.title}
            />
          ) : (
            <div className="w-20 h-[30px] rounded border border-white/5 bg-border-dark flex-shrink-0" />
          )}
          <div className="flex flex-col min-w-0">
            <span className="font-bold text-sm leading-tight group-hover:text-primary transition-colors truncate">
              {game.title}
            </span>
            <span className="text-[10px] text-text-dim uppercase tracking-tight truncate">
              {game.developer || "Unknown"}
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
          <span className="text-green-400 font-bold">Free</span>
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
                <span className="material-symbols-outlined text-green-400" style={{ fontSize: 16 }}>
                  trending_up
                </span>
              ) : reviewDelta !== null && reviewDelta < 0 ? (
                <span className="material-symbols-outlined text-red-400" style={{ fontSize: 16 }}>
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
          <span className={reviewDelta > 0 ? "text-green-400 font-bold" : reviewDelta < 0 ? "text-red-400 font-bold" : "text-text-dim"}>
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
          <span className="text-text-dim italic text-xs">None tracked</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {channels.map((ch) => {
              const tag = channelBadgeTag(ch);
              return (
                <div key={ch.channel_id} className="flex items-center gap-1">
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold border tracking-wide ${channelBadgeColor(tag)}`}
                  >
                    {ch.name.toUpperCase()}
                  </span>
                  {tag && (
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-black tracking-widest ${tagColor(tag)}`}>
                      {tag}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </td>

      {/* OPS Score */}
      <td className="px-6 py-2 text-right">
        {game.latest_ops?.score != null && game.latest_ops.score > 0 ? (
          <div className="flex flex-col items-end gap-0.5">
            <span
              className={`text-lg font-black tabular-nums ${
                game.latest_ops.score >= 60
                  ? "text-green-400"
                  : game.latest_ops.score >= 30
                  ? "text-amber-400"
                  : "text-red-400"
              }`}
            >
              {Math.round(game.latest_ops.score)}
            </span>
            <span className="text-[9px] uppercase tracking-widest text-text-dim font-bold">
              {game.latest_ops.confidence === "high"
                ? "high conf"
                : game.latest_ops.confidence === "medium"
                ? "med conf"
                : "low conf"}
            </span>
          </div>
        ) : (
          <span className="text-text-dim italic text-xs">—</span>
        )}
      </td>
    </tr>
  );
}
