# Admin UI Reference

Information architecture, shell, and per-section overview for the `/admin/*` Next.js 16 app.

> **Companion docs**
> - [components.md](./components.md) — primitives, design system, conventions
> - [data-layer.md](./data-layer.md) — React Query, hooks, Supabase clients
> - [/PERFORMANCE.md](../../PERFORMANCE.md) — performance contract (virtualization, memoization)

---

## Stack

- **Next.js 16** (App Router) — `app/` directory
- **React 19**
- **Tailwind CSS 4** — `@import "tailwindcss"` in `app/globals.css:1`, theme tokens declared inline via `@theme inline`
- **TanStack Query** v5 — `lib/queries/query-provider.tsx`
- **TanStack Virtual** — `@tanstack/react-virtual` for table virtualization
- **Supabase Auth + Postgres** via `@supabase/ssr`
- **lucide-react** for icons (only icon library in use)
- **Poppins** (heading) + **Inter** (body) + **Geist Mono**, loaded in `app/layout.tsx:1-19`

---

## Top-level routes

The app has three entry points outside `/admin`:

| Path | File | Purpose |
|---|---|---|
| `/` | `app/page.tsx` | Marketing landing page |
| `/login` | `app/login/page.tsx` | Email/password Supabase Auth form |
| `/jb`, `/wes` | `app/(public)/jb/page.tsx`, `app/(public)/wes/page.tsx` | Public personal landing pages — render outside the admin shell via the `(public)` route group, whose layout (`app/(public)/layout.tsx`) is a pass-through `<>{children}</>` |
| `/plan`, `/data` | `app/plan`, `app/data` | Auxiliary surfaces |

`/admin/*` is the admin CRM. All admin routes share the `AdminShell` (sidebar + header + main).

---

## Auth gating

Two layers, complementary:

### 1. Edge middleware — `middleware.ts:1-20`

```ts
const hasAuthCookie = request.cookies.getAll().some(
  (c) => c.name.startsWith("sb-") && c.name.endsWith("-auth-token")
);
if (!hasAuthCookie && request.nextUrl.pathname.startsWith("/admin")) {
  return NextResponse.redirect(/login);
}
```

Matcher: `["/admin/:path*"]`. Cheap cookie presence check at the edge — does **not** validate the session.

### 2. Server layout — `app/admin/layout.tsx:11-19`

```ts
const supabase = await createClient();
const { data: { user } } = await supabase.auth.getUser();
if (!user) redirect("/login");
```

This runs on every admin request. The middleware avoids a server round-trip when the cookie is plainly missing; the layout call to `getUser()` enforces an actual valid session. Both are required — middleware alone does not guarantee a live session.

The login page (`app/login/page.tsx:1-33`) is intentionally outside the admin layout so it does not trigger the redirect-to-login loop.

---

## Information architecture

Sidebar nav data is declared in `components/admin/sidebar.tsx:30-47`:

| Section | URL | Icon (lucide) | File(s) |
|---|---|---|---|
| Dashboard | `/admin` | `LayoutDashboard` | `app/admin/page.tsx` |
| Persons | `/admin/persons` | `Users` | `app/admin/persons/page.tsx` + `persons-table-client.tsx` |
| Lists | `/admin/lists` | `List` | `app/admin/lists/page.tsx` (single client file, 994 LOC) |
| Organizations | `/admin/organizations` | `Building2` | `app/admin/organizations/page.tsx` + `organizations-table-client.tsx` |
| Events | `/admin/events` | `Calendar` (sub-items: events list inline) | `app/admin/events/page.tsx` + `events-table-client.tsx` |
| Pipeline | `/admin/pipeline` | `Kanban` | `app/admin/pipeline/page.tsx` (renders `PipelineView`) |
| Initiatives | `/admin/initiatives` | `Rocket` | `app/admin/initiatives/page.tsx` + `initiatives-list-client.tsx` |
| Sequences | `/admin/sequences` | `GitBranch` | `app/admin/sequences/page.tsx` (thin) → `sequence-list-client.tsx` |
| Inbox | `/admin/inbox` | `Mail` | `app/admin/inbox/page.tsx` + `inbox-client.tsx` |
| Enrichment | `/admin/enrichment` | `Sparkles` | `app/admin/enrichment/page.tsx` (Suspense wrapper) → `enrichment-shell.tsx` (988 LOC) |
| Correlations | `/admin/correlations` | `GitMerge` | `app/admin/correlations/page.tsx` + `<CorrelationReview>` |
| Uploads | `/admin/uploads` | `Upload` | `app/admin/uploads/page.tsx` |
| Settings | `/admin/settings` | `Settings` (in `bottomNavItems`) | `app/admin/settings/page.tsx` (928 LOC, single client file) |

