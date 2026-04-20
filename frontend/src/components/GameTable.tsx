import type { GameListItem } from "../types";
import GameRow from "./GameRow";
import GameCard from "./GameCard";

interface GameTableProps {
  games: GameListItem[];
  loading: boolean;
}

export default function GameTable({ games, loading }: GameTableProps) {
  return (
    <div className="flex-1 overflow-auto custom-scrollbar bg-background-dark">
      {/* Desktop: table view */}
      <table className="hidden md:table w-full text-left border-collapse min-w-[900px]">
        <thead className="sticky top-0 bg-background-dark/95 backdrop-blur-sm border-b-2 border-border-dark z-10">
          <tr className="text-[11px] uppercase tracking-wider text-text-dim font-black">
            <th className="px-6 py-4 w-[340px]">Game &amp; Developer</th>
            <th className="px-4 py-4">Price</th>
            <th className="px-4 py-4">Reviews</th>
            <th className="px-4 py-4">Peak CCU</th>
            <th className="px-4 py-4">YouTube</th>
            <th className="px-6 py-4 text-right group/ops relative cursor-help">
              <div className="flex flex-col items-end">
                <span className="border-b border-dashed border-text-dim/40">OPS</span>
                <span className="text-[8px] normal-case tracking-wide font-semibold text-text-dim/60 mt-0.5">Breakout Strength</span>
              </div>
              <div className="absolute right-0 top-full mt-1 w-72 p-3 bg-surface-dark border border-border-dark rounded-lg shadow-xl text-left normal-case tracking-normal font-normal text-xs text-text-mid opacity-0 pointer-events-none group-hover/ops:opacity-100 group-hover/ops:pointer-events-auto transition-opacity z-20">
                <p className="font-bold text-text-main mb-1">Overperformance Score v5 (0–100)</p>
                <p className="leading-relaxed mb-2">Composite of 7 signals weighted by how much each outperforms the peer median: velocity (30%), decay retention (20%), review volume (13%), YouTube (13%), CCU (10%), sentiment (8%), Twitch (6%).</p>
                <p className="leading-relaxed text-[10px]">Score = raw_ops × 24 × coverage_penalty. Coverage penalty scales 0.40–1.00 based on how many of the 7 signals have data.</p>
                <div className="mt-2 pt-2 border-t border-border-dark flex items-center gap-4 text-[10px]">
                  <span className="flex items-center gap-1 text-status-pos font-bold"><span>▲</span> Breakout ≥60</span>
                  <span className="flex items-center gap-1 text-status-warn font-bold"><span>◆</span> Watch 30–59</span>
                  <span className="flex items-center gap-1 text-text-dim font-bold"><span>▼</span> Cold &lt;30</span>
                </div>
              </div>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border-dark/50">
          {loading ? (
            <tr>
              <td colSpan={6} className="px-6 py-16 text-center text-text-dim">
                <div className="flex flex-col items-center gap-2">
                  <span className="material-symbols-outlined text-4xl animate-spin text-primary">
                    progress_activity
                  </span>
                  <span className="text-sm">Loading games...</span>
                </div>
              </td>
            </tr>
          ) : games.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-6 py-16 text-center text-text-dim">
                <div className="flex flex-col items-center gap-2">
                  <span className="material-symbols-outlined text-4xl text-border-dark">
                    skull
                  </span>
                  <span className="text-sm">No games found</span>
                  <span className="text-xs">Try adjusting your filters</span>
                </div>
              </td>
            </tr>
          ) : (
            games.map((game, i) => (
              <GameRow key={game.appid} game={game} even={i % 2 === 1} />
            ))
          )}
        </tbody>
      </table>

      {/* Mobile: card view */}
      <div className="md:hidden">
        {loading ? (
          <div className="flex flex-col items-center gap-2 py-16 text-text-dim">
            <span className="material-symbols-outlined text-4xl animate-spin text-primary">
              progress_activity
            </span>
            <span className="text-sm">Loading games...</span>
          </div>
        ) : games.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-text-dim">
            <span className="material-symbols-outlined text-4xl text-border-dark">skull</span>
            <span className="text-sm">No games found</span>
            <span className="text-xs">Try adjusting your filters</span>
          </div>
        ) : (
          <div className="divide-y divide-border-dark/50">
            {games.map((game) => (
              <GameCard key={game.appid} game={game} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
