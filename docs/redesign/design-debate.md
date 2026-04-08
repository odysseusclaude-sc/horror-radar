# Horror Radar Design Debate — Multi-Agent Consensus & Divergence

**Date**: 2026-04-09
**Agents**: UX Strategist, Visual Designer, Accessibility Specialist, Information Architect
**Framework**: Don Norman's 7 Design Principles × WCAG 2.1 AA × User Persona Alignment

---

## 1. Executive Summary

Four specialized agents independently analyzed Horror Radar from distinct perspectives. This document captures where they **converge** (implement with confidence) and where they **diverge** (requires discussion and decision).

**Consensus**: 12 areas of strong agreement across 3+ agents
**Divergence**: 6 areas where agents propose conflicting approaches
**Quick Wins**: 18 changes implementable in ≤2 hours each
**Structural**: 4 changes requiring 1+ weeks of work

---

## 2. Consensus Areas (3+ agents agree)

### C1: OPS Needs an Explanation Layer
**Agents**: UX Strategist (CM-01, Critical), Accessibility (1.4.13), Info Architect (all 4 personas)
**The problem**: OPS is the platform's core differentiator but is never explained. The only explanation is a hover tooltip on a tiny column header — invisible on mobile, undiscoverable on desktop.
**Agreed solution**: Progressive disclosure via "?" icon next to every OPS score, expanding to a 2-sentence explanation. First-visit onboarding popover for new users. Full methodology page linked from the explainer.
**Why they agree**: The UX Strategist found OPS violates Conceptual Model. The Accessibility Specialist found the hover tooltip fails WCAG 1.4.13 (Content on Hover). The Info Architect found all 4 personas cite "understanding what scores mean" as a barrier.
**Effort**: Medium (1-3 days)
**Impact**: Critical — this is the #1 usability improvement

### C2: Color-Only Status Encoding Must Be Supplemented
**Agents**: UX Strategist (S-01, Critical), Accessibility (1.4.1, Critical), Visual Designer
**The problem**: OPS scores (green/amber/red), days badges (green/amber/red), review scores (green/amber/red) all rely on color alone. 8% of men have color vision deficiency.
**Agreed solution**: Add icon + text tier alongside every color-coded badge:
- Days: ★ NEW (≤7d), ◐ RECENT (≤30d), ◷ (>30d)
- OPS: BREAKOUT (≥60), RISING (≥30), QUIET (<30)
- Reviews: text tier label in addition to color
**Effort**: Medium (1-2 days)
**Impact**: Critical — accessibility compliance + learnability

### C3: Error States Need Real Treatment
**Agents**: UX Strategist (F-01, Critical), Accessibility (robustness), Info Architect (journey friction)
**The problem**: API errors in Database.tsx are silently swallowed (`catch { setGames([]) }`), showing "No games found" when the real issue is a network failure. The `EmptyState` component with `variant="error"` exists but is never used.
**Agreed solution**: Track error state alongside loading state. Use `EmptyState variant="error"` with retry button. Show connection-lost indicator in footer when status polling fails.
**Effort**: Quick Win (≤2 hours)
**Impact**: Critical — prevents user confusion and troubleshooting of wrong problem

### C4: Primary Color #802626 Fails Contrast
**Agents**: Accessibility (1.4.3, Critical), UX Strategist (cross-cutting), Visual Designer
**The problem**: Primary #802626 on background #111314 = 2.46:1 contrast ratio. WCAG AA requires 4.5:1 for normal text.
**Agreed solution**: Use #c04040 for interactive text (links, active nav, filter values) — achieves ~5.5:1. Keep #802626 for large decorative elements (logo glow, hero accents) where 3:1 suffices.
**Effort**: Quick Win (1 day for color swap + visual review)
**Impact**: Critical — legal accessibility compliance

### C5: Text-Dim Color Fails Contrast
**Agents**: Accessibility (1.4.3, Critical), Visual Designer
**The problem**: Text-dim #6b6058 on #111314 = 3.03:1 contrast. Used for developer names, filter labels, table headers.
**Agreed solution**: Upgrade to #918377 (~4.6:1 contrast). Maintains warm Occult Amber feel.
**Effort**: Quick Win (half day)
**Impact**: Critical — affects readability of secondary text throughout the app

