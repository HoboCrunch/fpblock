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
| Contacts | `/admin/contacts?tab=persons\|organizations` | `Users` | `app/admin/contacts/{page.tsx,contacts-tabs-client.tsx}` — hosts both `<PersonsTableClient>` and `<OrganizationsTableClient>` behind a tab toggle. Legacy `/admin/persons` and `/admin/organizations` list routes redirect here. |
| Lists | `/admin/lists` (index) + `/admin/lists/[id]` (detail) | `List` | `app/admin/lists/page.tsx` (index, 218 LOC) + `app/admin/lists/[id]/{page.tsx,list-detail-client.tsx,list-members-table.tsx,list-matches-table.tsx}` |
| Events | `/admin/events` | `Calendar` (sub-items: events list inline) | `app/admin/events/page.tsx` + `events-table-client.tsx` |
| Pipeline | `/admin/pipeline` | `Kanban` | `app/admin/pipeline/page.tsx` (renders `PipelineView`) |
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

- Maps URL segments to labels via the `labelMap` dictionary.
- Skips the leading `admin` segment so breadcrumbs start at the section level.
- UUID segments under a known collection (`events`, `persons`, `organizations`, `lists`) are resolved to the entity's display name via `useEntityName` (`lib/queries/use-entity-name.ts`) — see [data-layer.md → `useEntityName`](./data-layer.md#useentityname). React Query caches the lookup (5min stale), so revisiting a detail page shows the name immediately. Falls back to the raw UUID while loading or if the lookup fails. Names are truncated to 40 chars.
- Supports exactly one resolved entity per crumb trail — the first UUID segment under a `NAMEABLE_PARENTS` collection wins. Nested detail routes (e.g. `/admin/events/{eventId}/something/{otherUuid}`) would need this logic extended.

---

## Selection model

### GlassCheckbox — **convention violated**

The memory note claims `GlassCheckbox` is a shared selection control. It is **not extracted** to `components/ui/`. Instead, the visual is duplicated inline in six places:

| Location | Line |
|---|---|
| `app/admin/persons/person-table-row.tsx:153-168` | exported, the closest thing to canonical |
| `app/admin/organizations/org-table-row.tsx:63` | local function |
| `app/admin/organizations/organizations-table-client.tsx:125` | header's "select all" — duplicated |
| `app/admin/lists/[id]/list-members-table.tsx` | imported from `person-table-row.tsx` |
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

### Contacts — `/admin/contacts`

Unified host for the two list views. The route accepts `?tab=persons|organizations` (default `persons`; unknown values fall back to `persons`). Legacy `/admin/persons` and `/admin/organizations` list routes are reduced to one-line `redirect()` files that point at the new route with the appropriate tab.

- Server page (`app/admin/contacts/page.tsx`) parses `tab` from `searchParams`, then `Promise.all`s `loadPersonRows(supabase)` (`lib/data/load-person-rows.ts`) and `loadOrgRows(supabase)` (`lib/data/load-org-rows.ts`, extracted from the former `organizations/page.tsx`). Both data sets are fetched on every visit — the trade-off is a slightly slower initial paint for instant tab toggles with state preservation.
- Client (`contacts-tabs-client.tsx`):
  - Segmented tab control at the top with row counts (`Persons (237)`, `Organizations (412)`).
  - Tab state is local, mirrored to the URL via `router.replace('/admin/contacts?tab=…', { scroll: false })` for deep-linking and back/forward.
  - Both `<PersonsTableClient>` and `<OrganizationsTableClient>` are mounted; the inactive one is wrapped in a `hidden` div. This is intentional: filters, search, sort, scroll position, and selection survive tab toggles without lifting any state out of the existing table clients.
- Breadcrumb: the `persons` and `organizations` segments on detail routes map to "Contacts" with href `/admin/contacts?tab=…` (`components/admin/breadcrumb.tsx`), so `/admin/persons/{id}` reads `Admin > Contacts > {Name}`.

#### Persons tab

