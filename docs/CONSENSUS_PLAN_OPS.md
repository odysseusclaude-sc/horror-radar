# OPS Scoring Optimization — Multi-Agent Consensus

## Agents

| ID | Role | Mandate |
|---|---|---|
| **Steam Market** | Steam data & market dynamics analyst | Identify every retrievable Steam signal; assess feasibility against API docs |
| **Content/Social** | YouTube + Twitch + Reddit signal analyst | Maximize content-platform signal extraction within API quotas |
| **Horror Genre** | Horror genre domain expert | Case-study analysis of real breakouts; genre-specific structural patterns |
| **Scoring Methodology** | Composite scoring statistician | Formula architecture, collinearity, calibration, backtesting protocol |

---

## 1. Current OPS v5 — Baseline Audit

### 1.1 Component Inventory (v5)

| # | Component | Weight | Cap | Data Source | Calculation |
|---|---|---|---|---|---|
| 1 | Velocity | 0.30 | 5.0 | `game_snapshots.review_count` | current_velocity / expected_velocity_at_age |
| 2 | Decay Retention | 0.20 | 2.0 | `game_snapshots.review_count` | week2-4 velocity / week1 velocity |
| 3 | Review Volume | 0.13 | 5.0 | `game_snapshots.review_count` | (count / median) * price_modifier |
| 4 | YouTube | 0.13 | ~1.8 | `youtube_videos`, `youtube_video_snapshots` | 0.6*(views_subs_ratio/0.074) + 0.4*(channels/10) |
| 5 | CCU | 0.10 | 5.0 | `game_snapshots.peak_ccu` | (peak / median) * age_decay (→0 after 14d) |
| 6 | Sentiment | 0.08 | 2.0 | `game_snapshots.review_score_pct` | (score/100) * delta_multiplier |
| 7 | Twitch | 0.06 | 3.0 | `twitch_snapshots` | 0.7*(viewer_ratio) + 0.3*(streamer_breadth*2) |

**Final score**: `min(100, raw_weighted_sum * 24)`

### 1.2 Structural Problems Identified

**Scoring Methodology agent** found three critical issues:

1. **Review collinearity**: Components 1, 2, and 3 all derive from `review_count`. Their effective combined weight is 0.63 — nearly two-thirds of the score comes from one data stream. If Steam's review API lags or a game's audience doesn't leave reviews (e.g., non-English markets), the entire score collapses.

2. **Stated vs. effective weights diverge**: Due to NULL-weight redistribution + component caps, the *effective* contribution of YouTube is ~5.8% (not the stated 13%). CCU's effective weight drops to ~4% for games older than 14 days because of age decay.

3. **The x24 multiplier is arbitrary**: The constant `24` in `min(100, raw * 24)` was hand-tuned to spread scores across 0-100 but has no statistical basis. It creates ceiling effects for strong games and floor effects for weak ones — compressing the middle where discrimination matters most.

**Steam Market agent** added:

4. **No discount awareness**: A game running a 40% launch discount will see inflated review velocity (more buyers → more reviews). The score doesn't distinguish organic demand from price-driven demand.

5. **No multiplayer signal**: Multiplayer horror games (Lethal Company, Phasmophobia, Content Warning) have structurally different growth curves — exponential network effects vs. linear single-player adoption.

**Content/Social agent** found:

6. **Reddit is collected but not scored**: `reddit_mentions` table exists with posts from r/HorrorGaming and r/IndieGaming, but OPS ignores this data entirely.

7. **YouTube quota is 99.8% unused**: Daily quota of 10,000 units; current usage ~20 units/day. Massive headroom for richer YouTube signals.

---

## 2. The Debate

### 2.1 Agreements (All 4 Agents)