The Events nav item has `hasSubItems: true` and expands inline to show every event from the `events` table — the events list is fetched server-side in `app/admin/layout.tsx:21-24` and passed down through `AdminShell` props.

---

## Shell components

```
app/admin/layout.tsx (server)
  └── <QueryProvider>            lib/queries/query-provider.tsx
        └── <AdminShell>          app/admin/admin-shell.tsx
              ├── <Sidebar>       components/admin/sidebar.tsx        (memo)
              │     └── <NavItem> components/admin/nav-item.tsx       (memo)
              │           └── <NavTooltip> components/admin/nav-tooltip.tsx (memo)
              ├── <Header>        components/admin/header.tsx          (memo)
              │     └── <Breadcrumb> components/admin/breadcrumb.tsx
              └── <main>{children}</main>
```

### `app/admin/admin-shell.tsx:8-43`

- Client component, mounted directly under the server layout.
- Owns `usePathname()` (line 17) — the **only** call site for the pathname hook in the shell. Pathname is passed as a prop down to both `Sidebar` and `Header`, so they don't subscribe to route changes individually.
- Owns the `mobileOpen` state (line 18) used by the mobile overlay sidebar.
- Wraps both `handleClose` and `handleMenuToggle` in `useCallback` (lines 20-21) so memoized children don't re-render on every mount.
- Layout: flex row, `h-screen overflow-hidden bg-[var(--bg-app)]`.

### `components/admin/sidebar.tsx:51-270`

- `memo`'d component. Width: `w-[248px]` expanded, `w-16` collapsed (`tsx:101`).
- Three viewport modes:
  - Mobile (`max-md`): fixed overlay, slides in via `translate-x` (`tsx:103-107`); backdrop at `tsx:88-94`.
  - Tablet (`max-lg`): forced collapsed (`tsx:102`); media query also drives icon-only tooltips (`tsx:76-83`).
  - Desktop: `collapsed` toggleable via the bottom-of-sidebar Collapse button (`tsx:249-265`).
- The Events sub-nav uses a CSS-grid expand/collapse trick (`subnav-grid` defined in `globals.css:88-101`) so the open/close transition animates `grid-template-rows` from `0fr` → `1fr` without measuring height.
- All callbacks (`isActive`, `handleNavClick`) are `useCallback`-stable (`tsx:65-73`).

### `components/admin/nav-item.tsx:16-88`

- Each nav item is independently memoized — the comparator uses identity equality on the `item` and `active` props, so navigating only re-renders the previously- and newly-active rows.
- Renders the active orange bar indicator (`tsx:52-57`) and an icon glow when active (`tsx:60-67`).
- When collapsed/tablet, the label width animates to 0 and `<NavTooltip>` shows on hover.

### `components/admin/header.tsx:27-157`

- Memo'd. 14-row sticky header. Receives `pathname` from `AdminShell` and forwards to `<Breadcrumb>` (`tsx:69`).
- Mobile menu button (`tsx:63-68`) wired to `onMenuToggle`.
- User avatar + dropdown with sign-out (calls `supabase.auth.signOut()` at `tsx:42`, then `router.push("/login")` + `router.refresh()`).

