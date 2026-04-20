import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { fetchPaginated, fetchStatus } from "../api/client";
import OpsBanner from "../components/OpsBanner";
import FilterBar from "../components/FilterBar";
import GameTable from "../components/GameTable";
import Pagination from "../components/Pagination";
import CompareBar from "../components/CompareBar";
import { useWatchlist } from "../hooks/useWatchlist";
import { useCompare } from "../hooks/useCompare";
import type { GameListItem } from "../types";

const DEFAULTS = { days: 90, maxPrice: 60, sortBy: "ops" };

export default function Database() {
  const [games, setGames] = useState<GameListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { watchlist, toggle: toggleWatch } = useWatchlist();
  const { compareList, toggle: toggleCompare, remove: removeCompare, clear: clearCompare, canAdd: canAddToCompare } = useCompare();
  const [showWatchlistOnly, setShowWatchlistOnly] = useState(false);

  const [days, setDays] = useState(DEFAULTS.days);
  const [maxPrice, setMaxPrice] = useState(DEFAULTS.maxPrice);
  const [sortBy, setSortBy] = useState(DEFAULTS.sortBy);

  const [activeScrapers, setActiveScrapers] = useState(0);
  const [totalScrapers, setTotalScrapers] = useState(12);
  const [lastSync, setLastSync] = useState<string | null>(null);

  const pageSize = 20;

  // Debounce slider changes so we don't hit the API on every tick
  const [debouncedDays, setDebouncedDays] = useState(days);
  const [debouncedMaxPrice, setDebouncedMaxPrice] = useState(maxPrice);
  const sliderTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    sliderTimer.current = setTimeout(() => {
      setDebouncedDays(days);
      setDebouncedMaxPrice(maxPrice);
    }, 250);
    return () => { if (sliderTimer.current) clearTimeout(sliderTimer.current); };
  }, [days, maxPrice]);

  // Reset to page 1 when filters change
  const prevFilters = useRef({ debouncedDays, debouncedMaxPrice, sortBy });
  useEffect(() => {
    const prev = prevFilters.current;
    if (
      prev.debouncedDays !== debouncedDays ||
      prev.debouncedMaxPrice !== debouncedMaxPrice ||
      prev.sortBy !== sortBy
    ) {
      setPage(1);
      prevFilters.current = { debouncedDays, debouncedMaxPrice, sortBy };
    }
  }, [debouncedDays, debouncedMaxPrice, sortBy]);

  const loadGames = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetchPaginated<GameListItem>("/games", {
        page,
        page_size: pageSize,
        days: debouncedDays,
        max_price: debouncedMaxPrice < 60 ? debouncedMaxPrice : undefined,
        sort_by: sortBy,
      });
      setGames(resp.data);
      setTotal(resp.total);
    } catch (err) {
      console.error("Failed to fetch games:", err);
      setGames([]);
      setTotal(0);
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  }, [page, debouncedDays, debouncedMaxPrice, sortBy]);

  const loadStatus = useCallback(async () => {
    try {
      const s = await fetchStatus();
      setActiveScrapers(s.active_scrapers);
      setTotalScrapers(s.total_scrapers);
      setLastSync(s.last_sync);
    } catch {
      // non-critical
    }
  }, []);

  useEffect(() => { loadGames(); }, [loadGames]);

  useEffect(() => {
    loadStatus();
    const interval = setInterval(loadStatus, 30_000);
    return () => clearInterval(interval);
  }, [loadStatus]);

  function handleReset() {
    setDays(DEFAULTS.days);
    setMaxPrice(DEFAULTS.maxPrice);
    setSortBy(DEFAULTS.sortBy);
    setShowWatchlistOnly(false);
  }

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const visibleGames = showWatchlistOnly
    ? games.filter((g) => watchlist.includes(g.appid))
    : games;

  return (
    <>
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 px-4 md:px-6 xl:px-10 py-3 text-xs text-text-dim">
        <Link to="/" className="hover:text-text-main transition-colors">Home</Link>
        <span aria-hidden="true" className="opacity-50">/</span>
        <span aria-current="page" className="text-text-mid">Database</span>
      </nav>

      {/* OPS onboarding banner (dismissible, persists via localStorage) */}
      <OpsBanner />

      {/* Filter bar with sliders */}
      <FilterBar
        days={days}
        maxPrice={maxPrice}
        sortBy={sortBy}
        showWatchlistOnly={showWatchlistOnly}
        watchlistCount={watchlist.length}
        total={total}
        onDaysChange={setDays}
        onMaxPriceChange={setMaxPrice}
        onSortChange={setSortBy}
        onToggleWatchlistOnly={() => setShowWatchlistOnly((v) => !v)}
        onReset={handleReset}
      />

      {/* Data table */}
      <GameTable
        games={visibleGames}
        loading={loading}
        error={error}
        onRetry={loadGames}
        sortBy={sortBy}
        onSortChange={setSortBy}
        watchlist={watchlist}
        onToggleWatch={toggleWatch}
        compareList={compareList}
        onToggleCompare={toggleCompare}
        canAddToCompare={canAddToCompare}
        emptyVariant={showWatchlistOnly ? "watchlist-empty" : "no-results"}
      />

      {/* Footer status bar + pagination */}
      <Pagination
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={handlePageChange}
        activeScrapers={activeScrapers}
        totalScrapers={totalScrapers}
        lastSync={lastSync}
      />

      <CompareBar
        compareList={compareList}
        games={games}
        onRemove={removeCompare}
        onClear={clearCompare}
      />
    </>
  );
}