| # | Consensus Point |
|---|---|
| A1 | **Merge velocity + volume into a single "Review Momentum" component.** Three review-derived components create false precision. A single component measuring both rate and scale eliminates collinearity. |
| A2 | **Multiplayer is the strongest structural predictor of explosive growth in horror.** Every >$100M horror hit in the last 3 years had multiplayer (Lethal Company, Phasmophobia, Content Warning). It deserves explicit scoring, not just implicit velocity lift. |
| A3 | **The x24 multiplier must go.** Replace with a statistically grounded normalization (z-scores + CDF, or percentile rank against peer window). |
| A4 | **October/seasonal effects create false positives.** Horror games released in October ride a category-wide demand surge that inflates all signals. Temporal normalization is needed. |
| A5 | **Demo conversion is a high-value signal using existing data.** Games with demos that convert to strong post-launch reviews signal genuine product quality, not just marketing reach. |
| A6 | **Reddit should enter OPS.** It's already collected and represents grassroots word-of-mouth distinct from YouTube/Twitch creator-driven coverage. |
| A7 | **Backtesting protocol is mandatory before any formula change.** Dump current scores, run new formula, flag any game moving +/-15 points, investigate before committing. |

### 2.2 Disagreements and Verdicts

#### D1: How many components should OPS v6 have?

| Agent | Position |
|---|---|
| **Scoring Methodology** | **6 components max.** Merge velocity+volume, merge CCU+Twitch into "Live Engagement". Fewer components = less collinearity, more interpretable. |
| **Content/Social** | **8-9 components.** YouTube alone should be 3 sub-signals (view velocity, channel breadth, sentiment from likes/dislikes). Twitch should be separate from CCU. |
| **Horror Genre** | **7 components.** Keep Twitch separate (it signals creator interest specifically), but merge review components. Add multiplayer as standalone. |
| **Steam Market** | **7 components.** Agrees with Horror Genre. Discount-adjusted velocity is essential as distinct signal. |

**Verdict**: **7 components.** The Content/Social agent's YouTube sub-signals can be combined into a richer single YouTube component rather than splitting into 3 separate weights. Twitch stays separate from CCU because they measure different things (creator interest vs. player engagement). Multiplayer enters as a modifier, not a standalone component (see D2).

#### D2: Multiplayer — standalone component or modifier?

| Agent | Position |
|---|---|
| **Horror Genre** | **Binary modifier (x1.15 for multiplayer).** Multiplayer isn't a signal — it's a structural property that amplifies other signals. A standalone component would give multiplayer games a permanent advantage even with weak signals. |
| **Steam Market** | **Standalone component (0.08 weight).** Calculate network-effect ratio: concurrent_players / review_count. High ratio = strong multiplayer engagement. Measurable, not just binary. |
| **Scoring Methodology** | **Modifier on velocity and CCU only.** Multiplayer amplifies growth rate and concurrent players, but shouldn't inflate YouTube or sentiment scores. Apply selectively. |
| **Content/Social** | **Agree with Scoring Methodology.** Multiplayer games get more Twitch streams naturally — double-counting if it's also a standalone component. |

**Verdict**: **Conditional modifier on velocity and live-engagement components.** Apply `multiplayer_boost = 1.12` to Review Momentum and Live Engagement (CCU/Twitch) components only. Detection via Steam tags (`Multi-player`, `Online Co-Op`, `Co-op`) already in metadata. This avoids the permanent advantage problem while acknowledging the structural growth difference.

#### D3: Should OPS use z-score normalization or ratio-to-median?

| Agent | Position |
|---|---|
| **Scoring Methodology** | **Z-scores with CDF scaling.** `z = (value - median) / std_dev`, then `score = CDF(z) * 100`. Statistically rigorous, automatically calibrated, no magic constants. Self-normalizing as the dataset grows. |
| **Steam Market** | **Ratio-to-median with caps (current approach).** Z-scores require sufficient sample size per peer window. With <200 horror games in the 120-day window, standard deviations are unstable. Caps provide known bounds. |
| **Horror Genre** | **Hybrid.** Use z-scores for components with good coverage (reviews, CCU), ratio-to-median for sparse signals (Twitch, YouTube). |
| **Content/Social** | **Prefer z-scores** but agree with sample size concern. |

**Verdict**: **Phased approach.** Start with ratio-to-median + improved caps (v6.0). Prepare z-score infrastructure and switch when peer window consistently has 150+ games with each signal (v6.1). The Horror Genre hybrid approach is elegant but adds formula complexity. Better to do one or the other consistently.

#### D4: How to handle NULL/missing components?