- Hosted via `<PersonsTableClient>` (`app/admin/persons/persons-table-client.tsx`, 489 LOC) — unchanged by the merge.
  - Uses `useVirtualizer` over a CSS-grid layout. Grid cols exported as `PERSON_GRID_COLS` from `person-table-row.tsx`.
  - Filters: ICP range, has-email, last-interaction status, event scope, organization. Event scope uses `<EventRelationToggle>` (`components/admin/event-relation-toggle.tsx`).
  - Selection: in-place `GlassCheckbox` (re-imported from `person-table-row.tsx`).
  - Detail panel: `<PersonPreviewPanel>` (`person-preview-panel.tsx`) on hover.
- Detail page: `app/admin/persons/[id]/page.tsx` + the local `notes-editor.tsx`, `add-to-list-dropdown.tsx` clients. URL unchanged.

#### Organizations tab

- Hosted via `<OrganizationsTableClient>` (`app/admin/organizations/organizations-table-client.tsx`, 660 LOC) — unchanged by the merge. The page-level data prep that used to live in `organizations/page.tsx` is now in `lib/data/load-org-rows.ts` so it can be called side-by-side with `loadPersonRows()`.
  - `useVirtualizer` over the CSS-grid layout, `ORG_GRID_COLS` from `org-table-row.tsx`.
  - Sortable columns; sort state is local.
  - Hover preview: `<OrgPreviewCard>` (`org-preview-card.tsx`).
  - Pulls supplemental data via React Query: `useOrgEventPropagation()`.
- Detail page: `app/admin/organizations/[id]/page.tsx` (server) → `client.tsx` (client). The detail page renders `<table>` HTML for sub-grids (signals, people roster, events) — small lists where virtualization isn't required. URL unchanged.

### Events — `/admin/events`

