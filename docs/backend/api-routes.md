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
  - `app/api/enrich/route.ts:4` — 60s (legacy contacts table)
  - `app/api/sequences/execute/route.ts:5` — 60s
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
- **Service-role client** (`createClient` from `@supabase/supabase-js` using `NEXT_SUPABASE_SECRET_KEY`) — bypasses RLS. Used by background/batch routes (`enrich/organizations`, `enrich/persons`, `enrich/cancel`, `inbox/sync`).

**This is a security gap worth flagging:** any unauthenticated client on the public internet can `POST /api/enrich/organizations`, `/api/enrich/persons`, `/api/enrich/cancel`, or `/api/inbox/sync` and trigger paid Apollo/Perplexity/Gemini calls or run pipeline jobs. There is no shared secret, JWT check, or IP allowlist on these routes. See §4.

The SendGrid webhook (`app/api/webhooks/sendgrid/route.ts`) similarly has **no signature verification** — see §2.6.1.

### 1.3 Conventions

- Bodies are JSON. Most handlers `await request.json()` directly without a schema validator (no zod, no yup). A few wrap the parse in `try/catch` and return `{ error: "Invalid JSON body" }, 400`; many do not.
- Successful responses are `NextResponse.json(payload)` with no explicit status (200).
- Error responses are `NextResponse.json({ error: string }, { status })`. Status codes used: 400 (bad input), 404 (not found), 500 (db / external error). 401/403 are never returned (auth is implicit via RLS).
- No standard envelope. Some routes return `{ success: true, ... }`, others return the payload directly, others return `{ jobId, status, ...counts }`. See §3.2.
- Job tracking goes through the `job_log` table (see `docs/database.md`). Long-running batch routes insert a parent `job_log` row with `status: "processing"`, run, then update to `completed` / `failed` / `cancelled`.

### 1.4 Shared helpers

- `lib/supabase/server.ts` — cookie-bound server client (anon key, RLS enforced).
- `lib/supabase/client.ts` — browser client.
- `lib/sendgrid.ts` — `sendEmail()` and `verifyWebhookSignature()` (the latter is a stub — only checks timestamp recency, see §4).
- `lib/fastmail.ts` — `fetchEmails(apiKey, account, sinceId)` for inbox polling.
- `lib/inbox-correlator.ts` — `correlateAndNotify(supabase, email)` does email→person matching (exact email then domain) and dispatches Telegram notifications.
- `lib/telegram.ts` — Telegram bot notifications.
- `lib/template-renderer.ts` — `buildContext`, `extractAiBlocks`, `renderTemplate` for sequence templates with embedded `{{ai:...}}` blocks.
- `lib/enrichment/pipeline.ts` — `runBatchEnrichment` (org enrichment via Apollo + Perplexity + Gemini, plus People Finder).
- `lib/enrichment/person-pipeline.ts` — `runBatchPersonEnrichment` (Apollo people-match + reverse org link).
- `lib/queries/event-persons.ts` — `getPersonIdsForEvent(supabase, eventId, relation)`. Routes should use this rather than ad-hoc joins (see project memory: `project_person_event_affiliations.md`).

---

## 2. Route catalog

