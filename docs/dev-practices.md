# Dev Practices

## Local setup

```bash
# 1. Clone, install deps for the Next app
npm install

# 2. Bot is a separate package
cd bot && npm install && cd ..

# 3. Local Supabase (matches supabase/config.toml)
#    requires the Supabase CLI
supabase start          # API on :54321, DB on :54322
supabase db reset       # apply all supabase/migrations/* + seed.sql

# 4. .env.local at repo root — see env inventory below
cp .env.local.example .env.local   # if/when one exists; otherwise create from scratch
```

Run the app: `npm run dev` (Next 16, Turbopack default). Run the bot: `cd bot && npm run dev` (`tsx watch`). The bot expects the same Supabase project as the app.

## Build / lint / test

Root (`package.json:5-12`):

```bash
npm run dev          # next dev
npm run build        # next build
npm run start        # next start
npm run lint         # eslint (eslint-config-next/core-web-vitals + typescript)
npm run test         # vitest run  (lib/**/*.test.ts, app/**/*.test.ts)
npm run test:watch
```

Bot (`bot/package.json:6-12`):

```bash
npm run dev          # tsx watch src/index.ts
npm run build        # tsc → dist/
npm run start        # node dist/index.js
npm run test         # vitest run
```

## Testing conventions

- **Runner**: Vitest. App config at `vitest.config.ts` — node env, includes `lib/**/*.test.ts` and `app/**/*.test.ts`, with a `@/` alias to repo root.
- **Bot tests** live under `bot/tests/` and run from inside `bot/` (`bot/vitest` defaults). Coverage focuses on pure logic — `BatchTracker`, message formatters, mute state.
- **What's tested today**:
  - `bot/tests/batch-tracker.test.ts` — track/complete/stale logic.
  - `bot/tests/notifications.test.ts` — `formatReplyNotification`, `formatBounceNotification`, `formatInteractionReplied`, `formatBatch*`, `RateLimiter`.
  - `bot/tests/menus/settings.test.ts` — `MuteState`.
  - `lib/queries/event-persons.test.ts` — query layer for event ↔ person resolution.
- The data-prep scripts under `scripts/` are not unit-tested — they're operationally tested by dry-run flags (e.g. `send-outreach.ts --dry-run`) and by `scripts/verify-event-affiliations.ts` which exercises DB triggers end-to-end.

## TypeScript config highlights

`tsconfig.json`:
- `target: ES2017`, `module: esnext`, `moduleResolution: bundler`.
- `strict: true`, `noEmit: true` (Next handles emit).
- Path alias `@/*` → repo root.
- **Excludes**: `node_modules`, `supabase/functions` (Deno), `scripts` (run via `tsx`), `bot` (own tsconfig).
- Bot `bot/tsconfig.json` is independent (ESM, emits to `dist/`).

## Deployment

- **Next.js app** → **Vercel**. Cron is configured in `vercel.json`:
  ```json
  { "crons": [{ "path": "/api/sequences/send", "schedule": "*/5 * * * *" }] }
  ```
- **Supabase** — migrations live in `supabase/migrations/` and are applied with the Supabase CLI (`supabase db push` against the linked project). Edge functions in `supabase/functions/` deploy with `supabase functions deploy <name>`.
- **Telegram bot** — `bot/Dockerfile` exists (`node:20-alpine`, builds `dist/` and runs `node dist/index.js`). The actual hosting target is **not** declared in this repo (no Fly/Railway/Render config). **Verify with team.**

## Env var inventory

All `process.env.*` references in TypeScript across `app/`, `lib/`, `bot/`, `scripts/`. Edge Functions use `Deno.env.get(...)` separately and are listed at the bottom.