### `components/admin/breadcrumb.tsx`

- Maps URL segments to labels via the `labelMap` dictionary at `tsx:10-26`.
- Skips the leading `admin` segment so breadcrumbs start at the section level.
- Detail pages (UUIDs) fall through to `decodeURIComponent(segment)` — long IDs render as raw UUIDs in the crumb. (Minor UX issue, not addressed by the breadcrumb itself.)

---

## Selection model

### GlassCheckbox — **convention violated**

The memory note claims `GlassCheckbox` is a shared selection control. It is **not extracted** to `components/ui/`. Instead, the visual is duplicated inline in six places:

| Location | Line |
|---|---|
| `app/admin/persons/person-table-row.tsx:153-168` | exported, the closest thing to canonical |
| `app/admin/organizations/org-table-row.tsx:63` | local function |
| `app/admin/organizations/organizations-table-client.tsx:125` | header's "select all" — duplicated |
| `app/admin/lists/page.tsx:82` | local function |
| `app/admin/enrichment/components/entity-table.tsx:9` | local function |
| `app/admin/events/events-table-client.tsx:94` | local function |

The shape and styles are nearly identical (`bg-[var(--accent-orange)]/20` orange fill when checked, `border-white/20 bg-white/[0.04]` when off, 4×4 with a `<Check>` icon inside). New code should consolidate this into a single `components/ui/glass-checkbox.tsx`.

Persons defines the variant most likely to be promoted because it's already exported (`person-table-row.tsx:153`).

### Selection vs filter distinction

The Enrichment shell makes this explicit:

- **Selection** — explicit row-level checkboxes that build a `Set<string>` of IDs the user has consciously picked. Tab switches reset selection to empty (`enrichment-shell.tsx`, target = `selected` after tab change).
- **Filter** — search input, dropdowns, presets ("Failed / Incomplete"). Filters can _populate_ selection (a preset button) but never auto-add to the selection silently.

`SelectionSummary` (`components/admin/selection-summary.tsx`) is the standard footer that renders count + bulk-action buttons when a selection is active.

---

## Per-section overview

### Dashboard — `/admin`

- `app/admin/page.tsx` — server component, fetches stats directly via `createClient()` from `lib/supabase/server.ts`.
- Renders `<StatCard>` ×4 (`components/ui/stat-card.tsx`), `<PipelineBar>` (`components/admin/pipeline-bar.tsx`), `<ActivityFeed>` (`components/admin/activity-feed.tsx`).
- Uses local `STATUS_RANK` and `statusToStage` helpers (`page.tsx:9-35`) to compute the most-advanced status per person.
- Note: dashboard does NOT use `useDashboardStats` even though that hook exists at `lib/queries/use-dashboard-stats.ts` — server-side fetching is preferred here for the initial page paint.

### Persons — `/admin/persons`

- Server page (`app/admin/persons/page.tsx`) does heavy data prep (paginated `fetchAll` + batched event participations + correlations) and hands a `PersonRow[]` to `<PersonsTableClient>`.
- Client (`persons-table-client.tsx`, 898 LOC):
  - Uses `useVirtualizer` (`tsx:321`) over a CSS-grid layout. Grid cols exported as `PERSON_GRID_COLS` from `person-table-row.tsx`.
  - Filters: ICP range, has-email, last-interaction status, event scope, organization. Event scope uses `<EventRelationToggle>` (`components/admin/event-relation-toggle.tsx`).
  - Selection: in-place `GlassCheckbox` (re-imported from `person-table-row.tsx:29`).
  - Detail panel: `<PersonPreviewPanel>` (`person-preview-panel.tsx`) on hover.
- Detail page: `app/admin/persons/[id]/page.tsx` + the local `notes-editor.tsx`, `add-to-list-dropdown.tsx` clients.

### Organizations — `/admin/organizations`

