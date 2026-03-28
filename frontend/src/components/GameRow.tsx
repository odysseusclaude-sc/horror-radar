import type { Game, GameSnapshot } from "../types";

interface GameRowProps {
  game: Game;
  snapshot?: GameSnapshot;
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

function velocityDisplay(current: number | null, _prev: number | null) {
  // Placeholder: in production, velocity is computed from two snapshots
  if (current === null || current === 0) return { text: "—", color: "text-text-dim" };
  // Positive velocity placeholder
  return { text: `+${((current / 100) * 7).toFixed(1)}%`, color: "text-primary font-bold" };
}

export default function GameRow({ game, snapshot, even }: GameRowProps) {
  const days = daysSince(game.release_date);
  const reviewCount = snapshot?.review_count ?? 0;
  const scorePct = snapshot?.review_score_pct;
  const peakCcu = snapshot?.peak_ccu;
  const vel = velocityDisplay(reviewCount, null);

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
          {reviewCount > 0 ? (
            <>
              {reviewCount.toLocaleString()}
              <span className="material-symbols-outlined text-green-500">trending_up</span>
            </>
          ) : (
            <span className="text-text-dim">—</span>
          )}
        </div>
      </td>

      {/* Score % */}
      <td className="px-4 py-2">
        <div
          className={`flex items-center gap-1 text-sm font-bold ${
            scorePct !== null && scorePct !== undefined && scorePct < 50 ? "text-red-500" : ""
          }`}
        >
          <span className="material-symbols-outlined text-primary">skull</span>
          {scorePct !== null && scorePct !== undefined ? `${Math.round(scorePct)}%` : "—"}
        </div>
      </td>

      {/* Velocity */}
      <td className={`px-4 py-2 font-mono text-sm ${vel.color}`}>{vel.text}</td>

      {/* Peak CCU */}
      <td className="px-4 py-2 font-mono text-sm">
        {peakCcu !== null && peakCcu !== undefined ? peakCcu.toLocaleString() : "—"}
      </td>

      {/* YouTube Visibility */}
      <td className="px-6 py-2">
        <span className="text-text-dim italic text-[10px]">—</span>
      </td>
    </tr>
  );
}
