# Horror Radar: Multi-Agent Consensus Debate & Implementation Plan

**Generated**: 2026-04-05
**Method**: 4-agent stochastic consensus (Product Strategist, Data Pipeline Architect, Frontend Designer, Platform Engineer)

---

## 1. DEBATE: Where Agents Agree

Universal agreement across all four agents:

1. **OPS is the core differentiator.** No competing tool does genre-specific cross-platform breakout scoring. Every agent treats it as the defensible moat.

2. **Solo-developer risk is the top existential threat.** Bus factor = 1. Automate everything, minimize manual intervention, build resilience into the system.

3. **Creators (YouTubers) are the highest-leverage audience.** They drive the discovery ecosystem. A Creator Hub is the killer feature.

4. **SQLite is fine for now.** Migrate to PostgreSQL at 500+ concurrent users or multi-worker needs. Not today.

5. **The frontend needs a curated entry point, not a raw table.** The landing experience should be editorial, not spreadsheet.

6. **Data quality has no safety net.** No validation on ingest, no anomaly detection, no backups. One silent failure away from serving garbage.

7. **Weekly newsletter is high-value, low-complexity.** All agents agree it's the highest-ROI growth feature.

8. **Current infrastructure costs are excellent.** $5-10/month with headroom to $30-40 at 10K users.

---

## 2. DEBATE: Where Agents Disagree

### 2A. OPS Formula: v6 Overhaul vs. Fix-What's-Broken

| Position | Agent | Argument |
|---|---|---|
| Add Reddit Buzz + Demo Conversion components | Pipeline | New signals improve breakout detection |
| Fix bugs first, defer v6 | Platform | Two live bugs exist (autotune, radar stale weights). No test harness. |

**Verdict: Fix bugs first, defer v6.**
Rationale: Pipeline found real bugs in `ops_autotune.py` (missing sentiment/twitch in `current_weights`) and `radar.py` (stale v4 weights). Adding components on a buggy foundation compounds risk. Reddit Buzz at 0.03 weight won't move scores meaningfully. The CLAUDE.md Lessons Learned warns against changing scoring logic without a test harness.

### 2B. Homepage: Curated Landing vs. Database-First

| Position | Agent | Argument |
|---|---|---|
| Full redesign with route restructure (/ = landing, /discover = table) | Frontend | Raw table is hostile to new visitors |
| Expand Radar Pick to Top 5, keep table as home | Product | Lower effort, still editorial |

**Verdict: Hero section above existing table (compromise).**
Rationale: Three view modes + route restructure is weeks of work. A "This Week's Top 5" section above the existing table captures 80% of the value at 10% of the effort.

### 2C. API/Scheduler Split

| Position | Agent | Argument |
|---|---|---|
| Split now, Docker Compose | Platform | Most impactful structural change |
| Defer until traffic justifies | Product (implicit) | Operational complexity for one user |

**Verdict: Defer. Harden scheduler instead.**
Rationale: Adding `misfire_grace_time` to all jobs + backups addresses the real risks. Docker adds complexity for a VPS running fine with systemd.

### 2D. Accessibility Fixes

| Position | Agent | Argument |
|---|---|---|
| WCAG compliance is P1 | Frontend | `text-dim` fails AA contrast, specific hex fixes proposed |
| Not mentioned | Product, Pipeline, Platform | — |

**Verdict: Frontend is right. P1 priority.**
Rationale: Fixes are CSS-only, take 1 hour, and preserve the palette mood. A horror site with unreadable text is just broken.

### 2E. Monetization Timing

| Position | Agent | Argument |
|---|---|---|
| Build Pro tier + Dev Dashboard soon | Product | Revenue sustainability |
| Infrastructure is cheap, no urgency | Platform | $5-10/month is fine |

**Verdict: Defer monetization entirely.**
Rationale: Zero external users. Building payment infrastructure before validating demand is premature. Sequence: ship newsletter → grow to 100+ subscribers → survey → build.

### 2F. YouTube Expansion

| Position | Agent | Argument |
|---|---|---|
| Tier 2 auto-discovery from seed channels | Pipeline | Most unique signal, scales automatically |
| Creator Hub implies richer data | Frontend | Coverage gap finder needs more channels |

**Verdict: Pipeline is right. Tier 2 YouTube is P2.**
Rationale: Going from 10 to 30-50 channels dramatically improves coverage at minimal API cost.

### 2G. ConceptA Refactor

