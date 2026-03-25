# Admin Application Performance Optimization

**Date:** 2026-03-24
**Status:** Implemented
**Approach:** B — Infrastructure + Targeted Fixes

## Problem Statement

The admin application is experiencing degraded responsiveness across navigation, table interactions, data loading, and the enrichment workflow. Root causes identified through a full codebase audit:

- **No data caching layer** — every page mount fires fresh Supabase queries with no deduplication, no stale-while-revalidate, and manual `setInterval` polling with potential memory leaks
- **No table virtualization** — tables render 200-1000+ `<tr>` elements to the DOM regardless of viewport
- **Monolith client components** — enrichment page (1207 LOC, ~38 `useState`), persons table (1199 LOC), organizations table (837 LOC) re-render entirely on any state change
- **Navigation shell re-renders** — sidebar (379 LOC) and header re-render on every route change via `usePathname()`
- **Scattered anti-patterns** — index keys, raw `<img>` tags, sequential fetches, `select("*")` for count queries

## Solution Overview

Six workstreams, ordered by impact:

1. React Query data layer
2. TanStack Virtual table rendering
3. Component decomposition with memo boundaries
4. Memoized navigation shell
5. Targeted fixes (keys, images, queries, fetching)
6. Best practices document

---

## 1. Data Layer — React Query

### New Files

```
lib/queries/
  ├── query-provider.tsx        — QueryClientProvider (mounted in admin layout)
  ├── query-keys.ts             — Centralized key factory
  ├── use-organizations.ts      — Org list with filter params
  ├── use-persons.ts            — Persons list with filter params
  ├── use-enrichment-jobs.ts    — Job history with conditional polling
  ├── use-enrichment-items.ts   — Entity table data (orgs or persons)
  ├── use-events.ts             — Events list
  ├── use-initiatives.ts        — Initiatives list
  ├── use-saved-lists.ts        — Saved lists
  └── use-dashboard-stats.ts    — Dashboard count queries
```

### Query Key Factory

All keys namespaced and parameterized for precise invalidation:

```ts
export const queryKeys = {
  organizations: {
    all: ["organizations"] as const,
    list: (filters: OrgFilters) => ["organizations", "list", filters] as const,
    detail: (id: string) => ["organizations", "detail", id] as const,
  },
  persons: {
    all: ["persons"] as const,
    list: (filters: PersonFilters) => ["persons", "list", filters] as const,
    detail: (id: string) => ["persons", "detail", id] as const,
  },
  enrichment: {
    all: ["enrichment"] as const,
    jobs: {
      all: ["enrichment", "jobs"] as const,
      detail: (activeJobId: string) => ["enrichment", "jobs", activeJobId] as const,
    },
    items: {
      all: ["enrichment", "items"] as const,
      list: (tab: string, filters: object) => ["enrichment", "items", tab, filters] as const,
    },
  },
  events: { all: ["events"] as const },
  initiatives: { all: ["initiatives"] as const },
  savedLists: { all: ["saved-lists"] as const },
  dashboard: { stats: ["dashboard", "stats"] as const },
} as const;
```

### Polling Pattern

Replace all `setInterval` + `useEffect` cleanup with React Query's built-in polling:

```ts
// Using @tanstack/react-query v5 API
useQuery({
  queryKey: queryKeys.enrichment.jobs.all,
  queryFn: () => fetchEnrichmentJobs(supabase),
  refetchInterval: (query) => {
    const jobs = query.state.data ?? [];
    const hasProcessing = jobs.some(j =>
      j.status === "processing" || j.status === "in_progress"
    );
    return hasProcessing ? 5000 : false;
  },
});
```

### What Gets Removed

