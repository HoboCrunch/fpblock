# Admin CRM Guide

> **Heads up — this doc is partly superseded.**
> Frontend structure, components, and the data layer have moved to:
> - [docs/frontend/admin-ui.md](./frontend/admin-ui.md) — IA, shell, per-section overview, auth gating, selection model
> - [docs/frontend/components.md](./frontend/components.md) — design system, `components/ui/*` and `components/admin/*` inventory, conventions, anti-patterns
> - [docs/frontend/data-layer.md](./frontend/data-layer.md) — React Query setup, hook catalog, polling, mutation patterns
>
> What remains valuable in this file is the per-feature **behavior** detail (inbox auto-correlation rules, pipeline kanban drag semantics, event detail tab contents, enrichment pipeline stage rules, etc.). For "where do components live" or "how do I add a hook", read the new docs.

---

The admin CRM is at `/admin/*`. All routes require authentication via Supabase Auth.

## Login

**URL:** `/login`

Email/password sign-in. Redirects to `/admin` on success. All `/admin/*` routes redirect here if unauthenticated. The login page lives outside the admin layout (at `app/login/page.tsx`) to avoid redirect loops.

**Credentials:** Create in Supabase Dashboard > Authentication > Users. Scripts use `ADMIN_PASSWORD` env var.

## Navigation

The sidebar contains 10 sections with Lucide icons:

| Section | URL | Icon |
|---------|-----|------|
| Dashboard | `/admin` | LayoutDashboard |
| Contacts | `/admin/contacts` | Users |
| Lists | `/admin/lists` | ListIcon |
| Events | `/admin/events` | Calendar |
| Pipeline | `/admin/pipeline` | Kanban |
| Sequences | `/admin/sequences` | GitBranch |
| Inbox | `/admin/inbox` | Mail |
| Enrichment | `/admin/enrichment` | Sparkles |
| Correlations | `/admin/correlations` | GitMerge |
| Uploads | `/admin/uploads` | Upload |
| Settings | `/admin/settings` | Settings |

Events sub-items expand inline under the Events nav item. The sidebar collapses to icon-only mode via a toggle at the bottom, and auto-collapses on tablet viewports.

### Mobile Responsiveness

On screens below `md` (768px), the sidebar is hidden by default and accessible via a hamburger menu button in the header. Tapping the hamburger slides the sidebar in as a fixed overlay (z-50) with a semi-transparent backdrop. Tapping any nav link or the backdrop closes it. A close (X) button is also available in the sidebar header.

The layout uses an `AdminShell` client component (`app/admin/admin-shell.tsx`) to manage the mobile-open state shared between the sidebar and header.

Additional mobile adjustments:
- Header padding reduces from `px-6` to `px-4`, user email is hidden (sign-out button remains)
- Main content padding reduces from `p-6` to `p-3`
- All data tables have `min-w-[600px]` and `overflow-x-auto` for horizontal scrolling, with reduced cell padding (`px-3` vs `px-5`)

The header shows a breadcrumb trail (auto-generated from the URL path) on the left and the logged-in user's email + sign out on the right. UUID segments on detail routes (`/admin/events/{id}`, `/admin/persons/{id}`, `/admin/organizations/{id}`, `/admin/lists/{id}`) are resolved to the entity's display name via the `useEntityName` hook and truncated to 40 chars. The `persons` and `organizations` path segments are rendered as "Contacts" in the breadcrumb (linking back to `/admin/contacts?tab=…`), so detail pages read `Admin > Contacts > {Entity Name}`.

## Dashboard

**URL:** `/admin`

Overview of the CRM:

- **Stat Cards** (4 across) — Persons, Organizations, Interactions (total), Replied. Glass cards with large numbers and accent-colored Lucide icons.
- **Active Conversations** — a fifth stat tile showing the count of distinct persons who have at least one inbound and at least one outbound email recorded in the last 14 days. Backed by the `active_conversations_count(window_days int)` Postgres RPC, which accepts an optional window override (default 14). The tile gives a quick read on threads that are genuinely two-way without requiring the inbox view.
- **Pipeline Funnel** — horizontal stacked bar showing person distribution across interaction stages (Not Contacted → Draft → Scheduled → Sent → Opened → Replied → Bounced/Failed). Segments are clickable and link to the Pipeline page filtered to that stage.
- **Recent Activity** — last 20 entries from the job_log table with status indicators
- **Quick Actions** — Upload CSV, Run Enrichment, Review Drafts

