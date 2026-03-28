import type { GameListItem } from "../types";

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
  if (d <= 7) return "bg-green-950/40 text-green-500 border-green-900/40";
  if (d <= 14) return "bg-amber-950/40 text-amber-500 border-amber-900/40";
  return "bg-red-950/40 text-red-500 border-red-900/40";
}

function formatOwners(low: number | null, high: number | null): string {
  if (low === null || high === null) return "—";
  const fmt = (n: number) => n >= 1000 ? `${Math.round(n / 1000)}k` : String(n);
  return `${fmt(low)}-${fmt(high)}`;
}

export default function GameRow({ game, even }: GameRowProps) {
  const days = daysSince(game.release_date);
  const snap = game.latest_snapshot;
  const reviewCount = snap?.review_count ?? null;
  const scorePct = snap?.review_score_pct ?? null;
  const peakCcu = snap?.peak_ccu ?? null;

  return (
    <tr
      className={`h-12 hover:bg-primary/5 transition-colors group ${
        even ? "bg-surface-dark/40" : ""
      }`}
    >
      {/* Game & Developer */}
      <td className="px-6 py-2">
        <div className="flex items-center gap-3">
          {game.header_image_url ? (
            <img
              className="w-24 h-9 object-cover rounded border border-white/5 grayscale-[30%] group-hover:grayscale-0 transition-all"
              src={game.header_image_url}
              alt={game.title}
            />
          ) : (
            <div className="w-24 h-9 rounded border border-white/5 bg-border-dark" />
          )}
          <div className="flex flex-col">
            <span className="font-bold text-sm leading-tight group-hover:text-primary transition-colors">
              {game.title}
            </span>
            <span className="text-[10px] text-text-dim uppercase tracking-tight">
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
          <span className="text-green-500 font-bold">Free</span>
        ) : game.price_usd !== null ? (
          `$${game.price_usd.toFixed(2)}`
        ) : (
          "—"
        )}
      </td>

      {/* Reviews */}
      <td className="px-4 py-2">
        <div className="flex items-center gap-1 font-bold text-sm">
          {reviewCount !== null && reviewCount > 0 ? (
            reviewCount.toLocaleString()
          ) : (
            <span className="text-text-dim">—</span>
          )}
        </div>
      </td>

      {/* Score % */}
      <td className="px-4 py-2">
        {scorePct !== null ? (
          <div
            className={`flex items-center gap-1 text-sm font-bold ${
              scorePct < 50 ? "text-red-500" : ""
            }`}
          >
            <span className="material-symbols-outlined text-primary">skull</span>
            {Math.round(scorePct)}%
          </div>
        ) : (
          <span className="text-text-dim text-sm">—</span>
        )}
      </td>

      {/* Peak CCU */}
      <td className="px-4 py-2 font-mono text-sm">
        {peakCcu !== null && peakCcu > 0 ? peakCcu.toLocaleString() : "—"}
      </td>

      {/* Owners */}
      <td className="px-4 py-2 font-mono text-sm">
        {snap?.low_confidence_owners ? (
          <span className="text-text-dim italic">
            {formatOwners(snap.estimated_owners_low, snap.estimated_owners_high)}
          </span>
        ) : (
          formatOwners(snap?.estimated_owners_low ?? null, snap?.estimated_owners_high ?? null)
        )}
      </td>

      {/* OPS Score */}
      <td className="px-6 py-2">
        {game.latest_ops?.score !== null && game.latest_ops?.score !== undefined ? (
          <div className="flex items-center gap-1.5">
            <span
              className={`px-2 py-0.5 rounded text-xs font-black border ${
                game.latest_ops.score >= 60
                  ? "bg-green-950/40 text-green-400 border-green-900/40"
                  : game.latest_ops.score >= 30
                  ? "bg-amber-950/40 text-amber-400 border-amber-900/40"
                  : "bg-red-950/40 text-red-400 border-red-900/40"
              }`}
            >
              {Math.round(game.latest_ops.score)}
            </span>
            {game.latest_ops.confidence === "low" && (
              <span className="text-text-dim text-[9px]" title="Low confidence">?</span>
            )}
          </div>
        ) : (
          <span className="text-text-dim italic text-[10px]">—</span>
        )}
      </td>
    </tr>
  );
}
