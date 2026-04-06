# Horror Radar -- Product Strategy

**Author**: Product Strategist Agent
**Date**: 2026-04-05
**Status**: Proposal for consensus review

---

## 1. Problem Definition

The core question: **"Where do I find good horror games before everyone else does?"**

This question is asked by three distinct audiences with overlapping but different pain points.

### 1a. Horror Gamers

**Current workflow**: Browse Steam's "New & Trending" in Horror tag. Watch favorite YouTubers. Scroll r/HorrorGaming. Ask friends.

**Pain points**:
- **Signal-to-noise**: Steam releases ~15-25 horror-tagged games per month. Most are asset flips or joke games. There is no quality filter besides user reviews, which take weeks to accumulate.
- **Discovery lag**: By the time a game appears on Steam's "Popular New Releases," the first-week window is over. Gamers who want to be early adopters -- playing before the hype wave -- have no tool for that.
- **Genre granularity**: "Horror" is too broad. A player who loves psychological horror does not want zombie shooters. Steam's sub-tags help but are user-applied and unreliable for new releases (low vote counts).
- **Demo blindness**: Many indie horror games release demos during Next Fest or before launch. There is no centralized place to track which demos are generating buzz.

### 1b. Content Creators (YouTube / Twitch)

**Current workflow**: Check Steam upcoming releases. Watch what other creators are playing. Get pitched by developers via email/Discord. Browse itch.io. Rely on gut feel.

**Pain points**:
- **Content calendar anxiety**: Creators need 2-4 games per week to maintain upload schedules. Finding games that are (a) new enough to ride the algorithm, (b) good enough to make entertaining content, and (c) not already saturated by bigger creators is genuinely hard.
- **Timing**: Playing a game too early (no audience searching for it) or too late (audience already watched 10 playthroughs) kills views. The optimal window is narrow.
- **Competitive intelligence**: Creators want to know what other creators in their niche are covering. Not to copy, but to find gaps. Currently this requires manually checking 5-10 channels.
- **No "games to cover" shortlist**: Nothing aggregates the signals that matter to a creator: review velocity (is the audience growing?), YouTube saturation (am I late?), sentiment (will it make good content?), and length (can I cover it in one session?).

### 1c. Horror Game Developers

**Current workflow**: Check SteamDB for their own game. Watch YouTube for coverage. Monitor reviews manually. Compare against competitors by gut feel.

**Pain points**:
- **No market intelligence for their niche**: General tools (SteamDB, VGInsights) cover all of Steam. There is no indie horror-specific benchmark. A developer cannot easily answer "how is my game performing relative to other indie horror games released this quarter?"
- **Creator outreach is blind**: Developers want YouTubers to cover their game but do not know which creators cover indie horror, what their audience size is, or what kinds of games they gravitate toward.
- **Launch timing**: Releasing the same week as a high-profile horror game is death. There is no calendar view of upcoming horror releases with predicted impact.

---

## 2. Competitive Landscape

| Tool | What It Does | Gap Horror Radar Fills |
|---|---|---|
| **SteamDB** | Tracks all Steam games: player counts, price history, update frequency. Powerful but general-purpose. | No horror focus, no scoring, no creator data, no editorial layer. Raw data, not intelligence. |
| **HowLongToBeat** | Game length estimates via user submissions. | Not a discovery tool. No recency, no performance signals. |
| **IsThereAnyDeal** | Price tracking and wishlisting across stores. | Deal-focused, not discovery-focused. Useful after you know what you want. |
| **VGInsights** | Steam market analytics (estimates: revenue, copies sold, wishlists). $15-50/mo. | General-purpose. No genre deep-dive, no creator data, no breakout detection. |
| **SteamSpy** | Free aggregate stats (owners, playtime, tags). | Notoriously inaccurate since 2018 privacy changes. Lags 30-90 days. No scoring. |
| **Twitch/SullyGnome** | Twitch viewership analytics. | Twitch-only. No cross-platform signal aggregation. |
| **YouTube Trending** | Algorithmic surfacing of popular videos. | Not game-specific. Cannot filter for horror indie. |
| **r/HorrorGaming** | Community-driven discussion. | Manual, high-noise, no structured data. |