- All `setInterval` / `clearInterval` polling logic
- Manual `loadJobs`, `loadItems`, `loadEvents` callbacks
- ~18 of ~38 `useState` calls in enrichment page (data + loading states — e.g., `allItems`, `totalCount`, `itemsLoading`, `events`, `initiatives`, `savedLists`, `jobs`, `isRunning`, `activeJobId`, `jobStartTime`, `progressData`, `activeStages`, `progressCompleted`, `progressTotal`, `resultStats`, `resultOutcomes`, `queuedItems`, `viewingJobId`)
- Manual loading/error state tracking (React Query provides `isLoading`, `isError`, `data`)
- Note: Progress-tracking states (`progressData`, `activeStages`, `progressCompleted`, `progressTotal`, `resultOutcomes`) are derived from polling data and can be computed from the React Query cache via `select` transforms or `useMemo` on the query data

### Mutation Pattern

Enrichment actions (start, cancel, retry) use `useMutation` with automatic cache invalidation:

```ts
useMutation({
  mutationFn: (params) => startEnrichmentJob(supabase, params),
  onSuccess: () => {
    // Use the `.all` prefix keys to invalidate all job/item queries regardless of params
    queryClient.invalidateQueries({ queryKey: queryKeys.enrichment.jobs.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.enrichment.items.all });
  },
});
```

### QueryClient Configuration

```ts
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,       // 30s before considered stale
      gcTime: 5 * 60_000,      // 5min garbage collection
      refetchOnWindowFocus: false,  // Admin tool, not consumer app
      retry: 1,                 // One retry on failure
    },
  },
});
```

---

## 2. Table Virtualization — TanStack Virtual

### New Dependency

`@tanstack/react-virtual`

### Shared Primitive (original plan)

```
components/ui/
  └── virtual-table.tsx
```

A reusable wrapper around `useVirtualizer`:
- Accepts: `rows`, `estimateSize` (default 36px), `renderRow`, `columns` (for header), `scrollContainerHeight`
- Supports dynamic row heights via TanStack Virtual's `measureElement` ref callback — rows that exceed 36px (e.g., multi-line event badges) are measured after render and the virtualizer adjusts. Row content should still be constrained with `line-clamp` or truncation where practical to keep heights consistent.
- Renders: sticky `<thead>` outside scroll container, virtualized `<tbody>` inside
- Handles: overscan (5 rows), scroll restoration, total height spacer

> **Implementation note:** `virtual-table.tsx` (131 LOC) was created as planned and uses HTML `<table>/<thead>/<tr>/<td>` elements. However, the organizations and persons tables **do not use this shared primitive**. Instead, they use **CSS Grid `<div>` elements with inline `useVirtualizer`**. This divergence was necessary because absolute-positioned `<tr>` elements inside a virtualized `<tbody>` cannot share column widths with a separate sticky `<thead>` rendered in a different `<table>` element. CSS Grid solves this by applying a shared `gridTemplateColumns` constant (e.g., `ORG_GRID_COLS`, `PERSON_GRID_COLS`) to both the header row and each virtualized body row, guaranteeing column alignment without `<table>` layout constraints.
>
> **Preferred pattern going forward:** For complex tables with many columns, hover interactions, and selection, use the **CSS Grid + inline `useVirtualizer`** pattern (as in `organizations-table-client.tsx` and `persons-table-client.tsx`). Reserve `virtual-table.tsx` for simpler tables where HTML table semantics are sufficient and the column layout is straightforward.

### Per-Table Application

| Table | Rows | Planned | Actual |
|---|---|---|---|
| Organizations | 200-500+ | Virtualize via `virtual-table.tsx` | Virtualized via **inline `useVirtualizer` + CSS Grid** |
| Persons | 500-1000+ | Virtualize via `virtual-table.tsx` | Virtualized via **inline `useVirtualizer` + CSS Grid** |
| Enrichment entities | 200-1000+ | Virtualize via `virtual-table.tsx` | Not yet virtualized (uses existing entity-table component) |
| Pipeline | <100 | Skip — not worth complexity | Skipped |
| Initiatives | <50 | Skip | Skipped |
| Events | <50 | Skip | Skipped |

