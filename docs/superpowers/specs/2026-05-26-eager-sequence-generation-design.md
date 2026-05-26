# Eager Sequence-Message Generation

**Date:** 2026-05-26
**Status:** Approved — ready for implementation plan

## Problem

Creating/enabling a sequence does not produce its messages. Activation only flips
`sequences.status` to `active`; the actual `interaction` rows are pre-created by the
`/api/sequences/generate` cron, which runs every 5 minutes. So after activating, a
user waits up to 5 minutes before any message appears on the message-queue page.

The cron-as-trigger is the wrong model for *creation*. Sending should stay
cron-driven (a drip is inherently time-gated), but generation should be eager:
activating — or enrolling into an already-active sequence — should immediately
produce the full set of messages, which the send cron then dispatches per each
row's `scheduled_at`.

## Key existing facts this design leans on

- Generation already pre-creates **one `interaction` row per (enrollment × step)**
  up front; the drip cadence lives in each row's `scheduled_at`, not in *when* the
  row is created. The send worker only dispatches rows whose `scheduled_at <= now`.
- Generation is **idempotent**: it skips a step that already has a row (currently a
  racy check-then-insert).
- `runGenerate` marks each enrollment `status='completed'` once all its step rows
  exist. So "generation done for this enrollment" is already a relational fact.
- The message-queue page (`useSequenceMessages`) already polls every 12s.
- Next.js 16.1.7 → stable `after()` from `next/server`.

## Approach (chosen)

**Background drain + cron backstop.** Trigger the existing generation logic eagerly,
run it concurrently in its own 300s invocation, stream rows into the queue via the
existing poll, and keep the cron purely as a backstop. No new job table, no
self-chaining, no bot notifications (YAGNI). Progress is derived from relational
data, not JSONB counters.

## Components

### 1. Extract `runGenerate` into `lib/sequences/generate.ts`

Move the generation logic (currently inside `app/api/sequences/generate/route.ts`)
into a lib module:

```ts
runGenerate(supabase, { sequenceId?, stepFilter?, concurrency? }): Promise<GenerateResult>
// GenerateResult = { generated, failed, skipped, errors }
```

The route retains its thin GET (cron) / POST (scoped + async) wrappers: auth via
`CRON_SECRET`, build the service-role client, call `runGenerate`. The
`serviceClient()` helper moves alongside the lib. Pure extraction — behavior
unchanged except for items 2–4 below.

### 2. Concurrency + budget

Today enrollments, and the AI blocks within each step, run fully serially. Process
enrollments in parallel chunks using the chunked-`Promise.all` `concurrency` pattern
already used by `runBatchEnrichment` (default concurrency ~5). Raise the route's
`maxDuration` from 60 → **300**. A few hundred enrollments × AI steps then drains
within a single invocation; overflow falls to the cron backstop on the next tick.

### 3. Eager trigger

New server helper:

```ts
triggerSequenceGeneration(sequenceId: string): Promise<void>
```

It issues an **async-mode** POST to `/api/sequences/generate` (carrying
`CRON_SECRET`). In async mode the route authorizes, returns **202 immediately**, and
runs `runGenerate(serviceClient(), { sequenceId })` inside `after()` — so generation
executes in its own invocation with the full 300s budget while the caller returns
instantly.

Wired into (`app/admin/sequences/actions.ts`):

- **`updateSequenceStatus`** — fire when transitioning *to* `active`
  (draft→active and paused→active). No fire on →paused / →draft.
- **`enrollPersons`, `enrollFromList`, `enrollFromSegment`, `enrollFromEvent`** —
  after the enrollment upsert succeeds, fire **only if the target sequence is
  currently `active`**. Enrolling into a `draft` sequence does nothing; generation
  waits for activation. (Note: `enrollFromList` / `enrollFromSegment` already call
  `enrollPersons`; trigger from the shared path to avoid double-firing.)

The Vercel cron (`*/5 * * * *`, GET) is unchanged and becomes a pure backstop for
overflow and for any trigger that failed to fire.

### 4. Idempotency guard — migration 037

There is currently **no** unique constraint on
`interactions(sequence_id, person_id, sequence_step)`; the skip-existing check is
check-then-insert and is racy under concurrent eager + cron runs.

- Add a **partial unique index** on
  `interactions(sequence_id, person_id, sequence_step)` where all three are
  non-null.
- Switch the step insert to
  `upsert(row, { onConflict: 'sequence_id,person_id,sequence_step', ignoreDuplicates: true })`,
  making overlapping runs collision-proof at the DB level rather than via the
  in-app pre-check.
- Follow the repo migration convention; include a `.verify.sql` if that pattern is
  in use for the surrounding migrations.

Edge case: pre-existing duplicate rows would block the unique index. The index is
new on a table whose rows were created by the same skip-existing logic, so
duplicates are not expected; the migration should still surface a clear error if
any exist rather than silently proceeding.

### 5. Progress UX — relational, not JSONB

`runGenerate` flips each enrollment to `status='completed'` once all its step rows
exist, so generation progress is simply **active vs completed** enrollments. No new
counters, no JSONB — consistent with the enrichment-data-truth principle.

On the message-queue page (`app/admin/sequences/[id]/messages/...`), show a
lightweight banner — **"Generating messages… N enrollments remaining"** — whenever
the sequence is `active` and at least one of its enrollments is still `status='active'`.
The existing 12s poll streams newly-created rows in and clears the banner once no
active enrollments remain. The detail query already returns enrollment statuses; a
small count (active enrollments for the sequence) is the only datum the queue page
needs — reuse the detail query or add a minimal count query.

## Data flow

```
Activate (or enroll into active)
   └─ server action: updateSequenceStatus / enroll*
        └─ triggerSequenceGeneration(sequenceId)
             └─ POST /api/sequences/generate (async mode)  ── returns 202 ──▶ action returns, UI responsive
                  └─ after(): runGenerate(serviceClient, { sequenceId })   [own 300s invocation, concurrency ~5]
                       └─ inserts interaction rows (upsert, idempotent), flips enrollments → completed
   ▼
Message-queue page polls every 12s
   └─ streams rows in; banner "Generating… N remaining" until no active enrollments
   ▼
Send cron (*/5, unchanged) dispatches rows whose scheduled_at <= now
Generate cron (*/5, unchanged) = pure backstop for overflow / missed triggers
```

## Error handling

- Async-mode route returns 202 before work starts; failures inside `after()` are
  logged in `runGenerate`'s `errors[]` and, per existing behavior, a `failed`
  interaction row is recorded for the offending step. The cron backstop retries
  ungenerated steps on the next tick (idempotent).
- A failed `triggerSequenceGeneration` fetch (network/202 not received) is
  swallowed by the action (does not block activation/enrollment); the cron backstop
  still generates within 5 minutes.
- Overlapping eager + cron runs cannot create duplicates (migration 037).

## Testing

- **Extracted `runGenerate`** (alongside existing `schedule.test.ts`):
  idempotency (second run inserts nothing), concurrency batching, `stepFilter`
  scoping, enrollment → `completed` transition.
- **Trigger wiring:** activate fires `triggerSequenceGeneration`; enroll-into-active
  fires it; enroll-into-draft does **not**.
- **Manual:** activate an AI-step sequence with a sizable list; confirm the queue
  streams in with the "N enrollments remaining" banner and that it clears when done.

## Out of scope (YAGNI)

- New `job_log`/jobs table for generation.
- Self-chaining route for >300s lists (cron backstop covers it).
- Bot notifications / job-history drawer for generation.
- Any change to the send path or the drip cadence.
