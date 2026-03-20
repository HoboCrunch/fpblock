# Architecture Overview

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16 (App Router), React 19, Tailwind CSS v4 |
| UI | Glassmorphic design system (Poppins + Inter fonts, orange/indigo accents) |
| Backend | Supabase (Postgres, Auth, Edge Functions, Realtime, pg_cron) |
| AI/Enrichment | Gemini 2.0 Flash, Apollo, Brave Search, Perplexity |
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
    ├── Postgres (17 tables with RLS)
    ├── Auth (email/password, guards /admin/*)
    ├── Edge Functions (6 Deno functions)
    ├── pg_cron (hourly send + status sync)
    └── pg_notify (automation triggers)

External Services
    ├── Fastmail JMAP (inbound email sync)
    ├── Telegram Bot (reply/bounce notifications)
    ├── Apollo (contact enrichment)
    ├── SendGrid (email sending + status)
    └── HeyReach (LinkedIn sending)
```

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
│   │   ├── contacts/
│   │   │   ├── page.tsx          # Contacts list (search, filters, pagination)
│   │   │   └── [id]/page.tsx     # Contact detail (glass cards)
│   │   ├── companies/
│   │   │   ├── page.tsx          # Companies list (search, filters, pagination)
│   │   │   └── [id]/page.tsx     # Company detail (glass cards)
│   │   ├── events/
│   │   │   ├── page.tsx          # Events card grid
│   │   │   └── [id]/page.tsx     # Event detail (tabs)
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
│   │   │   └── page.tsx          # Enrichment runner + job history
│   │   ├── uploads/
│   │   │   ├── page.tsx          # CSV upload + column mapper
│   │   │   └── actions.ts        # Server action for import processing
│   │   └── settings/
│   │       ├── page.tsx          # Settings (4 tabs: senders, prompts, rules, events)
│   │       └── actions.ts        # Server actions for settings CRUD
│   └── api/
│       ├── enrich/route.ts       # Apollo enrichment API route
│       └── inbox/
│           ├── route.ts          # Fastmail JMAP fetch + correlation
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
│       ├── sidebar.tsx           # 10-item nav with Lucide icons, collapse toggle
│       ├── header.tsx            # Breadcrumb + user email + sign out
│       ├── breadcrumb.tsx        # Auto-generated from pathname
│       ├── search-bar.tsx        # Glass search input
│       ├── filter-bar.tsx        # Horizontal filter dropdowns
│       ├── contact-table.tsx     # Contact data table (glass styling)
│       ├── company-table.tsx     # Company data table
│       ├── message-table.tsx     # Message data table
│       ├── activity-feed.tsx     # Recent job_log entries
│       ├── signals-timeline.tsx  # Company signals list
│       ├── pipeline-bar.tsx      # Horizontal stacked funnel bar
│       ├── pipeline-view.tsx     # Kanban/table toggle wrapper
│       ├── pipeline-table.tsx    # Pipeline table view
│       ├── kanban-board.tsx      # DnD kanban with @hello-pangea/dnd
│       ├── kanban-column.tsx     # Single kanban column
│       ├── drag-card.tsx         # Draggable contact card
│       ├── step-editor.tsx       # Sequence step timeline editor
│       ├── file-dropzone.tsx     # Drag-and-drop CSV upload zone
│       └── column-mapper.tsx     # CSV column → field mapping UI
├── lib/
│   ├── supabase/
│   │   ├── client.ts             # Browser Supabase client
│   │   ├── server.ts             # Server Supabase client
│   │   └── middleware.ts         # Auth session helper
│   ├── types/
│   │   ├── database.ts           # TypeScript types for all 17 tables
│   │   └── pipeline.ts           # Pipeline-specific types
│   ├── fastmail.ts               # Fastmail JMAP client (session + email fetch)
│   ├── inbox-correlator.ts       # Email-to-contact correlation engine
│   ├── telegram.ts               # Telegram Bot API notifications
│   └── utils.ts                  # cn() utility (clsx + tailwind-merge)
├── middleware.ts                  # Root middleware (guards /admin/*)
├── supabase/
│   ├── migrations/               # SQL migrations
│   │   ├── 001_schema.sql        # Core 13 tables
│   │   └── 002_sequences_uploads_inbox.sql  # Sequences, uploads, inbox tables
│   ├── functions/                # Deno edge functions (6)
│   └── seed.sql                  # Seed data
├── scripts/
│   └── migrate-csv.ts            # CSV/JSON ETL into Supabase
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
1. Upload CSV or import contacts
   → /admin/uploads (PapaParse + column mapper + server action)
         │
2. Enrich contacts via Apollo
   → /admin/enrichment → POST /api/enrich
   → fills email, LinkedIn, phone, seniority
         │
3. Enrich companies (Brave + Perplexity + Gemini)
   → Edge Function: enrich-company
   → fills company.context, creates company_signals
         │
4. Create outreach sequences
   → /admin/sequences (step editor with timing + templates)
         │
5. Generate messages (Gemini)
   → Edge Function: generate-messages
   → creates draft messages using prompt templates
         │
6. Review in Pipeline
   → /admin/pipeline (kanban drag-and-drop or table view)
   → drag cards between stages, approve/schedule
         │
7. Send messages
   → Edge Function: send-message (SendGrid / HeyReach)
   → triggered manually or by pg_cron hourly
         │
8. Monitor replies via Inbox
   → /admin/inbox (Fastmail JMAP sync)
   → auto-correlates replies to pipeline contacts
   → updates message status to "replied"
   → sends Telegram notification
         │
9. Track in Pipeline
   → contacts automatically move to Replied column
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
- **Fastmail JMAP for inbox**: Direct JMAP protocol integration for email sync from jb@gofpblock.com and wes@gofpblock.com.
- **Telegram for notifications**: Lightweight push notifications for reply detection and enrichment completion.
- **Message versioning**: Messages use `sequence_number` + `iteration` to track position in a sequence and regeneration count. Old iterations are marked `superseded`.
- **Pipeline operates on contacts**: Kanban/table views show one card per contact at their most advanced outreach stage, not one card per message.
