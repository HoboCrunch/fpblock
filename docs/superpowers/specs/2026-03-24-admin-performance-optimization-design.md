# Admin Application Performance Optimization

**Date:** 2026-03-24
**Status:** Approved
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

### Shared Primitive

```
components/ui/
  └── virtual-table.tsx
```

A reusable wrapper around `useVirtualizer`:
- Accepts: `rows`, `estimateSize` (default 36px), `renderRow`, `columns` (for header), `scrollContainerHeight`
- Supports dynamic row heights via TanStack Virtual's `measureElement` ref callback — rows that exceed 36px (e.g., multi-line event badges) are measured after render and the virtualizer adjusts. Row content should still be constrained with `line-clamp` or truncation where practical to keep heights consistent.
- Renders: sticky `<thead>` outside scroll container, virtualized `<tbody>` inside
- Handles: overscan (5 rows), scroll restoration, total height spacer

### Per-Table Application

| Table | Rows | Action |
|---|---|---|
| Organizations | 200-500+ | Virtualize via `virtual-table.tsx` |
| Persons | 500-1000+ | Virtualize via `virtual-table.tsx` |
| Enrichment entities | 200-1000+ | Virtualize via `virtual-table.tsx` |
| Pipeline | <100 | Skip — not worth complexity |
| Initiatives | <50 | Skip |
| Events | <50 | Skip |

### Integration Pattern

Existing `useMemo` filter/sort logic stays. The virtualizer windows into the sorted array:

```tsx
const virtualizer = useVirtualizer({
  count: filteredRows.length,
  getScrollElement: () => scrollRef.current,
  estimateSize: () => 36,
  overscan: 5,
});

// Render only visible rows
{virtualizer.getVirtualItems().map((virtualItem) => (
  <MemoizedRow
    key={filteredRows[virtualItem.index].id}
    row={filteredRows[virtualItem.index]}
    style={{ transform: `translateY(${virtualItem.start}px)` }}
  />
))}
```

### Preserved Behaviors

- Shift+click range selection — indexes into `filteredRows` array, unaffected
- Hover preview cards — triggered by mouseover on visible rows
- Sticky header — rendered outside scroll container
- Keyboard navigation — virtualizer handles scroll-to-index

---

## 3. Component Decomposition

### Enrichment Page (1207 LOC → ~5 files)

```
app/admin/enrichment/
  ├── page.tsx                  — Server component (minimal, renders shell)
  ├── enrichment-shell.tsx      — Client orchestrator (~200 LOC)
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

**State redistribution:** The current ~38 `useState` calls split as:
- ~10 remain in `enrichment-shell.tsx` (shared state: activeTab, selectedIds, sidebarOpen, centerState, target, eventId, initiativeId, icpThreshold, savedListId, sortKey/sortDir)
- ~18 eliminated by React Query (data states: allItems, totalCount, itemsLoading, events, initiatives, savedLists, jobs, isRunning, activeJobId, jobStartTime, progressData, activeStages, progressCompleted, progressTotal, resultStats, resultOutcomes, queuedItems, viewingJobId)
- ~10 pushed into sub-components that own them:
  - Filter state → `filter-bar.tsx` (filters, categories, sources)
  - Stage selection → `config-panel.tsx` (stages, personFields, pfPerCompany, pfSeniorities, pfDepartments)

**Also in scope:** `app/admin/enrichment/[jobId]/job-results-client.tsx` — contains `setInterval` polling (2.5-3s) and `key={i}` anti-patterns. Gets React Query migration and key fixes.

### Organizations Table (837 LOC → ~3 files)

```
app/admin/organizations/
  ├── organizations-table-client.tsx  — Orchestrator (~300 LOC)
  ├── org-table-row.tsx               — React.memo'd row
  └── org-preview-card.tsx            — Already memoized, extracted to own file
```

### Persons Table (1199 LOC → ~3 files)

```
app/admin/persons/
  ├── persons-table-client.tsx  — Orchestrator (~300 LOC)
  ├── person-table-row.tsx      — React.memo'd row
  └── person-preview-panel.tsx  — Extracted preview/detail panel
```

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

## Out of Scope

- Zustand / global state management — not needed at current scale
- Supabase Realtime subscriptions — polling via React Query is sufficient
- Server components for data streaming — current SSR pattern works
- Database index optimization — no evidence of slow queries at DB level
- Code splitting with `dynamic()` — route-based splitting from Next.js is sufficient
- React 19 compiler (auto-memoization) — not yet enabled in this project. If enabled later, many manual `React.memo` boundaries become unnecessary, but the architectural changes (React Query, virtualization, component decomposition) remain valuable regardless
