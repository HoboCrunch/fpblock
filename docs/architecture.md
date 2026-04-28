# Architecture Overview

> **Read this first for the system-level picture.** For deep dives that supersede the older sections of this file, see:
> - Schema → [backend/database.md](./backend/database.md) (canonical, rebuilt from migrations)
> - API surface → [backend/api-routes.md](./backend/api-routes.md)
> - Enrichment → [backend/enrichment.md](./backend/enrichment.md)
> - Sequences + sending + inbox → [backend/sequences-messaging.md](./backend/sequences-messaging.md)
> - Admin UI / components / data layer → [frontend/](./frontend/)
> - Bot, integrations, scripts → [integrations/](./integrations/), [operations/](./operations/)
>
> Where this file's project-tree listings, table count, or migration list disagree with the deep dives, the deep dives win — they were rebuilt from current source on 2026-04-28.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16 (App Router), React 19, Tailwind CSS v4 |
| UI | Glassmorphic design system (Poppins + Inter fonts, orange/indigo accents) |
| Backend | Supabase (Postgres, Auth, Edge Functions, Realtime, pg_cron) |
| AI/Enrichment | Gemini 2.5 Flash, Apollo (persons + organizations), Perplexity Sonar (org deep research) |
| Email Sync | Fastmail JMAP API |
| Notifications | Telegram Bot (Grammy, long-running on Railway) |
| Sending | SendGrid (email), HeyReach (LinkedIn) |
| Drag & Drop | @hello-pangea/dnd |
| CSV Parsing | PapaParse |
| Icons | Lucide React |
| Language | TypeScript throughout |

## High-Level Flow

```
Browser (Admin CRM)                    Telegram Bot (Railway)
    │                                      │
    ├── Direct Supabase queries            ├── Supabase Realtime subscriptions
    ├── Next.js API routes                 │   (inbound_emails, interactions,
    ├── Server actions                     │    job_log, persons, organizations)
    ├── Edge Function invocations          ├── Grammy long-polling (getUpdates)
    │                                      ├── Inline keyboard menus
    v                                      └── Rate-limited notification queue
Supabase
    ├── Postgres (18 tables with RLS)
    ├── Auth (email/password, guards /admin/*)
    ├── Realtime (Postgres changes → bot notifications)
    ├── Edge Functions (6 Deno functions)
    ├── pg_cron (hourly send + status sync, 15-min inbox sync)
    └── pg_notify (automation triggers)

External Services
    ├── Fastmail JMAP (inbound email sync)
    ├── Telegram Bot API (real-time notifications + mobile CRM control)
    ├── Apollo (person enrichment + org firmographics + people search at orgs)
    ├── Perplexity Sonar (org deep research)
    ├── Gemini 2.5 Flash (org synthesis + ICP scoring, message generation)
    ├── SendGrid (email sending + status)
    └── HeyReach (LinkedIn sending)
```

## Data Model

The CRM is built around five core entities:

| Entity | Table | Description |
|--------|-------|-------------|
| **Persons** | `persons` | Individuals — speakers, founders, partners, etc. ICP scoring via `persons_with_icp` Postgres view |
| **Organizations** | `organizations` | Companies, DAOs, protocols, funds. Tracks `enrichment_status`, `enrichment_stages` (per-stage jsonb), `last_enriched_at` |
| **Events** | `events` | Conferences and gatherings |
| **Initiatives** | `initiatives` | Campaign tracking units (e.g., "EthCC 2026 Outreach") |
| **Interactions** | `interactions` | Unified timeline of all touchpoints (cold_email, cold_linkedin, reply, meeting, note, etc.) |
| **Company Context** | `company_context` | Singleton — ICP criteria, positioning, language rules for enrichment |

**Key relationships:**
- `person_organizations` — many-to-many with role/title
- `event_participations` — many-to-many between persons/organizations and events, with roles (speaker, sponsor, attendee, organizer, panelist, etc.)
- `person_event_affiliations` — trigger-maintained indirect person↔event link derived from `person_organization` × `event_participations`; lets callers target "persons affiliated through a participating org" as a first-class set
- `interactions` — ties a person + initiative + channel into a single interaction record; replaces the old messages table
- `persons_with_icp` — Postgres view that computes ICP score and enrichment status
- `company_context` — singleton row storing ICP criteria, positioning, and language rules used by Gemini scoring