### Integration Pattern (as implemented)

The actual pattern uses CSS Grid divs instead of HTML table elements. Each table defines a shared `gridTemplateColumns` constant exported from its row component:

```tsx
// org-table-row.tsx
export const ORG_GRID_COLS = "40px minmax(160px,2fr) 56px 72px minmax(120px,1.5fr) 64px minmax(80px,1fr) 80px minmax(80px,1fr) 80px";

// Header (non-virtualized, sticky)
<div className="grid ..." style={{ gridTemplateColumns: ORG_GRID_COLS }}>
  {/* header cells as <div> elements */}
</div>

// Virtualized body
const virtualizer = useVirtualizer({
  count: filteredRows.length,
  getScrollElement: () => scrollRef.current,
  estimateSize: () => 36,
  overscan: 5,
});

<div style={{ position: "relative", height: `${virtualizer.getTotalSize()}px` }}>
  {virtualizer.getVirtualItems().map((virtualItem) => {
    const row = filteredRows[virtualItem.index];
    return (
      <OrgTableRow
        key={row.id}
        row={row}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          transform: `translateY(${virtualItem.start}px)`,
          height: `${virtualItem.size}px`,
        }}
        // ... other props
      />
    );
  })}
</div>

// Row component uses the same grid constant
<div role="row" className="grid items-center ..."
  style={{ ...style, gridTemplateColumns: ORG_GRID_COLS }}>
  {/* cells as <div> elements */}
</div>
```

### Preserved Behaviors

- Shift+click range selection -- indexes into `filteredRows` array, unaffected
- Hover preview cards -- triggered by mouseover on visible rows
- Sticky header -- rendered outside scroll container, shares `gridTemplateColumns` with rows
- Custom `React.memo` comparators on row components for fine-grained re-render control

---

## 3. Component Decomposition

### Enrichment Page (1207 LOC → ~5 files)

```
app/admin/enrichment/
  ├── page.tsx                  — Server component (minimal, renders shell)
  ├── enrichment-shell.tsx      — Client orchestrator (~200 LOC estimated, 918 LOC actual)
  │                               Holds: activeTab, selectedIds, sidebarOpen
  │                               Data from: useEnrichmentJobs, useEnrichmentItems, useEvents, etc.
  ├── components/
  │   ├── center-panel.tsx      — Exists, receives data via props
  │   ├── config-panel.tsx      — Exists, owns stage/filter selection state internally
  │   ├── entity-table.tsx      — Exists, gets virtual-table integration
  │   ├── filter-bar.tsx        — Exists, wrapped in React.memo, owns filter state internally
  │   ├── job-history.tsx       — Exists, data from useEnrichmentJobs
  │   ├── status-icons.tsx      — Exists, unchanged
  │   └── summary-strip.tsx     — Exists, unchanged
```

> **Implementation note:** `enrichment-shell.tsx` is 918 LOC, significantly larger than the ~200 LOC estimate. The shell absorbed React Query data hooks (`useEnrichmentJobs`, `useEnrichmentItems`, `useEvents`, `useInitiatives`) and uses `queryClient.invalidateQueries` for cache management, but many `useState` calls for progress tracking, run orchestration, and result display remained in the shell rather than being eliminated or pushed down. The enrichment workflow's state machine (list -> progress -> results), polling during active runs, and historical job loading all require coordinated state that doesn't decompose cleanly.

**State redistribution:** The current ~38 `useState` calls split as:
- ~10 remain in `enrichment-shell.tsx` (shared state: activeTab, selectedIds, sidebarOpen, centerState, target, eventId, initiativeId, icpThreshold, savedListId, sortKey/sortDir)
- ~4 eliminated by React Query (data now from hooks: `useEnrichmentJobs`, `useEnrichmentItems`, `useEvents`, `useInitiatives`)
- ~14 remain as local `useState` in the shell for run orchestration and progress (isRunning, activeJobId, jobStartTime, progressData, activeStages, progressCompleted, progressTotal, resultStats, resultOutcomes, queuedItems, viewingJobId, savedLists, stages, personFields, etc.)
- ~10 pushed into sub-components that own them:
  - Filter state -> `filter-bar.tsx` (filters, categories, sources)
  - Stage selection -> `config-panel.tsx` (stages, personFields, pfPerCompany, pfSeniorities, pfDepartments)

