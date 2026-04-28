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
| `events`, `initiatives`| Optional sequence parents (provide context tokens like `{event.name}`). |

### Sequence shape — `lib/types/database.ts:300-313`

```ts
interface Sequence {
  id: string;
  name: string;
  channel: string;            // 'email' | 'linkedin' | 'twitter'
  event_id: string | null;
  initiative_id: string | null;
  steps: SequenceStep[];
  status: 'draft' | 'active' | 'paused' | 'completed';
  send_mode: 'auto' | 'approval';   // approval requires human action; auto schedules immediately
  sender_id: string | null;
  schedule_config: SequenceSchedule;
  created_at: string;
  updated_at: string;
}
```

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
  `app/api/sequences/generate/route.ts:41-95` walks forward up to 7 days to find
  a valid slot.
- `anchor` — schedule relative to `anchor_date` with `before` or `after`
  direction (e.g. T-7 days before an event).

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
  derived from channel via `app/api/sequences/execute/route.ts:34-38`.
- `direction = 'outbound'`
- `status ∈ InteractionStatus` (10 values; see below)
- `sequence_id`, `sequence_step` for traceability
- `detail` JSONB for vendor metadata (`sendgrid_message_id`, `retry_count`,
  `last_error`, `ai_blocks_used`, `generated_at`)

### Status state machine — `lib/types/database.ts:10`

```
draft → scheduled → sending → sent → delivered → opened → clicked → replied
                            ↘
                              failed (terminal)
                              bounced (terminal — also bounces enrollment)
```

Priority ordering is encoded in
`app/api/webhooks/sendgrid/route.ts:6-15` so SendGrid webhooks never downgrade
(e.g. an `open` after `replied` is dropped).

`bounced` is the only auto-cascading terminal: webhook handler updates
the enrollment to `bounced` so future steps are skipped
(`app/api/webhooks/sendgrid/route.ts:124-145`).

### Send mode — `Sequence.send_mode`

- `approval` — `generate` writes interactions with `status='draft'`. A human
  approves via `/api/messages/actions` (`approve` → `scheduled`) or the
  per-sequence `/api/sequences/[id]/messages/bulk` endpoint.
- `auto` — `generate` computes `scheduled_at` from
  `nextSendWindowTime(schedule)` and writes `status='scheduled'` directly.

---

## 2. Lifecycle

```
[Sequence Creation]                  app/admin/sequences/actions.ts:26  createSequence
        ↓
[Add steps in admin UI]              actions.ts:8                     updateSequenceSteps
        ↓
[Set status='active']                actions.ts:49                    updateSequenceStatus
        ↓
[Enroll persons]                     actions.ts:59 enrollPersons
                                     actions.ts:77 enrollFromEvent (uses getPersonIdsForEvent)
                                     ↳ status='active', current_step=0
        ↓
[Cron: /api/sequences/generate]      app/api/sequences/generate/route.ts (POST)
   per active enrollment in active sequence:
     • already past last step? → mark completed, skip
     • interaction already exists for (sequence, person, step)? → skip (idempotency)
     • not yet due (per timing_mode)? → skip
     • render templates: AI blocks via supabase.functions.invoke('generate-messages'),
       then text substitution via lib/template-renderer.ts
     • insert interaction:
         status = 'scheduled' (if auto) | 'draft' (if approval)
         scheduled_at = nextSendWindowTime() (if auto) | null
     • increment enrollment.current_step
        ↓
[(Approval mode only) human approves]  /api/messages/actions   (action='approve')
                                       /api/sequences/[id]/messages/bulk
                                       /api/sequences/[id]/messages/[msgId] (PATCH)
        ↓
[Cron: /api/sequences/send]            vercel.json:3 — */5 * * * *
   query interactions where status='scheduled' AND scheduled_at <= now() LIMIT 50
   for each:
     • mark 'sending'
     • call SendGrid via lib/sendgrid.ts
     • on success → 'sent', detail.sendgrid_message_id captured
     • on failure → exponential backoff via retry_count*5min, max 3 retries → 'failed'
        ↓
[SendGrid webhook]                     app/api/webhooks/sendgrid/route.ts
   delivered/open/click/bounce/dropped/spam_report → status update
   bounce → enrollment.status='bounced'
        ↓
[Cron: pg_cron → /api/inbox/sync]      supabase/migrations/016_inbox_sync_cron.sql
   every 15min per account (jb@, wes@gofpblock.com — staggered by 1min)
   Fastmail JMAP fetch → inbound_emails dedup by message_id
   correlateAndNotify():
     1. exact email match (persons.email)
     2. domain match (organizations.website)
     3. on match: most recent outbound interaction → status='replied', Telegram ping
```

