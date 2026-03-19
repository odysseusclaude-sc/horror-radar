---
last_updated: 2026-03-19
---
# Context

This note is a briefing document for any AI assistant working with this vault. **Read this first before doing anything else.**

> **AI Quick-Start:** The vault uses a Zettelkasten structure across 10 folders (see Vault Structure below). The root level should only ever contain this `_context.md` file. If you see orphaned files at the root, file them first. Always read `1 - Rough Notes/To Do List.md` for current open tasks — it is the single source of truth.

---

## Who

Reaveur. Based in Singapore (SGT, UTC+8). Trades US markets during the evening/night local time.

---

## What I Trade

- **Instrument:** NQ (E-mini Nasdaq-100 Futures) on CME
- **Broker:** Interactive Brokers (IBKR)
- **Contract size:** 4 contracts per trade
- **Timeframes:** 15m chart for directional bias, 1m chart for execution

## Methodology

ICT (Inner Circle Trader) based. The core system has evolved over time (see [[Trading Setup Evolution & Rule-Based Plan]] for the full history) but the current framework as of early 2026 is:

1. **Pre-session:** Check economic calendar, assess 1D chart bias, mark 15m PD arrays and ODR
2. **Premarket (0650-0710 EST macro):** Identify Asia session liquidity sweeps → London killzone context → f-FVG formation between 0700-0900 → entry at C.E of f-FVG or PD array at wick quadrant
3. **AM session (0950-1010 EST macro):** Wait for first two 15m candles to confirm bias → f-FVG or breaker entry during macro window
4. **Trade management:** Partials at minor BSL/SSL, Terminus at 15m PD array or ODR C.E, runner with stop at breakeven

Key concepts used: FVG/iFVG validation, BISI/SIBI, breaker blocks, PD arrays, wick quadrant analysis, breakaway gaps, market structure shifts, ODR, BSL/SSL liquidity.

## Targets

- **Daily:** 20 handles base, 40 handles stretch
- **Monthly:** 10% account growth
- **Max daily loss:** 15 handles (then stop trading)
- **Max trades per day:** 2

## No-Trade Rules

- NFP week (entire week)
- CPI/PPI release day
- Bank holidays
- TGIF (unless premarket setup completed before 0930)
- 2+ caution conditions stacked (no news + govt shutdown, etc.)

---

## Other Interests

- Art history (Van Gogh, Monet, Manet, Goya, Titian, Michelangelo, colorito vs disegno)
- Literature (The Iliad — read through Book I, themes of mortality and self-destruction)
- Gaming (tracked every session since 2024 in Excel; 1,091 hours in 2025)
- Korean cooking (learning to cook Korean dishes; notes in [[Korean Dishes]])
- Korean language (takes lessons weekly with a friend on Tuesdays)
- Writing (aspires to post essays on Substack; has written Van Gogh essays and art history pieces)
- Travel (planning a trip to Rome and Florence — in progress)

---

## Vault Structure

| Folder | Purpose |
|---|---|
| 1 - Rough Notes | Unprocessed notes, daily entries, reflections, to-do list |
| 2 - Source Material | Articles, books, artworks, games, videos, recipes (primary inputs) |
| 3 - Tags | Tag pages for Obsidian backlinks — each has a one-line definition |
| 4 - Indexes | Maps of Content (MOCs): [[NQ Trading MOC]], [[Art History MOC]] |
| 5 - Templates | Trading Journal Template, Artwork Analysis Template |
| 6 - Trading | Trade journal entries (YAML frontmatter + analysis). Aug–Oct 2025 only. |
| 7 - Main Notes | Polished permanent notes with YAML frontmatter and References footer |
| 8 - Assets | Chart screenshots (NQ, by year/month/day), IBKR reports, invoices |
| 9 - Scripts | Templater JS scripts (e.g., R:R calculator) |
| 10 - Projects | Active long-horizon project documents (Kpop Social App, etc.) |

### Note Status Convention

All notes in `7 - Main Notes` carry a `status` field in their YAML frontmatter:
- `baby` — early draft, incomplete idea
- `child` — developing, partially complete
- `adult` — fully formed, citable

---

## Important Notes for AI

