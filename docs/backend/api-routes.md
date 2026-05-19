# Backend API Routes

Canonical reference for every Next.js App Router handler under `app/api/**/route.ts`.
Companion to:

- `docs/database.md` — table schemas, RLS, RPCs (e.g. `merge_persons`)
- `docs/edge-functions.md` — Supabase Edge (Deno) functions (`generate-messages`, `send-message`, `enrich-contact`, `enrich-company`)
- `docs/admin-panel.md` — admin UI consumers of these routes

This document covers only Next.js route handlers. When a route is a thin wrapper around an edge function, this doc describes the wrapper; the edge function semantics live in `edge-functions.md`.

---

## 1. Overview

### 1.1 Runtime & framework

- Next.js 16 App Router. Route handlers live at `app/api/<segments>/route.ts`.
- All handlers run on the Node.js runtime (default). None opt into `edge`.
- Several long-running handlers extend the serverless timeout via `export const maxDuration`:
  - `app/api/enrich/organizations/route.ts:5` — 300s
  - `app/api/enrich/persons/route.ts:6` — 300s
  - `app/api/inbox/recorrelate/route.ts` — 300s
  - `app/api/enrich/route.ts:4` — 60s (legacy contacts table)
  - `app/api/sequences/generate/route.ts:19` — 60s
  - `app/api/sequences/send/route.ts:5` — 60s
  - `app/api/sequences/[id]/preview/route.ts:10` — 60s
- Routes without a `maxDuration` use the platform default (10s on Vercel hobby, 15s pro). Notably absent from `webhooks/sendgrid`, `inbox/*`, `messages/*`, `correlations/merge`, `enrich/cancel`, and the per-message sequence routes — verify this is intentional given their I/O.

### 1.2 Authentication model

There is no per-route auth check inside handlers. Auth is enforced at two layers:

1. **`middleware.ts`** (root) gates the admin UI:
   ```
   if (!hasAuthCookie && pathname.startsWith("/admin")) redirect("/login")
   ```
   Matcher is `["/admin/:path*"]`. **`/api/*` is not matched** — the middleware does not protect API routes.
2. **Supabase RLS** is the actual access boundary for routes that use the cookie-bound SSR client. A request without an `sb-*-auth-token` cookie hits Supabase as anon and gets blocked by RLS policies on tables like `persons`, `interactions`, etc.

Handlers split into two client patterns:

- **Cookie-bound SSR client** (`createClient` from `lib/supabase/server.ts`) — inherits the user's session from cookies. Used by all "user action" routes (messages, sequences, correlations, inbox link-to-person, sendgrid webhook, legacy enrich).
- **Service-role client** (`createClient` from `@supabase/supabase-js` using `NEXT_SUPABASE_SECRET_KEY`) — bypasses RLS. Used by background/batch routes (`enrich/organizations`, `enrich/persons`, `enrich/cancel`, `inbox/sync`, `cron/inbox-sync`).

**This is a security gap worth flagging:** any unauthenticated client on the public internet can `POST /api/enrich/organizations`, `/api/enrich/persons`, `/api/enrich/cancel`, or `/api/inbox/sync` and trigger paid Apollo/Perplexity/Gemini calls or run pipeline jobs. There is no shared secret, JWT check, or IP allowlist on these routes. See §4.

**Auth-gated cron pattern:** `/api/cron/inbox-sync` checks `Authorization: Bearer $CRON_SECRET` before running. Vercel injects this header automatically when a path is declared in `vercel.json:crons`. New cron routes should follow this pattern; the existing `/api/sequences/send` cron is **not** gated and is the same kind of gap as the routes above.

The SendGrid webhook (`app/api/webhooks/sendgrid/route.ts`) verifies ECDSA signatures via `@sendgrid/eventwebhook` and rejects unsigned/forged payloads with 401 — see §2.6.1.

### 1.3 Conventions

- Bodies are JSON. Most handlers `await request.json()` directly without a schema validator (no zod, no yup). A few wrap the parse in `try/catch` and return `{ error: "Invalid JSON body" }, 400`; many do not.
- Successful responses are `NextResponse.json(payload)` with no explicit status (200).
- Error responses are `NextResponse.json({ error: string }, { status })`. Status codes used: 400 (bad input), 404 (not found), 500 (db / external error). 401/403 are never returned (auth is implicit via RLS).
- No standard envelope. Some routes return `{ success: true, ... }`, others return the payload directly, others return `{ jobId, status, ...counts }`. See §3.2.
- Job tracking goes through the `job_log` table (see `docs/database.md`). Long-running batch routes insert a parent `job_log` row with `status: "processing"`, run, then update to `completed` / `failed` / `cancelled`.

### 1.4 Shared helpers

- `lib/supabase/server.ts` — cookie-bound server client (anon key, RLS enforced).
- `lib/supabase/client.ts` — browser client.
- `lib/sendgrid.ts` — `sendEmail()` and `verifyWebhookSignature()` (ECDSA via `@sendgrid/eventwebhook` + ±300s freshness; requires `SENDGRID_WEBHOOK_PUBLIC_KEY` env).
- `lib/fastmail.ts` — `fetchEmails(apiKey, managedIdentities[], sinceId?, limit?)` for inbox polling, `fetchSentEmails(...)` for Sent-mailbox ingest, `submitEmail(...)` for JMAP-based reply send, `getMessageIdHeader(apiKey, jmapId)` for resolving rfc822 headers.
- `lib/inbox-sync.ts` — `runInboxSync(supabase, identities?)` is the entry point all sync routes share; `getInboxIdentities()` maps env vars to identities.
- `lib/inbox-correlator.ts` — `correlateAndNotify(supabase, email, { notify? })` does email→person matching (exact email then domain) and dispatches Telegram notifications. Honors `INBOX_TELEGRAM_DISABLED=1` as a global kill switch.
- `lib/telegram.ts` — Telegram bot notifications.
- `lib/template-renderer.ts` — `buildContext`, `extractAiBlocks`, `renderTemplate` for sequence templates with embedded `{{ai:...}}` blocks.
- `lib/enrichment/pipeline.ts` — `runBatchEnrichment` (org enrichment via Apollo + Perplexity + Gemini, plus People Finder).
- `lib/enrichment/person-pipeline.ts` — `runBatchPersonEnrichment` (Apollo people-match + reverse org link).
- `lib/queries/event-persons.ts` — `getPersonIdsForEvent(supabase, eventId, relation)`. Routes should use this rather than ad-hoc joins (see project memory: `project_person_event_affiliations.md`).

