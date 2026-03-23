# Telegram Bot — Real-Time CRM Notifications & Control

## Overview

A long-running Node.js process deployed on Railway that provides real-time Telegram notifications for CRM events and an inline-keyboard menu for querying and triggering actions from mobile — replacing the cron-based notification approach.

**Repository:** Same repo (`bot/` directory), deployed as a separate Railway service.
**Runtime:** Node.js 20, TypeScript, `grammy` bot framework, `@supabase/supabase-js` for Realtime + queries.
**Target:** Private Telegram supergroup "FP Block Sales" (chat ID configured via env var).
**Auth model:** Group-only — bot only responds in the configured chat. Group membership is the access control.

---

## Architecture

```
Railway (bot/)
    ├── Supabase Realtime Subscriptions
    │   ├── interactions (status changes)
    │   ├── inbound_emails (new replies)
    │   ├── job_log (enrichment/send job progress)
    │   └── persons, organizations (new records)
    │
    ├── Batch Tracker (in-memory)
    │   └── Groups rapid DB events → edits single TG message with progress
    │
    └── Telegram Bot (getUpdates long-polling)
        ├── Main menu (inline keyboard buttons)
        ├── Submenu handlers (dashboard, inbox, enrich, activity, settings)
        └── Action handlers (trigger enrichment, sync inbox, mute)
```

The bot has two concurrent loops:
1. **Supabase Realtime** — listens for Postgres changes, routes to notification logic
2. **Grammy bot** — polls Telegram for button taps (`callback_query`), renders menus

---

## Notification Strategy

### Individual Events (immediate standalone message)

Sent as a new message, max 1 per second (rate-limited queue):

| Event | Source Table | Trigger | Format |
|-------|-------------|---------|--------|
| Inbound reply from pipeline contact | `inbound_emails` | INSERT where `person_id IS NOT NULL` | Name, org, subject, preview, link |
| Bounce detected | `interactions` | UPDATE where `status = 'bounced'` | Name, org, bounce reason |
| Interaction replied | `interactions` | UPDATE where `status = 'replied'` (no active batch job) | Name, org, channel |

### Batch Events (single self-updating message)

When a `job_log` row is inserted with `status = 'processing'`:

1. Bot sends one message: "Enriching 47 organizations..."
2. Polls `job_log.metadata` every 5 seconds for progress
3. **Edits** the same message with updated counts: "Enriching 47 organizations... 23/47 complete"
4. On `status = 'completed'` or `'failed'`, final edit with summary

**Batch detection:** `interactions` status changes are suppressed when there's an active `job_log` entry in `processing` state — they're part of a batch, not individual events.

**Tracking:** In-memory `Map<jobId, { telegramMessageId, lastEditTimestamp }>`. Entries are cleaned up on job completion.

### Rate Limiting

- Max 1 message/edit per 1 second to the group
- Simple FIFO queue that flushes at 1/sec
- If queue exceeds 50 items, collapse into a single summary message

---

## Telegram Menu System

All menus render as **inline keyboard buttons** on a single message that edits itself on navigation (keeping chat clean).

### Main Menu

Appears on `/start` or any "Back" tap:

```
📊 Dashboard  |  📬 Inbox  |  🔍 Enrich
⚙️ Settings   |  📋 Recent Activity
```

### Dashboard

Shows current CRM stats, queried live from Supabase:

```
📊 Dashboard

Persons: 237  |  Organizations: 89
Interactions: 1,204  |  Replied: 42

Pipeline:
  Draft: 12 | Scheduled: 8 | Sent: 45
  Opened: 23 | Replied: 42 | Bounced: 3

Active Jobs: 1 (enriching 23 orgs...)

[🔄 Refresh]  [← Back]
```

### Inbox

Shows recent correlated replies:

```
📬 Inbox (3 unread)

1. Alice Smith (Acme Corp) — "Re: EthCC intro" — 5m ago
2. Bob Jones (Protocol X) — "Re: Partnership" — 2h ago
3. Carol Lee (DeFi Labs) — "Sounds good!" — 4h ago

[🔄 Sync Now]  [← Back]
```

"Sync Now" triggers a POST to `/api/inbox/sync` for both accounts.

### Enrich

Target selection → action trigger:

```
🔍 Enrichment

[▶️ Run Full Pipeline]  [📊 Active Jobs]
[← Back]
```

"Run Full Pipeline" shows target picker:

```
Select target:

[Unenriched Orgs]  [ICP Below 50]
[← Back]
```