The `sequences/execute` route (`app/api/sequences/execute/route.ts`) is the
**legacy** fast path — it does pure template substitution with `{first_name}`,
`{full_name}`, `{company_name}` placeholders and creates `draft` interactions
without AI. It is preserved alongside the AI-aware `generate` route as a
fallback (see `execute/route.ts:146-148` comment).

---

## 3. Message Generation Pipeline

### Two coexisting generators

#### A. Sequence-driven (current) — `app/api/sequences/generate/route.ts`

Per active enrollment:

1. Fetch person + sequence + steps (joined select at line 152-160).
2. Resolve primary org via `person_organizations` (`is_primary=true`)
   — line 232-243.
3. Resolve event + sender_profile if FKs are set — lines 246-265.
4. Build `TemplateContext` with `buildContext(person, org, event, sender)`
   from `lib/template-renderer.ts:84-121`. Exposes namespaces
   `person.*`, `org.*`, `event.*`, `sender.*` (each whitelisted).
5. **Extract AI blocks** from subject_template and body_template
   (`extractAiBlocks`, `lib/template-renderer.ts:59-79`). Variable interpolation
   is done at extraction time so the prompt the LLM receives already has
   `{person.first_name}` etc. resolved.
6. **Generate** each AI block by invoking the Supabase Edge Function
   `generate-messages` (`generate/route.ts:289-358`). The body is
   `{ system_prompt: aiBlock.tone || default, user_prompt: aiBlock.prompt }`
   — i.e. ad-hoc raw prompts, not the templated path described below.
7. Render the template with AI results filled in
   (`renderTemplate`, `lib/template-renderer.ts:32-53`); unresolved
   AI blocks become `[AI_BLOCK_PENDING]`.
8. Insert into `interactions` with `status='scheduled'` (auto) or
   `'draft'` (approval). On AI failure, insert a `failed` interaction with
   `detail.error` and skip enrollment advance.
9. Advance `enrollment.current_step` (and complete if last).

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

- **Library**: `lib/sendgrid.ts:15-62` — wraps `POST /v3/mail/send`. Returns
  `{ success, messageId, error }`. `messageId` comes from the
  `x-message-id` response header (line 43); this is the base ID that SendGrid
  webhooks later report as `sg_message_id`.
- **Cron**: `vercel.json:3` schedules `/api/sequences/send` every 5 minutes.
- **Send loop**: `app/api/sequences/send/route.ts`
  - Pulls up to 50 interactions where `status='scheduled' AND scheduled_at <= now()`.
  - Resolves sender profile via the `sequences.sender_id` join (lines 36, 53).
  - Skips interactions with no `person.email` (mark `failed`, line 57-69) or
    no sender profile (line 72-85).
  - **Optimistic lock**: marks `sending` before the SendGrid call (line 88-91).
    There is no compare-and-swap, so concurrent invocations *could* double-send
    the same row — the cron interval (5min) and 60s `maxDuration` keep this
    rare in practice.
  - **Retry policy**: on failure increments `detail.retry_count`, computes
    `backoffMs = retry_count * 5 * 60 * 1000` and reschedules. After 3
    retries → `failed` (line 121-151).
  - **Idempotency**: stores `sendgrid_message_id` in `interactions.detail`
    so the webhook can correlate; the route itself does not dedupe at the
    SendGrid level beyond the `sending` status lock.
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

- `send_mode='auto'`: `scheduled_at` set at generate-time via
  `nextSendWindowTime(schedule)` (`generate/route.ts:373`); honors window/timezone.
- `send_mode='approval'`: `scheduled_at` set when user clicks Approve (now()) or
  Reschedule (custom timestamp) via `messages/[msgId]/route.ts:38-55` or
  `messages/bulk/route.ts:44-65`.

### Idempotency / dedup

- **Generate-side**: `generate/route.ts:202-213` checks for an existing
  interaction at `(sequence_id, person_id, sequence_step)` and skips if present.
  This is the primary idempotency guarantee.
- **Send-side**: status transition `scheduled → sending` (line 88-91) before the
  HTTP call. Not transactionally safe but sufficient at low concurrency.
- **Webhook-side**: `STATUS_PRIORITY` map prevents downgrades.

