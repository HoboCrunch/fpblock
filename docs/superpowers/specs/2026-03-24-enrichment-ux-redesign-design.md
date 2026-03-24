# Enrichment UX Redesign — Two-Panel Layout

**Date:** 2026-03-24
**Status:** Approved

## Overview

Redesign the enrichment admin page from a single-column stacked layout into a two-panel interface: a center content panel (~65% width) and a right sidebar (~35%, 320–400px). The center panel acts as a state machine (LIST → PROGRESS → RESULTS), while the sidebar holds pipeline configuration and job history.

## Layout Structure

```
┌──────────────────────────────────────────────────────────────────────┐
│  Enrichment              [Persons | Organizations]       ← page hdr │
├─────────────────────────────────────┬────────────────────────────────┤
│                                     │  Pipeline Configuration  [▶ Run] │
│  Filter Bar                         │──────────────────────────────────│
│  [Search][Event▾][Initiative▾]     │  CONFIG PANEL                    │
│  [ICP min-max][Status▾][Origin▾]   │  (pipeline stages, settings,     │
│  Showing N of M · K selected        │   target selector)               │
│─────────────────────────────────────│                                  │
│                                     │                                  │
│  CENTER PANEL                       │  JOB HISTORY                     │
│  (LIST | PROGRESS | RESULTS)        │  (scrollable list, click to load │
│                                     │   results into center panel)     │
│                                     │                                  │
└─────────────────────────────────────┴──────────────────────────────────┘
```

- Center panel: ~65% viewport width
- Right sidebar: ~35% viewport width, min 320px, max 400px
- Config panel takes dynamic height; job history fills remaining space below

## Center Panel — State Machine

### State 1: LIST (default)

A filterable, selectable table of organizations or persons. This IS the item selector — replaces the separate "pick from list" panel entirely.

#### Organization Columns

| ☐ | Name | Event | Category | ICP | Status |
|---|------|-------|----------|-----|--------|

- **☐** — Checkbox. Header checkbox for select-all visible items.
- **Name** — Org name, truncated with tooltip.
- **Event** — Event tag(s), abbreviated.
- **Category** — Org category (from `organization.category`). Filterable.
- **ICP** — Numeric score, color-coded: orange ≥75, yellow ≥50, gray <50 or blank.
- **Status** — Horizontal icon cluster (see Status Column below).

Note: Organizations do not have a `source`/`origin` field in the schema. Category serves as the grouping column instead.

#### Person Columns

| ☐ | Name | Org | Event | Source | ICP | Status |
|---|------|-----|-------|--------|-----|--------|

- **Source** — From `person.source` field (e.g., "upload", "apollo", "manual"). Filterable.

Otherwise same structure; status icons use field-level icons instead of stage icons.

#### Status Column — Icon Cluster

A single cell showing a horizontal row of Lucide icons. Presence and color tells the full story:

**For organizations** (stage icons): Search (Apollo), FlaskConical (Perplexity), Brain (Gemini), Users (People Finder)
**For persons** (field icons): Mail, Linkedin, Twitter, Phone

Icon color states:
- **Green** — stage/field completed successfully, data found
- **Gray** — stage/field completed, zero results
- **Red** — stage/field failed
- **No icon rendered** — stage/field never attempted

During PROGRESS state, the currently-processing icon renders in **orange with pulse animation**.

No checkmark or X overlays — color alone communicates state.

#### Filter Bar

Single row of compact controls above the table:

```
[🔍 Search...] [Event ▾] [Initiative ▾] [ICP: min–max] [Status ▾] [Category/Source ▾]   Showing 142 of 237 · 18 selected
```

- All filters AND-combined.
- Status dropdown options: All, New (maps to `enrichment_status: 'none'`), Partial (`'partial'`, orgs only), Complete (`'complete'`), Failed (`'failed'`). In-progress items display as "Processing" but are not a filter option (they appear under All).
- Last filter is **Category** on org tab, **Source** on person tab.
- **Initiative** filter appears on both tabs (via `initiative_enrollments` which links to both `person_id` and `organization_id`).
- Count summary on right shows filtered count and selection count.
- Filters persist across all center panel states (LIST/PROGRESS/RESULTS).

#### Row Behavior

