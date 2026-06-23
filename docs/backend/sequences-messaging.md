# Sequences & Messaging Subsystem

End-to-end documentation of the multi-step outreach pipeline: sequence definition,
enrollment, message generation (AI + templates), sending (SendGrid for email,
HeyReach for LinkedIn), inbox sync (Fastmail/JMAP), and reply correlation.

> File:line references throughout point to current source. Where a route or
> function has both a Next.js implementation and a Supabase Edge Function
> implementation, both are noted — they are partial duplicates from two design
> eras (the Edge Functions live alongside an older `messages`/`contacts` schema,
> while the Next.js routes operate on `interactions`/`persons`).

---

## 1. Domain Model

### Tables (current redesigned schema)

| Table                  | Purpose                                                                 |
| ---------------------- | ----------------------------------------------------------------------- |
| `sequences`            | Definition of an N-step outreach campaign.                              |
| `sequence_enrollments` | Person ↔ Sequence pairing with cursor (`current_step`).                 |
| `interactions`         | Every outbound (or inbound) message attempt; the unit of "send".        |
| `persons`              | Recipients.                                                             |
| `organizations`        | Org context for templating and ICP gating.                              |
| `sender_profiles`      | Outbound identity (email, signature, HeyReach LinkedIn account ID).     |
| `inbound_emails`       | Cached emails fetched from Fastmail; correlated to persons.             |
| `inbox_sync_state`     | Per-account JMAP cursor (`last_email_id`) and status.                   |
| `events`               | Optional sequence parent (provides context tokens like `{event.name}`). |

### Sequence shape — `lib/types/database.ts:300-313`

```ts
interface Sequence {
  id: string;
  name: string;
  channel: string;            // always 'email' for new sequences (the UI no longer exposes other channels; legacy rows may still be 'linkedin' / 'twitter')
  event_id: string | null;
  steps: SequenceStep[];
  status: 'draft' | 'active' | 'paused' | 'completed';
  send_mode: 'auto' | 'approval';   // approval requires human action; auto schedules immediately
  sender_id: string | null;
  schedule_config: SequenceSchedule;
  created_at: string;
  updated_at: string;
}
```

`createSequence` (`app/admin/sequences/actions.ts`) hard-codes
`channel='email'` and seeds `schedule_config = { timing_mode: 'relative', exclude_bounced: true }` for every new row.

`steps` is a JSONB array on the `sequences` row. Each step
(`SequenceStep`, `lib/types/database.ts:292-298`):

```ts
{
  step_number: number;
  delay_days: number;
  action_type: 'initial' | 'follow_up' | 'break_up';
  subject_template: ComposableTemplate | null;  // email only
  body_template: ComposableTemplate;
}
```

A `ComposableTemplate` is `{ blocks: TemplateBlock[] }` where each block is
either `{ type: 'text', content }` or
`{ type: 'ai', prompt, max_tokens?, tone? }` (`lib/types/database.ts:272-278`).

Migration `023_sequences_redesign.sql:1-27` introduced this shape and migrated
legacy `body_template` strings into single-block text composables.

### Schedule modes — `lib/types/database.ts:280-290`

- `relative` — `delay_days` accumulate from `enrollment.enrolled_at`.
- `window` — same as relative but constrained to `send_window` (days, hours, TZ).
  `app/api/sequences/generate/route.ts` walks forward in 30-min steps for up to
  7 days using `Intl.DateTimeFormat` to resolve zoned hour-of-day and weekday
  per instant — DST-correct.
- `anchor` — schedule relative to `anchor_date` with `before` or `after`
  direction (e.g. T-7 days before an event).

### Schedule parameters (the rest of `schedule_config` JSONB)

Beyond the timing mode, `schedule_config` carries optional
**parameters** that are read by the send pipeline and enrollment helpers
(undefined values are skipped — back-compat with sequences created before this
field set existed):

| Field                       | UI?  | Where enforced                                       | Effect                                                                   |
| --------------------------- | ---- | ---------------------------------------------------- | ------------------------------------------------------------------------ |
| `throttle_per_day`          | yes  | `app/api/sequences/send/route.ts`                    | Per-sequence daily ceiling. When hit, defer scheduled rows by 1h.        |
| `daily_send_cap_global`     | no   | `app/api/sequences/send/route.ts`                    | Hard cap across **all** sequences. UI control removed; honored only if set on legacy rows. |
| `min_interval_minutes`      | no   | `app/api/sequences/send/route.ts`                    | Minimum gap between any two sends to the same person. UI control removed; legacy values still honored. |
| `quiet_hours_local: {start,end}` | no | `app/api/sequences/send/route.ts`                  | Local-hour suppression window. UI control removed; legacy values still honored. |
| `stop_on_reply`             | yes  | `app/api/webhooks/sendgrid/route.ts`                 | When a `reply` / `inbound_email` event lands, pauses active enrollments for that person whose parent sequence has the flag. |
| `stop_on_click`             | yes  | `app/api/webhooks/sendgrid/route.ts`                 | Same, on `click` events.                                                 |
| `exclude_bounced`           | **always on** | `lib/segments.ts` (`applySequenceEnrollFilters`)     | Always drops persons with `persons.email_bounced_at` set or any interaction with `status='bounced'` in the last 90 days. `updateSequenceSchedule` re-asserts `exclude_bounced: true` on every save; `applySequenceEnrollFilters` enforces unconditionally regardless of the stored flag. |
| `exclude_already_enrolled`  | yes  | `app/admin/sequences/actions.ts`                     | At enroll time, drops persons currently `active` in any *other* sequence. |

The surviving knobs are surfaced through `<SequenceConfigCard>` (compact
sidebar summary + inline send-mode toggle) and the
`<SequenceSettingsSheet>` slide-over, which renders
`<SequenceParametersPanel>` with full Delivery / Schedule / Pacing / Stop /
Audience sections. Every field has a popover with description, when-to-use,
and examples (`components/admin/parameter-guide.tsx`).

### Enrollment — `lib/types/database.ts:315-322`

