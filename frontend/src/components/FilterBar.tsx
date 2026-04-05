import { useState } from "react";

interface FilterBarProps {
  days: number;
  maxPrice: number;
  sortBy: string;
  search: string;
  gameMode: string;
  showWatchlistOnly: boolean;
  watchlistCount: number;
  onDaysChange: (v: number) => void;
  onMaxPriceChange: (v: number) => void;
  onSortChange: (v: string) => void;
  onSearchChange: (v: string) => void;
  onGameModeChange: (v: string) => void;
  onToggleWatchlistOnly: () => void;
}

export default function FilterBar({
  days,
  maxPrice,
  sortBy,
  search,
  gameMode,
  showWatchlistOnly,
  watchlistCount,
  onDaysChange,
  onMaxPriceChange,
  onSortChange,
  onSearchChange,
  onGameModeChange,
  onToggleWatchlistOnly,
}: FilterBarProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <section className="bg-surface-dark border-b border-border-dark px-4 md:px-6 py-3">
      {/* Mobile: compact bar with search + sort + expand toggle */}
      <div className="flex md:hidden items-center gap-2">
        <div className="relative flex-1">
          <span
            className="material-symbols-outlined absolute left-2 top-1/2 -translate-y-1/2 text-text-dim"
            style={{ fontSize: 14 }}
          >
            search
          </span>
          <input
            className="bg-background-dark border border-border-dark text-xs text-text-main rounded pl-7 pr-2 py-2 w-full focus:border-primary focus:ring-1 focus:ring-primary/30 outline-none placeholder:text-text-dim/50 font-mono"
            type="text"
            placeholder="Search games..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
        <select
          className="bg-background-dark border border-border-dark text-xs font-semibold rounded px-2 py-2 focus:ring-primary outline-none text-text-main"
          value={sortBy}
          onChange={(e) => onSortChange(e.target.value)}
        >
          <option value="newest">Newest</option>
          <option value="velocity">Velocity</option>
          <option value="ops">OPS</option>
          <option value="reviews">Reviews</option>
          <option value="ccu">CCU</option>
        </select>
        <button
          className="p-2 rounded border border-border-dark hover:bg-background-dark transition-colors"
          onClick={() => setExpanded(!expanded)}
          aria-label="Toggle filters"
        >
          <span className="material-symbols-outlined text-text-dim" style={{ fontSize: 18 }}>
            {expanded ? "expand_less" : "tune"}
          </span>
        </button>
      </div>

      {/* Mobile: expanded filters */}
      {expanded && (
        <div className="md:hidden grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-border-dark">
          {/* Game Mode */}
          <div className="col-span-2 flex flex-col gap-1">
            <span className="text-[10px] uppercase font-bold text-text-dim tracking-widest">Mode</span>
            <div className="flex rounded overflow-hidden border border-border-dark">
              {[
                { value: "all", label: "All" },
                { value: "narrative", label: "Narrative" },
                { value: "multiplayer", label: "Co-op" },
              ].map((opt) => (
                <button
                  key={opt.value}
                  className={`flex-1 px-3 py-1.5 text-xs font-bold transition-colors ${
                    gameMode === opt.value
                      ? "bg-primary text-white"
                      : "bg-background-dark text-text-dim hover:bg-border-dark"
                  }`}
                  onClick={() => onGameModeChange(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Days Since Launch */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] uppercase font-bold text-text-dim tracking-widest">Days</span>
            <div className="flex items-center gap-2">
              <input
                className="accent-primary h-1.5 flex-1 rounded-full bg-border-dark appearance-none cursor-pointer"
                max={90}
                min={1}
                type="range"
                value={days}
                onChange={(e) => onDaysChange(Number(e.target.value))}
              />
              <span className="text-xs font-mono text-primary font-bold w-10 text-right">{days}d</span>
            </div>
          </div>

          {/* Max Price */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] uppercase font-bold text-text-dim tracking-widest">Price</span>
            <div className="flex items-center gap-2">
              <input
                className="accent-primary h-1.5 flex-1 rounded-full bg-border-dark appearance-none cursor-pointer"
                max={60}
                min={0}
                type="range"
                value={maxPrice}
                onChange={(e) => onMaxPriceChange(Number(e.target.value))}
              />
              <span className="text-xs font-mono text-primary font-bold w-10 text-right">
                {maxPrice === 60 ? "Any" : `<$${maxPrice}`}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Desktop: horizontal layout */}
      <div className="hidden md:flex flex-wrap items-center gap-5">
        {/* Search */}
        <div className="flex flex-col gap-1">
          <span className="text-[10px] uppercase font-bold text-text-dim tracking-widest">
            Search
          </span>
          <div className="relative">
            <span
              className="material-symbols-outlined absolute left-2 top-1/2 -translate-y-1/2 text-text-dim"
              style={{ fontSize: 14 }}
            >
              search
            </span>
            <input
              className="bg-background-dark border border-border-dark text-xs text-text-main rounded pl-7 pr-2 py-1.5 w-44 focus:border-primary focus:ring-1 focus:ring-primary/30 outline-none placeholder:text-text-dim/50 font-mono"
              type="text"
              placeholder="Game or developer..."
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </div>
        </div>

        <div className="h-8 w-[1px] bg-border-dark" />

        {/* Game Mode */}
        <div className="flex flex-col gap-1">
          <span className="text-[10px] uppercase font-bold text-text-dim tracking-widest">
            Mode
          </span>
          <div className="flex rounded overflow-hidden border border-border-dark">
            {[
              { value: "all", label: "All" },
              { value: "narrative", label: "Narrative" },
              { value: "multiplayer", label: "Co-op" },
            ].map((opt) => (
              <button
                key={opt.value}
                className={`px-3 py-1 text-xs font-bold transition-colors ${
                  gameMode === opt.value
                    ? "bg-primary text-white"
                    : "bg-background-dark text-text-dim hover:bg-border-dark"
                }`}
                onClick={() => onGameModeChange(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="h-8 w-[1px] bg-border-dark" />

        <div className="flex flex-col gap-1">
          <span className="text-[10px] uppercase font-bold text-text-dim tracking-widest">
            Days Since Launch
          </span>
          <div className="flex items-center gap-3">
            <input
              className="accent-primary h-1.5 w-32 rounded-full bg-border-dark appearance-none cursor-pointer"
              max={90}
              min={1}
              type="range"
              value={days}
              onChange={(e) => onDaysChange(Number(e.target.value))}
            />
            <span className="text-xs font-mono text-primary font-bold">0-{days}d</span>
          </div>
        </div>

        <div className="h-8 w-[1px] bg-border-dark" />

        <div className="flex flex-col gap-1">
          <span className="text-[10px] uppercase font-bold text-text-dim tracking-widest">
            Max Price
          </span>
          <div className="flex items-center gap-3">
            <input
              className="accent-primary h-1.5 w-32 rounded-full bg-border-dark appearance-none cursor-pointer"
              max={60}
              min={0}
              type="range"
              value={maxPrice}
              onChange={(e) => onMaxPriceChange(Number(e.target.value))}
            />
            <span className="text-xs font-mono text-primary font-bold">
              {maxPrice === 60 ? "Any" : `<$${maxPrice}`}
            </span>
          </div>
        </div>

        <div className="h-8 w-[1px] bg-border-dark" />

        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-text-dim">Sort by:</span>
          <select
            className="bg-background-dark border border-border-dark text-xs font-semibold rounded px-2 py-1 focus:ring-primary outline-none text-text-main"
            value={sortBy}
            onChange={(e) => onSortChange(e.target.value)}
          >
            <option value="newest">Newest First</option>
            <option value="velocity">Velocity (7d)</option>
            <option value="ops">OPS Score</option>
            <option value="reviews">Most Reviews</option>
            <option value="ccu">Peak CCU</option>
          </select>
        </div>

        <div className="h-8 w-[1px] bg-border-dark" />

        {/* Watchlist toggle */}
        <button
          onClick={onToggleWatchlistOnly}
          title={showWatchlistOnly ? "Show all games" : "Show watchlist only"}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded border text-xs font-bold transition-colors ${
            showWatchlistOnly
              ? "bg-status-warn/10 border-status-warn/30 text-status-warn"
              : "border-border-dark text-text-dim hover:border-text-dim hover:text-text-main"
          }`}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 14, fontVariationSettings: showWatchlistOnly ? "'FILL' 1" : "'FILL' 0" }}>
            bookmark
          </span>
          Watchlist{watchlistCount > 0 && <span className="ml-0.5">({watchlistCount})</span>}
        </button>
      </div>
    </section>
  );
}
