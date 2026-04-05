import { useState, useCallback } from "react";

const STORAGE_KEY = "horror-radar-watchlist";

function readStorage(): number[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeStorage(ids: number[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // storage quota exceeded or unavailable — silently ignore
  }
}

export function useWatchlist() {
  const [watchlist, setWatchlist] = useState<number[]>(() => readStorage());

  const add = useCallback((appid: number) => {
    setWatchlist((prev) => {
      if (prev.includes(appid)) return prev;
      const next = [...prev, appid];
      writeStorage(next);
      return next;
    });
  }, []);

  const remove = useCallback((appid: number) => {
    setWatchlist((prev) => {
      const next = prev.filter((id) => id !== appid);
      writeStorage(next);
      return next;
    });
  }, []);

  const toggle = useCallback((appid: number) => {
    setWatchlist((prev) => {
      const has = prev.includes(appid);
      const next = has ? prev.filter((id) => id !== appid) : [...prev, appid];
      writeStorage(next);
      return next;
    });
  }, []);

  const isWatched = useCallback((appid: number) => watchlist.includes(appid), [watchlist]);

  const clear = useCallback(() => {
    setWatchlist([]);
    writeStorage([]);
  }, []);

  return { watchlist, add, remove, toggle, isWatched, clear };
}