```ts
{
  id, sequence_id, person_id,
  current_step: number,           // index into sequence.steps; 0-based
  status: 'active' | 'paused' | 'completed' | 'bounced',
  enrolled_at: timestamptz
}
```

`UNIQUE (sequence_id, person_id)` (migration 007:19; person_id renamed from
contact_id in 010:222).

### Interaction (the message) — `lib/types/database.ts:149-170`

The `interactions` table is the universal outbound record. Sequences write rows
with:

- `interaction_type ∈ {'cold_email','cold_linkedin','cold_twitter',...}`
  derived from channel inside `app/api/sequences/generate/route.ts`.
- `direction = 'outbound'`
- `status ∈ InteractionStatus` (11 values; see below)
- `sequence_id`, `sequence_step` for traceability
- `detail` JSONB for vendor metadata (`sendgrid_message_id`, `retry_count`,
  `last_error`, `ai_blocks_used`, `generated_at`)

### Status state machine — `lib/types/database.ts:10`

```
draft → scheduled → sending → sent → delivered → opened → clicked → replied
                            ↘
                              failed (terminal — delivery problem)
                              bounced (terminal — also bounces enrollment)

draft / scheduled → rejected (terminal — human decision, NOT a delivery failure)
```

Priority ordering is encoded in
`app/api/webhooks/sendgrid/route.ts:6-15` so SendGrid webhooks never downgrade
(e.g. an `open` after `replied` is dropped).

`bounced` is the only auto-cascading terminal: webhook handler updates
the enrollment to `bounced` so future steps are skipped
(`app/api/webhooks/sendgrid/route.ts:124-145`).

`rejected` (added migration `036_interaction_rejected_status.sql`) is written
when a human rejects a draft/scheduled message via the message-queue
`reject` action. It is deliberately distinct from `failed`/`bounced` so
intentional rejections don't pollute the Failed tab, the failures page, or the
dashboard failure count. `interactions.status` has no CHECK constraint, so the
new value needed only a data backfill, no DDL. The state machine lives in the
pure, unit-tested `buildUpdate()` in
`lib/sequences/message-transitions.ts` (consumed by both the per-message PATCH
route and the bulk route).

### Send mode — `Sequence.send_mode`

Both modes **pre-generate a row for every step up front** (see §3) so the whole
sequence is visible immediately; the drip cadence is carried by each row's
`scheduled_at` (computed by `computeStepScheduledAt`, `lib/sequences/schedule.ts`).

- `approval` — `generate` writes each step as `status='draft'` **with its planned
  `scheduled_at` populated** (so the queue shows when each step is due). A human
  approves via `/api/sequences/[id]/messages/[msgId]` (PATCH, `approve` →
  `scheduled`) or the bulk endpoint. **Approve preserves a future planned
  `scheduled_at`** (later steps keep their delay) and only falls back to `now()`
  when the planned time is already past or absent.
- `auto` — `generate` writes each step as `status='scheduled'` with the same
  computed `scheduled_at`; the sender dispatches each when due.

---

## 2. Lifecycle

```
[Sequence Creation]                  app/admin/sequences/actions.ts:26  createSequence
        ↓
[Add steps in admin UI]              actions.ts:8                     updateSequenceSteps
        ↓
[Set status='active']                actions.ts:49                    updateSequenceStatus
        ↓
[Enroll persons]                     actions.ts  enrollPersons
                                     actions.ts  enrollFromEvent (uses getPersonIdsForEvent)
                                     actions.ts  enrollFromSegment (uses lib/segments.ts)
                                     actions.ts  enrollFromList (reads person_list_items)
                                     ↳ all four pass through applySequenceEnrollFilters
                                       which honors schedule.exclude_bounced /
                                       exclude_already_enrolled before insert.
                                     ↳ status='active', current_step=0
                                     ↳ removal: unenrollPerson (single enrollment id),
                                       unenrollFromList (deletes enrollments for a list's
                                       static members)
        ↓
[Cron: /api/sequences/generate]      app/api/sequences/generate/route.ts (GET cron / POST manual)
   per active enrollment in active sequence:
     • already past last step? → mark completed, skip
     • fetch org/event/sender + build context ONCE per enrollment
     • for EACH remaining step (current_step … last):
         - interaction already exists for (sequence, person, step)? → skip (idempotency)
         - render templates: AI blocks via supabase.functions.invoke('generate-messages'),
           then text substitution via lib/template-renderer.ts
         - scheduled_at = computeStepScheduledAt(enrolled_at, steps, stepIndex, schedule)
           (cumulative delay / anchor → clamp to ≥ now → snap into send window)
         - insert interaction:
             status = 'scheduled' (if auto) | 'draft' (if approval)
             scheduled_at = <planned time>  (populated for BOTH modes)
     • set enrollment.current_step = steps.length, status = 'completed'
       (all steps generated; scheduled_at gates the actual sends — see note in §9)
        ↓
[(Approval mode only) human approves]  /api/sequences/[id]/messages/[msgId] (PATCH, action='approve')
                                       /api/sequences/[id]/messages/bulk
   approve → 'scheduled', KEEPING the planned scheduled_at when it's in the future
   (later steps keep their drip cadence); falls back to now() if past/absent.
        ↓
[Cron: /api/sequences/send]            vercel.json:3 — */5 * * * *
   1. SWEEP: rpc('reclaim_stuck_interactions', { p_stuck_minutes: 10 })
      reverts any 'sending' rows older than 10m back to 'scheduled' with
      retry_count++ — defends against crashed handlers / function timeouts.
   2. CLAIM: rpc('claim_due_interactions', { p_limit: 50 })
      atomic UPDATE...RETURNING using FOR UPDATE SKIP LOCKED — flips up to
      50 due 'scheduled' rows to 'sending' in a single statement, so
      overlapping cron invocations claim disjoint sets. Stamps detail.claimed_at.
   3. HYDRATE: SELECT joined persons + sequences + sender_profiles by id.
   4. PER ROW:
      • PRE-SEND PARAMETER GATES (read from sequences.schedule_config):
          - quiet_hours_local      → defer to next non-quiet hour in zone TZ
          - throttle_per_day       → defer +60m if today's count ≥ cap
          - daily_send_cap_global  → defer +60m if global today's count ≥ cap
          - min_interval_minutes   → defer +N if same person sent recently
        (defer flips status back to 'scheduled' with updated scheduled_at)
      • call SendGrid via lib/sendgrid.ts (row is already 'sending' from the claim)
      • on success → 'sent', detail.sendgrid_message_id captured
      • on failure → classify by HTTP status:
          - permanent (4xx, except 408/429) → 'failed' immediately
          - transient (5xx / 408 / 429 / network / timeout) → reschedule with
            backoff [5, 30, 120] minutes; after 3 attempts → 'failed'
   5. NOTIFY: if any terminal failures or sweeps happened, send a single
      Telegram message summarizing them (links to /admin/sequences/failures).
   response shape: { sent, failed, skipped, deferred, swept }
        ↓
[SendGrid webhook]                     app/api/webhooks/sendgrid/route.ts
   ECDSA signature verified via @sendgrid/eventwebhook before any state mutation.
   delivered/open/click/bounce/dropped/spam_report → status update
   hard bounce  (5xx)            → status='bounced', enrollment='bounced',
                                   persons.email_bounced_at = now()
   soft bounce  (4xx, blocked)   → status='failed' (non-terminal — retry path applies)
   reply / inbound_email         → status='replied'; if parent sequence has
                                   stop_on_reply, active enrollments for that
                                   person are paused
   click                         → status='clicked'; same for stop_on_click
        ↓
[Cron: pg_cron → /api/inbox/sync]      supabase/migrations/016_inbox_sync_cron.sql
   every 15min per account (jb@, wes@gofpblock.com — staggered by 1min)
   Fastmail JMAP fetch → inbound_emails dedup by message_id
   correlateAndNotify():
     1. exact email match (persons.email)
     2. domain match (organizations.website)
     3. on match: most recent outbound interaction → status='replied', Telegram ping
```

