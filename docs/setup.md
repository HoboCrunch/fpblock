# Setup & Deployment Guide

## Prerequisites

- Node.js 18+
- npm
- Supabase CLI (`npm install -D supabase`)
- A Supabase project (current: `<your-project-ref>`)

## Local Development

### 1. Install dependencies

```bash
cd /Users/evansteinhilv/genzio/Cannes
npm install
```

### 2. Verify .env.local

The `.env.local` file should contain:

```
# Supabase (required for the app)
NEXT_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...  # JWT anon key (NOT the sb_publishable_* format)

# External APIs (used by edge functions + migration script)
APOLLO_API_KEY=...
GEMINI_API_KEY=...
BRAVE_SEARCH_API_KEY=...
PERPLEXITY_API_KEY=...
SENDGRID_API_KEY=...
HEYREACH_API_KEY=...
```

### 3. Start dev server

```bash
npm run dev
```

App runs at `http://localhost:3000`.

### 4. Build check

```bash
npm run build
```

Should compile successfully with these routes:
- `○ /jb`, `○ /wes` — static
- `ƒ /admin/*` — dynamic (server-rendered)

---

## Database Setup

### Apply Migrations

Run these SQL files **in order** in the Supabase SQL Editor (Dashboard > SQL Editor):

1. `supabase/migrations/001_schema.sql` — tables + indexes
2. `supabase/migrations/002_rls.sql` — RLS policies
3. `supabase/migrations/003_triggers.sql` — updated_at + automation triggers
4. `supabase/migrations/004_cron.sql` — pg_cron jobs (send + sync)
5. `supabase/migrations/005_rpc.sql` — message_status_counts() function

Or via CLI:
```bash
npx supabase db push --linked
```

### Run Seed Data

```bash
# Via SQL Editor or:
npx supabase db execute --file supabase/seed.sql
```

This creates sender profiles (JB, Wes), events (EthCC, TOKEN2049), prompt templates, and event config.

### Create Auth User

Go to **Supabase Dashboard > Authentication > Users > Add User**. Create an account with email/password for admin access.

A default user has been created: `admin@gofpblock.com` / `changeme`

### Important: Supabase API Keys

The app requires the **JWT anon key** (starts with `eyJ...`), not the newer `sb_publishable_*` format. To retrieve it:

```bash
npx supabase projects api-keys --project-ref <your-project-ref>
```

Use the `anon` key for `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local`.

---

## Data Migration

Import existing scraping/research data into Supabase:

```bash
npx tsx scripts/migrate-csv.ts
```

This imports from:
- `scraping/data/sponsors.csv` — sponsor companies
- `scraping/data/company_research.csv` — ICP scores, USP, ICP reasons
- `scraping/data/company_news_cache.json` — company signals/context
- `app/data/matrix/base/Cannes-Grid view.csv` — speakers + messages
- `scraping/data/sponsor_contacts.csv` — Apollo-enriched sponsor contacts

**Prerequisites:** Seed data must be applied first (the script looks up the EthCC event ID).

---

## Edge Function Deployment

### Set Secrets

```bash
npx supabase secrets set \
  APOLLO_API_KEY=<your-apollo-key> \
  GEMINI_API_KEY=<your-gemini-key> \
  BRAVE_SEARCH_API_KEY=<your-brave-key> \
  PERPLEXITY_API_KEY=<your-perplexity-key> \
  SENDGRID_API_KEY=<your-sendgrid-key> \
  HEYREACH_API_KEY="<your-heyreach-key>"
```

### Deploy Functions

```bash
npx supabase functions deploy enrich-contact
npx supabase functions deploy enrich-company
npx supabase functions deploy generate-messages
npx supabase functions deploy send-message
npx supabase functions deploy sync-status
npx supabase functions deploy process-automations
```

### Verify Secrets

```bash
npx supabase secrets list
```

---

## CRON Configuration

The `004_cron.sql` migration sets up two hourly jobs:
- **send-scheduled** (`:00`) — calls send-message to send due messages
- **sync-status** (`:30`) — calls sync-status to poll delivery updates

These use `current_setting('app.settings.supabase_url')` and `current_setting('app.settings.secret_key')`. Set these in **Supabase Dashboard > Project Settings > Database > Custom configuration**.

---

## Deployment Checklist

- [ ] Apply migrations 001-005 to Supabase
- [ ] Run seed.sql
- [ ] Create auth user
- [ ] Set edge function secrets
- [ ] Deploy all 6 edge functions
- [ ] Set app.settings.supabase_url and app.settings.secret_key in DB config
- [ ] Run `npx tsx scripts/migrate-csv.ts`
- [ ] Verify: login, dashboard, event view, contact detail, company detail, queue
- [ ] Verify: `/jb` and `/wes` landing pages render
- [ ] Deploy Next.js app (Vercel or similar)
