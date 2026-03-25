# Performance & Architecture Guide

This is the authoritative reference for building features in this admin application. Every pattern here is backed by a real file in the codebase. Read this before writing new code.

---

## 1. Data Fetching

### React Query is the only way to fetch data client-side

All client-side data fetching goes through React Query hooks in `lib/queries/`. No exceptions.

A hook follows this exact pattern — `useOrganizations` (`lib/queries/use-organizations.ts`) is the canonical example:

```ts
"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { queryKeys } from "./query-keys";
import type { Organization } from "@/lib/types/database";

export function useOrganizations(params?: UseOrganizationsParams) {
  const supabase = createClient();

  return useQuery({
    queryKey: queryKeys.organizations.list(params as Record<string, unknown>),
    queryFn: async () => {
      const { data } = await fetchAll<Organization>(
        supabase,
        "organizations",
        "*",
        {
          order: { column: "name", ascending: true },
          filters: params
            ? (query) => {
                let q = query;
                if (params.category) q = q.eq("category", params.category);
                if (params.search) q = q.ilike("name", `%${params.search}%`);
                return q;
              }
            : undefined,
        },
      );
      return data;
    },
  });
}
```

Consumers call the hook and destructure:

```ts
const { data: orgs = [], isLoading } = useOrganizations({ category: "protocol" });
```

### Query key factory

All query keys live in `lib/queries/query-keys.ts`. The structure is hierarchical:

```ts
export const queryKeys = {
  organizations: {
    all: ["organizations"] as const,                          // broadest — invalidates everything
    list: (filters?) => ["organizations", "list", filters],   // invalidates filtered lists
    detail: (id: string) => ["organizations", "detail", id],  // single entity
  },
  enrichment: {
    all: ["enrichment"] as const,
    jobs: {
      all: ["enrichment", "jobs"] as const,
      detail: (id: string) => ["enrichment", "jobs", id] as const,
    },
    items: {
      all: ["enrichment", "items"] as const,
      list: (tab, filters?) => ["enrichment", "items", tab, filters] as const,
    },
  },
};
```

**Why this exists:** React Query matches keys by prefix. When you call `invalidateQueries({ queryKey: queryKeys.organizations.all })`, it invalidates `.all`, every `.list(...)` variant, and every `.detail(...)`. This means a mutation that changes organization data can invalidate a single prefix key and every cache entry refreshes — no stale data anywhere.

**Rules:**
- Always import from `queryKeys`. Never write `["organizations"]` inline.
- Use `.all` for broad invalidation after mutations.
- Use `.list(filters)` when filters affect the query.
- Use `.detail(id)` for single-entity fetches.

### Polling with refetchInterval

Never use `setInterval`. React Query's `refetchInterval` handles polling with automatic cleanup. The enrichment jobs hook (`lib/queries/use-enrichment-jobs.ts`) shows the conditional polling pattern:

```ts
return useQuery({
  queryKey: queryKeys.enrichment.jobs.all,
  queryFn: async () => { /* ... */ },
  refetchInterval: (query) => {
    const jobs = query.state.data ?? [];
    const hasProcessing = jobs.some(
      (j) => j.status === "processing" || j.status === "in_progress"
    );
    return hasProcessing ? 5000 : false;  // poll at 5s while active, stop when idle
  },
});
```

The callback receives the current query state. Return a number (ms) to poll, or `false` to stop. This means polling starts automatically when processing jobs appear and stops when they complete — no manual cleanup, no leaked intervals.

### Mutations

Use `useMutation` + `invalidateQueries` with the `.all` prefix key. From `app/admin/sequences/sequence-list-client.tsx`:

```ts
const queryClient = useQueryClient();

const deleteMutation = useMutation({
  mutationFn: deleteSequence,
  onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.sequences.all }),
});

const statusMutation = useMutation({
  mutationFn: ({ id, status }: { id: string; status: string }) =>
    updateSequenceStatus(id, status),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.sequences.all }),
});
```

