/**
 * Mock data for Hollowfield — a psychological horror indie game
 * whose trajectory was shaped by a save-corruption crisis and
 * a single IGP upload that rescued it.
 *
 * Data generated procedurally to tell a coherent narrative.
 */

// ─── Types ──────────────────────────────────────────────────────────

export interface GameProfile {
  appid: number;
  title: string;
  developer: string;
  genre: string;
  subgenre: string;
  price: number;
  release_date: string;
  demo_release_date: string;
  has_demo: boolean;
  tags: string[];
  total_reviews: number;
  review_score_pct: number;
  peak_ccu_ever: number;
  owners_estimate: number;
  current_ops: number;
  ops_confidence: string;
  story_sentence: string;
}

export interface TimelineSnapshot {
  date: string;
  day_index: number; // days since demo launch
  phase: "demo" | "launch_week" | "crisis" | "recovery" | "breakout" | "tail" | "reddit_bump";
  // Game metrics
  review_count: number;
  review_score_pct: number;
  peak_ccu: number;
  owners_estimate: number;
  // Demo metrics
  demo_review_count: number;
  demo_review_score_pct: number;
  // OPS
  ops_score: number | null;
  ops_confidence: string | null;
  review_component: number | null;
  velocity_component: number | null;
  decay_component: number | null;
  ccu_component: number | null;
  youtube_component: number | null;
  creator_response_component: number | null;
  // Twitch
  twitch_viewers: number;
  twitch_streams: number;
  // YouTube aggregate
  yt_cumulative_views: number;
}

export type EventType =
  | "demo_launch"
  | "game_launch"
  | "youtube_demo"
  | "youtube_game"
  | "reddit"
  | "steam_update";

export interface TimelineEvent {
  date: string;
  day_index: number;
  type: EventType;
  title: string;
  detail: string;
  // YouTube
  channel_name?: string;
  subscriber_count?: number;
  view_count?: number;
  // Reddit
  subreddit?: string;
  score?: number;
  num_comments?: number;
}

export interface PhaseInfo {
  id: string;
  label: string;
  start_date: string;
  end_date: string;
  start_day: number;
  end_day: number;
  duration_days: number;
  summary: string;
  dominant_signal: string;
  key_event: string;
  insight: string;
}

export interface CreatorImpact {
  channel_name: string;
  subscriber_count: number;
  video_title: string;
  upload_date: string;
  view_count: number;
  reviews_before_7d: number;
  reviews_after_7d: number;
  ccu_before_7d: number;
  ccu_after_7d: number;
  impact_score: number;
  covers: "demo" | "game";
}

// ─── Constants ──────────────────────────────────────────────────────

const DEMO_LAUNCH = new Date("2025-07-30");
const GAME_LAUNCH = new Date("2025-10-30");
const TODAY = new Date("2026-03-30");

function dateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

