# Architecture Overview

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16 (App Router), React 19, Tailwind CSS v4 |
| Backend | Supabase (Postgres, Auth, Edge Functions, Realtime, pg_cron) |
| AI/Enrichment | Gemini 2.0 Flash, Apollo, Brave Search, Perplexity |
| Sending | SendGrid (email), HeyReach (LinkedIn) |
| Language | TypeScript throughout |

## High-Level Flow

```
Browser (Admin Panel)
    │
    ├── Direct Supabase queries via client SDK (reads, writes)
    ├── Edge Function invocations (enrichment, generation, sending)
    │
    v
Supabase
    ├── Postgres (13 tables with RLS)
    ├── Auth (email/password, guards /admin/*)
    ├── Edge Functions (6 Deno functions)
    ├── pg_cron (hourly send + status sync)
    └── pg_notify (automation triggers)
```

## Project Structure

```
Cannes/
├── app/                          # Next.js App Router pages
│   ├── layout.tsx                # Root layout (Tailwind globals)
│   ├── (public)/                 # Public route group (no admin shell)
│   │   ├── jb/page.tsx           # JB landing page at /jb
│   │   └── wes/page.tsx          # Wes landing page at /wes
│   ├── login/page.tsx             # Login page (outside admin layout)
│   └── admin/                    # Admin panel (auth-guarded)
│       ├── layout.tsx            # Admin shell (sidebar + header)
│       ├── page.tsx              # Dashboard
│       ├── events/[id]/page.tsx  # Event view (tabs)
│       ├── contacts/[id]/page.tsx # Contact detail
│       ├── companies/[id]/page.tsx # Company detail
│       └── queue/page.tsx        # Message queue (tabs)
├── components/
│   ├── ui/                       # Reusable primitives
│   │   ├── badge.tsx             # Status badges with color variants
│   │   └── tabs.tsx              # Client-side tab switcher
│   └── admin/                    # Admin-specific components
│       ├── sidebar.tsx           # Navigation + event list
│       ├── header.tsx            # User email + sign out
│       ├── summary-cards.tsx     # Dashboard stat cards
│       ├── activity-feed.tsx     # Recent job_log entries
│       ├── contact-table.tsx     # Contact data table
│       ├── company-table.tsx     # Company data table
│       ├── message-table.tsx     # Message data table
│       └── signals-timeline.tsx  # Company signals list
├── lib/
│   ├── supabase/
│   │   ├── client.ts             # Browser Supabase client
│   │   ├── server.ts             # Server Supabase client
│   │   └── middleware.ts         # Auth session helper
│   ├── types/
│   │   └── database.ts           # TypeScript types for all tables
│   └── utils.ts                  # cn() utility (clsx + tailwind-merge)
├── middleware.ts                  # Root middleware (guards /admin/*)
├── supabase/
│   ├── migrations/               # SQL migrations (001-005)
│   ├── functions/                # Deno edge functions (6)
│   │   ├── _shared/cors.ts       # Shared CORS headers
│   │   ├── enrich-contact/       # Apollo enrichment
│   │   ├── enrich-company/       # Brave + Perplexity + Gemini
│   │   ├── generate-messages/    # Gemini message generation
│   │   ├── send-message/         # SendGrid + HeyReach sending
│   │   ├── sync-status/          # Delivery status polling
│   │   └── process-automations/  # Rule-based automation triggers
│   └── seed.sql                  # Seed data (senders, events, templates)
├── scripts/
│   └── migrate-csv.ts            # CSV/JSON ETL into Supabase
├── scraping/                     # Pre-existing scraping scripts + data
├── landing-page/                 # Original HTML landing pages (source)
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

## Data Flow: Enrichment to Sending

```
1. Contact imported (CSV migration or manual)
         │
2. enrich-contact (Apollo)
   → fills email, LinkedIn, phone, seniority
         │
3. enrich-company (Brave + Perplexity + Gemini)
   → fills company.context, creates company_signals
         │
4. generate-messages (Gemini)
   → creates message drafts using prompt templates
   → supports channel-specific templates, sender overrides
   → handles message versioning (supersede previous iterations)
         │
5. Human reviews drafts in admin panel (/admin/queue)
   → approves/edits, sets scheduled_at
         │
6. send-message (SendGrid / HeyReach)
   → triggered manually or by pg_cron hourly
   → sets processing → sent status
         │
7. sync-status (SendGrid Activity API)
   → polls for bounces, opens
   → updates message status accordingly
```

## Key Design Decisions

- **Server Components by default**: All admin pages are async server components that fetch data directly. Only interactive parts (sidebar, header, tabs) are client components.
- **Tailwind v4**: Uses CSS-based configuration (`@import "tailwindcss"` in globals.css), not `tailwind.config.ts`.
- **RLS with simple policy**: All tables use "authenticated full access" — this is an internal tool with a small, trusted user base.
- **Edge Functions for external APIs**: All third-party API calls (Apollo, Gemini, Brave, SendGrid, HeyReach) go through Supabase Edge Functions, keeping API keys server-side.
- **Message versioning**: Messages use `sequence_number` + `iteration` to track position in a sequence and regeneration count. Old iterations are marked `superseded`.