> The `sequences/execute` route was deleted (no callers remained); generation
> now flows exclusively through `/api/sequences/generate`. If you find old
> docs or scripts pointing at `/api/sequences/execute` they need updating.

---

## 3. Message Generation Pipeline

### Two coexisting generators

#### A. Sequence-driven (current) — `app/api/sequences/generate/route.ts`

Per active enrollment — supporting records and context are resolved **once**,
then the route loops over every remaining step:

1. Fetch person + sequence + steps (joined select).
2. Resolve primary org via `person_organizations` (`is_primary=true`).
3. Resolve event + sender_profile if FKs are set.
4. Build `TemplateContext` with `buildContext(person, org, event, sender)`
   from `lib/template-renderer.ts:84-121`. Exposes namespaces
   `person.*`, `org.*`, `event.*`, `sender.*` (each whitelisted).
5. **For each step** from `current_step` to the last (a scoped manual run with
   `step` targets just that one):
   a. Skip if an interaction already exists for `(sequence, person, step)`
      (idempotency).
   b. **Extract AI blocks** from subject_template and body_template
      (`extractAiBlocks`, `lib/template-renderer.ts:59-79`). Variable
      interpolation happens at extraction time so the prompt already has
      `{person.first_name}` etc. resolved.
   c. **Generate** each AI block by invoking the Supabase Edge Function
      `generate-messages`. The body is
      `{ system_prompt: aiBlock.tone || default, user_prompt: aiBlock.prompt }`
      — ad-hoc raw prompts, not the templated path described below.
   d. Render the template with AI results filled in
      (`renderTemplate`); unresolved AI blocks become `[AI_BLOCK_PENDING]`.
   e. Compute `scheduled_at = computeStepScheduledAt(...)` (`lib/sequences/schedule.ts`):
      cumulative `delay_days` from `enrolled_at` (relative/window) or
      `anchor_date ± delay` (anchor), clamped to ≥ now, then snapped forward into
      the `send_window` if one is configured.
   f. Insert into `interactions` with `status='scheduled'` (auto) or `'draft'`
      (approval), **`scheduled_at` populated for both modes**. On AI failure,
      insert a `failed` interaction with `detail.error` and move on to the next
      step (the rest of the sequence is unaffected).
6. After the loop, set `enrollment.current_step = steps.length`, `status='completed'`
   (a scoped step run leaves the cursor untouched).

#### B. Edge function `generate-messages` — `supabase/functions/generate-messages/index.ts`

This is the **older/legacy** path used for two purposes today:

- **Raw-prompt mode** (called by sequences/generate per AI block): two-arg
  invocation with just `system_prompt` and `user_prompt` falls through to
  `callGemini` (line 19-33). Note: the edge function code at lines 41-50
  expects `contact_ids`, `event_id`, `prompt_template_id`, `sender_id`, `cta`
  for full templated mode and will fail without `contact_ids` — meaning the
  current `sequences/generate` invocation actually exercises an undocumented
  loose path. **Gotcha** noted in §9.
- **Old contact-based generator** (called by `app/api/messages/generate`): walks
  `contacts → contact_company → companies`, loads `prompt_templates` keyed by
  channel, fills `{{contact.full_name}}`, `{{company.context}}` etc. via
  `fillTemplate` (line 8-17), calls Gemini, parses `Subject:` prefix for
  email, supersedes any prior message at same (contact, channel,
  sequence_number) by setting `status='superseded'` and bumping `iteration`.
  Writes to the legacy `messages` table, not `interactions`.

### Model

- **Gemini 2.5 Flash** via Generative Language API
  (`generate-messages/index.ts:21`). API key env: `GEMINI_API_KEY`.
- No prompt caching is implemented — the Gemini REST call is direct
  `fetch()` per AI block, per recipient.

### Where prompts live

- **Per-step prompts**: embedded as `ai` blocks inside `step.body_template` /
  `step.subject_template` JSONB on the `sequences` row.
- **Legacy templated prompts**: `prompt_templates` table (`PromptTemplate`,
  `lib/types/database.ts:239-247`) — `system_prompt` + `user_prompt_template`
  with Mustache-style `{{var}}`. Selected by channel or by
  `event_config.prompt_template_id`.