**Also in scope:** `app/admin/enrichment/[jobId]/job-results-client.tsx` — contains `setInterval` polling (2.5-3s) and `key={i}` anti-patterns. Gets React Query migration and key fixes.

### Organizations Table (837 LOC -> ~3 files)

```
app/admin/organizations/
  ├── organizations-table-client.tsx  — Orchestrator (~300 LOC estimated, 647 LOC actual)
  ├── org-table-row.tsx               — React.memo'd row (233 LOC)
  └── org-preview-card.tsx            — Already memoized, extracted to own file
```

> **Implementation note:** `organizations-table-client.tsx` is 647 LOC, larger than the ~300 LOC estimate. The table includes extensive filter sidebar (14 filter fields across 4 filter groups), debounced hover preview, shift+click range selection, inline `useVirtualizer`, and sort logic. Uses CSS Grid with `ORG_GRID_COLS` constant shared between header and row components. `org-table-row.tsx` has a custom `React.memo` comparator checking `row.id`, `isSelected`, `isHovered`, `index`, and `row` reference equality. Uses `next/image` for logos.

### Persons Table (1199 LOC -> ~3 files)

```
app/admin/persons/
  ├── persons-table-client.tsx  — Orchestrator (~300 LOC estimated, 852 LOC actual)
  ├── person-table-row.tsx      — React.memo'd row (341 LOC)
  └── person-preview-panel.tsx  — Extracted preview/detail panel
```

> **Implementation note:** `persons-table-client.tsx` is 852 LOC. It includes 16+ filter state variables, debounced search, multi-select filter chips, correlation computation, ref-based hover preview (avoids table re-renders), and inline `useVirtualizer` with CSS Grid. `person-table-row.tsx` has a custom `React.memo` comparator that also checks `style.transform` to avoid unnecessary re-renders during scroll. Uses `next/image` with `unoptimized` flag for person photos.

### Memo Boundary Pattern

```
TableClient (selection + layout state)
  └── VirtualTable
       └── MemoizedRow (React.memo)  ← only re-renders if row data changes
            └── cells
```

When a user types in a filter, only the filter bar and the virtual table's visible row set update. Rows whose data didn't change skip re-render entirely.

---

## 4. Memoized Navigation Shell

### Current Problem

`usePathname()` in sidebar.tsx re-renders the entire 379-line component (12 NavItems + events submenu + tooltips + media query listener) on every route change.

### Changes

```
components/admin/
  ├── sidebar.tsx       — Wrapped in React.memo
  ├── nav-item.tsx      — Extracted, React.memo'd, receives isActive boolean
  ├── nav-tooltip.tsx   — Extracted, React.memo'd
  └── header.tsx        — Wrapped in React.memo
```

### How It Works

1. `AdminShell` passes `pathname` to `Sidebar`
2. `Sidebar` is `React.memo` — only re-renders when `pathname` or `events` list changes
3. Each `NavItem` is `React.memo` with `isActive` prop — on navigation, only 2 of 12 items re-render (previous active + new active)
4. `NavTooltip` is `React.memo` — re-renders only when `show` or `label` changes
5. `Header` is `React.memo` — near-zero re-renders on most navigations

### Expected Impact

Navigation re-render cost drops from ~500 lines of JSX to ~60 lines (2 NavItems).

---

## 5. Targeted Fixes

### 5a. Fix Index Keys

Replace **all** instances of `key={i}` or `key={index}` across the codebase with stable identifiers. Known locations include:

