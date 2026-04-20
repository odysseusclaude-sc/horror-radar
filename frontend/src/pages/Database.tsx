import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchPaginated, fetchStatus } from "../api/client";
import FilterBar from "../components/FilterBar";
import GameTable from "../components/GameTable";
import Pagination from "../components/Pagination";
import { useWatchlist } from "../hooks/useWatchlist";
import { useCompare } from "../hooks/useCompare";
import CompareBar from "../components/CompareBar";
import type { GameListItem } from "../types";

function opsGlyph(score: number) {
  if (score >= 60) return { glyph: "▲", color: "text-status-pos" };
  if (score >= 30) return { glyph: "◆", color: "text-status-warn" };
  return { glyph: "▼", color: "text-text-dim" };
}

function Top3Strip({ games }: { games: GameListItem[] }) {
  const navigate = useNavigate();
  const top3 = games.slice(0, Math.min(3, games.length));
  if (top3.length === 0) return null;

  return (
    <div className="hidden md:block px-6 py-3 bg-surface-dark/30 border-b border-border-dark">
      <div className="text-[10px] uppercase tracking-widest font-bold text-text-dim/50 mb-2">
        Top Breakouts
      </div>
      <div className="grid grid-cols-3 gap-3">
        {top3.map((game, idx) => {
          const ops = game.latest_ops?.score ?? null;
          const days = game.release_date
            ? Math.floor((Date.now() - new Date(game.release_date).getTime()) / 86_400_000)
            : null;
          const tier = ops != null ? opsGlyph(ops) : null;

          return (
            <button
              key={game.appid}
              onClick={() => navigate(`/game/${game.appid}`)}
              className="flex items-center gap-3 bg-background-dark hover:bg-primary/5 rounded border border-border-dark p-2.5 text-left transition-colors group"
            >
              <span className="text-text-dim/30 text-sm font-black font-mono w-4 flex-shrink-0">
                {idx + 1}
              </span>
              {game.header_image_url ? (
                <img
                  src={game.header_image_url}
                  alt={game.title}
                  className="w-[60px] h-[28px] object-cover rounded border border-white/5 flex-shrink-0 grayscale-[30%] group-hover:grayscale-0 transition-all"
                />
              ) : (
                <div className="w-[60px] h-[28px] bg-border-dark rounded flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm truncate group-hover:text-primary transition-colors leading-tight">
                  {game.title}
                </div>
                {days != null && (
                  <div className="text-[10px] text-text-dim font-mono">Day {days}</div>
                )}
              </div>
              {ops != null && tier != null && (
                <div className={`flex items-baseline gap-0.5 font-black font-mono flex-shrink-0 ${tier.color}`}>
                  <span className="text-[9px] opacity-60">{tier.glyph}</span>
                  <span className="text-base">{Math.round(ops)}</span>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function Database() {
  const [games, setGames] = useState<GameListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [lastVisit, setLastVisit] = useState<Date | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("horror-radar-last-visit");
    if (stored) setLastVisit(new Date(stored));
    localStorage.setItem("horror-radar-last-visit", new Date().toISOString());
  }, []);

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

  const loadStatus = useCallback(async () => {
    try {
      const s = await fetchStatus();
      setActiveScrapers(s.active_scrapers);
      setTotalScrapers(s.total_scrapers);
      setLastSync(s.last_sync);
    } catch {
      // Status is non-critical, ignore errors
    }
  }, []);

  useEffect(() => {
    loadGames();
  }, [loadGames]);

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
      {lastVisit && page === 1 && !loading && (() => {
        const newCount = games.filter(
          (g) => g.release_date && new Date(g.release_date) > lastVisit
        ).length;
        return newCount > 0 ? (
          <div className="px-6 py-2 bg-status-pos/5 border-b border-status-pos/20 flex items-center gap-2">
            <span className="text-[10px] font-bold text-status-pos">
              {newCount} new {newCount === 1 ? "game" : "games"} since{" "}
              {lastVisit.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </span>
            <span className="text-[10px] text-text-dim/50">— new releases shown in results</span>
          </div>
        ) : null;
      })()}
      {sortBy === "ops" && page === 1 && !loading && (
        <Top3Strip games={games} />
      )}
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