// Deterministic noise
function noise(day: number, seed: number = 0): number {
  const x = Math.sin((day + seed) * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function noisyInt(base: number, amp: number, day: number, seed: number = 0): number {
  return Math.max(0, Math.round(base + (noise(day, seed) - 0.5) * 2 * amp));
}

function smoothStep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

// ─── Game Profile ───────────────────────────────────────────────────

export const HOLLOWFIELD: GameProfile = {
  appid: 99999,
  title: "Hollowfield",
  developer: "Ashwood Interactive",
  genre: "Psychological Horror",
  subgenre: "Atmospheric, Story Rich, First-Person",
  price: 9.99,
  release_date: "2025-10-30",
  demo_release_date: "2025-07-30",
  has_demo: true,
  tags: [
    "Psychological Horror",
    "Atmospheric",
    "Story Rich",
    "Indie",
    "First-Person",
    "Singleplayer",
  ],
  total_reviews: 3847,
  review_score_pct: 84,
  peak_ccu_ever: 847,
  owners_estimate: 28000,
  current_ops: 31,
  ops_confidence: "high",
  story_sentence:
    "Hollowfield\u2019s trajectory was defined by a save-corruption crisis on day 9 and an IGP upload that rescued it 12 days later.",
};

// ─── Events ─────────────────────────────────────────────────────────

export const EVENTS: TimelineEvent[] = [
  {
    date: "2025-07-30",
    day_index: 0,
    type: "demo_launch",
    title: "Demo Released on Steam",
    detail:
      "Hollowfield demo goes live. First 30 minutes of the asylum chapter playable.",
  },
  {
    date: "2025-08-12",
    day_index: 13,
    type: "youtube_demo",
    title: "Horror Game You NEED to Try",
    detail: "First notable coverage of the demo. Positive reaction.",
    channel_name: "HorrorUnderground",
    subscriber_count: 42000,
    view_count: 67000,
  },
  {
    date: "2025-08-20",
    day_index: 21,
    type: "youtube_demo",
    title: "This Indie Horror Demo DESTROYED Me | Hollowfield",
    detail:
      "Mid-tier creator full demo playthrough with facecam. Called it 'the scariest demo of 2025'. Video drove significant wishlist spike.",
    channel_name: "DarkCornerGaming",
    subscriber_count: 280000,
    view_count: 412000,
  },
  {
    date: "2025-09-15",
    day_index: 47,
    type: "reddit",
    title: "Just played the Hollowfield demo and I can't sleep",
    detail: "Organic post that gained traction in the horror gaming community.",
    subreddit: "HorrorGaming",
    score: 847,
    num_comments: 234,
  },
  {
    date: "2025-10-10",
    day_index: 72,
    type: "steam_update",
    title: "Demo Update v0.9.2",
    detail:
      "Audio overhaul, new ending variant, performance fixes. Developer responded to community feedback.",
  },
  {
    date: "2025-10-30",
    day_index: 92,
    type: "game_launch",
    title: "Hollowfield Full Release",
    detail:
      "Full game launches at $9.99. Three chapters, ~4 hour runtime. Launches with 12% discount for wishlisted users.",
  },
  {
    date: "2025-10-31",
    day_index: 93,
    type: "youtube_game",
    title: "Hollowfield is HERE and It's TERRIFYING",
    detail: "Launch day coverage from a known horror channel.",
    channel_name: "MrKravin",
    subscriber_count: 890000,
    view_count: 385000,
  },
  {
    date: "2025-11-02",
    day_index: 95,
    type: "youtube_game",
    title: "The Horror Game Everyone's Been Waiting For",
    detail: "Launch window coverage, focused on the asylum chapter.",
    channel_name: "CJUGames",
    subscriber_count: 520000,
    view_count: 198000,
  },
  {
    date: "2025-11-08",
    day_index: 101,
    type: "steam_update",
    title: "Known Issue: Save Corruption in Chapter 3",
    detail:
      "Developer acknowledges save-corrupting bug in Chapter 3 transition. Community backlash begins. Multiple negative reviews cite lost progress.",
  },
  {
    date: "2025-11-13",
    day_index: 106,
    type: "steam_update",
    title: "Hotfix v1.0.3 \u2014 Save System Overhaul",
    detail:
      "Emergency patch: complete save system rewrite. Automatic backup saves added. Affected players offered free DLC future content. Community sentiment begins recovering.",
  },
  {
    date: "2025-11-20",
    day_index: 113,
    type: "youtube_game",
    title: "This Horror Game Made Me CRY | Hollowfield (Full Playthrough)",
    detail:
      "IGP\u2019s full playthrough. 47 minutes. Called the ending 'one of the best in indie horror'. Video went semi-viral, drove massive review and sales spike.",
    channel_name: "IGP",
    subscriber_count: 5200000,
    view_count: 2100000,
  },
  {
    date: "2025-11-22",
    day_index: 115,
    type: "youtube_game",
    title: "Hollowfield Full Game | Indie Horror Masterpiece?",
    detail: "Follow-up coverage riding the IGP wave.",
    channel_name: "Fooster",
    subscriber_count: 1800000,
    view_count: 640000,
  },
  {
    date: "2025-11-23",
    day_index: 116,
    type: "reddit",
    title: "IGP just covered Hollowfield and it's blowing up",
    detail:
      "Meta-discussion about the game's trajectory. Developer spotted in comments.",
    subreddit: "IndieGaming",
    score: 1240,
    num_comments: 389,
  },
  {
    date: "2025-12-15",
    day_index: 138,
    type: "steam_update",
    title: "Update v1.1 \u2014 New Game+ & Accessibility Options",
    detail:
      "Major content update with NG+, subtitle sizing, and colorblind mode. Well received.",
  },
  {
    date: "2026-01-20",
    day_index: 174,
    type: "youtube_game",
    title: "Underrated Horror Games of 2025",
    detail:
      "Hollowfield featured in a roundup alongside 4 other games. Brief segment.",
    channel_name: "ManlyBadassHero",
    subscriber_count: 1400000,
    view_count: 520000,
  },
  {
    date: "2026-02-28",
    day_index: 213,
    type: "reddit",
    title: "This game broke me \u2014 in a good way [Hollowfield]",
    detail:
      "Emotional player review went viral. 3 awards, crossposted to r/gaming. Drove a noticeable review bump weeks after the launch tail had settled.",
    subreddit: "HorrorGaming",
    score: 3420,
    num_comments: 612,
  },
  {
    date: "2026-03-10",
    day_index: 223,
    type: "steam_update",
    title: "Update v1.2 \u2014 Developer Commentary Mode",
    detail:
      "Added in-game developer commentary nodes. Small but appreciated by the community.",
  },
];

// ─── Phase Definitions ──────────────────────────────────────────────

export const PHASES: PhaseInfo[] = [
  {
    id: "demo",
    label: "Demo Phase",
    start_date: "2025-07-30",
    end_date: "2025-10-29",
    start_day: 0,
    end_day: 91,
    duration_days: 92,
    summary: "Quiet launch, slow build, one breakout video",
    dominant_signal: "YouTube discovery by DarkCornerGaming (+280K subs)",
    key_event: "DarkCornerGaming demo playthrough on day 21",
    insight:
      "The demo sat undiscovered for 3 weeks before a single mid-tier creator found it organically. This is typical \u2014 demos need active outreach, not just a store listing.",
  },
  {
    id: "launch_week",
    label: "Launch Window",
    start_date: "2025-10-30",
    end_date: "2025-11-07",
    start_day: 92,
    end_day: 100,
    duration_days: 9,
    summary: "Strong opening \u2014 847 peak CCU, rapid review accumulation",
    dominant_signal: "Peak CCU: 847 on day 3 post-launch",
    key_event: "MrKravin and CJUGames launch day/week coverage",
    insight:
      "Demo wishlists converted well. The 847 CCU peak in week 1 placed Hollowfield in the top 5% of indie horror launches at this price point.",
  },
  {
    id: "crisis",
    label: "Save Corruption Crisis",
    start_date: "2025-11-08",
    end_date: "2025-11-12",
    start_day: 101,
    end_day: 105,
    duration_days: 5,
    summary:
      "Save-corrupting bug triggered review bombing. Score plunged to 58%.",
    dominant_signal: "Review score crashed from 82% to 58%",
    key_event: "Chapter 3 save corruption reported by dozens of players",
    insight:
      "Five days of negative reviews nearly killed momentum. The dev\u2019s quick, transparent response (public acknowledgment + timeline) prevented a death spiral.",
  },
  {
    id: "recovery",
    label: "Recovery",
    start_date: "2025-11-13",
    end_date: "2025-11-19",
    start_day: 106,
    end_day: 112,
    duration_days: 7,
    summary:
      "Hotfix deployed. Community sentiment stabilised. Score recovering.",
    dominant_signal: "Review score climbing back: 58% \u2192 72%",
    key_event: "Hotfix v1.0.3 with complete save system overhaul",
    insight:
      "The free future DLC promise and the save backup system turned critics into advocates. Several negative reviews were updated to positive.",
  },
  {
    id: "breakout",
    label: "The IGP Effect",
    start_date: "2025-11-20",
    end_date: "2025-12-04",
    start_day: 113,
    end_day: 127,
    duration_days: 15,
    summary:
      "IGP\u2019s full playthrough drove 1,200 reviews in 7 days. OPS peaked at 89.",
    dominant_signal: "IGP upload (2.1M views) + Fooster follow-up (640K views)",
    key_event: "IGP full playthrough uploaded on day 21 post-launch",
    insight:
      "A single 5M-sub creator uploading at the right moment \u2014 after the bug was fixed, when the game was stable \u2014 created the breakout. Timing was everything.",
  },
  {
    id: "tail",
    label: "Long Tail",
    start_date: "2025-12-05",
    end_date: "2026-03-30",
    start_day: 128,
    end_day: 243,
    duration_days: 116,
    summary:
      "Steady organic growth. 28K owners. One Reddit viral moment added a late bump.",
    dominant_signal: "Organic review accumulation at ~5/day",
    key_event:
      '"This game broke me" Reddit post (3,420 upvotes) on day 213',
    insight:
      "The long tail held better than median for the genre. The Reddit viral post 5 months after launch proves the game has lasting emotional impact \u2014 a strong signal for DLC or sequel potential.",
  },
];

// ─── Creator Impact ─────────────────────────────────────────────────

export const CREATOR_IMPACTS: CreatorImpact[] = [
  {
    channel_name: "IGP",
    subscriber_count: 5200000,
    video_title:
      "This Horror Game Made Me CRY | Hollowfield (Full Playthrough)",
    upload_date: "2025-11-20",
    view_count: 2100000,
    reviews_before_7d: 82,
    reviews_after_7d: 1243,
    ccu_before_7d: 187,
    ccu_after_7d: 623,
    impact_score: 98,
    covers: "game",
  },
  {
    channel_name: "DarkCornerGaming",
    subscriber_count: 280000,
    video_title: "This Indie Horror Demo DESTROYED Me | Hollowfield",
    upload_date: "2025-08-20",
    view_count: 412000,
    reviews_before_7d: 28,
    reviews_after_7d: 89,
    ccu_before_7d: 12,
    ccu_after_7d: 38,
    impact_score: 72,
    covers: "demo",
  },
  {
    channel_name: "Fooster",
    subscriber_count: 1800000,
    video_title: "Hollowfield Full Game | Indie Horror Masterpiece?",
    upload_date: "2025-11-22",
    view_count: 640000,
    reviews_before_7d: 410,
    reviews_after_7d: 890,
    ccu_before_7d: 520,
    ccu_after_7d: 480,
    impact_score: 61,
    covers: "game",
  },
  {
    channel_name: "MrKravin",
    subscriber_count: 890000,
    video_title: "Hollowfield is HERE and It's TERRIFYING",
    upload_date: "2025-10-31",
    view_count: 385000,
    reviews_before_7d: 0,
    reviews_after_7d: 385,
    ccu_before_7d: 0,
    ccu_after_7d: 710,
    impact_score: 55,
    covers: "game",
  },
  {
    channel_name: "CJUGames",
    subscriber_count: 520000,
    video_title: "The Horror Game Everyone's Been Waiting For",
    upload_date: "2025-11-02",
    view_count: 198000,
    reviews_before_7d: 125,
    reviews_after_7d: 260,
    ccu_before_7d: 620,
    ccu_after_7d: 540,
    impact_score: 38,
    covers: "game",
  },
  {
    channel_name: "ManlyBadassHero",
    subscriber_count: 1400000,
    video_title: "Underrated Horror Games of 2025",
    upload_date: "2026-01-20",
    view_count: 520000,
    reviews_before_7d: 18,
    reviews_after_7d: 42,
    ccu_before_7d: 35,
    ccu_after_7d: 62,
    impact_score: 24,
    covers: "game",
  },
  {
    channel_name: "HorrorUnderground",
    subscriber_count: 42000,
    video_title: "Horror Game You NEED to Try",
    upload_date: "2025-08-12",
    view_count: 67000,
    reviews_before_7d: 12,
    reviews_after_7d: 22,
    ccu_before_7d: 8,
    ccu_after_7d: 15,
    impact_score: 14,
    covers: "demo",
  },
];

// ─── Timeline Data Generator ────────────────────────────────────────

function generateSnapshots(): TimelineSnapshot[] {
  const totalDays = daysBetween(DEMO_LAUNCH, TODAY);
  const launchDay = daysBetween(DEMO_LAUNCH, GAME_LAUNCH); // 92
  const snapshots: TimelineSnapshot[] = [];

  let demoReviews = 0;
  let gameReviews = 0;
  let owners = 0;
  let ytViews = 0;

  for (let d = 0; d <= totalDays; d++) {
    const date = addDays(DEMO_LAUNCH, d);
    const ds = dateStr(date);
    const gameDays = d - launchDay; // days since game launch (negative = pre-launch)

    // ── Phase determination ──
    let phase: TimelineSnapshot["phase"];
    if (d < launchDay) phase = "demo";
    else if (gameDays <= 8) phase = "launch_week";
    else if (gameDays <= 13) phase = "crisis";
    else if (gameDays <= 20) phase = "recovery";
    else if (gameDays <= 35) phase = "breakout";
    else if (d >= 213 && d <= 220) phase = "reddit_bump";
    else phase = "tail";

    // ── Demo Reviews ──
    if (d < launchDay) {
      if (d < 13) {
        demoReviews += noisyInt(2, 1.5, d, 1);
      } else if (d < 21) {
        demoReviews += noisyInt(4, 2, d, 1);
      } else if (d < 47) {
        // After DarkCornerGaming
        demoReviews += noisyInt(7, 3, d, 1);
      } else {
        demoReviews += noisyInt(4, 2, d, 1);
      }
    } else {
      // Post-launch: demo still gets trickle
      demoReviews += noisyInt(gameDays < 30 ? 2 : 0.5, 1, d, 1);
    }

    // Demo score: ~71% throughout, slight improvement after updates
    const demoScore =
      d < 72
        ? 69 + noise(d, 10) * 6
        : 72 + noise(d, 10) * 5;

    // ── Game Reviews ──
    if (gameDays >= 0) {
      if (gameDays <= 6) {
        // Launch week: strong
        gameReviews += noisyInt(55, 15, d, 2);
      } else if (gameDays <= 8) {
        gameReviews += noisyInt(42, 10, d, 2);
      } else if (gameDays <= 13) {
        // Bug crisis: reviews continue but many negative
        gameReviews += noisyInt(28, 8, d, 2);
      } else if (gameDays <= 20) {
        // Recovery
        gameReviews += noisyInt(32, 10, d, 2);
      } else if (gameDays <= 27) {
        // IGP effect: massive spike
        const igpBoost = gameDays <= 24 ? 175 : 120;
        gameReviews += noisyInt(igpBoost, 30, d, 2);
      } else if (gameDays <= 35) {
        // Afterglow
        gameReviews += noisyInt(40, 12, d, 2);
      } else if (gameDays <= 60) {
        gameReviews += noisyInt(18, 6, d, 2);
      } else if (gameDays <= 90) {
        gameReviews += noisyInt(8, 4, d, 2);
      } else if (d >= 213 && d <= 220) {
        // Reddit bump
        gameReviews += noisyInt(25, 8, d, 2);
      } else {
        gameReviews += noisyInt(3, 2, d, 2);
      }
    }

    // ── Review Score ──
    let reviewScore = 0;
    if (gameDays >= 0) {
      if (gameDays <= 8) {
        reviewScore = 82 + noise(d, 20) * 4;
      } else if (gameDays === 9) {
        reviewScore = 72;
      } else if (gameDays === 10) {
        reviewScore = 64;
      } else if (gameDays === 11) {
        reviewScore = 59;
      } else if (gameDays <= 13) {
        reviewScore = 58 + noise(d, 20) * 3;
      } else if (gameDays <= 16) {
        // Recovery start
        reviewScore = 62 + (gameDays - 14) * 3 + noise(d, 20) * 2;
      } else if (gameDays <= 20) {
        reviewScore = 72 + noise(d, 20) * 3;
      } else if (gameDays <= 35) {
        // IGP period: positive reviews flood in
        const recovery = smoothStep(21, 30, gameDays);
        reviewScore = 74 + recovery * 12 + noise(d, 20) * 2;
      } else {
        // Settle around 84%
        reviewScore = 83 + noise(d, 20) * 3;
      }
    }

    // ── Peak CCU ──
    let ccu = 0;
    if (d < launchDay) {
      // Demo period: low
      if (d < 21) ccu = noisyInt(8, 5, d, 3);
      else if (d < 47) ccu = noisyInt(22, 8, d, 3);
      else ccu = noisyInt(12, 6, d, 3);
    } else if (gameDays <= 1) {
      ccu = noisyInt(620, 80, d, 3);
    } else if (gameDays === 2) {
      ccu = noisyInt(780, 50, d, 3);
    } else if (gameDays === 3) {
      ccu = 847; // The peak
    } else if (gameDays <= 6) {
      ccu = noisyInt(550, 80, d, 3);
    } else if (gameDays <= 8) {
      ccu = noisyInt(420, 60, d, 3);
    } else if (gameDays <= 13) {
      // Bug crisis: CCU drops
      ccu = noisyInt(200, 50, d, 3);
    } else if (gameDays <= 20) {
      ccu = noisyInt(280, 60, d, 3);
    } else if (gameDays <= 22) {
      // IGP day
      ccu = noisyInt(550, 80, d, 3);
    } else if (gameDays <= 27) {
      ccu = noisyInt(450, 70, d, 3);
    } else if (gameDays <= 35) {
      ccu = noisyInt(180, 40, d, 3);
    } else if (gameDays <= 60) {
      ccu = noisyInt(80, 20, d, 3);
    } else if (gameDays <= 120) {
      ccu = noisyInt(45, 15, d, 3);
    } else if (d >= 213 && d <= 218) {
      // Reddit bump
      ccu = noisyInt(80, 20, d, 3);
    } else {
      ccu = noisyInt(30, 12, d, 3);
    }

    // ── Owners Estimate ──
    if (gameDays >= 0) {
      if (gameDays <= 7) owners += noisyInt(700, 200, d, 4);
      else if (gameDays <= 13) owners += noisyInt(350, 100, d, 4);
      else if (gameDays <= 27) owners += noisyInt(500, 150, d, 4);
      else if (gameDays <= 60) owners += noisyInt(150, 50, d, 4);
      else if (gameDays <= 120) owners += noisyInt(60, 25, d, 4);
      else if (d >= 213 && d <= 220) owners += noisyInt(100, 30, d, 4);
      else owners += noisyInt(25, 15, d, 4);
    }

    // ── OPS Score ──
    let opsScore: number | null = null;
    let opsConf: string | null = null;
    let reviewComp: number | null = null;
    let velocityComp: number | null = null;
    let ccuComp: number | null = null;
    let youtubeComp: number | null = null;

    if (gameDays >= 2) {
      // OPS needs a couple days of data
      if (gameDays <= 8) {
        opsScore = 45 + gameDays * 3 + noise(d, 50) * 5;
        reviewComp = 0.55 + noise(d, 51) * 0.1;
        velocityComp = 0.7 + noise(d, 52) * 0.1;
        ccuComp = 0.8 + noise(d, 53) * 0.1;
        youtubeComp = 0.3 + noise(d, 54) * 0.1;
      } else if (gameDays <= 13) {
        // Crisis: OPS drops
        const crisisDrop = (gameDays - 9) * 6;
        opsScore = 65 - crisisDrop + noise(d, 50) * 4;
        reviewComp = 0.3 + noise(d, 51) * 0.1;
        velocityComp = 0.4 + noise(d, 52) * 0.1;
        ccuComp = 0.35 + noise(d, 53) * 0.1;
        youtubeComp = 0.25 + noise(d, 54) * 0.1;
      } else if (gameDays <= 20) {
        // Recovery
        const recov = smoothStep(14, 20, gameDays);
        opsScore = 38 + recov * 20 + noise(d, 50) * 4;
        reviewComp = 0.4 + recov * 0.2 + noise(d, 51) * 0.05;
        velocityComp = 0.35 + recov * 0.25 + noise(d, 52) * 0.05;
        ccuComp = 0.4 + recov * 0.15 + noise(d, 53) * 0.05;
        youtubeComp = 0.3 + noise(d, 54) * 0.05;
      } else if (gameDays <= 27) {
        // IGP spike — OPS all-time peak
        const igpRamp = smoothStep(21, 24, gameDays);
        opsScore = 58 + igpRamp * 31 + noise(d, 50) * 3;
        if (gameDays === 24 || gameDays === 25) opsScore = 89; // Peak
        reviewComp = 0.7 + igpRamp * 0.25;
        velocityComp = 0.65 + igpRamp * 0.3;
        ccuComp = 0.5 + igpRamp * 0.3;
        youtubeComp = 0.6 + igpRamp * 0.35;
      } else if (gameDays <= 45) {
        // Post-breakout decline
        const decay = smoothStep(28, 45, gameDays);
        opsScore = 85 - decay * 40 + noise(d, 50) * 3;
        reviewComp = 0.85 - decay * 0.3;
        velocityComp = 0.9 - decay * 0.5;
        ccuComp = 0.7 - decay * 0.4;
        youtubeComp = 0.9 - decay * 0.4;
      } else if (gameDays <= 90) {
        const decay2 = smoothStep(45, 90, gameDays);
        opsScore = 45 - decay2 * 15 + noise(d, 50) * 3;
        reviewComp = 0.55 - decay2 * 0.15;
        velocityComp = 0.4 - decay2 * 0.2;
        ccuComp = 0.3 - decay2 * 0.15;
        youtubeComp = 0.5 - decay2 * 0.2;
      } else if (d >= 213 && d <= 220) {
        // Reddit bump in OPS
        opsScore = 34 + noise(d, 50) * 4;
        reviewComp = 0.38;
        velocityComp = 0.3;
        ccuComp = 0.2;
        youtubeComp = 0.28;
      } else {
        opsScore = 28 + noise(d, 50) * 6;
        reviewComp = 0.35 + noise(d, 51) * 0.05;
        velocityComp = 0.15 + noise(d, 52) * 0.05;
        ccuComp = 0.12 + noise(d, 53) * 0.05;
        youtubeComp = 0.25 + noise(d, 54) * 0.05;
      }

      opsScore = Math.max(0, Math.min(100, Math.round(opsScore)));
      opsConf =
        gameDays < 7 ? "low" : gameDays < 21 ? "medium" : "high";
    }

    // ── Twitch ──
    let twitchViewers = 0;
    let twitchStreams = 0;
    if (gameDays >= 0) {
      if (gameDays <= 7) {
        twitchViewers = noisyInt(320, 100, d, 5);
        twitchStreams = noisyInt(8, 3, d, 6);
      } else if (gameDays <= 13) {
        twitchViewers = noisyInt(120, 50, d, 5);
        twitchStreams = noisyInt(4, 2, d, 6);
      } else if (gameDays <= 20) {
        twitchViewers = noisyInt(80, 30, d, 5);
        twitchStreams = noisyInt(3, 2, d, 6);
      } else if (gameDays <= 24) {
        // IGP/Twitch spike
        twitchViewers = noisyInt(890, 200, d, 5);
        twitchStreams = noisyInt(18, 5, d, 6);
      } else if (gameDays <= 30) {
        twitchViewers = noisyInt(250, 80, d, 5);
        twitchStreams = noisyInt(6, 3, d, 6);
      } else if (gameDays <= 60) {
        twitchViewers = noisyInt(40, 20, d, 5);
        twitchStreams = noisyInt(2, 1, d, 6);
      } else {
        twitchViewers = noisyInt(10, 8, d, 5);
        twitchStreams = noisyInt(1, 1, d, 6);
      }
    } else if (d > 20 && d < launchDay) {
      // Occasional demo streaming
      twitchViewers = noisyInt(5, 5, d, 5);
      twitchStreams = noise(d, 6) > 0.7 ? 1 : 0;
    }

    // ── YouTube cumulative views ──
    // Accumulate based on video release dates
    if (d >= 13) ytViews += noisyInt(d < 21 ? 800 : 400, 300, d, 7); // HorrorUnderground trickle
    if (d >= 21) ytViews += noisyInt(d < 47 ? 3000 : 600, 500, d, 8); // DarkCornerGaming
    if (d >= 93) ytViews += noisyInt(d < 100 ? 8000 : 1200, 2000, d, 9); // MrKravin
    if (d >= 95) ytViews += noisyInt(d < 102 ? 4000 : 800, 1000, d, 10); // CJUGames
    if (d >= 113) ytViews += noisyInt(d < 125 ? 35000 : 3000, 5000, d, 11); // IGP
    if (d >= 115) ytViews += noisyInt(d < 125 ? 12000 : 1500, 2000, d, 12); // Fooster
    if (d >= 174) ytViews += noisyInt(d < 180 ? 8000 : 1000, 1500, d, 13); // ManlyBadassHero

    snapshots.push({
      date: ds,
      day_index: d,
      phase,
      review_count: gameReviews,
      review_score_pct: gameDays >= 0 ? Math.round(reviewScore * 10) / 10 : 0,
      peak_ccu: Math.max(0, ccu),
      owners_estimate: owners,
      demo_review_count: demoReviews,
      demo_review_score_pct: Math.round(demoScore * 10) / 10,
      ops_score: opsScore,
      ops_confidence: opsConf,
      review_component: reviewComp ? Math.round(reviewComp * 100) / 100 : null,
      velocity_component: velocityComp
        ? Math.round(velocityComp * 100) / 100
        : null,
      decay_component: null,
      ccu_component: ccuComp ? Math.round(ccuComp * 100) / 100 : null,
      youtube_component: youtubeComp
        ? Math.round(youtubeComp * 100) / 100
        : null,
      creator_response_component: null,
      twitch_viewers: twitchViewers,
      twitch_streams: twitchStreams,
      yt_cumulative_views: ytViews,
    });
  }

  return snapshots;
}

// ─── Ghost / Comparison Data ────────────────────────────────────────

export function generateGhostData(
  snapshots: TimelineSnapshot[]
): TimelineSnapshot[] {
  const launchDay = 92;
  return snapshots.map((s) => {
    const gameDays = s.day_index - launchDay;
    // Median psych horror indie: slower start, no crisis, no breakout, steady decline
    let ghostReviews = 0;
    let ghostCcu = 0;
    let ghostOps: number | null = null;
    let ghostOwners = 0;

    if (gameDays >= 0) {
      // Reviews: ~40% of Hollowfield's pace
      ghostReviews = Math.round(
        Math.min(gameDays * 12, 1200) * smoothStep(0, 90, gameDays)
      );
      if (gameDays > 90) ghostReviews = 1200 + (gameDays - 90) * 2;

      // CCU: peaks at ~300, decays faster
      if (gameDays <= 3) ghostCcu = Math.round(180 + gameDays * 40);
      else if (gameDays <= 14) ghostCcu = Math.round(300 - (gameDays - 3) * 18);
      else if (gameDays <= 60)
        ghostCcu = Math.round(100 * Math.exp(-(gameDays - 14) / 30));
      else ghostCcu = Math.round(15 + noise(s.day_index, 99) * 10);

      // OPS: peaks around 52, steady decline
      if (gameDays >= 2) {
        if (gameDays <= 10) ghostOps = Math.round(30 + gameDays * 2.2);
        else if (gameDays <= 30)
          ghostOps = Math.round(52 - (gameDays - 10) * 0.8);
        else if (gameDays <= 90)
          ghostOps = Math.round(36 - (gameDays - 30) * 0.25);
        else ghostOps = Math.round(20 + noise(s.day_index, 99) * 5);
      }

      // Owners: ~40% of Hollowfield
      ghostOwners = Math.round(gameDays * 55);
      if (gameDays > 30) ghostOwners = Math.round(1650 + (gameDays - 30) * 25);
    }

    return {
      ...s,
      review_count: ghostReviews,
      review_score_pct: gameDays >= 0 ? 74 + noise(s.day_index, 99) * 4 : 0,
      peak_ccu: ghostCcu,
      owners_estimate: ghostOwners,
      ops_score: ghostOps,
      demo_review_count: 0,
      demo_review_score_pct: 0,
      twitch_viewers: 0,
      twitch_streams: 0,
      yt_cumulative_views: 0,
      ops_confidence: null,
      review_component: null,
      velocity_component: null,
      decay_component: null,
      ccu_component: null,
      youtube_component: null,
      creator_response_component: null,
    };
  });
}

// ─── Exports ────────────────────────────────────────────────────────

export const SNAPSHOTS = generateSnapshots();
export const GHOST_SNAPSHOTS = generateGhostData(SNAPSHOTS);

// ─── Utility: Color & Shape Maps ────────────────────────────────────

export const EVENT_COLORS: Record<EventType, string> = {
  demo_launch: "#a78bfa", // violet
  game_launch: "#c0392b", // horror red
  youtube_demo: "#22d3ee", // cyan
  youtube_game: "#22d3ee", // cyan
  reddit: "#f97316", // orange
  steam_update: "#4ade80", // green
};

export const EVENT_LABELS: Record<EventType, string> = {
  demo_launch: "Demo Launch",
  game_launch: "Game Launch",
  youtube_demo: "YouTube (Demo)",
  youtube_game: "YouTube (Game)",
  reddit: "Reddit",
  steam_update: "Steam Update",
};

export const EVENT_ICONS: Record<EventType, string> = {
  demo_launch: "\u25B6", // play triangle
  game_launch: "\u2B50", // star
  youtube_demo: "\u25CF", // circle
  youtube_game: "\u25CF", // circle
  reddit: "\u25C6", // diamond
  steam_update: "\u25A0", // square
};

export const SERIES_COLORS = {
  reviews: "#e2e2e2",
  demo_reviews: "#22d3ee",
  review_score: "#facc15",
  peak_ccu: "#c0392b",
  twitch: "#a855f7",
  owners: "#4ade80",
  ops: "#ef4444",
  yt_views: "#38bdf8",
  ghost: "#ffffff18",
};
