interface FilterBarProps {
  days: number;
  maxPrice: number;
  sortBy: string;
  onDaysChange: (v: number) => void;
  onMaxPriceChange: (v: number) => void;
  onSortChange: (v: string) => void;
  onApply: () => void;
}

export default function FilterBar({
  days,
  maxPrice,
  sortBy,
  onDaysChange,
  onMaxPriceChange,
  onSortChange,
  onApply,
}: FilterBarProps) {
  return (
    <section className="bg-surface-dark border-b border-border-dark px-6 py-3">
      <div className="flex flex-wrap items-center gap-5">
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
            <span className="text-xs font-mono text-primary font-bold">0–{days}d</span>
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

        <div className="ml-auto flex gap-2">
          <button
            className="flex items-center gap-2 bg-primary hover:bg-red-800 text-white px-4 py-1.5 rounded text-xs font-bold transition-all shadow-lg hover:shadow-primary/20"
            onClick={onApply}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
              filter_alt
            </span>
            Apply Filters
          </button>
          <button className="flex items-center gap-2 bg-surface-dark border border-border-dark hover:bg-border-dark text-text-main px-4 py-1.5 rounded text-xs font-bold transition-colors">
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
              download
            </span>
            Export CSV
          </button>
        </div>
      </div>
    </section>
  );
}