- **Sender tone notes**: `sender_profiles.tone_notes` is interpolated as
  `{{sender.tone_notes}}` only by the legacy generator
  (`generate-messages/index.ts:134`).

### Preview path

`app/api/sequences/[id]/preview/route.ts` runs the same render pipeline for an
arbitrary `(stepIndex, personId)` so the UI can show what a step will look like
without committing an interaction. AI failures here silently leave
`[AI_BLOCK_PENDING]` rather than recording a failed interaction
(`preview/route.ts:113-143`).

---

## 4. Send Pipeline

### Email (SendGrid)

- **Library**: `lib/sendgrid.ts` `sendEmail()` — wraps `POST /v3/mail/send`. Returns
  `{ success, messageId, error, statusCode }`. `messageId` comes from the
  `x-message-id` response header; this is the base ID that SendGrid
  webhooks later report as `sg_message_id`.
- **Request timeout**: the fetch is bounded by an `AbortController` (`SEND_TIMEOUT_MS`,
  15s; overridable per call via `timeoutMs`). The send loop is sequential, so without
  this a single hung connection would stall the whole batch until Vercel's 60s kill,
  stranding in-flight rows in `sending`. On abort, `sendEmail` returns a failure with
  **`statusCode` left undefined**, so it classifies as transient and the row is retried
  with backoff (see Retry policy) rather than failed terminally.
- **Cron**: `vercel.json:3` schedules `/api/sequences/send` every 5 minutes.
- **Send loop**: `app/api/sequences/send/route.ts`
  - **Stuck-row sweep first**: `rpc('reclaim_stuck_interactions', { p_stuck_minutes: 10 })`
    reverts any row stranded in `sending` for >10 minutes back to `scheduled`
    with `detail.retry_count++` and `detail.last_error='sweeper: stuck in sending state'`.
    Crashed handlers, function timeouts, and any residual race are recovered here.
  - **Atomic claim**: `rpc('claim_due_interactions', { p_limit: 50 })` runs a single
    SQL statement (`UPDATE ... FROM (SELECT ... FOR UPDATE SKIP LOCKED) RETURNING *`)
    that flips up to 50 due rows from `scheduled` to `sending`. Overlapping cron
    invocations claim disjoint sets — no double-send. Defined in migration
    `028_sequence_send_atomic_claim.sql`.
  - **Hydration**: after the claim returns ids, a single `.in('id', claimedIds)`
    SELECT loads the joined `persons`, `sequences`, `sender_profiles` rows.
  - Skips interactions with no `person.email` or no sender profile (each marks
    `failed` with `detail.error` and is included in the Telegram batch).
  - **Defer path**: pacing gates set `status='scheduled'` + new `scheduled_at`
    (the claim already flipped status to `sending`, so deferral must explicitly
    revert it).
  - **Retry policy** (per-failure classification):
    - Permanent (HTTP 4xx **except** 408 timeout and 429 rate-limit) → `failed`
      immediately. Bad payloads / unauthorized / not-found won't get better on retry.
    - Transient (5xx, 408, 429, network errors / request timeouts with no
      statusCode) → reschedule with `[5, 30, 120]` minute backoff. After 3
      attempts → `failed` with `detail.terminal_reason='retries_exhausted'`.
    - `detail.last_status_code` and `detail.terminal_reason` are written for
      observability.
  - **Telegram notification**: at end of run, if any terminal failures, stuck-row
    sweeps, or config-gap skips happened, sends a single batched message via
    `lib/telegram.ts` linking to `/admin/sequences/failures` for triage.
  - **Idempotency**: the atomic claim is the lock. `sendgrid_message_id` is stored
    in `interactions.detail` for webhook correlation.
- **From/replyTo**: `from = { email: senderProfile.email, name: senderProfile.name }`,
  `replyTo = senderProfile.email` — replies route back to the human inbox we
  poll in §5.

### LinkedIn (HeyReach)

LinkedIn sending is **only implemented in the legacy edge function path**:

- `supabase/functions/send-message/index.ts:30-47` — `POST https://api.heyreach.io/api/v1/messages/send`
  with `X-API-KEY` header, `accountId`, `linkedinUrl`, `message`.
  Account ID comes from `sender_profile.heyreach_account_id`.
- The Next.js `/api/sequences/send` route only handles email. There is no LinkedIn
  branch in the new pipeline. The `interaction_type = 'cold_linkedin'` interaction
  records exist but currently nothing dispatches them via Next.js.
- The legacy edge function reads the older `messages` table and is invoked
  from `/api/messages/send` (`app/api/messages/send/route.ts:25-28`).

> **Note: brief mentions "Unipile" — the codebase uses HeyReach instead.**
> No Unipile references found.

### Twitter

`supabase/functions/send-message/index.ts:130-138` marks Twitter messages as
`approved` and bails out — **manual send required**. There is no Twitter API
integration.

### Scheduling vs immediate

- **Generate-time (both modes)**: `scheduled_at` is computed per step by
  `computeStepScheduledAt` (`lib/sequences/schedule.ts`) — cumulative
  `delay_days` (or `anchor_date ± delay`), clamped to ≥ now, snapped into the
  `send_window`. Auto rows are inserted `scheduled`; approval rows are inserted
  `draft` but **carry the same planned `scheduled_at`** so the queue shows when
  each step is due.
- `send_mode='approval'`: Approve **preserves** that planned `scheduled_at` when
  it's in the future (later steps keep their drip delay), else `now()`. Reschedule
  sets a custom timestamp. See `buildUpdate` in
  `lib/sequences/message-transitions.ts` (per-message PATCH) and the bulk route,
  which backfills only rows that have no planned time.

### Idempotency / dedup

- **Generate-side**: for each step, the route checks for an existing interaction
  at `(sequence_id, person_id, sequence_step)` and skips if present. This is the
  primary idempotency guarantee and makes re-running generation safe.