| Location | Current | Fix |
|---|---|---|
| `correlation-review.tsx` badges | `key={i}` | `key={badge.value}` or composite key |
| `person-correlation-summary.tsx` chains | `key={i}` | `key={item.id}` |
| `organizations-table-client.tsx:241, :784` | `key={i}` | `key={event.id}` |
| `organizations/[id]/page.tsx:537` | `key={i}` | `key={item.id}` |
| `events-table-client.tsx:528` | `key={i}` | `key={item.id}` |
| `persons-table-client.tsx:1137` | `key={i}` | `key={item.id}` |
| `job-results-client.tsx:346, :361` | `key={i}` | `key={stage.name}` |
| `correlation-badge.tsx` | `key={i}` | `key={badge.value}` |

Implementation should grep for `key={i}` and `key={index}` to catch any additional instances.

### 5b. Image Optimization

Replace all `<img src={row.logo_url}>` with:

```tsx
<Image
  src={row.logo_url}
  alt={row.name}
  width={32}
  height={32}
  className="rounded-md"
  loading="lazy"
/>
```

Applies to: org preview cards, any logo rendering in tables.

**Required config change:** Add `remotePatterns` to `next.config.ts` to allow external logo domains:

```ts
images: {
  remotePatterns: [
    { protocol: "https", hostname: "**" },  // Logos come from many domains (Clearbit, company CDNs, etc.)
  ],
},
```

A wildcard is appropriate here since logo URLs originate from Apollo/enrichment and span unpredictable domains. For tighter security, a known-domain allowlist can be built over time.

### 5c. Parallelize Sequential Fetches

**Enrichment page client loads (lines 220-251):** Currently 4 independent `.then()` chains fired in the same `useEffect`. While technically parallel (fire-and-forget), the pattern is fragile and lacks deduplication. React Query fires all queries with different keys in parallel automatically with proper caching — no additional code change needed beyond migration.

**`fetchAll` pagination:** When total count is available from first page response, fire remaining pages in parallel. Important: each parallel request must build a fresh query (Supabase query builders are mutable — calling `.range()` mutates the builder, so you cannot reuse a single builder across parallel calls):

```ts
// Current: sequential
while (hasMore) { fetch page N; N++ }

// After: parallel — each call builds a fresh query
const firstPage = await supabase.from(table).select(columns, { count: "exact" }).range(0, PAGE_SIZE - 1);
const total = firstPage.count;
const remaining = Array.from({ length: Math.ceil(total / PAGE_SIZE) - 1 }, (_, i) => {
  const offset = (i + 1) * PAGE_SIZE;
  // Fresh query builder per page — do NOT reuse the firstPage query object
  return supabase.from(table).select(columns).range(offset, offset + PAGE_SIZE - 1);
});
const allPages = [firstPage.data, ...(await Promise.all(remaining)).map(r => r.data)];
```

### 5d. Consistent Supabase Client Import

The enrichment page (line 38-43) has an inline `useSupabase()` that calls `createBrowserClient()` directly, bypassing the shared `lib/supabase/client.ts` module. While `@supabase/ssr`'s `createBrowserClient` does cache internally, the inconsistent import pattern makes the codebase harder to reason about. Fix: replace the inline `useSupabase()` with the existing `createClient` import from `lib/supabase/client.ts`. Apply the same fix to any other files that create their own browser client inline.

### 5e. Optimize Count Queries

Audit all `select("*")` calls across client-side code. For count-only queries, use `select("id", { count: "exact", head: true })` — returns count without transferring row data. For data queries, select only the columns actually used by the component. Note: `select("*")` in server components or API routes is lower priority since the data doesn't cross the network to the browser.

---

## 6. Best Practices Document

A `PERFORMANCE.md` at project root codifying patterns for future development.

### Data Fetching Rules
- All client-side fetching through React Query hooks in `lib/queries/`
- Never `useState` + `useEffect` for data fetching
- Never `setInterval` for polling — use `refetchInterval`
- Always use query key factory — no inline key arrays
- Select only needed columns — no `select("*")` without justification
- Use parallel `fetchAll` for datasets over 1000 rows