### C6: Mobile Filter Discovery
**Agents**: UX Strategist (D-01, Major), Info Architect (Content Creator journey), Accessibility (signifiers)
**The problem**: On mobile, the filter panel is hidden behind an icon-only toggle (`tune` Material Symbol) with no text label. Users may never discover filtering capabilities.
**Agreed solution**: Add "Filters" text label next to the icon. Show active filter count badge when non-default filters are applied (e.g., "Filters (2)").
**Effort**: Quick Win (30 minutes)
**Impact**: Major — unlocks filtering for mobile users

### C7: Reset Filters Button
**Agents**: UX Strategist (D-02, Major), Info Architect (all personas), Accessibility (error prevention)
**The problem**: No way to return to default filter state without manually adjusting each control.
**Agreed solution**: Show a "Reset" button when any filter deviates from default (days=90, maxPrice=60, gameMode="all", search=""). Button disappears when all filters are at defaults.
**Effort**: Quick Win (30 minutes)
**Impact**: Major — eliminates filter lock-in frustration

### C8: Chart Brush/Zoom Needs Visibility
**Agents**: UX Strategist (D-11, Critical), Accessibility (2.1.1 keyboard), Visual Designer
**The problem**: The Brush zoom control on the Game Detail page is invisible — dark handle on dark background, no label, no instruction. It's the primary interaction for time-range analysis.
**Agreed solution**: Add visible label "Drag to zoom timeline". Style handle with contrasting border. Add discrete +/- zoom buttons as keyboard-accessible alternative.
**Effort**: Quick Win (1-2 hours)
**Impact**: Critical — unlocks the page's most valuable feature

### C9: Table Headers Should Be Sortable
**Agents**: UX Strategist (A-01, D-03, Major), Info Architect (Publisher Scout persona), Visual Designer
**The problem**: Table column headers look like sort controls (bold, uppercase) but aren't clickable. Sort control is in the filter bar, visually disconnected from the table.
**Agreed solution**: Make column headers clickable sort triggers with sort direction arrows. Keep filter bar sort as secondary control.
**Effort**: Medium (1-2 days)
**Impact**: Major — matches universal expectation for data tables

### C10: Skeleton Loading Instead of Spinner
**Agents**: UX Strategist (F-03, Major), Accessibility (perceivable), Visual Designer
**The problem**: Filter changes replace the entire table with a full-screen spinner, causing jarring content replacement and loss of scroll position. Skeleton components exist (`Skeleton.tsx`, `GameRowSkeleton`) but aren't used.
**Agreed solution**: Use existing skeleton components for initial load. For filter changes, keep existing data visible but dimmed, with a subtle top-bar loading indicator.
**Effort**: Quick Win (1-2 hours)
**Impact**: Major — eliminates visual jarring on filter interaction

### C11: Confidence Dots Need Redesign
**Agents**: UX Strategist (CM-02, Critical), Accessibility (1.1.1), Visual Designer
**The problem**: 3-dot confidence indicator is misread as a rating system. Only explained via `title` attribute (hover-only, not accessible).
**Agreed solution**: Replace dots with text labels: HIGH / MED / LOW. Use color + text for redundancy. Add to OPS column header explanation.
**Effort**: Quick Win (1 hour)
**Impact**: Critical — prevents misinterpretation of data quality as game quality

### C12: Game Detail Page Decomposition
**Agents**: UX Strategist (cross-cutting), Info Architect (overwhelming for all personas), Accessibility (cognitive load)
**The problem**: ConceptA.tsx is 2,400 lines. The page presents all information at once with no section navigation, no progressive disclosure, no way to jump to a specific section.
**Agreed solution**: Add section navigation (sticky sidebar on desktop, sticky top bar on mobile). Implement collapsible sections. Break the component into 5-6 smaller files.
**Effort**: Structural (1-2 weeks)
**Impact**: Major — reduces cognitive overload, improves maintainability

---

## 3. Divergence Areas (Agents Disagree)

### D1: OPS Explainer Placement