---

## 2. Route catalog

Counts: 18 route files, 19 handlers (one file exposes both `GET` and `POST`).

### 2.1 Enrichment

#### 2.1.1 `POST /api/enrich/organizations`

**File:** `app/api/enrich/organizations/route.ts:13`
**Purpose:** Trigger the org enrichment pipeline (Apollo firmographics → Perplexity research → Gemini ICP scoring → optional People Finder) for a set of organizations resolved from filters.
**Auth:** Service role (bypasses RLS). **Publicly callable — no auth check.**
**Timeout:** `maxDuration = 300`.

**Body:**
```ts
{
  organizationIds?: string[];           // explicit IDs; takes precedence
  stages?: Array<"apollo"|"perplexity"|"gemini"|"full"|"people_finder">; // default ["full"]
  eventId?: string;                     // resolves orgs via event_participations
  icpBelow?: number;                    // orgs where icp_score IS NULL OR icp_score < N
  failedIncomplete?: boolean;           // enrichment_status in (failed, partial)
  peopleFinderConfig?: {                // only used when stage includes people_finder
    perCompany?: number;                // default 5
    seniorities?: string[];             // default ["owner","founder","c_suite","vp","director"]
    departments?: string[];
  } | null;
}
```

Filter precedence (first match wins): `organizationIds` → `eventId` → `failedIncomplete` → `icpBelow` → default (orgs with `icp_score IS NULL`, capped at 200).

**Response:**
```ts
{
  jobId: string;
  status: "completed";
  orgs_processed: number;
  orgs_enriched: number;
  orgs_failed: number;
  signals_created: number;
  people_found: number;
  people_created: number;
  people_merged: number;
  results: Array<{
    orgId, orgName, success, error,
    icp_score, signalsCreated, peopleFinder
  }>;
}
```
On thrown error: `{ error, jobId }, 500` and `job_log.status = "failed"`.

**Side effects:**
- Inserts a `job_log` row (`job_type: "enrichment_batch_organizations"`).
- Calls `runBatchEnrichment` (concurrency 3) which writes to `organizations`, `organization_signals`, `persons`, `person_organization`, child `job_log` rows.
- External API calls: Apollo, Perplexity, Gemini, Brave Search (all via `lib/enrichment/*`).

**Notes:**
- The default branch caps at 200 orgs per call. There's no pagination param.
- Cancellation is cooperative: see `/api/enrich/cancel` (§2.1.4). The pipeline checks `job_log.status` between iterations.
- `peopleFinderConfig` defaults are applied at `app/api/enrich/organizations/route.ts:171` only when `peopleFinderConfig` is non-null. Pass `null` (or omit) to skip People Finder defaults.

#### 2.1.2 `POST /api/enrich/persons`

**File:** `app/api/enrich/persons/route.ts:14`
**Purpose:** Run the person enrichment pipeline (Apollo people-match + COALESCE field updates + reverse org linkage).
**Auth:** Service role. Publicly callable.
**Timeout:** `maxDuration = 300`.

**Body:**
```ts
{
  personIds?: string[];
  eventId?: string;
  relation?: "direct" | "org_affiliated" | "either" | "both"; // default "either"
  organizationId?: string;
  failedOnly?: boolean;
  sourceFilter?: string;     // e.g. "org_enrichment"
}
```

Filter precedence: `personIds` → `eventId` (uses `getPersonIdsForEvent`) → `organizationId` (via `person_organization`) → `failedOnly` → `sourceFilter` → default (`enrichment_status = none OR apollo_id IS NULL`, cap 200).

**Response:**
```ts
{
  jobId, status: "completed",
  persons_processed, persons_enriched, persons_failed, orgs_created,
  results: Array<{ personId, personName, success, error, fieldsUpdated, orgLinked, orgCreated }>
}
```

**Side effects:**
- `job_log` row (`job_type: "enrichment_batch_persons"`).
- `runBatchPersonEnrichment` (`lib/enrichment/person-pipeline.ts`) writes to `persons` (COALESCE only — never overwrites), and creates `person_organization` rows with `source: "direct_enrichment"`. May create stub `organizations` rows.
- External: Apollo `/v1/people/match`.

**Notes:**
- `relation` accepts `"both"` and `"either"`. They behave the same in `getPersonIdsForEvent` (verify in `lib/queries/event-persons.ts`).
- Persons with neither linkedin_url, apollo_id, nor org context are marked failed by the pipeline.

#### 2.1.3 `POST /api/enrich` (legacy contacts table)

**File:** `app/api/enrich/route.ts:12`
**Purpose:** Apollo enrichment for the legacy `contacts` table. **Per the comment at `app/api/enrich/route.ts:6`, this does not touch `persons`.** Persons enrichment lives at `/api/enrich/persons` and inside the org pipeline.
**Auth:** Cookie-bound SSR client (RLS-enforced). User session required in practice.
**Timeout:** `maxDuration = 60`.