| Agent | Position |
|---|---|
| **Scoring Methodology** | **Pessimistic imputation: z = -0.5 for missing.** Eliminates both NULL-redistribution AND coverage penalty — one mechanism instead of two. Missing data = slightly below average, not invisible. |
| **Steam Market** | **Keep coverage penalty.** It's intuitive: less data = less confidence = lower score. Pessimistic imputation could unfairly penalize games that genuinely have no YouTube coverage because no creator has played them yet. |
| **Horror Genre** | **Time-aware imputation.** A game with no YouTube at day 3 is normal. No YouTube at day 60 is a negative signal. Imputation severity should scale with age. |
| **Content/Social** | **Agree with Horror Genre.** Coverage expectations are time-dependent. |

**Verdict**: **Time-aware coverage penalty (simplified).** Keep the coverage penalty concept but make it age-aware:
- Days 1-7: Missing YouTube/Twitch/Reddit = neutral (no penalty, just redistribute)
- Days 8-30: Missing = mild penalty (0.90 multiplier per missing)
- Days 31-90: Missing = moderate penalty (0.80 multiplier per missing)

This is simpler than full pessimistic imputation while capturing the Horror Genre agent's key insight.

#### D5: Temporal/seasonal weighting?

| Agent | Position |
|---|---|
| **Horror Genre** | **Critical.** October is a false-positive factory. Every horror game looks like a breakout in October because category-wide demand surges. Need month-specific peer baselines. |
| **Scoring Methodology** | **Use rolling peer windows, not month adjustment.** If baselines are computed from the same 120-day window, October games are compared to other October games. The problem is self-correcting. |
| **Steam Market** | **Agree with Scoring Methodology** but add Steam seasonal sale dampening. Discount-driven velocity during Summer/Winter sales should be flagged. |
| **Content/Social** | **YouTube has its own seasonality.** Horror content peaks in October on YouTube. A game getting coverage in October is less impressive than the same coverage in March. |

**Verdict**: **Rolling peer baselines (already implemented) + discount dampening.** The Scoring Methodology agent is correct that rolling baselines handle most seasonality. Add explicit discount awareness (see component spec below) to handle sale-driven false signals. YouTube October normalization deferred — the effect is partially captured by rolling baselines and adds formula complexity for marginal gain.

#### D6: Subgenre-specific weight profiles?

| Agent | Position |
|---|---|
| **Horror Genre** | **Essential.** Psychological horror games grow slowly via word-of-mouth (high sentiment weight). Action horror grows via streamers (high Twitch weight). One-size-fits-all weights systematically undervalue slow-burn breakouts. |
| **Scoring Methodology** | **Dangerous.** Subgenre classification is fuzzy (5-layer classifier already has edge cases). Adding subgenre-specific weights creates a combinatorial explosion of tuning parameters. Maintain one formula with genre-agnostic signals. |
| **Steam Market** | **Sympathetic but impractical.** Agree the insight is correct but the classifier isn't reliable enough to support weight branching. |
| **Content/Social** | **Partial support.** Maybe just 2 profiles: "streamer-driven" (multiplayer/action) and "discovery-driven" (single-player/atmospheric). |

**Verdict**: **Defer to v6.1.** The insight is valid but the subgenre classifier needs hardening first (see Phase 2.2 in CONSENSUS_PLAN.md). Track subgenre-specific signal distributions in OPS diagnostics now, implement weight profiles only after the classifier proves reliable on 200+ games.

#### D7: What to do about the autotune bug?

All agents agreed: **Fix immediately.** `ops_autotune.py` references `current_weights` dict that's missing `sentiment` and `twitch` keys — it will crash or silently skip these components in diagnostics. This is a P0 bug.

---

## 3. Proposed OPS v6 — Component Specification

### 3.1 Component Table