- Server page builds a list of events with role counts.
- Client (`events-table-client.tsx`) renders through `<DataTable>` with `EVENT_COLS` grid template. SortHeader returns a `<HeaderCell>` carrying the same chevron sort indicators as the persons/orgs grids. Center-aligned counts use `<NumericCell className="justify-center">`.
- Detail page: `app/admin/events/[id]/page.tsx` — four-tab interface (Speakers, Sponsors, Org-affiliated, Schedule). The Speakers, Sponsors, and Org-affiliated tabs surface the same row shape as the list views (`/admin/persons` and `/admin/organizations`): photo/logo + name + secondary line, ICP badge, channel icons for people, and ICP / signals / total-events / `<OrgStatusIcons>` for orgs. Speaker org lookup is **filtered to the event's speaker person IDs** (`person_organization` `.in("person_id", …)`) rather than fetched globally — a previous global query was silently truncated at Supabase's 1000-row default and dropped speaker orgs. See [admin-panel.md → Event Detail](../admin-panel.md#event-detail) for tab-by-tab column lists.

### Pipeline — `/admin/pipeline`

- Server page (`app/admin/pipeline/page.tsx`) maps statuses to stages (`statusToStage`), then renders `<PipelineView>` (`components/admin/pipeline-view.tsx`).
- Two views: Kanban (`<KanbanBoard>` + `<KanbanColumn>` using `@hello-pangea/dnd`) and Table (`<PipelineTable>`).
- `actions.ts` server actions move persons between stages.

### Sequences — `/admin/sequences`

- Page is one line: `<SequenceListClient />`.
- `sequence-list-client.tsx`:
  - Uses `useSequences(filters)` hook — first React Query consumer in the section.
  - Mutations: `deleteSequence`, `updateSequenceStatus` from `actions.ts`, both wired to `useMutation` with `invalidateQueries(queryKeys.sequences.all)` on success.
  - Layout: `<TwoPanelLayout>`, `<SequenceRow>` rows, `<SequencePreview>` right pane.
- Detail page: `app/admin/sequences/[id]/page.tsx` → `sequence-detail-client.tsx`. Sub-route `/messages` for the message queue. (`enrollment-panel.tsx` is **orphaned** — the 2026-05 "make steps the hero" refactor moved enrollment into the inline Enroll modal below and no longer imports the panel; the segment-builder "Build Segment" tab is consequently not currently surfaced.)
- **Detail layout** (refreshed 2026-05-19): the step composer is the hero of the main column. Sequence-level config no longer renders inline above the steps — it lives in:
  - `<SequenceConfigCard>` (`components/admin/sequence-config-card.tsx`): compact sidebar card showing sender, an inline 2-button send-mode segmented control, a one-line schedule summary, and channel / stop-rule chips. "Edit" opens the settings sheet.
  - `<SequenceSettingsSheet>` (`components/admin/sequence-settings-sheet.tsx`): right-side slide-over (Esc / backdrop closes it) hosting the full `<SequenceParametersPanel>`. Triggered from the config card or the header's "Set sender" warning link.
  - Page header: status-pill dropdown (replaces the old GlassSelect), inline meta strip (`status · n steps · n enrolled · sender warning`), and primary Activate/Pause/Resume button on the right.
- **Create modal** (`sequence-list-client.tsx`): trimmed to Name + Send Mode (tile picker) + Event. The channel selector was dropped — `createSequence` hard-codes `channel='email'` and seeds `schedule_config = { timing_mode: 'relative', exclude_bounced: true }`.
- **Parameters panel** (`components/admin/sequence-parameters-panel.tsx`): rendered inside the slide-over, never the main column. Sections: Delivery (sender + send-mode tiles) → Schedule → Pacing (only `throttle_per_day`) → Stop Rules → Audience (only `exclude_already_enrolled`). Dropped from the UI in May 2026: `daily_send_cap_global`, `min_interval_minutes`, `quiet_hours_local`, and the `exclude_bounced` toggle. `exclude_bounced` is now always-on — `updateSequenceSchedule` re-asserts it on every save, `applySequenceEnrollFilters` enforces it regardless of the stored flag, and the Audience section surfaces it as a static "Bounced contacts are always excluded" note. Each field renders through `<ParameterField>` / `<ParameterToggle>` from `components/admin/parameter-guide.tsx`, which adds an info popover (description, when-to-use, example, tips) per field. The metadata dictionary `PARAMETER_GUIDE` is the single source of truth for parameter docs and supports a `preview: true` flag for fields not yet enforced backend-side.
- **Enroll modal** (inline in `sequence-detail-client.tsx`, opened from the sidebar Enrollment card): a **People | Lists** segmented toggle.
  - *People* tab: with an active search (≥2 chars) it renders `searchPersons` results with a per-row Enroll (`enrollPersons([id])`); with no search it defaults to the currently-enrolled roster (`data.enrollments`, joined `person.full_name`/`email`) with a per-person remove (`unenrollPerson(enrollmentId)`).
  - *Lists* tab: lists `getLists()` (with `person_list_items` counts) and offers per-list **Enroll** (`enrollFromList`) and **Remove** (`unenrollFromList`) — both operate on the list's static members only. An inline result line reports the enrolled (with skipped count) or removed total.
  - Lists are fetched lazily via `useLists(enrollModalOpen)`, mirroring the `useSenderProfiles` pattern.
- **Segment builder** (`components/admin/segment-builder.tsx`, **not currently wired in**): was the "Build Segment" tab on the old `enrollment-panel.tsx`. Composes filters into a `SegmentSpec` (`lib/segments.ts`), debounce-calls `previewSegment` to display match count + 5-row sample, then `enrollFromSegment` to commit. The `previewSegment` / `enrollFromSegment` / `enrollFromEvent` server actions remain available for re-wiring. Sequence-level guards (`exclude_bounced` — always on — and `exclude_already_enrolled`) are applied server-side in `applySequenceEnrollFilters` regardless of which enrollment path the UI uses.
- **Message queue** (`app/admin/sequences/[id]/messages/message-queue-client.tsx`): per-row approve / approve_at / reschedule / cancel / reject (with reason) / retry / edit. Bulk equivalents via the action bar. 12s react-query polling; counts derived in-memory via `useMemo` from the cached list. Approval-mode banner renders when `sequence.send_mode === "approval"`. In-house `<ToastViewport>` lives in `components/ui/toast.tsx` (no third-party toast lib).
- **Step editor** (`components/admin/step-editor.tsx`): blocks save on validation errors (delay 0–365, non-empty body, action_type sequencing); warns on duplicates; `Preview` button per step calls `/api/sequences/[id]/preview` and renders through `<MessagePreviewModal>`. Per-step controls were right-sized in May 2026: a fixed-width `DelayStepper` (– / + buttons with `d` suffix; hidden for step 1) and a 3-button `ActionTypePicker` segmented control replace the previous full-width number input + dropdown, giving subject and body the dominant visual weight.
- **Failures triage** (`app/admin/sequences/failures/page.tsx` + `failures-client.tsx`): cross-sequence view of `failed` / `bounced` interactions (up to 500 most recent). Server component fetches via Supabase + flattens `detail.last_error`, `detail.last_status_code`, `detail.terminal_reason` for display. Client provides search, status filter (all / failed / bounced with counts), and per-row + bulk **Requeue** that resets `status='scheduled'`, `retry_count=0`, `scheduled_at=now()` via the `retryFailedInteractions` server action. Eligibility enforced server-side (only `failed` / `bounced` accepted). The send dispatcher's Telegram notifications deep-link here. The `failures` static segment beats `[id]` in Next's App Router, so `/admin/sequences/<uuid>` routing is unaffected.

### Inbox — `/admin/inbox`

- Server page (`app/admin/inbox/page.tsx`) fetches sync state + recent inbound emails + person/org joins, then builds conversation threads via `groupIntoThreads()` in `lib/inbox/group-threads.ts`.
- Grouping key is `(JMAP threadId, external counterparty)`, not `threadId` alone — Fastmail subject-threads a same-subject outreach blast into one `threadId`, so we split it back per prospect. See [admin-panel.md → Conversation grouping](../admin-panel.md#conversation-grouping).
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
    ├── components/entity-table.tsx              (memo'd, DataTable-based with conditional gridTemplate per tab/mode)
    ├── components/status-icons.tsx              (per-stage icon renderer)
    └── components/summary-strip.tsx             (results summary)
```

- React Query hooks consumed: `useEnrichmentJobs`, `useEnrichmentItems`, `useEvents`, `useEventPersonIds` (`enrichment-shell.tsx:13-18`).
- Polls `enrichment.jobs` at 5s while any job is processing (`use-enrichment-jobs.ts:361-368`).
- Two tabs: Person Enrichment / Organization Enrichment. Tab switch resets selection and forces target to `selected`.
- Stage selector (Apollo / Perplexity / Gemini / People Finder / Full Pipeline) — independently toggleable; Full Pipeline is just an additive composite, not a special mode.
- `app/admin/enrichment/[jobId]/page.tsx` + `job-results-client.tsx` is the per-job dashboard with stat cards, expandable result cards, retry CTA. Polls every 3s while in-progress.

#### `entity-table.tsx` and conditional columns

`entity-table.tsx` uses `<DataTable>` with a `gridTemplate` computed via `useMemo` from `tab` (orgs vs persons) and `mode` (list / progress / results). Conditional columns:

- Checkbox column (32px) only when `mode === "list"`.
- Outcome column (100px) only when `mode === "results"`.
- Org tab has 5 data columns (Name / Event / Category / ICP / Status); Person tab has 6 (Name / Org / Event / Source / ICP / Status).

Per-row queued / processing styling (the `opacity-40` for not-yet-processed rows and `slideIn` animation when a row goes active during a live job) flows through `DataTable`'s `rowClassName` prop.

### Correlations — `/admin/correlations`

- Server page → `<CorrelationReview>` (`components/admin/correlation-review.tsx`, 301 LOC).
- Side-by-side comparison of source vs target. Merge/Dismiss actions are server-action backed.

### Uploads — `/admin/uploads`

Single client page built around one editable table. Three entry paths (empty, CSV, paste) normalize into the same shape: `ImportTableState = { mode, columns: ImportColumn[], rows: string[][] }`.

- **`app/admin/uploads/page.tsx`** owns mode (`persons | organizations`), the table state, duplicate handling, CSV ingestion (papaparse), the event-resolution flow, and the upload history.
- **`components/admin/import-table.tsx`** — the editable table. Headers are `<GlassSelect>` field-binding dropdowns; cells are editable text inputs; supports paste expansion and per-row/per-column remove. Maintains a "ghost row" invariant — `ensureGhostRow()` wraps every mutation so there is always one trailing empty row available for paste or further typing. No `+ Row` button; only `+ Column`. The trailing ghost row hides its Remove control and renders at reduced opacity. Subtle vertical separators (`border-l border-[var(--glass-border)]/40`) make empty columns visible.
- **`components/admin/event-detect-modal.tsx`** — pre-import gate. For each unique unknown event name in the `event` column, the user picks Create (with optional `date_start`) / Map to existing / Skip. Confirm batch-creates events via `findOrCreateEvents` and proceeds.
- **`lib/uploads/`** — pure helpers: `field-sets.ts` (`PERSON_FIELDS`, `ORGANIZATION_FIELDS`, `fieldSetForMode`, `isValidFieldForMode`), `auto-match.ts` (`autoMatchHeader` per mode), `paste-parser.ts` (`parseClipboard` — TSV preferred, falls back to CSV), `event-detect.ts` (`normalizeEventName`, `partitionEventNames`).
- **`actions.ts`** exports `listUnknownEvents`, `findOrCreateEvents`, `importPersons`, `importOrganizations`, and the row/decision types. Persons dedupe by email; orgs by case-insensitive name. Both write an `uploads` row with status + counts. The legacy `importCsvData` and `<ColumnMapper>` are retired.

### Lists — `/admin/lists` (index) + `/admin/lists/[id]` (detail)

Lists organize persons into buckets used by enrichment, sequences, pipeline, and `/admin/persons` views. Membership is concrete rows in `person_list_items`; a list optionally carries a saved `PersonFilterRules` (column added in `027_person_lists_filter_rules.sql`) that powers the filter sidebar but never auto-mutates membership.

**Index page** (`app/admin/lists/page.tsx`, ~218 LOC, client):
- Renders the roster of lists with member count, "saved filter" pill when `filter_rules !== null`, and a New List modal.
- Clicking a row navigates to `/admin/lists/[id]`. Deletion is inline.
- Uses server actions from `app/admin/lists/actions.ts` directly, not React Query (same exception class as `/admin/settings`).

**Detail route** (`app/admin/lists/[id]/`):
- `page.tsx` (server) — `Promise.all` of `getListById`, `getListItems` (returns `{ person_id }[]`), and `loadPersonRows()` (`lib/data/load-person-rows.ts`, shared with `/admin/persons`). All `PersonRow[]` are loaded once and handed to the client.
- `list-detail-client.tsx` — owns `rules: PersonFilterRules`, the Members/Matches tab, the saved-filter chip, and inline name/description edit. Uses `<PersonFilterSidebar>` (the same component `/admin/persons` uses) inside `<TwoPanelLayout>`. Filters are applied via the pure `applyPersonFilters()` from `lib/filters/person-filters.ts`.
- `list-members-table.tsx` — Members tab. Filters scope **within** the list's members. Bulk "Remove from list" action.
- `list-matches-table.tsx` — Matches tab. Filters scope across **all** persons. Rows already in the list are faded with an "in list" badge; the rest get checkboxes and a bulk "Add N to list" button. Empty filter state prompts the user to apply filters.

**Saved filter** semantics: `[Save filter]` calls `saveListFilter(listId, normalizeRules(rules))`; `[Clear saved filter]` writes `null`. Reopening the list hydrates the sidebar from `list.filter_rules`. Re-running the saved filter is **add-only** — `handleAddMatches` filters out members already in the list before calling `addToList`. Removal is always an explicit user action.

**Filter module** (reusable, pure):
- `lib/filters/person-filters.ts` — `PersonFilterRules` type, `applyPersonFilters(rows, rules, deps)`, `normalizeRules`, `isEmptyRules`, `personFilterRulesToActiveFilters`, `removeFilterKey`, `clearAllFilters`. Covered by `lib/filters/person-filters.test.ts` (24 unit tests).
- `components/admin/person-filter-sidebar.tsx` — controlled component rendering the filter UI. Consumed by both `/admin/persons` and `/admin/lists/[id]`.

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