Selecting a target invokes `supabase.functions.invoke('enrich-company', ...)` and starts batch tracking.

### Recent Activity

Last 10 `job_log` entries:

```
📋 Recent Activity

✅ Org Enrichment — 47 orgs, 44 enriched — 12m ago
✅ Person Enrichment — 23 persons, 19 emails — 1h ago
❌ Send Message — 3 failed — 2h ago
✅ Inbox Sync — 12 emails, 4 correlated — 3h ago

[🔄 Refresh]  [← Back]
```

### Settings

Mute control for notifications:

```
⚙️ Settings

Notifications: 🔊 Active

[🔇 Mute 1h]  [🔇 Mute 4h]
[🔊 Unmute]   [← Back]
```

Mute state is in-memory. During mute, notifications are silently dropped (batch tracking still runs but doesn't send edits).

---

## File Structure

```
bot/
├── src/
│   ├── index.ts          # Entry point — starts bot + Realtime listener
│   ├── realtime.ts       # Supabase Realtime subscriptions + event routing
│   ├── notifications.ts  # Message formatting, send/edit, rate limiter queue
│   ├── batch-tracker.ts  # In-memory job tracking, progress polling, message editing
│   ├── menus/
│   │   ├── main.ts       # Main menu keyboard + router
│   │   ├── dashboard.ts  # Dashboard stats query + render
│   │   ├── inbox.ts      # Recent replies + sync trigger
│   │   ├── enrich.ts     # Enrichment target picker + trigger
│   │   ├── activity.ts   # Recent job_log query + render
│   │   └── settings.ts   # Mute/unmute state
│   └── types.ts          # Minimal types (subset copied from app)
├── package.json          # grammy, @supabase/supabase-js, tsx
├── tsconfig.json
└── Dockerfile            # node:20-alpine
```

---

## Environment Variables (Railway)

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (bypasses RLS) |
| `TELEGRAM_BOT_TOKEN` | Bot API token from @BotFather |
| `TELEGRAM_CHAT_ID` | Private group chat ID |

---

## Technical Details

### Telegram Interaction

- **Long-polling** via `getUpdates` (not webhook) — no public URL needed, simpler for Railway
- All menu navigation uses `callback_query` with `editMessageText` — menus edit in-place, no message spam
- Callback data format: `menu:<section>` (e.g., `menu:dashboard`, `menu:enrich:targets`)

### Supabase Realtime Subscriptions

```
channel: "crm-notifications"
  - postgres_changes: INSERT on inbound_emails
  - postgres_changes: INSERT/UPDATE on interactions (filter: status in replied, bounced)
  - postgres_changes: INSERT/UPDATE on job_log
  - postgres_changes: INSERT on persons
  - postgres_changes: INSERT on organizations
```

### Batch Tracker

- `Map<string, { messageId: number, lastEdit: number }>` keyed by `job_log.id`
- On `job_log` INSERT with `status = 'processing'`: send initial message, store mapping
- Poll loop (every 5s): for each active job, query `job_log` metadata, edit TG message if changed
- On `status = 'completed'` or `'failed'`: final edit, remove from map
- Stale job cleanup: if a job hasn't updated in 10 minutes, mark as stale and stop tracking

### Reconnection & Health

- Supabase Realtime client auto-reconnects on disconnect
- Grammy `getUpdates` auto-retries on network errors
- Railway restarts the process on crash (default behavior)
- Optional: log heartbeat every 60s for Railway health monitoring

### Dockerfile

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
RUN npx tsc
CMD ["node", "dist/index.js"]
```

---

## What This Replaces

The bot does NOT replace cron jobs — cron jobs handle sending and syncing (they do work). The bot replaces the **notification delivery** that currently runs through Next.js API routes:

| Current | After |
|---------|-------|
| `lib/telegram.ts` called from inbox correlator in API route | Bot listens to Realtime, sends notifications directly |
| No enrichment progress visibility | Self-updating batch messages |
| No mobile control | Inline keyboard menus for status + actions |
| Notifications only fire when cron triggers sync | Real-time on every DB change |

The existing `lib/telegram.ts` in the Next.js app can remain as a fallback, or be removed once the bot is stable.

---

## Not In Scope

- Webhook mode (adds complexity, long-polling is sufficient)
- Per-user auth within the group (group membership = auth)
- Persistent mute state (in-memory is fine, resets on deploy)
- Custom notification filters per user
- Message threading (all notifications go to the main group chat)
