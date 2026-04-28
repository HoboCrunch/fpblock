# Telegram Bot

A standalone Node.js process that pairs with the Cannes Next.js app. It pushes notifications about pipeline activity (replies, bounces, enrichment progress) to a single Telegram chat and serves an inline-keyboard menu for read-only inspection plus a few one-tap actions.

The bot lives in `bot/` as a separate package — it is **not** deployed with the Next.js app on Vercel. See `bot/Dockerfile`.

## Purpose

1. **Push notifications** — surfaces real-time CRM events to a chat the team watches.
2. **Slash command + inline menu** — `/start` opens a five-button menu (Dashboard, Inbox, Enrich, Settings, Recent Activity).
3. **Action triggers** — the menu can kick off enrichment runs and inbox sync, mute notifications, etc.

## Architecture

- **Long-running process.** Polls Telegram via Grammy long-polling; subscribes to Supabase Realtime for DB events. Entry point: `bot/src/index.ts`.
- **Two listeners running together** (started from `main()` in `bot/src/index.ts:17`):
  - Grammy bot — handles slash commands and callback queries (`bot/src/menus/main.ts:26`).
  - Supabase Realtime channel `crm-notifications` — listens for inserts/updates on `inbound_emails`, `interactions`, `job_log` (`bot/src/realtime.ts:34`).
- **Single Supabase client** using the **service-role key** to bypass RLS — `bot/src/supabase.ts:10`.
- **Resilience**:
  - `process.on("uncaughtException")` and `unhandledRejection` log but do not crash (`bot/src/index.ts:10`).
  - Realtime auto-reconnects with exponential backoff capped at 60s (`bot/src/realtime.ts:75`).
  - Grammy `bot.start()` retries up to 5× on `409 Conflict` (`bot/src/index.ts:56`).
  - 60-second heartbeat log line (`bot/src/index.ts:51`).
- **Authorization**: Every command/callback is gated on `String(ctx.chat.id) === TELEGRAM_CHAT_ID` (`bot/src/menus/main.ts:28, 36`). Strangers are silently ignored.

### Key files

| File | Purpose |
| --- | --- |
| `bot/src/index.ts` | Entrypoint — Grammy + Realtime startup, graceful shutdown |
| `bot/src/realtime.ts` | Supabase Realtime channel + event routing + 5s polling for batch progress |
| `bot/src/notifications.ts` | Telegram API wrappers (`sendMessage`, `editMessage`), `RateLimiter`, all message formatters |
| `bot/src/batch-tracker.ts` | In-memory `Map<jobId, TrackedJob>` for batch progress edits + 10-min stale cleanup |
| `bot/src/supabase.ts` | Single service-role Supabase client (Realtime uses `ws` transport) |
| `bot/src/types.ts` | Subset of CRM types (Person, Organization, Interaction, InboundEmail, JobLog) |
| `bot/src/menus/main.ts` | `/start` handler + callback router for menu navigation |
| `bot/src/menus/dashboard.ts` | Counts persons/orgs/interactions/pipeline + active jobs |
| `bot/src/menus/inbox.ts` | Recent 5 inbound emails from pipeline contacts; `inbox:sync` calls `${APP_URL}/api/inbox/sync` |
| `bot/src/menus/enrich.ts` | Targeted enrichment trigger via `sb.functions.invoke("enrich-company", ...)` |
| `bot/src/menus/activity.ts` | Last 10 `job_log` rows |
| `bot/src/menus/settings.ts` | `MuteState` singleton, mute 1h / 4h / unmute |

## Command reference

All triggers require chat ID match (single-chat bot).

### Slash commands

| Trigger | Handler | Effect |
| --- | --- | --- |
| `/start` | `bot/src/menus/main.ts:27` | Sends the main menu (5-button inline keyboard) |

### Callback queries (inline buttons)

Routed by `routeCallback()` at `bot/src/menus/main.ts:54`:

| `callback_query.data` | Action |
| --- | --- |
| `menu:main` | Render main menu |
| `menu:dashboard` | Render dashboard counts |
| `menu:inbox` | Render last 5 inbound emails |
| `menu:enrich` | Render enrichment menu |
| `enrich:targets` | Pick target — Unenriched Orgs / ICP Below 50 |
| `enrich:run:<target>` | Invoke Supabase edge function `enrich-company` (`bot/src/menus/enrich.ts:30`) |
| `menu:activity` | Render last 10 `job_log` rows |
| `menu:settings` | Render mute state |
| `settings:mute:<minutes>` | Mute notifications for N minutes (suppresses Realtime push) |
| `settings:unmute` | Clear mute |
| `inbox:sync` | `POST ${APP_URL}/api/inbox/sync` (best-effort, no error surface) |

### Realtime-driven notifications (no user trigger)

Pushed automatically by `bot/src/realtime.ts`:

| DB event | Handler | Notification |
| --- | --- | --- |
| `INSERT inbound_emails` | `handleInboundEmail` (`realtime.ts:133`) | "Reply from {name} ({org}) ICP:.. Subject:.." — only if `person_id` set and not muted |
| `UPDATE interactions` (status `bounced`/`replied`) | `handleInteractionUpdate` (`realtime.ts:164`) | Suppressed during active batch jobs to avoid noise |
| `INSERT job_log` (batch types only) | `handleJobLogInsert` (`realtime.ts:206`) | Posts initial enrichment status message and starts tracking |
| `UPDATE job_log` | `handleJobLogUpdate` (`realtime.ts:230`) | On `completed`/`failed`, edits the tracked message into a result summary |

Batch types tracked: `enrichment_batch_organizations`, `enrichment_batch_persons`, `enrichment` (`realtime.ts:22`).

## Notification format

The pattern from project memory ("one message per batch with progressive edits + progress bar") is implemented and verified:

1. **Insert** — when a parent batch `job_log` row is inserted with `status = "processing"`, `handleJobLogInsert` posts a single message via `sendMessage` and stores `{jobId → messageId}` in `BatchTracker` (`bot/src/realtime.ts:217-227`).
2. **Edits while running** — every 5s a poll loop (`pollBatchProgress` at `realtime.ts:247`) queries child enrichment jobs (`enrichment_full`, `enrichment_apollo`, `enrichment_perplexity`, `enrichment_gemini`, `enrichment_people_finder`) created since the parent, deduplicates by `target_id`, computes per-stage completion + ICP/signals/people counters, and `editMessageText`s the tracked message with a fresh progress bar. Throttled to one edit every 4s and only when progress actually changes (`bot/src/batch-tracker.ts:65`).
3. **Final edit** — on `UPDATE job_log` with terminal status, the message is rewritten one last time with the full result block (`formatEnrichmentComplete` in `notifications.ts:257`) and the tracker entry is deleted.
4. **Stale cleanup** — jobs with no edits for 10 minutes get a "Job tracking timed out" final edit and are removed (`realtime.ts:248-256`).

The progress bar is a 10-cell `█/░` block (`notifications.ts:230`). One-shot notifications (replies, bounces) go through a `RateLimiter` queue with 1s tick that collapses into a summary line if the queue exceeds 50 (`notifications.ts:60-98`).

Sample progress message body (`notifications.ts:220-254`):

```
⏳ Org Enrichment  View job

42 companies · ICP ≥ 75
✅ Firmographics  ✅ Research  ☐ ICP Score  ☐ People Finder

████████░░ 80%  (34/42)
30 enriched · 4 failed
12 ICP scored · 8 signals · 67 people found
```

Links use `APP_URL` (default `https://gofpblock.com`) — `bot/src/notifications.ts:169`.

## Local dev

```bash
cd bot
npm install
# .env loaded from process env; export the variables below before running
TELEGRAM_BOT_TOKEN=xxx \
  TELEGRAM_CHAT_ID=xxx \
  SUPABASE_URL=https://<project>.supabase.co \
  SUPABASE_SERVICE_ROLE_KEY=xxx \
  APP_URL=http://localhost:3000 \
  npm run dev
```

`npm run dev` is `tsx watch src/index.ts` (auto-reload). `npm run build && npm start` for the compiled `dist/index.js`.

Tests: `npm test` (Vitest 3.x) — covers `BatchTracker`, formatters, mute state. See `bot/tests/`.

### Required env vars

| Var | Source | Used at |
| --- | --- | --- |
| `TELEGRAM_BOT_TOKEN` | BotFather | `bot/src/index.ts:18`, `bot/src/notifications.ts:3` |
| `TELEGRAM_CHAT_ID` | The chat ID the bot posts to / accepts commands from | `bot/src/notifications.ts:4`, `bot/src/menus/main.ts:10` |
| `SUPABASE_URL` | Supabase project URL | `bot/src/supabase.ts:13` |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (RLS bypass) | `bot/src/supabase.ts:14` |
| `APP_URL` | Base URL for "View job" links + `inbox:sync` callback | `bot/src/notifications.ts:169`, `bot/src/menus/main.ts:98` |

## Deployment

A `bot/Dockerfile` exists (`node:20-alpine`, `npm ci`, `tsc`, `node dist/index.js`) — the bot is containerized.

The actual hosting target (Fly.io? Railway? a VPS? a container in the user's infra?) is **not declared in this repo** — there is no Fly config, no Railway YAML, no Procfile. **Verify with team** where the container is running and how it gets restarted.

What we know:
- It is decidedly **not on Vercel** — Vercel only deploys the Next.js root app, and the bot is excluded from `tsconfig.json` (`exclude: ["…", "bot"]`).
- It is **not a Supabase Edge Function** — those live in `supabase/functions/` and use Deno.
- It must run continuously to keep the Realtime channel and Grammy long-poll open.