**Body:**
```ts
{
  contactIds?: string[];
  fields: string[];           // required; subset of ["email","linkedin","twitter","phone"]
  source?: string;            // default "apollo"
  eventId?: string;
}
```

Resolves contacts: `contactIds` → contacts in event via `contact_event` → contacts where `apollo_id IS NULL`. Cap 100.

**Response:** `{ jobId, status, contacts_processed, emails_found, linkedin_found, twitter_found }`.

**Side effects:**
- Direct Apollo `/v1/people/match` calls (header `X-Api-Key`, not body — see project memory).
- Updates `contacts` row in place, writing only fields that were null (never overwrites). 500ms sleep between calls.
- `job_log` row (`job_type: "enrichment"`, `target_table: "contacts"`).

**Caveats:**
- Operates on a legacy schema. New code should target `persons` via `/api/enrich/persons`.
- Errors per contact are swallowed (`continue`) and only logged via `console.error`. No per-contact failure record.
- Phone field is supported here but the org pipeline does not return phone (see `MEMORY.md` "Apollo Enrichment Results").

#### 2.1.4 `POST /api/enrich/cancel`

**File:** `app/api/enrich/cancel/route.ts:10`
**Purpose:** Set a running job's `job_log.status` to `"cancelled"`. The pipeline polls this between iterations and exits early.
**Auth:** Service role. Publicly callable.

**Body:** `{ jobId: string }`.
**Response:** `{ success: true }` or `{ error }, 400/500`.

**Caveats:**
- Cancellation is cooperative — already-issued external API calls (Apollo, Perplexity) complete before the loop checks status.
- No verification that the job is actually running, owned by the caller, or that the new status transition is valid (e.g. `completed → cancelled` is allowed).

---

### 2.2 Messages

These three routes manage `interactions` rows (the unified table for cold messages and replies — see `docs/database.md`).

#### 2.2.1 `POST /api/messages/generate`