| # | Component | Weight | Cap | Source | New? | Calculation |
|---|---|---|---|---|---|---|
| 1 | **Review Momentum** | 0.28 | 5.0 | `game_snapshots` | Merged | `0.55 * velocity_ratio + 0.25 * volume_ratio + 0.20 * retention_ratio` |
| 2 | **Sentiment** | 0.10 | 2.0 | `game_snapshots` | Enhanced | `(score_pct/100) * delta_mult * (1 + early_bonus)` |
| 3 | **YouTube Signal** | 0.18 | 3.0 | `youtube_*` tables | Enhanced | `0.35*view_velocity + 0.30*channel_breadth + 0.20*engagement + 0.15*creator_tier` |
| 4 | **Live Engagement** | 0.15 | 4.0 | `game_snapshots` + `twitch_snapshots` | Merged | `0.50*ccu_ratio + 0.30*twitch_streamer + 0.20*twitch_viewer` |
| 5 | **Community Buzz** | 0.10 | 3.0 | `reddit_mentions` | **New** | `0.50*mention_velocity + 0.30*upvote_quality + 0.20*comment_depth` |
| 6 | **Demo Conversion** | 0.07 | 2.5 | `games` + `game_snapshots` | **New** | `review_velocity_post_launch / demo_review_benchmark` (only for games with demos) |
| 7 | **Discount-Adjusted Demand** | 0.12 | 3.0 | `game_snapshots` + price data | **New** | `raw_velocity * discount_dampening_factor` |

**Total weight**: 1.00

**Multiplayer modifier**: `1.12x` applied to components 1 and 4 when game has multiplayer tags.

**Final score**: `min(100, weighted_sum * calibration_constant)` where `calibration_constant` is set so the 95th percentile game scores ~85. Recalculated weekly from the full dataset.

### 3.2 Detailed Component Specifications

#### Component 1: Review Momentum (weight 0.28)

Merges v5's velocity (0.30), volume (0.13), and decay retention (0.20) into a single review-derived component. Eliminates the collinearity problem.

```
velocity_ratio     = current_7d_velocity / expected_velocity_at_age    (cap 5.0)
volume_ratio       = (review_count / peer_median_reviews) * price_mod  (cap 5.0)
retention_ratio    = week2_4_velocity / week1_velocity                 (cap 2.0)

review_momentum = 0.55 * min(velocity_ratio, 5.0)
               + 0.25 * min(volume_ratio, 5.0)
               + 0.20 * min(retention_ratio, 2.0)
```

**Sub-weights rationale**: Velocity (rate of growth) is the strongest breakout signal. Volume provides scale context. Retention confirms sustainability vs. launch spike.

**Price modifiers** (carried from v5): Free=0.6, <$5=0.85, $5-10=1.0, $10-20=1.15, $20+=1.3

**Multiplayer boost**: If game has multiplayer tags, multiply final `review_momentum` by 1.12.

#### Component 2: Sentiment (weight 0.10)

Upgraded from v5's 0.08 weight. Sentiment is the only quality signal (everything else measures quantity/reach).

```
base = review_score_pct / 100                     (NULL if review_count < 10)
delta = current_score_pct - score_pct_at_day_7
early_bonus = 0.15 if (review_count >= 50 AND score_pct >= 90 AND days <= 14) else 0

multiplier:
  delta >= +5  -> 1.30  (improving sentiment)
  delta >= -5  -> 1.00  (stable)
  delta >= -15 -> 0.85  (declining)
  else         -> 0.65  (collapsing)

sentiment = min(2.0, base * multiplier * (1 + early_bonus))
```

**Early bonus rationale** (Horror Genre agent): Games that hit 90%+ with 50+ reviews in the first 2 weeks are overwhelmingly genuine breakouts (Iron Lung, Buckshot Roulette pattern). The bonus is small (15%) and time-gated.

#### Component 3: YouTube Signal (weight 0.18)

The most significantly enhanced component. Current YouTube effective weight is ~5.8% despite stated 13%. v6 brings it to a true 18% with richer sub-signals.

```
view_velocity    = total_views_7d / total_subs_of_covering_channels    (cap 0.30)
                   normalized: view_velocity / 0.074                   (cap 4.0)

channel_breadth  = unique_channels_covering / 10                       (cap 1.0)
                   * breadth_tier_bonus:
                     >= 5 channels: 1.20
                     >= 3 channels: 1.10
                     else: 1.00

engagement       = avg(like_ratio * comment_rate) across videos        (cap 2.0)
                   like_ratio = likes / views  (baseline 0.04)
                   comment_rate = comments / views  (baseline 0.002)

creator_tier     = max_tier_score across covering channels              (cap 2.0)
                   tier_score: >5M subs = 2.0, >1M = 1.5, >500K = 1.2,
                              >100K = 1.0, >10K = 0.7, else = 0.4

youtube_signal = 0.35 * min(view_velocity_norm, 4.0)
              + 0.30 * min(channel_breadth * bonus, 1.5)
              + 0.20 * min(engagement, 2.0)
              + 0.15 * min(creator_tier, 2.0)
```