| Position | Agent | Argument |
|---|---|---|
| Full Tailwind migration now | Frontend | Massive style fragmentation (inline style={}) |
| Defer | — | It works. No test suite to catch regressions. |

**Verdict: P2. Do it when there's a reason to touch that page.**

---

## 3. CONSENSUS PLAN

### P0 — This Week (~3.5 hours)

| # | Task | Agent | Effort |
|---|---|---|---|
| P0-1 | Fix `ops_autotune.py`: add `sentiment`/`twitch` to `current_weights` | Pipeline | 30 min |
| P0-2 | Fix `radar.py`: update stale v4 component metadata to v5 | Pipeline | 30 min |
| P0-3 | Enable WAL mode: `PRAGMA journal_mode=WAL` in `database.py` | Platform | 15 min |
| P0-4 | Add `misfire_grace_time=3600` to ALL scheduler jobs | Platform | 30 min |
| P0-5 | Daily SQLite backup script via `.backup` command on VPS | Platform | 1 hr |
| P0-6 | Add composite indexes on `game_snapshots` and `ops_scores` | Pipeline | 30 min |

### P1 — Next 2 Weeks (~20 hours)

| # | Task | Agent | Effort |
|---|---|---|---|
| P1-1 | Fix WCAG contrast: `text-dim` #6b6058 → #8a7a6e, add `primary-text` token | Frontend | 1 hr |
| P1-2 | Top 5 hero section on homepage (above existing table) | Product+Frontend | 4-6 hrs |
| P1-3 | OG social share cards (meta tags for Twitter/Discord) | Product+Frontend | 2-3 hrs |
| P1-4 | Weekly newsletter MVP via Buttondown free tier | Product | 4-6 hrs |
| P1-5 | Wire existing Skeleton components into GameTable loading state | Frontend | 1 hr |
| P1-6 | Data freshness warning banner (amber >26h, red >48h) | Pipeline+Frontend | 2 hrs |
| P1-7 | Security: rate limiting (slowapi), tighten CORS, hide VPS IP | Platform | 2-3 hrs |

### P2 — Next Month (~30 hours)

| # | Task | Agent | Effort |
|---|---|---|---|
| P2-1 | Tier 2 YouTube channel discovery (weekly auto-expand from seeds) | Pipeline | 6-8 hrs |
| P2-2 | Classifier test harness (`tests/test_classifier.py`, 20+ edge cases) | Pipeline | 3-4 hrs |
| P2-3 | ConceptA: migrate inline styles to Tailwind | Frontend | 3-4 hrs |
| P2-4 | Data ingest validation layer + `data_anomalies` table | Pipeline | 4-6 hrs |
| P2-5 | Mobile responsive pass (Database + Game Detail + bottom tab bar) | Frontend | 4-6 hrs |
| P2-6 | Radar Pick expansion: top 3-5 games instead of just #1 | Product+Frontend | 3-4 hrs |
| P2-7 | Off-site backup: push daily DB to Backblaze B2 free tier | Platform | 2 hrs |

### P3 — Backlog

| # | Task | Agent | Effort |
|---|---|---|---|
| P3-1 | OPS v6 with Reddit Buzz + Demo Conversion components | Pipeline | 8-10 hrs |
| P3-2 | Creator Hub page (/creators) with coverage gap finder | Frontend+Product | 10-15 hrs |
| P3-3 | Card Grid view mode for Database | Frontend | 6-8 hrs |
| P3-4 | API/Scheduler process split (Docker or separate systemd) | Platform | 8-12 hrs |
| P3-5 | Steam Curator tracking collector | Pipeline | 8-10 hrs |
| P3-6 | User accounts + server-side watchlist | Product+Platform | 20-30 hrs |
| P3-7 | Predictive breakout ML model (needs 200+ games) | Pipeline | 15-20 hrs |
| P3-8 | PostgreSQL migration | Platform | 10-15 hrs |
| P3-9 | Monetization: Pro tier + Developer Dashboard | Product | 30-40 hrs |

---

## 4. KEY ARCHITECTURAL DECISIONS

