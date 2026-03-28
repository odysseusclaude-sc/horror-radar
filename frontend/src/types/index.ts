export interface Game {
  appid: number;
  title: string;
  developer: string | null;
  publisher: string | null;
  release_date: string | null;
  price_usd: number | null;
  genres: string | null;
  tags: string | null;
  is_indie: boolean;
  is_horror: boolean;
  header_image_url: string | null;
  short_description: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface GameSnapshot {
  snapshot_date: string;
  review_count: number | null;
  review_score_pct: number | null;
  total_positive: number | null;
  total_negative: number | null;
  estimated_owners_low: number | null;
  estimated_owners_high: number | null;
  low_confidence_owners: boolean;
  peak_ccu: number | null;
  current_ccu: number | null;
  average_playtime_forever: number | null;
}

export interface GameListItem extends Game {
  latest_snapshot: GameSnapshot | null;
  latest_ops: OpsScore | null;
}

export interface GameDetail extends Game {
  snapshots: GameSnapshot[];
  ops_history: OpsScore[];
}

export interface OpsScore {
  score_date: string;
  score: number | null;
  confidence: string | null;
  review_component: number | null;
  velocity_component: number | null;
  ccu_component: number | null;
  youtube_component: number | null;
  youtube_breadth: number | null;
  wishlist_bonus: number | null;
  raw_ops: number | null;
  price_modifier: number | null;
  formula_version: number | null;
}

export interface Channel {
  channel_id: string;
  handle: string | null;
  name: string;
  subscriber_count: number | null;
  total_views: number | null;
  video_count: number | null;
  match_mode: string;
}

export interface Video {
  video_id: string;
  channel_id: string;
  title: string;
  published_at: string | null;
  view_count: number | null;
  like_count: number | null;
  comment_count: number | null;
  duration_seconds: number | null;
  view_48h: number | null;
  matched_appid: number | null;
  match_score: number | null;
}

export interface CollectionRun {
  id: number;
  job_name: string;
  status: string;
  items_processed: number;
  items_failed: number;
  error_message: string | null;
  started_at: string | null;
  finished_at: string | null;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  page_size: number;
}
