# Enrichment Filter Consolidation — Design Spec

**Date:** 2026-04-28
**Page:** `/admin/enrichment`
**Status:** Spec — pending implementation plan

## Problem

The enrichment page has two independent filtering surfaces that contradict each other:

1. **Top `FilterBar`** filters which rows are *visible* in the center table (search, event, initiative, ICP min/max, status, category/source).
2. **Right-panel `target`** drives which ids are *selected for the run* (modes: unenriched / failed_incomplete / icp_below / event / initiative / saved_list / selected).

The two operate on disjoint state. The view filter shows 1 row while the target selection has 800 ids queued for enrichment. Users cannot trust that what they see is what gets enriched.

The right-panel target is also a single-mode radio: you cannot combine "from event X" with "ICP ≥ 60" with "enrichment status = failed". And there is no way to filter for null/missing values (no event, no category, no email).

## Goals

- One filtering surface. The set of visible rows is the candidate run set.
- Multi-dimensional filter that combines AND across dimensions, OR within a multi-select.
- First-class support for null/missing filters and per-field tri-states.
- Preserve every existing entry path: `?organizations=`, `?persons=`, `?retry=` URLs continue to work.
- No server-side changes beyond what the client sends to existing `/api/enrich/*` routes.

## Non-goals

- URL serialization of filter state (sharable filter URLs).
- Saving named filter presets.
- Server-side filtering or pagination.
- Changes to `EntityTable`, `SummaryStrip`, `JobHistory` internals.
- Changes to progress/results center states.
- Changes to `/api/enrich/*` route logic. The persons route's six filter-mode branches stay in place for non-UI callers (bot menus, etc.); the UI just stops invoking the non-`personIds` branches.

## Selection model — "filter narrows; checkboxes refine"

The right-panel filter defines the candidate pool. By default every visible row is checked. Per-row checkboxes deselect specific items before running.

### Selection maintenance rules

- Initial mount: `selectedIds = new Set(visibleIds)`.
- On filter change: compute `nextVisible`. New `selectedIds = (prevSelectedIds ∩ nextVisible) ∪ (nextVisible \ prevVisibleIds)`. Plain English: keep prior decisions for rows that remained visible; auto-check rows that newly entered the filter. Rows that left the filter silently leave the run set.
- `prevVisibleIds` lives in a `useRef` so the diff is O(visible).
- Manual checkbox click flips one id in `selectedIds`.
- "Select all visible" button: `selectedIds = (selectedIds ∪ visibleIds)`.
- "Clear visible" button: `selectedIds = (selectedIds \ visibleIds)`.

### Display

Filter panel footer shows: `Filtered: 1,150  •  Selected: 1,140` with inline `Select all` / `Clear` buttons. Run button label becomes `Run Pipeline (1,140)`. Run is disabled when selected count is 0, or when stages/fields are empty.

## Filter dimensions

Single shared `FilterState` per tab. AND across dimensions, OR within a multi-select. Empty array on a multi-select means "do not filter on this dimension" (NOT "match nothing").

### Persons tab

| Dimension | Type | Notes |
|---|---|---|
| `search` | string | Substring match on `full_name`, case-insensitive |
| `eventIds` | string[] | Multi-select. `"__none__"` sentinel option = "persons with no event affiliation". Selecting `"__none__"` clears any concrete event ids and vice versa. |
| `eventRelation` | `"speaker" \| "org" \| "either"` | Default `"either"`. Toggle UI is hidden when `eventIds` is empty or contains only `"__none__"`. The "no event" case is expressed via the `"__none__"` sentinel, not via this field. |
| `initiativeIds` | string[] | Multi-select |
| `savedListIds` | string[] | Multi-select |
| `sources` | string[] | Multi-select with `"__null__"` sentinel for null source |
| `statuses` | PersonStatus[] | Multi-select chip group: none / partial / complete / failed / in_progress |
| `icpMin` | number \| null | |
| `icpMax` | number \| null | |
| `icpIncludeNull` | boolean | Separate toggle, not a sentinel value |
| `hasEmail` | TriState | `any \| present \| missing` |
| `hasLinkedin` | TriState | |
| `hasTwitter` | TriState | |
| `hasPhone` | TriState | |
| `specificIds` | string[] \| null | URL escape hatch — non-null only when arrived via `?persons=` or `?retry=` |

