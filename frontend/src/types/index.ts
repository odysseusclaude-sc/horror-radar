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
  is_multiplayer: boolean;
  has_demo: boolean;
  demo_appid: number | null;
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
  peak_ccu: number | null;
  current_ccu: number | null;
  average_playtime_forever: number | null;
  review_velocity_7d: number | null;
  demo_review_count: number | null;
  demo_review_score_pct: number | null;
}

export interface YoutubeChannelBrief {
  channel_id: string;
  name: string;
  handle: string | null;
  subscriber_count: number | null;
  top_video_views: number | null;
}

export interface GameListItem extends Game {
  latest_snapshot: GameSnapshot | null;
  latest_ops: OpsScore | null;
  youtube_channels: YoutubeChannelBrief[];
  review_delta_7d: number | null;
  ops_delta_7d: number | null;
}

export interface GameDetail extends Game {
  snapshots: GameSnapshot[];
  ops_history: OpsScore[];
}

export type OpsConfidence = "high" | "medium" | "low";

export interface OpsScore {
  score_date: string;
  score: number | null;
  confidence: OpsConfidence | null;
  review_component: number | null;
  velocity_component: number | null;
  decay_component: number | null;
  ccu_component: number | null;
  youtube_component: number | null;
  youtube_breadth: number | null;
  raw_ops: number | null;
  price_modifier: number | null;
  formula_version: string | null;
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

// ── Insights types ──

export interface InsightSignal {
  label: string;
  value: string;
  detail: string;
}

export interface InsightGame {
  appid: number;
  title: string;
  developer: string | null;
  header_image_url: string | null;
  gem_score: number;
  review_count: number;
  review_score: number;
  price: number | null;
  days_out: number;
  genre: string;
  visibility: number;
  quality: number;
  yt_channels: number;
  ops_score: number | null;
  has_demo: boolean;
  demo_review_count: number | null;
  demo_review_score_pct: number | null;
  signals: InsightSignal[];
  sparkline: number[];
  dominant_signal: string;
}

export interface InsightSubGenre {
  name: string;
  momentum: number;
  game_count: number;
  avg_score: number;
  top_game: string;
}

export type GemOutcome = "hit" | "sleeper" | "steady";

export interface InsightPastGem {
  title: string;
  week: string;
  score_at_discovery: number;
  current_reviews: number;
  outcome: GemOutcome;
}

// ── Radar Pick types ──

export interface RadarOpsComponent {
  key: string;
  label: string;
  value: number | null;
  max: number;
  weight: number;
  color: string;
  desc: string;
  formula: string;
}

export interface RadarOps {
  score: number;
  delta_14d: number | null;
  percentile: number | null;
  components: RadarOpsComponent[];
}

export interface RadarOpsHistoryPoint {
  day: number;
  score: number;
}

export interface RadarYoutube {
  video_count: number;
  largest_subscriber_count: number | null;
  total_views: number;
  channels: YoutubeChannelBrief[];
}

export interface RadarDemo {
  review_count: number;
  score_pct: number;
}

export interface RadarPreviousPick {
  appid: number;
  title: string;
  picked_date: string;
  ops_at_pick: number;
  ops_now: number | null;
  status: "climbing" | "steady" | "peaked";
}

export interface RadarVelocitySpark {
  label: string;
  value: number;
}

export interface RadarPickSummary {
  appid: number;
  title: string;
  developer: string | null;
  header_image_url: string | null;
  price_usd: number | null;
  days_since_launch: number | null;
  review_count: number | null;
  velocity_7d: number | null;
  ops_score: number | null;
  ops_delta_14d: number | null;
  sentiment_pct: number | null;
}

export interface DeveloperGameItem {
  appid: number;
  title: string;
  release_date: string | null;
  price_usd: number | null;
  header_image_url: string | null;
  ops_score: number | null;
  ops_confidence: string | null;
}

export interface DeveloperDetailOut {
  developer_name: string;
  total_games: number;
  total_reviews: number;
  avg_review_score: number | null;
  best_game_appid: number | null;
  computed_at: string | null;
  games: DeveloperGameItem[];
}

export interface RadarPickResponse {
  appid: number;
  title: string;
  developer: string | null;
  header_image_url: string | null;
  price_usd: number | null;
  days_since_launch: number | null;
  release_date: string | null;
  review_count: number | null;
  sentiment_pct: number | null;
  velocity_7d: number | null;
  velocity_prev_7d: number | null;
  velocity_per_day: number | null;
  peak_ccu: number | null;
  current_ccu: number | null;
  youtube: RadarYoutube | null;
  demo: RadarDemo | null;
  ops: RadarOps | null;
  ops_history: RadarOpsHistoryPoint[];
  velocity_spark: RadarVelocitySpark[];
  previous_picks: RadarPreviousPick[];
  runners_up: RadarPickSummary[];
}

export interface InsightsResponse {
  hero_gem: InsightGame | null;
  scatter_games: InsightGame[];
  rising_games: InsightGame[];
  blindspot_games: InsightGame[];
  sub_genres: InsightSubGenre[];
  gem_history: InsightPastGem[];
}

// ── Trends types ──

export interface TrendsWeekPoint {
  week_label: string;
  week_iso: string;
  active_games: number;
  total_new_reviews: number;
  avg_ops: number | null;
  new_releases: number;
}

export interface TrendsSubgenre {
  name: string;
  game_count: number;
  avg_ops: number | null;
  avg_review_score: number | null;
  avg_review_count: number | null;
  ops_delta_4w: number | null;
  top_mover_title: string | null;
  top_mover_appid: number | null;
}

export interface TrendsPriceBucket {
  label: string;
  range_label: string;
  game_count: number;
  median_reviews: number;
  median_sentiment: number;
  avg_ops: number | null;
  demo_pct: number;
}

export interface TrendsDemoCohort {
  label: string;
  game_count: number;
  median_reviews: number;
  median_sentiment: number;
  avg_ops: number | null;
  median_peak_ccu: number;
}

export interface TrendsSurger {
  appid: number;
  title: string;
  developer: string | null;
  header_image_url: string | null;
  subgenre: string;
  price: number | null;
  has_demo: boolean;
  ops_score: number | null;
  ops_delta: number | null;
  ops_prev: number | null;
  review_count: number;
  review_delta_7d: number;
  review_score_pct: number;
  velocity_spark: number[];
}

export interface TrendsHeadline {
  total_games: number;
  new_last_30d: number;
  total_reviews: number;
  avg_sentiment: number;
  breakout_count: number;
  yt_videos_tracked: number;
  yt_channels_covering: number;
  demo_pct: number;
}

export interface TrendsYoutubeGame {
  appid: number;
  title: string;
  total_views: number;
  unique_channels: number;
  header_image_url: string | null;
}

export interface TrendsResponse {
  headline: TrendsHeadline;
  market_pulse: TrendsWeekPoint[];
  market_narrative: string;
  subgenres: TrendsSubgenre[];
  subgenre_narrative: string;
  price_buckets: TrendsPriceBucket[];
  demo_cohorts: TrendsDemoCohort[];
  price_narrative: string;
  surgers: TrendsSurger[];
  youtube_top: TrendsYoutubeGame[];
  generated_at: string;
}
