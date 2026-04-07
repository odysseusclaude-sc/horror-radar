import { useCallback, useEffect, useRef, useState } from "react";
import { fetchPaginated, fetchStatus, type PipelineStatus } from "../api/client";
import FilterBar from "../components/FilterBar";
import FreshnessBanner from "../components/FreshnessBanner";
import GameTable from "../components/GameTable";
import Pagination from "../components/Pagination";
import { useWatchlist } from "../hooks/useWatchlist";
import { useCompare } from "../hooks/useCompare";
import CompareBar from "../components/CompareBar";
import HeroSection from "../components/HeroSection";
import TopBreakouts from "../components/TopBreakouts";
import type { GameListItem } from "../types";

export default function Database() {
  const [games, setGames] = useState<GameListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  // Hero section: always top 5 by OPS, independent of user filters
  const [heroGames, setHeroGames] = useState<GameListItem[]>([]);
  const [heroLoading, setHeroLoading] = useState(true);

  // Watchlist
  const { watchlist, toggle: toggleWatch } = useWatchlist();
  // Compare
  const { compareList, toggle: toggleCompare, remove: removeCompare, clear: clearCompare, canAdd: canAddToCompare } = useCompare();
  const [showWatchlistOnly, setShowWatchlistOnly] = useState(false);

  // Filter state — changes apply instantly (search is debounced)
  const [days, setDays] = useState(90);
  const [maxPrice, setMaxPrice] = useState(60);
  const [sortBy, setSortBy] = useState("ops");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [gameMode, setGameMode] = useState("all");

  // Status
  const [activeScrapers, setActiveScrapers] = useState(0);
  const [totalScrapers, setTotalScrapers] = useState(12);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [pipeline, setPipeline] = useState<PipelineStatus | undefined>(undefined);

  const pageSize = 20;

  // Debounced values for search and sliders (avoid hammering API)
  const [debouncedDays, setDebouncedDays] = useState(days);
  const [debouncedMaxPrice, setDebouncedMaxPrice] = useState(maxPrice);

  // Debounce search input by 350ms
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    searchTimer.current = setTimeout(() => setDebouncedSearch(search), 350);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [search]);

  // Debounce sliders by 200ms
  const sliderTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    sliderTimer.current = setTimeout(() => {
      setDebouncedDays(days);
      setDebouncedMaxPrice(maxPrice);
    }, 200);
    return () => { if (sliderTimer.current) clearTimeout(sliderTimer.current); };
  }, [days, maxPrice]);

  // Reset to page 1 when any filter changes
  const prevFilters = useRef({ debouncedDays, debouncedMaxPrice, sortBy, debouncedSearch, gameMode });
  useEffect(() => {
    const prev = prevFilters.current;
    if (
      prev.debouncedDays !== debouncedDays ||
      prev.debouncedMaxPrice !== debouncedMaxPrice ||
      prev.sortBy !== sortBy ||
      prev.debouncedSearch !== debouncedSearch ||
      prev.gameMode !== gameMode
    ) {
      setPage(1);
      prevFilters.current = { debouncedDays, debouncedMaxPrice, sortBy, debouncedSearch, gameMode };
    }
  }, [debouncedDays, debouncedMaxPrice, sortBy, debouncedSearch, gameMode]);

  const loadGames = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await fetchPaginated<GameListItem>("/games", {
        page,
        page_size: pageSize,
        days: debouncedDays,
        max_price: debouncedMaxPrice < 60 ? debouncedMaxPrice : undefined,
        sort_by: sortBy,
        search: debouncedSearch || undefined,
        game_mode: gameMode !== "all" ? gameMode : undefined,
      });
      setGames(resp.data);
      setTotal(resp.total);
    } catch (err) {
      console.error("Failed to fetch games:", err);
      setGames([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, debouncedDays, debouncedMaxPrice, sortBy, debouncedSearch, gameMode]);

  const loadHeroGames = useCallback(async () => {
    setHeroLoading(true);
    try {
      const resp = await fetchPaginated<GameListItem>("/games", {
        sort_by: "ops",
        page: 1,
        page_size: 5,
        days: 90,
      });
      setHeroGames(resp.data);
    } catch (err) {
      console.error("Failed to fetch hero games:", err);
      setHeroGames([]);
    } finally {
      setHeroLoading(false);
    }
  }, []);

  const loadStatus = useCallback(async () => {
    try {
      const s = await fetchStatus();
      setActiveScrapers(s.active_scrapers);
      setTotalScrapers(s.total_scrapers);
      setLastSync(s.last_sync);
      setPipeline(s.pipeline);
    } catch {
      // Status is non-critical, ignore errors
    }
  }, []);

  useEffect(() => {
    loadGames();
  }, [loadGames]);

  // Hero data: load once on mount, refresh every 10 minutes
  useEffect(() => {
    loadHeroGames();
    const interval = setInterval(loadHeroGames, 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, [loadHeroGames]);

  // Poll status every 30 seconds
  useEffect(() => {
    loadStatus();
    const interval = setInterval(loadStatus, 30_000);
    return () => clearInterval(interval);
  }, [loadStatus]);

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <>
      <HeroSection game={heroGames[0] ?? null} loading={heroLoading} />
      <TopBreakouts games={heroGames.slice(1)} loading={heroLoading} />
      <FreshnessBanner lastSync={lastSync} />
      <FilterBar
        days={days}
        maxPrice={maxPrice}
        sortBy={sortBy}
        search={search}
        gameMode={gameMode}
        showWatchlistOnly={showWatchlistOnly}
        watchlistCount={watchlist.length}
        onDaysChange={setDays}
        onMaxPriceChange={setMaxPrice}
        onSortChange={setSortBy}
        onSearchChange={setSearch}
        onGameModeChange={setGameMode}
        onToggleWatchlistOnly={() => setShowWatchlistOnly((v) => !v)}
      />
      <GameTable
        games={showWatchlistOnly ? games.filter((g) => watchlist.includes(g.appid)) : games}
        loading={loading}
        watchlist={watchlist}
        onToggleWatch={toggleWatch}
        compareList={compareList}
        onToggleCompare={toggleCompare}
        canAddToCompare={canAddToCompare}
        emptyVariant={showWatchlistOnly ? "watchlist-empty" : "no-results"}
      />
      <Pagination
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={handlePageChange}
        activeScrapers={activeScrapers}
        totalScrapers={totalScrapers}
        lastSync={lastSync}
        pipeline={pipeline}
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