- Compact rows (~36px height) for density.
- No row expansion in LIST mode — clicking a row navigates to org/person detail page.
- Selection is checkbox-only.
- Shift+click for range selection.
- Checking rows manually switches the Target dropdown in sidebar to "Selected [n] items" automatically.
- Changing the Target dropdown applies a filter AND selects all matching items.
- **Target/selection sync rule:** When a target preset is active (e.g., "Never enriched"), manually unchecking items does NOT change the target dropdown — it stays on "Never enriched" but the unchecked items are excluded from the run. Re-selecting the same target re-checks all matching items (reset). The target only switches to "Selected items" when the user checks a row while on a non-preset target or when no target preset logically applies.

### State 2: PROGRESS

Triggered when a job starts. Center panel transitions from LIST:

- **Progress bar** — Thin bar between filter bar and table: `Processing 4 of 12 organizations...`
- **Checkboxes disappear** — same columns otherwise.
- **Status icons go live**:
  - Not-yet-reached stages: absent (no icon)
  - Currently processing: orange icon with pulse animation
  - Completed: green/gray/red per normal rules
- Rows maintain original order.
- Rows animate in with `slideIn` if streamed in batches.
- Filter bar still functional (e.g., filter to only failed items).

**During PROGRESS:**
- Config panel dims/locks — not interactive.
- Run button becomes red **[◼ Stop]** button.
- **Stop/Cancel mechanism:** Client-side AbortController aborts the fetch request. A new `POST /api/enrich/cancel` endpoint sets a `cancelled` flag on the parent `job_log` row. The enrichment pipeline checks this flag between each item (before starting the next org/person). Items already in-flight complete normally; remaining items are marked `status: 'cancelled'` in their job_log entries. The center panel transitions to RESULTS with partial data. This requires a small addition to the pipeline loop and a new 3-line API route.

### State 3: RESULTS

Triggered by job completion or clicking a historical job in sidebar.

**Summary strip** — Horizontal row of compact stat cards at top of center panel:

```
Processed: 12 | Enriched: 10 | Signals: 47 | Avg ICP: 72 | People Found: 23 | New Persons: 8
```

- Single row, not a 2-column grid. Each stat: label above, number below.
- Orange accent on key metrics (Enriched, New Persons).
- People Finder stats only shown if People Finder was part of the job.

**Results table:**
- Same column structure as LIST, no checkboxes.
- Status icons reflect job outcomes.
- ICP column shows delta if score changed (e.g., `72 → 85` with green up-arrow).
- Additional outcome badge per row: "enriched" (green), "failed" (red), "skipped" (gray).

**Navigation:** "← Back to list" link above summary strip returns to LIST state.

## Right Sidebar — Config Panel

### Header Row

```
Pipeline Configuration          [▶ Run Pipeline]
```

- Run button: orange accent, prominent, top-right of sidebar.
- Becomes `[◼ Stop]` (red) during execution.
- Disabled when: no stages selected, or "Selected items" target with zero selections.

### Pipeline Stages

Vertical toggle list with Lucide icons:

```
◉ Full Pipeline          (Search + Flask + Brain)
  ○ Apollo               (Search)
  ○ Perplexity           (FlaskConical)
  ○ Gemini               (Brain)
◉ People Finder          (Users)
```

- Full Pipeline mutually exclusive with individual Apollo/Perplexity/Gemini.
- When Full is active, sub-stages visually nested/indented and disabled.
- People Finder always independent, combinable with any configuration.

### People Finder Settings

Slides open with smooth height transition when People Finder is toggled on. Collapses to zero height when off.

```
Contacts per company    [5 ▾]
Seniority              [Owner, Founder, C-Suite ▾]  (multi-select chips)
Departments            [All ▾]                       (multi-select chips)
```

### Person Tab Config (replaces Pipeline Stages when person tab active)

When the Persons tab is active, the config panel shows field toggles instead of pipeline stages:

```
Fields to Enrich
  ☑ Email              (Mail)
  ☑ LinkedIn           (Linkedin)
  ○ Twitter            (Twitter)
  ○ Phone              (Phone)
```

- Each field is a checkbox toggle with its Lucide icon.
- At least one field must be selected to enable Run.
- No sub-settings (no equivalent of People Finder expansion).
- Source is fixed to Apollo (the only person enrichment source currently implemented).

### Target Selector

Single dropdown below stages:

```
Target    [Never enriched ▾]
```

Options:
- Never enriched (default)
- Failed / Incomplete
- ICP below threshold → shows numeric input inline
- From event → shows event dropdown inline
- From initiative → shows initiative dropdown inline
- From saved list → shows list dropdown inline (person tab only, uses `person_lists` table)
- Selected items → auto-set when user checks rows in center panel

Target selection applies a filter + select-all on the center list. Conditional sub-inputs appear inline below the dropdown when relevant.