- Server page: `app/admin/organizations/page.tsx`. Fetches `organizations`, batched `event_participations`, signal counts, and an event propagation count via `useOrgEventPropagation` indirectly.
- Client (`organizations-table-client.tsx`, 661 LOC):
  - `useVirtualizer` at `tsx:292`, `ORG_GRID_COLS` at `org-table-row.tsx`.
  - Sortable columns; sort state is local.
  - Hover preview: `<OrgPreviewCard>` (`org-preview-card.tsx`).
  - Pulls supplemental data via React Query: `useOrgEventPropagation()` (`tsx:24`).
- Detail page: `app/admin/organizations/[id]/page.tsx` (server) → `client.tsx` (client). The detail page renders `<table>` HTML for sub-grids (signals, people roster, events) — these are small lists where virtualization isn't required.

### Events — `/admin/events`

- Server page builds a list of events with role counts.
- Client (`events-table-client.tsx`) uses an HTML `<table>` (line 577) — **violates** the "CSS Grid not HTML tables" convention. The table is small (one row per event) so it does not exceed the >100-row threshold that mandates virtualization.
- Detail page: `app/admin/events/[id]/page.tsx` — five-tab interface (Speakers, Sponsors, Org-affiliated, Schedule, Initiatives).

### Pipeline — `/admin/pipeline`

- Server page (`app/admin/pipeline/page.tsx`) maps statuses to stages (`statusToStage`), then renders `<PipelineView>` (`components/admin/pipeline-view.tsx`).
- Two views: Kanban (`<KanbanBoard>` + `<KanbanColumn>` using `@hello-pangea/dnd`) and Table (`<PipelineTable>`).
- `actions.ts` server actions move persons between stages.

### Initiatives — `/admin/initiatives`

- Server page → `<InitiativesListClient>` → `<InitiativeTable>` (`components/admin/initiative-table.tsx`).
- Detail page: `app/admin/initiatives/[id]/page.tsx`.

### Sequences — `/admin/sequences`

- Page is one line: `<SequenceListClient />`.
- `sequence-list-client.tsx`:
  - Uses `useSequences(filters)` hook (`tsx:4`) — first React Query consumer in the section.
  - Mutations: `deleteSequence`, `updateSequenceStatus` from `actions.ts`, both wired to `useMutation` with `invalidateQueries(queryKeys.sequences.all)` on success.
  - Layout: `<TwoPanelLayout>` (`components/admin/two-panel-layout.tsx`), `<SequenceRow>` rows, `<SequencePreview>` right pane.
- Detail page: `app/admin/sequences/[id]/page.tsx` → `sequence-detail-client.tsx` + `enrollment-panel.tsx`. Sub-route `/messages` for the message queue.

### Inbox — `/admin/inbox`

- Server page (`app/admin/inbox/page.tsx`) fetches sync state + last 200 inbound emails + person/org joins.
- Client: `inbox-client.tsx`. Two-column layout (email list + email detail).
- Auto-correlation logic is server-side (`/api/inbox/sync` + pg_cron); the client is read/triage only.

### Enrichment — `/admin/enrichment`

This is the most complex client page in the app. Demonstrates the shell pattern from `PERFORMANCE.md` §3.

```
app/admin/enrichment/page.tsx                    (server, Suspense)
└── enrichment-shell.tsx                         (client orchestrator, 988 LOC)
    ├── components/center-panel.tsx              (memo'd)
    ├── components/config-panel.tsx              (memo'd)
    ├── components/job-history.tsx               (memo'd)
    ├── components/filter-bar.tsx                (memo'd)
    ├── components/entity-table.tsx              (memo'd, but uses HTML table)
    ├── components/status-icons.tsx              (per-stage icon renderer)
    └── components/summary-strip.tsx             (results summary)
```

