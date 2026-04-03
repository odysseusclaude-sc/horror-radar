import type { GameListItem } from "../types";
import GameRow from "./GameRow";
import GameCard from "./GameCard";

interface GameTableProps {
  games: GameListItem[];
  loading: boolean;
}

export default function GameTable({ games, loading }: GameTableProps) {
  return (
    <main className="flex-1 overflow-auto custom-scrollbar bg-background-dark">
      {/* Desktop: table view */}
      <table className="hidden md:table w-full text-left border-collapse min-w-[1100px]">
        <thead className="sticky top-0 bg-background-dark/95 backdrop-blur-sm border-b-2 border-border-dark z-10">
          <tr className="text-[11px] uppercase tracking-wider text-text-dim font-black">
            <th className="px-6 py-4 w-[320px]">Game &amp; Developer</th>
            <th className="px-4 py-4 text-center">Days</th>
            <th className="px-4 py-4">Price</th>
            <th className="px-4 py-4">Reviews (7D)</th>
            <th className="px-4 py-4">Score %</th>
            <th className="px-4 py-4">&Delta; Rev 7D</th>
            <th className="px-4 py-4">Peak CCU</th>
            <th className="px-4 py-4">YouTube Visibility</th>
            <th className="px-6 py-4 text-right">OPS</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border-dark/50">
          {loading ? (
            <tr>
              <td colSpan={9} className="px-6 py-16 text-center text-text-dim">
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
              <td colSpan={9} className="px-6 py-16 text-center text-text-dim">
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
    </main>
  );
}