- **Send-side**: the atomic claim RPC (`claim_due_interactions`, migration 028)
  flips `scheduled → sending` via `FOR UPDATE SKIP LOCKED` in a single statement
  — overlapping invocations claim disjoint sets, no double-send. The
  complementary `reclaim_stuck_interactions` RPC reverts rows stranded in
  `sending` (10-minute threshold) so a crashed handler doesn't strand work.
- **Webhook-side**: `STATUS_PRIORITY` map prevents downgrades.

---

## 4a. Interaction sources (`detail.source`)

Every outbound `interactions` row carries a `detail.source` indicating how it
got there:

- `sequence` — created by the approval pipeline (`app/api/sequences/send`).
- `script_send` — created inline by `scripts/send-outreach.ts` on successful SendGrid send.
- `script_backfill` — created by `scripts/backfill_script_sends.ts` from the
  three historical `consensus/*.jsonl` logs.
- `sent_folder_reconciler` — created by `lib/inbox-sync.ts` when an outbound
  email shows up in the Fastmail Sent mailbox without a matching DB row
  (catches manual sends from the Fastmail web UI).

Idempotency: `interactions ((detail->>'sendgrid_message_id'))` is a partial
unique index. Anything routed through SendGrid populates this and cannot be
double-inserted. Sent-folder reconciler rows have no message-id (they came
from JMAP) and are deduplicated by ±2-min + normalized subject.

---

## 5. Inbox Sync

### Provider

Fastmail via JMAP (`lib/fastmail.ts`). The two monitored mailboxes are
hardcoded as `jb@gofpblock.com` and `wes@gofpblock.com`
(`app/api/inbox/route.ts:6`, also seeded into `inbox_sync_state` by
`migration 007:57-59`).

### Cron schedule

Two options exist:

**A) pg_cron — `supabase/migrations/016_inbox_sync_cron.sql`** (currently active)

```
sync-inbox-jb  : */15 * * * *      → POST /api/inbox/sync { accountEmail: jb@... }
sync-inbox-wes : 1-59/15 * * * *   → POST /api/inbox/sync { accountEmail: wes@... }
```

Staggered by 1 minute to avoid concurrent JMAP requests against Fastmail.
Migration warns the URL must be hand-edited from the placeholder
`https://YOUR_APP_URL` before running (line 4-7).

**B) Vercel Cron — `app/api/cron/inbox-sync/route.ts`** (alternative; not currently in `vercel.json`)

Single GET endpoint loops both accounts in one pass. Gated by
`Authorization: Bearer $CRON_SECRET` — Vercel injects the header automatically
when the path is declared in `vercel.json:crons`. To use, add:
`{ "path": "/api/cron/inbox-sync", "schedule": "*/5 * * * *" }`. If switching
to this, retire the pg_cron jobs in 016 to avoid double-pulling.

### Fetch + dedup — `app/api/inbox/sync/route.ts`

1. Reads `inbox_sync_state.last_email_id` for cursor (line 47-50).
2. `fetchEmails()` does JMAP `Mailbox/query` for inbox role,
   `Email/query` (sorted by `receivedAt` desc), and `Email/get` for headers,
   body, keywords (`lib/fastmail.ts:107-194`). When `sinceEmailId` is provided,
   uses `anchor` + `anchorOffset` and client-side filters out the anchor and
   anything older (line 187-193).
3. **Dedup**: `inbound_emails.message_id` has a UNIQUE constraint
   (migration 007:65). The route also pre-checks via SELECT
   (`sync/route.ts:62-70`) before inserting — pure belt-and-suspenders.
4. On insert, `correlateAndNotify(supabase, inserted)` runs (line 85).
5. Updates `inbox_sync_state.last_email_id` to the newest message_id and
   `unread_count` from the latest fetch.

### Webhook vs poll

Pure pull — no Fastmail webhook. JMAP push exists in spec but is not wired up.

### Auth quirk

`/api/inbox/sync` uses the **service-role** client
(`createClient` from `@supabase/supabase-js` with `NEXT_SUPABASE_SECRET_KEY`,
line 36-42) because it's invoked by pg_cron with no user session. Contrast with
`/api/inbox` GET which uses the standard server client.

### Correlation logic — `lib/inbox-correlator.ts:50-143`

```
correlateEmail(supabase, inboundEmail):
  1. Exact: ilike persons.email = from_address
     → processCorrelation(person, 'exact_email')
  2. Domain: extract from_address domain, normalize organizations.website domain,
     scan for match. If org has a person_organizations row → resolve a person.
     If org has no person → record domain_match with no person.
     → processCorrelation(person, 'domain_match', org)
  3. None → log 'no_match'

processCorrelation:
  • Find most recent OUTBOUND email interaction in
    status ∈ (sent, delivered, opened) for that person.
  • If found: set its status to 'replied', stash its id as
    inbound_emails.correlated_interaction_id.
  • Update inbound_emails.person_id, correlation_type.
  • job_log row ('matched' / 'no_match').

correlateAndNotify (wrapper, line 261-283):
  • runs correlateEmail
  • if person matched, sends Telegram ping via formatReplyNotification
    (subject + 100-char preview + /admin/contacts/{id} link)
```

### Manual link

`POST /api/inbox` with `{ emailId, personId }` allows a human to override
correlation, setting `correlation_type='manual'`
(`app/api/inbox/route.ts:188-200`). `mark_read` action on the same endpoint
flips `is_read=true` (line 154-167).

---

## 6. Webhooks

### SendGrid Event Webhook — `app/api/webhooks/sendgrid/route.ts`

Configure SendGrid Event Webhook to POST a JSON array (or single object) to
this route.

#### Event mapping (`mapSendGridEvent`, line 19-34)

| SendGrid event | Internal status |
| -------------- | --------------- |
| `delivered`    | `delivered`     |
| `open`         | `opened`        |
| `click`        | `clicked`       |
| `bounce`       | `bounced`       |
| `dropped`      | `bounced`       |
| `spam_report`  | `bounced`       |
| (anything else)| ignored         |

#### Lookup

- Strips the `.filterXXX` suffix that SendGrid appends to `sg_message_id`
  (line 69) — we store the base ID at send time.
- Filters `interactions` by JSONB path:
  `.filter("detail->>sendgrid_message_id", "eq", sgMessageId)`
  (line 80-82).