**Rules:**
- `onSuccess` invalidates the relevant `.all` key so all related queries refetch.
- Never manually update cache state with `setQueryData` unless you need optimistic updates — prefer invalidation.

### Stale-while-revalidate defaults

The QueryClient in `lib/queries/query-provider.tsx` sets these defaults:

```ts
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,      // data considered fresh for 30s
      gcTime: 5 * 60_000,     // unused cache entries garbage collected at 5min
      refetchOnWindowFocus: false,  // disabled — we control refetching explicitly
      retry: 1,               // one retry on failure
    },
  },
});
```

This means: after a query fetches, the same data is served from cache for 30 seconds without re-fetching. After 30s, the next consumer gets the cached data immediately (stale-while-revalidate) while a background refetch runs. After 5 minutes with zero active subscribers, the cache entry is garbage collected.

`refetchOnWindowFocus: false` is intentional — we don't want every tab switch triggering refetches across the app.

### fetchAll: parallel pagination past 1000 rows

Supabase limits responses to 1000 rows. `lib/supabase/fetch-all.ts` handles this transparently:

1. Fetches the first page (0–999) sequentially to learn the total count.
2. If more pages exist and count is known, fires **all remaining pages in parallel** via `Promise.all`.
3. Falls back to sequential pagination if count is unavailable.

```ts
const { data } = await fetchAll<Organization>(supabase, "organizations", "*", {
  order: { column: "name", ascending: true },
  filters: (query) => query.eq("category", "protocol"),
});
```

**When to use:** Any query that could return >1000 rows. For small datasets (e.g., events, initiatives), direct Supabase queries with `.limit()` are fine.

### Anti-patterns

| Do NOT | Do instead |
|---|---|
| `useState` + `useEffect` for fetching | `useQuery` hook in `lib/queries/` |
| `setInterval` for polling | `refetchInterval` on the query |
| `["organizations"]` inline as key | `queryKeys.organizations.all` |
| `.select("*")` without justification | Select only needed columns |
| Fetch inside a component body | Extract to a `use-*.ts` hook |

---

## 2. Table Virtualization

### CSS Grid, not HTML tables

Tables in this app use CSS Grid for column alignment. This is required because `useVirtualizer` positions rows with absolute positioning inside a relative container — HTML `<table>` cannot support this. Header and body rows share a single `gridTemplateColumns` constant exported from the row component.

### The pattern

**Step 1: Export a grid columns constant** (`app/admin/organizations/org-table-row.tsx`):

```ts
export const ORG_GRID_COLS =
  "40px minmax(160px,2fr) 56px 72px minmax(120px,1.5fr) 64px minmax(80px,1fr) 80px minmax(80px,1fr) 80px";
```

**Step 2: Grid header div** (`app/admin/organizations/organizations-table-client.tsx`):

```tsx
<div
  className="grid text-sm text-left text-[var(--text-muted)] border-b border-[var(--glass-border)]"
  style={{ gridTemplateColumns: ORG_GRID_COLS }}
>
  <div className="px-2 py-3">...</div>
  <SortHeader label="Name" field="name" />
  {/* ... */}
</div>
```

**Step 3: Virtualizer scroll container**:

```tsx
const scrollRef = useRef<HTMLDivElement>(null);

const virtualizer = useVirtualizer({
  count: filteredRows.length,
  getScrollElement: () => scrollRef.current,
  estimateSize: () => 36,    // estimated row height in px
  overscan: 5,               // render 5 extra rows above/below viewport
});

<div ref={scrollRef} className="overflow-y-auto" style={{ height: "calc(100vh - 280px)" }}>
  {filteredRows.length === 0 ? (
    <EmptyState />
  ) : (
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
            {/* ... */}
          />
        );
      })}
    </div>
  )}
</div>
```

**Step 4: Grid row divs** in the row component:

```tsx
<div
  role="row"
  className="grid items-center text-sm ..."
  style={{ ...style, gridTemplateColumns: ORG_GRID_COLS }}
>
  <div className="px-2 py-2">...</div>
  <div className="px-2 py-2">...</div>
  {/* cells match header columns exactly */}
</div>
```

### Row positioning