**File:** `app/api/messages/generate/route.ts:11`
**Purpose:** Thin proxy to the `generate-messages` Supabase edge function. Maps channel codes (`email`/`linkedin`/`twitter`) to `interaction_type` (`cold_email`/`cold_linkedin`/`cold_twitter`).
**Auth:** Cookie-bound SSR client (the edge function is invoked via `supabase.functions.invoke` and inherits the user's JWT).

**Body:**
```ts
{
  person_ids: string[];     // required
  event_id?: string;
  channels?: string[];
  sequence_number?: number;
  prompt_template_id?: string;
  sender_id?: string;
  cta?: string;
}
```
**Response:** Whatever the edge function returns (verify in `supabase/functions/generate-messages/`).

**Notes:**
- Channel→interaction_type mapping is at `app/api/messages/generate/route.ts:5`. The edge function receives both `channels` and the mapped `interaction_types`.

#### 2.2.2 `POST /api/messages/send`

**File:** `app/api/messages/send/route.ts:4`
**Purpose:** Mark interactions as `sending`, then invoke the `send-message` edge function.
**Auth:** Cookie-bound SSR client.

**Body:** `{ interaction_id?: string; interaction_ids?: string[] }`.
**Response:** Whatever the edge function returns.

**Side effects:**
- `interactions.status = "sending"`, `occurred_at = now()` for the IDs.
- Invokes `send-message` edge function.

**Caveats:**
- If the edge invocation fails, the rows stay in `sending` indefinitely. There is no rollback.
- No idempotency key — calling twice for the same ID will issue two sends.

#### 2.2.3 `POST /api/messages/actions`

**File:** `app/api/messages/actions/route.ts:4`
**Purpose:** Bulk lifecycle actions on draft interactions.
**Auth:** Cookie-bound SSR client.

**Body:**
```ts
{
  action: "approve" | "schedule" | "delete" | "supersede";
  interaction_ids: string[];
  scheduled_at?: string;   // required when action=schedule
}
```

Mappings:
- `approve`: `status: "scheduled"` (only where currently `draft`).
- `schedule`: `status: "scheduled"`, set `scheduled_at`.
- `delete`: hard delete.
- `supersede`: writes `status: "failed"` because there is no `superseded` enum value (`app/api/messages/actions/route.ts:35`). **Mislabeled — see §4.**

**Response:** `{ success: true, action, count }`.

---

### 2.3 Sequences

#### 2.3.1 `POST /api/sequences/generate`

**File:** `app/api/sequences/generate/route.ts:137`
**Purpose:** The "modern" sequence step generator. Walks active enrollments in active sequences, checks delay/window, renders `ComposableTemplate` blocks (resolving `{{ai:...}}` blocks via the `generate-messages` edge function), creates an `interactions` row, advances the enrollment.
**Auth:** Cookie-bound SSR client.
**Timeout:** 60s.

**Body (optional):** `{ sequenceId?: string; step?: number }`. If body is missing or invalid JSON, runs across all active enrollments.

**Response:** `{ generated, failed, skipped, errors }`.

**Side effects (per due enrollment):**
- May insert a `failed` interaction row if any AI block call throws or returns no result (`route.ts:303-357`).
- Inserts an outbound interaction with `status: "scheduled"` (when `sequences.send_mode = "auto"`) or `"draft"`.
- Advances `sequence_enrollments.current_step`. Marks `completed` when past last step.
- Multiple AI block invocations per step (one edge function call per `{{ai:...}}` block, sequentially — not parallel). This adds up — verify timeouts on long sequences.

**Scheduling:**
- `nextSendWindowTime` walks 30-min candidates forward (≤7 days) using `Intl.DateTimeFormat` to derive the zoned hour and weekday — DST-correct.
- `isDue` supports `relative`, `window`, and `anchor` timing modes.

**Idempotency:** Checks for existing `interactions` row matching `(sequence_id, person_id, sequence_step)` before inserting (`route.ts:202-213`). Skips if found.

#### 2.3.2 `POST /api/sequences/send`

**File:** `app/api/sequences/send/route.ts`
**Purpose:** Email dispatcher. Sweeps stuck rows, atomically claims due `interactions`, sends via SendGrid, classifies failures, batches a Telegram notification.
**Auth:** Cookie-bound SSR client.
**Timeout:** 60s. Hard cap of 50 interactions per call (`CLAIM_LIMIT`).

**Body:** None.

**Response:** `{ sent, failed, skipped, deferred, swept }`.

**Send flow:**
1. **Sweep**: `rpc('reclaim_stuck_interactions', { p_stuck_minutes: 10 })` reverts any `sending` row older than 10 minutes back to `scheduled` with `retry_count++` and `detail.last_error='sweeper: stuck in sending state'`. Defined in migration `028_sequence_send_atomic_claim.sql`.
2. **Claim**: `rpc('claim_due_interactions', { p_limit: 50 })` runs a single `UPDATE ... FROM (SELECT ... FOR UPDATE SKIP LOCKED) RETURNING *` that atomically flips up to 50 due rows from `scheduled` to `sending`. Overlapping cron invocations claim disjoint sets.
3. **Hydrate**: SELECT joined `persons`, `sequences`, `sender_profiles` by the claimed ids.
4. Per-row:
   - Skip if `persons.email` is null → mark `failed` with `detail.error` (logged as terminal failure for the Telegram batch).
   - Skip if `sequences.sender_profiles` is null → mark `failed` (same).
   - **Pre-send parameter gates** (each gracefully skipped when the field is undefined):
     - `quiet_hours_local`: defer until next non-quiet hour (zoned via `Intl.DateTimeFormat`).
     - `throttle_per_day`: defer +60m if today's send count for this sequence ≥ cap.
     - `daily_send_cap_global`: defer +60m if today's send count across all sequences ≥ cap.
     - `min_interval_minutes`: defer if a send to this person occurred within the window.
     - Defer flips status back to `scheduled` and updates `scheduled_at` (the row is already `sending` from the claim).
   - Call `sendEmail` (`lib/sendgrid.ts`). `SendEmailResult` now surfaces `statusCode`.
   - On success: status `sent`, `occurred_at = now`, store `detail.sendgrid_message_id` (used by webhook).
   - On failure: classify by HTTP status:
     - **Permanent** (4xx except 408/429): immediate `failed`, `detail.terminal_reason='permanent_4xx'`.
     - **Transient** (5xx, 408, 429, network/timeout — no statusCode): reschedule with `[5, 30, 120]` minute backoff. After 3 attempts → `failed` with `detail.terminal_reason='retries_exhausted'`.
     - `detail.last_status_code` is recorded.
5. **Notify**: end-of-run, if any terminal failures, stuck-row sweeps, or config-gap skips happened, sends a single batched Telegram message via `lib/telegram.ts` (uses `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID`; no-ops if unset). Links to `/admin/sequences/failures`.

**Caveats:**
- Channel-agnostic field name `interactions.body` is sent as `html` to SendGrid. If LinkedIn/Twitter interactions ever land in this query, they would be emailed in HTML — but this query doesn't filter by channel, only by status. Verify upstream code only schedules emails.
- 50-row cap and 60s timeout means this needs to be invoked frequently (cron) for high volume.
- Stuck rows are auto-recovered every 5 minutes via the sweeper. Force-recover via `SELECT * FROM reclaim_stuck_interactions(0);`.

#### 2.3.3 `GET /api/sequences/[id]/messages`

**File:** `app/api/sequences/[id]/messages/route.ts:4`
**Purpose:** List interactions for a sequence with status/step/search filters. Used by the sequence detail page.
**Auth:** Cookie-bound SSR client.

**Query params:**
- `status` — comma-separated list (e.g. `draft,scheduled`).
- `step` — numeric, exact match on `sequence_step`.
- `search` — case-insensitive client-side filter on `person_name` and `subject` (applied after fetch).

**Response:** Array of `{ id, person_id, person_name, person_title, person_org, sequence_step, subject, body, status, scheduled_at, occurred_at, detail }`. `person_org` is hardcoded `null` (`route.ts:61`) — verify whether a join is intended.

#### 2.3.4 `PATCH /api/sequences/[id]/messages/[msgId]`

**File:** `app/api/sequences/[id]/messages/[msgId]/route.ts:4`
**Purpose:** Single-message lifecycle update.
**Auth:** Cookie-bound SSR client.

**Body:**
```ts
{
  action: "approve" | "approve_at" | "reschedule" | "cancel"
        | "reject" | "retry" | "resend" | "edit";
  scheduled_at?: string;   // approve_at, reschedule
  reason?: string;         // reject (stored in detail.reason)
  subject?: string;        // edit only
  body?: string;            // edit only
}
```

Action gates (server-side, by current status):

| current status | allowed actions                                      |
| -------------- | ---------------------------------------------------- |
| draft          | approve, approve_at, reschedule, reject, edit       |
| scheduled      | reschedule, cancel, reject, edit                    |
| failed / bounced | retry / resend (failed only), reschedule (failed) |
| sent / delivered / opened / clicked / replied | (read-only)         |

Mappings:
- `approve` → `status: "scheduled"`, `scheduled_at: now()`.
- `approve_at` / `reschedule` → `status: "scheduled"`, `scheduled_at: <provided>`.
- `cancel` → `status: "draft"`, `scheduled_at: null`.
- `reject` → `status: "failed"`, `detail.reason` set.
- `retry` / `resend` → `status: "scheduled"`, `scheduled_at: now()`, retry_count preserved.
- `edit` → patch `subject` / `body`. 400 if neither provided.

**Notes:** Verifies `msgId` belongs to `sequence_id = id` before updating.

#### 2.3.5 `POST /api/sequences/[id]/messages/bulk`

**File:** `app/api/sequences/[id]/messages/bulk/route.ts`
**Purpose:** Multi-message version of the per-message PATCH.
**Auth:** Cookie-bound SSR client.

**Body:** `{ ids: string[]; action: "approve" | "reject" | "reschedule" | "retry"; scheduled_at?: string; reason?: string }`.
**Response:** `{ succeeded: string[]; failed: Array<{ id: string; error: string }> }`.

**Caveats:**
- `reschedule` / `approve` with future time requires `scheduled_at`.
- `reject` may include `reason`.
- Per-row eligibility check applied (a `retry` only succeeds for failed rows; a `reject` only for drafts/scheduled). Rows that fail validation appear in `failed[]` with an `error` string.

#### 2.3.6 `POST /api/sequences/[id]/preview`

**File:** `app/api/sequences/[id]/preview/route.ts:12`
**Purpose:** Render a single step for a single person without persisting. Resolves AI blocks live.
**Auth:** Cookie-bound SSR client.
**Timeout:** 60s.

**Body:** `{ stepIndex: number; personId: string }`.
**Response:** `{ subject: string; body: string; hasSender: boolean }`.

**Side effects:**
- Calls `generate-messages` edge function once per AI block (subject blocks first, then body blocks — sequential, not parallel).
- AI block failures are silently swallowed (`route.ts:124, 141`) — the placeholder remains unrendered. Compare to `/generate` which writes a failed interaction.

---

### 2.4 Inbox

All inbox routes flow through the shared `runInboxSync()` helper in `lib/inbox-sync.ts`, which iterates every configured identity (read from env via `getInboxIdentities()`) and, for each, syncs Inbox + Sent in parallel using that identity's own JMAP token.

#### 2.4.1 `GET /api/inbox`

**File:** `app/api/inbox/route.ts`
**Purpose:** Two unrelated jobs in one handler:
1. **Person search** — when `?type=persons&search=…`, return up to 20 persons matching by name or email (used by the "Link to Person" modal).
2. **Inbox sync** — otherwise, runs `runInboxSync` over every configured Fastmail identity. Each identity uses its own JMAP token.

**Auth:** Service role for the sync branch (so a single button click can advance shared state); cookie-bound for the search branch.

**Side effects (sync branch):**
- One JMAP session per identity — `fetchEmails` over the Inbox + `fetchSentEmails` over the Sent mailbox, in parallel per identity.
- Inserts new rows into `inbound_emails` (deduped on the global `UNIQUE(message_id)` constraint). Outbound rows are tagged `direction='outbound'` and skip `correlateAndNotify`.
- For each new inbound row, runs `correlateAndNotify(supabase, row)` — person match (exact email → domain), interaction status flip to `replied`, Telegram notification (unless `INBOX_TELEGRAM_DISABLED=1`).
- For each new outbound row, runs `reconcileOutboundToInteraction(supabase, row)` — finds a matching person by `to_address`, then inserts an `interactions` row tagged `detail.source = 'sent_folder_reconciler'` unless a row within ±2 minutes with the same normalized subject already exists.
- Upserts `inbox_sync_state` per identity with `last_email_id`, `last_sent_email_id`, `last_sync_at`, `unread_count` (recomputed from inbound + unread rows), `status`, `error_message`.

**Caveats:**
- The search + sync branches sharing one handler is unusual.
- Identity list isn't hard-coded in the route — it's read from `getInboxIdentities()` and driven by `FASTMAIL_API_KEY_<HANDLE>` env vars.

#### 2.4.2 `POST /api/inbox`

**File:** `app/api/inbox/route.ts`
**Purpose:** Manual user actions on inbox rows:
- `action: "mark_read"` + `emailId` → set `is_read = true`.
- Default (no `action`): requires `emailId` and `personId` → link the email's thread to a person, set `correlation_type: "manual"`, log to `job_log`.

**Auth:** Cookie-bound SSR client.
**Response:** `{ success: true, person? }`.

#### 2.4.3 `POST /api/inbox/sync`

**File:** `app/api/inbox/sync/route.ts`
**Purpose:** Trigger a full inbox sync across every configured identity. Used by the admin UI's Sync button and the bot's `inbox:sync` action.

**Auth:** **Service role** (bypasses RLS). Publicly callable.

**Body:** Ignored. The previous `{ accountEmail }` shape is no longer required — one POST covers every identity.

**Response:** `{ success: true, new_emails, correlated, per_identity: [{ identity, new_inbound, new_outbound, correlated, error? }], synced_at }`.

**Caveats:**
- Service-role usage means a leaked URL pattern lets anyone trigger Fastmail polling and Telegram pings. Set `INBOX_TELEGRAM_DISABLED=1` if abuse becomes a concern; long-term, add an auth check.

#### 2.4.4 `POST /api/inbox/recorrelate`

**File:** `app/api/inbox/recorrelate/route.ts`
**Purpose:** One-off retroactive re-correlation. Walks every `inbound_emails` row where `direction='inbound'`, re-runs `correlateAndNotify(..., { notify: false })` against each, and returns a summary of what changed. Intended to be called once after running `scripts/backfill_script_sends.ts` (Stage 1) or any time the correlator logic or interaction data changes and you want to re-evaluate historical inbound mail.
**Auth:** Service-role client (no explicit auth check — same gap as §4.1). Admin-trigger only.
**Timeout:** `maxDuration = 300`.

**Body:** None.

**Response:**
```ts
{ processed: number; flipped: number }
```
`flipped` is the count of rows where `correlated_interaction_id` was newly set (a reply that now maps to an outbound interaction). Telegram notifications are suppressed (`notify: false`) — historical replays must not spam the chat.

**Notes:**
- Safe to run multiple times; `correlateAndNotify` is idempotent — it writes the best match found, so re-running after data changes is harmless.
- For large datasets prefer the script equivalent (`scripts/recorrelate_inbound.ts`) which pages in batches and prints per-100 progress.

#### 2.4.5 `GET /api/cron/inbox-sync`

**File:** `app/api/cron/inbox-sync/route.ts`
**Purpose:** Vercel-cron-ready inbox sync. Calls `runInboxSync` over every configured identity in one pass. Same logic as `POST /api/inbox/sync`, just gated for unattended use.
**Auth:** Bearer token — requires `Authorization: Bearer $CRON_SECRET`. Vercel injects this automatically when the path is declared in `vercel.json`'s `crons`. Returns `401` on mismatch, `500` if `CRON_SECRET` env var is unset.
**Supabase client:** Service role (`NEXT_SUPABASE_SECRET_KEY`).

**Response:** Same shape as `POST /api/inbox/sync`.

**Cadence:** Currently not scheduled in `vercel.json`. To enable, add `{ "path": "/api/cron/inbox-sync", "schedule": "*/5 * * * *" }` to `vercel.json:crons`. Provides an alternative to the pg_cron approach in `supabase/migrations/016_inbox_sync_cron.sql`.

#### 2.4.6 `POST /api/inbox/reply`

**File:** `app/api/inbox/reply/route.ts`
**Purpose:** Send an email reply via JMAP from one of the configured Fastmail identities. Used by the inbox UI's inline reply composer.

**Auth:** No explicit auth check. The route only sends from identities present in `getInboxIdentities()` (i.e., identities the server has a JMAP token for), so the abuse surface is the same shape as `/api/inbox/sync`.

**Body:**
```ts
{
  identity: string;              // must match a configured FASTMAIL_API_KEY_*
  to: { email: string; name?: string }[];
  cc?: { email: string; name?: string }[];
  bcc?: { email: string; name?: string }[];
  subject: string;
  bodyText: string;
  bodyHtml?: string | null;      // auto-generated from bodyText if omitted
  replyToJmapId?: string | null; // inbound_emails.message_id of the message we're replying to
}
```

**Response:** `{ ok: true, message_id, submission_id }` on success, or `{ error, details }, 400/500`.

**Side effects:**
- Looks up the original message's rfc822 `Message-Id` + `References` via `getMessageIdHeader(apiKey, replyToJmapId)` so the reply chains its threading headers correctly. Failure here is non-fatal — the send still proceeds, but the reply may not link in recipients' email clients.
- Calls `submitEmail()`: creates a draft in JMAP, calls `EmailSubmission/set` with `onSuccessUpdateEmail` to atomically move draft → Sent. Threading uses the first-class `inReplyTo` / `references` Email properties (Fastmail rejects `header:In-Reply-To:asMessageIds`).
- After a successful submit, best-effort triggers `runInboxSync` for that single identity so the new outbound row materializes in `inbound_emails` immediately (and `sent_folder_reconciler` adds an `interactions` row).

**Caveats:**
- HTML body is auto-generated from `bodyText` if not supplied, using a minimal `<div style="white-space:pre-wrap;…">` wrapper with HTML-escaped content. Rich-text editing is not implemented.
- `from` is fixed to the supplied `identity`. The route does not allow custom From addresses outside the managed-identity set.

---

### 2.5 Correlations

#### 2.5.1 `POST /api/correlations/merge`

**File:** `app/api/correlations/merge/route.ts:4`
**Purpose:** Resolve a `correlation_candidates` row by either dismissing it or merging two records.
**Auth:** Cookie-bound SSR client.

**Body:**
```ts
{
  candidate_id: string;
  action?: "dismiss";
  // For merge:
  winner_id?: string;
  loser_id?: string;
  entity_type?: "person" | "organization";
}
```

**Behavior:**
- `action: "dismiss"` → set `correlation_candidates.status = "dismissed"`.
- Otherwise → call `merge_persons` or `merge_organizations` Postgres RPC (see `docs/database.md`), then set candidate `status = "merged"`.

**Response:** `{ success: true, status }`.

**Caveats:**
- `entity_type` validation is implicit — anything other than `"person"` falls through to `merge_organizations` (`route.ts:50`). A typo silently merges as orgs.
- No transaction around `rpc + status update` — if the status update fails after a successful merge, the candidate stays `pending` despite the merge having happened.

---

### 2.6 Webhooks

#### 2.6.1 `POST /api/webhooks/sendgrid`

**File:** `app/api/webhooks/sendgrid/route.ts`
**Purpose:** Process SendGrid event webhook (delivered/open/click/bounce/dropped/spam_report/reply) and update interactions accordingly.
**Auth:** ECDSA via `@sendgrid/eventwebhook` (`EventWebhook.verifySignature(...)`) plus a ±300s timestamp freshness check. Requires `SENDGRID_WEBHOOK_PUBLIC_KEY` env var. Returns `401` if missing or invalid.

**Body:** SendGrid event array (or single event — handler normalizes). Each event has `sg_message_id`, `event`, etc.

**Behavior per event:**
1. Skip if no `sg_message_id`.
2. Strip `.filterXXX` suffix → base ID.
3. Map event type to interaction status (`mapSendGridEvent`):
   - `delivered → delivered`, `open → opened`, `click → clicked`, `bounce → bounced` (hard) or `failed` (soft), `dropped|spam_report → bounced`, `reply|inbound_email → replied`.
4. Look up interaction by `detail->>sendgrid_message_id`.
5. For non-terminal statuses, only advance if new priority > current priority (`STATUS_PRIORITY`). Prevents downgrades.
6. Update `interactions.status` and write `bounce_category` / `bounce_reason` / `bounce_type` to `interactions.detail`.
7. For terminal `bounced` (hard): also mark `sequence_enrollments.status = "bounced"` and stamp `persons.email_bounced_at = now()`.
8. For `replied` / `clicked`: pause active enrollments where the parent sequence has `schedule_config.stop_on_reply` / `stop_on_click` set.

**Returns 200 after verification** even on per-event errors so SendGrid does not retry-storm. A failed signature returns 401, prompting SendGrid to retry.

**Caveats:**
- The lookup uses `detail->>sendgrid_message_id` which is JSONB — make sure there's an index (verify in migrations).
- "replied" status from this route flows through the same priority table as the inbox-correlator path, so the two cannot regress each other.

---

## 3. Cross-cutting patterns

### 3.1 Supabase client creation

```
Cookie-bound (RLS):       const supabase = await createClient();   // from "@/lib/supabase/server"
Service role (no RLS):    const supabase = createClient(URL, NEXT_SUPABASE_SECRET_KEY);
                          // from "@supabase/supabase-js"
```

The two `createClient` symbols collide — `inbox/sync` aliases them to disambiguate (`route.ts:2-3`). Other routes only need one and import directly.

Routes using **service role**: `enrich/organizations`, `enrich/persons`, `enrich/cancel`, `inbox/sync`.
Routes using **cookie SSR**: everything else.

Reasoning given in code comments: "this runs server-side without user session" / "background sync". But every route runs server-side; the real distinction is whether the route should require an authenticated admin. Right now, none of the service-role routes check — see §4.

### 3.2 Response shapes (inconsistent)

| Pattern | Used by |
|---|---|
| `{ success: true, ... }` | `correlations/merge`, `inbox/sync`, `inbox` (POST), `enrich/cancel` |
| `{ jobId, status, ...counts }` | `enrich/organizations`, `enrich/persons`, `enrich` (legacy) |
| Counters `{ generated, failed, skipped, ... }` | `sequences/generate`, `sequences/send` |
| Raw payload | `messages/generate` (proxies edge fn), `messages/send` |
| Custom | `sequences/[id]/preview` ({subject,body,hasSender}), `sequences/[id]/messages` (array), bulk (`{updated}`) |

There is no standard envelope. Frontend `lib/queries/use-*.ts` hooks consume each shape directly.

### 3.3 Error shape

```ts
{ error: string }, status 4xx/5xx
```

Some routes additionally include `details` (`inbox/sync:133`, `inbox` POST `:163, :199`). Some include `jobId` for traceability (`enrich/organizations:241`). There is no error code enum.

### 3.4 Input validation

There is no validator library in use. Patterns observed:

- Most routes just destructure `body` and check truthy on required fields.
- A subset wraps `request.json()` in try/catch (`enrich/organizations:33`, `enrich/persons:29`, `enrich/cancel:18`, `inbox/sync:22`, `correlations/merge` — verify, etc.).
- Many do not — e.g. `messages/generate`, `messages/send`, `messages/actions`, `inbox` GET branches all call `await request.json()` unguarded. A malformed body throws and yields a default 500 with no `{error}` shape.
- No type narrowing — bodies are `as` cast to expected shapes.

### 3.5 Job lifecycle (where applicable)

Long-running batch routes follow:

1. Resolve target IDs from filter inputs.
2. Insert `job_log` row with `status: "processing"` and a `metadata` snapshot.
3. Run the work, optionally honoring `runBatchEnrichment`'s cancellation polling.
4. Update `job_log` to `completed` (with summary metadata) or `failed` (with `error`).
5. Return `{ jobId, ... }`.

Routes following this pattern: `enrich/organizations`, `enrich/persons`, `enrich` (legacy).
Routes that should but don't: `sequences/generate` and `sequences/send` log nothing.

### 3.6 Cancellation

Only the enrichment pipeline supports cancellation. `POST /api/enrich/cancel` flips `job_log.status = "cancelled"`; `runBatchEnrichment` checks between iterations. Sequence execution / send loops have no cancel mechanism.

### 3.7 Idempotency

- `sequences/generate` checks `(sequence_id, person_id, sequence_step)` before inserting (good).
- `sequences/send` uses an atomic claim RPC (`claim_due_interactions` from migration 028) — `FOR UPDATE SKIP LOCKED` ensures overlapping cron invocations claim disjoint sets. Stranded `sending` rows are recovered every 5 minutes by the `reclaim_stuck_interactions` sweeper.
- `messages/send` does not check status before invoking edge function — re-running can re-send rows that just transitioned to `sent`.
- `webhooks/sendgrid` uses status priority comparison to prevent downgrade. No explicit replay protection (e.g. event ID dedupe).
- Inbox sync uses `(message_id, account_email)` unique-ish check before insert.

---

## 4. Anti-patterns and risks

This section flags inconsistencies and concrete risks. Each item references file:line.

### 4.1 Service-role routes are publicly callable

- `app/api/enrich/organizations/route.ts:14` — POSTs run paid Apollo/Perplexity/Gemini calls. No auth.
- `app/api/enrich/persons/route.ts:15` — same.
- `app/api/enrich/cancel/route.ts:11` — anyone can cancel any job by ID.
- `app/api/inbox/sync/route.ts:42` — anyone can trigger Fastmail polling and Telegram notifications.

`middleware.ts:19` only matches `/admin/:path*`. Suggested fix: extend matcher to `/api/:path*` and require auth, OR add explicit `Authorization: Bearer <secret>` checks inside service-role handlers, OR move them under `/admin/api/...` so middleware applies.

### 4.2 `messages/actions` writes "failed" for "supersede"

`app/api/messages/actions/route.ts:35-37` — there's no `superseded` enum value, so the route writes `status: "failed"`. The semantic intent (replace this draft with a new one) is lost in the audit trail. Either add the enum value or rename the action.

### 4.3 Error swallowing in legacy enrich

`app/api/enrich/route.ts:130` — per-contact Apollo errors are `console.error`'d and skipped. The `job_log` summary doesn't track failed contacts. Compare to `enrich/organizations` which records per-org success/failure in `results[]`.

### 4.4 Inbox handler conflates two operations

`app/api/inbox/route.ts:18-26` does person search; the rest does email sync. The two have nothing to do with each other. Move person search to `/api/persons/search` or similar.

### 4.5 Two ways to sync inbox

`GET /api/inbox` syncs both accounts; `POST /api/inbox/sync` syncs one. They have slightly different fields they upsert (`unread_count` only on sync). Consolidate.

### 4.6 No transactions around multi-step state changes

- `correlations/merge`: RPC then status update — if the second fails the first sticks.
- `messages/send`: `interactions.status = sending` then edge function — if edge invocation fails the row is stuck in `sending`. (Legacy route; the modern `sequences/send` has a 10-min sweeper that recovers these.)
- `sequences/send`: **resolved** — see §4.7.
- `inbox` POST link-to-person: update + job_log insert — partial state on failure.

Use a Postgres function or, where invoking external APIs, a "claim → process → confirm" state machine with timeout-based reaper.

### 4.7 Row-level locking in `sequences/send` (resolved)

Previously `sequences/send` did a non-atomic `SELECT ... LIMIT 50` followed by a separate `UPDATE status='sending'`, leaving a race window where overlapping cron invocations could double-send. Migration `028_sequence_send_atomic_claim.sql` resolves this:

- `claim_due_interactions(p_limit)` — atomic `UPDATE ... FROM (SELECT ... FOR UPDATE SKIP LOCKED) RETURNING *`. Concurrent callers claim disjoint sets.
- `reclaim_stuck_interactions(p_stuck_minutes)` — companion sweeper invoked at the top of every send-route run (10-minute threshold). Reverts any row stranded in `sending` back to `scheduled` with retry_count++.

Stuck rows are also surfaced in the end-of-run Telegram batch and on the `/admin/sequences/failures` triage page.

### 4.8 Ad-hoc input validation, no schema layer

No `zod` / `valibot` / `yup`. Body shapes are `as`-cast and trust the client. For a CRM with destructive operations (merge, delete) this is a risk. Suggest adding a `lib/validators/` directory with per-route schemas.

### 4.9 No structured logging

Routes log via `console.log` / `console.error` with `[name]` prefixes. There is no request ID, no correlation ID, no log level configuration. For Vercel observability that's fine; for debugging pipeline issues it makes correlation across many routes hard.

### 4.10 Mixed naming conventions

- Snake_case in bodies: `person_ids`, `interaction_ids`, `event_id`, `scheduled_at`.
- camelCase in bodies: `organizationIds`, `personIds`, `eventId`, `scheduledAt`, `messageIds`, `candidate_id` (snake!).

Even within a single route family it's inconsistent (`messages/actions` uses `interaction_ids`; `sequences/[id]/messages/bulk` uses `messageIds`). Pick one.

### 4.11 Hardcoded values

- `app/api/inbox/route.ts:6` — Fastmail accounts hardcoded.
- `app/api/sequences/send/route.ts:40` — 50-row cap hardcoded.
- `app/api/enrich/organizations/route.ts:96, 113, 116` — 200-row caps hardcoded.

Consider env vars or config.

---

## Appendix: route index

| Method | Path | File |
|---|---|---|
| POST | `/api/enrich` | `app/api/enrich/route.ts` |
| POST | `/api/enrich/organizations` | `app/api/enrich/organizations/route.ts` |
| POST | `/api/enrich/persons` | `app/api/enrich/persons/route.ts` |
| POST | `/api/enrich/cancel` | `app/api/enrich/cancel/route.ts` |
| POST | `/api/messages/generate` | `app/api/messages/generate/route.ts` |
| POST | `/api/messages/send` | `app/api/messages/send/route.ts` |
| POST | `/api/messages/actions` | `app/api/messages/actions/route.ts` |
| POST | `/api/sequences/generate` | `app/api/sequences/generate/route.ts` |
| POST | `/api/sequences/send` | `app/api/sequences/send/route.ts` |
| GET | `/api/sequences/[id]/messages` | `app/api/sequences/[id]/messages/route.ts` |
| PATCH | `/api/sequences/[id]/messages/[msgId]` | `app/api/sequences/[id]/messages/[msgId]/route.ts` |
| POST | `/api/sequences/[id]/messages/bulk` | `app/api/sequences/[id]/messages/bulk/route.ts` |
| POST | `/api/sequences/[id]/preview` | `app/api/sequences/[id]/preview/route.ts` |
| GET | `/api/inbox` | `app/api/inbox/route.ts` |
| POST | `/api/inbox` | `app/api/inbox/route.ts` |
| POST | `/api/inbox/sync` | `app/api/inbox/sync/route.ts` |
| POST | `/api/inbox/recorrelate` | `app/api/inbox/recorrelate/route.ts` |
| GET | `/api/cron/inbox-sync` | `app/api/cron/inbox-sync/route.ts` |
| POST | `/api/correlations/merge` | `app/api/correlations/merge/route.ts` |
| POST | `/api/webhooks/sendgrid` | `app/api/webhooks/sendgrid/route.ts` |