**Correlation engine:**
- `find_person_correlations` RPC — uses `pg_trgm` fuzzy matching to detect duplicate persons by name, email, LinkedIn, and Twitter similarity
- `merge_persons` RPC — merges two person records, reassigning all related interactions, event participations, and organization links to the surviving record
- Correlations page shows pending matches with confidence scores for review

## Project Structure

```
Cannes/
├── app/                          # Next.js App Router pages
│   ├── layout.tsx                # Root layout (Poppins + Inter + Geist Mono fonts)
│   ├── globals.css               # Tailwind v4, glass utilities, grid bg, CSS vars
│   ├── (public)/                 # Public route group (no admin shell)
│   │   ├── jb/page.tsx           # JB landing page at /jb
│   │   └── wes/page.tsx          # Wes landing page at /wes
│   ├── login/page.tsx            # Login page (outside admin layout)
│   ├── admin/                    # Admin CRM (auth-guarded)
│   │   ├── layout.tsx            # CRM shell (glassmorphic sidebar + header + bg-grid)
│   │   ├── page.tsx              # Dashboard (stat cards, pipeline funnel, activity, quick actions)
│   │   ├── persons/
│   │   │   ├── page.tsx          # Persons list (search, filters, pagination)
│   │   │   └── [id]/page.tsx     # Person detail (glass cards, interaction timeline)
│   │   ├── organizations/
│   │   │   ├── page.tsx          # Organizations list (search, filters, pagination)
│   │   │   └── [id]/page.tsx     # Organization detail (glass cards)
│   │   ├── events/
│   │   │   ├── page.tsx          # Events card grid
│   │   │   └── [id]/page.tsx     # Event detail (tabs, participations)
│   │   ├── initiatives/
│   │   │   ├── page.tsx          # Initiatives list
│   │   │   └── [id]/page.tsx     # Initiative detail + interactions
│   │   ├── correlations/
│   │   │   └── page.tsx          # Correlation review (merge/dismiss duplicate persons)
│   │   ├── pipeline/
│   │   │   ├── page.tsx          # Pipeline (kanban + table toggle)
│   │   │   └── actions.ts        # Server action for drag-and-drop moves
│   │   ├── sequences/
│   │   │   ├── page.tsx          # Sequence list
│   │   │   ├── [id]/page.tsx     # Sequence detail + step editor
│   │   │   └── actions.ts        # Server action for step updates
│   │   ├── inbox/
│   │   │   ├── page.tsx          # Inbox server wrapper
│   │   │   └── inbox-client.tsx  # Inbox client (email list + detail)
│   │   ├── enrichment/
│   │   │   ├── page.tsx          # Enrichment runner (person + org + people finder) + job history
│   │   │   ├── [jobId]/page.tsx  # Job detail (stats, expandable results, people finder)
│   │   │   └── [jobId]/job-results-client.tsx  # Interactive results viewer
│   │   ├── uploads/
│   │   │   ├── page.tsx          # CSV upload + column mapper
│   │   │   └── actions.ts        # Server action for import processing
│   │   └── settings/
│   │       ├── page.tsx          # Settings (5 tabs: company profile, senders, prompts, rules, events)
│   │       └── actions.ts        # Server actions for settings CRUD + company context
│   └── api/
│       ├── enrich/
│       │   ├── route.ts              # Legacy Apollo enrichment (targets old contacts table)
│       │   ├── persons/route.ts      # Person enrichment pipeline (Apollo People Match + reverse org linkage)
│       │   └── organizations/route.ts # Organization enrichment pipeline (Apollo + Perplexity + Gemini)
│       ├── messages/
│       │   ├── generate/route.ts # Generate interactions (cold_email, cold_linkedin, etc.)
│       │   └── send/route.ts     # Send interactions, update status
│       ├── correlations/
│       │   └── merge/route.ts    # Merge/dismiss duplicate persons
│       └── inbox/
│           ├── route.ts          # Fastmail JMAP fetch + correlation against persons
│           └── sync/route.ts     # Manual sync trigger
├── components/
│   ├── ui/                       # Reusable glass primitives
│   │   ├── glass-card.tsx        # Base glass surface (variants: hover, glow)
│   │   ├── glass-input.tsx       # Glass-styled text input with icon
│   │   ├── glass-select.tsx      # Glass-styled select dropdown
│   │   ├── stat-card.tsx         # Dashboard stat card with icon
│   │   ├── badge.tsx             # Status badges (rounded-full, glass variants)
│   │   └── tabs.tsx              # Glass tab bar with orange active indicator
│   └── admin/                    # CRM-specific components
│       ├── sidebar.tsx           # Nav with Lucide icons, collapse toggle
│       ├── header.tsx            # Breadcrumb + user email + sign out
│       ├── breadcrumb.tsx        # Auto-generated from pathname
│       ├── search-bar.tsx        # Glass search input
│       ├── filter-bar.tsx        # Horizontal filter dropdowns
│       ├── person-table.tsx      # Person data table (glass styling)
│       ├── organization-table.tsx # Organization data table
│       ├── interaction-table.tsx # Interaction data table (unified timeline)
│       ├── message-actions.tsx   # Interaction action buttons
│       ├── activity-feed.tsx     # Recent job_log entries
│       ├── signals-timeline.tsx  # Organization signals list
│       ├── pipeline-bar.tsx      # Horizontal stacked funnel bar
│       ├── pipeline-view.tsx     # Kanban/table toggle wrapper
│       ├── pipeline-table.tsx    # Pipeline table view
│       ├── kanban-board.tsx      # DnD kanban with @hello-pangea/dnd
│       ├── kanban-column.tsx     # Single kanban column
│       ├── drag-card.tsx         # Draggable person card
│       ├── step-editor.tsx       # Sequence step timeline editor
│       ├── file-dropzone.tsx     # Drag-and-drop CSV upload zone
│       └── column-mapper.tsx     # CSV column → field mapping UI
├── lib/
│   ├── supabase/
│   │   ├── client.ts             # Browser Supabase client
│   │   ├── server.ts             # Server Supabase client
│   │   ├── middleware.ts         # Auth session helper
│   │   └── fetch-all.ts          # Paginated fetch utility
│   ├── types/
│   │   ├── database.ts           # TypeScript types for all tables
│   │   └── pipeline.ts           # Pipeline-specific types
│   ├── enrichment/
│   │   ├── fetch-with-retry.ts   # Resilient fetch wrapper — timeout (AbortController), exponential backoff retry, structured logging
│   │   ├── apollo.ts             # Apollo org API — firmographics, with domain→name fallback
│   │   ├── apollo-people.ts      # Apollo People Search — find contacts at orgs (search + enrich)
│   │   ├── perplexity.ts         # Perplexity Sonar — deep research + website discovery
│   │   ├── gemini.ts             # Gemini 2.5 Flash — synthesis + ICP scoring (reads from company_context DB)
│   │   ├── pipeline.ts           # Org enrichment orchestrator — 5 stages, smart ordering, batch + progress, per-org timeouts, stale job cleanup
│   │   └── person-pipeline.ts    # Person enrichment orchestrator — Apollo Match, COALESCE updates, reverse org linkage, batch runner
│   ├── fastmail.ts               # Fastmail JMAP client (session + email fetch, uses 'headers' array property syntax)
│   ├── inbox-correlator.ts       # Email-to-person correlation engine
│   ├── telegram.ts               # Telegram Bot API notifications
│   └── utils.ts                  # cn() utility (clsx + tailwind-merge)
├── middleware.ts                  # Root middleware (guards /admin/*)
├── supabase/
│   ├── migrations/               # SQL migrations
│   │   ├── 001_schema.sql        # Core tables (persons, organizations, events, etc.)
│   │   ├── 007_sequences_uploads_inbox.sql  # Sequences, uploads, inbox tables
│   │   ├── 008_sequence_status.sql          # Sequence status tracking
│   │   ├── 009_rls_new_tables.sql           # RLS policies for new tables
│   │   ├── 019_company_context.sql         # Company context singleton (ICP, positioning, language rules)
│   │   ├── 022_enrichment_status.sql      # Enrichment status tracking (enrichment_status, enrichment_stages, last_enriched_at on orgs + persons)
│   ├── functions/                # Deno edge functions
│   └── seed.sql                  # Seed data
├── scripts/
│   ├── migrate-csv.ts            # CSV/JSON ETL into Supabase
│   ├── import-all.ts             # Bulk import script
│   └── seed-and-import.ts        # Seed + import runner
├── bot/                          # Telegram bot (separate Railway service)
│   ├── src/
│   │   ├── index.ts              # Entry point — starts Grammy + Supabase Realtime
│   │   ├── supabase.ts           # Service role client singleton
│   │   ├── realtime.ts           # Supabase Realtime subscriptions + event routing
│   │   ├── notifications.ts     # Rate limiter, send/edit, message formatters
│   │   ├── batch-tracker.ts     # In-memory job tracking for progress messages
│   │   ├── menus/               # Inline keyboard menus (dashboard, inbox, enrich, activity, settings)
│   │   │   └── main.ts          # Callback router
│   │   └── types.ts             # Minimal type subset from app
│   ├── tests/                   # Vitest tests
│   ├── package.json             # grammy, @supabase/supabase-js
│   ├── tsconfig.json
│   └── Dockerfile               # node:20-alpine
├── extra/                        # Non-app files (scraping data, old landing pages, CSVs, socials)
│   ├── scraping/                 # Scraping scripts + data
│   ├── fp-data-seed/             # Event seed data (EthCC, DC Blockchain, leads)
│   └── socials/                  # Content strategy + voice profiles
└── public/landing/               # Static assets for landing pages
```