Every virtual row is positioned absolutely inside a relative container. The container's height equals `virtualizer.getTotalSize()` (total scrollable height). Each row uses `transform: translateY(${virtualItem.start}px)` for its vertical position. This is how TanStack Virtual works — do not use `top` instead of `transform`.

### When to virtualize

- **>100 potential rows:** Always virtualize. Every table in this app that shows entities (orgs, persons, enrichment items, sequences) must use `useVirtualizer`.
- **<100 rows:** Virtualization is optional. Small lists (events, saved lists, config panels) can render directly.

### Generic VirtualTable

`components/ui/virtual-table.tsx` provides a reusable `<VirtualTable>` component with column definitions and a `renderRow` callback. Use this for simpler tables that don't need the full custom grid pattern. For complex tables with sorting, selection, and custom column widths, use the manual pattern from organizations.

### Row memoization

Every row component must be wrapped in `React.memo` with a custom comparator. From `org-table-row.tsx`:

```tsx
export const OrgTableRow = memo(
  function OrgTableRow({ row, index, isSelected, isHovered, ... }: OrgTableRowProps) {
    return ( /* ... */ );
  },
  (prev, next) =>
    prev.row.id === next.row.id &&
    prev.isSelected === next.isSelected &&
    prev.isHovered === next.isHovered &&
    prev.index === next.index &&
    prev.row === next.row
);
```

The custom comparator prevents re-renders when only unrelated props change. Compare by identity (`===`) for objects and by value for primitives.

---

## 3. Component Architecture

### Decomposition principle

Client components should be under 300 lines. When a page grows beyond this, decompose using the **shell pattern**: a thin server page renders a client orchestrator ("shell"), which composes memo'd sub-components.

### The shell pattern

The enrichment page demonstrates this:

```
app/admin/enrichment/page.tsx          → server page, renders <EnrichmentShell />
app/admin/enrichment/enrichment-shell.tsx  → client orchestrator (state + data + layout)
  ├── components/center-panel.tsx      → memo'd, owns its internal UI state
  ├── components/config-panel.tsx      → memo'd, exposes changes via callbacks
  ├── components/job-history.tsx       → memo'd, receives data as props
  └── components/filter-bar.tsx        → memo'd, owns filter input state
```

`enrichment-shell.tsx` owns all shared state (selected IDs, active tab, running status, filter state, config state) and passes it down. Sub-components own their local UI state (hover states, expanded sections, internal toggles) and expose changes through callback props.

### State ownership

- **Parent (shell):** holds shared state that multiple children need — selections, active tab, filter values, data from React Query hooks.
- **Children:** own their local UI state. A filter bar owns its input debounce state. A row owns its hover state. A config panel owns its expanded/collapsed sections.
- **Communication:** children call parent-provided callbacks (`onSelectionChange`, `onFiltersChange`, `onRun`). Never pass `setState` functions directly — wrap in a named callback.

### Memo boundaries

Wrap sub-components in `React.memo`. Pass stable callbacks with `useCallback`:

```tsx
// In the shell:
const handleSelectionChange = useCallback((ids: Set<string>) => {
  setSelectedIds(ids);
}, []);

const handleSelectJob = useCallback(async (jobId: string) => {
  // ...
}, []);

// In JSX:
<CenterPanel
  selectedIds={selectedIds}
  onSelectionChange={handleSelectionChange}
/>
```

If a callback depends on other state, include it in the dependency array — but prefer structuring so callbacks are stable.

---

## 4. Navigation Shell

### Architecture

The admin layout uses a memo'd shell pattern:

```
app/admin/layout.tsx        → server layout, renders AdminShell
components/admin/admin-shell.tsx → client component, owns usePathname()
  ├── components/admin/sidebar.tsx  → React.memo'd
  ├── components/admin/header.tsx   → React.memo'd
  └── components/admin/nav-item.tsx → React.memo'd
```

`usePathname()` lives only in `admin-shell.tsx`. The pathname is passed as a prop to `Sidebar`. This means the sidebar does not subscribe to route changes directly — it only re-renders when `admin-shell` passes a new pathname.

