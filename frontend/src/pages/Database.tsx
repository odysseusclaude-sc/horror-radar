import { useCallback, useEffect, useState } from "react";
import { fetchPaginated } from "../api/client";
import FilterBar from "../components/FilterBar";
import GameTable from "../components/GameTable";
import Pagination from "../components/Pagination";
import type { Game } from "../types";

export default function Database() {
  const [games, setGames] = useState<Game[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  // Filter state
  const [days, setDays] = useState(365);
  const [maxPrice, setMaxPrice] = useState(60);
  const [sortBy, setSortBy] = useState("newest");

  // Applied filters (only sent to API on "Apply")
  const [appliedDays, setAppliedDays] = useState(365);
  const [appliedMaxPrice, setAppliedMaxPrice] = useState(60);
  const [appliedSortBy, setAppliedSortBy] = useState("newest");

  const pageSize = 20;

  const loadGames = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await fetchPaginated<Game>("/games", {
        page,
        page_size: pageSize,
        days: appliedDays,
        max_price: appliedMaxPrice < 60 ? appliedMaxPrice : undefined,
        sort_by: appliedSortBy,
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
  }, [page, appliedDays, appliedMaxPrice, appliedSortBy]);

  useEffect(() => {
    loadGames();
  }, [loadGames]);

  const handleApply = () => {
    setAppliedDays(days);
    setAppliedMaxPrice(maxPrice);
    setAppliedSortBy(sortBy);
    setPage(1);
  };

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
        onDaysChange={setDays}
        onMaxPriceChange={setMaxPrice}
        onSortChange={setSortBy}
        onApply={handleApply}
      />
      <GameTable games={games} loading={loading} />
      <Pagination
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={handlePageChange}
      />
    </>
  );
}
