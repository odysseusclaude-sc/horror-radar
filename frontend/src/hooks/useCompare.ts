import { useState, useCallback } from "react";

const MAX_COMPARE = 3;
const STORAGE_KEY = "horror-radar-compare";

function readStorage(): number[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, MAX_COMPARE) : [];
  } catch {
    return [];
  }
}

function writeStorage(ids: number[]): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // quota exceeded — ignore
  }
}

export function useCompare() {
  const [compareList, setCompareList] = useState<number[]>(() => readStorage());

  const add = useCallback((appid: number) => {
    setCompareList((prev) => {
      if (prev.includes(appid) || prev.length >= MAX_COMPARE) return prev;
      const next = [...prev, appid];
      writeStorage(next);
      return next;
    });
  }, []);

  const remove = useCallback((appid: number) => {
    setCompareList((prev) => {
      const next = prev.filter((id) => id !== appid);
      writeStorage(next);
      return next;
    });
  }, []);

  const toggle = useCallback((appid: number) => {
    setCompareList((prev) => {
      const has = prev.includes(appid);
      if (!has && prev.length >= MAX_COMPARE) return prev; // cap at max
      const next = has ? prev.filter((id) => id !== appid) : [...prev, appid];
      writeStorage(next);
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setCompareList([]);
    writeStorage([]);
  }, []);

  const isInCompare = useCallback((appid: number) => compareList.includes(appid), [compareList]);
  const canAdd = compareList.length < MAX_COMPARE;

  return { compareList, add, remove, toggle, clear, isInCompare, canAdd, maxCompare: MAX_COMPARE };
}