- The **journal entries in 6 - Trading** are a small subset of all trades. The complete trade record lives in the chart screenshots in **8 - Assets/Dream/NQ/** (570+ annotated PNGs spanning May 2024 to Feb 2026).
- Screenshots from **2024** use the naming format `18 Jul_1m.png`. Screenshots from **2025+** use `2025-08-05_1m.png`.
- Files labelled `_Journal` in the 2024 screenshots have the most detailed trade annotations.
- The **15m charts** show directional context. The **1m charts** show execution detail.
- Trading performance from the journaled period (Aug–Oct 2025): 92.3% win rate, 6.11 avg R:R, 52.96 handles expectancy per trade. See [[2025 Trading Analysis]] for full stats.
- The **To Do List** is in `1 - Rough Notes/To Do List.md` — always read this for active work items.
- The **Zettelkasten setup philosophy** is documented in `7 - Main Notes/Obsidian_Zettelkasten_Setup_Summary.md`.
- Every main note now has a **References footer** linking back to source material and related notes.

---

## How New Knowledge Enters the Vault

Use this workflow whenever a new topic, interest, or AI agent research output needs to be integrated:

```
CAPTURE → PROCESS → CONNECT → SYNTHESIZE → NAVIGATE
```

**Step 1 — Capture** (`1 - Rough Notes`)
All new ideas land here first. Fleeting thoughts, AI agent outputs, daily observations. No structure required. Date the file. Add at least one tag so it connects to something.

**Step 2 — Process** (`2 - Source Material`)
When engaging with a specific external input (book, article, video, artwork), create a Source Material note. Record: (a) page/timestamp, (b) a quote, (c) your own elaboration. Sub-folders: Articles / Artworks / Books / Games / Recipes / Videos.

**Step 3 — Connect** (`3 - Tags`)
Tag every note with the most relevant concept tags. If a tag doesn't exist yet, create it in `3 - Tags` with a one-line definition. Tags are the connective tissue — they're how Obsidian's graph view builds the knowledge web.

**Step 4 — Synthesize** (`7 - Main Notes`)
When a rough note or set of source material notes has matured into a standalone insight, write an atomic main note: one idea, under 500 words, with a References footer. Set `status: baby/child/adult` in the frontmatter.

**Step 5 — Navigate** (`4 - Indexes`)
When a tag accumulates enough notes that a list becomes unwieldy, build a Map of Content (MOC) in `4 - Indexes`. A MOC is a curated index, not just a tag dump — it adds structure, groups sub-topics, and links to the best entry points.

### Domain-Specific Examples

**New knowledge domain (e.g., Data Analytics trends):**
1. Create `3 - Tags/Data Analytics.md` — define the topic
2. AI agent research outputs → `2 - Source Material/Reports/Data Analytics/YYYY-MM-DD Report.md`
3. Synthesized insights → `7 - Main Notes/` as atomic notes tagged `[[Data Analytics]]`
4. Once 5+ notes exist → build `4 - Indexes/Data Analytics MOC.md`

**Substack essay pipeline:**
1. Fleeting idea → rough note in `1 - Rough Notes` tagged `[[Substack Idea]]`
2. Research → `2 - Source Material` notes tagged with relevant topic tags
3. Draft → rough note or main note tagged `[[Substack Idea]]`
4. Polished → `7 - Main Notes` with `status: adult`
5. When multiple essays accumulate → build `4 - Indexes/Substack MOC.md`

**New active project (app, trip plan, etc.):**
- Goes directly to `10 - Projects` as a living document — not a rough note, not a main note
- Project documents are long-form specs that evolve over time
- Notes *produced by* the project (insights, decisions, research) get promoted to `7 - Main Notes`

---

## Previous AI Sessions

| Date | What was done |
|---|---|
| 2026-03-16 | Full vault exploration. Read all 26 journal entries. Analyzed ~40 chart screenshots across 2024-2026. Created [[2025 Trading Analysis]] (statistics report) and [[Trading Setup Evolution & Rule-Based Plan]] (setup catalog + rule-based plan). Identified 17 distinct setups across 6 evolutionary phases. Organized vault: moved 9 orphaned root-level files into correct folders. |
| 2026-03-19 | Vault organization pass 1. Fixed folder naming (4 - Indexes, 5 - Templates). Built [[NQ Trading MOC]] and [[Art History MOC]]. Created Artwork Analysis Template. Decoupled Open Threads from _context.md. |
| 2026-03-19 | Vault organization pass 2. Created `10 - Projects` folder; moved Kpop Social App there. Fixed broken wiki link (Video - Obsidian Zettelkasten Setup stub created). Removed hardcoded [[US Govt Shutdown]] from Trading template. Moved `What is self love?.md` to Rough Notes. Added YAML frontmatter to `14 Feb 2026.md`. Added status tags to all main notes. Added References footers to all main notes. Created [[Substack Idea]] and [[Personal Reflection]] tag pages. Documented new-domain onboarding workflow in _context.md. Cleaned up duplicate sections in this file. Saved [[Vault Analysis 2026-03-19]] to Main Notes. Filed `Vault Analysis Prompt 2026-03-19.md` to Rough Notes. |
