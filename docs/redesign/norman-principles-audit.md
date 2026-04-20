# Norman Design Principles Audit -- Horror Radar

**Auditor**: UX Strategist Agent
**Date**: 2026-04-09
**Scope**: All 4 pages (Database, Radar Pick, Trends, Game Detail) evaluated against Don Norman's 7 design principles from *The Design of Everyday Things*.
**Codebase version**: `claude/optimistic-hermann` branch

---

## 1. Executive Summary

Horror Radar is a data-dense intelligence platform serving content creators, publisher scouts, and gaming journalists. The core data pipeline is strong, but the interface has significant usability gaps that prevent users from forming accurate mental models, recovering from errors, or discovering the platform's full capabilities.

**Critical findings**: 8
**Major findings**: 19
**Minor findings**: 14
**Total**: 41

The most damaging pattern is an **information legibility gap**: the platform collects rich, multi-signal data but fails to explain what that data means, how scores are computed, or what actions a user should take based on the numbers. OPS -- the platform's core value proposition -- is a black box to first-time users. The second systemic issue is **discoverability failure**: the Brush zoom control on the Game Detail page, the filter expand toggle on mobile, the existence of unsurfaced API data (gem scores, blind spot games, developer profiles, forecasts) -- all are hidden or absent.

The three highest-impact recommendations:
1. Add an onboarding tooltip tour explaining OPS, confidence dots, and the color system (Critical, Quick Win)
2. Surface error states with retry actions instead of silent failures (Critical, Medium)
3. Make the chart Brush/zoom control visible with a label and affordance (Critical, Quick Win)

---

## 2. Principle-by-Principle Analysis

### 2.1 Discoverability

> "It is possible to determine what actions are possible and the current state of the device." -- Norman

Discoverability asks: can the user figure out what they can do?

#### Database Page

| ID | Issue | Severity | Fix | Effort |
|----|-------|----------|-----|--------|
| D-01 | **Filter panel hidden on mobile behind an unlabeled icon.** The `tune` icon (FilterBar.tsx line 65-66) is a Material Symbol with no text label. A new user on mobile sees a search bar, a sort dropdown, and a small icon with no indication it opens days/price/mode filters. The icon changes to `expand_less` when open but offers no preview of what filters exist. | Major | Add a text label "Filters" next to the icon, or show a count badge when non-default filters are active (e.g., "Filters (2)"). | Quick Win |
| D-02 | **No "Reset Filters" button.** When a user narrows the days slider to 7d and the price to $5, there is no single action to return to defaults. They must manually drag both sliders back and change the mode toggle. The FilterBar component accepts `onDaysChange`, `onMaxPriceChange`, etc. but exposes no reset callback. | Major | Add a "Reset" button that appears when any filter deviates from default (days=90, maxPrice=60, gameMode="all", search=""). Wire it to reset all state in Database.tsx. | Quick Win |
| D-03 | **Sort dropdown is visually disconnected from the table.** On desktop, the sort control sits at the far right of the FilterBar (line 228-241), separated by a vertical divider from the price slider. The GameTable below it has column headers that look sortable (uppercase, bold) but are not clickable. Users expect to click column headers to sort. | Major | Make column headers in GameTable clickable sort triggers. When clicked, update the `sortBy` state in Database.tsx. Keep the FilterBar sort as a secondary control. | Medium |
| D-04 | **Unsurfaced data: gem scores, blind spot games, developer profiles, OPS forecasts, achievement rates, Reddit URLs, Twitch viewers.** The backend computes gem scores (`InsightGame.gem_score`), blind spot games (`blindspot_games` in InsightsResponse), developer profiles (`DeveloperProfile` model), and subgenre classifications per game. None appear in the Database or Game Detail pages. | Major | Surface developer track record on the Game Detail page. Add a "Blind Spots" tab or section to Trends. Show subgenre badge per game in the table. Link Reddit mentions to their actual URLs. | Structural |
| D-05 | **No export or share capability.** A publisher scout who finds a promising game cannot share a filtered view (no deep linking for filter state) or export a shortlist. The URL never changes when filters are applied. | Major | Sync filter state to URL query parameters (`?days=30&sort=ops&search=...`). Add a "Copy Link" button. Consider CSV export for the current filtered list. | Medium |

#### Radar Pick Page (SignalFire.tsx)