**Horror Radar's structural advantage**: It is the only tool that (1) focuses exclusively on indie horror, (2) cross-references Steam + YouTube + Twitch + Reddit signals into a single score, and (3) identifies breakouts during the critical first 90 days. The OPS score is genuinely novel -- no competitor does multi-signal overperformance detection for a specific genre.

**The real gap**: Nobody is building "Bloomberg Terminal for indie horror." The niche is small enough that general platforms ignore it, but large enough (horror is consistently a top-5 Steam genre by new releases) that a focused tool has a real audience.

---

## 3. User Personas

### Persona 1: "The Scout" -- Horror Gaming Enthusiast

**Profile**: Age 20-35, plays 3-5 horror games/month, follows 2-3 horror YouTubers, has a Steam library of 200+ games. Active on r/HorrorGaming.

**Behavior**: Visits weekly. Scans the database sorted by OPS to find what is breaking out. Clicks into the game detail page for anything scoring above 40. Uses the watchlist to track games they are interested in but have not purchased yet.

**What makes them return**: A reliable weekly signal -- "here are the 2-3 games worth your attention this week." The Radar Pick page is exactly this, but it needs to expand to a top-5 list, not just a single pick.

**Key metric**: Weekly active users, watchlist additions per session.

### Persona 2: "The Creator" -- Mid-Tier Horror YouTuber (50K-500K subs)

**Profile**: Uploads 3-5 videos/week. Horror is their primary or secondary niche. Spends 2-3 hours/week scouting for games. Has a backlog spreadsheet.

**Behavior**: Visits 2-3 times per week. Needs to answer: "What should I play this week that will get views?" Filters by days-since-launch (sweet spot: 3-14 days), checks YouTube saturation (which creators have already covered it), and checks review velocity (is interest growing or dying?).

**What makes them return**: A "Creator Brief" -- a personalized, actionable list of 5-7 games optimized for their content calendar. Push notifications or email alerts when a game enters the breakout window.

**Key metric**: Games discovered via Horror Radar that the creator actually covers (trackable via YouTube scanner matching).

### Persona 3: "The Dev" -- Solo/Small Team Horror Developer

**Profile**: Making their first or second horror game. Budget under $50K. Relies on organic discovery and creator coverage for sales. Knows Steam's tools but wants competitive context.

**Behavior**: Visits when preparing for launch or tracking post-launch performance. Wants to benchmark against peers: "My game has 45 reviews in 10 days -- is that good for a $10 psychological horror game?" Wants to know which creators cover games similar to theirs.

**What makes them return**: Competitive benchmarking ("your game is in the 72nd percentile for indie horror releases this quarter") and a creator directory with coverage patterns.

**Key metric**: Developer accounts created, return visits during the 90-day launch window.

### Persona 4: "The Curator" -- Steam Curator / Newsletter Author

**Profile**: Runs a horror-focused Steam Curator page or writes a newsletter (Substack, etc.) about indie games. Needs a steady pipeline of interesting games to recommend.

**Behavior**: Visits weekly. Uses the Trends page to identify patterns ("psychological horror is surging this month") and the database to find specific games to feature. Needs exportable data -- game name, store link, key stats -- for their own content.

**What makes them return**: Embeddable widgets, shareable game cards, and an API for pulling data into their own tools.

**Key metric**: External embeds and API usage, curator follows.

---

## 4. Feature Prioritization

### CORE (Must-Have to Be Useful)

These either exist today or are close. The product is not shippable as a "real" web app without them.