| Decision | Options | Recommendation | Rationale |
|---|---|---|---|
| Database engine | SQLite / PostgreSQL now / PostgreSQL later | **Stay SQLite** | All agents agree. WAL fixes the biggest limitation. Revisit at 500+ concurrent. |
| Deployment | Monolith / API+Scheduler split / Docker | **Monolith + hardened scheduler** | Split is correct long-term but premature. misfire_grace_time + backups addresses real risks. |
| Homepage | Table-first / Full landing / Hero+table | **Hero section above table** | 80% of value at 10% of effort. No route changes needed. |
| Newsletter | Custom / Buttondown free / RSS | **Buttondown free** | Free to 100 subs, markdown input, no auth system needed. |
| User accounts | Build now / Build with monetization / Never | **Build when monetization validated** | Most expensive feature. Zero demand evidence exists. |
| YouTube expansion | 10 seeds / Tier 2 auto-discovery / Manual 30+ | **Tier 2 auto-discovery** | Scales without manual effort. Most unique signal. |
| OPS changes | Fix bugs / v6 components / Full rebalance | **Fix bugs only** | No test harness. Two live bugs. Per Lessons Learned. |
| Mobile | Ignore / Responsive CSS / Native app | **Responsive CSS pass** | Creators share links on mobile. CSS-only fix. |
| Monitoring | Manual / Freshness banner / Full stack | **Freshness banner + anomaly table** | Makes failures visible to user and developer. No PagerDuty overkill. |
| Backups | None / Local daily / Local+offsite | **Local daily + offsite weekly** | SQLite is one file. Losing it = months of irreplaceable data gone. $0 with B2. |

---

## 5. AGENT SCORECARD

| Agent | Best Contribution | Biggest Miss |
|---|---|---|
| **Product** | Creator-first strategy; newsletter as #1 feature | Premature monetization push |
| **Pipeline** | Found two live bugs (autotune, radar); Tier 2 YouTube | v6 timing (too early without test harness) |
| **Frontend** | Accessibility audit with specific fixes; skeleton wiring | ConceptA refactor priority (works fine as-is) |
| **Platform** | Backup gap identification; WAL mode not enabled | Docker split timing (premature for current scale) |

---

## HTML Mockups

Three interactive mockups produced by the Frontend Designer agent:

1. **Homepage**: `frontend/public/mockup-homepage.html`
   - Curated landing with hero, trending carousel, fresh drops, market pulse

2. **Game Detail (Autopsy)**: `frontend/mockups/game-detail-autopsy.html`
   - Story-driven layout: hero → vitals → narrative → chart → signals → OPS anatomy → similar games

3. **Creator Hub**: `frontend/public/creator-hub-mockup.html`
   - Coverage gap finder, games to cover, channel leaderboard, embeddable cards, weekly digest

All mockups are self-contained HTML files viewable in any browser. They use the Occult Amber palette, all three fonts, and include responsive breakpoints.

---

## 6. Color Palette: Multi-Agent Consensus

### Dark Mode — "Candlelit Archive"
**Mood**: Focused, warm, intimate. A researcher's desk at night — candlelight on parchment, dried-blood annotations, brass instruments.
**References**: True Detective S1 evidence wall, Darkest Dungeon journal UI, restricted library at closing time.

| Token | Hex | Usage |
|---|---|---|
| `bg-base` | `#111314` | Page background |
| `bg-surface` | `#1a1b1d` | Cards, panels |
| `bg-elevated` | `#242527` | Modals, dropdowns, hover |
| `bg-sunken` | `#0c0d0e` | Inset areas, code blocks |
| `text-main` | `#e8e0d6` | Primary body text (13.2:1) |
| `text-mid` | `#b5a595` | Secondary text (7.8:1) |
| `text-dim` | `#998c7e` | Tertiary text (5.7:1) |
| `text-disabled` | `#5c554d` | Inactive text (2.8:1, large only) |
| `primary` | `#802626` | Filled buttons, badges, brand surfaces |
| `primary-text` | `#d45555` | Red text on dark backgrounds (5.1:1) |
| `primary-hover` | `#933030` | Button hover |
| `on-primary` | `#ffffff` | Text on primary surfaces |
| `accent-gold` | `#d4a574` | Links, secondary actions (7.0:1) |
| `accent-gold-hover` | `#e0b888` | Link hover (8.5:1) |
| `accent-teal` | `#5a9e8f` | Tertiary accent (5.2:1) |
| `status-pos` | `#2faa6e` | Positive (CVD-safe teal-green, 7.2:1) |
| `status-warn` | `#e8a832` | Caution (8.0:1) |
| `status-neg` | `#e25535` | Negative (4.8:1) |
| `status-info` | `#5b9fd4` | Informational (5.7:1) |
| `status-special` | `#b07db2` | Notable (4.6:1) |
| `border-structural` | `#4a4541` | Table rows, card edges |
| `border-decorative` | `#332e2a` | Subtle atmospheric lines |
| `border-focus` | `#d4a574` | Focus rings |
| `ops-high` | `#2faa6e` | OPS >= 60 |
| `ops-mid` | `#e8a832` | OPS 30-59 |
| `ops-low` | `#6b635b` | OPS < 30 (grey, not red) |

