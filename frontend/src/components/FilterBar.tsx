interface FilterBarProps {
  days: number;
  maxPrice: number;
  sortBy: string;
  search: string;
  gameMode: string;
  showWatchlistOnly: boolean;
  watchlistCount: number;
  total: number;
  onDaysChange: (v: number) => void;
  onMaxPriceChange: (v: number) => void;
  onSortChange: (v: string) => void;
  onSearchChange: (v: string) => void;
  onGameModeChange: (v: string) => void;
  onToggleWatchlistOnly: () => void;
}

const PRESETS = [
  { label: "STREAMER", sortBy: "ops", days: 30, maxPrice: 60 },
  { label: "JOURNALIST", sortBy: "reviews", days: 90, maxPrice: 60 },
  { label: "SCOUT", sortBy: "ops", days: 90, maxPrice: 60 },
] as const;

function priceLabel(maxPrice: number): string {
  if (maxPrice >= 60) return "Any price";
  if (maxPrice === 0) return "Free only";
  return `Under $${maxPrice}`;
}

function sortLabel(sortBy: string): string {
  const map: Record<string, string> = { newest: "Newest", velocity: "Velocity", ops: "OPS", reviews: "Reviews", ccu: "CCU" };
  return map[sortBy] ?? sortBy;
}

export default function FilterBar({
  days,
  maxPrice,
  sortBy,
  search,
  showWatchlistOnly,
  watchlistCount,
  total,
  onDaysChange,
  onMaxPriceChange,
  onSortChange,
  onSearchChange,
  onToggleWatchlistOnly,
}: FilterBarProps) {
  const activePreset = PRESETS.find(
    (p) => p.sortBy === sortBy && p.days === days && p.maxPrice === maxPrice
  );

  function applyPreset(preset: (typeof PRESETS)[number]) {
    onSortChange(preset.sortBy);
    onDaysChange(preset.days);
    onMaxPriceChange(preset.maxPrice);
  }

  return (
    <section className="bg-surface-dark border-b border-border-dark">
      {/* Main filter row */}
      <div className="px-4 md:px-6 py-3 flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex-shrink-0">
          <span
            className="material-symbols-outlined absolute left-2 top-1/2 -translate-y-1/2 text-text-dim"
            style={{ fontSize: 14 }}
          >
            search
          </span>
          <input
            className="bg-background-dark border border-border-dark text-xs text-text-main rounded pl-7 pr-2 py-1.5 w-40 focus:border-primary focus:ring-1 focus:ring-primary/30 outline-none placeholder:text-text-dim/50 font-mono"
            type="text"
            placeholder="Game or developer..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>

        <div className="h-6 w-px bg-border-dark hidden md:block" />

        {/* Launch window select */}
        <select
          className="bg-background-dark border border-border-dark text-xs font-semibold rounded px-2 py-1.5 focus:border-primary outline-none text-text-main cursor-pointer"
          value={days}
          onChange={(e) => onDaysChange(Number(e.target.value))}
        >
          <option value={14}>Last 14 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>

        {/* Price select */}
        <select
          className="bg-background-dark border border-border-dark text-xs font-semibold rounded px-2 py-1.5 focus:border-primary outline-none text-text-main cursor-pointer"
          value={maxPrice}
          onChange={(e) => onMaxPriceChange(Number(e.target.value))}
        >
          <option value={60}>Any price</option>
          <option value={0}>Free only</option>
          <option value={10}>Under $10</option>
          <option value={20}>Under $20</option>
        </select>

        {/* Sort select */}
        <select
          className="bg-background-dark border border-border-dark text-xs font-semibold rounded px-2 py-1.5 focus:border-primary outline-none text-text-main cursor-pointer"
          value={sortBy}
          onChange={(e) => onSortChange(e.target.value)}
        >
          <option value="newest">Newest first</option>
          <option value="velocity">Velocity</option>
          <option value="ops">OPS score</option>
          <option value="reviews">Most reviews</option>
          <option value="ccu">Peak CCU</option>
        </select>

        <div className="h-6 w-px bg-border-dark hidden md:block" />

        {/* Preset chips */}
        <div className="flex items-center gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => applyPreset(p)}
              className={`px-2 py-0.5 rounded text-[9px] font-black tracking-widest border transition-colors ${
                activePreset?.label === p.label
                  ? "bg-primary/20 border-primary/40 text-primary"
                  : "bg-background-dark border-border-dark text-text-dim hover:border-text-dim hover:text-text-main"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Watchlist toggle — pushed to right */}
        <div className="ml-auto">
          <button
            onClick={onToggleWatchlistOnly}
            title={showWatchlistOnly ? "Show all games" : "Show watchlist only"}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded border text-xs font-bold transition-colors ${
              showWatchlistOnly
                ? "bg-status-warn/10 border-status-warn/30 text-status-warn"
                : "border-border-dark text-text-dim hover:border-text-dim hover:text-text-main"
            }`}
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: 14, fontVariationSettings: showWatchlistOnly ? "'FILL' 1" : "'FILL' 0" }}
            >
              bookmark
            </span>
            <span className="hidden md:inline">Watchlist</span>
            {watchlistCount > 0 && <span>({watchlistCount})</span>}
          </button>
        </div>
      </div>

      {/* Filter feedback band */}
      <div className="px-4 md:px-6 py-1.5 bg-background-dark/50 border-t border-border-dark/50 flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-mono text-text-dim/70">
          {total > 0
            ? `${total.toLocaleString()} games · Last ${days} days · ${priceLabel(maxPrice)} · ${sortLabel(sortBy)}`
            : "No matches"}
        </span>
        {showWatchlistOnly && (
          <span className="px-1.5 py-0 rounded text-[9px] font-bold bg-status-warn/10 text-status-warn border border-status-warn/20">
            Watchlist filter active
          </span>
        )}
        {search && (
          <span className="px-1.5 py-0 rounded text-[9px] font-bold bg-primary/10 text-primary border border-primary/20">
            &ldquo;{search}&rdquo;
          </span>
        )}
      </div>
    </section>
  );
}
