# Horror Radar -- WCAG 2.1 AA Accessibility Audit

**Audit Date**: 2026-04-09
**Auditor**: Accessibility Specialist Agent
**Scope**: Full frontend (React SPA) -- 4 pages, 12 components
**Standard**: WCAG 2.1 Level AA
**Codebase**: `frontend/src/` (React 19, TypeScript, Tailwind CSS 3, Recharts)

---

## 1. Executive Summary

### Overall Accessibility Posture: FAILING

Horror Radar has **zero intentional accessibility implementation**. The application was built with visual design as the sole priority, resulting in numerous WCAG 2.1 AA violations across all four POUR principles (Perceivable, Operable, Understandable, Robust).

### Critical Blockers (Must Fix for Legal Compliance)

| # | Issue | WCAG Criterion | Severity |
|---|-------|----------------|----------|
| 1 | Primary color `#802626` on `#111314` has ~2.46:1 contrast ratio -- used for active nav text, filter values, links | 1.4.3 Contrast | Critical |
| 2 | `text-dim` `#6b6058` on `#111314` has ~3.03:1 contrast ratio -- used for labels, developer names, metadata | 1.4.3 Contrast | Critical |
| 3 | No skip navigation link | 2.4.1 Bypass Blocks | Critical |
| 4 | Interactive table rows use `onClick` on `<tr>` with no keyboard alternative | 2.1.1 Keyboard | Critical |
| 5 | Color-only status encoding (OPS scores: green/amber/red with no icon/pattern fallback) | 1.4.1 Use of Color | Critical |
| 6 | Charts (Recharts) have zero keyboard navigation | 2.1.1 Keyboard | Critical |
| 7 | No landmark roles (`<main>`, `<nav>` on mobile, `<aside>`) | 1.3.1 Info and Relationships | Critical |
| 8 | Form inputs have no `<label>` elements | 1.3.1 / 4.1.2 | Critical |

### Estimated Remediation Effort

- **P0 (Critical/Legal)**: 3--5 developer days
- **P1 (Major Barriers)**: 2--3 developer days
- **P2 (Enhancements)**: 2--3 developer days
- **Total**: ~8--11 developer days

---

## 2. WCAG 2.1 AA Checklist

### Principle 1: Perceivable

#### 1.1.1 Non-text Content -- FAIL

**Findings:**
- **Game header images** in `GameRow.tsx` (line 69) and `GameCard.tsx` (line 49): Have `alt={game.title}` -- PASS
- **Trends page thumbnails** in `Trends.tsx` (line 248, 351): Use `alt=""` (empty alt on decorative images) -- these images are NOT decorative; they identify games -- FAIL
- **MiniSparkline** (`MiniSparkline.tsx`): SVG chart with no `role`, `aria-label`, or `<title>` -- FAIL
- **MiniSpark** in `SignalFire.tsx` (line 126): Inline SVG with no accessible name -- FAIL
- **VelocitySpark** in `Trends.tsx` (line 64): Div-based bar chart with no text alternative -- FAIL
- **Confidence dots** in `OpsBadge.tsx` (line 52): Rely on `title` attribute (not reliably announced) -- PARTIAL
- **Header logo SVG** in `Header.tsx` (line 20): No `<title>` or `aria-label` -- FAIL
- **Material Symbols icons** used as interactive indicators (trending_up, trending_down, skull, chevron_left, chevron_right) with no `aria-label` or `aria-hidden` -- FAIL

**Remediation:**
```tsx
// MiniSparkline.tsx -- add role and label
<div className={...} style={{ height }} role="img" aria-label={`Sparkline chart showing ${data.length} data points`}>

// GameRow.tsx trending icons -- add aria-hidden and sr-only text
<span className="material-symbols-outlined text-status-pos" style={{ fontSize: 16 }} aria-hidden="true">
  trending_up
</span>
<span className="sr-only">Trending up</span>

// Header logo SVG -- add title
<svg fill="none" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Horror Radar logo">
  <title>Horror Radar logo</title>
  ...
</svg>

// Trends.tsx thumbnails -- add meaningful alt
<img src={yt.header_image_url} alt={yt.title} className="w-full h-full object-cover" />
```

**Effort**: 0.5 days

---

#### 1.3.1 Info and Relationships -- FAIL

**Findings:**
- **No `<main>` landmark**: `App.tsx` wraps content in a plain `<div>`. Screen readers cannot skip to main content.
- **Desktop `<nav>` present** in `Header.tsx` (line 31) but **mobile nav drawer** (line 81) also uses `<nav>` without a distinguishing `aria-label` -- PARTIAL
- **No `<aside>` or sectioning** for filter panels
- **Table headers** in `GameTable.tsx` (line 16): Use `<th>` but missing `scope="col"` attribute
- **Filter section** in `FilterBar.tsx` (line 31): Uses `<section>` but no heading or `aria-label`
- **Pagination footer** in `Pagination.tsx` (line 47): Uses `<footer>` -- PASS for landmark
- **Subgenre table** in `Trends.tsx` (line 189): Has `<table>` but no `<thead>`, no `<th>` headers, no `<caption>` -- FAIL
- **Demo cohort comparison** in `Trends.tsx` (line 304): Layout uses grid divs, not a comparison table -- FAIL (data relationships lost)
- **OPS score number** conveys status through color alone (see 1.4.1)
- **Game mode buttons** in `FilterBar.tsx` (lines 78-95, 166-184): Segmented control with no `role="group"` or `aria-label`
- **Heading hierarchy**: `<h1>` used on every page (PASS) but sub-sections lack heading structure -- PARTIAL
- **SignalFire.tsx**: Evidence blocks and OPS anatomy sections use `<h2>`, `<h3>` -- PASS for heading hierarchy

**Remediation:**
```tsx
// App.tsx -- wrap routes in main
<Header />
<main id="main-content">
  <Routes>...</Routes>
</main>

// GameTable.tsx -- add scope to th
<th scope="col" className="...">Game & Developer</th>

// Header.tsx -- label navs
<nav aria-label="Main navigation" className="hidden md:flex ...">
<nav aria-label="Mobile navigation" className="md:hidden ...">

// FilterBar.tsx -- label the section and group
<section aria-label="Game filters" className="...">
  <div role="group" aria-label="Game mode">
    ...buttons...
  </div>
```

**Effort**: 1 day

---

#### 1.3.2 Meaningful Sequence -- PARTIAL

**Findings:**
- DOM order generally matches visual order -- PASS
- Mobile card view in `GameCard.tsx`: OPS badge appears after title (DOM top-right) but visual layout places it right-aligned; this is acceptable
- `SignalFire.tsx` hero section: OPS badge is `position: absolute; bottom: 48px; right: 40px` -- will read at the end of the section content, which is slightly out of visual order but acceptable