---

## 5. Inbox Sync

### Provider

Fastmail via JMAP (`lib/fastmail.ts`). The two monitored mailboxes are
hardcoded as `jb@gofpblock.com` and `wes@gofpblock.com`
(`app/api/inbox/route.ts:6`, also seeded into `inbox_sync_state` by
`migration 007:57-59`).

### Cron schedule — `supabase/migrations/016_inbox_sync_cron.sql`

```
sync-inbox-jb  : */15 * * * *      → POST /api/inbox/sync { accountEmail: jb@... }
sync-inbox-wes : 1-59/15 * * * *   → POST /api/inbox/sync { accountEmail: wes@... }
```

Staggered by 1 minute to avoid concurrent JMAP requests against Fastmail.
Migration warns the URL must be hand-edited from the placeholder
`https://YOUR_APP_URL` before running (line 4-7).

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

#### Bounce cascade

`bounced` updates the matching enrollment to `status='bounced'` so the
enrollment is dropped from `/api/sequences/generate`'s active filter
(`webhooks/sendgrid/route.ts:124-145`).

#### Always-200

The route returns `200` even on parse errors (line 55) and per-event errors
(line 147-149) so SendGrid does not retry storms. Failures are logged.

#### Verification — known weakness

`lib/sendgrid.ts:65-80` `verifyWebhookSignature` is **not actually called from
the route**, and even when used it only checks the timestamp is within ±300s
— there is no ECDSA signature verification. The file header
(`lib/sendgrid.ts:64`) and route header (`app/api/webhooks/sendgrid/route.ts:1`)
both flag this with WARNING comments. **Add `@sendgrid/eventwebhook` before
production.**

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
| `initiative_id`   | optional FK to `initiatives` (added in 010:217)           |
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
   The generate route is idempotent on `(sequence, person, step)`; if a row
   exists, the enrollment will not advance past that step until that row exists.
4. Check timing — for `relative` mode, due time is
   `enrolled_at + sum(delay_days[0..current_step]) * 1 day`
   (`generate/route.ts:111-117`). For `anchor` mode, see line 119-128.

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

- `/api/sequences/send` and `/api/sequences/generate` both have
  `maxDuration = 60` and run in parallel via cron. There is no `FOR UPDATE
  SKIP LOCKED` — only the `status='sending'` write before SendGrid call
  (`send/route.ts:88-91`) acts as a coarse lock. Risk window for double-send
  is small but nonzero.
- The optimistic check before insert in `sequences/generate` (line 202-213)
  is not transactional with the subsequent insert — two concurrent generate
  jobs could both pass the check.

### Webhook signature verification

`lib/sendgrid.ts:65-80` — placeholder timestamp-only check, **never invoked**.
Any caller that knows the URL can post events. See WARNINGs in
`lib/sendgrid.ts:64` and `app/api/webhooks/sendgrid/route.ts:1`.

### `bounced` cascade is per-sequence

A bounce on one sequence marks the **enrollment** bounced, not the **person**.
The same person enrolled in another sequence will continue to receive sends —
even though the email clearly does not deliver. Consider an extension that
sets `persons.email = NULL` on bounce or a `do_not_contact` flag.

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

### Schedule TZ math

`nextSendWindowTime` (`generate/route.ts:41-95`) uses
`toLocaleString` to read the day-of-week and hour in the configured TZ, then
constructs a JS Date by manipulating local hours. For UTC-relative servers
this is approximate (line 87 comment: "rough approximation"). Don't rely on
exact-minute scheduling.

### `current_step >= steps.length` already at enrollment

If a sequence is edited to remove steps, an existing enrollment may have
`current_step` past the array. The generate route handles this by marking
`completed` (line 186-193), but no notification is sent.

### `sequences/execute` is dead-ish code

It pre-dates `ComposableTemplate` and only handles `string` body templates
(`execute/route.ts:40-58`). With migration 023 converting all templates to
JSONB, `templateToString` extracts only `text` blocks and ignores `ai` blocks
(line 40-47). So invoking `/api/sequences/execute` against a modern sequence
silently produces messages with all AI placeholders dropped. Prefer
`/api/sequences/generate`.

---

## Cross-References

- API mechanics: covered separately by the API doc agent.
- Database schema: see `docs/database.md`.
- Edge functions list: see `docs/edge-functions.md`.
- Admin UI conventions: see project memory
  `project_admin_ui_conventions.md`.