### Component Rules
- Client components over 300 LOC should be decomposed (exception: components like sidebar that are large but single-purpose and can be optimized with `React.memo` + extracted sub-components)
- Table rows must be `React.memo`'d — never inline JSX in `.map()`
- Tables with 100+ potential rows must use `virtual-table.tsx`
- List keys must be stable IDs — never `key={index}`
- Shell components (sidebar, header) must be `React.memo`'d
- State ownership: each sub-component owns its local state, parent holds only shared state

### Image Rules
- Always `next/image` — never raw `<img>`
- Always `width`/`height` or `fill` with sized container

### New Page Checklist
- [ ] Data fetched via React Query hook
- [ ] Tables virtualized if >100 rows possible
- [ ] Table rows are memo'd components
- [ ] List keys are stable IDs
- [ ] Images use `next/image`
- [ ] No `select("*")` without justification
- [ ] Client component under 300 LOC (or justified exception with proper memo boundaries)

---

## New Dependencies

| Package | Purpose | Size |
|---|---|---|
| `@tanstack/react-query@^5` | Data fetching, caching, polling (v5 API) | ~13KB gzipped |
| `@tanstack/react-virtual` | Table row virtualization | ~3KB gzipped |

---

## Files Modified (Summary)

| Area | Files Created | Files Modified |
|---|---|---|
| Query layer | ~10 new files in `lib/queries/` | 0 |
| Query provider | 0 | `app/admin/layout.tsx` (wrap in provider) |
| Virtual table | 1 (`components/ui/virtual-table.tsx`) | 0 |
| Enrichment decomp | 1 (`enrichment-shell.tsx`) | 6 existing enrichment files |
| Orgs decomp | 2 (`org-table-row.tsx`, `org-preview-card.tsx`) | `organizations-table-client.tsx` |
| Persons decomp | 2 (`person-table-row.tsx`, `person-preview-panel.tsx`) | `persons-table-client.tsx` |
| Navigation | 2 (`nav-item.tsx`, `nav-tooltip.tsx`) | `sidebar.tsx`, `header.tsx` |
| Enrichment job results | 0 | `enrichment/[jobId]/job-results-client.tsx` (RQ + keys) |
| Targeted fixes | 0 | ~10 files (keys, images, queries, next.config.ts) |
| Best practices | 1 (`PERFORMANCE.md`) | 0 |

---

## Parallel Development: Shared Primitives Contract

This spec creates infrastructure that the **Sequences Redesign spec** (and future features) will consume. Both specs can be built in parallel if the following contracts are respected:

### 1. Dependency Installation (Perf Spec Owns)

The perf spec is responsible for installing and configuring:
- `@tanstack/react-query@^5`
- `@tanstack/react-virtual`
- `QueryClientProvider` in `app/admin/layout.tsx`

If the sequences work starts first, it should install these deps and set up the provider. Whichever lands first, the other rebases onto it.

### 2. Query Key Factory (Additive, No Conflicts)

`lib/queries/query-keys.ts` is a single file both specs write to. The convention:

- **Perf spec** creates the file with: `organizations`, `persons`, `enrichment`, `events`, `initiatives`, `savedLists`, `dashboard`
- **Sequences spec** adds: `sequences` (with nested `.all`, `.list`, `.detail`, `.messages`, `.stats`)
- Each domain owns its own top-level key — no cross-domain key collisions possible
- Both must follow the nested `.all` / `.detail` / `.list` pattern for invalidation:

```ts
// Pattern every domain MUST follow:
domainName: {
  all: ["domainName"] as const,                           // invalidates everything in this domain
  list: (filters) => ["domainName", "list", filters],     // specific filtered list
  detail: (id) => ["domainName", "detail", id],           // single entity
  // Add sub-resources as needed:
  subResource: {
    all: ["domainName", "subResource"] as const,
    list: (parentId, filters) => ["domainName", "subResource", parentId, filters],
  },
}
```