### Organizations tab

| Dimension | Type | Notes |
|---|---|---|
| `search` | string | Substring match on `name` |
| `eventIds` | string[] | Multi-select. `"__none__"` sentinel for orgs with no event link. No relation toggle on orgs tab. |
| `initiativeIds` | string[] | Multi-select |
| `categories` | string[] | Multi-select with `"__null__"` sentinel |
| `statuses` | OrgStatus[] | Multi-select chip group: none / partial / complete / failed |
| `icpMin` | number \| null | |
| `icpMax` | number \| null | |
| `icpIncludeNull` | boolean | |
| `hasPeople` | TriState | any / has enriched persons / no persons |
| `specificIds` | string[] \| null | |

### `specificIds` semantics

When non-null, `specificIds` is AND-ed with every other dimension. The UI surfaces it as a removable chip pinned to the top of `FilterPanel`: `Showing 12 specific items  ✕`. Clicking ✕ sets `specificIds = null`. This is the only way the chip is dismissed; it does not auto-clear on filter changes.

The chip is populated automatically when arriving via:

- `?organizations=id1,id2` → `specificIds = [...ids]` on orgs tab
- `?persons=id1,id2` → `specificIds = [...ids]` on persons tab
- `?retry=jobId` → fetch failed child jobs (existing logic in `enrichment-shell.tsx` lines ~221–246), populate `specificIds` with those failed ids

## Component architecture

### Delete

- `app/admin/enrichment/components/filter-bar.tsx` — entire file
- `EMPTY_FILTERS` constant in `enrichment-shell.tsx`
- `filteredItems` memo in `enrichment-shell.tsx`
- `target` / `onTargetChange` / `eventId` / `initiativeId` / `icpThreshold` / `savedListId` state in `enrichment-shell.tsx`
- `useEffect` deriving `selectedIds` from `target` (lines ~342–382)
- `<FilterBar />` render and `target`-related sub-inputs in `config-panel.tsx`
- `EventRelationToggle` card in `enrichment-shell.tsx` (it moves into `FilterPanel`)

### Add

- `app/admin/enrichment/components/filter-panel.tsx` — owns all filter UI for the active tab, emits `FilterState` upward. No run logic.
- `app/admin/enrichment/components/job-history-drawer.tsx` — slide-up bottom drawer wrapping the existing `JobHistory`. Manages its own collapsed/expanded animation. Open state is owned by `enrichment-shell.tsx` and persisted to `localStorage`.
- `lib/enrichment/apply-filter.ts` — pure function `applyFilter(items, filterState, tab)` that returns the visible subset. Lives outside the component tree to make it independently testable.

### Rename

- `config-panel.tsx` → `run-config-panel.tsx`. Its remaining responsibility is stages/fields + people-finder settings + Run/Stop button. All target/filter props removed from its interface.

### Modify

- `enrichment-shell.tsx`:
  - Replace `FilterState` import from `./components/filter-bar` with the new shared type from `./components/filter-panel`.
  - Tab-specific empty-filter constants: `EMPTY_FILTERS_PERSONS`, `EMPTY_FILTERS_ORGS`.
  - `applyFilter()` replaces `filteredItems` memo.
  - Selection-maintenance ref + diff logic on filter change (see Selection model section).
  - Drawer open state: `const [historyOpen, setHistoryOpen] = useState(...)` reading from `localStorage`.
  - `switchTab` resets to the tab-appropriate empty filter.
  - URL query-param effects (`preSelectedOrgs`, `preSelectedPersons`, `retryJobId`) populate `filterState.specificIds` instead of setting `target = "selected"`.