**UX Strategist position**: First-visit onboarding tooltip sequence (3-step tour). Persistent "?" icon per OPS instance.
- *Pro*: Comprehensive, teaches once. Doesn't clutter the UI permanently.
- *Con*: Tooltip tours have high dismissal rates. Users who skip lose the context.

**Info Architect position**: Dedicated "What is OPS?" page accessible from the navigation. Inline contextual hints on every page.
- *Pro*: Always accessible. Works for returning users who forgot.
- *Con*: Extra navigation item adds complexity. Users may not click through.

**Visual Designer position**: Inline explanation banner at top of Database page (dismissible). OPS anatomy always visible on Radar Pick.
- *Pro*: Immediate visibility, no click required. Sets the tone.
- *Con*: Takes up screen real estate. Returning users see it every session until dismissed.

**Recommendation**: Combine approaches — dismissible onboarding banner on first visit + persistent "?" icon that links to a glossary section (not a separate page). The Radar Pick page keeps its OPS anatomy as-is since it's contextual.

### D2: Navigation Structure

**Info Architect position**: Expand from 4 to 6 pages: add "Discover" (blind spots + gems) and "Watchlist" (saved games).
- *Pro*: Serves Content Creator persona directly. Surfaces hidden API data. Creates engagement loop.
- *Con*: More pages = more maintenance. Watchlist requires state management (localStorage or backend).

**UX Strategist position**: Keep 4 pages but add sub-navigation within Trends (section anchors + TOC). Don't add new pages until existing ones are polished.
- *Pro*: Focus on quality over quantity. Less engineering work.
- *Con*: Blind spot data stays hidden. No engagement loop.

**Accessibility Specialist position**: Fewer pages with better landmarks is preferable. More pages means more navigation overhead for keyboard users.
- *Pro*: Simpler mental model, fewer tab stops.
- *Con*: Conflates navigation simplicity with feature completeness.

**Recommendation**: Keep 4 pages for now. Add Blind Spots as a section within Trends (quick win). Plan Discover + Watchlist as a future sprint once core UX issues are resolved.

### D3: Data Density on Database Page

**Publisher Scout persona** (Info Architect): Wants MORE columns — developer track record, subgenre, demo status, OPS forecast.
- *Pro*: Power users want dense data to scan quickly.
- *Con*: More columns = more horizontal scrolling, harder to scan on mobile.

**Accessibility Specialist**: Wants FEWER visible columns with the option to show/hide. Cognitive load of 9+ columns is high.
- *Pro*: Reduces overwhelm. Customizable per user.
- *Con*: Column picker adds UI complexity. Discoverability of hidden columns is low.

**Visual Designer**: Current 9 columns are the limit. Add new data via the Game Detail page instead.
- *Pro*: Keeps table scannable. Game Detail page handles depth.
- *Con*: Requires clicking through to see developer info or subgenre.

**Recommendation**: Keep 9 columns but add subgenre as a subtle badge on the game title cell (no new column). Add developer track record to Game Detail page. Consider a column toggle for power users as a future enhancement.

### D4: Radar Pick Hero Section Height

**Visual Designer**: Full-viewport hero with large image, Playfair Display title, dramatic reveal animation.
- *Pro*: Sets editorial tone. Differentiates from the data-heavy Database page.
- *Con*: Pushes actual data below the fold. Mobile users must scroll far.

**UX Strategist**: Compact hero (40vh max) with key metrics visible without scrolling.
- *Pro*: Respects user time. Key data visible immediately.
- *Con*: Loses the editorial/magazine feel that differentiates this page.

**Info Architect**: The Journalist persona values the editorial framing. The Content Creator just wants the data. Split the difference.
- *Pro*: Balanced.
- *Con*: Neither dramatic nor efficient.

**Recommendation**: Medium hero (50vh on desktop, 40vh on mobile) with OPS score and top 3 metrics visible above the fold. Full editorial content below. Add a "Jump to data" link in the hero for data-first users.

### D5: Chart Complexity on Game Detail Page

**UX Strategist**: Simplify — default to showing only OPS and Reviews, let users toggle other series.
- *Pro*: Reduces visual noise. Progressive disclosure.
- *Con*: Users might not discover toggleable series.