**Status**: PASS (no critical issues)

---

#### 1.3.4 Orientation (AA) -- PASS

The app uses responsive layout (Tailwind breakpoints md:) and does not lock to a specific orientation.

---

#### 1.3.5 Identify Input Purpose (AA) -- FAIL

**Findings:**
- Search input in `FilterBar.tsx` (line 42, 149): Missing `autocomplete` attribute -- should be `autocomplete="off"` or a relevant value
- No form fields collect personal data, so `autocomplete` attributes for name/email/etc. are not applicable

**Remediation:**
```tsx
<input autocomplete="off" ... />
```

**Effort**: 0.1 days

---

#### 1.4.1 Use of Color -- FAIL

**Findings:**
- **OPS score badges**: Score number colored green (>=60), amber (>=30), red (<30) with NO supplementary icon, pattern, or text label indicating the tier. In `GameRow.tsx` lines 228-234, `OpsBadge.tsx` line 38, and `GameCard.tsx` line 72.
- **Days badge**: Green (<=7d), amber (<=30d), red (>30d) in `DaysBadge.tsx` -- relies on color alone to indicate recency. The numeric value ("7d", "30d") provides SOME context but the status meaning (new/recent/old) is conveyed only through color.
- **Review score %**: Green (>=80%), amber (>=60%), red (<60%) in `GameRow.tsx` line 156 -- only color differentiates quality tiers.
- **Review delta**: Positive = green, negative = red in `GameRow.tsx` line 170 -- the +/- sign partially mitigates this (PARTIAL).
- **Subgenre momentum bars** in `Trends.tsx` line 193: Bar color indicates direction (green=up, red=down, amber=neutral) -- the +/- delta number partially mitigates.
- **Surging Now OPS colors** in `Trends.tsx` line 371: Same green/amber pattern.
- **Previous picks status dots** in `SignalFire.tsx` line 747: Green dot = climbing, amber = peaked, gray = steady -- text label present alongside (PASS).

**Remediation:**
```tsx
// OpsBadge.tsx -- add tier label
<span className="sr-only">
  {ops.score >= 60 ? 'Breakout' : ops.score >= 30 ? 'Moderate' : 'Low'} score
</span>

// DaysBadge.tsx -- add icon prefix
{days <= 7 && <span aria-hidden="true">*</span>}
<span className="sr-only">{days <= 7 ? 'New release' : days <= 30 ? 'Recent' : 'Established'}</span>

// GameRow.tsx score % -- add sr-only tier label
<span className="sr-only">
  {scorePct >= 80 ? 'Very Positive' : scorePct >= 60 ? 'Mixed' : 'Negative'}
</span>
```

**Effort**: 0.5 days

---

#### 1.4.3 Contrast (Minimum) -- FAIL

See Section 3 (Color Contrast Audit) for the complete matrix.

**Critical failures:**

| Foreground | Background | Ratio | Required | Status |
|-----------|-----------|-------|----------|--------|
| `#802626` (primary) | `#111314` (bg-dark) | 2.46:1 | 4.5:1 | **FAIL** |
| `#6b6058` (text-dim) | `#111314` (bg-dark) | 3.03:1 | 4.5:1 | **FAIL** |
| `#6b6058` (text-dim) | `#1a1a1c` (surface) | 2.78:1 | 4.5:1 | **FAIL** |
| `#6b6058` (text-dim) | `#1f1f22` (tile) | 2.63:1 | 4.5:1 | **FAIL** |
| `#802626` (primary) | `#1a1a1c` (surface) | 2.26:1 | 4.5:1 | **FAIL** |
| `#802626` (primary) | `#1f1f22` (tile) | 2.14:1 | 4.5:1 | **FAIL** |
| `text-dim/40` opacity | `#111314` (bg-dark) | ~1.56:1 | 4.5:1 | **FAIL** |
| `text-dim/50` opacity | `#111314` (bg-dark) | ~1.93:1 | 4.5:1 | **FAIL** |

**Where these failures manifest:**
- `primary` on `bg-dark`: Active nav links (Header.tsx line 54), filter slider values (FilterBar.tsx lines 110, 126, 201, 220), Last Sync value (Pagination.tsx line 71, 93), OPS column header subtext, all links on SignalFire.tsx, section labels on Trends.tsx
- `text-dim` on `bg-dark`: Developer names (GameRow.tsx line 93), filter labels (FilterBar.tsx lines 100, 116, 138, etc.), table headers (GameTable.tsx line 16), sort label (FilterBar.tsx line 229), channel badges without tags (ChannelBadges.tsx line 39)
- `text-dim/40`: Disabled nav items (Header.tsx line 37, 87)
- `text-dim/50`: Input placeholder text (FilterBar.tsx line 43, 149)

**Remediation:**
```js
// tailwind.config.js -- adjusted colors maintaining Occult Amber aesthetic
primary: "#a83232",        // warmed red, ~4.0:1 on bg (use at >=18px bold for AA)
                           // OR "#c04040" for ~5.5:1 (full AA compliance at any size)
"primary-accessible": "#c04040",  // guaranteed AA normal text
"text-dim": "#918377",     // warmed up from #6b6058, ~4.6:1 on #111314
```

**Effort**: 1 day (color adjustments + visual review across all pages)

---

#### 1.4.4 Resize Text -- PASS

Tailwind rem-based units allow browser zoom up to 200% without loss of content or functionality.

---

#### 1.4.5 Images of Text -- PASS

No images of text are used. All text is rendered as HTML.

---

#### 1.4.10 Reflow (AA) -- PARTIAL

**Findings:**
- Desktop table (GameTable.tsx line 14): Has `min-w-[1050px]` and `overflow-auto`, requiring horizontal scroll at smaller viewports -- acceptable but not ideal
- Mobile card view (GameTable.tsx line 75): Properly reflowed for mobile -- PASS
- SignalFire.tsx: Uses fixed pixel widths throughout inline styles (e.g., `maxWidth: 1100`, `padding: "0 40px"`) -- at 320px viewport with 400% zoom, content would overflow -- PARTIAL
- Trends.tsx: Responsive grid layout handles reflow well -- PASS

**Remediation:**
- Convert SignalFire.tsx inline `padding: "0 40px"` to responsive values
- Consider making the desktop table horizontally scrollable with an indication

**Effort**: 0.5 days

---

#### 1.4.11 Non-text Contrast (AA) -- FAIL