**Quota impact** (Content/Social agent): Current usage ~20 units/day of 10,000 quota. Engagement metrics (likes, comments) are already collected in `youtube_video_snapshots`. Creator tier uses `youtube_channels.subscriber_count`. No additional API calls needed for v6.0 — all data already exists.

**Future enhancement (v6.1)**: YouTube comment sentiment analysis via simple keyword scoring (no ML needed). "scary", "terrifying", "best horror" = positive. "boring", "not scary", "clickbait" = negative.

#### Component 4: Live Engagement (weight 0.15)

Merges v5's CCU (0.10) and Twitch (0.06). Both measure real-time player/viewer engagement.

```
ccu_ratio        = peak_ccu_7d / peer_median_ccu                       (cap 5.0)
                   * age_decay: linear decay from 1.0 at day 0 to 0.3 at day 30
                   (extended from v5's harsh 14-day cutoff)

twitch_streamer  = unique_streamers_7d / 5                             (cap 1.0)
twitch_viewer    = peak_viewers_7d / peer_median_twitch_viewers        (cap 5.0)

live_engagement = 0.50 * min(ccu_ratio * age_decay, 5.0)
               + 0.30 * min(twitch_streamer, 1.0)
               + 0.20 * min(twitch_viewer, 5.0)
```

**Multiplayer boost**: If multiplayer, multiply final `live_engagement` by 1.12.

**Age decay extension rationale**: v5's 14-day cutoff was too aggressive. CCU is still meaningful at day 20-30 for games with sustained player bases. Linear decay to 0.3 (not 0.0) preserves a small CCU signal through the full 90-day window.

#### Component 5: Community Buzz (weight 0.10) — NEW

Brings `reddit_mentions` into OPS for the first time. Reddit captures grassroots word-of-mouth that YouTube/Twitch don't (player-to-player recommendations, not creator-to-audience).

```
mention_velocity = mentions_7d / peer_median_mentions_7d               (cap 5.0)
upvote_quality   = avg_upvotes_per_mention / peer_median_upvotes       (cap 3.0)
comment_depth    = avg_comments_per_mention / peer_median_comments     (cap 3.0)

community_buzz = 0.50 * min(mention_velocity, 5.0)
              + 0.30 * min(upvote_quality, 3.0)
              + 0.20 * min(comment_depth, 3.0)
```

**Data source**: `reddit_mentions` table (already collected from r/HorrorGaming, r/IndieGaming). Fields: `upvotes`, `num_comments`, `created_utc`.

**Coverage concern** (Scoring Methodology): Reddit coverage is sparse for most indie horror games. Expected NULL rate: ~60%. This is acceptable with time-aware coverage penalty — missing Reddit at day 7 is neutral, missing at day 60 is a mild negative.

**Future enhancement**: Add r/pcgaming, r/Steam, r/horror for broader coverage. Requires adding subreddits to Reddit collector config.

#### Component 6: Demo Conversion (weight 0.07) — NEW

Horror games with demos that convert well signal genuine product quality. This is the only "funnel" metric in OPS.

```
IF game.has_demo AND demo_review_count >= 5:
  demo_benchmark = peer_median_demo_reviews
  conversion_signal = post_launch_velocity_7d / max(demo_benchmark, 1)  (cap 2.5)
  demo_conversion = min(conversion_signal, 2.5)
ELSE:
  demo_conversion = NULL  (redistributed to other components)
```

**Rationale** (Steam Market + Horror Genre): Games like Iron Lung and Buckshot Roulette had playable demos that generated pre-launch buzz. Demo review counts are already tracked in `game_snapshots.demo_review_count`. This component rewards games where demo interest successfully converted to launch sales.

**Low weight (0.07) justification**: Only ~30% of tracked games have demos. The signal is meaningful but the coverage is too narrow for higher weight.

#### Component 7: Discount-Adjusted Demand (weight 0.12) — NEW

