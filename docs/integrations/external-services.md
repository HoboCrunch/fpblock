# External Services

Reference for every third-party service the Cannes app and bot talk to. All file references are absolute paths within the repo with `file:line` pointers.

---

## Supabase

**Purpose** — primary datastore (Postgres), auth, Realtime channel for the Telegram bot, Edge Functions for legacy enrichment/messaging pipelines.

**Auth** — three keying patterns:
- **Anon key** (browser/SSR client): `NEXT_PUBLIC_SUPABASE_ANON_KEY` — public-safe, RLS enforced.
- **"Secret key" / service role** for server routes: `NEXT_SUPABASE_SECRET_KEY` (the app uses this name; same shape as a service role key).
- **Service role** for the bot and a couple of scripts: `SUPABASE_SERVICE_ROLE_KEY` — full RLS bypass.

**Clients**
- Browser: `lib/supabase/client.ts:5` (`createBrowserClient`, anon).
- SSR/route handlers: `lib/supabase/server.ts:8` (cookie-aware, anon — auth flows on user's session).
- Middleware (auth gate for `/admin`): `lib/supabase/middleware.ts:8`. The matcher itself is in `middleware.ts:18`.
- Service-role server clients: directly via `createClient` in API routes — e.g. `app/api/inbox/sync/route.ts:37-38`, `app/api/enrich/cancel/route.ts:11-13`, `app/api/enrich/persons/route.ts:15-17`, `app/api/enrich/organizations/route.ts:14-16`.
- Bot: `bot/src/supabase.ts:10` (service role + `ws` Realtime transport).

**Realtime** — channel `crm-notifications` subscribes to `inbound_emails`, `interactions`, `job_log` (`bot/src/realtime.ts:34-72`). Tables enabled for replication in migration `supabase/migrations/021_enable_realtime.sql`.

**Edge Functions** (`supabase/functions/`, Deno runtime):
- `enrich-company`, `enrich-contact` — legacy single-org and single-contact enrichment paths.
- `generate-messages` — Gemini-driven outreach generation.
- `send-message`, `sync-status` — SendGrid + HeyReach send/status reconciliation.
- `process-automations` — automation rules.
- Each function reads its keys from `Deno.env.get(...)` (e.g. `supabase/functions/send-message/index.ts:4-7`).

**Migrations** — `supabase/migrations/` is the source of truth. Latest applied: `025_person_event_affiliations.sql`. Local dev port mapping in `supabase/config.toml`.

---

## Apollo.io

**Purpose** — firmographic enrichment for organizations (Apollo Org Enrich) and people-finder for sponsor/event orgs.

**Auth** — `X-Api-Key` HTTP header (per project memory, **not** a body param).

**Env var** — `APOLLO_API_KEY`.

**Clients**
- Org enrichment: `lib/enrichment/apollo.ts:137` calls `https://api.apollo.io/v1/organizations/enrich` (`apollo.ts:25`). Tries domain-based first, falls back to name-based.
- People search: `lib/enrichment/apollo-people.ts:335`. Uses `q_organization_domains_list` then `q_keywords` fallback. Endpoint constants near the top of the file.
- Person match (used by direct person enrichment): same module, calls `/v1/people/match` per memory.
- Server route entry point: `app/api/enrich/route.ts:82` (key check before any work).

**Quotas / cache** — from project memory, prior runs cached results in `extra/scraping/data/apollo_cache.json` to avoid re-querying. The web app uses `lib/enrichment/fetch-with-retry.ts` for timeouts + backoff; concurrency is 3.

---

## Perplexity

**Purpose** — narrative research (description, products, strengths/weaknesses, recent news) for organizations during enrichment.

**Auth** — `Authorization: Bearer <key>` header.

**Env var** — `PERPLEXITY_API_KEY`.

**Client** — `lib/enrichment/perplexity.ts:162`. Endpoint: `https://api.perplexity.ai/chat/completions` (`perplexity.ts:14`). Model: `sonar`. Returns structured sections parsed by header.

Also referenced by Edge Function `supabase/functions/enrich-company/index.ts:5`.

---

## Google Gemini

**Purpose** — synthesis stage of enrichment: combines Apollo + Perplexity into description, USP, ICP score, ICP reason, category, signals.

**Auth** — `?key=<key>` query param.

**Env var** — `GEMINI_API_KEY`.

**Client** — `lib/enrichment/gemini.ts:177`. Calls Gemini's generative endpoint with `responseMimeType: "application/json"` so the result is parsed directly. ICP criteria live in the prompt verbatim (`gemini.ts:23-…`) so every call scores consistently.

Also referenced by Edge Functions `supabase/functions/enrich-company/index.ts:6` and `supabase/functions/generate-messages/index.ts:4`.

---

## SendGrid

**Purpose** — outbound transactional email for the consensus campaign and the scheduled-send cron.

**Auth** — `Authorization: Bearer <key>` header.

**Env var** — `SENDGRID_API_KEY`.

**Client** — `lib/sendgrid.ts:15` (`sendEmail`). Endpoint: `https://api.sendgrid.com/v3/mail/send` (`sendgrid.ts:33`). Returns `{ success, messageId, error }`. Treats 200 and 202 as success; surfaces the `X-Message-Id` response header.

**Callers**
- Standalone cron: `scripts/send-outreach.ts:103` (the consensus day-by-day campaign).
- Sequences cron: `app/api/sequences/send/route.ts` — fired by Vercel cron `*/5 * * * *` (`vercel.json:3`).
- Edge function: `supabase/functions/send-message/index.ts:4`.

**Webhook entry point** — `app/api/webhooks/sendgrid/route.ts`. Maps SendGrid event types `delivered`, `open`, `click`, `bounce`, `dropped`, `spam_report` into `interactions.status` updates. **Verification is timestamp-only at the moment** — there is an explicit warning at the top of the file: "Add `@sendgrid/eventwebhook` for ECDSA before production." Same TODO mirrored in `lib/sendgrid.ts:64`. The 5-minute drift gate is in `lib/sendgrid.ts:75`.

---

## Anthropic Claude

**Purpose** — message generation for outreach. **Not used by the live Next.js app or the bot today.**

References found only in `extra/scraping/scripts/outreach.py:20` (Python, archival). The current consensus pipeline generates messages via parallel Claude Code agents writing JSON files into `consensus/outreach_agent_outputs/` and `consensus/employee_agent_outputs/` — the agent runtime is the developer's harness, not an SDK call from production code. **No `ANTHROPIC_API_KEY` is referenced by any TS/TSX file in this repo.**

If the team wants in-app Claude calls, that integration does not yet exist.

---

## Fastmail (JMAP)

**Purpose** — pulls inbound emails so the bot/admin can show replies. Pairs with `inbox-correlator.ts` to match replies back to a `person`/`interaction`.

**Auth** — `Authorization: Bearer <token>` to JMAP session URL `https://api.fastmail.com/jmap/session` (`lib/fastmail.ts:5, 42`).

**Env var** — `FASTMAIL_API_KEY`.

**Client** — `lib/fastmail.ts` — `fetchEmails()` does session discovery → mailbox/query for INBOX → email/query + email/get with optional `sinceEmailId` anchor.

**Entry points**
- `app/api/inbox/route.ts:29` — list endpoint.
- `app/api/inbox/sync/route.ts:13` — POST sync endpoint (called by the bot's `inbox:sync` button via `${APP_URL}/api/inbox/sync`).
- `supabase/migrations/016_inbox_sync_cron.sql` — scheduled inbox sync, **verify cadence with team**.

---

## Telegram

**Purpose** — push notifications + interactive admin menu (separate doc: `docs/integrations/bot.md`).

**Auth** — bot token in URL: `https://api.telegram.org/bot<TOKEN>/...`.

**Env vars** — `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`.

**Clients**
- Bot process: Grammy SDK in `bot/src/index.ts:24` (long-polling) + raw `fetch` in `bot/src/notifications.ts:11, 35` for `sendMessage` / `editMessageText`.
- App-side (used by edge functions / server jobs): `lib/telegram.ts:13`.

---

## Unipile

`unipile-node-sdk` is in `package.json` dependencies (line 30) but **no source file imports it** — `grep` for `unipile-node-sdk` / `UnipileClient` returns zero hits in `app/`, `lib/`, `bot/`, `scripts/`. Either the integration was removed without dropping the dep, or it is planned for a future LinkedIn channel. **Verify with team** before treating Unipile as live.

---

## HeyReach

Used only by Supabase Edge Functions: `supabase/functions/send-message/index.ts:5` and `supabase/functions/sync-status/index.ts:5`. Env var `HEYREACH_API_KEY` is read via `Deno.env.get`. No Next.js code references it.

---

## Brave Search

Referenced only by Edge Function `supabase/functions/enrich-company/index.ts:4` — env var `BRAVE_SEARCH_API_KEY`. Not used by the in-app TS pipeline (which has been ported to Apollo + Perplexity + Gemini).