| Feature | Status | Notes |
|---|---|---|
| **Game database with OPS scoring** | DONE | Current Database.tsx. Works well. |
| **Game detail / autopsy page** | DONE | ConceptA.tsx. Timeline charts, OPS components, YouTube coverage. |
| **Radar Pick (top breakout)** | DONE | SignalFire.tsx. Needs expansion to top-5. |
| **Trends dashboard** | DONE | Subgenre breakdown, surgers, market pulse. |
| **Watchlist** | DONE | Client-side (localStorage). Must move to server-side for cross-device. |
| **Compare** | DONE | Side-by-side radar charts for up to 3 games. |
| **Search + filters** | DONE | Text search, days slider, price slider, sort modes, game mode. |
| **User accounts** | NOT STARTED | Required for server-side watchlists, alerts, and personalization. Can start with simple email/password or "magic link" auth. No OAuth complexity needed at launch. |
| **Weekly digest email** | NOT STARTED | Automated email: top 3 breakouts, notable movers, new releases. The `weekly_analysis.py` already generates markdown -- pipe it to an email template. This is the single highest-ROI feature not yet built. |
| **Mobile responsiveness** | PARTIAL | FilterBar has mobile layout. GameTable and detail pages need work. Mobile is critical: creators browse on phones between recordings. |

### GROWTH (Drives Retention and Sharing)

| Feature | Priority | Description |
|---|---|---|
| **Creator Brief page** | HIGH | A dedicated view for content creators: games in the 3-14 day sweet spot, sorted by "content potential" (high reviews + low YouTube saturation + growing velocity). Shows which creators have already covered each game. Filterable by game length, multiplayer, has-demo. |
| **Push/email alerts** | HIGH | "Alert me when a new game enters OPS > 50" or "Alert me when a game I watchlisted gets creator coverage." Requires user accounts. |
| **Shareable game cards** | HIGH | OG-image-style cards (title, OPS score, key stats, Horror Radar branding) generated server-side. When a user shares a game link on Discord/Twitter, the card auto-renders. Costs almost nothing to implement (use `pillow` or a headless browser). |
| **Top 5 Weekly Picks** | MEDIUM | Expand Radar Pick from 1 game to a ranked list of 5. Each with a one-line editorial verdict. This becomes the "homepage" for returning visitors. |
| **Creator Directory** | MEDIUM | Public page listing all tracked YouTube channels with: sub count, average views on horror content, games covered in the last 30 days, content style tags (full playthrough, highlights, reviews). Developers use this to find creators to pitch. |
| **Subgenre deep-dives** | MEDIUM | Click into "Psychological Horror" from the Trends page and get a filtered database + subgenre-specific trends. The `subgenre` column on games already exists. |
| **Embeddable widgets** | MEDIUM | `<iframe>` or `<script>` snippets that curators and bloggers can embed: "Horror Radar Top 5 This Week", individual game stat cards, OPS badge. Free distribution channel. |
| **Game comparison sharing** | LOW | Share a comparison URL (`/compare?ids=123,456,789`) that renders as a social card. Good for "which should I play?" debates. |
| **Community ratings/tags** | LOW | Let users add tags ("good for streaming", "1-hour playtime", "jump scare heavy") that Horror Radar's classifier does not capture. Risky -- moderation overhead. Defer until there is a community to moderate. |

### MONETIZATION (Sustainable Revenue Without Being Sleazy)

The audience is niche. The play is not "millions of users at $0" but "thousands of passionate users at a low price point plus B2B."

| Revenue Stream | Model | Notes |
|---|---|---|
| **Free tier** | Always free | Full game database, OPS scores, Radar Picks, Trends. This must remain free or the product is dead. |
| **Pro tier ($5-8/mo)** | Subscription | Unlocks: email alerts (up to 10), Creator Brief, API access (100 calls/day), advanced filters (subgenre, multiplayer, demo status), export to CSV, historical OPS data (beyond 90 days). Price point: low enough that a creator can expense it as a business cost. |
| **Developer Dashboard ($15-25/mo)** | Subscription | For horror game developers: real-time benchmarking of their game vs. peers, creator coverage alerts ("IGP just uploaded a video about your game"), suggested creators to pitch (sorted by audience overlap), launch window analysis ("avoid the week of X release"). |
| **Affiliate links** | Commission | Link to Steam store pages with affiliate tags. Steam does not have an affiliate program, but Humble Bundle, Fanatical, and Green Man Gaming do. Small but compounding revenue. |
| **Sponsored Radar Picks** | Flat fee | Developers pay to be featured as a "Sponsored Pick" alongside the organic Radar Pick. Clearly labeled. Must meet a minimum quality bar (reviews > 0, not an asset flip). $50-100/placement. Low volume, high margin. |
| **Data licensing** | Custom | If the OPS score and cross-platform signals prove valuable, license the data to game publishers, analytics firms, or press outlets. Long-term play. |