Separates organic demand from price-driven purchases.

```
current_price    = game.price_usd
original_price   = game.original_price_usd  (if available) OR price at first snapshot
discount_pct     = max(0, 1 - (current_price / original_price))

dampening_factor:
  discount_pct == 0    -> 1.00  (full price = full credit)
  discount_pct <= 0.25 -> 0.90  (small discount, minor dampening)
  discount_pct <= 0.50 -> 0.75  (major discount, significant dampening)
  discount_pct > 0.50  -> 0.60  (deep discount, heavy dampening)

adjusted_demand = velocity_ratio * dampening_factor
```

**Schema requirement**: Need `original_price_usd` or price history tracking. Steam `appdetails` API returns `price_overview.initial` (original price before discount). Can be captured in metadata collector.

**Seasonal sale handling**: During Steam seasonal sales (Summer, Winter, Halloween), many games run discounts simultaneously. The dampening factor handles this automatically — all discounted games get dampened equally.

---

## 4. Normalization & Final Score

### 4.1 v6.0: Improved Ratio-to-Median

```
raw_ops = sum(weight_i * component_i for all active components)
        / sum(weight_i for all active components)  # NULL redistribution

# Time-aware coverage penalty
age_bucket = "early" if days <= 7 else "mid" if days <= 30 else "mature"
expected_components = {
  "early": 4,   # Review Momentum, Sentiment, Live Engagement, Discount-Adjusted
  "mid": 6,     # + YouTube, Community Buzz
  "mature": 7   # + Demo Conversion (if has_demo)
}
active = count of non-NULL components
missing_penalty = 0.90 ^ max(0, expected_components[age_bucket] - active)

# Calibration (replaces x24 magic constant)
calibration_constant = recalculated weekly so P95 game = 85
score = min(100, raw_ops * calibration_constant * missing_penalty)

# Multiplayer modifier (applied to eligible components before aggregation)
if game.is_multiplayer:
  review_momentum *= 1.12
  live_engagement *= 1.12
```

### 4.2 v6.1 (Future): Z-Score Composite

When peer window consistently has 150+ games per signal:

```
for each component:
  z_i = (value_i - peer_median_i) / peer_std_i
  if NULL:
    z_i = -0.5  # pessimistic imputation

score = CDF(weighted_sum(z_i)) * 100
```

This eliminates caps, calibration constants, and coverage penalties in a single mechanism.

---

## 5. Complete Data Point Inventory

### 5.1 Currently Collected (used in v5)

| Signal | Table | Field(s) | Used In |
|---|---|---|---|
| Review count | `game_snapshots` | `review_count` | Velocity, Volume, Retention |
| Review score % | `game_snapshots` | `review_score_pct` | Sentiment |
| Peak CCU | `game_snapshots` | `peak_ccu` | CCU |
| Review velocity 7d | `game_snapshots` | `review_velocity_7d` | Velocity |
| YouTube video views | `youtube_video_snapshots` | `view_count` | YouTube |
| YouTube channel subs | `youtube_channels` | `subscriber_count` | YouTube |
| YouTube video count | `youtube_videos` | matched per game | YouTube |
| Twitch peak viewers | `twitch_snapshots` | `peak_viewers` | Twitch |
| Twitch stream count | `twitch_snapshots` | `stream_count` | Twitch |
| Game price | `games` | `price_usd` | Volume price modifier |
| Release date | `games` | `release_date` | Age calculations |
| Has demo | `games` | `has_demo` | (badge only, not scored) |
| Demo review count | `game_snapshots` | `demo_review_count` | (display only, not scored) |

### 5.2 Currently Collected (NOT used in v5 — free signals)

| Signal | Table | Field(s) | Proposed Use in v6 |
|---|---|---|---|
| Reddit mentions | `reddit_mentions` | `upvotes`, `num_comments`, `created_utc` | Community Buzz component |
| YouTube likes | `youtube_video_snapshots` | `like_count` | YouTube engagement sub-signal |
| YouTube comments | `youtube_video_snapshots` | `comment_count` | YouTube engagement sub-signal |
| Demo reviews | `game_snapshots` | `demo_review_count` | Demo Conversion component |
| Steam tags | `games` | `tags` (JSON) | Multiplayer detection, subgenre classification |
| Achievement completion | `game_snapshots` | `median_achievement_pct` | (v6.1 retention proxy) |
| Patch frequency | `game_snapshots` | `update_count_30d` | (v6.1 dev responsiveness signal) |
| Developer profile | `developer_profiles` | `avg_review_score`, `total_games` | (v6.1 dev track record) |
| Next Fest flag | `games` | `next_fest` | Next Fest multiplier (carry from plan) |

