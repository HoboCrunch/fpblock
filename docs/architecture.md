# Architecture Overview

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16 (App Router), React 19, Tailwind CSS v4 |
| UI | Glassmorphic design system (Poppins + Inter fonts, orange/indigo accents) |
| Backend | Supabase (Postgres, Auth, Edge Functions, Realtime, pg_cron) |
| AI/Enrichment | Gemini 2.0 Flash, Apollo (persons + organizations), Perplexity Sonar (org deep research) |
| Email Sync | Fastmail JMAP API |
| Notifications | Telegram Bot API |
| Sending | SendGrid (email), HeyReach (LinkedIn) |
| Drag & Drop | @hello-pangea/dnd |
| CSV Parsing | PapaParse |
| Icons | Lucide React |
| Language | TypeScript throughout |

## High-Level Flow

```
Browser (Admin CRM)
    │
    ├── Direct Supabase queries via client SDK (reads, writes)
    ├── Next.js API routes (enrichment, inbox sync)
    ├── Server actions (uploads, pipeline moves, settings CRUD)
    ├── Edge Function invocations (generation, sending)
    │
    v
Supabase
    ├── Postgres (18 tables with RLS)
    ├── Auth (email/password, guards /admin/*)
    ├── Edge Functions (6 Deno functions)
    ├── pg_cron (hourly send + status sync, 15-min inbox sync)
    └── pg_notify (automation triggers)

External Services
    ├── Fastmail JMAP (inbound email sync)
    ├── Telegram Bot (reply/bounce notifications)
    ├── Apollo (person enrichment + org firmographics + people search at orgs)
    ├── Perplexity Sonar (org deep research)
    ├── Gemini 2.0 Flash (org synthesis + ICP scoring, message generation)
    ├── SendGrid (email sending + status)
    └── HeyReach (LinkedIn sending)
```

## Data Model

The CRM is built around five core entities:

| Entity | Table | Description |
|--------|-------|-------------|
| **Persons** | `persons` | Individuals — speakers, founders, partners, etc. ICP scoring via `persons_with_icp` Postgres view |
| **Organizations** | `organizations` | Companies, DAOs, protocols, funds |
| **Events** | `events` | Conferences and gatherings |
| **Initiatives** | `initiatives` | Campaign tracking units (e.g., "EthCC 2026 Outreach") |
| **Interactions** | `interactions` | Unified timeline of all touchpoints (cold_email, cold_linkedin, reply, meeting, note, etc.) |
| **Company Context** | `company_context` | Singleton — ICP criteria, positioning, language rules for enrichment |

**Key relationships:**
- `person_organizations` — many-to-many with role/title
- `event_participations` — many-to-many between persons/organizations and events, with roles (speaker, sponsor, attendee, organizer, panelist, etc.)
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
│       │   ├── route.ts              # Apollo enrichment API route (targets persons)
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
│   │   ├── apollo.ts             # Apollo org API — firmographics, with domain→name fallback
│   │   ├── apollo-people.ts      # Apollo People Search — find contacts at orgs (search + enrich)
│   │   ├── perplexity.ts         # Perplexity Sonar — deep research + website discovery
│   │   ├── gemini.ts             # Gemini 2.0 Flash — synthesis + ICP scoring (reads from company_context DB)
│   │   └── pipeline.ts           # Orchestrator — 5 stages (Apollo, Perplexity, Gemini, People Finder, Signals), smart ordering, batch + progress
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
│   ├── functions/                # Deno edge functions
│   └── seed.sql                  # Seed data
├── scripts/
│   ├── migrate-csv.ts            # CSV/JSON ETL into Supabase
│   ├── import-all.ts             # Bulk import script
│   └── seed-and-import.ts        # Seed + import runner
├── scraping/                     # Pre-existing scraping scripts + data
└── public/landing/               # Static assets for landing pages
```

## Authentication Flow

1. User visits `/admin/*`
2. `middleware.ts` intercepts, calls `updateSession()` from `lib/supabase/middleware.ts`
3. If no authenticated session, redirects to `/login`
4. Login page (at `app/login/page.tsx`, outside admin layout) uses `supabase.auth.signInWithPassword()` (client-side)
5. On success, redirects to `/admin` which loads `app/admin/layout.tsx`
6. Layout server-side verifies auth via `supabase.auth.getUser()`, fetches events for sidebar

**Note:** The login page must live outside `/admin/` to avoid infinite redirects — the admin layout itself redirects unauthenticated users.

## Data Flow: End-to-End Pipeline

```
1. Upload CSV or import persons/organizations
   → /admin/uploads (PapaParse + column mapper + server action)
         │
2. Deduplicate via Correlation Engine
   → /admin/correlations (pg_trgm fuzzy matching)
   → review and merge duplicate persons
         │
3. Enrich persons via Apollo
   → /admin/enrichment → POST /api/enrich
   → fills email, LinkedIn, phone, seniority on persons table
         │
4. Enrich organizations (5-stage pipeline)
   → POST /api/enrich/organizations
   → Smart ordering: parallel path if org has website, discovery path if not
   → Perplexity Sonar discovers website/domain + deep research
   → Apollo firmographics (industry, employees, revenue, funding, tech stack, HQ)
   → Gemini 2.0 Flash synthesizes + ICP scores (reads criteria from company_context table)
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
- **Telegram for notifications**: Lightweight push notifications for reply detection and enrichment completion.
- **Interaction versioning**: Interactions use `sequence_number` + `iteration` to track position in a sequence and regeneration count. Old iterations are marked `superseded`.
- **Pipeline operates on persons**: Kanban/table views show one card per person at their most advanced outreach stage, not one card per interaction.
- **Correlation engine**: Uses `pg_trgm` extension for fuzzy matching across name, email, LinkedIn, and Twitter fields. The `find_person_correlations` RPC surfaces potential duplicates; `merge_persons` RPC handles the merge, reassigning all related records to the surviving person.
- **Company context**: ICP criteria, positioning, and language rules stored in `company_context` singleton table, editable via Settings > Company Profile. Gemini reads these at enrichment time, falling back to hardcoded defaults if the DB row is missing.
- **Event participation model**: Events link to persons and organizations via `event_participations` with explicit roles (speaker, sponsor, attendee, organizer, panelist), replacing simple foreign keys.
- **Initiative-based tracking**: Initiatives group interactions into campaigns, enabling per-campaign analytics and sequence management.