#### Status priority

`STATUS_PRIORITY` (line 6-15) prevents regressions. Terminal `bounced` always
wins. Non-terminal updates are gated by `newPriority > currentPriority`
(line 98-108).

#### Always-200 (post-verification)

After signature verification passes, the route returns `200` even on
per-event errors so SendGrid does not retry-storm. Failures are logged.
A failed signature, however, returns `401` so SendGrid retries (giving you
a chance to fix the public key).

#### Verification

`@sendgrid/eventwebhook` v8 is used. The route reads the raw body via
`request.text()` (so the signature bytes match), then calls
`EventWebhook.verifySignature(publicKey, payload, signature, timestamp)`
where `publicKey = ew.convertPublicKeyToECDSA(SENDGRID_WEBHOOK_PUBLIC_KEY)`.
A ±300s timestamp freshness check is layered on top. Failures return 401 —
no state mutations happen unless verification passes. `SENDGRID_WEBHOOK_PUBLIC_KEY`
must be set (PEM, from SendGrid Mail Settings → Signed Event Webhook). If the
env var is unset the route returns 401 immediately.

#### Bounce categorization

- **Hard** (`type==='bounce'` or reason `^5\d{2}` or status `^5\.`): terminal
  → status `bounced`, enrollment bounced, `persons.email_bounced_at` stamped.
- **Soft** (`type==='blocked'` or `^4\d{2}` / `^4\.`): non-terminal → status
  `failed`, retry path remains.
- **Dropped** / **spam_report**: treated as hard.

`bounce_category`, `bounce_reason`, `bounce_type` are written to
`interactions.detail`.

#### Stop-on-reply / stop-on-click

When a `reply`/`inbound_email`/`click` event arrives, the route loads the
person's active enrollments and pauses any whose parent sequence has
`schedule_config.stop_on_reply` (or `stop_on_click`) set. Sequences without
the flag are unaffected.

### Fastmail webhook

None. Polling only (§5).

### HeyReach webhook

None. Status sync was intended via `supabase/functions/sync-status/index.ts` —
but the LinkedIn arm is a TODO at line 69 of that file. Email status sync
in the same edge function uses the SendGrid Activity API
(`https://api.sendgrid.com/v3/messages?query=...`) and is registered as
cron `sync-status` at `:30` past every hour
(`supabase/migrations/004_cron.sql:30-43`).

---

## 7. Key DB Tables Reference

### `sequences` — definition

| Column            | Notes                                                     |
| ----------------- | --------------------------------------------------------- |
| `id`              | uuid, pk                                                  |
| `name`, `channel` | channel ∈ {'email','linkedin','twitter'}                  |
| `event_id`        | optional FK to `events`                                   |
| `steps`           | JSONB array of `SequenceStep`                             |
| `status`          | draft / active / paused / completed (added in 008)        |
| `send_mode`       | 'auto' or 'approval' (added in 023)                       |
| `sender_id`       | FK to `sender_profiles` (added in 023)                    |
| `schedule_config` | JSONB `SequenceSchedule` (added in 023)                   |

### `sequence_enrollments`

| Column        | Notes                                              |
| ------------- | -------------------------------------------------- |
| `sequence_id` | FK ON DELETE CASCADE (007:14)                      |
| `person_id`   | FK ON DELETE CASCADE (renamed from contact_id 010:222) |
| `current_step`| int, 0-based cursor                                |
| `status`      | 'active','paused','completed','bounced'           |
| `enrolled_at` | timestamptz                                        |
| `UNIQUE (sequence_id, person_id)` (007:19)                       |

### `interactions` — every send

Generic table beyond just sequences. Sequence-specific columns:
`sequence_id`, `sequence_step`, `interaction_type`, `channel`, `direction`,
`status`, `scheduled_at`, `occurred_at`, `subject`, `body`, `detail` JSONB.
See `lib/types/database.ts:149-170`. FK to `sequences` added in 010:237.

### `inbound_emails`

| Column                       | Notes                                                                  |
| ---------------------------- | ---------------------------------------------------------------------- |
| `account_email`              | which mailbox saw it                                                   |
| `message_id`                 | JMAP email id, **UNIQUE** (007:65)                                     |
| `from_address`, `from_name`  | sender                                                                 |
| `subject`, `body_preview`, `body_html` | self-explanatory                                              |
| `received_at`                | from JMAP `receivedAt`                                                 |
| `is_read`                    | derived from JMAP `keywords['$seen']`                                  |
| `person_id`                  | FK to persons (renamed from contact_id 010:227)                        |
| `correlated_interaction_id`  | FK to interactions (renamed from correlated_message_id 010:230)        |
| `correlation_type`           | 'exact_email' \| 'domain_match' \| 'manual' \| 'none'                  |
| `raw_headers`                | JSONB; only `In-Reply-To` and `References` are extracted (`fastmail.ts:200-205`) |

### `inbox_sync_state`

One row per mailbox, keyed by `account_email` UNIQUE. Tracks
`last_email_id`, `last_sync_at`, `unread_count`, `status`, `error_message`.

### `sender_profiles`

`SenderProfile` (`lib/types/database.ts:218-226`):
`{ id, name, email, heyreach_account_id, signature, tone_notes, created_at }`.

### Views / RPCs

- `message_status_counts()` (007:86-89) — aggregate over the deprecated
  `messages` table, **not** `interactions`. Likely stale.

---

## 8. Operational Runbook

### Trigger generation manually

```bash
# All active enrollments in all active sequences
curl -X POST $APP_URL/api/sequences/generate

# Just one sequence
curl -X POST $APP_URL/api/sequences/generate -H 'Content-Type: application/json' \
  -d '{"sequenceId":"<uuid>"}'

# One step within one sequence
curl -X POST $APP_URL/api/sequences/generate -H 'Content-Type: application/json' \
  -d '{"sequenceId":"<uuid>","step":1}'
```

### Trigger send manually

```bash
curl -X POST $APP_URL/api/sequences/send
```

### Trigger inbox sync manually

