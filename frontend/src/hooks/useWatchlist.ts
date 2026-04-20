import { useCallback, useEffect, useState } from "react";

const KEY = "horror-radar-watchlist";

function readSet(): Set<number> {
  try {
    const s = localStorage.getItem(KEY);
    return s ? new Set<number>(JSON.parse(s)) : new Set();
  } catch {
    return new Set();
  }
}

export function useWatchlist() {
  const [watchlist, setWatchlist] = useState<Set<number>>(readSet);

  useEffect(() => {
    const handler = () => setWatchlist(readSet());
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  const toggle = useCallback((appid: number) => {
    setWatchlist((prev) => {
      const next = new Set(prev);
      if (next.has(appid)) next.delete(appid);
      else next.add(appid);
      localStorage.setItem(KEY, JSON.stringify([...next]));
      // Notify other hook instances in the same tab
      window.dispatchEvent(new StorageEvent("storage", { key: KEY }));
      return next;
    });
  }, []);

  return { watchlist, toggle };
}