**Merge strategy:** Git merge will not conflict because each spec adds different top-level keys. If both branches modify the file, the merge is additive.

### 3. `virtual-table.tsx` Interface Contract

`components/ui/virtual-table.tsx` is created by the perf spec. The sequences spec consumes it for the message queue table. The agreed interface:

```tsx
interface VirtualTableProps<T> {
  rows: T[];
  columns: ColumnDef[];            // { key, header, width, className }
  renderRow: (row: T, index: number, style: React.CSSProperties) => React.ReactNode;
  estimateSize?: number;           // default 36
  overscan?: number;               // default 5
  scrollContainerHeight?: string;  // default "calc(100vh - 280px)"
  onRowClick?: (row: T) => void;
  emptyMessage?: string;
}
```

The sequences spec should use this interface as-is. If the message queue needs row expansion (click-to-expand), that's handled in `renderRow` — the virtual table doesn't need to know about expansion.

> **Implementation note:** `virtual-table.tsx` was implemented as specified (131 LOC, HTML table elements). However, the org and persons tables use CSS Grid + inline `useVirtualizer` instead (see Section 2 implementation notes). For complex tables with many columns and hover/selection interactions, the CSS Grid pattern is preferred. `virtual-table.tsx` remains available for simpler use cases.

### 4. React Query Hook Pattern

All hooks across both specs follow the same pattern:

```ts
// lib/queries/use-{domain}.ts
export function use{Domain}(params) {
  const supabase = createClient();  // from lib/supabase/client.ts
  return useQuery({
    queryKey: queryKeys.{domain}.list(params),
    queryFn: async () => { /* supabase call */ },
    // optional: refetchInterval, select, enabled
  });
}
```

### 5. Files with No Overlap

| File | Perf Spec | Sequences Spec |
|---|---|---|
| `lib/queries/query-keys.ts` | Creates + populates | Extends (additive) |
| `lib/queries/query-provider.tsx` | Creates | Consumes (no changes) |
| `components/ui/virtual-table.tsx` | Creates | Consumes (no changes) |
| `app/admin/layout.tsx` | Wraps in QueryClientProvider | No changes |
| `lib/queries/use-organizations.ts` | Creates | No overlap |
| `lib/queries/use-sequences.ts` | No overlap | Creates |
| `PERFORMANCE.md` | Creates | References as standards |

### 6. Build Order Flexibility

Either spec can land first. The critical path:
- **If perf lands first:** Sequences branch rebases, gets React Query + virtual-table for free, just adds its hooks and keys
- **If sequences lands first:** Must install React Query, create `query-provider.tsx` and `query-keys.ts` with the sequences keys. Perf branch rebases and adds remaining keys + virtual-table + refactors
- **If simultaneous:** Merge is clean — different files except `query-keys.ts` which is additive

---

## Out of Scope

- Zustand / global state management — not needed at current scale
- Supabase Realtime subscriptions — polling via React Query is sufficient
- Server components for data streaming — current SSR pattern works
- Database index optimization — no evidence of slow queries at DB level
- Code splitting with `dynamic()` — route-based splitting from Next.js is sufficient
- React 19 compiler (auto-memoization) — not yet enabled in this project. If enabled later, many manual `React.memo` boundaries become unnecessary, but the architectural changes (React Query, virtualization, component decomposition) remain valuable regardless

---

## Implementation Notes

This section documents what was actually shipped versus the original plan, added post-implementation for accuracy.

### What Was Implemented

All six workstreams were implemented:

1. **React Query data layer** -- Fully implemented. `query-provider.tsx` (20 LOC), `query-keys.ts` (41 LOC), and 8 hook files created under `lib/queries/`. The sequences spec also landed, adding 4 more hook files (`use-sequences.ts`, `use-sequence-detail.ts`, `use-sequence-messages.ts`, `use-sequence-stats.ts`) and extending `query-keys.ts` with the `sequences` domain. QueryClient configuration matches spec exactly.