### NavItem isolation

`NavItem` (`components/admin/nav-item.tsx`) is extracted and individually memo'd. When the user navigates, only the previously-active and newly-active `NavItem` instances re-render. The other ~12 nav items skip rendering entirely because their `active` prop hasn't changed.

### Stable callbacks

All callbacks passed to shell components must use `useCallback`:

```tsx
// In Sidebar:
const isActive = useCallback(
  (href: string) => {
    if (href === "/admin") return pathname === "/admin";
    return pathname.startsWith(href);
  },
  [pathname]
);

const handleNavClick = useCallback(() => onClose(), [onClose]);
```

---

## 5. Images

### Always use next/image

```tsx
import Image from "next/image";

{row.logo_url ? (
  <Image
    src={row.logo_url}
    alt={row.name}
    width={24}
    height={24}
    className="w-6 h-6 rounded object-cover flex-shrink-0"
  />
) : (
  <div className="w-6 h-6 rounded bg-[var(--glass-bg)] border border-[var(--glass-border)] flex items-center justify-center text-[10px] font-bold text-[var(--text-muted)]">
    {row.name.charAt(0).toUpperCase()}
  </div>
)}
```

**Rules:**
- Always provide `width` and `height`, or use `fill` with a sized container.
- Never use raw `<img>` tags.
- Handle null/missing URLs with a fallback div (initials, icon, or placeholder).
- External image domains must be listed in `remotePatterns` in `next.config.ts`.

---

## 6. Keys

Always use stable, unique identifiers as React keys:

```tsx
// Correct: database ID
{rows.map((row) => <OrgTableRow key={row.id} ... />)}

// Correct: composite key when no single ID exists
{events.map((ev) => <Badge key={ev.id || `${ev.name}-${ev.role}`} ... />)}

// WRONG: never use array index
{rows.map((row, i) => <OrgTableRow key={i} ... />)}
```

Index keys cause incorrect reconciliation when rows are sorted, filtered, or reordered — components keep stale state from the wrong row.

---

## 7. Supabase Client

Always import from the centralized module:

```ts
import { createClient } from "@/lib/supabase/client";
```

This file (`lib/supabase/client.ts`) wraps `createBrowserClient` from `@supabase/ssr` with the project's env vars. Never call `createBrowserClient` directly in a component — always go through `@/lib/supabase/client`.

---

## 8. New Page / Feature Checklist

Before shipping, verify every item:

### Data
- [ ] All client-side data fetched via a React Query hook in `lib/queries/`
- [ ] Query keys use `queryKeys` factory from `lib/queries/query-keys.ts`
- [ ] Mutations use `useMutation` + `invalidateQueries` with `.all` prefix
- [ ] No `useState` + `useEffect` for data fetching
- [ ] No `setInterval` — polling uses `refetchInterval`
- [ ] Large datasets (>1000 rows possible) use `fetchAll`
- [ ] No `select("*")` without justification — select only needed columns

### Tables
- [ ] Tables with >100 potential rows use `useVirtualizer`
- [ ] Header and body share a single exported `gridTemplateColumns` constant
- [ ] Rows are CSS Grid divs, not HTML `<table>`/`<tr>`/`<td>`
- [ ] Row components are `React.memo`'d with a custom comparator
- [ ] Row keys are stable IDs, never `key={index}`

### Components
- [ ] Client components are under 300 LOC (or decomposed with shell pattern)
- [ ] Shell component owns shared state; sub-components own local state
- [ ] Sub-components wrapped in `React.memo`
- [ ] Callbacks passed as props use `useCallback`

### Navigation
- [ ] If touching the shell: `usePathname()` only in `admin-shell.tsx`
- [ ] Shell sub-components (sidebar, header) remain `React.memo`'d

### Images
- [ ] All images use `next/image` with explicit `width`/`height`
- [ ] Null image URLs have fallback divs
- [ ] External domains added to `remotePatterns` in `next.config.ts`

### Supabase
- [ ] Client imported from `@/lib/supabase/client`, never inlined