- React Query hooks consumed: `useEnrichmentJobs`, `useEnrichmentItems`, `useEvents`, `useInitiatives`, `useEventPersonIds` (`enrichment-shell.tsx:13-18`).
- Polls `enrichment.jobs` at 5s while any job is processing (`use-enrichment-jobs.ts:361-368`).
- Two tabs: Person Enrichment / Organization Enrichment. Tab switch resets selection and forces target to `selected`.
- Stage selector (Apollo / Perplexity / Gemini / People Finder / Full Pipeline) — independently toggleable; Full Pipeline is just an additive composite, not a special mode.
- `app/admin/enrichment/[jobId]/page.tsx` + `job-results-client.tsx` is the per-job dashboard with stat cards, expandable result cards, retry CTA. Polls every 3s while in-progress.

#### Inconsistency: `entity-table.tsx` uses HTML `<table>`

`app/admin/enrichment/components/entity-table.tsx:224` opens a `<table>` element with `<thead>`/`<tr>`/`<td>` rows. This contradicts the contract in `PERFORMANCE.md` §2 ("CSS Grid, not HTML tables"). It is also not virtualized. For the typical enrichment row count (a few hundred orgs) this is functional but will degrade if the dataset grows; consider migrating to the org/person CSS-grid pattern.

### Correlations — `/admin/correlations`

- Server page → `<CorrelationReview>` (`components/admin/correlation-review.tsx`, 301 LOC).
- Side-by-side comparison of source vs target. Merge/Dismiss actions are server-action backed.

### Uploads — `/admin/uploads`

- Single client component (`app/admin/uploads/page.tsx`).
- Components: `<FileDropzone>`, `<ColumnMapper>`, `Papa` (papaparse) for CSV parsing.
- `actions.ts` exports `importCsvData`.

### Lists — `/admin/lists`

- Single 994-LOC client component (`app/admin/lists/page.tsx`).
- Defines its own `GlassCheckbox` (line 82), `getSupabase()` cached client (line 77), nested list/edit/manage views in one file.
- Does **not** consume any React Query hook — uses `useState` + `useEffect` to fetch lists/persons directly. **Violates** the "all client-side data goes through React Query" rule from `PERFORMANCE.md` §1. Candidate for refactor.

### Settings — `/admin/settings`

- 928-LOC single client component, five tabs via `<Tabs>` (`components/ui/tabs.tsx`).
- Direct Supabase calls + server actions (`actions.ts`); does not use React Query. Same violation as Lists, but slightly more justified since most data is settings singletons fetched once on mount.

---

## Mobile responsiveness

- `md` (768px) breakpoint hides sidebar; opens via the hamburger button in `<Header>` (`tsx:63-68`).
- Sidebar slides via CSS transform on `.sidebar-panel` (`globals.css:108-112`); semi-transparent backdrop closes on tap.
- Main content padding goes from `p-6` → `p-3` (`admin-shell.tsx:37`).
- The header search button + user email label are hidden below `md`.
- Tables are virtualized + use CSS Grid, so they reflow into a single horizontal-scroll container at narrow widths (no min-width forced).

---

## Layout grid background

`app/admin/admin-shell.tsx:37` adds `bg-grid` to `<main>`. The class (defined in `globals.css:34-39`) draws a subtle 48×48 px white grid via two `linear-gradient` backgrounds at 3% opacity. This is the primary visual signature of the admin shell.

---

## Conventions summary

- Server pages do data prep where possible; client components receive serialized props.
- `usePathname()` lives only in `admin-shell.tsx:17`.
- All shell sub-components are memo'd with stable callbacks from `useCallback`.
- Every nav route maps to `lucide` icon — there is no second icon library.
- Any new admin route must:
  1. Live under `app/admin/<slug>/page.tsx`
  2. Be added to `mainNavItems` in `components/admin/sidebar.tsx:30`
  3. Have a label in `components/admin/breadcrumb.tsx` `labelMap`
  4. Pass through the auth gate by virtue of being inside `app/admin/`
