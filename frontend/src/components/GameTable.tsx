import type { GameListItem } from "../types";
import GameRow from "./GameRow";
import GameCard from "./GameCard";
import EmptyState from "./EmptyState";

interface GameTableProps {
  games: GameListItem[];
  loading: boolean;
  watchlist?: number[];
  onToggleWatch?: (appid: number) => void;
  compareList?: number[];
  onToggleCompare?: (appid: number) => void;
  canAddToCompare?: boolean;
  /** Pass "watchlist-empty" when showing watchlist filter with no bookmarks. */
  emptyVariant?: "no-results" | "watchlist-empty";
}

export default function GameTable({ games, loading, watchlist = [], onToggleWatch, compareList = [], onToggleCompare, canAddToCompare = true, emptyVariant = "no-results" }: GameTableProps) {
  return (
    <main className="flex-1 overflow-auto custom-scrollbar bg-background-dark">
      {/* Desktop: table view */}
      <table className="hidden md:table w-full text-left border-collapse min-w-[1050px]">
        <thead className="sticky top-0 bg-background-dark/95 backdrop-blur-sm border-b-2 border-border-dark z-10">
          <tr className="text-[11px] uppercase tracking-wider text-text-dim font-black">
            <th className="px-6 py-4 w-[320px]">Game &amp; Developer</th>
            <th className="px-4 py-4 text-center">Days</th>
            <th className="px-4 py-4">Price</th>
            <th className="px-4 py-4">Reviews (7D)</th>
            <th className="px-4 py-4">Score %</th>
            <th className="px-4 py-4">&Delta; Rev 7D</th>
            <th className="px-4 py-4">Peak CCU</th>
            <th className="px-4 py-4">YouTube</th>
            <th className="px-6 py-4 text-right group/ops relative cursor-help">
              <div className="flex flex-col items-end">
                <span className="border-b border-dashed border-text-dim/40">OPS</span>
                <span className="text-[8px] normal-case tracking-wide font-semibold text-text-dim/60 mt-0.5">Breakout Strength</span>
              </div>
              <div className="absolute right-0 top-full mt-1 w-64 p-3 bg-surface-dark border border-border-dark rounded-lg shadow-xl text-left normal-case tracking-normal font-normal text-xs text-text-mid opacity-0 pointer-events-none group-hover/ops:opacity-100 group-hover/ops:pointer-events-auto transition-opacity z-20">
                <p className="font-bold text-text-main mb-1">Overperformance Score (0-100)</p>
                <p className="leading-relaxed">Measures how much a game outperforms its peers across review velocity, retention, review volume, YouTube coverage, and concurrent players. Higher = stronger breakout signal.</p>
                <div className="mt-2 pt-2 border-t border-border-dark flex items-center gap-3 text-[10px]">
                  <span className="flex items-center gap-1"><span className="inline-block w-1.5 h-1.5 rounded-full bg-text-mid"></span><span className="inline-block w-1.5 h-1.5 rounded-full bg-text-mid"></span><span className="inline-block w-1.5 h-1.5 rounded-full bg-text-mid"></span> High data</span>
                  <span className="flex items-center gap-1"><span className="inline-block w-1.5 h-1.5 rounded-full bg-text-mid"></span><span className="inline-block w-1.5 h-1.5 rounded-full bg-text-mid"></span><span className="inline-block w-1.5 h-1.5 rounded-full bg-border-dark"></span> Moderate</span>
                  <span className="flex items-center gap-1"><span className="inline-block w-1.5 h-1.5 rounded-full bg-text-mid"></span><span className="inline-block w-1.5 h-1.5 rounded-full bg-border-dark"></span><span className="inline-block w-1.5 h-1.5 rounded-full bg-border-dark"></span> Limited</span>
                </div>
              </div>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border-dark/50">
          {loading ? (
            <tr>
              <td colSpan={9} className="px-6 py-4">
                <div className="flex flex-col items-center gap-2 py-16 text-text-dim">
                  <span className="material-symbols-outlined text-4xl animate-spin text-primary">progress_activity</span>
                  <span className="text-sm">Loading games…</span>
                </div>
              </td>
            </tr>
          ) : games.length === 0 ? (
            <tr>
              <td colSpan={9}>
                <EmptyState variant={emptyVariant} />
              </td>
            </tr>
          ) : (
            games.map((game, i) => (
              <GameRow
                key={game.appid}
                game={game}
                even={i % 2 === 1}
                isWatched={watchlist.includes(game.appid)}
                onToggleWatch={onToggleWatch}
                isInCompare={compareList.includes(game.appid)}
                onToggleCompare={onToggleCompare}
                canAddToCompare={canAddToCompare || compareList.includes(game.appid)}
              />
            ))
          )}
        </tbody>
      </table>

      {/* Mobile: card view */}
      <div className="md:hidden">
        {loading ? (
          <div className="flex flex-col items-center gap-2 py-16 text-text-dim">
            <span className="material-symbols-outlined text-4xl animate-spin text-primary">progress_activity</span>
            <span className="text-sm">Loading games…</span>
          </div>
        ) : games.length === 0 ? (
          <EmptyState variant={emptyVariant} />
        ) : (
          <div className="divide-y divide-border-dark/50">
            {games.map((game) => (
              <GameCard
                key={game.appid}
                game={game}
                isWatched={watchlist.includes(game.appid)}
                onToggleWatch={onToggleWatch}
                isInCompare={compareList.includes(game.appid)}
                onToggleCompare={onToggleCompare}
                canAddToCompare={canAddToCompare || compareList.includes(game.appid)}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