```bash
curl -X POST $APP_URL/api/inbox/sync \
  -H 'Content-Type: application/json' \
  -d '{"accountEmail":"jb@gofpblock.com"}'
```

### Debug a stuck enrollment

1. Look at `sequence_enrollments`:
   ```sql
   SELECT id, current_step, status, enrolled_at
   FROM sequence_enrollments WHERE id = '<id>';
   ```
2. Confirm parent sequence is `active`:
   ```sql
   SELECT status, send_mode, schedule_config FROM sequences WHERE id = '<seq_id>';
   ```
   `/api/sequences/generate` requires both `enrollment.status='active'` AND
   `sequence.status='active'` (see line 159-160).
3. Check whether an interaction already exists for this step:
   ```sql
   SELECT id, status, scheduled_at, occurred_at, detail
   FROM interactions
   WHERE sequence_id = '<seq_id>' AND person_id = '<person_id>'
   ORDER BY sequence_step;
   ```
   The generate route is idempotent on `(sequence, person, step)`; a row that
   already exists is never regenerated.
4. Check timing — each row's `scheduled_at` is computed at generate-time by
   `computeStepScheduledAt` (`lib/sequences/schedule.ts`): for `relative`/`window`
   mode it is `enrolled_at + sum(delay_days[0..stepIndex]) * 1 day`; for `anchor`
   mode it is `anchor_date ± delay_days[stepIndex]`. The value is then clamped to
   ≥ now and snapped into the `send_window`. A future `scheduled_at` is the
   expected reason a generated row hasn't sent yet.

### Replay a sequence step

If an interaction was created but failed (e.g. AI hiccup):

```sql
DELETE FROM interactions
WHERE sequence_id = '<seq_id>' AND person_id = '<pid>' AND sequence_step = N;

UPDATE sequence_enrollments
SET current_step = N, status = 'active'
WHERE id = '<enrollment_id>';
```

Then re-run `/api/sequences/generate`. Generation is idempotent so this is safe.

### Manually advance an enrollment past a problem step

```sql
UPDATE sequence_enrollments
SET current_step = current_step + 1
WHERE id = '<enrollment_id>';
```

### Pause / resume a sequence

```sql
UPDATE sequences SET status='paused' WHERE id='<id>';     -- stops generate
UPDATE sequences SET status='active' WHERE id='<id>';     -- resumes
```

`/admin/sequences/[id]` has buttons that wrap
`updateSequenceStatus` in `app/admin/sequences/actions.ts:49-57`.

### Replay a failed send

`PATCH /api/sequences/[id]/messages/[msgId]` with `{ action: 'resend' }`
re-sets `status='scheduled'` and `scheduled_at=now()`
(`app/api/sequences/[id]/messages/[msgId]/route.ts:50-55`).

For bulk: `POST /api/sequences/[id]/messages/bulk` with
`{ action: 'approve', messageIds: [...] }`.

### Triage failed sends across sequences