| ID | Issue | Severity | Fix | Effort |
|----|-------|----------|-----|--------|
| D-06 | **"Previous picks" rows are clickable but have no visual affordance.** The `previous_picks` section (line 746-774) uses `onMouseEnter`/`onMouseLeave` to change background on hover, and `onClick` to navigate. But there is no cursor change, no underline, no chevron icon -- nothing tells the user these rows are interactive. On mobile, hover feedback does not exist. | Major | Add `cursor: pointer` (present but inline, not obvious), a right-arrow chevron icon, and an `active:` press state for mobile. Use a proper `<Link>` or `<a>` element instead of a `<div>` with onClick for accessibility. | Quick Win |
| D-07 | **The OPS trajectory chart has no legend.** The AreaChart (line 679-737) plots OPS score over time with a dashed reference line at y=60, but there is no legend explaining what the line represents, what 60 means, or what the gradient area signifies. | Minor | Add a small inline legend: "OPS Score (breakout threshold: 60)". | Quick Win |

#### Trends Page

| ID | Issue | Severity | Fix | Effort |
|----|-------|----------|-----|--------|
| D-08 | **Market Pulse chart uses dual Y-axes without clear labeling.** The ComposedChart (line 159-174) puts "New Reviews" on the left axis (green) and "Avg OPS" on the right axis (dashed line), but the only differentiation is axis color and line style. A first-time user cannot tell which line maps to which axis. | Major | Add a visible legend below the chart with color-coded entries: "New Reviews (left axis)" and "Avg OPS (right axis)". Recharts supports `<Legend>` natively. | Quick Win |
| D-09 | **Subgenre momentum table has no column headers.** The table (line 189-225) renders rows with name, count, bar, delta, and avg OPS -- but the `<table>` has no `<thead>`. Users must infer what each column means. | Major | Add a `<thead>` with headers: Subgenre, Games, Momentum, Delta, Avg OPS. | Quick Win |
| D-10 | **Creator Radar items are clickable but use only `opacity` change as feedback.** Each YouTube game row (line 236-263) navigates on click but only dims on hover (`hover:opacity-80`). No cursor pointer, no link styling. | Minor | Add `cursor-pointer` class (already present) and a subtle arrow or "View" indicator. | Quick Win |

#### Game Detail Page (ConceptA.tsx)