## Right Sidebar — Job History Panel

Sits below config panel, takes remaining vertical space. Scrollable.

### Header

```
Job History
```

### Job Rows

```
Mar 24, 2:15 PM · Organizations          [✓ 12/12]
Full Pipeline + People Finder
```

- Line 1: timestamp + entity type
- Line 2: stages used (compact text)
- Right side: result badge — green `✓ 12/12` success, red `✗ 3/12` partial failures, orange spinner for in-progress
- Active/in-progress job pinned at top with highlight border

### Click Behavior

Clicking a job row loads its results into the center panel (RESULTS state). Clicked row gets an active/selected indicator. No page navigation — results render inline.

Scrollable, most recent first. Fetch limit: 50 jobs. No pagination needed at current scale.

### Loading Historical Results

Clicking a job queries `job_log` child rows by `metadata->>parent_job_id = jobId` to reconstruct per-item results. The summary stats come from the parent job's `metadata` (which already stores counts). ICP deltas are not stored — the results view shows current ICP scores only (no before/after comparison for historical jobs).

## Page Header

```
Enrichment              [Persons | Organizations]
```

- Tab toggle (Persons / Organizations) in the header, same as current.
- Switching tabs resets center panel to LIST state with the appropriate entity.
- Config panel adapts: org tab shows stage-based pipeline options, person tab shows field-based options (see "Person Tab Config" section).

## Responsive Behavior

Below ~1100px viewport width, the sidebar collapses into a slide-out drawer triggered by a config button in the page header. The center panel takes full width. The drawer overlays the content (does not push it). This is the fallback — the primary design targets ≥1200px screens.

## Interaction Summary

1. **User opens page** → LIST state, all items visible, no selection
2. **User selects target or checks rows** → items filtered/selected in center, target syncs in sidebar
3. **User configures stages** → toggles in sidebar, People Finder expands if selected
4. **User clicks Run** → CENTER transitions to PROGRESS, sidebar dims/locks, Stop button appears
5. **Job completes** → CENTER transitions to RESULTS, sidebar unlocks, summary strip + result rows shown
6. **User clicks "Back to list"** → CENTER returns to LIST
7. **User clicks a history job** → CENTER shows RESULTS for that historical job
8. **User clicks Stop** → remaining items cancelled, transition to RESULTS with partial data

## Technical Notes

### File Decomposition

The current `page.tsx` (38KB) must be decomposed into focused components:

- `enrichment-page.tsx` — layout shell, tab state, panel arrangement, top-level state
- `center-panel.tsx` — state machine (LIST/PROGRESS/RESULTS), renders the shared table with mode-specific props
- `entity-table.tsx` — shared table component accepting a `mode: 'list' | 'progress' | 'results'` prop. Renders checkboxes in list mode, progress icons in progress mode, outcome badges in results mode. Single component avoids duplicating column definitions and row rendering across three near-identical tables.
- `summary-strip.tsx` — horizontal stat cards shown above table in RESULTS mode
- `filter-bar.tsx` — persistent filter row
- `config-panel.tsx` — pipeline stages (org) / field toggles (person), People Finder settings, target selector
- `job-history.tsx` — scrollable job history list
- `status-icons.tsx` — reusable icon cluster component for enrichment stage/field status

### Existing Components Reused

- `GlassCard` — panel containers
- `GlassSelect` — dropdowns in filter bar and config
- `GlassInput` — search input, numeric inputs
- `Badge` — outcome badges, result badges
- `Tabs` — person/org tab switcher
- Lucide icons: Search, FlaskConical, Brain, Users, Mail, Linkedin, Twitter, Phone

### State Management

All state local to the page (React useState/useReducer). No global state needed. Key state:

- `activeTab`: "persons" | "organizations"
- `centerState`: "list" | "progress" | "results"
- `selectedIds`: Set<string>
- `filters`: { search, event, initiative, icpMin, icpMax, status, categoryOrSource }
- `stages`: OrgStage[] (existing type, org tab only)
- `personFields`: EnrichField[] (person tab only: "email" | "linkedin" | "twitter" | "phone")
- `peopleFinder`: { contacts, seniority[], departments[] }
- `target`: TargetType
- `activeJobId`: string | null
- `viewingJobId`: string | null (for history click)

### URL Query Params

Preserve existing behavior:
- `?organizations=id1,id2` — pre-select orgs, switch to org tab
- `?persons=id1,id2` — pre-select persons, switch to person tab
- `?retry=jobId` — load failed items from prior job, select them