### 5.3 New Data Points Required for v6

| Signal | API Source | API Call | Quota/Rate Impact | Priority |
|---|---|---|---|---|
| Original price (pre-discount) | Steam `appdetails` | Already called in metadata | **Zero** — parse `price_overview.initial` from existing response | P0 |
| Multiplayer tags | Steam `appdetails` | Already called in metadata | **Zero** — parse from existing `categories` array | P0 |
| YouTube comment text (for sentiment) | YouTube Data API v3 | `commentThreads.list` | 3 units/call, ~50 calls/day = 150 units | P1 (v6.1) |
| Twitch clips | Twitch API | `clips` endpoint | Low — 1 call per game per day | P1 (v6.1) |
| Steam wishlist data | N/A | **Not available** via any public API | N/A | Rejected |
| SteamDB player charts | N/A | **No API** — scraping only, against ToS | N/A | Rejected |

### 5.4 Signals Investigated and Rejected

| Signal | Investigated By | Reason for Rejection |
|---|---|---|
| Steam wishlists | Steam Market | No public API. Steam provides wishlists only to developers via Steamworks partner API. Cannot access. |
| SteamDB historical data | Steam Market | No API. Web scraping violates ToS. All data derivable from Steam's own endpoints (CCU, reviews). |
| YouTube Shorts detection | Content/Social | No reliable API field to distinguish Shorts from regular videos. `duration < 60s` is a heuristic but unreliable. Defer. |
| Twitter/X mentions | Content/Social | API pricing ($100/month minimum for search) makes it infeasible for a side project. |
| Discord server size | Horror Genre | No public API for server member counts. Would require bot in every game's Discord. Infeasible. |
| Metacritic score | Horror Genre | Most indie horror games have no Metacritic entry. <5% coverage expected. |
| Steam curator reviews | Steam Market | API exists but curators for indie horror are sparse. Signal would be NULL 90%+ of the time. |

---

## 6. Case Studies — v5 vs. v6 Predictions

The Horror Genre agent analyzed 10 real breakouts. Here's how v6 would change their scores:

| Game | v5 Score | v6 Predicted | Key Difference |
|---|---|---|---|
| **Lethal Company** | ~95 | ~95 | Multiplayer boost offsets merged-component compression. Ceiling effect preserved. |
| **Content Warning** | ~90 | ~88 | Slight decrease: free-to-play dampening in discount component. Still top-tier. |
| **Iron Lung** | ~72 | ~78 | Increase: strong sentiment (+6 from early bonus) + demo conversion signal |
| **Buckshot Roulette** | ~80 | ~85 | Increase: massive YouTube engagement + Reddit buzz now scored |
| **Phasmophobia** | ~88 | ~90 | Multiplayer boost + Twitch streamer breadth properly weighted |
| **Amanda the Adventurer** | ~65 | ~70 | YouTube engagement (likes/comments) now counted, not just views |
| **Slow-burn psychological** | ~35 | ~42 | Sentiment early bonus + community buzz captures word-of-mouth growth |
| **October launch (avg)** | ~55 | ~48 | Discount dampening + rolling baselines reduce seasonal inflation |

---

## 7. Implementation Roadmap

### Phase 0 — Bug Fixes (before any v6 work)

| Task | File | Effort |
|---|---|---|
| Fix autotune missing `sentiment`/`twitch` in `current_weights` | `backend/collectors/ops_autotune.py` | 10 min |
| Add `original_price_usd` parsing to metadata collector | `backend/collectors/metadata.py` | 30 min |
| Add multiplayer tag detection to metadata collector | `backend/collectors/metadata.py` | 30 min |
| Schema migration: `games.original_price_usd`, `games.is_multiplayer` | `backend/database.py` | 15 min |
| Backfill `is_multiplayer` and `original_price_usd` for existing games | One-time script | 30 min |