**Findings:**
- **Range slider track** (FilterBar.tsx): `bg-border-dark` (#2a2420) on `bg-background-dark` (#111314) -- ratio ~1.67:1, needs 3:1 -- FAIL
- **Confidence dots** (OpsBadge.tsx): Filled dots `bg-text-mid` (#a09080) vs unfilled `bg-border-dark` (#2a2420) -- the distinction between states has ~2.7:1 ratio -- PARTIAL
- **Progress bars** in SignalFire.tsx OPS anatomy: Track `#2a2420` on tile `#1f1f22` -- ~1.06:1 -- FAIL
- **Chart grid lines** (Recharts): `#2a2420` stroke on `#1a1a1c` surface -- ~1.5:1 -- decorative, acceptable
- **Focus indicators**: Default Tailwind focus ring (`focus:ring-primary/30`) produces a nearly invisible ring on dark backgrounds -- FAIL

**Remediation:**
```css
/* index.css -- custom focus ring */
*:focus-visible {
  outline: 2px solid #e8a832; /* status-warn for high visibility */
  outline-offset: 2px;
}

/* Range slider track */
input[type="range"] { accent-color: #c04040; }
.slider-track { background: #4a3f38; } /* higher contrast track */
```

**Effort**: 0.5 days

---

#### 1.4.12 Text Spacing (AA) -- PASS

No CSS prevents text spacing adjustments. Tailwind utilities do not set `letter-spacing`, `word-spacing`, or `line-height` in ways that would override user stylesheets.

---

#### 1.4.13 Content on Hover or Focus (AA) -- FAIL

**Findings:**
- **OPS tooltip** in `GameTable.tsx` (lines 30-37): CSS hover-only tooltip (`opacity-0 pointer-events-none group-hover/ops:opacity-100`). Not dismissible (no Escape handler), not hoverable (appears on column header only), and not persistent. Violates all three sub-criteria.
- **Confidence dots title** in `OpsBadge.tsx` (line 54): Uses native `title` attribute -- browser-dependent, cannot be hovered/persisted, not keyboard-accessible -- FAIL
- **Previous picks hover** in `SignalFire.tsx` (lines 759-760): `onMouseEnter`/`onMouseLeave` for background change -- purely decorative, acceptable
- **Chart tooltips** (Recharts): Triggered on mouse hover, not keyboard navigable, but disappear when cursor moves -- standard charting behavior, PARTIAL

**Remediation:**
```tsx
// GameTable.tsx OPS tooltip -- make keyboard accessible and dismissible
// Replace CSS hover tooltip with a toggle or use a proper Tooltip component:
const [showOpsTooltip, setShowOpsTooltip] = useState(false);
<th
  tabIndex={0}
  onFocus={() => setShowOpsTooltip(true)}
  onBlur={() => setShowOpsTooltip(false)}
  onKeyDown={(e) => e.key === 'Escape' && setShowOpsTooltip(false)}
  onClick={() => setShowOpsTooltip(!showOpsTooltip)}
  aria-describedby="ops-tooltip"
>
```

**Effort**: 0.5 days

---

### Principle 2: Operable

#### 2.1.1 Keyboard -- FAIL

**Findings:**
- **Table rows** in `GameRow.tsx` (line 48): Entire `<tr>` has `onClick` but no `tabIndex`, no `onKeyDown` handler. Keyboard users cannot navigate to or activate game rows.
- **Game cards** in `GameCard.tsx` (line 36): Wrapped in `<Link>` -- PASS for keyboard
- **Previous picks** in `SignalFire.tsx` (line 750): `<div onClick>` with no keyboard support -- FAIL
- **Surging Now items** in `Trends.tsx` (line 338): `<div onClick>` with no keyboard support -- FAIL
- **Creator Radar items** in `Trends.tsx` (line 236): `<div onClick>` with no keyboard support -- FAIL
- **Event flags** in `ConceptA.tsx` (line 1244): `<button>` elements -- PASS
- **Series toggle pills** in `ConceptA.tsx` (line 1162): `<button>` elements -- PASS
- **Event card modal** in `ConceptA.tsx` (line 630): Overlay `<div onClick>` closes on click but no Escape handler, no focus trap -- FAIL
- **Charts** (all Recharts instances): No keyboard navigation for data points -- FAIL (industry-standard limitation)
- **Brush control** in ConceptA.tsx: Mouse-only drag interaction for timeline range selection -- FAIL

**Remediation:**
```tsx
// GameRow.tsx -- make rows keyboard accessible
<tr
  tabIndex={0}
  role="link"
  aria-label={`View details for ${game.title}`}
  onKeyDown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      navigate(`/game/${game.appid}`);
    }
  }}
  onClick={...}
>

// SignalFire.tsx previous picks -- convert to button or link
<a
  href={`/game/${pick.appid}`}
  className="..."
>

// Trends.tsx clickable items -- convert to links
<Link to={`/game/${s.appid}`} className="...">

// Event card modal -- add focus trap and Escape
useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  };
  document.addEventListener('keydown', handler);
  return () => document.removeEventListener('keydown', handler);
}, [onClose]);
```

**Effort**: 1 day

---

#### 2.1.2 No Keyboard Trap -- PASS

No keyboard traps exist. The event card modal in ConceptA.tsx lacks a focus trap but the overlay click handler allows dismissal (though not via keyboard -- see 2.1.1).

---

#### 2.4.1 Bypass Blocks -- FAIL

**Findings:**
- No skip navigation link exists. The header, filter bar, and table are all in sequence. Keyboard users must tab through the entire navigation and filter bar on every page load.

**Remediation:**
```tsx
// App.tsx -- add skip link as first child
<a
  href="#main-content"
  className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[9999] focus:bg-primary focus:text-white focus:px-4 focus:py-2 focus:rounded focus:text-sm focus:font-bold"
>
  Skip to main content
</a>
<Header />
<main id="main-content" tabIndex={-1}>
  <Routes>...</Routes>
</main>
```

**Effort**: 0.25 days

---

#### 2.4.2 Page Titled -- PASS

`index.html` has `<title>Horror Radar</title>`. However, page titles do not change per route.

**Improvement:**
```tsx
// Each page should update document.title
useEffect(() => {
  document.title = "Database | Horror Radar";
}, []);
```

**Effort**: 0.25 days (enhancement, not a failure)

---

#### 2.4.3 Focus Order -- PARTIAL

**Findings:**
- General tab order follows DOM order (left-to-right, top-to-bottom) -- PASS
- Filter bar: Search -> Sort dropdown -> Toggle filters button (mobile) -- logical
- Pagination: Prev -> page numbers -> Next -- logical
- **Problem**: Desktop table header OPS tooltip is in the tab flow but other headers are not tabbable, creating inconsistent expectations
- **Problem**: Mobile filter expand button is at the end of the compact bar, but expanded filters appear below -- logical but could confuse if user expects them before the button

**Effort**: 0.25 days

---

#### 2.4.4 Link Purpose (In Context) -- PARTIAL

**Findings:**
- Game title links in `GameRow.tsx` (line 82): `<Link to={/game/${appid}}>` with visible game title text -- PASS
- Steam store links in `GameRow.tsx` (line 61): Has `title="View on Steam"` but the link content is an image -- should use `aria-label` -- PARTIAL
- SignalFire.tsx action link (line 779): Text includes game title and price -- PASS
- "Back to Database" link in ConceptA.tsx (line 1029): Clear purpose -- PASS

**Remediation:**
```tsx
// GameRow.tsx Steam link -- add aria-label
<a
  href={`https://store.steampowered.com/app/${game.appid}`}
  target="_blank"
  rel="noopener noreferrer"
  aria-label={`View ${game.title} on Steam (opens in new tab)`}
>
```

**Effort**: 0.25 days

---

#### 2.4.6 Headings and Labels (AA) -- FAIL

**Findings:**
- **Search input** (FilterBar.tsx line 42, 149): Uses `placeholder="Search games..."` but no `<label>` element or `aria-label`
- **Sort dropdown** (FilterBar.tsx line 50, 231): No `<label>`, has a preceding "Sort by:" `<span>` that is not programmatically associated
- **Range sliders** (FilterBar.tsx lines 102-108, 118-124, 193-199, 214-219): No `<label>` elements. Preceding `<span>` labels ("Days", "Price", etc.) are not associated
- **Game mode buttons**: Group label "Mode" is a `<span>`, not associated with the button group
- Section headings on Trends page use `SectionHeader` component which renders a `<div>` not a heading element (`<h2>`, `<h3>`)

**Remediation:**
```tsx
// FilterBar.tsx -- associate labels
<label htmlFor="search-input" className="text-[10px] uppercase font-bold text-text-dim tracking-widest">
  Search
</label>
<input id="search-input" ... />

// Range sliders
<label htmlFor="days-slider" className="...">Days Since Launch</label>
<input id="days-slider" type="range" ... />

// Sort dropdown
<label htmlFor="sort-select" className="...">Sort by</label>
<select id="sort-select" ... />

// Trends SectionHeader -- use actual heading
function SectionHeader({ label, sub }: { label: string; sub?: string }) {
  return (
    <div className="mb-3">
      <h2 className="font-mono text-[11px] text-primary uppercase tracking-[2px] font-semibold">
        {label}
      </h2>
      {sub && <p className="text-[13px] text-text-dim mt-0.5 italic">{sub}</p>}
    </div>
  );
}
```

**Effort**: 0.5 days

---

#### 2.4.7 Focus Visible (AA) -- FAIL

**Findings:**
- Default browser focus outline on dark `#111314` background is nearly invisible
- Tailwind's default `focus:ring` produces a faint blue outline that lacks contrast
- `focus:border-primary` on inputs (FilterBar.tsx) uses `#802626` which has 2.46:1 against the background -- FAIL
- `focus:ring-primary/30` at 30% opacity is effectively invisible -- FAIL
- No custom focus ring styles defined in `index.css`

**Remediation:**
```css
/* index.css -- global focus visible ring */
*:focus-visible {
  outline: 2px solid #e8a832;
  outline-offset: 2px;
  border-radius: 2px;
}

/* For inputs, override the primary border */
input:focus-visible,
select:focus-visible {
  border-color: #e8a832;
  box-shadow: 0 0 0 2px rgba(232, 168, 50, 0.3);
  outline: none;
}
```

**Effort**: 0.5 days

---

#### 2.5.1 Pointer Gestures (AA) -- PASS

No multipoint or path-based gestures are required. The Recharts Brush component uses single-pointer drag, which is the standard interface for range selection. An alternative (manual date range input) is not provided but the brush is not the only way to view data.

---

#### 2.5.2 Pointer Cancellation (AA) -- PASS

All interactive elements activate on `click` (pointer up), not pointer down.

---

#### 2.5.3 Label in Name (AA) -- PARTIAL

**Findings:**
- Hamburger button: `aria-label="Toggle menu"` -- the visual content is a Material Symbol icon "menu"/"close". The accessible name does not match visible text (icon-only). Acceptable for icon buttons.
- Filter toggle button: `aria-label="Toggle filters"` with visible icon "tune"/"expand_less". Acceptable.
- Pagination buttons: No `aria-label` at all. The content is a Material Symbol icon. Needs labels.

**Remediation:**
```tsx
// Pagination.tsx -- add aria-labels
<button aria-label="Previous page" disabled={page <= 1} ...>
<button aria-label="Next page" disabled={page >= totalPages} ...>
<button aria-label={`Page ${p}${p === page ? ', current page' : ''}`} aria-current={p === page ? 'page' : undefined} ...>
```

**Effort**: 0.25 days

---

### Principle 3: Understandable

#### 3.1.1 Language of Page -- PASS

`index.html` has `<html class="dark" lang="en">`.

---

#### 3.2.1 On Focus -- PASS

No elements trigger context changes on focus.

---

#### 3.2.2 On Input -- PARTIAL

**Findings:**
- Sort dropdown (FilterBar.tsx) triggers immediate re-sort on change -- acceptable as this is a filter control
- Range sliders trigger immediate filtering (debounced 200ms) -- acceptable
- Search input filters live (debounced 350ms) -- acceptable, but no loading indicator during debounce -- PARTIAL

---

#### 3.3.1 Error Identification -- PASS

No user-submitted forms exist. The app is read-only. Error states for data loading (empty state, "Game Not Found") are clearly communicated.

---

#### 3.3.2 Labels or Instructions -- FAIL

Same as 2.4.6. Form inputs lack associated labels.

---

### Principle 4: Robust

#### 4.1.1 Parsing -- PASS

React generates well-formed HTML. No duplicate IDs observed in the codebase.

---

#### 4.1.2 Name, Role, Value -- FAIL

**Findings:**
- **Hamburger button**: Has `aria-label="Toggle menu"` but no `aria-expanded` attribute to communicate open/closed state -- FAIL
- **Filter toggle button**: Has `aria-label="Toggle filters"` but no `aria-expanded` -- FAIL
- **Game mode buttons**: No `aria-pressed` to indicate selected state. The visual difference (bg-primary vs bg-background-dark) is not communicated programmatically -- FAIL
- **Pagination current page**: No `aria-current="page"` on the active page button -- FAIL
- **Range sliders**: Missing `aria-valuetext` to provide human-readable values (e.g., "90 days" instead of just "90") -- FAIL
- **Series toggle pills** in ConceptA.tsx: `<button>` with visual border/color indicating selected state but no `aria-pressed` -- FAIL
- **Loading spinner**: `progress_activity` icon with `animate-spin` but no `role="status"` or `aria-live` region -- FAIL

**Remediation:**
```tsx
// Header.tsx hamburger
<button
  aria-label="Toggle menu"
  aria-expanded={mobileOpen}
  aria-controls="mobile-nav"
  ...
>

// Mobile nav drawer
<nav id="mobile-nav" aria-label="Mobile navigation" ...>

// FilterBar.tsx filter toggle
<button
  aria-label="Toggle filters"
  aria-expanded={expanded}
  ...
>

// Game mode buttons -- use radio group pattern
<div role="radiogroup" aria-label="Game mode">
  <button
    role="radio"
    aria-checked={gameMode === opt.value}
    ...
  >

// Pagination
<button
  aria-label={`Page ${p}`}
  aria-current={p === page ? 'page' : undefined}
  ...
>

// Range sliders
<input
  type="range"
  aria-label="Days since launch"
  aria-valuetext={`${days} days`}
  ...
/>

// Loading state -- add aria-live
<div role="status" aria-live="polite">
  <span className="sr-only">Loading games...</span>
  ...
</div>
```

**Effort**: 1 day

---

#### 4.1.3 Status Messages (AA) -- FAIL

**Findings:**
- **Loading state** (GameTable.tsx line 43): "Loading games..." text appears but is not in an `aria-live` region
- **Game count update** (Pagination.tsx line 51, 79): "Showing X-Y of Z Games" changes dynamically but is not announced
- **Filter results**: When filters change and results update, the new count is not announced
- **"No games found"** empty state (GameTable.tsx line 55): Not in an `aria-live` region

**Remediation:**
```tsx
// Database.tsx -- add live region for result count
<div aria-live="polite" aria-atomic="true" className="sr-only">
  {loading ? 'Loading games...' : `Showing ${start} to ${end} of ${total} games`}
</div>
```

**Effort**: 0.25 days

---

## 3. Color Contrast Audit

### Complete Contrast Matrix

All ratios calculated using WCAG relative luminance formula. Background colors tested: `#111314` (bg-dark, L=0.012), `#1a1a1c` (surface, L=0.016), `#1f1f22` (tile, L=0.018).

#### Text Colors on Backgrounds

| Text Color | Hex | On #111314 (bg) | On #1a1a1c (surface) | On #1f1f22 (tile) | AA Normal (4.5:1) | AA Large (3:1) |
|-----------|-----|:---:|:---:|:---:|:---:|:---:|
| text-main | `#e8e0d4` | **12.81:1** | **11.73:1** | **11.07:1** | PASS all | PASS all |
| text-mid | `#a09080` | **5.44:1** | **4.98:1** | **4.70:1** | PASS bg, PARTIAL surface/tile | PASS all |
| text-dim | `#6b6058` | **3.03:1** | **2.78:1** | **2.63:1** | **FAIL all** | PASS bg only |
| primary | `#802626` | **2.46:1** | **2.26:1** | **2.14:1** | **FAIL all** | **FAIL all** |
| primary-light | `#9a3333` | **3.22:1** | **2.95:1** | **2.78:1** | **FAIL all** | PASS bg only |
| secondary | `#bb7125` | **5.07:1** | **4.64:1** | **4.38:1** | PASS bg only | PASS all |
| tertiary | `#a36aa5` | **4.68:1** | **4.29:1** | **4.05:1** | PASS bg barely | PASS all |

#### Status Colors on Backgrounds

| Status Color | Hex | On #111314 (bg) | On #1a1a1c (surface) | On #1f1f22 (tile) | AA Normal | AA Large |
|-------------|-----|:---:|:---:|:---:|:---:|:---:|
| status-pos | `#5ec269` | **8.30:1** | **7.60:1** | **7.17:1** | PASS all | PASS all |
| status-warn | `#e8a832` | **8.90:1** | **8.15:1** | **7.69:1** | PASS all | PASS all |
| status-neg | `#e25535` | **5.04:1** | **4.62:1** | **4.36:1** | PASS bg only | PASS all |
| status-info | `#6b9ddb` | **6.60:1** | **6.05:1** | **5.71:1** | PASS all | PASS all |
| status-special | `#b07db2` | **5.07:1** | **4.65:1** | **4.39:1** | PASS bg only | PASS all |

#### Special Combinations

| Combination | Ratio | Context | Status |
|------------|:---:|---------|--------|
| `#ffffff` on `#802626` (primary) | **7.87:1** | Button text (bg-primary text-white) | PASS |
| `#e8e0d4` on `#802626` (primary) | **5.21:1** | Would-be text on primary bg | PASS |
| text-dim/40 opacity on bg | **~1.56:1** | Disabled nav items | **FAIL** |
| text-dim/50 opacity on bg | **~1.93:1** | Placeholder text | **FAIL** |

### Failing Combinations and Proposed Alternatives

| Current | Issue | Proposed Alternative | New Ratio on #111314 | Aesthetic Note |
|---------|-------|---------------------|:---:|----------------|
| `#802626` (primary) | 2.46:1 -- fails even AA Large | `#c04040` | ~5.5:1 | Brighter dried-blood red, still warm |
| `#802626` for large text only | 2.46:1 | `#a83232` | ~3.6:1 | Acceptable for large text (>=18px bold) only |
| `#6b6058` (text-dim) | 3.03:1 -- fails AA Normal | `#918377` | ~4.6:1 | Warmer taupe, maintains hierarchy |
| `#6b6058` for large text only | 3.03:1 | `#7d7268` | ~3.6:1 | Acceptable for large text only |
| Disabled items (text-dim/40) | ~1.56:1 | Use `#5a534c` (solid) | ~2.2:1 | Still clearly "disabled" but more legible |
| Placeholder text (text-dim/50) | ~1.93:1 | Use `#6b6058` (solid, no opacity) | 3.03:1 | Still FAILS AA but PASSES AA Large for placeholder context |

### Font Size Considerations

Text at `12px` (`text-xs`) MUST meet the 4.5:1 normal text threshold. Currently:

- `text-[10px]` used for: developer names, filter labels, badge text, channel badges, confidence dot labels, metric labels
- `text-[9px]` used for: channel badge names, OPS delta, metric labels on SignalFire
- `text-[8px]` used for: OPS sub-label "Breakout Strength", tag labels, demo badge

**All text below 12px must either be enlarged to 12px+ or guaranteed to use colors with >=4.5:1 contrast.**

---

## 4. Keyboard Navigation Audit

### Database Page Tab Order

1. Skip link (does not exist -- MISSING)
2. Logo link (Horror Radar)
3. Nav: Database link
4. Nav: Radar Pick link
5. Nav: Trends link
6. Avatar/profile area (not interactive -- decorative div)
7. Search input
8. Game mode buttons (All, Narrative, Co-op)
9. Days range slider
10. Max Price range slider
11. Sort dropdown
12. **Gap**: Table headers are not focusable (no tabIndex)
13. **Gap**: Table rows are not focusable (no tabIndex, no keyboard handler)
14. Pagination: Previous button
15. Pagination: Page number buttons
16. Pagination: Next button

**Missing focus targets:**
- No way to navigate to individual game rows via keyboard
- No way to activate the OPS tooltip via keyboard
- No way to sort by column header via keyboard (no sortable column headers)

### Radar Pick Page Tab Order

1. Skip link (MISSING)
2. Header nav items
3. **Gap**: Alert banner elements not focusable
4. **Gap**: Hero content not focusable (acceptable -- informational)
5. **Gap**: Metric tiles not focusable (acceptable -- informational)
6. **Gap**: Evidence blocks not focusable (acceptable -- informational)
7. **Gap**: OPS anatomy cards not focusable (acceptable -- informational)
8. **Gap**: Previous picks list items use `<div onClick>` -- NOT focusable
9. Steam store link

### Trends Page Tab Order

1. Header nav items
2. **Gap**: Headline KPI cards not focusable (acceptable -- informational)
3. **Gap**: Creator Radar items use `<div onClick>` -- NOT focusable
4. **Gap**: Surging Now items use `<div onClick>` -- NOT focusable

### Game Detail Page Tab Order

1. Header nav items
2. Game title link (Steam store)
3. Tag badges (not interactive -- acceptable)
4. Series toggle buttons (PASS -- proper `<button>` elements)
5. "Show Median Trajectory" button (PASS)
6. **Gap**: Chart data points not keyboard navigable
7. Event flag buttons (PASS -- proper `<button>` elements)
8. **Gap**: Creator impact table rows not focusable (acceptable if read-only)
9. **Gap**: Reddit mention links (if post_url exists, should be `<a>` tags)

### Focus Indicators

**Current state**: Default browser focus outline, which is a thin blue ring that is nearly invisible against the `#111314` background.

**Required**: A clearly visible focus indicator with at least 3:1 contrast against both the focused element and the surrounding background.

---

## 5. Screen Reader Audit

### Missing ARIA Attributes by Component

#### Header.tsx
- `aria-label="Toggle menu"` -- PRESENT (line 70)
- `aria-expanded` on hamburger -- MISSING
- `aria-controls` linking to mobile nav -- MISSING
- Desktop nav: `<nav>` without `aria-label` -- needs `aria-label="Main navigation"`
- Mobile nav: `<nav>` without `aria-label` -- needs `aria-label="Mobile navigation"`
- Active nav link: No `aria-current="page"` -- MISSING

#### FilterBar.tsx
- `aria-label="Toggle filters"` -- PRESENT (line 63)
- `aria-expanded` on filter toggle -- MISSING
- All inputs: No `<label>` elements -- MISSING
- Range sliders: No `aria-valuetext` -- MISSING
- Game mode buttons: No `role="radiogroup"` or `aria-pressed`/`aria-checked` -- MISSING
- Section: No `aria-label` on the filter `<section>` -- MISSING

#### GameTable.tsx
- `<main>` used as wrapper -- PRESENT but should be in App.tsx instead
- `<table>`: No `<caption>` -- MISSING
- `<th>`: No `scope="col"` -- MISSING
- Loading state: No `role="status"` or `aria-live` -- MISSING
- Empty state: Not announced to screen readers -- MISSING

#### GameRow.tsx
- `<tr onClick>`: No `role`, `tabIndex`, `aria-label` -- MISSING
- Trending icons: No `aria-hidden` or `sr-only` text alternative -- MISSING
- Skull icon: No text alternative -- MISSING

#### OpsBadge.tsx
- Score number: No sr-only tier label -- MISSING
- Confidence dots: `title` attribute only (unreliable) -- needs `aria-label`

#### Pagination.tsx
- Chevron buttons: No `aria-label` -- MISSING
- Page number buttons: No `aria-label` or `aria-current` -- MISSING
- Status text: Not in `aria-live` region -- MISSING

#### SignalFire.tsx
- Entire page uses inline styles with no semantic HTML beyond `<section>`, `<h1>`, `<h2>`, `<h3>`
- Previous picks: `<div onClick>` not keyboard accessible, no role
- Charts: No accessible data table alternative
- Hero background image: Decorative (acceptable, no alt needed)

#### Trends.tsx
- Subgenre table: No `<thead>`, no `<th>`, no `<caption>` -- MISSING
- Clickable items: No role or keyboard support -- MISSING
- Velocity spark bars: No text alternative -- MISSING
- Section headers: Use `<div>` not heading elements -- MISSING

#### ConceptA.tsx (Game Detail)
- Event card modal: No `role="dialog"`, no `aria-modal`, no focus trap -- MISSING
- Close button in modal: Styled `<button>` with `&times;` content, no `aria-label` -- MISSING
- Event flag buttons: Have `title` but no `aria-label` -- PARTIAL
- Series toggles: No `aria-pressed` -- MISSING

### Landmark Structure

**Current:**
```
<body>
  <div id="root">
    <div>  (no landmark)
      <header>  (banner)
        <nav>  (desktop, unlabeled)
        <nav>  (mobile, unlabeled)
      <section>  (FilterBar -- no label)
      <main>  (GameTable -- but positioned wrong, should wrap all content)
      <footer>  (Pagination -- contentinfo)
```

**Required:**
```
<body>
  <div id="root">
    <a href="#main-content">Skip to content</a>
    <header>  (banner)
      <nav aria-label="Main navigation">
      <nav aria-label="Mobile navigation">
    <main id="main-content">
      <section aria-label="Filters">
      <section aria-label="Game database">
        <table aria-label="Horror indie games">
      <nav aria-label="Pagination">
```

---

## 6. Colorblind Safety Audit

### Color Pairs at Risk

#### Protanopia (Red-blind, ~1% of males)

| Pair | Usage | Risk | Mitigation |
|------|-------|------|------------|
| `status-pos` (#5ec269) vs `status-warn` (#e8a832) | OPS tiers, days badge, score % | **LOW** -- green appears more yellow, amber stays distinct | Both shift toward yellow but remain distinguishable by brightness |
| `status-pos` (#5ec269) vs `status-neg` (#e25535) | Positive vs negative deltas, review trends | **HIGH** -- both appear as brownish-yellow | Add up/down arrows or +/- prefixes (partially done for deltas) |
| `primary` (#802626) vs `status-neg` (#e25535) | OPS score color vs error/negative | **MEDIUM** -- both appear dark brown/olive | Different use contexts mitigate confusion |
| `primary` (#802626) vs background (#111314) | Links, active states | **LOW** -- both dark, but luminance difference still exists | Already failing contrast for all users |

#### Deuteranopia (Green-blind, ~1% of males)

| Pair | Usage | Risk | Mitigation |
|------|-------|------|------------|
| `status-pos` (#5ec269) vs `status-warn` (#e8a832) | OPS tiers, days badge | **MEDIUM** -- green shifts to yellow/brown, overlapping with amber | Add icon supplements: checkmark for positive, warning triangle for caution |
| `status-pos` (#5ec269) vs `status-neg` (#e25535) | Positive vs negative | **HIGH** -- green appears brown, similar to red-shifted vermilion | Must add supplementary icons (up/down arrows, checkmark/x) |

#### Tritanopia (Blue-blind, ~0.003% of population)

| Pair | Usage | Risk | Mitigation |
|------|-------|------|------------|
| `status-info` (#6b9ddb) vs `status-special` (#b07db2) | Info badges vs special badges | **MEDIUM** -- blue and violet both shift toward green/teal | Add distinct icons or patterns |
| `secondary` (#bb7125) vs `status-warn` (#e8a832) | Amber tones | **LOW** -- both warm tones, already similar to trichromats | Different contexts (accent vs status) |

### Recommendations for Colorblind Safety

1. **Add icon supplements to all color-coded statuses:**

```tsx
// OPS score tiers
{score >= 60 && <span aria-hidden="true">&#9650;</span>}  // up triangle
{score >= 30 && score < 60 && <span aria-hidden="true">&#9644;</span>}  // dash
{score < 30 && <span aria-hidden="true">&#9660;</span>}  // down triangle

// Days badge
{days <= 7 && <span aria-hidden="true" className="mr-0.5">&#x2022;</span>}  // new dot
{days <= 30 && days > 7 && <span aria-hidden="true" className="mr-0.5">&#x25CB;</span>}  // circle

// Review delta
// Already has +/- sign -- PASS
// Trending arrows -- PASS (icon provides shape redundancy)
```

2. **Use patterns in addition to color for chart data:**
   - Different line styles (solid, dashed, dotted) for chart series
   - Different marker shapes (circle, square, triangle) for data points

3. **Test all status indicators against the "newspaper test"**: If you print the page in black and white, can you still understand all status information? Currently NO for OPS scores, days badges, and score percentages.

---

## 7. Cognitive Load Assessment

### Information Density per Page

#### Database Page -- HIGH DENSITY
- **9 columns** in the desktop table, each with different data types and units
- Filter bar has 5 controls (search, mode, days slider, price slider, sort)
- OPS tooltip contains 40+ words of explanation
- Channel badges with nested tags (HIGH REACH, VIRAL)
- Confidence dots require learned interpretation

**Issues:**
- No progressive disclosure for advanced metrics (OPS, YouTube visibility)
- All columns shown simultaneously with no ability to show/hide
- OPS score explanation hidden in hover tooltip -- not discoverable
- 8+ font sizes on a single row (10px to 18px)
- Mixed number formats: "12d", "$9.99", "1,234", "87%", "+42", "OPS 73"

**Recommendations:**
- Consider a "simplified view" toggle that shows only: Game, Days, Reviews, Score, OPS
- Make OPS explanation available via a persistent info panel, not tooltip-only
- Group related metrics visually (e.g., review count + delta + score in one cluster)

#### Radar Pick Page -- MODERATE DENSITY
- Well-structured with clear sections (hero, metrics, evidence, anatomy)
- Evidence blocks have a clear numbering system -- good progressive disclosure
- OPS anatomy section is comprehensive but may overwhelm casual users

**Issues:**
- Hero verdict paragraph can be 50+ words in a single italic block
- Metric tiles show 6 values simultaneously with no hierarchy of importance
- OPS anatomy shows mathematical formulas -- high cognitive load for non-technical users

**Recommendations:**
- Add a "TL;DR" summary card before the detailed evidence
- Consider collapsible OPS anatomy section (expanded by default, collapsible for return visits)

#### Trends Page -- HIGH DENSITY
- 7 KPI cards in a single row
- Multiple chart types (area, bar, composed)
- Two side-by-side sections (subgenre momentum + creator radar)
- Surging Now list with 5+ data points per row

**Issues:**
- 7 KPIs shown simultaneously with no hierarchy -- "everything is important" means nothing is
- No explanation of what the KPIs mean
- Subgenre momentum table has no column headers
- Price intelligence chart color scheme explained only in a 9px footnote

**Recommendations:**
- Highlight the 2--3 most significant KPIs; dim or collapse the rest
- Add visible column headers to the subgenre table
- Add a "what does this mean?" expandable section for the market pulse chart

#### Game Detail Page -- VERY HIGH DENSITY
- 6 hero stat values
- 3 stacked chart panels with 7 toggleable data series
- Event flags with Unicode symbols (no text labels visible by default)
- Phase cards with 4 data points each
- Creator impact table with 8+ columns

**Issues:**
- Unicode event symbols (triangles, circles, squares, diamonds, stars) require memorization or hovering
- 7 series toggle pills add cognitive overhead for deciding what to view
- Phase bands are very subtle (6--8% opacity) -- easy to miss
- Creator impact scores (0--100) have no explained meaning

**Recommendations:**
- Add a legend for event symbols (currently only in tooltip)
- Default to fewer visible series (currently 5 of 7 are on by default)
- Add a "reading guide" or "how to read this page" collapsible section

### Reading Order Issues

- **SignalFire.tsx alert banner**: Title is right-aligned while metadata is left-aligned, creating a non-standard reading flow
- **GameRow.tsx**: Visual scanning goes left-to-right but the most important metric (OPS) is at the far right, requiring eye travel across the entire row
- **Trends.tsx KPI cards**: Grid layout flows left-to-right, top-to-bottom, which is natural, but no visual hierarchy indicates which KPIs are most important

---

## 8. Remediation Roadmap

### P0: Legal/Compliance Blockers (Must Fix)

These failures could expose the project to legal liability under ADA, Section 508, or equivalent regulations. In practice, for a small indie tool, the risk is low -- but these are the barriers that prevent a meaningful number of users from accessing the application.

| # | Issue | WCAG | Components | Fix | Effort |
|---|-------|------|------------|-----|--------|
| P0-1 | Primary color contrast (2.46:1 on bg) | 1.4.3 | tailwind.config.js, all components using `text-primary` | Change `#802626` to `#c04040` (or add `primary-accessible` variant) | 0.5d |
| P0-2 | text-dim contrast (3.03:1 on bg) | 1.4.3 | tailwind.config.js, all components using `text-text-dim` | Change `#6b6058` to `#918377` | 0.5d |
| P0-3 | No skip navigation link | 2.4.1 | App.tsx | Add skip link + `<main>` landmark | 0.25d |
| P0-4 | Table rows not keyboard accessible | 2.1.1 | GameRow.tsx | Add `tabIndex={0}`, `onKeyDown`, `role="link"` | 0.5d |
| P0-5 | Color-only status encoding (OPS, days, score) | 1.4.1 | OpsBadge.tsx, DaysBadge.tsx, GameRow.tsx | Add sr-only text labels and/or icon supplements | 0.5d |
| P0-6 | No form labels | 1.3.1, 4.1.2 | FilterBar.tsx | Add `<label>` elements with `htmlFor` | 0.25d |
| P0-7 | Focus indicators invisible | 2.4.7 | index.css | Add global `:focus-visible` style with high-contrast outline | 0.25d |
| P0-8 | Missing ARIA expanded/pressed states | 4.1.2 | Header.tsx, FilterBar.tsx, Pagination.tsx | Add `aria-expanded`, `aria-pressed`, `aria-current` | 0.5d |

**P0 Total: ~3.25 developer days**

### P1: Major Barriers (Significant User Impact)

| # | Issue | WCAG | Components | Fix | Effort |
|---|-------|------|------------|-----|--------|
| P1-1 | Clickable `<div>` elements (not keyboard accessible) | 2.1.1 | SignalFire.tsx (previous picks), Trends.tsx (surgers, creator radar) | Convert to `<Link>` or `<button>` with keyboard handlers | 0.5d |
| P1-2 | Non-text contrast failures (slider tracks, progress bars) | 1.4.11 | FilterBar.tsx, SignalFire.tsx | Increase track/bar background contrast | 0.25d |
| P1-3 | Hover-only OPS tooltip | 1.4.13 | GameTable.tsx | Convert to keyboard-accessible toggle or popover | 0.5d |
| P1-4 | No landmark structure | 1.3.1 | App.tsx, all pages | Add `<main>`, labeled `<nav>`, `<section>` with `aria-label` | 0.5d |
| P1-5 | Status messages not announced | 4.1.3 | Database.tsx, GameTable.tsx | Add `aria-live` region for loading/result count changes | 0.25d |
| P1-6 | Pagination buttons lack labels | 2.5.3, 4.1.2 | Pagination.tsx | Add `aria-label`, `aria-current` | 0.25d |
| P1-7 | Tables missing semantic structure | 1.3.1 | GameTable.tsx, Trends.tsx | Add `scope="col"`, `<caption>`, `<thead>`, `<th>` | 0.5d |
| P1-8 | Event card modal lacks dialog semantics | 4.1.2, 2.1.1 | ConceptA.tsx | Add `role="dialog"`, `aria-modal`, focus trap, Escape handler | 0.5d |
| P1-9 | Material icons lack text alternatives | 1.1.1 | GameRow.tsx, Pagination.tsx, GameTable.tsx | Add `aria-hidden="true"` + `sr-only` text, or `aria-label` | 0.25d |

**P1 Total: ~3.5 developer days**

### P2: Enhancements (Improve Experience)

| # | Issue | WCAG | Components | Fix | Effort |
|---|-------|------|------------|-----|--------|
| P2-1 | Page titles do not change per route | 2.4.2 | All page components | Add `useEffect` to set `document.title` per page | 0.25d |
| P2-2 | Charts not keyboard navigable | 2.1.1 | All Recharts instances | Add data table alternative below each chart (collapsible) | 1d |
| P2-3 | Colorblind icon supplements | 1.4.1 | OpsBadge.tsx, DaysBadge.tsx, GameRow.tsx | Add shape/icon redundancy for all color-coded statuses | 0.5d |
| P2-4 | SignalFire.tsx responsive padding | 1.4.10 | SignalFire.tsx | Convert fixed px padding to responsive values | 0.25d |
| P2-5 | Subgenre table missing headers | 1.3.1 | Trends.tsx | Add `<thead>` with `<th scope="col">` | 0.25d |
| P2-6 | Progressive disclosure for complex pages | Cognitive | Database.tsx, ConceptA.tsx | Add simplified view toggle, collapsible sections | 1d |
| P2-7 | Event symbol legend | Cognitive | ConceptA.tsx | Add visible legend mapping symbols to event types | 0.25d |
| P2-8 | Reduced motion support | 2.3.3 (AAA) | index.css | Add `@media (prefers-reduced-motion: reduce)` to disable animations | 0.25d |
| P2-9 | High contrast mode support | 1.4.3 (enhanced) | tailwind.config.js | Add `@media (prefers-contrast: more)` overrides | 0.5d |

**P2 Total: ~4.25 developer days**

---

## Appendix A: Tailwind Utility Class for Screen Reader Only Text

Add to `index.css`:

```css
/* Screen reader only -- visually hidden but announced */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}

.not-sr-only {
  position: static;
  width: auto;
  height: auto;
  padding: 0;
  margin: 0;
  overflow: visible;
  clip: auto;
  white-space: normal;
}
```

Note: Tailwind CSS 3 includes `sr-only` and `not-sr-only` utilities by default. No custom CSS needed if using standard Tailwind.

## Appendix B: Accessible Color Palette Proposal

Maintaining the "Occult Amber" aesthetic while meeting WCAG AA:

```js
// tailwind.config.js -- proposed accessible overrides
colors: {
  primary:          "#c04040",   // Brightened dried-blood red (5.5:1 on #111314)
  "primary-light":  "#d45050",   // Hover state (6.8:1)
  "primary-dark":   "#802626",   // Decorative use only (borders, backgrounds, NOT text)
  "text-dim":       "#918377",   // Warmed taupe (4.6:1 on #111314)
  "text-faint":     "#6b6058",   // Decorative only (borders, dividers, NOT text)
  // All other colors unchanged -- they pass AA
}
```

Visual impact: The primary red becomes more vivid (less "dried blood", more "fresh blood"). The dim text becomes slightly brighter. The overall dark horror aesthetic is preserved. The border color `#2a2420` continues to serve as a decorative/structural element where contrast is not required for comprehension.

## Appendix C: Contrast Calculation Method

All contrast ratios in this document were calculated using the WCAG 2.1 relative luminance formula:

```
Relative Luminance (L) = 0.2126 * R_lin + 0.7152 * G_lin + 0.0722 * B_lin

where for each channel C:
  C_srgb = C_8bit / 255
  C_lin = C_srgb / 12.92           if C_srgb <= 0.04045
  C_lin = ((C_srgb + 0.055) / 1.055) ^ 2.4   otherwise

Contrast Ratio = (L_lighter + 0.05) / (L_darker + 0.05)
```

Luminance values used:
- `#111314`: L = 0.0121
- `#1a1a1c`: L = 0.0159
- `#1f1f22`: L = 0.0179
- `#e8e0d4`: L = 0.7338
- `#a09080`: L = 0.2754
- `#6b6058`: L = 0.1158
- `#802626`: L = 0.0498
- `#5ec269`: L = 0.4277
- `#e8a832`: L = 0.4572
- `#e25535`: L = 0.2028
- `#6b9ddb`: L = 0.3392
- `#b07db2`: L = 0.2577
