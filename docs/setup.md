# Setup & Deployment Guide

> See also: [dev-practices.md](./dev-practices.md) for the day-to-day developer workflow (build/lint/test, env var inventory, migration workflow, commit conventions). The migration list in the "Database Setup" section below is from an earlier era — current count is 23 live migrations spanning 001–025; use `npx supabase db push --linked` rather than the hand-listed order.

## Prerequisites

- Node.js 18+
- npm
- Supabase CLI (`npm install -D supabase`)
- A Supabase project

## Local Development

### 1. Install dependencies

```bash
npm install
```

### 2. Configure .env.local

Create `.env.local` in the project root:

```
# Supabase (required — app won't load without these)
NEXT_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...  # JWT anon key (NOT the sb_publishable_* format)
NEXT_SUPABASE_SECRET_KEY=sb_secret_...  # Server-only, for API routes

# Enrichment APIs (used by API routes + edge functions)
APOLLO_API_KEY=...
PERPLEXITY_API_KEY=...
GEMINI_API_KEY=...

# Email (inbox sync)
FASTMAIL_API_KEY=...

# Telegram Bot (optional — notifications silently skipped if unset)
TELEGRAM_BOT_TOKEN=...     # From @BotFather
TELEGRAM_CHAT_ID=...       # Chat/group ID for notifications

# Scraping / outreach (not used by app, only by scripts in extra/)
BRAVE_SEARCH_API_KEY=...
SENDGRID_API_KEY=...
HEYREACH_API_KEY=...
```

**Important:** The anon key must be the JWT format (`eyJ...`), not the newer `sb_publishable_*` format. Retrieve it with:
```bash
npx supabase projects api-keys --project-ref <your-project-ref>
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
- `ƒ /api/enrich`, `/api/inbox/*` — API routes

---

## Database Setup

### Apply Migrations

Run these SQL files **in order** in the Supabase SQL Editor (Dashboard > SQL Editor):

1. `supabase/migrations/001_schema.sql` — core tables + indexes
2. `supabase/migrations/002_sequences_uploads_inbox.sql` — sequences, uploads, inbox tables, replied_at, message_status_counts RPC
3. `supabase/migrations/002_rls.sql` — RLS policies
4. `supabase/migrations/003_triggers.sql` — updated_at + automation triggers
5. `supabase/migrations/004_cron.sql` — pg_cron jobs (send + sync)
6. `supabase/migrations/005_rpc.sql` — message_status_counts() function (also in 002, safe to run twice)

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

Create an admin user with your own email/password credentials.

---

## Data Migration

Import existing scraping/research data into Supabase:

```bash
npx tsx scripts/migrate-csv.ts
```

This imports from CSV/JSON files in `extra/scraping/data/` and `extra/fp-data-seed/`.

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
  HEYREACH_API_KEY=<your-heyreach-key>
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

## Vercel Deployment

The app is deployed to Vercel at **gofpblock.com**.

### Environment Variables

Set these in **Vercel Dashboard > Project Settings > Environment Variables** (Production):

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | JWT anon key (`eyJ...` format) |
| `NEXT_SUPABASE_SECRET_KEY` | Supabase service role / secret key |
| `APOLLO_API_KEY` | Apollo.io API key |
| `PERPLEXITY_API_KEY` | Perplexity Sonar API key |
| `GEMINI_API_KEY` | Google Gemini API key |
| `FASTMAIL_API_KEY` | Fastmail JMAP API key |
| `TELEGRAM_BOT_TOKEN` | Telegram Bot API token |
| `TELEGRAM_CHAT_ID` | Telegram chat ID for notifications |

**Important:** `NEXT_PUBLIC_*` vars are baked in at build time. After changing them, you must redeploy.

### Deploy

Pushes to `main` on [github.com/HoboCrunch/fpblock](https://github.com/HoboCrunch/fpblock) auto-deploy to Vercel.

### API Route Timeouts

Long-running routes have `maxDuration` configured:
- `/api/enrich` — 60s
- `/api/enrich/organizations` — 300s (requires Vercel Pro for >60s)
- `/api/sequences/execute` — 60s

### Middleware

`middleware.ts` guards `/admin/*` routes by checking for Supabase auth cookies. No `@supabase/ssr` dependency — uses direct cookie inspection for Edge runtime compatibility.

---

## Telegram Bot (Railway)

The Telegram bot runs as a separate Railway service from the `bot/` directory.

### Setup

1. **Create Railway service** — New Service → GitHub Repo, select this repo
2. **Set Root Directory** — Settings → Source → Root Directory: `bot`
3. **Set environment variables:**

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (bypasses RLS) |
| `TELEGRAM_BOT_TOKEN` | Bot API token from @BotFather |
| `TELEGRAM_CHAT_ID` | Private group chat ID |
| `APP_URL` | Web app URL (e.g., `https://gofpblock.com`) — used for inbox sync |

4. **Deploy** — Railway auto-builds from the Dockerfile

### Verify

Check Railway logs for:
```
[bot] Starting FP Block CRM Bot...
[bot] Realtime subscriptions active
[bot] Grammy polling started
```

Send `/start` in the Telegram group to see the inline keyboard menu.

### Local Development

```bash
cd bot
npm install
npm run dev
```

Requires the same env vars set in a `.env` file in `bot/`.

---

## Deployment Checklist

- [ ] Apply all migrations to Supabase (001 through 019)
- [ ] Run seed.sql
- [ ] Create auth user in Supabase Dashboard
- [ ] Set Supabase edge function secrets (`npx supabase secrets set`)
- [ ] Deploy all 6 edge functions (`npx supabase functions deploy`)
- [ ] Set app.settings.supabase_url and app.settings.secret_key in DB config
- [ ] Set all env vars in Vercel (see table above)
- [ ] Deploy Telegram bot on Railway (see section above)
- [ ] Verify auto-deploy from GitHub
- [ ] Verify: login, dashboard, persons, organizations, events, pipeline, sequences, inbox, enrichment, uploads, settings
- [ ] Verify: `/`, `/jb`, `/wes` landing pages render
- [ ] Verify: `/start` in Telegram group shows bot menu
- [ ] Run data migration if needed: `npx tsx scripts/migrate-csv.ts`
