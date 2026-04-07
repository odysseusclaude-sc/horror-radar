import type { PaginatedResponse } from "../types";

const BASE_URL = import.meta.env.VITE_API_URL || "/api";

export async function fetchPaginated<T>(
  endpoint: string,
  params: Record<string, string | number | boolean | undefined> = {}
): Promise<PaginatedResponse<T>> {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") {
      searchParams.set(key, String(value));
    }
  }

  const url = `${BASE_URL}${endpoint}?${searchParams.toString()}`;
  const resp = await fetch(url);

  if (!resp.ok) {
    throw new Error(`API error: ${resp.status} ${resp.statusText}`);
  }

  return resp.json();
}

export async function fetchOne<T>(endpoint: string): Promise<T> {
  const resp = await fetch(`${BASE_URL}${endpoint}`);

  if (!resp.ok) {
    throw new Error(`API error: ${resp.status} ${resp.statusText}`);
  }

  return resp.json();
}

export interface PipelineStatus {
  queue_depth: number;
  dead_letters: number;
  metadata_last_status: string | null;
}

export async function fetchStatus(): Promise<{
  active_scrapers: number;
  total_scrapers: number;
  last_sync: string | null;
  pipeline?: PipelineStatus;
}> {
  const res = await fetch(`${BASE_URL}/status`);
  if (!res.ok) throw new Error("Status fetch failed");
  return res.json();
}