### Light Mode — "Morning Desk"
**Mood**: Clear-eyed, aged, systematic. The same desk in morning light — ivory paper, faded ink, sun-bleached pages.
**References**: Antiquarian bookshop interior, Victorian naturalist's journal, Zodiac evidence board.

| Token | Hex | Usage |
|---|---|---|
| `bg-base` | `#f5f0eb` | Page background (warm ivory) |
| `bg-surface` | `#ffffff` | Cards, panels |
| `bg-elevated` | `#ebe5de` | Hover states, selected rows |
| `bg-sunken` | `#e5ded6` | Inset areas |
| `text-main` | `#1c1916` | Primary body text (15.0:1) |
| `text-mid` | `#5c534a` | Secondary text (6.6:1) |
| `text-dim` | `#6e655d` | Tertiary text (5.0:1) |
| `text-disabled` | `#a69d94` | Inactive text |
| `primary` | `#802626` | Buttons, links, brand (7.8:1 on bg) |
| `primary-text` | `#802626` | Same as primary in light mode |
| `primary-hover` | `#6b1f1f` | Button/link hover |
| `on-primary` | `#ffffff` | Text on primary surfaces |
| `accent-gold` | `#8a6e3e` | Highlights, accents (4.7:1) |
| `accent-teal` | `#3d7a6e` | Tertiary accent (4.6:1) |
| `status-pos` | `#1a7a28` | Positive (4.8:1) |
| `status-warn` | `#8a6100` | Caution (4.9:1) |
| `status-neg` | `#b3332b` | Negative (4.9:1) |
| `status-info` | `#256598` | Informational (5.0:1) |
| `status-special` | `#7b4d7d` | Notable (5.1:1) |
| `border-structural` | `#c9c0b5` | Table rows, card edges |
| `border-decorative` | `#ddd6cd` | Subtle separators |
| `border-focus` | `#802626` | Focus rings |
| `ops-high` | `#1a7a28` | OPS >= 60 |
| `ops-mid` | `#8a6100` | OPS 30-59 |
| `ops-low` | `#8a8279` | OPS < 30 (grey) |

### Color Debate: Key Decisions

| Decision | Winner | Rationale |
|---|---|---|
| text-dim value | `#998c7e` (WCAG agent) | 5.7:1 headroom vs borderline 4.5:1 |
| Primary as text (dark) | Split: `#802626` surfaces + `#d45555` text | #802626 fails at 1.97:1 on dark bg |
| Light mode background | `#f5f0eb` (warm ivory) | Warmer than white, more neutral than #f0ebe4 |
| Link color (dark mode) | Warm gold `#d4a574` | "Candlelit Archive" signature; red reserved for CTAs |
| Focus ring | Gold in dark, brand red in light | Best contrast per mode |
| Green unification | `#2faa6e` (dark) / `#1a7a28` (light) | Replaces 3 inconsistent greens; CVD-safe teal shift |
| OPS-low color | Grey not red | Low OPS = quiet, not alarming. Most games are low. |
| Border system | Structural + decorative split | Structural visible for UI; decorative atmospheric |
| CVD safety | Adopted teal-green shift for status-pos | Protanopia-safe without conflicting with warn/neg |
| Implementation | CSS `[data-theme]` custom properties | Only approach that handles inline style={} files |

### Implementation Strategy

CSS custom properties on `[data-theme="dark"]` / `[data-theme="light"]`. Toggle stored in `localStorage`. Default: dark. Respects `prefers-color-scheme` on first visit.

Migration: 6 phases across 20 files (13 easy Tailwind-only, 3 medium, 3 hard inline-style, 1 very hard ConceptA at 1400 lines).

### Mockup Files

| File | Description |
|---|---|
| `frontend/public/mockup-homepage.html` | Homepage with dark/light toggle |
| `frontend/mockups/game-detail-autopsy.html` | Game detail with dark/light toggle |
| `frontend/public/creator-hub-mockup.html` | Creator hub with dark/light toggle |
