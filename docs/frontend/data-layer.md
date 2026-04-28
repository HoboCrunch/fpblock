# Data Layer Reference

React Query, Supabase clients, hook catalog, and performance patterns for `lib/queries/*` and `lib/supabase/*`.

> **Companion docs**
> - [admin-ui.md](./admin-ui.md) — IA, shell, per-section overview
> - [components.md](./components.md) — primitives, design system, conventions
> - [/PERFORMANCE.md](../../PERFORMANCE.md) — full performance contract

---

## Supabase clients

Three flavors, one source of truth each.

### Browser client — `lib/supabase/client.ts:1-9`

```ts
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

- Used by every hook in `lib/queries/use-*.ts`.
- Used in client components for direct mutations (e.g. `app/login/page.tsx`, `header.tsx`'s `signOut`).
- **Always import from `@/lib/supabase/client`** (`PERFORMANCE.md` §7). Do not call `createBrowserClient` directly.

### Server client — `lib/supabase/server.ts:1-32`

Async, cookie-aware client used in:

- `app/admin/layout.tsx` for the auth check.
- Every server `page.tsx` that does data prep (orgs, persons, events, dashboard, inbox, initiatives, correlations, pipeline).
- API routes under `app/api/**`.

The `setAll` callback wraps `cookieStore.set` in a try/catch — Server Components can't write cookies, so failures are silently ignored (line 24).

### Middleware

`lib/supabase/middleware.ts` — used by `middleware.ts` for the cookie check at the edge. The actual middleware (`middleware.ts:1-20`) does a cheap cookie name scan rather than calling Supabase, so this middleware helper is currently unused by the live edge function.

---

## `fetchAll` — paginated reads — `lib/supabase/fetch-all.ts:1-95`

Wraps Supabase's 1000-row default page limit. Strategy:

1. First page: sequential, with `count: "exact"` if requested. Learns the total.
2. If more pages exist and total is known: fires all remaining offsets via `Promise.all` (true parallel pagination).
3. If total is unknown: falls back to sequential pagination until an empty page.

Signature:

```ts
fetchAll<T>(
  supabase: SupabaseClient,
  table: string,
  select: string,
  options?: {
    order?: { column: string; ascending?: boolean };
    filters?: (query) => query;
    count?: boolean;
  }
): Promise<{ data: T[]; count: number }>
```

Use whenever a query could exceed 1000 rows. Avoid for small fixed-size lists (events, initiatives) — direct queries are simpler.

Note: `lib/queries/use-enrichment-items.ts:78-90` defines its **own** `fetchAll` helper inline — duplicate logic that should call the shared `lib/supabase/fetch-all.ts` instead.

---

## React Query setup

### Provider — `lib/queries/query-provider.tsx:1-21`

Mounted at `app/admin/layout.tsx:27`, **once**, wrapping `<AdminShell>`. The QueryClient is constructed at module scope (line 5) — the same client persists across renders within the admin tree.

```ts
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});
```

Defaults rationale:

- **`staleTime: 30s`** — same data served from cache without refetch for half a minute. After 30s, next read returns cached data immediately and refetches in background.
- **`gcTime: 5min`** — unsubscribed cache entries deleted after 5 min idle.
- **`refetchOnWindowFocus: false`** — explicit. Tab switching does NOT trigger refetches across the app.
- **`retry: 1`** — single retry on failure (default is 3).

There is no `<ReactQueryDevtools>` mounted. Add it in development if needed; not present in source.

### Query key factory — `lib/queries/query-keys.ts:1-47`

All keys go through this object. Hierarchical so prefix-based invalidation works (`PERFORMANCE.md` §1).

```ts
export const queryKeys = {
  organizations: { all, list(filters), detail(id) },
  persons:       { all, list(filters), detail(id) },
  enrichment:    { all, jobs: { all, detail(id) }, items: { all, list(tab, filters) } },
  events:        { all },
  initiatives:   { all },
  savedLists:    { all },
  dashboard:     { stats },
  sequences:     { all, list(filters), detail(id), messages: { all(id), list(id, filters) }, stats(id) },
  eventAffiliations: { all, byEvent(id), personIdsForEvent(id, relation) },
};
```

Rules:

- Always import from `queryKeys` — never write `["organizations"]` inline.
- Use `.all` after mutations to invalidate the entire family.
- Use `.list(filters)` only for queries whose filters affect cached data.
- Use `.detail(id)` for single-entity queries.

**Inconsistency:** `lib/queries/use-org-event-propagation.ts:471-490` uses an inline `["org-event-propagation"]` key not registered in the factory. Same with the test helper in `event-persons.ts`. New code should add the key to the factory.

---

## Hook catalog

All hooks live under `lib/queries/use-*.ts`. Every hook is `"use client"` and returns the standard React Query `UseQueryResult`.

### `useDashboardStats()` — `lib/queries/use-dashboard-stats.ts:16-63`

- **Returns:** `{ organizations, persons, totalInteractions, repliedCount, statusCounts }`
- **Fetches:** parallel — count of `persons`, count of `organizations`, RPC `interaction_status_counts`.
- **Polling:** none.
- **Key:** `queryKeys.dashboard.stats` (no filters).
- **Invalidation:** invalidate `queryKeys.dashboard.stats` after creating an interaction.
- **Note:** Currently NOT used by `app/admin/page.tsx` (the dashboard fetches stats server-side instead). Available for client widgets.

### `useEnrichmentItems({ tab })` — `lib/queries/use-enrichment-items.ts:132-332`

- **Returns:** `{ items: (OrgRow | PersonRow)[], totalCount, categories, sources }`
- **Fetches:** depending on `tab`:
  - `"organizations"` — paginated `organizations` + batched `event_participations` join, builds an `OrgRow[]` with event ids + enrichment status.
  - `"persons"` — paginated `persons_with_icp` view + batched `enrichment_status` from base `persons` + batched event participations, builds a `PersonRow[]`.
- **Polling:** none.
- **Key:** `queryKeys.enrichment.items.list(tab, { tab })`.
- **Invalidation:** triggered by enrichment job completion (the shell calls `invalidateQueries({ queryKey: queryKeys.enrichment.all })`).
- **Note:** Defines a local `fetchAll` and `fetchInBatches` (lines 78-111) instead of using `lib/supabase/fetch-all.ts`. Worth consolidating.

### `useEnrichmentJobs()` — `lib/queries/use-enrichment-jobs.ts:6-32`

- **Returns:** `JobHistoryJob[]`
- **Fetches:** latest 50 from `job_log` filtered to enrichment job types.
- **Polling:** **conditional `refetchInterval`** (lines 27-32). Returns `5000` when any job has status `processing` or `in_progress`, else `false`. Auto-stops when no active jobs remain.
- **Key:** `queryKeys.enrichment.jobs.all`.
- **Invalidation:** after starting a new enrichment batch.

### `useEventPersonIds(eventId, relation)` — `lib/queries/use-event-affiliations.ts:8-21`

- **Returns:** `string[]` of person ids matching a (eventId, relation) tuple.
- **Fetches:** delegates to `getPersonIdsForEvent` in `lib/queries/event-persons.ts`. The relation argument is `"direct" | "org_affiliated" | "either" | "both" | null`.
- **Polling:** none.
- **Key:** `queryKeys.eventAffiliations.personIdsForEvent(eventId, relation)`.
- **Enabled:** only when both args are non-null. Returns empty array otherwise.
- **Used by:** `<EventRelationToggle>` consumers — Persons filter, Sequences enrollment, Enrichment target selector.

### `useEventRelationMap(eventId)` — `lib/queries/use-event-affiliations.ts:23-34`

- **Returns:** `Map<personId, { direct: boolean, viaOrgIds: string[] }>`
- **Fetches:** `getPersonRelationsForEvent` (also in `event-persons.ts`).
- **Polling:** none.
- **Key:** `queryKeys.eventAffiliations.byEvent(eventId)`.

### `useEvents()` — `lib/queries/use-events.ts:6-15`

- **Returns:** `Event[]` ordered by `date_start` ascending.
- **Polling:** none.
- **Key:** `queryKeys.events.all`.
- **Used by:** the event scope dropdown in many places (Persons, Enrichment, Sequences). Also the source for the sidebar's events sub-nav (which gets a server-side prefetched list, not this hook).

### `useInitiatives()` — `lib/queries/use-initiatives.ts:8-19`

- **Returns:** `InitiativeWithEvent[]` (initiative joined with the optional event).
- **Polling:** none.
- **Key:** `queryKeys.initiatives.all`.

### `useOrganizations(params?)` — `lib/queries/use-organizations.ts:7-39`

- **Returns:** `Organization[]`
- **Filter params:** `category`, `enrichmentStatus`, `search` (all optional). Applied server-side via the `filters` callback to the Supabase query builder.
- **Polling:** none.
- **Key:** `queryKeys.organizations.list(params)`.
- **Backed by `fetchAll`** for >1000-row safety.
- **Note:** the canonical "single-table list" hook. Pattern reused for `usePersons` and `useSequences`.

### `usePersons(params?)` — `lib/queries/use-persons.ts:25-55`

- **Returns:** `PersonWithIcp[]` (deduplicated — the view can return duplicates if a person has multiple primary org links).
- **Filter params:** `eventId` _(declared, but not actually applied — bug)_, `source`, `seniority`, `enrichmentStatus`, `search`.
- **Polling:** none.
- **Key:** `queryKeys.persons.list(params)`.
- **Source:** `persons_with_icp` view.
- **Inconsistency:** `eventId` is in the params type but not applied in the filter callback. The Persons list page currently does its filtering server-side in the page.tsx.

### `useSavedLists()` — `lib/queries/use-saved-lists.ts:11-23`

- **Returns:** `SavedList[]` from `saved_lists` table.
- **Polling:** none.
- **Key:** `queryKeys.savedLists.all`.
- **Note:** the inline TODO at line 4 acknowledges that the `saved_lists` table is not yet wired to the rest of the app. The Lists page (`app/admin/lists/page.tsx`) does NOT use this hook — it queries Supabase directly.

### `useSequences(filters)` — `lib/queries/use-sequences.ts:13-128`

- **Returns:** `SequenceWithStats[]` — sequences joined with enrollment counts, interaction counts, next-send timestamp, and event name.
- **Filter params:** `search`, `status[]`, `sendMode`, `eventId`, `initiativeId`, `hasEnrollments`. Some filters apply server-side; `search` and `hasEnrollments` apply client-side.
- **Polling:** none.
- **Key:** `queryKeys.sequences.list(filters)`.
- **Implementation:** parallel fetch of sequences, enrollments, interactions, events; aggregates client-side.

### `useSequenceDetail(id)` — `lib/queries/use-sequence-detail.ts:31-100`

- **Returns:** `SequenceDetail` — sequence + enrollments (with person join) + delivery_stats (counts by status) + per-step stats + linked event/initiative/sender names.
- **Polling:** none.
- **Key:** `queryKeys.sequences.detail(id)`.
- **Enabled:** only when `id` is non-empty.

### `useSequenceMessages(sequenceId, filters)` — `lib/queries/use-sequence-messages.ts:38-104`

- **Returns:** `SequenceMessage[]` from `interactions` joined to `persons`.
- **Filter params:** `status[]`, `step`, `search` (client-side post-filter), `scheduledFrom`, `scheduledTo`.
- **Polling:** **conditional `refetchInterval`** — returns `10_000` when any message has status `sending` or `scheduled`, else `false`. (Note: longer interval than enrichment jobs because send rate is lower.)
- **Key:** `queryKeys.sequences.messages.list(sequenceId, filters)`.

### `useSequenceStats(sequenceId)` — `lib/queries/use-sequence-stats.ts:18-45`

- **Returns:** `SequenceStats` — aggregated counts per status (`draft`, `scheduled`, `sent`, `delivered`, `opened`, `clicked`, `replied`, `bounced`, `failed`, plus `total`).
- **Polling:** none.
- **Key:** `queryKeys.sequences.stats(sequenceId)`.

### `useOrgEventPropagation()` — `lib/queries/use-org-event-propagation.ts:9-30`

- **Returns:** `Record<orgId, count>` — count of distinct events that org has propagated persons into.
- **Polling:** none.
- **Key:** `["org-event-propagation"]` — **inline, not in the query keys factory** (anti-pattern, see "Inconsistencies" below).

### Hook count

The memory note says "8 hooks." The actual count is **13** `lib/queries/use-*.ts` files (counted: dashboard-stats, enrichment-items, enrichment-jobs, event-affiliations [exports 2 hooks], events, initiatives, org-event-propagation, organizations, persons, saved-lists, sequence-detail, sequence-messages, sequence-stats, sequences). The memory note is stale — update it.

---

## Mutation patterns

### Standard mutation — invalidate `.all`

From `app/admin/sequences/sequence-list-client.tsx`:

```ts
const queryClient = useQueryClient();

const deleteMutation = useMutation({
  mutationFn: deleteSequence,
  onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.sequences.all }),
});

const statusMutation = useMutation({
  mutationFn: ({ id, status }) => updateSequenceStatus(id, status),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.sequences.all }),
});
```

The `.all` prefix invalidates every `list(...)`, `detail(id)`, and `stats(id)` cache entry. Brutal but correct. There is no `setQueryData` cache surgery in the admin code.

### Optimistic updates

**None observed** in the current admin codebase. Every mutation invalidates and waits for the refetch. This is acceptable for the dataset size and simplifies error recovery; revisit if perceived latency becomes a problem on hot paths (kanban drag, status toggle).

### Server actions

Mutations are typically wrapped Server Actions (e.g. `app/admin/sequences/actions.ts`, `app/admin/lists/actions.ts`). The client calls the action via `useMutation({ mutationFn: serverAction })` and invalidates on success. This keeps Supabase service-role calls server-side.

---

## Polling patterns

Two hooks poll, both via `refetchInterval` callback (no `setInterval` anywhere in admin code):

| Hook | Interval | Trigger condition |
|---|---|---|
| `useEnrichmentJobs` | 5000 ms | Any job has status `processing` or `in_progress` |
| `useSequenceMessages` | 10000 ms | Any message has status `sending` or `scheduled` |

The pattern: return a number to keep polling, `false` to stop. Polling ends automatically when the trigger condition is no longer met — no cleanup, no leaked intervals.

The job detail page (`app/admin/enrichment/[jobId]/page.tsx`) ALSO polls at 3s but does so via `router.refresh()` and a custom `useEffect` rather than React Query — older code that predates the convention.

---

## Performance patterns

### 1. Virtualization — TanStack Virtual

Only **two** admin tables actually use `useVirtualizer`:

- `app/admin/organizations/organizations-table-client.tsx:292`
- `app/admin/persons/persons-table-client.tsx:321`

Both follow the manual CSS-Grid pattern from `PERFORMANCE.md` §2:

1. Export a `gridTemplateColumns` constant from the row file (`ORG_GRID_COLS`, `PERSON_GRID_COLS`).
2. Header `<div>` uses `display: grid; gridTemplateColumns: ORG_GRID_COLS`.
3. Scroll container with `overflow-y-auto` and a fixed-height calc (`calc(100vh - 280px)`).
4. Inner relative wrapper with `height = virtualizer.getTotalSize()`.
5. Each virtual item rendered as an absolutely-positioned grid `<div>` row, `transform: translateY(virtualItem.start)`.
6. Row component wrapped in `React.memo` with custom comparator.

`overscan: 5` and `estimateSize: () => 36` are the defaults used.

Other "tables" in the app (events list, enrichment entity table, settings tabs, lists detail) are **not** virtualized. Some use HTML `<table>` (see [components.md → Anti-patterns](./components.md#anti-patterns-observed)).

### 2. CSS Grid over `<table>` — why

`useVirtualizer` positions rows with absolute positioning + transform inside a relative parent. HTML `<table>` cannot host absolutely-positioned `<tr>` elements without breaking layout — the rows would collapse out of the table flow. CSS Grid lets each row be an arbitrary `<div>` while keeping column alignment via the shared `gridTemplateColumns` constant on header and rows.

### 3. Component decomposition

The shell pattern documented in `PERFORMANCE.md` §3 is implemented in:

- `app/admin/admin-shell.tsx` (44 LOC) → `Sidebar` + `Header` + `<main>`
- `app/admin/enrichment/enrichment-shell.tsx` (988 LOC, oversize) → `center-panel`, `config-panel`, `filter-bar`, `job-history`, `entity-table`, `summary-strip`, `status-icons`

Other large client components (Lists 994 LOC, Settings 928 LOC, Persons table 898 LOC, Orgs table 661 LOC) are **not** decomposed. The pattern is aspirational, not yet enforced.

### 4. Memo'd nav

Sidebar, Header, NavItem, NavTooltip are all `React.memo`'d. `usePathname()` is called once in `admin-shell.tsx:17` and forwarded as a prop. When the user navigates, only:

- `<AdminShell>` re-renders (new pathname value)
- The previously-active and newly-active `<NavItem>` re-render (their `active` prop flipped)
- `<Header>` re-renders (its `pathname` prop changed → breadcrumb updates)

The other ~10 nav items skip rendering entirely.

### 5. Stale-while-revalidate UX

With `staleTime: 30s`:

- First mount of `useOrganizations()` triggers a network fetch. UI shows loading state.
- Within 30s, switching to another section and back returns the cached data instantly.
- After 30s, the cached data still renders immediately while a background refetch runs.
- After 5 min unmounted, the cache entry is GC'd; next mount is a cold fetch again.

This is the default behavior — no extra opt-in required.

---

## Anti-patterns observed

### Pages that bypass React Query

Three sections still fetch via `useState` + `useEffect` + `createClient` directly:

- `app/admin/lists/page.tsx`
- `app/admin/settings/page.tsx`
- `app/admin/uploads/page.tsx`

`PERFORMANCE.md` §1 forbids this. Migrate when convenient.

### Inline query keys

`use-org-event-propagation.ts:13` uses `["org-event-propagation"]` directly. Add to `queryKeys` factory before adding any related mutation/invalidation logic — otherwise invalidation by prefix won't work for this hook.

### Duplicated `fetchAll` helpers

`lib/queries/use-enrichment-items.ts:78-90` re-implements `fetchAll` locally. The shared `lib/supabase/fetch-all.ts` does the same job (and better — parallel pagination once total is known). Consolidate.

### Manual `setInterval` polling on the job detail page

`app/admin/enrichment/[jobId]/page.tsx` / `job-results-client.tsx` uses `router.refresh()` on a timer. `PERFORMANCE.md` §1 says: "Never use `setInterval`." Migrate this page to `refetchInterval` once the data is moved into a React Query hook.

### `usePersons.eventId` filter declared but unused

`lib/queries/use-persons.ts:34` accepts an `eventId` filter that is never applied to the Supabase query. Either implement it or remove it from the params type.

---

## Adding a new query

1. Create `lib/queries/use-<name>.ts` with `"use client"` directive.
2. Add a key namespace to `lib/queries/query-keys.ts`. For a single-table list: `{ all, list(filters), detail(id) }` is the canonical shape.
3. Inside the hook, call `createClient()` from `@/lib/supabase/client`.
4. Use `useQuery({ queryKey: queryKeys.<ns>.list(params), queryFn })`. Pass the params through the `queryKey` so cache-by-filter works.
5. If the table can exceed 1000 rows, use `fetchAll` from `lib/supabase/fetch-all.ts` — do NOT re-implement.
6. If the data is intermittently changing (running jobs, scheduled sends), add a conditional `refetchInterval` callback that returns `false` once the trigger condition is gone.
7. For mutations, use `useMutation` and invalidate `queryKeys.<ns>.all` in `onSuccess`. Avoid `setQueryData` unless implementing optimistic updates.

---

## Glossary

- **Stale time** — duration after a successful fetch during which the cached data is considered fresh. No refetch occurs while fresh.
- **GC time** — duration after a query has zero active subscribers before its cache entry is deleted.
- **Invalidation** — marking a cache entry stale, which triggers an immediate background refetch if the query is currently subscribed.
- **Prefix invalidation** — passing a key like `["sequences"]` invalidates `["sequences", "list", ...]`, `["sequences", "detail", id]`, etc. The hierarchical query key factory exists to enable this.
- **Conditional `refetchInterval`** — a function form of `refetchInterval` that receives the current query state and returns either the next polling interval (ms) or `false` to stop. Replaces `setInterval`.
- **`fetchAll`** — the shared helper that paginates past Supabase's 1000-row default by firing all remaining offsets in parallel after learning the total count.