Counts: 17 route files, 18 handlers (one file exposes both `GET` and `POST`).

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
  initiativeId?: string;                // resolves via initiative_enrollments
  icpBelow?: number;                    // orgs where icp_score IS NULL OR icp_score < N
  failedIncomplete?: boolean;           // enrichment_status in (failed, partial)
  peopleFinderConfig?: {                // only used when stage includes people_finder
    perCompany?: number;                // default 5
    seniorities?: string[];             // default ["owner","founder","c_suite","vp","director"]
    departments?: string[];
  } | null;
}
```

Filter precedence (first match wins): `organizationIds` → `eventId` → `initiativeId` → `failedIncomplete` → `icpBelow` → default (orgs with `icp_score IS NULL`, capped at 200).

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
- `nextSendWindowTime` (`route.ts:41`) computes the next slot inside `schedule_config.send_window` (timezone-aware via `toLocaleString`). The TZ-offset math at `route.ts:87-90` is approximate — flagged as "rough approximation" in code.
- `isDue` (`route.ts:99`) supports `relative`, `window`, and `anchor` timing modes.

**Idempotency:** Checks for existing `interactions` row matching `(sequence_id, person_id, sequence_step)` before inserting (`route.ts:202-213`). Skips if found.

#### 2.3.2 `POST /api/sequences/execute`

**File:** `app/api/sequences/execute/route.ts:60`
**Purpose:** **Legacy** sequence executor. Same loop structure as `/generate` but uses simple `{first_name}` / `{full_name}` / `{company_name}` substitution. Per the comment at `route.ts:146-148`, AI block generation now lives in `/api/sequences/generate`.
**Auth:** Cookie-bound SSR client.
**Timeout:** 60s.

**Body:** None (POST with empty body).

**Response:** `{ enrollments_checked, processed, interactions_created, completed, errors? }`.

**Caveats:**
- No body filtering (cannot scope to one sequence).
- No idempotency check before insert — running this twice for a due enrollment can create duplicate interactions. (Contrast with `/generate` which checks at `route.ts:202`.)
- Does not honor `schedule_config.send_window` — only checks cumulative `delay_days`.
- Inserts a `job_log` summary row at the end (`route.ts:203`); `/generate` does not.
- **Two routes do mostly the same thing** — see §4.

#### 2.3.3 `POST /api/sequences/send`

**File:** `app/api/sequences/send/route.ts:29`
**Purpose:** Email dispatcher. Picks up `interactions` where `status = "scheduled"` and `scheduled_at <= now()`, sends via SendGrid, updates status, retries with backoff.
**Auth:** Cookie-bound SSR client.
**Timeout:** 60s. Hard cap of 50 interactions per call (`route.ts:40`).

**Body:** None.

**Response:** `{ sent, failed, skipped }`.

**Send flow per row:**
1. Skip if `persons.email` is null → mark `failed` with `detail.error`.
2. Skip if `sequences.sender_profiles` is null → mark `failed`.
3. Mark `sending`.
4. Call `sendEmail` (`lib/sendgrid.ts:15`).
5. On success: status `sent`, `occurred_at = now`, store `detail.sendgrid_message_id` (used by webhook).
6. On failure: increment `detail.retry_count`. If < 3, reschedule with `retry_count * 5min` linear backoff and status `scheduled`. Else mark `failed`.

**Caveats:**
- Channel-agnostic field name `interactions.body` is sent as `html` to SendGrid (`route.ts:98`). If LinkedIn/Twitter interactions ever land in this query, they would be emailed in HTML — but this query doesn't filter by channel, only by status. Verify upstream code only schedules emails.
- "Sending" rows are not unwound on crash.
- 50-row cap and 60s timeout means this needs to be invoked frequently (cron) for high volume.
- No locking — two concurrent invocations can pick up the same row before either has updated to `sending`.

#### 2.3.4 `GET /api/sequences/[id]/messages`

**File:** `app/api/sequences/[id]/messages/route.ts:4`
**Purpose:** List interactions for a sequence with status/step/search filters. Used by the sequence detail page.
**Auth:** Cookie-bound SSR client.

**Query params:**
- `status` — comma-separated list (e.g. `draft,scheduled`).
- `step` — numeric, exact match on `sequence_step`.
- `search` — case-insensitive client-side filter on `person_name` and `subject` (applied after fetch).

**Response:** Array of `{ id, person_id, person_name, person_title, person_org, sequence_step, subject, body, status, scheduled_at, occurred_at, detail }`. `person_org` is hardcoded `null` (`route.ts:61`) — verify whether a join is intended.

#### 2.3.5 `PATCH /api/sequences/[id]/messages/[msgId]`

**File:** `app/api/sequences/[id]/messages/[msgId]/route.ts:4`
**Purpose:** Single-message lifecycle update.
**Auth:** Cookie-bound SSR client.

**Body:**
```ts
{
  action: "edit" | "approve" | "reject" | "cancel" | "resend";
  body?: string;
  subject?: string;     // edit only
}
```

Action mappings:
- `approve` / `resend`: `status: "scheduled"`, `scheduled_at: now()`.
- `reject`: `status: "failed"`.
- `cancel`: `status: "draft"`, `scheduled_at: null`.
- `edit`: patch `subject` and/or `body`. Returns 400 if neither provided.

**Notes:**
- Verifies the `msgId` belongs to `sequence_id = id` before updating (`route.ts:24-32`).
- `resend` does **not** clear retry counters in `detail` — verify whether intentional.

#### 2.3.6 `POST /api/sequences/[id]/messages/bulk`

**File:** `app/api/sequences/[id]/messages/bulk/route.ts:4`
**Purpose:** Multi-message version of the above for `approve` / `reject` / `reschedule`.
**Auth:** Cookie-bound SSR client.

**Body:** `{ action, messageIds: string[], scheduledAt?: string }`.
**Response:** `{ updated: number }`.

**Caveats:**
- `reschedule` requires `scheduledAt`; the others ignore it.
- Filters input IDs to those that actually belong to this sequence (`route.ts:30-36`) before updating.

#### 2.3.7 `POST /api/sequences/[id]/preview`

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

#### 2.4.1 `GET /api/inbox`

**File:** `app/api/inbox/route.ts:12`
**Purpose:** Two unrelated jobs in one handler:
1. **Person search** — when `?type=persons&search=…`, return up to 20 persons matching by name or email (used by the "Link to Person" modal).
2. **Inbox sync** — otherwise, poll Fastmail for both accounts in `ACCOUNTS = ["jb@gofpblock.com", "wes@gofpblock.com"]`, store new `inbound_emails`, run correlation + Telegram notification.
**Auth:** Cookie-bound SSR client.

**Side effects (sync branch):**
- Fastmail HTTP fetches (`lib/fastmail.ts`) per account.
- Inserts new rows into `inbound_emails` (skips existing by `(message_id, account_email)`).
- For each newly inserted email, calls `correlateAndNotify(supabase, email)` which: matches person by exact email, then domain; updates the email row; sends Telegram alert.
- Upserts `inbox_sync_state` per account with `last_email_id`, `last_sync_at`, `status`, and `error_message`.

**Caveats:**
- The two branches (search and sync) sharing one handler is unusual — **see §4**.
- ACCOUNTS list is hardcoded.
- No `maxDuration` set; full 2-account sync may exceed the platform default.

#### 2.4.2 `POST /api/inbox`

**File:** `app/api/inbox/route.ts:141`
**Purpose:** Manual user actions on inbound emails:
- `action: "mark_read"` + `emailId` → set `is_read = true`.
- Default (no `action`): requires `emailId` and `personId` → link email to person, set `correlation_type: "manual"`, log to `job_log`.
**Auth:** Cookie-bound SSR client.

**Response:** `{ success: true, person? }`.

#### 2.4.3 `POST /api/inbox/sync`

**File:** `app/api/inbox/sync/route.ts:12`
**Purpose:** Sync a **single** account on demand (vs. `GET /api/inbox` which syncs both).
**Auth:** **Service role** (bypasses RLS — `route.ts:42`). Publicly callable.

**Body:** `{ accountEmail: string }`.
**Response:** `{ success: true, account, new_emails, correlated, synced_at }` or `{ error, details }, 500`.

**Side effects:** Same as the sync branch of `GET /api/inbox` but for one account. Also sets `unread_count` (the GET handler doesn't).

**Caveats:**
- Two ways to sync (GET-all vs POST-one) with subtly different write behaviors. Recommend consolidating.
- Service-role usage means a leaked URL pattern lets anyone trigger Fastmail polling and Telegram blasts. Add an auth check.

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

**File:** `app/api/webhooks/sendgrid/route.ts:44`
**Purpose:** Process SendGrid event webhook (delivered/open/click/bounce/dropped/spam_report) and update interactions accordingly.
**Auth:** **None — see §4.** A WARNING comment at `route.ts:1` and at `lib/sendgrid.ts:64` flags that `verifyWebhookSignature` is timestamp-only and does not implement ECDSA. The webhook handler does not even call this stub.

**Body:** SendGrid event array (or single event — handler normalizes). Each event has `sg_message_id`, `event`, etc.

**Behavior per event:**
1. Skip if no `sg_message_id`.
2. Strip `.filterXXX` suffix → base ID.
3. Map event type to interaction status (`mapSendGridEvent` at `route.ts:19`):
   - `delivered → delivered`, `open → opened`, `click → clicked`, `bounce|dropped|spam_report → bounced`.
4. Look up interaction by `detail->>sendgrid_message_id`.
5. For non-terminal statuses, only advance if new priority > current priority (`STATUS_PRIORITY` at `route.ts:6`). Prevents downgrades (e.g. `replied` won't be overwritten by `opened`).
6. Update `interactions.status`.
7. For terminal `bounced`: also mark `sequence_enrollments.status = "bounced"` for the matching `(sequence_id, person_id)`.

**Always returns 200** (`route.ts:153`) — even on parse failure — so SendGrid doesn't retry.

**Caveats:**
- **No signature verification.** Any caller can POST and mutate interaction statuses.
- The lookup uses `detail->>sendgrid_message_id` which is JSONB — make sure there's an index (verify in migrations).
- "replied" status comes from the inbox-correlator path, not from SendGrid. The priority table includes it (priority 7) so SendGrid events can never downgrade a replied interaction.

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
| Counters `{ generated, failed, skipped, ... }` | `sequences/generate`, `sequences/execute`, `sequences/send` |
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
- Many do not — e.g. `messages/generate`, `messages/send`, `messages/actions`, `sequences/execute`, `inbox` GET branches all call `await request.json()` unguarded. A malformed body throws and yields a default 500 with no `{error}` shape.
- No type narrowing — bodies are `as` cast to expected shapes.

### 3.5 Job lifecycle (where applicable)

Long-running batch routes follow:

1. Resolve target IDs from filter inputs.
2. Insert `job_log` row with `status: "processing"` and a `metadata` snapshot.
3. Run the work, optionally honoring `runBatchEnrichment`'s cancellation polling.
4. Update `job_log` to `completed` (with summary metadata) or `failed` (with `error`).
5. Return `{ jobId, ... }`.

Routes following this pattern: `enrich/organizations`, `enrich/persons`, `enrich` (legacy).
Routes that should but don't: `sequences/execute` only logs at the end; `sequences/generate` and `sequences/send` log nothing.

### 3.6 Cancellation

Only the enrichment pipeline supports cancellation. `POST /api/enrich/cancel` flips `job_log.status = "cancelled"`; `runBatchEnrichment` checks between iterations. Sequence execution / send loops have no cancel mechanism.

### 3.7 Idempotency

- `sequences/generate` checks `(sequence_id, person_id, sequence_step)` before inserting (good).
- `sequences/execute` does not (bad).
- `sequences/send` has no row-level lock; concurrent invocations can double-send.
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

### 4.2 No SendGrid webhook signature verification

`app/api/webhooks/sendgrid/route.ts:44` accepts any POST and mutates `interactions.status` and `sequence_enrollments.status`. The `verifyWebhookSignature` helper in `lib/sendgrid.ts:65` is a stub (timestamp-only) and isn't even called. The file's own header comment flags this. Implement ECDSA verification with `@sendgrid/eventwebhook` before sending real volume.

### 4.3 Two routes do "advance enrollments and create interactions"

- `app/api/sequences/execute/route.ts` (legacy, simple `{var}` substitution, no idempotency check, no AI blocks).
- `app/api/sequences/generate/route.ts` (modern, AI blocks, idempotency check, send window timing).

Both are reachable. A cron or scheduled invocation pointed at the wrong one will create duplicate interactions or skip AI block rendering. Recommend: delete `/execute` once verified no consumers remain, or have it 410 Gone.

### 4.4 `messages/actions` writes "failed" for "supersede"

`app/api/messages/actions/route.ts:35-37` — there's no `superseded` enum value, so the route writes `status: "failed"`. The semantic intent (replace this draft with a new one) is lost in the audit trail. Either add the enum value or rename the action.

### 4.5 Error swallowing in legacy enrich

`app/api/enrich/route.ts:130` — per-contact Apollo errors are `console.error`'d and skipped. The `job_log` summary doesn't track failed contacts. Compare to `enrich/organizations` which records per-org success/failure in `results[]`.

### 4.6 Inbox handler conflates two operations

`app/api/inbox/route.ts:18-26` does person search; the rest does email sync. The two have nothing to do with each other. Move person search to `/api/persons/search` or similar.

### 4.7 Two ways to sync inbox

`GET /api/inbox` syncs both accounts; `POST /api/inbox/sync` syncs one. They have slightly different fields they upsert (`unread_count` only on sync). Consolidate.

### 4.8 No transactions around multi-step state changes

- `correlations/merge`: RPC then status update — if the second fails the first sticks.
- `messages/send`: `interactions.status = sending` then edge function — if edge invocation fails the row is stuck in `sending`.
- `sequences/send`: same pattern around SendGrid call.
- `inbox` POST link-to-person: update + job_log insert — partial state on failure.

Use a Postgres function or, where invoking external APIs, a "claim → process → confirm" state machine with timeout-based reaper.

### 4.9 No row-level locking in `sequences/send`

`app/api/sequences/send/route.ts:33-40` selects 50 scheduled rows. Two concurrent invocations will both pick up the same rows and double-send. Use `SELECT ... FOR UPDATE SKIP LOCKED` via an RPC, or a state transition that acts as the lock (`UPDATE ... WHERE status='scheduled' RETURNING ...`).

### 4.10 Approximate timezone math in send window

`app/api/sequences/generate/route.ts:87-90` admits to a "rough approximation" of TZ offset. For TZ-sensitive scheduling this should use a proper library (Intl.DateTimeFormat with explicit parts, or date-fns-tz) and be tested across DST transitions.

### 4.11 Ad-hoc input validation, no schema layer

No `zod` / `valibot` / `yup`. Body shapes are `as`-cast and trust the client. For a CRM with destructive operations (merge, delete) this is a risk. Suggest adding a `lib/validators/` directory with per-route schemas.

### 4.12 No structured logging

Routes log via `console.log` / `console.error` with `[name]` prefixes. There is no request ID, no correlation ID, no log level configuration. For Vercel observability that's fine; for debugging pipeline issues it makes correlation across many routes hard.

### 4.13 Mixed naming conventions

- Snake_case in bodies: `person_ids`, `interaction_ids`, `event_id`, `scheduled_at`.
- camelCase in bodies: `organizationIds`, `personIds`, `eventId`, `scheduledAt`, `messageIds`, `candidate_id` (snake!).

Even within a single route family it's inconsistent (`messages/actions` uses `interaction_ids`; `sequences/[id]/messages/bulk` uses `messageIds`). Pick one.

### 4.14 Hardcoded values

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
| POST | `/api/sequences/execute` | `app/api/sequences/execute/route.ts` |
| POST | `/api/sequences/send` | `app/api/sequences/send/route.ts` |
| GET | `/api/sequences/[id]/messages` | `app/api/sequences/[id]/messages/route.ts` |
| PATCH | `/api/sequences/[id]/messages/[msgId]` | `app/api/sequences/[id]/messages/[msgId]/route.ts` |
| POST | `/api/sequences/[id]/messages/bulk` | `app/api/sequences/[id]/messages/bulk/route.ts` |
| POST | `/api/sequences/[id]/preview` | `app/api/sequences/[id]/preview/route.ts` |
| GET | `/api/inbox` | `app/api/inbox/route.ts` |
| POST | `/api/inbox` | `app/api/inbox/route.ts` |
| POST | `/api/inbox/sync` | `app/api/inbox/sync/route.ts` |
| POST | `/api/correlations/merge` | `app/api/correlations/merge/route.ts` |
| POST | `/api/webhooks/sendgrid` | `app/api/webhooks/sendgrid/route.ts` |