- `center-panel.tsx`: drop `<FilterBar />`, drop `filters` / `onFiltersChange` / `events` / `initiatives` / `categories` / `sources` props (no longer needed there).
- `app/api/enrich/persons/route.ts` — no change. Client just stops sending `eventId` / `relation` / `failedOnly` / `sourceFilter`.

## Right-sidebar layout

Top to bottom, both cards always visible:

1. **`<FilterPanel />`** card
   - Header row: title `Filters`, right-aligned `Reset` button (clears all dimensions to neutral; preserves `specificIds`).
   - Removable `specificIds` chip (when applicable).
   - Each dimension as a labeled section (search → events+relation → initiative → saved-list (persons only) → source/category → status → ICP → has-field tri-states).
   - Footer: count strip + Select-all / Clear inline buttons.
2. **`<RunConfigPanel />`** card
   - Pipeline Stages or Fields to Enrich (current behavior).
   - People Finder settings collapse (current behavior).
   - Run/Stop button. Run label includes selected count.

Sidebar dims (`pointer-events-none opacity-40`) when `isRunning`. Both cards dim together. The run/stop header in `RunConfigPanel` stays interactive (matches existing pattern in `config-panel.tsx`).

## Job History drawer

- Collapsed state: 32px tab pinned to bottom-right of the page area showing `History · {N} jobs ▴`. Click to open.
- Open state: slides up to ~40vh from the bottom, contains the existing `<JobHistory />` list with internal scroll. ▾ chevron in the tab to close.
- Open/closed state persists per user via `localStorage` key `enrichment.history.open`.
- On `lg` and up: bottom drawer. Below `lg`: drawer is hidden; `JobHistory` continues to render inside the existing mobile slide-in sidebar overlay (no new mobile UI).
- Job click handler unchanged — `handleSelectJob(jobId)` sets `centerState = "results"` and `viewingJobId`.

## Data flow

```
useEnrichmentItems({ tab })       → allItems
useEvents()                       → events
useInitiatives()                  → initiatives
useEventsPersonIds(eventIds, rel) → affiliatedPersonIds  (persons tab + event filter active)
person_lists query                → savedLists           (persons tab only, existing fetch)

applyFilter(allItems, filterState, tab) → visibleItems
applySort(visibleItems, sortKey, sortDir) → sortedItems

selectedIds maintained per Selection-model rules

displayItems = sortedItems         (centerState === "list")
displayItems = queuedItems         (centerState === "progress")
displayItems = sortedItems.filter(i => resultOutcomes.has(i.id))  (centerState === "results")
```

Filtering stays client-side. `useEnrichmentItems` returns the full tab list with the columns the filter needs (`event_ids`, `enrichment_status`, `icp_score`, `category`, `source`, contact fields). No new server endpoints.

### Multi-event affiliation lookup

Today `useEventPersonIds(eventId, relation)` fetches authoritative person ids for one (event, relation) pair. The new design supports multi-event multi-select.

**Add** `useEventsPersonIds(eventIds: string[] | null, relation: EventRelation | null)` to `lib/queries/use-event-affiliations.ts`. One Supabase call returning the union of person ids across all selected events for the chosen relation. Returns `[]` when relation is `"none"` (handled by caller filtering for the empty/null case). Existing single-event hook stays for other call sites.

`applyFilter` branches on the event filter as follows:

- `eventIds === ["__none__"]`: row matches if its `event_ids` array is empty/missing. Pure client-side check from the `event_ids` column already returned by `useEnrichmentItems`. The `useEventsPersonIds` hook is not called.
- `eventIds.length > 0` and contains real ids: pass `(eventIds, eventRelation)` to `useEventsPersonIds`. Row matches if its id is in the returned set.
- `eventIds === []`: event dimension is inactive; no filtering on event affiliation.

## Edge cases & defaults