## Contacts

**URL:** `/admin/contacts?tab=persons|organizations`

Unified list view for persons and organizations behind a segmented tab control at the top of the page. The tab is reflected in the `?tab=` query param (defaults to `persons`, unknown values fall back to `persons`) and synced via `router.replace` so deep links and back/forward work without full reloads. The legacy `/admin/persons` and `/admin/organizations` list routes redirect to the new route with the appropriate tab.

The contacts page is a server component (`app/admin/contacts/page.tsx`) that fetches both data sets in parallel via `loadPersonRows()` and `loadOrgRows()` (the latter in `lib/data/load-org-rows.ts`). The client wrapper (`contacts-tabs-client.tsx`) mounts both `<PersonsTableClient>` and `<OrganizationsTableClient>` and hides the inactive one — per-tab filter, search, sort, scroll, and selection state survive tab toggles for free. Each tab pill shows its row count.

### Persons tab

Searchable, filterable list of all persons with computed fields:

- **Search** — by name (trigram fuzzy search via pg_trgm)
- **Filters** — ICP score range, Has Email, Last Interaction Status, Event, Organization
- **Event scope** — dedicated dropdown with a two-checkbox relation toggle (`Speaker` / `Org-affiliated`). Picks from direct participants, persons affiliated through a participating org (via `person_event_affiliations`), or both. Both off = empty set. Rows show `SPK` / `ORG` badges per scope.
- **Table columns:**
  - Name (link to detail)
  - Organization (primary org from person_organization where is_primary = true)
  - Title
  - ICP (primary organization's icp_score via `persons_with_icp` Postgres view, color-coded badge)
  - Channels (small icons for each populated channel: email, LinkedIn, Twitter, Telegram)
  - Last Interaction (most recent interaction date)
  - Interaction Count
- **Pagination** — 25 per page
- **Bulk actions** (on multi-select): Enrich Selected, Generate Messages

### Person Detail

**URL:** `/admin/persons/{id}` (unchanged — only the list view was merged)

Full profile in glass cards:
- **Header** — name, title, primary organization, ICP score badge, photo
- **Contact Info** — email, LinkedIn, Twitter, Telegram, phone, source
- **Notes** — freeform notes, bio
- **Affiliations** — all organization memberships (current and historical) with role, role_type, is_current indicator, primary flag
- **Events** — event participations across all events with role (speaker, attendee, etc.), talk_title, track, time_slot
- **Event affiliations (via org)** — events this person is linked to indirectly because an org they belong to participates in the event. Each row shows event name + a `via <OrgName>` chip. Driven by `person_event_affiliations`.
- **Interactions Timeline** — unified chronological feed of all interactions (see Interactions Timeline section below)

### Organizations tab

Searchable, filterable list of all organizations:

- **Filters** — ICP range, Category, Has Signals
- **Table columns:** ICP Score (badge), Name (link to detail), Category, People count (+N enriched indicator), Signal Count, Last Signal date, Events (with sponsor tier badges), Events Prop. (count of events this org has propagated persons into via `person_event_affiliations`, sortable)
- Sortable by all columns
- **Pagination** — 25 per page

### Organization Detail

**URL:** `/admin/organizations/{id}` (unchanged)

Full profile with:
- **Header** — name, category, ICP score badge (color-coded by tier: green 90+, yellow 75+, orange 50+), people count with enriched indicator, signals count
- **Context** — description, strategic context, USP angle, ICP reason
- **Links** — website, LinkedIn
- **Firmographics** — industry, employees, revenue, funding (with stage), headquarters, founded year, tech stack tags (from Apollo enrichment data)
- **Signals Timeline** — organization_signals in reverse chronological order
- **Events** — event participations with role and sponsor tier
- **People Roster** — persons affiliated via person_organization with role, email, LinkedIn, phone, source badge ("Enriched" for org_enrichment source), current/former status
- **Event propagation** — stat block + list: "N persons across M events" derived from `person_event_affiliations` where `via_organization_id = this org`. Each event row shows the name + person count.
- **Interactions Timeline** — aggregated interaction timeline across all persons in the org

## Events

**URL:** `/admin/events`

Card grid layout. Each event as a glass card showing name, dates, location, event_type, and footer stats (counts per role type: speakers, sponsors, related contacts). Click to open detail.

### Event Detail

**URL:** `/admin/events/{id}`

Four tabs:

#### Speakers
Confirmed speakers from event_participations (role IN speaker/panelist/mc). Designed to mirror the `/admin/persons` list-view row shape. Columns: Name (photo + full_name + title), Org (linked, with seniority badge), ICP (badge), Channels (Mail / LinkedIn / Twitter / Telegram / Phone icons — faded when missing), Role, Talk, Track, Time. Person fields come from the `persons_with_icp` view; primary org is resolved via `person_organization` filtered to the event's speaker IDs (NOT a global fetch — earlier versions silently truncated at the 1000-row Supabase default and dropped speaker orgs).

#### Sponsors
Sponsoring organizations from event_participations (role IN sponsor/partner/exhibitor). Designed to mirror the `/admin/organizations` list-view row shape. Columns: Name (logo + name + category), Tier (badge), ICP (badge), People (count), Signals (count from `organization_signals`), Total Events (distinct `event_id` count across all of this org's participations — i.e. how many events this org has ever appeared at), Enrichment (via shared `<OrgStatusIcons>` fed real `enriched_person_count` from `person_organization.source = "org_enrichment"`).

#### Org-affiliated
Persons linked to the event indirectly because an org they belong to participates in this event. Driven by `person_event_affiliations` (scoped to `event_id`), deduplicated against direct participants (`event_participations`) — a person only appears once, as a direct participant when applicable. Each row now includes photo + title, ICP badge, and the same five channel icons as the Speakers tab, followed by one `via <OrgName>` chip per participating org they're affiliated through. Replaces the old "Related Contacts" tab, which derived this set ad-hoc via a three-table join.

#### Schedule
Lightweight day/track/slot grid view assembled from event_participation metadata (time_slot, track, room, talk_title). Grouped by day, sorted by time within track.

## Interactions Timeline

Reusable component embedded on Person, Organization, and Event detail views.

- **Chronological feed** — reverse chronological by occurred_at
- **Entry display** — type icon (email, handshake, phone, etc.), channel badge, direction arrow (inbound/outbound/internal), status pill (draft/sent/replied/etc.), handled_by tag
- **Filterable** — by interaction_type, channel, direction
- **Expandable** — click to reveal full body, subject, and type-specific detail from the JSONB `detail` field
- **Interaction types:** cold_email, cold_linkedin, cold_twitter, warm_intro, meeting, call, event_encounter, note, research

## Correlations

**URL:** `/admin/correlations`

Fuzzy match review queue for deduplication:

- **Queue** — pending correlation_candidates sorted by confidence (highest first)
- **Side-by-side comparison** — source record vs. target record with all fields displayed for comparison
- **Match reasons** — displayed as badges (e.g., "exact_email", "similar_name:0.92", "same_linkedin")
- **Confidence score** — prominently displayed with color coding (green > 0.9, yellow 0.7-0.9, orange 0.6-0.7)
- **Actions:**
  - **Merge** — combines records, reassigns all relationships (event_participations, interactions, person_organization) to the winning record, deletes the losing record
  - **Dismiss** — marks candidate as dismissed, keeps both records separate
- **Filters** — entity_type (person/organization), confidence range, status (pending/merged/dismissed)
- **Stats** — counts of pending, merged, and dismissed candidates

## Pipeline

**URL:** `/admin/pipeline`

Derives stages from interaction status.

Two views (toggle top-right):

### Kanban View (default)
- **Columns:** Not Contacted, Draft, Scheduled, Sent, Opened, Replied, Bounced/Failed
- **Cards:** Person name, organization, channel icon, ICP badge
- **Drag and drop:** Move persons between stages. Moving right updates the most recent interaction status. Moving left creates a new draft. Moving from "Not Contacted" creates a new interaction (modal for channel + type selection).
- **Filters:** Channel, ICP range

### Table View
Same data as a sortable, filterable table: Person, Organization, Channel, Stage, ICP, Scheduled Date, Last Updated.

Each contact row in both views shows a **source chip** derived from the best-status interaction for that person. Possible values: `script` (the interaction's `detail.source` is `script_send` or `script_backfill`), `sequence` (`detail.source = 'sequence'` or, for legacy rows that predate source tagging, any interaction that carries a non-null `sequence_id`), `manual` (created directly via the UI or API with no sequence or script origin), and `sent_folder_reconciler` (reconciled from the Fastmail Sent folder by `lib/inbox-sync.ts`). The chip is informational only — it does not filter the view, but it makes the provenance of each thread immediately visible at a glance.

**Deep linking:** `?stage=draft` pre-filters to a specific stage (used by Dashboard "Review Drafts" quick action).

## Sequences

**URL:** `/admin/sequences`

Manage outreach sequence templates. Email is the only channel; the create modal asks for Name, Send Mode (Auto / Approval), and an optional Event. Bounced contacts are always excluded.

### List View
Table: Name, Channel, Steps count, Persons Enrolled, Completion Rate.

### Detail View (`/admin/sequences/{id}`) — refreshed 2026-05-19

Layout puts the step composer in the spotlight; sequence-level configuration is demoted into the sidebar and a slide-over sheet.

- **Header** — back link, large editable title, status pill with dropdown (Draft / Active / Paused / Completed), inline meta strip (`status · n steps · n enrolled · Set sender` warning when applicable), primary **Activate / Pause / Resume** button on the right.
- **Step editor (main column, hero)** — vertical timeline of glass cards. Each card has a step-number bubble, action-type badge, "Day +N" label, and compact controls: a fixed-width Delay stepper (–/+ with `d` suffix, hidden for step 1) and a 3-button Action Type segmented control. Subject (email) and Body composable editors take the dominant width. Per-step actions: Preview, Up, Down, Delete. "Add step" is an inline pill at the bottom of the timeline.
- **Sidebar:**
  - **Configuration card** — sender summary, inline send-mode segmented toggle (Auto / Approval), one-line schedule summary, channel + stop-rule chips, "Edit" → opens the settings sheet.
  - **Enrollment card** — counts (Active / Completed / Paused / Bounced) + Enroll and Messages buttons.
  - **Performance card** — Sent, Delivered, Opened, Clicked, Replied, Bounced with percentages (only renders once anything has been sent).
  - **Activity card** — recent enrollment status changes.
- **Settings slide-over** — right-side sheet with the full parameter set: Delivery (sender + send-mode tiles) → Schedule → Pacing (`throttle_per_day` only) → Stop Rules (`stop_on_reply`, `stop_on_click`) → Audience (`exclude_already_enrolled`). Esc or backdrop click closes it.
- **Enroll from Event** — modal launched from the enrollment panel. Event picker + the same `Speaker` / `Org-affiliated` toggle. Bulk-enrolls every person matching `getPersonIdsForEvent(event, relation)` via the `enrollFromEvent` server action, which upserts into `sequence_enrollments` with `onConflict: sequence_id,person_id` (safe to re-run).

Controls dropped in May 2026 (no UI surface; legacy values still honored by the send pipeline if present): `daily_send_cap_global`, `min_interval_minutes`, `quiet_hours_local`, and the `exclude_bounced` toggle (now always-on).

## Inbox

**URL:** `/admin/inbox`

Threaded 2-way email client over the two managed Fastmail identities (`jb@gofpblock.com`, `wes@gofpblock.com`). Inbox + Sent are both synced per identity using its own JMAP token; rows are grouped into conversations by `groupIntoThreads()` in `lib/inbox/group-threads.ts`.

### Conversation grouping
The bucket key is **`(JMAP threadId, external counterparty)`** — *not* `threadId` alone. Fastmail's JMAP threading keys on the normalized subject, so a bulk cold-outreach blast (the same subject line sent to many prospects) collapses every reply into a single `threadId`. Grouping by `threadId` alone therefore renders one giant conversation mixing dozens of unrelated prospects. Because this inbox is a 1:1 outreach CRM, a "conversation" is really *one external counterparty ↔ one of our identities*, so we sub-partition each Fastmail thread by the other party's address (`from_address` for inbound, `to_address` for outbound). Genuinely-threaded 1:1 exchanges are unaffected; a subject-merged blast splits back into one conversation per prospect. Rows with no `threadId` stay a thread of one. Covered by `lib/inbox/group-threads.test.ts`.

### Toolbar
Single **Sync** button in the top-left, replacing the per-identity status pills. If any identity's last sync errored, a muted red note appears inline next to it. The sync runs every configured identity in one pass.

### Two-column layout
- **Left column:** filter tabs `All | Correlated | Uncorrelated` at top, thread list below. The tab row's bottom border aligns horizontally with the right column's person-header bottom border so the two cards start at the same y-coordinate.
- **Right column:** person-header bar at top, conversation card below. Mirrors the left column's structure (same `border-b` underline, same `px-4 py-2 text-sm` content sizing).

### Thread list (left column)
Each row is one conversation, not one message. Sorted by latest message descending.

- **Sender label** = the first participant whose address isn't `@gofpblock.com` (so a thread Wes initiated and got replies on still shows the prospect's name, not Wes).
- **Message count** chip when the thread has more than one message.
- **Person badge** (name + ICP score) if any message in the thread is correlated to a pipeline person.
- **Preview** = body preview of the latest message; if the latest is an outbound reply from us, a small turn-down-right glyph precedes the preview.
- **Account chips** (JB / Wes) on the right show which managed inboxes the thread has touched.
- Pipeline-aware row styling (unchanged):
  - Unread, known sender: orange left accent + subtle orange fill
  - Unread, unknown: white left accent, default background
  - Read, known: subtle orange fill, no accent
  - Read, unknown: default background

### Conversation view (right column)
- **Person header** above the card: person name (linked to `/admin/persons/[id]`), organization, ICP chip, and the other party's email. Uncorrelated threads instead show the sender's display name and an inline "Link to Person" pill. A **Reply** button sits on the right.
- **Card** contains the thread subject + meta line (`N messages · X in / Y out · participants`) and the message chain in chronological order.
- **Message blocks**: latest is auto-expanded, prior messages collapse to a one-line header (chevron + sender + timestamp + preview). Clicking any header toggles. Outbound messages are tinted blue and tagged "Sent"; unread inbound messages get a faint orange ring.
- **HTML rendering**: each message body is loaded into a sandboxed iframe with `sandbox="allow-same-origin allow-popups"` and `<base target="_blank">`. Scripts and `on*=` handlers are stripped defensively. The iframe auto-fits its content height (with a re-measure at 250ms and 1200ms to catch image-load reflow). This preserves the sender's original formatting instead of forcing the app's dark theme onto received mail.

### Reply composer
Toggled by the Reply button. Inline at the bottom of the conversation card.

- **From** dropdown — defaults to the identity already on the thread; can be overridden to the other configured identity.
- **To / Cc / Bcc** — Cc and Bcc collapse by default behind `+ Cc` / `+ Bcc` chips. Address parser accepts `"Name" <email>` and bare emails, comma- or semicolon-separated.
- **Subject** — pre-filled with `Re: <thread subject>` (skips the prefix if the thread already starts with `Re:`).
- **Body** — plain text textarea. The server auto-wraps it in a minimal HTML envelope so threading clients render line breaks correctly.
- **Send** posts to `POST /api/inbox/reply` (see `docs/backend/api-routes.md` §2.4.6), which:
  1. Resolves the right JMAP token from `identity`.
  2. Looks up the original message's rfc822 `Message-Id` and `References` headers via `getMessageIdHeader()` to chain proper RFC 5322 threading.
  3. Submits via JMAP `EmailSubmission/set` with `onSuccessUpdateEmail` to atomically move the draft into Sent.
  4. Triggers a single-identity inbox sync so the new outbound row lands in `inbound_emails` immediately and `router.refresh()` picks it up.

Sent replies live in the actual Fastmail Sent folder under the sending identity — recipients see normal mail from `jb@…` / `wes@…`, and `sent_folder_reconciler` (see [sequences-messaging](backend/sequences-messaging.md)) materializes a matching `interactions` row.

### Auto-Sync
A pg_cron job (`034_inbox_sync_cron_hourly.sql`, replacing the per-account jobs from `016_inbox_sync_cron.sql`) POSTs to `/api/inbox/sync` once per hour at `:00`. The route iterates every configured identity in one pass — no per-account staggering is needed. A Vercel-cron-ready equivalent (`/api/cron/inbox-sync`, gated by `CRON_SECRET`) is available as an alternative.

### Auto-Correlation
Only inbound rows correlate (outbound skips this step). For each new inbound message:
1. Exact match on sender email → `persons.email`
2. Domain match on sender → `organizations.website`
3. On match: updates the most recent outbound `interactions` for that person to `status='replied'`, sends a Telegram notification (unless `INBOX_TELEGRAM_DISABLED=1` is set).

## Enrichment

**URL:** `/admin/enrichment`

Tabbed interface with two tabs: Person Enrichment and Organization Enrichment.

### Person Enrichment Tab

**API:** `POST /api/enrich/persons`

**Source:** Apollo People Match (fills email, LinkedIn, Twitter, phone, title, seniority, department, photo, apollo_id)

**Targets** (mutually exclusive, first-match-wins):
- Explicit person IDs (from bulk selection on Persons page)
- All persons from event — accepts optional `relation` (`direct` / `org_affiliated` / `either` / `both`, default `either`); resolved server-side via `getPersonIdsForEvent`. The enrichment UI surfaces the same two-checkbox toggle when event scope is selected; Run button disables when both are off.
- All persons from organization (via person_organization)
- Failed only (enrichment_status = 'failed')
- By source (e.g., 'org_enrichment', 'csv_import') — combined with unenriched filter
- Default: all unenriched (enrichment_status = 'none' OR apollo_id IS NULL)

**Limit:** 200 persons per batch.

**Behavior:**
- COALESCE updates: only fills fields that are currently null on the person record
- Reverse org linkage: if a person has no organization and Apollo returns org data, searches existing orgs by domain/name and links. Creates stub orgs (enrichment_status = 'none') when no match exists.
- Persons with insufficient identifiers (no linkedin, no apollo_id, no org) are skipped and marked failed
- Tracks enrichment_status (none → in_progress → complete/failed) and last_enriched_at
- Per-person errors don't halt the batch

**UI:**
- Target selector, field toggle buttons
- **Preview list:** Shows matching persons before running (name, org, field availability icons, true total count)
- **Real-time progress:** During enrichment, polls job_log every 2s showing progress bar + per-person status
- **Pre-selection:** Bulk "Enrich Selected" action from Persons page passes person IDs via URL params

### Organization Enrichment Tab
Five-stage pipeline with individual or combined execution:

**Stage Selector** — Toggle buttons with descriptions:
- **Full Pipeline** — runs all stages with smart ordering
- **Apollo** (Firmographics) — industry, employee count, revenue, funding, tech stack, HQ
- **Perplexity** (Deep Research) — description, products, strengths, weaknesses, recent news, target market, website discovery
- **Gemini** (Synthesis + ICP Score) — combines Apollo + Perplexity, reads ICP criteria from company_context DB, outputs score 0-100
- **People Finder** (Find Contacts at Org) — searches Apollo for people, enriches for contact details, deduplicates against existing persons

All stages are independently toggleable — Full Pipeline can be deselected to run only People Finder (or any subset). Run button disables when no stages are selected. People Finder can be combined with any other stages (additive toggle). Batch concurrency: 3 orgs process in parallel.

**People Finder Settings** (shown when People Finder is selected):
- Contacts per company (1-25, default 5)
- Seniority level toggles (Owner, Founder, C-Suite, Partner, VP, Director, Manager, Senior, Entry)
- Department toggles (Executive, Engineering, Sales, Marketing, Finance, Operations, Product, Legal, HR) — empty = all

**Smart Pipeline Ordering:**
- If org has a website: Apollo + Perplexity run in parallel (fast path)
- If org has no website: Perplexity runs first to discover domain, then Apollo uses discovered domain

**Target Selector:**
- **Never enriched** — orgs with `enrichment_status = 'none'`
- **Failed / Incomplete** — orgs with `enrichment_status` of `'failed'` or `'partial'`. Shows rich preview with completed stages (green pills), failed stage (red pill with error tooltip), and last attempt date
- ICP below threshold, from event, selected, select from list

**Retry flow:** Job detail pages link to `/admin/enrichment?retry={jobId}`, which auto-selects the org tab and pre-picks the incomplete orgs from that job. The pipeline skips already-completed stages on re-runs.

**Selection behavior:** Switching between the Persons and Organizations tabs clears the current selection and resets the target to "Selected items" — tab switching never auto-populates the selection. Presets ("Never enriched", "Failed / Incomplete", "ICP below threshold", "from event", etc.) explicitly populate selection when chosen. Row selection uses the shared `GlassCheckbox` (grey fill, orange accent on toggle) matching the Organizations and Persons pages.

**Preview list:** Shows matching organizations before running (includes enrichment status column)

**Real-time progress:** Per-stage icon columns showing real-time status for each org:
- **4 stage columns** (Apollo/Search, Perplexity/Flask, Gemini/Brain, People Finder/Users) — each shows: hollow circle (pending), spinning loader (processing), green checkmark (completed with results), gray checkmark (completed with zero results), red alert (failed)
- **ICP column** — appears as soon as Gemini completes (score color-coded by tier)
- **Status badge** — right-aligned overall job status

**Results include:** Orgs processed/enriched, signals created, people found/created/merged

**Results dismissal:** Completed job results auto-dismiss when config changes. Manual dismiss via X button. Preview list reappears for new job configuration.

### Job History (shared)
Compact card list of enrichment batch jobs (person + organization).

**Completed/failed jobs** render as links to the job detail page showing:
- Type badge, inline stats, timestamp, status badge, arrow

**Processing jobs** render as expandable rows:
- **Collapsed:** Type badge, org count, timestamp, "processing" badge, X/Y progress bar. Arrow icon links to full job details.
- **Expanded:** Click to toggle open an inline live status table (same per-stage icon columns as the enrichment tab). Polls every 3s only when expanded. Allows monitoring active jobs without leaving the page.
- **Auto-refresh:** job list re-fetches every 5s when any job is processing, so status transitions are caught

### Job Detail Page

**URL:** `/admin/enrichment/{jobId}`

Dedicated results dashboard for an enrichment job. Supports both completed and in-progress jobs.

**Header:** Back link, job title with date, status badge, duration.

**Live Progress Banner** (processing jobs only): Pulsing orange indicator with progress bar, shows currently-processing entity name and pipeline stage (e.g. "Acme Corp: Deep Research — 3 of 8 completed"). Auto-refreshes stat cards via `router.refresh()` when the job completes.

**Live Results** (processing jobs only): Results list polls child entries every 3s, showing result rows as they stream in during processing. ICP scores appear as soon as Gemini synthesis completes per org (not deferred to full pipeline completion).

**Summary Stats:**
- Org jobs: Orgs Processed / Enriched / Signals Created / Avg ICP Score
- Org jobs with People Finder: + People Found / New Persons Created / Merged with Existing
- Person jobs: Persons Processed / Enriched / Failed / Orgs Created (stub orgs from reverse linkage)

**Organization Results:** Collapsible cards with search and sort (by name, ICP, status):
- **Collapsed:** Org name (linked), ICP score badge (color-coded), category, signals count, people found count, stage, status
- **Expanded:** Two-column layout — left: description, context, USP, ICP reason; right: ICP score display, firmographics, category, People Finder stats (found/new/merged). Below: strengths/weaknesses, signals timeline.

**Person Results:** Flat list with name (linked), field-found indicators, status badge.

**Unprocessed Organizations** (failed/partial jobs only): Muted table below results showing orgs that were in the batch but never started processing. Shows org name (linked), previous enrichment status badge, and any prior stage history as colored pills. Toolbar count shows "X of Y results · N not processed".

**Retry CTA** (failed/partial jobs only): Banner between stat cards and results showing "Job failed — N organizations not processed" with a "Retry N Remaining" button linking to `/admin/enrichment?retry={jobId}`.

## Uploads

**URL:** `/admin/uploads`

### Editable import table

The page is built around a single editable table that handles three entry paths uniformly:

- **Mode toggle** at the top — `Persons | Organizations` (exclusive; no "both"). Determines which canonical field set the column headers offer and which server action is called on import. Switching with staged content prompts before clearing column bindings; row data is preserved.
- **Empty start** — table lands with five blank rows in the active mode's default columns (Persons: full_name, email, linkedin, title, event · Organizations: name, website, category, linkedin_url, event).
- **CSV upload** — `Upload CSV` button or drag onto the dropzone below the toolbar. Papaparse fills rows and columns; headers auto-match to canonical field ids via per-mode heuristics. Original CSV headers stay visible under each dropdown.
- **Bulk paste** — paste TSV/CSV into any cell; the table auto-expands rows and columns from the focused cell.

Each column header is a `<GlassSelect>` of canonical fields for the current mode plus `— Discard —`. Cells are editable inputs so users can fix typos inline before submit. A persistent **ghost row** (trailing empty row) is always maintained, so paste and continued typing always have an available row at the bottom. Subtle vertical separators distinguish empty columns. There is no "+ Row" button; rows grow automatically. `+ Column` adds an empty column.

### Submit flow

1. Rows where every mapped cell is empty are silently dropped.
2. The `event` column is scanned. Unknown event names (no case-insensitive match in `events`) open the **Event Detect Modal**, which lists each one with `[Create]` (with optional `date_start`) / `[Map to existing ▾]` / `[Skip]` controls.
3. After resolution, the page calls `importPersons` or `importOrganizations` (per mode) with `{ duplicateHandling, eventMap }`. Duplicate handling is `Skip | Update | Create new`. Persons dedupe by email; organizations by case-insensitive name.
4. Result strip below the toolbar shows created / skipped / error counts.

### Upload history

Table of past imports: Date, Filename, Rows, Persons Created, Organizations Created, Status.

## Settings

**URL:** `/admin/settings`

Five tabs:

### Company Profile
Editable company context used by the enrichment pipeline and message generation:
- **Company Name** — used in Gemini prompts
- **About / Company Description** — brief description, used as context in ICP scoring
- **Positioning Statement** — market positioning, embedded in Gemini prompts
- **ICP Criteria** — full ICP framework, used verbatim by Gemini to score organizations (0-100)
- **Language Rules** — words/phrases to lead with or avoid in enrichment and outreach
- **Outreach Strategy** — high-level strategy notes for message generation

Changes take effect on the next enrichment run. Stored in `company_context` singleton table.

### Sender Profiles
CRUD for sender accounts: name, email, heyreach_account_id, signature, tone_notes.

### Prompt Templates
CRUD for AI message templates: name, channel, system_prompt, user_prompt_template.

### Automation Rules
CRUD for automation triggers: name, trigger_table, trigger_event, conditions (JSON), action, action_params. Toggle enabled/disabled.

### Event Config
Inline-editable table (one row per event): sender, CTA URL, CTA text, prompt template, notify emails.

## Landing Pages

**URL:** `/jb` and `/wes`

Public-facing personal landing pages. These render outside the admin shell (no sidebar/header). Glassmorphic design with orange/indigo accents, grid background, Poppins/Inter fonts.