| Variable | Purpose | Secret level | Used at (file:line, primary) |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (browser-safe) | Public | `lib/supabase/client.ts:5`, `lib/supabase/server.ts:8`, `lib/supabase/middleware.ts:8` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon JWT (RLS enforced) | Public | `lib/supabase/client.ts:6`, `lib/supabase/server.ts:9`, `lib/supabase/middleware.ts:9` |
| `NEXT_SUPABASE_SECRET_KEY` | Service-role-equivalent for app server routes (RLS bypass) | Secret | `app/api/inbox/sync/route.ts:38`, `app/api/enrich/cancel/route.ts:13`, `app/api/enrich/persons/route.ts:17`, `app/api/enrich/organizations/route.ts:16` |
| `SUPABASE_URL` | Supabase URL for the bot + verification scripts | Public | `bot/src/supabase.ts:13`, `scripts/verify-event-affiliations.ts:14` |
| `SUPABASE_SERVICE_ROLE_KEY` | True service-role key for the bot + verify script | Secret | `bot/src/supabase.ts:14`, `scripts/verify-event-affiliations.ts:15` |
| `APOLLO_API_KEY` | Apollo enrichment + people-finder | Secret | `lib/enrichment/apollo.ts:137`, `lib/enrichment/apollo-people.ts:335`, `app/api/enrich/route.ts:82` |
| `PERPLEXITY_API_KEY` | Perplexity research stage | Secret | `lib/enrichment/perplexity.ts:162` |
| `GEMINI_API_KEY` | Gemini synthesis stage | Secret | `lib/enrichment/gemini.ts:177` |
| `SENDGRID_API_KEY` | Outbound email | Secret | `lib/sendgrid.ts:16` |
| `FASTMAIL_API_KEY` | JMAP for inbox sync | Secret | `app/api/inbox/route.ts:29`, `app/api/inbox/sync/route.ts:13` |
| `TELEGRAM_BOT_TOKEN` | Telegram Bot API auth (used by both bot and app-side notifier) | Secret | `bot/src/index.ts:18`, `bot/src/notifications.ts:3`, `lib/telegram.ts:15` |
| `TELEGRAM_CHAT_ID` | Single chat the bot serves and posts into | Secret | `bot/src/notifications.ts:4`, `bot/src/menus/main.ts:10`, `lib/telegram.ts:16` |
| `APP_URL` | Public app base URL for "View job" links + bot → app callbacks | Public | `bot/src/notifications.ts:169`, `bot/src/menus/main.ts:98` |
| `ADMIN_PASSWORD` | Login password for `admin@gofpblock.com` used by seed/import scripts | Secret | `scripts/seed-and-import.ts:25,32,41`, `scripts/import-all.ts:46` |

**Total: 14 distinct env vars** referenced from TypeScript.

### Edge Function env vars (Deno, set via `supabase secrets set`)

These are **not** `process.env.*` — they live in Supabase project secrets:

- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — every function.
- `APOLLO_API_KEY` — `enrich-contact`.
- `BRAVE_SEARCH_API_KEY`, `PERPLEXITY_API_KEY`, `GEMINI_API_KEY` — `enrich-company`.
- `GEMINI_API_KEY` — `generate-messages`.
- `SENDGRID_API_KEY`, `HEYREACH_API_KEY` — `send-message`, `sync-status`.

### Notes

- `unipile-node-sdk` is in `package.json` deps but **no env var or import is referenced**. Either remove the dep or wire it up — verify with team.
- No `ANTHROPIC_API_KEY` is used by any TS file. Anthropic SDK appears only in archival Python (`extra/scraping/scripts/outreach.py`).

## Git workflow / commit conventions

Observed in `git log`:

- Subject prefix conventions: `feat:`, `fix:`, `docs:`, `wip:`. Prefix is lowercase, separated by a single colon-space.
- Subject is short (often <70 chars), imperative voice, lowercase first word: `feat: person↔event affiliations (via participating org)`.
- Multi-step features land as a single rolling commit on `main` rather than via merge commits — recent history is linear.
- Spec/plan docs are committed under `docs:` before the feature lands (e.g. `docs: person↔event affiliations spec`).
- Branch defaults to `main`. No PR template observed in this repo, no `CONTRIBUTING.md`.
- Per project memory ("No intermediate commits"): commit once at the end of work, not per-step.

## Migration workflow

`supabase/migrations/` numbered sequentially (currently up to `025_person_event_affiliations.sql`). Conventions:

- **Don't edit applied migrations.** Add a new numbered file instead.
- Naming: `<NNN>_<short_snake_case_purpose>.sql` — three-digit prefix, then a description tight enough to grep.
- Realtime publication adds happen in dedicated migrations (e.g. `021_enable_realtime.sql`).
- Schema changes are paired with TypeScript type updates in `lib/types/`.
- Local: `supabase db reset` (drops + replays everything + `seed.sql`). Remote: `supabase db push` after `supabase link`.
- Edge functions are versioned alongside migrations — keep them in sync when changing column shape.

For richer architecture context, see `docs/architecture.md`, `docs/database.md`, `docs/edge-functions.md`, and `PERFORMANCE.md`.
