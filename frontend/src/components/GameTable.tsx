import type { GameListItem } from "../types";
import GameRow from "./GameRow";
import GameCard from "./GameCard";
import EmptyState from "./EmptyState";

interface GameTableProps {
  games: GameListItem[];
  loading: boolean;
  error?: string | null;
  onRetry?: () => void;
  sortBy?: string;
  onSortChange?: (sort: string) => void;
  watchlist?: number[];
  onToggleWatch?: (appid: number) => void;
  compareList?: number[];
  onToggleCompare?: (appid: number) => void;
  canAddToCompare?: boolean;
  emptyVariant?: "no-results" | "watchlist-empty";
}

type SortKey = "newest" | "velocity" | "ops" | "reviews" | "ccu";

const COLUMNS: { label: string; sortKey?: SortKey; help?: boolean }[] = [
  { label: "Game & Developer" },
  { label: "Days", sortKey: "newest" },
  { label: "Price" },
  { label: "Reviews", sortKey: "reviews" },
  { label: "Score %" },
  { label: "Δ Rev 7D", sortKey: "velocity" },
  { label: "Peak CCU", sortKey: "ccu" },
  { label: "YouTube" },
  { label: "OPS", sortKey: "ops", help: true },
];

export default function GameTable({
  games,
  loading,
  error,
  onRetry,
  sortBy,
  onSortChange,
  watchlist = [],
  onToggleWatch,
  compareList = [],
  onToggleCompare,
  canAddToCompare = true,
  emptyVariant = "no-results",
}: GameTableProps) {
  if (error) {
    return (
      <div className="flex-1 bg-background-dark">
        <div className="flex flex-col items-center justify-center text-center gap-4 py-20 px-6">
          <div className="w-16 h-16 rounded-full bg-status-neg/10 flex items-center justify-center text-2xl text-status-neg">
            ⚠
          </div>
          <h2 className="text-lg font-bold text-text-main">Unable to load game data</h2>
          <p className="text-sm text-text-mid max-w-[400px]">
            The backend server did not respond. This may be a temporary outage or network issue.
          </p>
          {onRetry && (
            <button
              onClick={onRetry}
              className="bg-primary-light text-background-dark rounded-md px-5 py-2 text-sm font-semibold hover:bg-primary transition-colors"
            >
              ↻ Retry Connection
            </button>
          )}
          <p className="font-mono text-xs text-text-dim">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-x-auto bg-background-dark px-4 md:px-6 xl:px-10 pb-6">
      {/* Desktop table */}
      <table className="hidden md:table w-full border-collapse text-sm" role="grid" aria-label="Horror indie game database">
        <thead>
          <tr>
            {COLUMNS.map((col) => {
              const isActive = col.sortKey && sortBy === col.sortKey;
              const clickable = !!col.sortKey && !!onSortChange;
              return (
                <th
                  key={col.label}
                  scope="col"
                  tabIndex={clickable ? 0 : -1}
                  onClick={clickable ? () => onSortChange!(col.sortKey!) : undefined}
                  onKeyDown={clickable ? (e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSortChange!(col.sortKey!);
                    }
                  } : undefined}
                  className={`px-4 py-3 text-left font-semibold text-xs uppercase tracking-wider border-b border-border-dark bg-surface-dark whitespace-nowrap select-none transition-colors ${
                    clickable ? "cursor-pointer" : "cursor-default"
                  } ${isActive ? "text-secondary" : "text-text-dim hover:text-text-main"}`}
                  aria-sort={isActive ? "descending" : undefined}
                >
                  <div className="flex items-center gap-1">
                    {col.label}
                    {col.sortKey && (
                      <span aria-hidden="true" className="flex flex-col text-[8px] leading-none">
                        <span className={isActive ? "opacity-30" : "text-border-dark"}>▲</span>
                        <span className={isActive ? "text-secondary" : "text-border-dark"}>▼</span>
                      </span>
                    )}
                    {col.help && (
                      <span
                        tabIndex={0}
                        aria-label="What is OPS?"
                        className="relative inline-flex items-center justify-center w-4 h-4 rounded-full border border-text-dim text-[10px] text-text-dim hover:border-text-main hover:text-text-main cursor-help ml-1 group/help"
                      >
                        ?
                        <span
                          role="tooltip"
                          className="hidden group-hover/help:block group-focus/help:block absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-60 p-3 bg-surface-dark border border-border-dark rounded-lg shadow-xl text-left normal-case tracking-normal font-normal z-50"
                        >
                          <span className="block text-xs font-semibold text-text-main mb-1">Overperformance Score</span>
                          <span className="block text-[11px] text-text-mid leading-snug">
                            Measures how much a game outperforms peers across 7 signals: velocity, decay, reviews, YouTube, CCU, sentiment, Twitch. 60+ = Breakout.
                          </span>
                        </span>
                      </span>
                    )}
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={COLUMNS.length} className="px-4 py-16">
                <div className="flex flex-col items-center gap-2 text-text-dim">
                  <span className="material-symbols-outlined text-4xl animate-spin text-primary">progress_activity</span>
                  <span className="text-sm">Loading games…</span>
                </div>
              </td>
            </tr>
          ) : games.length === 0 ? (
            <tr>
              <td colSpan={COLUMNS.length}>
                <EmptyState variant={emptyVariant} />
              </td>
            </tr>
          ) : (
            games.map((game) => (
              <GameRow
                key={game.appid}
                game={game}
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

      {/* Mobile cards */}
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
    </div>
  );
}