## Authentication Flow

1. User visits `/admin/*`
2. `middleware.ts` checks for Supabase auth cookies (`sb-*-auth-token`) — no `@supabase/ssr` dependency for Edge runtime compatibility
3. If no auth cookie, redirects to `/login`
4. Login page (at `app/login/page.tsx`, outside admin layout) uses `supabase.auth.signInWithPassword()` (client-side)
5. On success, redirects to `/admin` which loads `app/admin/layout.tsx`
6. Layout server-side verifies auth via `supabase.auth.getUser()`, fetches events for sidebar

**Note:** The login page must live outside `/admin/` to avoid infinite redirects — the admin layout itself redirects unauthenticated users.

## Deployment

- **Web App:** Vercel (auto-deploys from `main` branch on GitHub)
- **Telegram Bot:** Railway (separate service from `bot/` directory, Dockerfile-based)
- **Domain:** gofpblock.com (www.gofpblock.com)
- **Repository:** [github.com/HoboCrunch/fpblock](https://github.com/HoboCrunch/fpblock)
- **Edge Functions:** Deployed separately to Supabase via `npx supabase functions deploy`
- **Env vars:** Vercel for web app (`NEXT_PUBLIC_*` baked at build time); Railway for bot

## Data Flow: End-to-End Pipeline

```
1. Upload CSV or import persons/organizations
   → /admin/uploads (PapaParse + column mapper + server action)
         │
2. Deduplicate via Correlation Engine
   → /admin/correlations (pg_trgm fuzzy matching)
   → review and merge duplicate persons
         │
3. Enrich persons via Apollo People Match
   → POST /api/enrich/persons
   → fills email, LinkedIn, Twitter, phone, title, seniority, photo on persons table
   → reverse org linkage: links unassociated persons to discovered orgs (creates stubs if needed)
   → tracks enrichment_status (none → in_progress → complete/failed) + last_enriched_at
         │
4. Enrich organizations (5-stage pipeline)
   → POST /api/enrich/organizations
   → Smart ordering: parallel path if org has website, discovery path if not
   → Perplexity Sonar discovers website/domain + deep research
   → Apollo firmographics (industry, employees, revenue, funding, tech stack, HQ)
   → Gemini 2.5 Flash synthesizes + ICP scores (reads criteria from company_context table)
   → People Finder: Apollo People Search finds contacts → dedup → insert/merge persons
   → Updates org record + inserts signals + creates person records with source tracking
         │
5. Create initiatives and outreach sequences
   → /admin/initiatives (campaign grouping)
   → /admin/sequences (step editor with timing + templates)
         │
6. Generate interactions (Gemini)
   → POST /api/messages/generate
   → creates draft interactions (cold_email, cold_linkedin, etc.)
         │
7. Review in Pipeline
   → /admin/pipeline (kanban drag-and-drop or table view)
   → drag cards between stages, approve/schedule
         │
8. Send interactions
   → Edge Function: send-message (SendGrid / HeyReach)
   → triggered manually or by pg_cron hourly
         │
9. Monitor replies via Inbox
   → /admin/inbox (Fastmail JMAP sync)
   → auto-correlates replies to persons (not old contacts table)
   → updates interaction status to "replied"
   → sends Telegram notification
         │
10. Track in Pipeline
    → persons automatically move to Replied column
    → full visibility across all stages
```

## Design System

- **Background:** `#0f0f13` with 48px grid pattern
- **Surfaces:** Glassmorphic — `rgba(255,255,255,0.03)` bg, `backdrop-blur-xl`, subtle borders
- **Primary accent:** `#f58327` (orange) — active nav, primary buttons
- **Secondary accent:** `#6e86ff` (indigo) — links, secondary actions
- **Typography:** Poppins (headings), Inter (body), Geist Mono (code)
- **Components:** Rounded-xl cards, rounded-full badges, orange hover glows

## Key Design Decisions

- **Server Components by default**: All admin pages are async server components that fetch data directly. Only interactive parts (sidebar, header, tabs, kanban, inbox) are client components.
- **Tailwind v4**: Uses CSS-based configuration (`@import "tailwindcss"` in globals.css), not `tailwind.config.ts`. Design tokens via CSS custom properties.
- **Glassmorphic design**: Inspired by the /jb and /wes public landing pages, adapted for productivity tool use.
- **RLS with simple policy**: All tables use "authenticated full access" — this is an internal tool with a small, trusted user base.
- **Next.js API routes for enrichment/inbox**: Apollo enrichment and Fastmail sync run via API routes (not edge functions) for easier debugging and access to Node.js APIs.
- **Edge Functions for external APIs**: Generation, sending, and company enrichment go through Supabase Edge Functions, keeping API keys server-side.
- **Fastmail JMAP for inbox**: Direct JMAP protocol integration for email sync from jb@gofpblock.com and wes@gofpblock.com. Uses `headers` array property syntax (not `header:Name:asText`). Service role client bypasses RLS in sync route. Correlation matches against `persons` table. Organization data joined via `person_organization` -> `organizations`.
- **Organization enrichment pipeline**: Five-stage pipeline in `lib/enrichment/` — smart ordering based on data availability. If org has a website: Apollo + Perplexity run in parallel (fast). If no website: Perplexity runs first to discover domain, then Apollo uses discovered domain. Gemini synthesizes into structured fields + ICP score using criteria from `company_context` table (editable in Settings). People Finder searches Apollo for contacts at each org, deduplicates against existing persons, and creates `person_organization` links with source tracking. Apollo modules retry with name-based fallback when domain lookups fail.
- **Enrichment resilience**: All external API calls go through `fetch-with-retry.ts` — a shared wrapper providing per-request timeouts (AbortController), exponential backoff retry (skip on 4xx, retry on 5xx/network errors), and structured logging (`[enrichment] [module:orgName] attempt X/N`). Timeouts: Apollo 30s, Perplexity 60s, Gemini 45s, People Match 20s. Pipeline stages are wrapped in `withTimeout()` (Apollo+Perplexity 60s, Gemini 60s, People Finder 45s). Batch runner processes 3 orgs in parallel (`concurrency: 3`) and catches per-org errors gracefully so one failure doesn't block remaining orgs. `cleanupStaleJobs()` runs at batch start, marking any "processing" jobs older than 15 minutes as failed (catches orphaned jobs from server timeouts). Full pipeline logs individual `enrichment_gemini` child jobs with `icp_score` at the metadata top level so the UI can poll ICP scores during processing (not deferred to full completion).
- **Person enrichment pipeline**: Dedicated pipeline in `lib/enrichment/person-pipeline.ts` for enriching existing persons directly (not just as a side effect of org enrichment). Calls Apollo People Match to fill missing contact details (email, phone, LinkedIn, Twitter, title, seniority, photo) using COALESCE logic (only fills nulls). Performs reverse org linkage: if a person has no organization association and Apollo returns org data, searches existing orgs by domain then name, creating a stub org if not found. Persons need at least one of linkedin_url, apollo_id, or org context to attempt a match — insufficient identifiers are marked as failed. Source tracking: persons from org enrichment are tagged `source: "org_enrichment"`, person_organization links from direct enrichment are tagged `source: "direct_enrichment"`. The `person.source` field itself is never overwritten — it tracks how the person entered the system. API route at `POST /api/enrich/persons` supports filters: personIds, eventId, organizationId, failedOnly, sourceFilter (mutually exclusive, first-match-wins pattern matching the org route).
- **Enrichment status tracking**: Organizations and persons have `enrichment_status` ('none'/'in_progress'/'partial'/'complete'/'failed') and `last_enriched_at` columns. Organizations also have `enrichment_stages` (jsonb) tracking per-stage status, timestamp, and error. Pipeline writes status progressively as each stage completes. On re-runs, already-completed stages are skipped (cached data loaded from job_log). Parent batch jobs store `organization_ids` in metadata (up to 500) for unprocessed org detection. The enrichment UI offers "Never enriched" and "Failed/Incomplete" targets, with a retry flow from job detail pages via `?retry={jobId}` query param.
- **Telegram bot (Railway)**: Long-running Node.js process in `bot/` deployed as a separate Railway service. Uses Grammy for Telegram long-polling and Supabase Realtime for DB change notifications. Provides real-time push notifications (inbound replies, bounces, batch job progress) and inline-keyboard menus for mobile CRM control (dashboard stats, inbox, enrichment triggers, mute settings). Rate-limited at 1 msg/sec with queue overflow collapse. Enrichment notifications are consolidated: one message per batch (parent job only — child jobs filtered out), progressively edited with a progress bar every ~4s, and a final summary with enriched count, signals, people found, and duration. Supports both org (`enrichment_batch_organizations`) and person (`enrichment_batch_persons`) batches. Stale jobs cleaned up after 10 minutes.
- **Interaction versioning**: Interactions use `sequence_number` + `iteration` to track position in a sequence and regeneration count. Old iterations are marked `superseded`.
- **Pipeline operates on persons**: Kanban/table views show one card per person at their most advanced outreach stage, not one card per interaction.
- **Correlation engine**: Uses `pg_trgm` extension for fuzzy matching across name, email, LinkedIn, and Twitter fields. The `find_person_correlations` RPC surfaces potential duplicates; `merge_persons` RPC handles the merge, reassigning all related records to the surviving person.
- **Company context**: ICP criteria, positioning, and language rules stored in `company_context` singleton table, editable via Settings > Company Profile. Gemini reads these at enrichment time, falling back to hardcoded defaults if the DB row is missing.
- **Event participation model**: Events link to persons and organizations via `event_participations` with explicit roles (speaker, sponsor, attendee, organizer, panelist), replacing simple foreign keys. A companion table `person_event_affiliations` (migration 025) captures the indirect person↔event link that arises when a person belongs to an organization that participates in an event. It's maintained automatically by bidirectional Postgres triggers on `person_organization` and `event_participations`: inserts propagate for `is_current=true` links and any org participation; structural deletes cascade, but flipping `is_current` to false is intentionally a no-op so historical affiliation is preserved. Consumers (persons list, event detail, enrichment API, sequences enrollment, org detail stats) always go through `lib/queries/event-persons.ts` → `getPersonIdsForEvent(supabase, eventId, relation)`, supporting four relation modes: `direct`, `org_affiliated`, `either`, `both`.
- **Initiative-based tracking**: Initiatives group interactions into campaigns, enabling per-campaign analytics and sequence management.