### Phase 1 — OPS v6.0 Core (3-4 hours)

| Task | File | Effort |
|---|---|---|
| Implement merged Review Momentum component | `backend/collectors/ops.py` | 45 min |
| Implement enhanced YouTube Signal component | `backend/collectors/ops.py` | 45 min |
| Implement merged Live Engagement component | `backend/collectors/ops.py` | 30 min |
| Implement Community Buzz (Reddit) component | `backend/collectors/ops.py` | 45 min |
| Implement Demo Conversion component | `backend/collectors/ops.py` | 30 min |
| Implement Discount-Adjusted Demand component | `backend/collectors/ops.py` | 30 min |
| Implement time-aware coverage penalty | `backend/collectors/ops.py` | 20 min |
| Implement calibration constant calculation | `backend/collectors/ops.py` | 20 min |
| Implement multiplayer modifier | `backend/collectors/ops.py` | 15 min |
| Update `ops_autotune.py` for v6 components | `backend/collectors/ops_autotune.py` | 30 min |
| Update `config.py` with v6 weights | `backend/config.py` | 10 min |
| Baseline dump + v5 vs v6 comparison script | `backend/collectors/ops_backfill.py` | 30 min |

### Phase 2 — Backtesting & Validation (1-2 hours)

| Task | Description |
|---|---|
| Dump all current v5 scores to CSV | Baseline reference |
| Run v6 against full dataset | Generate v6 scores without overwriting v5 |
| Flag games with +/-15 point delta | Manual review of each flagged game |
| Verify multiplayer boost applied correctly | Check Lethal Company, Phasmophobia, Content Warning |
| Verify discount dampening works | Check games currently on sale |
| Verify Reddit component coverage | Confirm >30% of games have Reddit data |
| Verify Demo Conversion coverage | Confirm component activates for games with demos |

### Phase 3 — Frontend Updates (1 hour)

| Task | File |
|---|---|
| Update OPS tooltip with v6 component names | `GameTable.tsx` |
| Add multiplayer indicator to GameRow/GameCard | `GameRow.tsx`, `GameCard.tsx` |
| Update ConceptA OPS anatomy section | `ConceptA.tsx` |
| Add v6 component breakdown to game detail | `ConceptA.tsx` |

### Phase 4 — v6.1 Enhancements (future)

- Z-score normalization (when 150+ games per signal)
- YouTube comment sentiment scoring
- Twitch clips signal
- Subgenre-specific weight profiles
- Achievement completion as retention proxy
- Developer track record modifier
- Patch responsiveness signal

---

## 8. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| v6 scores diverge wildly from v5 | Medium | High | Backtesting protocol (Phase 2) with manual review |
| Reddit data too sparse for meaningful signal | Medium | Low | Time-aware coverage penalty makes it neutral when missing |
| Multiplayer boost creates unfair advantage | Low | Medium | 12% boost is conservative; monitor in autotune diagnostics |
| Calibration constant unstable with small dataset | Medium | Medium | Weekly recalculation + floor/ceiling bounds (min 15, max 35) |
| Discount detection fails (no original_price) | Low | Low | Fallback: dampening_factor = 1.0 if original_price unavailable |

---

## 9. Agent Scorecard

| Agent | Key Contribution | Strongest Argument | Weakest Argument |
|---|---|---|---|
| **Steam Market** | Discount dampening, demo conversion, multiplayer detection | Price-driven velocity is a distinct signal from organic demand | Wanted wishlists (no API exists) |
| **Content/Social** | YouTube sub-signal decomposition, Reddit integration | 99.8% unused YouTube quota = massive untapped signal richness | Wanted 8-9 components (too many, collinearity risk) |
| **Horror Genre** | Multiplayer as structural predictor, October normalization, case studies | Every >$100M horror hit had multiplayer — undeniable pattern | Subgenre weight profiles (classifier not reliable enough yet) |
| **Scoring Methodology** | Collinearity diagnosis, z-score proposal, x24 critique | 3/7 components measuring reviews = 63% effective weight on one stream | Z-scores need 150+ games per signal (don't have yet) |