**Visual Designer**: Keep all series but use better visual layering — primary data as solid fills, secondary as dashed lines, tertiary as dots.
- *Pro*: All data visible at once. Visual hierarchy guides the eye.
- *Con*: Still visually complex for new users.

**Info Architect**: Different personas need different views — Content Creator cares about YouTube, Publisher cares about velocity. Pre-set "views" per use case.
- *Pro*: Persona-aware design.
- *Con*: Over-engineering. Users don't self-identify into personas.

**Recommendation**: Default to OPS + Reviews + Velocity (3 series). Other series off by default but easy to toggle on. Add labels to toggle pills explaining what each series shows.

### D6: Previous Picks Presentation

**Visual Designer**: Card layout with game thumbnails, OPS delta trend, and status badges.
- *Pro*: Visual, scannable, engaging.
- *Con*: Takes more vertical space.

**UX Strategist**: Compact table with clear click affordance (chevron arrows).
- *Pro*: Dense, efficient for comparison.
- *Con*: Less visually engaging.

**Recommendation**: Cards on mobile (easier to tap), compact table on desktop (easier to scan). Both with clear navigation affordance.

---

## 4. Impact × Effort Matrix

```
              Low Effort                    High Effort
         ┌─────────────────────┬─────────────────────┐
  High   │ C3: Error states    │ C1: OPS explanation  │
 Impact  │ C4: Primary color   │ C2: Color encoding   │
         │ C5: Text-dim color  │ C9: Sortable headers │
         │ C6: Filter label    │ C12: Page decomp     │
         │ C7: Reset filters   │                      │
         │ C8: Brush visibility│                      │
         │ C10: Skeleton load  │                      │
         │ C11: Confidence text│                      │
         ├─────────────────────┼─────────────────────┤
  Low    │ Chart legends       │ D2: Navigation       │
 Impact  │ Previous picks UX   │ D3: Column density   │
         │ Phase card fix      │ D5: Chart views      │
         │ Slider thumb style  │                      │
         │ Deep linking        │                      │
         └─────────────────────┴─────────────────────┘
```

### Priority Order

**Sprint 1 — Quick Wins (1-2 days, 8 items)**:
1. C3: Error states (use existing EmptyState component)
2. C4: Primary color swap (#802626 → #c04040 for text)
3. C5: Text-dim color swap (#6b6058 → #918377)
4. C6: Mobile filter label
5. C7: Reset filters button
6. C8: Brush zoom visibility
7. C10: Skeleton loading (wire up existing components)
8. C11: Confidence dots → text labels

**Sprint 2 — Core UX (3-5 days, 4 items)**:
1. C1: OPS explanation layer (onboarding + persistent "?")
2. C2: Icon + text supplements for color encoding
3. C9: Sortable table headers
4. Chart legends (all pages)

**Sprint 3 — Structural (1-2 weeks, 2 items)**:
1. C12: Game Detail page decomposition + section navigation
2. D2: Blind Spots section in Trends (surfacing hidden data)

---

## 5. Agent Credibility Assessment

| Agent | Strength | Blind Spot |
|-------|----------|------------|
| UX Strategist | Systematic principle-by-principle coverage, specific code references | Focused on problems, less on what's working well |
| Accessibility Specialist | Precise contrast ratios, code-level remediations | May over-index on compliance vs. UX impact |
| Info Architect | User empathy, journey-level thinking | Personas are hypothetical — need validation |
| Visual Designer | Concrete mockups, visual solutions | May prioritize aesthetics over data density |

---

## 6. What's Working Well (Don't Change)

The agents also identified strengths to preserve:
1. **Occult Amber palette** — distinctive, genre-appropriate, memorable
2. **3-font system** — clear separation of data (mono) from UI (sans) from editorial (serif)
3. **Database responsive design** — table on desktop, cards on mobile works well
4. **Radar Pick editorial format** — sets Horror Radar apart from pure data tools
5. **OPS component breakdown** (on Radar Pick) — excellent progressive disclosure when you find it
6. **Status bar with scraper info** — transparency into data freshness is rare and valued
7. **Phase-based timeline** (Game Detail) — lifecycle mental model is intuitive once understood

---

*This debate document should be revisited after implementation of Sprint 1. The divergence decisions (D1-D6) should be tested with real users before committing to structural changes.*