`/admin/sequences/failures` lists every `failed` / `bounced` interaction
(up to 500 most recent), with filters by status, free-text search across
person / sequence / error, and per-row + bulk **Requeue** that resets
`status='scheduled'`, `retry_count=0`, `scheduled_at=now()`. Only `failed`
and `bounced` rows are eligible — the server action enforces this.
Human-rejected drafts now carry the dedicated `rejected` status, so they no
longer appear here (or in the per-sequence message queue's Failed tab) — they
live under the queue's **Rejected** tab instead.

Telegram notifications from the send dispatcher (`maybeNotify` at the end
of `/api/sequences/send`) deep-link to this page when terminal failures
or stuck-row sweeps occur in a run.

### Recover stuck `sending` rows manually

The send-route sweeper handles this automatically every 5 minutes, but to
force-recover immediately:

```sql
SELECT * FROM reclaim_stuck_interactions(0);  -- 0min threshold = sweep everything in 'sending'
```

Returns the reverted rows. Each one has `detail.last_error='sweeper: stuck in sending state'`
and `detail.last_sweep_at` set.

### Force-mark replied (false negative correlation)

```sql
UPDATE inbound_emails
SET person_id = '<pid>', correlation_type = 'manual'
WHERE id = '<inbound_email_id>';
-- and the matching outbound:
UPDATE interactions SET status = 'replied'
WHERE id = '<interaction_id>';
```

Or via UI: the `link to person` modal on the inbox view calls
`POST /api/inbox` with `{ emailId, personId }`.

### Inspect SendGrid webhook activity

The webhook always logs `[sendgrid-webhook]` lines — grep deployment logs.
Key lines: `Updated interaction <id>: <old> -> <new>`
(`app/api/webhooks/sendgrid/route.ts:122`).

### Standalone CSV-based send (off-pipeline)

`scripts/send-outreach.ts` is a parallel system that sends from a CSV
(`consensus/outreach_messages.csv` by default), keeps a JSONL log at
`consensus/send_log.jsonl`, and dedupes against prior successes by
`person_id`. Used for the Cannes/Consensus 2026 batch sends. Flags:

- `--dry-run` — no API calls
- `--test-to <email>` — redirect everything to a single inbox
- `--limit N` — first N rows
- `--yes` — required to live-send (line 81-85)
- `--csv <path>` — override input

It does **not** write to `interactions` — it only logs to JSONL. Reply tracking
for these sends relies entirely on Fastmail inbox sync + correlator.

Pacing: 1 send/sec (line 149). Aborts after 3 consecutive failures in the
first 5 sends (line 142-144).

Adjacent prep scripts:
- `scripts/prep-speaker-outreach.ts` — splits speakers into 5 agent input
  shards, classifies sender by C-level → wes vs jb.
- `scripts/prep-employee-outreach.ts` — same but 8 shards for non-speaker
  employees.
- `scripts/merge-outreach-messages.ts` — merges agent JSON outputs into
  `outreach_messages.csv`.
- `scripts/revise-subject-lines.ts` — deterministic subject-line picker
  (hash of person_id) from a curated pool.
- `scripts/chunk-employee-sends.ts` — splits into `send_day_1.csv` …
  `send_day_5.csv` based on cohort schedule.

---

## 9. Anti-Patterns / Gotchas

### Two parallel pipelines (legacy vs current)

The repo carries **two** message systems:

| Concept             | Legacy                                 | Current                                 |
| ------------------- | -------------------------------------- | --------------------------------------- |
| Recipient table     | `contacts`                             | `persons`                               |
| Org table           | `companies`                            | `organizations`                         |
| Message table       | `messages`                             | `interactions`                          |
| Sender              | `sender_profiles`                      | `sender_profiles` (same)                |
| Generator           | edge fn `generate-messages` (templated)| Next.js `/api/sequences/generate`       |
| Sender              | edge fn `send-message`                 | Next.js `/api/sequences/send`           |
| Status sync         | edge fn `sync-status`                  | Next.js `/api/webhooks/sendgrid`        |
| Cron                | `004_cron.sql` (hourly)                | `vercel.json` (every 5min)              |

Migrations 010-013 dropped `contacts`/`companies`/`messages` from RLS but the
**edge functions still reference `messages`/`contacts`** — they will error if
invoked in templated mode. Specifically:
`generate-messages/index.ts:81-87, 175-206` SELECTs/INSERTs against
`messages` and `contacts.contact_company.companies`. The Next.js path uses
the new tables.

The `sequences/generate` route invokes `generate-messages` as a **raw-prompt
LLM proxy** only (no `contact_ids`), which works because the edge function's
declared `body` parameters are all optional in the destructure
(`generate-messages/index.ts:42-50`) — but reading the file, the loop at
line 71 iterates `for (const contactId of contact_ids)`, so when
`contact_ids=undefined` the loop body is skipped, the function returns
`{ results: [] }`, and **nothing is generated**. **The current invocation
pattern silently returns empty results.**

`sequences/generate/route.ts:326-327` extracts `aiResult.body ?? aiResult.text`
which resolves to `undefined`, then `String(undefined) = "undefined"` — so
AI blocks today render as the literal string "undefined" rather than failing.
This is a real bug to flag.

### Concurrency races

- `/api/sequences/send` — **resolved as of migration 028**. The claim is now an
  atomic `UPDATE ... FROM (SELECT ... FOR UPDATE SKIP LOCKED) RETURNING *` via
  the `claim_due_interactions` RPC, and a sweeper (`reclaim_stuck_interactions`,
  10-min threshold) reverts any row left stranded in `sending`. Overlapping
  cron invocations claim disjoint sets.
- `/api/sequences/generate` — still uses the older "check then insert" pattern,
  now per step inside the pre-generation loop. The optimistic existence check
  before insert is not transactional with the subsequent insert — two concurrent
  generate jobs could both pass the check. Lower-impact than the send race (worst
  case: a duplicate `draft` interaction; the unique constraint can be added or
  generate can be moved
  behind a claim RPC similar to send).

### `bounced` cascade — historical note

Originally a hard bounce only marked the per-sequence enrollment, not the
person. Since migration 026 added `persons.email_bounced_at`, the webhook
also stamps the person row, and `schedule_config.exclude_bounced` reads it at
enroll time. There is still no `do_not_contact` *flag* — the column is the
signal. UIs that compose new enrollments without going through the standard
actions (`enrollPersons` / `enrollFromEvent` / `enrollFromSegment` /
`enrollFromList`) will bypass the guard. `enrollFromList` delegates to
`enrollPersons`, so it inherits the guard for free.

### `replied` only catches the most recent outbound

`inbox-correlator.ts:156-165` — the `.order('occurred_at',
desc).limit(1).single()` means a reply 6 weeks after sending step 1, when
step 4 has since gone out, marks step 4 as replied even if the user is
replying to step 1. Acceptable for top-line reply rate stats; not for
attribution.

### Stale `messages` references

- `message_status_counts()` SQL function (007:86) operates on the dropped
  `messages` table (since 013). Calling it post-migration fails or returns
  empty.
- `Message` legacy types may still surface in admin components — check
  before reusing.

### Hardcoded mailboxes

`app/api/inbox/route.ts:6` and migrations 007/016 hardcode
`jb@gofpblock.com` + `wes@gofpblock.com`. To add a third mailbox you must:
1. Insert into `inbox_sync_state` manually.
2. Add another `cron.schedule` in 016.
3. Append to `ACCOUNTS` constant.

### `scripts/send-outreach.ts` bypasses interactions

CSV sends emit a JSONL log, no `interactions` row. Reporting dashboards that
read `interactions` will under-count. Replies still get correlated (via
inbound_emails → persons) but there is no outbound row for the reply to
update from `sent → replied`, so `correlated_interaction_id` remains NULL
for those threads.

### `STATUS_PRIORITY` doesn't handle `failed`/`bounced` together

Both are terminal but `STATUS_PRIORITY` doesn't list them. A late `delivered`
event after a `bounced` is correctly ignored by the terminal-set check
(line 17, 96), but a late `bounced` after `failed` *would* update — which is
probably fine, but worth noting.

### `current_step >= steps.length` already at enrollment

If a sequence is edited to remove steps, an existing enrollment may have
`current_step` past the array. The generate route handles this by marking
`completed`, but no notification is sent.

### Enrollment `completed` now means "fully generated", not "fully sent"

Because generation pre-creates every step's row in one pass, the route sets the
enrollment to `current_step = steps.length` / `status='completed'` immediately
after generating — **while the messages may still be `draft`/`scheduled` and
unsent**. Consequence: the sequence detail page's Active/Completed enrollment
counts flip to Completed as soon as generation runs, not when sends finish. The
**message queue is the source of truth for actual send progress.** A enrollment
that is `completed` with steps added *later* won't be reconsidered (the generate
query filters `status='active'`); re-activate it manually to pick up new steps.
If completion should track sends instead, drive it from the send worker — see
the design discussion in the change that introduced pre-generation.

---

## Cross-References

- API mechanics: covered separately by the API doc agent.
- Database schema: see `docs/database.md`.
- Edge functions list: see `docs/edge-functions.md`.
- Admin UI conventions: see project memory
  `project_admin_ui_conventions.md`.