- **Initial filter state on mount:** all dimensions neutral. Persons tab `eventRelation = "either"` (only takes effect when `eventIds` populated). Tri-states default to `"any"`.
- **Tab switch:** `filterState` reset to the new tab's empty filter; `selectedIds` cleared; `centerState` → `"list"`; `viewingJobId` cleared; `resultStats` / `resultOutcomes` cleared. Same reset surface as today's `switchTab`.
- **Filter change while `isRunning`:** sidebar dim prevents this. The `selectedIds` snapshot used by the in-flight job is captured at run-start time (`queuedItems`), independent of post-run filter state.
- **Loading states:** while `useEnrichmentItems` loads, the table shows existing skeleton. Filter dropdowns render with empty option lists until `useEvents` / `useInitiatives` / saved-lists fetch resolves.
- **`__none__` event sentinel:** rendered as `(no event)` in the dropdown; mutually exclusive with concrete event ids in the multi-select (selecting a real event clears `__none__`, and vice versa).
- **`__null__` source/category sentinel:** rendered as `(none)`. May be combined with concrete values in the multi-select (e.g., source = `["org_enrichment", "__null__"]` matches both).
- **`specificIds` chip dismissal:** only via the chip's ✕. Filter Reset does not clear it. URL params arriving on a fresh mount populate it; later URL changes do not (the existing `hasAppliedQueryParams` ref pattern stays).
- **Active job protection on URL retry arrival:** if a `?retry=` arrives mid-run, today's behavior wins — it sets `selectedIds`. With the new model, the retry effect populates `specificIds` and lets the existing run-protection (sidebar dim) apply.

## Test plan (informal)

Manual cases to verify after implementation:

1. Land on `/admin/enrichment` cold → both tabs show all rows, all checked, run count = total.
2. Apply event filter → visible drops, selected count drops to match, run button label updates.
3. Uncheck 5 rows → selected count = visible − 5. Tweak ICP min slider → 4 of those rows leave the visible set; selected count goes to visible − 1; the one remaining deselected row is still unchecked.
4. Widen the filter back → 4 rows reappear, all 4 checked (preservation by id only across continuous visibility, per Q4(b)).
5. Select `(no event)` sentinel in event multi-select → filter shows only persons with no event affiliation; relation toggle is hidden.
6. Source multi-select with `["__null__", "org_enrichment"]` → matches persons whose source is null OR `org_enrichment`.
7. ICP min=70, max=blank, include-null=on → matches `icp_score >= 70 OR icp_score IS NULL`.
8. Has-email = `missing`, has-linkedin = `present` → only persons missing email AND with a linkedin.
9. Arrive via `?persons=a,b,c` → chip shows "Showing 3 specific items", filter neutral, all 3 checked. Click chip ✕ → chip clears, full tab list reappears.
10. Arrive via `?retry=jobId` → chip shows the failed-child count from that job.
11. Tab switch persons → orgs → orgs filter resets, selection clears, history drawer state persists.
12. Job History drawer closed/open state survives page reload via `localStorage`.
13. Mid-run: filter and run-config dim, can't change run set; results land on the same row set queued at run-start; drawer still toggleable.

## Risks

- **Selection diff complexity:** the `(prev ∩ next) ∪ (next \ prevVisible)` rule is subtle. Risk of off-by-one when the diff is computed against a stale `prevVisibleIds`. Mitigation: always compute `prevVisibleIds` from the same source as `nextVisible` (the result of `applyFilter`), inside the same effect that updates `selectedIds`.
- **Multi-event affiliation perf:** if a user selects 20+ events, the new `useEventsPersonIds` does one call but the result set could be large. Bounded by the persons table size (~thousands) so acceptable for v1.
- **URL chip stickiness:** users may forget the `specificIds` chip is filtering them down and tweak other dimensions to no effect. Mitigation: chip is visually prominent and labeled clearly with a count and an obvious ✕.
- **Tri-state UX clarity:** three-state cycle buttons are non-standard. Mitigation: each tri-state shows its current state inline (`Email: any` / `Email: present` / `Email: missing`) so the meaning is always visible, not implied by icon state.

## Out-of-scope follow-ups

- URL-serialized filter state (sharable filter links).
- Named saved filter presets.
- Server-side filtering / pagination if the per-tab item count grows past a few thousand.
- Filter-state persistence across page reloads (currently lost; deliberate so each session starts from a known baseline).