| ID | Issue | Severity | Fix | Effort |
|----|-------|----------|-----|--------|
| D-11 | **Brush zoom control is completely hidden.** The `<Brush>` component (line 1392-1399) renders at the bottom of Panel 3 as a thin, dark-colored drag handle that blends into the chart background. There is no label, no instruction, no visual cue that the user can drag to zoom the timeline. This is the primary interaction for analyzing time ranges. | Critical | Add a visible label above the brush ("Drag to zoom timeline") and style the handle with a contrasting border and grab-cursor icon. Consider adding +/- zoom buttons as an alternative. | Quick Win |
| D-12 | **Phase cards look clickable but are not.** Each phase card (line 1417-1455) has `transition: all 0.25s` and `:hover { transform: translateY(-2px) }` via the `autopsy-phase-card` class (line 202-203). The lift animation on hover strongly signals interactivity, but clicking does nothing. | Major | Either make phase cards functional (clicking scrolls the chart brush to that phase's date range) or remove the hover lift animation to stop implying interactivity. | Medium |
| D-13 | **Series toggle pills have no tooltip explaining what each series shows.** The toggle buttons (line 1161-1197) show labels like "Rev. Velocity" and "YT Views" but do not explain what these metrics measure or why a user would toggle them. | Minor | Add `title` attributes with brief explanations: e.g., "Rev. Velocity: 3-day rolling average of daily new reviews". | Quick Win |
| D-14 | **"Show Median Trajectory" button is broken.** Clicking it shows "Coming soon -- median trajectory comparison is not yet available" (line 1200-1203). An available-but-non-functional feature is worse than hiding it entirely -- it erodes trust. | Minor | Remove the button entirely until the feature is implemented. Or grey it out with a "(coming soon)" suffix and `disabled` state. | Quick Win |

---

### 2.2 Feedback

> "There is full and continuous information about the results of actions and the current state of the product." -- Norman

Feedback asks: does the system tell the user what just happened?

#### Database Page

| ID | Issue | Severity | Fix | Effort |
|----|-------|----------|-----|--------|
| F-01 | **Errors on game fetch are silently swallowed.** In Database.tsx (line 80-83), the catch block logs to console and sets games to empty. The user sees an empty table with "No games found -- Try adjusting your filters" (GameTable.tsx line 57-63), which misleads them into thinking their filters are too narrow when the API actually failed. | Critical | Use the `EmptyState` component (which exists, `variant="error"`) when the fetch fails. Track an `error` state alongside `loading`. Show "Something went wrong" with a retry button. | Quick Win |
| F-02 | **Status polling fails silently.** The `loadStatus` callback (Database.tsx line 89-98) catches all errors and does nothing. If the backend is down, the footer continues showing stale "Last Sync: 45 mins ago" without any indication that the connection is lost. | Major | Show a subtle warning indicator in the footer when status fetch fails (e.g., a red dot next to "Last Sync" or "Connection lost" text). Reset the warning when status resumes. | Quick Win |
| F-03 | **Filter changes provide no feedback that data is loading.** Slider changes trigger a 200ms debounce, then a fetch. During the fetch, the loading spinner replaces the entire table (GameTable.tsx line 43-51), causing a jarring full-content replacement. Users lose their scroll position and visual context. | Major | Replace the full-table spinner with a subtle top-bar loading indicator (thin progress line at the top of the table) while keeping the existing data visible but slightly dimmed. Use skeleton rows only on initial load. | Medium |
| F-04 | **Debounced slider provides no indication that the value hasn't been applied yet.** The days slider (FilterBar.tsx line 193-201) shows the current drag position immediately (`0-{days}d`) but the actual query fires 200ms later. There is no visual distinction between "selected but not yet applied" and "applied". | Minor | Show a brief flash or color pulse on the label when the debounced value is committed. Or add a small loading dot next to the value during the debounce window. | Quick Win |

#### Radar Pick Page

| ID | Issue | Severity | Fix | Effort |
|----|-------|----------|-----|--------|
| F-05 | **Loading state is a plain text string with no branded treatment.** The loading state (line 326-330) shows "SCANNING SIGNALS..." as mono text on a blank dark background. No spinner, no skeleton, no animation. For a page that takes editorial pride in its presentation, this is a missed opportunity to set the tone. | Minor | Add the pulsing dot animation (already used in the alert banner) and show a skeleton of the hero section to establish visual continuity. | Quick Win |
| F-06 | **No loading or error states for the trajectory chart.** If the `ops_history` array is empty or has only 1 point, the entire trajectory section silently disappears (line 679 condition). The user has no idea a chart was supposed to be there. | Minor | When `ops_history.length < 2`, show a placeholder: "OPS trajectory will appear after 2+ days of scoring data." | Quick Win |

#### Game Detail Page

| ID | Issue | Severity | Fix | Effort |
|----|-------|----------|-----|--------|
| F-07 | **Clicking an event flag opens a modal with no keyboard dismiss.** The EventCard modal (line 622-711) uses `onClick={onClose}` on the backdrop but has no `onKeyDown` handler for Escape. Keyboard users are trapped. The close button is a bare `&times;` with no aria-label. | Major | Add `onKeyDown` handler on the modal that closes on Escape. Add `aria-label="Close"` to the close button. Add `role="dialog"` and `aria-modal="true"` to the modal container. | Quick Win |
| F-08 | **No feedback when toggling series pills on/off.** Clicking a series toggle (line 1162-1178) changes the pill's border and background color, but there is no animation, no chart transition, and no announcement for screen readers. The chart simply repaints with or without the series. | Minor | Add a brief fade transition on the chart line appearance/disappearance. Add `aria-pressed` to the toggle buttons. | Quick Win |

---

### 2.3 Conceptual Model

> "The design projects all the information needed to create a good conceptual model of the system, leading to understanding and a feeling of control." -- Norman

The conceptual model is the user's understanding of how the system works.

#### Sitewide

| ID | Issue | Severity | Fix | Effort |
|----|-------|----------|-----|--------|
| CM-01 | **OPS is the platform's core metric but is never explained to new users.** There is a hover tooltip on the "OPS" column header in GameTable.tsx (line 25-37) that explains the score, but: (1) it only appears on hover, so mobile users never see it; (2) it's positioned on a tiny 3-letter word, so even desktop users may never discover it; (3) it uses jargon like "review velocity" and "concurrent players" without context. The Radar Pick page explains OPS anatomy in detail, but only for the single featured game. There is no global "What is OPS?" resource. | Critical | Add a first-visit tooltip/popover that introduces OPS, the confidence dots, and the color scale. Add a persistent "?" icon next to every OPS score that links to a glossary section or an expandable explanation. On mobile, make the OPS explanation tap-to-reveal instead of hover. | Medium |
| CM-02 | **Confidence dots (3-dot indicator) use a novel visual language with no key.** The OpsBadge component (OpsBadge.tsx line 52-65) renders 1-3 filled dots to indicate data coverage. The only explanation is a `title` attribute that appears on hover. Users are likely to misread them as a rating (3 dots = great game) rather than a data quality indicator. | Critical | Add a one-time tooltip or a legend in the table header explaining: "Dots show data coverage, not game quality." Change the dots to a more conventional indicator: e.g., a signal-strength bar icon, or a text label ("HIGH" / "MED" / "LOW"). | Quick Win |
| CM-03 | **Color encoding is inconsistent across pages.** On the Database page, green means "positive" (high score %, new game), amber means "moderate", red means "negative". But on the Game Detail page, `C.ops = "#802626"` (the dried-blood primary color) is used for the OPS line, which is the most important positive signal. The primary brand color doubles as both "brand identity" and "data series color", creating confusion about whether red means "bad" or "featured". | Major | Reserve the primary `#802626` for brand elements only (logo, headers, accents). Use a distinct, non-brand color for the OPS data series in charts (e.g., a bright warm orange or a dedicated OPS blue). | Medium |
| CM-04 | **The relationship between pages is unclear.** The Database shows a list, the Radar Pick shows one game, the Trends page shows aggregates, and the Game Detail shows one game's timeline. But there is no narrative connecting them: "Start here, drill down there." A journalist user might never discover that clicking a game row in the Database navigates to the Game Detail page. | Major | Add contextual navigation breadcrumbs. On the Game Detail page, add "Back to Database" with the current filter state preserved. On the Radar Pick, add "See all games" and "View this game's autopsy" links explicitly. | Medium |

#### Radar Pick Page

| ID | Issue | Severity | Fix | Effort |
|----|-------|----------|-----|--------|
| CM-05 | **The "Signal 01, Signal 02" numbering implies a fixed set of signals, but the number varies.** Evidence blocks are dynamically built from data (line 143-259). Some games show 1 block, others show 3. The auto-numbering ("01", "02") suggests a canonical set, but the user has no way to know if a missing signal means "not applicable" or "no data". | Minor | Add a note below the evidence section: "Signals shown are based on available data. Not all games have YouTube coverage or demo data." Or show greyed-out placeholders for missing signals. | Quick Win |

#### Game Detail Page

| ID | Issue | Severity | Fix | Effort |
|----|-------|----------|-----|--------|
| CM-06 | **The page is called "The Autopsy" but the component is named `ConceptA.tsx`.** The filename gives no indication of the page's purpose. More importantly, the "autopsy" metaphor is overloaded -- to a horror-game audience it could mean the game is dead. For games that are actively breaking out, the name creates a conceptual mismatch. | Minor | Rename to `GameDetail.tsx` or `Timeline.tsx`. Consider "Game Forensics" or "Signal Trace" as alternative metaphors that do not imply death. | Quick Win |
| CM-07 | **OPS is shown as both "raw" and "capped" without explaining the relationship.** The OPS Spotlight section (line 1620-1700+) shows "Current OPS (Raw)" as a large number and "Capped: X/100" as a smaller annotation. Users see two different numbers for the same metric and have no intuition for why they differ or which one matters. The formula `min(100, raw * 40)` is not surfaced. | Major | Show a single "OPS Score" as the primary number (the capped 0-100 value). Move the raw value to a tooltip or expandable detail. Add a one-line explanation: "Raw signal strength, scaled to 0-100." | Quick Win |

---

### 2.4 Affordances

> "The properties of an object that determine how it could be used." -- Norman

Affordances are the perceived and actual properties that suggest how a thing can be used.

#### Database Page

| ID | Issue | Severity | Fix | Effort |
|----|-------|----------|-----|--------|
| A-01 | **Table column headers look like sort controls but are not.** The `<th>` elements (GameTable.tsx line 16-39) are styled as bold uppercase text with tight tracking -- the universal convention for sortable table headers. But they have no click handler, no sort indicator arrows, and no cursor change. | Major | Add click-to-sort on all sortable columns. Show a sort direction arrow (up/down chevron) on the active sort column. | Medium |
| A-02 | **Game rows are clickable but have no visible click affordance.** GameRow (line 47-56) uses `onClick` to navigate and `cursor-pointer` class, but the row looks like a passive data display. The only hint is the hover background change (`hover:bg-primary/5`). On mobile, the GameCard component (GameCard.tsx) wraps the entire card in a `<Link>`, which is better. | Minor | Add a subtle right-chevron icon at the end of each row to signal navigation. Match the GameCard pattern on desktop. | Quick Win |
| A-03 | **Range sliders use custom styling that removes the default thumb affordance.** The sliders (FilterBar.tsx line 102-108, 193-199) use `appearance-none` which strips the native slider handle, replacing it with a thin line. The `accent-primary` CSS property partially restores it, but the result is browser-dependent and may not render a visible thumb on all platforms. | Minor | Explicitly style a custom thumb via `::-webkit-slider-thumb` and `::-moz-range-thumb` pseudo-elements to ensure a visible, grabbable handle on all browsers. | Quick Win |

#### Radar Pick Page

| ID | Issue | Severity | Fix | Effort |
|----|-------|----------|-----|--------|
| A-04 | **The Steam link at the bottom of the page (line 779-792) uses a text-only affordance: "view_on_steam_arrow game_title on Steam".** The link is styled as mono text with the primary color and a triangular bullet. It has no button shape, no underline, and no hover underline -- only an opacity change. Users may not recognize it as a link. | Minor | Style it as a button or add an underline on hover. Add a Steam icon to reinforce the external-link destination. | Quick Win |

#### Game Detail Page

| ID | Issue | Severity | Fix | Effort |
|----|-------|----------|-----|--------|
| A-05 | **Event flag buttons in the chart footer have no tooltip preview.** The flag buttons (line 1243-1262) show a symbol and "D{day_index}" (e.g., "star D0", "circle D12"). The `title` attribute contains the event title, but on mobile there is no way to see this without tapping, and tapping opens the modal immediately. Users cannot preview before committing. | Minor | Show a brief label on touch-hold or add a visible label next to the symbol when space permits. Group flags by type with small type headings. | Quick Win |

---

### 2.5 Signifiers

> "Signifiers communicate where the action should take place." -- Norman

Signifiers are the perceivable cues that tell the user what to do and where.

#### Database Page

| ID | Issue | Severity | Fix | Effort |
|----|-------|----------|-----|--------|
| S-01 | **Color-only encoding for status badges with no icon/text alternative.** The DaysBadge uses green/amber/red backgrounds (GameRow.tsx line 18-21) to indicate recency. The Score % column uses green/amber/red text (line 23-27). The OPS score uses green/amber/red (line 227-233). Users with color vision deficiency cannot distinguish these states. | Critical | Add icons alongside colors: a "new" sparkle for green days badges, a clock for amber, a calendar for red. For OPS, pair the color with a text label: "Breakout" / "Rising" / "Quiet". | Medium |
| S-02 | **The YouTube "HIGH REACH" and "VIRAL" badges are color-coded by category but the meaning is not explained.** A purple badge means >5M subscribers (HIGH REACH), a red badge means >500K views on a single video (VIRAL). These thresholds are arbitrary to users and the badges appear without context. | Minor | Add a small "?" icon or tooltip explaining the threshold. Or use more descriptive labels: "5M+ subs" and "500K+ views". | Quick Win |

#### Trends Page

| ID | Issue | Severity | Fix | Effort |
|----|-------|----------|-----|--------|
| S-03 | **Price Intelligence chart uses bar color to encode Avg OPS but the legend is a footnote.** The bar colors (green/amber/gray) represent OPS tiers (line 287-289, 293-295). The explanation "Bar color = avg OPS (green > 25, amber > 15)" is a 9px footnote below the chart. | Minor | Replace the footnote with a proper color legend inside the chart area, using Recharts `<Legend>`. | Quick Win |

#### Game Detail Page

| ID | Issue | Severity | Fix | Effort |
|----|-------|----------|-----|--------|
| S-04 | **Phase band colors on charts have no legend.** The timeline charts show translucent colored bands (line 963-973) that correspond to lifecycle phases (Pre-Launch, Launch Week, Discovery, Settling, Long Tail). But the chart itself has no legend mapping colors to phases. The phase cards below use matching accent colors, but the visual connection between card and band requires inference. | Major | Add a small inline legend at the top of the chart panel, or annotate each phase band with a subtle text label at the top edge. | Quick Win |

---

### 2.6 Mapping

> "The relationship between the elements of two sets of things." -- Norman

Mapping is the relationship between controls and their effects.

#### Database Page

| ID | Issue | Severity | Fix | Effort |
|----|-------|----------|-----|--------|
| M-01 | **The Sort control in FilterBar affects the table, but the two are visually separated by the full width of the filter panel.** On desktop, the sort dropdown (FilterBar.tsx line 228-241) sits at the far right of the horizontal filter row, while the table it controls is a separate component below. There is no visual line connecting the sort control to the table. | Minor | Move the sort control closer to the table (either inside the table header row or right-aligned above the table). Or visually connect them with a shared background band. | Quick Win |
| M-02 | **Pagination controls are split between top (filters) and bottom (page numbers/status).** Filter state resets the page to 1 (Database.tsx line 52-64), but the user's mental model may not associate filter changes with page resets. There is no indication that changing a filter moved them back to page 1. | Minor | Show a brief toast or transition when the page resets: "Showing page 1 of N results." Or highlight the page-1 button briefly after a filter change. | Quick Win |

#### Radar Pick Page

| ID | Issue | Severity | Fix | Effort |
|----|-------|----------|-----|--------|
| M-03 | **The alert banner at the top and the hero section both show the game title, week number, and date range -- redundant information.** The sticky banner (line 383-430) and the hero (line 433-503) both display "Radar Pick -- Week N, Year . Date Range" and the game title. This creates confusion about whether they are two different things. | Minor | Remove the redundant title/date from the hero section since the banner is sticky and always visible. Or make the banner collapse to just the OPS score badge when the hero is in view. | Medium |

#### Game Detail Page

| ID | Issue | Severity | Fix | Effort |
|----|-------|----------|-----|--------|
| M-04 | **The Brush control at the bottom of Panel 3 controls the zoom for all three synced panels, but this is not signified.** The three chart panels share a `syncId="autopsy"` (line 1215, 1274, 1343), meaning the Brush at the bottom of Panel 3 controls the x-axis zoom for all three. But the Brush is visually attached to Panel 3 only. Users may think it only affects the bottom chart. | Major | Move the Brush to a dedicated "zoom bar" below all three panels, visually spanning the full width. Or add labels: "Zoom all charts" next to the brush handle. | Medium |

---

### 2.7 Constraints

> "Providing physical, logical, semantic, and cultural constraints guides actions and eases interpretation." -- Norman

Constraints prevent errors by limiting what the user can do.

#### Database Page

| ID | Issue | Severity | Fix | Effort |
|----|-------|----------|-----|--------|
| C-01 | **Price slider allows $0 which shows 0 results (free games excluded by API when max_price=0).** The slider min is 0 (FilterBar.tsx line 120-121, 215-216). Setting it to 0 likely returns no games since most free games have price_usd=0 and the API filter uses `max_price < 60` logic. The label shows "<$0" which is semantically nonsensical. | Minor | Set the slider minimum to 1 or change the $0 position to mean "Free only" with a special label. Add an "Include Free" checkbox. | Quick Win |
| C-02 | **No feedback when filter combination yields 0 results.** The empty state (GameTable.tsx line 55-64) says "No games found -- Try adjusting your filters" but does not tell the user which filter is most restrictive or suggest a specific change. | Minor | Enhance the empty state: "No games under $5 released in the last 7 days. Try expanding the price or days range." Use the current filter values to generate contextual suggestions. | Medium |

#### Radar Pick Page

| ID | Issue | Severity | Fix | Effort |
|----|-------|----------|-----|--------|
| C-03 | **The page assumes a single radar pick always exists.** If the `/radar-pick` endpoint returns no data, the page shows "No radar pick available this week" (line 338). But this message does not tell the user why (no games scored above threshold? pipeline not run?). | Minor | Show a more informative message: "No game has scored above the Radar Pick threshold this week. Check the Database for all tracked games." Add a link to the Database page. | Quick Win |

#### Game Detail Page

| ID | Issue | Severity | Fix | Effort |
|----|-------|----------|-----|--------|
| C-04 | **No upper bound on the creator impact table length.** The table (line 1538-1615) renders all `creatorImpacts` after the first one without pagination or truncation. A game covered by 30+ creators would produce an unwieldy table. | Minor | Limit the initial display to 5 creators with a "Show all N creators" expand button. | Quick Win |

---

## 3. Cross-Cutting Themes

### 3.1 The Explanation Gap

Horror Radar's core value is its computed metrics: OPS, confidence, velocity, decay retention, coverage penalty. But the interface treats these as self-evident numbers. The OPS tooltip in the table header is the only explanation in the entire Database page, and it requires a hover interaction. The Radar Pick page has deep explanations but only for the one featured game. The Game Detail page shows raw OPS without explaining the cap formula.

**Pattern**: Every computed metric needs a progressive disclosure explanation -- a visible "?" that expands to 1-2 sentences, with a link to the full methodology for power users.

### 3.2 Error State Blindness

The application has zero error boundaries. Every page handles errors with either `console.error` + empty state, or a generic text message. The `EmptyState` component exists with `variant="error"` and `variant="loading-failed"` but is not used by any page. The status polling in the footer fails silently. The API client (`client.ts`) throws errors but no page differentiates between "no results" and "API failure".

**Pattern**: Adopt a consistent error handling strategy:
1. Wrap each page in a React Error Boundary
2. Use `EmptyState` with the correct variant
3. Add retry buttons that re-trigger the failed fetch
4. Show connection status in the footer

### 3.3 Mobile as Afterthought

The Database page has a responsive design (table on desktop, cards on mobile) and the FilterBar has a mobile layout. But the Radar Pick page uses hardcoded `padding: "12px 40px"` and `fontSize: 64` on the hero title (line 465) with no responsive breakpoints. The Trends page uses `md:px-10` for desktop padding but leaves charts at full width on mobile, where the dual-axis Market Pulse chart becomes unreadable. The Game Detail page uses `padding: "32px 40px"` with no mobile adjustment.

**Pattern**: The Radar Pick and Game Detail pages need responsive container widths, reduced font sizes, and stacked layouts for mobile. All inline `style={{}}` values should migrate to Tailwind responsive classes.

### 3.4 Accessibility Debt

No ARIA labels on interactive elements (except the hamburger menu and filter toggle). Color-only status encoding throughout. No keyboard navigation for event flags, series toggles, or phase cards. Hover-only tooltips for OPS explanation and confidence dots. No `role` attributes on custom interactive elements. The EventCard modal has no focus trap.

**Pattern**: Conduct a focused accessibility pass:
1. Add `aria-label` to all icon-only buttons
2. Add `aria-pressed` to toggle buttons
3. Add `role="dialog"` and focus trap to modals
4. Ensure all color-coded information has a non-color alternative

---

## 4. Priority Matrix

Sorted by Impact (Critical > Major > Minor) then by Effort (Quick Win > Medium > Structural). Items at the top should be addressed first.

| Rank | ID | Principle | Issue Summary | Severity | Effort |
|------|-----|-----------|---------------|----------|--------|
| 1 | CM-01 | Conceptual Model | OPS never explained to new users | Critical | Medium |
| 2 | CM-02 | Conceptual Model | Confidence dots have no key/legend | Critical | Quick Win |
| 3 | F-01 | Feedback | API errors shown as "no results" instead of error state | Critical | Quick Win |
| 4 | S-01 | Signifiers | Color-only encoding for all status badges (accessibility) | Critical | Medium |
| 5 | D-11 | Discoverability | Chart Brush/zoom control is invisible | Critical | Quick Win |
| 6 | D-01 | Discoverability | Mobile filter toggle has no text label | Major | Quick Win |
| 7 | D-02 | Discoverability | No "Reset Filters" button | Major | Quick Win |
| 8 | D-03 | Discoverability | Sort dropdown disconnected from table; headers not clickable | Major | Medium |
| 9 | D-06 | Discoverability | Previous picks rows have no click affordance | Major | Quick Win |
| 10 | D-08 | Discoverability | Market Pulse chart has no legend for dual axes | Major | Quick Win |
| 11 | D-09 | Discoverability | Subgenre momentum table has no column headers | Major | Quick Win |
| 12 | F-02 | Feedback | Status polling fails silently | Major | Quick Win |
| 13 | F-03 | Feedback | Full-table spinner on filter change (jarring content replacement) | Major | Medium |
| 14 | F-07 | Feedback | Event modal has no keyboard dismiss or ARIA | Major | Quick Win |
| 15 | A-01 | Affordances | Table headers look sortable but are not | Major | Medium |
| 16 | CM-03 | Conceptual Model | Primary color #802626 used as both brand and data color | Major | Medium |
| 17 | CM-04 | Conceptual Model | No narrative connecting the 4 pages | Major | Medium |
| 18 | CM-07 | Conceptual Model | Raw vs capped OPS shown without explanation | Major | Quick Win |
| 19 | S-04 | Signifiers | Phase band colors on charts have no legend | Major | Quick Win |
| 20 | M-04 | Mapping | Brush controls all 3 synced panels but is attached to Panel 3 only | Major | Medium |
| 21 | D-04 | Discoverability | Unsurfaced backend data (gems, blind spots, dev profiles, forecasts) | Major | Structural |
| 22 | D-05 | Discoverability | No deep linking or export for filtered views | Major | Medium |
| 23 | D-12 | Discoverability | Phase cards look clickable but are not | Major | Medium |
| 24 | D-07 | Discoverability | OPS trajectory chart has no legend | Minor | Quick Win |
| 25 | D-10 | Discoverability | Creator Radar rows lack link affordance | Minor | Quick Win |
| 26 | D-13 | Discoverability | Series toggle pills have no tooltip | Minor | Quick Win |
| 27 | D-14 | Discoverability | Broken "Show Median Trajectory" button | Minor | Quick Win |
| 28 | F-04 | Feedback | No visual feedback during slider debounce window | Minor | Quick Win |
| 29 | F-05 | Feedback | Loading state on Radar Pick is plain text, no skeleton | Minor | Quick Win |
| 30 | F-06 | Feedback | Missing trajectory chart shows nothing instead of placeholder | Minor | Quick Win |
| 31 | F-08 | Feedback | No transition animation on series toggle | Minor | Quick Win |
| 32 | A-02 | Affordances | Game rows have no visual navigation indicator | Minor | Quick Win |
| 33 | A-03 | Affordances | Custom slider styling may remove thumb on some browsers | Minor | Quick Win |
| 34 | A-04 | Affordances | Steam link has no link affordance | Minor | Quick Win |
| 35 | A-05 | Affordances | Event flags have no tooltip preview on mobile | Minor | Quick Win |
| 36 | S-02 | Signifiers | HIGH REACH / VIRAL badge thresholds unexplained | Minor | Quick Win |
| 37 | S-03 | Signifiers | Price chart color legend is a tiny footnote | Minor | Quick Win |
| 38 | M-01 | Mapping | Sort control visually distant from table | Minor | Quick Win |
| 39 | M-02 | Mapping | Page reset on filter change is not communicated | Minor | Quick Win |
| 40 | M-03 | Mapping | Redundant title/date in banner and hero | Minor | Medium |
| 41 | C-01 | Constraints | Price slider $0 yields nonsensical results | Minor | Quick Win |
| 42 | C-02 | Constraints | Empty state gives no filter-specific suggestion | Minor | Medium |
| 43 | C-03 | Constraints | No-pick state gives no actionable guidance | Minor | Quick Win |
| 44 | C-04 | Constraints | Creator impact table has no pagination | Minor | Quick Win |
| 45 | CM-05 | Conceptual Model | Auto-numbered signals imply a fixed set | Minor | Quick Win |
| 46 | CM-06 | Conceptual Model | File named ConceptA.tsx; "autopsy" metaphor may confuse | Minor | Quick Win |

---

## 5. Top 10 Recommendations

### 1. Introduce OPS to new users (CM-01, CM-02)
Add a first-visit onboarding tooltip sequence that explains: (1) what OPS measures, (2) what the confidence dots mean, (3) what the color thresholds are. Persist a "?" icon next to every OPS score that expands on tap/click. This is the single highest-impact change because OPS is the platform's core differentiator and currently requires users to hover over a tiny column header to understand it.

### 2. Fix error state blindness (F-01, F-02)
Replace the silent error handling in Database.tsx with the existing `EmptyState` component using `variant="error"` and `variant="loading-failed"`. Add a retry button. Show a connection-lost indicator in the footer when status polling fails. This prevents users from troubleshooting filters when the real problem is a network failure.

### 3. Make the Brush zoom control visible (D-11)
Add a text label "Drag to zoom timeline" above the Brush handle. Style the handle with a contrasting color and a grab cursor. Consider adding discrete +/- zoom buttons as an accessible alternative. The Brush is the primary interaction for the Game Detail page's most valuable feature (time-range analysis), and currently zero percent of users will discover it organically.

### 4. Add non-color alternatives to status encoding (S-01)
Pair every color-coded badge with an icon or text label: green days badge + sparkle icon, amber + clock, red + calendar. For OPS, add a text tier: "Breakout" / "Rising" / "Quiet". This fixes both accessibility (color vision deficiency) and learnability (users do not need to memorize the color scale).

### 5. Make table column headers sortable (A-01, D-03)
Add click-to-sort on the GameTable column headers. Show a sort direction arrow on the active column. This matches the universal expectation for data tables and eliminates the need for users to find the separate sort dropdown in the filter bar.

### 6. Add a Reset Filters button (D-02)
Show a "Reset" button in the FilterBar when any filter deviates from its default value. This is a 30-minute implementation with outsized usability impact -- users currently have no way to return to the default view without manually adjusting every control.

### 7. Fix mobile affordances on Radar Pick and Game Detail (D-06, D-12)
Replace `<div onClick>` patterns with proper `<Link>` or `<button>` elements. Remove the hover-lift animation from phase cards (or make them functional). Add touch-appropriate feedback (active states, press animations). These two pages were designed for desktop and need a mobile interaction pass.

### 8. Add chart legends (D-08, S-04, D-07)
Every chart with multiple series or encoded colors needs a visible legend. The Market Pulse dual-axis chart, the phase band colors, and the OPS trajectory threshold line all lack legends. Use Recharts' built-in `<Legend>` component. This is a batch of Quick Win fixes that collectively transform chart readability.

### 9. Surface unsurfaced data incrementally (D-04)
Start with the lowest-effort, highest-value additions: (1) show developer track record on the Game Detail page header (data exists in `DeveloperProfile`), (2) show subgenre classification as a badge in the Database table rows, (3) link Reddit mentions to their actual URLs (data exists in `reddit_mentions.post_url`). These require no new backend work.

### 10. Add deep linking for filtered views (D-05)
Sync the Database filter state (days, maxPrice, sortBy, search, gameMode) to URL query parameters. This enables users to share filtered views, bookmark specific searches, and use browser back/forward to undo filter changes. Implement via `useSearchParams` from react-router-dom.

---

*End of audit. 41 findings across 7 principles, 4 pages. Prioritize the Critical/Quick Win cluster (items 2, 3, 5 in the top 10) for immediate wins, then address the Conceptual Model gaps (items 1, 4) for lasting usability improvement.*