2. **TanStack Virtual table rendering** -- Implemented with a significant architectural divergence (see below).

3. **Component decomposition** -- All three major decompositions completed (enrichment, organizations, persons). File counts match plan. LOC estimates were significantly under (see below).

4. **Memoized navigation shell** -- Fully implemented as designed. `sidebar.tsx` (269 LOC, wrapped in `React.memo`), `nav-item.tsx` (87 LOC, `React.memo`), `nav-tooltip.tsx` (41 LOC, `React.memo`), `header.tsx` (157 LOC, `React.memo`). `pathname` passed as prop from `AdminShell`, eliminating unnecessary `usePathname()` re-renders.

5. **Targeted fixes** -- Image optimization (`next/image`) applied in `org-table-row.tsx` and `person-table-row.tsx`. Supabase client import standardized to `createClient` from `lib/supabase/client.ts` in the enrichment shell. Index key fixes applied where decomposition touched files.

6. **Best practices** -- Patterns documented in this spec; `PERFORMANCE.md` file creation deferred.

### The CSS Grid Discovery

The most significant divergence from the plan is in table virtualization. The original spec assumed HTML `<table>/<thead>/<tbody>/<tr>/<td>` elements, but this approach has a fundamental incompatibility with virtualization:

**Problem:** TanStack Virtual renders rows with `position: absolute` and `transform: translateY(...)` to position them within a scroll container. When rows are `<tr>` elements inside a `<tbody>`, absolute positioning breaks the table layout algorithm. Furthermore, if the sticky header is a separate `<table>` element (to keep it outside the scroll container), its `<th>` columns have no relationship to the body `<td>` columns, causing misalignment.

**Solution:** Replace `<table>` with `<div>` elements using `display: grid` (via Tailwind's `grid` class). A shared `gridTemplateColumns` constant (e.g., `ORG_GRID_COLS`) is exported from the row component and applied to both the header div and each row div. This guarantees column alignment regardless of positioning, because CSS Grid applies column widths from the template, not from content measurement.

The `virtual-table.tsx` shared primitive (131 LOC) was still created with HTML table elements and works for simple use cases, but the organizations and persons tables use the CSS Grid + inline `useVirtualizer` pattern instead. **For future tables with complex column layouts, the CSS Grid pattern should be preferred.**

### Actual File Sizes vs Estimates

| File | Estimated LOC | Actual LOC | Reason for Difference |
|---|---|---|---|
| `enrichment-shell.tsx` | ~200 | 918 | Run orchestration, progress polling, historical job loading, mobile sidebar overlay, and result state machine all live in the shell. Many `useState` calls that were expected to be eliminated by React Query are still needed for progress/result tracking during active runs. |
| `organizations-table-client.tsx` | ~300 | 647 | 14 filter fields across 4 filter groups, debounced hover preview, shift+click range selection, sort logic, inline virtualizer, active filter chip rendering, selection stats computation, and the sidebar JSX. |
| `persons-table-client.tsx` | ~300 | 852 | 16+ filter state variables with multi-select chip UI, debounced search, correlation computation, ref-based hover preview pattern (zero table re-renders on hover), and extensive filter group JSX. |
| `org-table-row.tsx` | (not estimated) | 233 | Self-contained with duplicated helpers to avoid circular deps. Custom memo comparator. |
| `person-table-row.tsx` | (not estimated) | 341 | Includes exported types, helpers, correlation label computation, and custom memo comparator checking `style.transform`. |

### Pre-existing Type Errors

During implementation, TypeScript errors were observed in `app/admin/sequences/[id]/step-editor.tsx` and related sequence files. These are **pre-existing issues unrelated to the performance optimization work** and were not introduced or modified by this spec's implementation. They should be addressed separately.