**What NOT to do**: Paywalling the core database, selling user data, plastering display ads, charging for basic features that competitors offer free. Horror gaming is a community that viscerally rejects corporate extraction.

---

## 5. Content Creator Focus

Creators are the kingmakers in indie horror. When IGP or Markiplier plays a game, it sells tens of thousands of copies. Mid-tier creators (50K-500K subs) are the sweet spot for Horror Radar -- they are sophisticated enough to need tools but not so large that they have dedicated staff doing research for them.

### Specific Features for Creators

**5a. "Games to Cover This Week" (Creator Brief)**

A curated, algorithmically generated list updated every Monday and Thursday. For each game:
- Title, store link, price, has-demo flag
- OPS score + trajectory (rising/stable/falling)
- YouTube saturation: how many tracked creators have covered it, total views on horror content for this game
- Content potential score: composite of (review velocity * sentiment * inverse-YouTube-saturation)
- Estimated playtime (from HowLongToBeat API if feasible, or from achievement completion rates as proxy)
- One-line hook: "Psychological horror in a Soviet apartment -- 92% positive, zero creator coverage"

**5b. Coverage Gap Alerts**

"This game has 200 reviews, 95% positive, and only 1 creator with under 10K subs has covered it." Push this to creators who have opted in. This is the highest-signal alert possible: proven audience demand, zero saturation.

**5c. Creator Competitive View**

For a given game, show: which creators covered it, when, how many views their video got, and what the game's OPS was at the time of coverage. This lets creators reverse-engineer timing: "IGP covered this on day 5 and got 400K views; the game's OPS was 72 at the time."

**5d. Embargo / Release Calendar**

