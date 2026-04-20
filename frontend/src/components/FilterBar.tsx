interface FilterBarProps {
  days: number;
  maxPrice: number;
  sortBy: string;
  showWatchlistOnly: boolean;
  watchlistCount: number;
  total: number;
  onDaysChange: (v: number) => void;
  onMaxPriceChange: (v: number) => void;
  onSortChange: (v: string) => void;
  onToggleWatchlistOnly: () => void;
  onReset: () => void;
}

const DEFAULTS = { days: 90, maxPrice: 60, sortBy: "ops" };

function priceLabel(v: number) {
  if (v >= 60) return "Any";
  if (v === 0) return "Free";
  return `$${v}`;
}

export default function FilterBar({
  days,
  maxPrice,
  sortBy,
  showWatchlistOnly,
  watchlistCount,
  total,
  onDaysChange,
  onMaxPriceChange,
  onSortChange,
  onToggleWatchlistOnly,
  onReset,
}: FilterBarProps) {
  const daysActive = days !== DEFAULTS.days;
  const priceActive = maxPrice !== DEFAULTS.maxPrice;
  const sortActive = sortBy !== DEFAULTS.sortBy;
  const anyActive = daysActive || priceActive || sortActive || showWatchlistOnly;

  return (
    <section aria-label="Filters" className="bg-background-dark">
      {/* Main filter row */}
      <div className="px-4 md:px-6 xl:px-10 py-3 flex flex-wrap items-center gap-3">
        {/* Days slider */}
        <div className="flex items-center gap-2" role="group" aria-label="Days since launch filter">
          <label htmlFor="filter-days" className="text-xs uppercase tracking-wider font-semibold text-text-dim whitespace-nowrap">
            Days
          </label>
          <div className="flex items-center gap-2 bg-surface-dark border border-border-dark rounded-md px-3 py-1">
            <input
              id="filter-days"
              type="range"
              min={1}
              max={90}
              value={days}
              onChange={(e) => onDaysChange(Number(e.target.value))}
              className="range-warm w-[80px] accent-secondary"
              aria-valuemin={1}
              aria-valuemax={90}
              aria-valuenow={days}
            />
            <span className="font-mono text-xs text-text-main min-w-[48px] text-right">
              1-{days}d
            </span>
          </div>
        </div>

        <div className="hidden md:block w-px h-6 bg-border-dark" aria-hidden="true" />

        {/* Max Price slider */}
        <div className="flex items-center gap-2" role="group" aria-label="Maximum price filter">
          <label htmlFor="filter-price" className="text-xs uppercase tracking-wider font-semibold text-text-dim whitespace-nowrap">
            Max Price
          </label>
          <div className="flex items-center gap-2 bg-surface-dark border border-border-dark rounded-md px-3 py-1">
            <input
              id="filter-price"
              type="range"
              min={0}
              max={60}
              step={5}
              value={maxPrice}
              onChange={(e) => onMaxPriceChange(Number(e.target.value))}
              className="range-warm w-[80px] accent-secondary"
              aria-valuemin={0}
              aria-valuemax={60}
              aria-valuenow={maxPrice}
            />
            <span className="font-mono text-xs text-text-main min-w-[40px] text-right">
              {priceLabel(maxPrice)}
            </span>
          </div>
        </div>

        <div className="hidden md:block w-px h-6 bg-border-dark" aria-hidden="true" />

        {/* Sort select */}
        <div className="flex items-center gap-2" role="group" aria-label="Sort order">
          <label htmlFor="filter-sort" className="text-xs uppercase tracking-wider font-semibold text-text-dim whitespace-nowrap">
            Sort
          </label>
          <select
            id="filter-sort"
            value={sortBy}
            onChange={(e) => onSortChange(e.target.value)}
            className="bg-surface-dark border border-border-dark rounded-md px-3 py-1 pr-8 text-sm font-display text-text-main appearance-none cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-light"
            style={{
              backgroundImage:
                "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%236b6058' d='M6 8L1 3h10z'/%3E%3C/svg%3E\")",
              backgroundRepeat: "no-repeat",
              backgroundPosition: "right 8px center",
            }}
          >
            <option value="ops">OPS (High to Low)</option>
            <option value="newest">Newest First</option>
            <option value="velocity">Velocity</option>
            <option value="reviews">Reviews</option>
            <option value="ccu">CCU</option>
          </select>
        </div>

        {anyActive && (
          <>
            <div className="hidden md:block w-px h-6 bg-border-dark" aria-hidden="true" />
            <button
              onClick={onReset}
              aria-label="Reset all filters to defaults"
              className="bg-transparent border border-border-dark rounded-md px-3 py-1 text-xs text-text-dim hover:text-text-main hover:border-text-dim transition-colors whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-light"
            >
              Reset Filters
            </button>
          </>
        )}

        {/* Watchlist toggle — right-aligned */}
        <div className="ml-auto">
          <button
            onClick={onToggleWatchlistOnly}
            title={showWatchlistOnly ? "Show all games" : "Show watchlist only"}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-bold transition-colors ${
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
            {watchlistCount > 0 && <span className="font-mono">({watchlistCount})</span>}
          </button>
        </div>
      </div>

      {/* Active filter chips row */}
      {(daysActive || priceActive || sortActive) && (
        <div className="px-4 md:px-6 xl:px-10 pb-3 flex items-center gap-2 flex-wrap" aria-label="Active filters">
          <span className="text-xs text-text-dim mr-1">Active:</span>
          {daysActive && (
            <div className="flex items-center gap-1 bg-secondary/10 border border-secondary/25 rounded-full pl-3 pr-1 py-0.5 text-xs text-secondary">
              Days: 1-{days}
              <button
                onClick={() => onDaysChange(DEFAULTS.days)}
                aria-label="Remove days filter"
                className="text-secondary px-1 opacity-60 hover:opacity-100 transition-opacity leading-none"
              >
                ✕
              </button>
            </div>
          )}
          {priceActive && (
            <div className="flex items-center gap-1 bg-secondary/10 border border-secondary/25 rounded-full pl-3 pr-1 py-0.5 text-xs text-secondary">
              Max: {priceLabel(maxPrice)}
              <button
                onClick={() => onMaxPriceChange(DEFAULTS.maxPrice)}
                aria-label="Remove price filter"
                className="text-secondary px-1 opacity-60 hover:opacity-100 transition-opacity leading-none"
              >
                ✕
              </button>
            </div>
          )}
          {sortActive && (
            <div className="flex items-center gap-1 bg-secondary/10 border border-secondary/25 rounded-full pl-3 pr-1 py-0.5 text-xs text-secondary">
              Sort: {sortBy}
              <button
                onClick={() => onSortChange(DEFAULTS.sortBy)}
                aria-label="Remove sort filter"
                className="text-secondary px-1 opacity-60 hover:opacity-100 transition-opacity leading-none"
              >
                ✕
              </button>
            </div>
          )}
          <span className="text-[10px] font-mono text-text-dim/70 ml-2">
            {total > 0 ? `${total.toLocaleString()} matches` : "No matches"}
          </span>
        </div>
      )}
    </section>
  );
}