A calendar view of upcoming horror releases (from Steam's "coming soon" data). Overlaid with Next Fest dates and major horror releases. Creators use this to plan their recording schedule 1-2 weeks ahead.

**5e. "My Coverage" Dashboard (Requires YouTube OAuth)**

A creator links their YouTube channel. Horror Radar shows: which tracked games they have covered, their view performance relative to other creators covering the same game, and gaps in their coverage vs. trending games. This is the stickiest possible feature -- it turns Horror Radar into the creator's personal analytics dashboard for their horror content.

---

## 6. Community and Virality

### 6a. Weekly Newsletter

The `weekly_analysis.py` already generates a markdown report. Convert this into an email newsletter:
- Subject line: "Horror Radar Weekly: [Top Pick Title] + [N] breakouts this week"
- Top 3 Radar Picks with OPS scores and one-line verdicts
- "Under the Radar" section: games with high quality signals but zero creator coverage
- "Creator Watch": which YouTubers covered what this week
- Market pulse: total new releases, average sentiment, trending subgenres

Distribute via Substack or Buttondown (free tier handles thousands of subscribers). This is the single most important growth channel: people share newsletters.

### 6b. Social Cards (OG Images)

When someone shares `horror-radar.com/game/12345` on Twitter/Discord, the preview card should show:
- Game header image
- OPS score badge
- Key stats (reviews, sentiment, days out)
- Horror Radar branding

Implementation: Server-side image generation via `satori` (Vercel's OG image library) or a simple `pillow` script behind a `/og/:appid` endpoint. This turns every game share into free advertising.

### 6c. Discord Bot

A lightweight bot for horror gaming Discord servers:
- `/horror-radar top` -- top 5 breakouts this week
- `/horror-radar game [title]` -- quick stats for a specific game
- `/horror-radar alert [OPS threshold]` -- ping when a game crosses the threshold

Discord is where the horror gaming community lives. A bot puts Horror Radar in front of users without requiring them to visit the site.

### 6d. Embeddable "OPS Badge"

Like a "Rotten Tomatoes score" but for indie horror overperformance. Developers can embed an OPS badge on their Steam page description, press kit, or website. Each badge links back to Horror Radar. Free distribution, high credibility signal.

### 6e. "Horror Radar Verified" for Creators

Tracked creators (the 10 seed channels + any who opt in) get a badge on their YouTube channel page in Horror Radar. This creates social incentive: creators want to be "on" Horror Radar's tracked list, which means they are engaging with the platform. Expand tracking beyond the initial 10 seed channels by letting creators self-register.

---

## 7. Key Risks

### Risk 1: Single-Person Dependency

The entire platform is built and operated by one person. If Aloysius loses interest, burns out, or gets a demanding day job, the platform dies. The scheduler stops, data goes stale, and the site becomes a ghost.

**Mitigation**: Automate everything possible. The scheduler already runs unattended. Add uptime monitoring (UptimeRobot, free tier) with alerts. Write the newsletter generation as a fully automated pipeline that requires zero manual intervention. Make the product valuable even if it is only maintained 2-3 hours per week.

### Risk 2: API Dependency and Rate Limits

The platform depends on Steam, YouTube, Twitch, and Reddit APIs. Any of these could:
- Raise rate limits (YouTube is already tight with 403 handling)
- Deprecate endpoints (Steam's store API is undocumented and has broken before)
- Require paid access (Reddit's API pricing changes in 2023 set a precedent)

**Mitigation**: The data architecture already handles this gracefully via NULL-weight redistribution in OPS. If YouTube dies, the other 4 components absorb its weight. Continue building resilience into the scoring system. Cache aggressively. Consider SteamDB as a secondary data source.

### Risk 3: Audience Too Small to Monetize

Indie horror gaming is a niche within a niche. The total addressable audience for a tool like this might be 5,000-20,000 people globally. At $5/mo with 2% conversion, that is $500-2,000/mo -- possibly not worth the infrastructure costs.

**Mitigation**: Keep infrastructure costs near zero. SQLite + single VPS + Vercel free tier is already correct. Do not over-invest in infrastructure until revenue justifies it. The newsletter and social cards cost nothing and grow the audience organically. If monetization fails, the product is still a compelling portfolio piece and a genuine contribution to the horror gaming community.

### Risk 4: Data Quality Erodes Trust

If the OPS score surfaces bad games (asset flips that gamed reviews, joke games that went viral for the wrong reasons), users lose trust in the system. One bad Radar Pick could undermine credibility.

**Mitigation**: The 5-layer horror classifier is already strong. Add a manual override mechanism: a simple admin flag to suppress games from Radar Pick and Top 5 lists. Consider adding a "community report" button where users can flag games as miscategorized. The OPS auto-tune diagnostics should be reviewed weekly.

### Risk 5: A Competitor Enters

SteamDB adds a horror filter. A well-funded startup builds "GameRadar" for all genres. A creator with a large audience builds their own version.

**Mitigation**: Move fast on the creator-specific features. The moat is not the data (anyone can query Steam's API) but the cross-platform signal aggregation, the editorial layer, and the community trust. Be the "Pitchfork for horror games" -- the brand that horror gamers trust for taste and curation. Brand moats are harder to replicate than technical moats.

### Risk 6: Legal / ToS Violations

Scraping Steam store pages, using undocumented APIs, and tracking YouTube channels could violate Terms of Service if done aggressively.

**Mitigation**: Rate limiters are already in place. Use only public data. Do not scrape anything behind authentication. Attribute data sources. If a platform sends a cease-and-desist, comply immediately and find an alternative data source.

---

## 8. Recommended Execution Order

If I had to pick the next 5 things to build, in order:

1. **Weekly newsletter** (automated from existing `weekly_analysis.py`). Highest ROI, lowest effort. Grows audience while you sleep.
2. **Social cards / OG images** for game pages. Every share becomes free marketing.
3. **Top 5 Weekly Picks** (expand Radar Pick). Gives returning users a reason to come back every Monday.
4. **Creator Brief page**. The killer feature for the highest-value persona. Even a static version (manually curated) proves the concept.
5. **User accounts + server-side watchlist**. Unlocks alerts, personalization, and eventually monetization.

Everything else -- Discord bot, embeddable widgets, developer dashboard, Pro tier -- comes after these 5 are proven.

---

## 9. One-Sentence Vision

Horror Radar is the intelligence platform that tells horror gamers what to play, content creators what to cover, and developers how they stack up -- before anyone else knows.
