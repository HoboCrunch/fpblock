# Script-Sends Backfill & Pipeline Sync — Design

**Date:** 2026-05-19
**Status:** Draft for review
**Owner:** Evan

## Problem

`scripts/send-outreach.ts` fires emails via SendGrid and logs only to JSONL files under `consensus/`. The `interactions` table — the source of truth for the pipeline view, dashboard stats, and reply correlation — never learns about those sends. Across three logs, **4,051 live sends to 1,880 unique persons (2026-04-24 → 2026-05-04)** are invisible to the system:

- `consensus/send_log.jsonl` — 894 live sends (initial outreach)
- `consensus/miami_dinner_send_log.jsonl` — 1,846 live sends (Miami Dinner blast)
- `consensus/miami_dinner_bump1_send_log.jsonl` — 1,311 live sends (Bump 1)

Consequences:

1. **Pipeline view** (`app/admin/pipeline/page.tsx`) ranks each person by their most-advanced `interactions.status`. The 1,880 contacted persons all show as `not_contacted`.
2. **Dashboard stats** (`useDashboardStats` → `interaction_status_counts` RPC) undercounts `sent` by ~4k and `replied` by whatever fraction of those recipients has already responded.
3. **Inbox correlator** (`lib/inbox-correlator.ts`) matches inbound replies to a person, then looks for "most recent outbound interaction with status in (sent/delivered/opened)" to flip to `replied`. With no outbound interaction recorded, no flip happens — replies from these recipients never advance the pipeline.
4. **Sent-folder sync** (`fetchSentEmails` in `lib/fastmail.ts`) does pull outbound mail into `inbound_emails` (`direction='outbound'`) for inbox thread display, but it does not touch `interactions`.

## Goals

- Make the `interactions` table reflect every email actually sent by the script runs.
- Make all already-received replies trigger the same pipeline state transition they would have triggered if the sends had been DB-tracked from the start.
- Prevent future script runs and ad-hoc manual sends from desyncing the DB again.
- Surface what's now visible in the dashboard and pipeline view in a way that uses the new ground truth.

## Non-Goals

- Replacing the existing sequences/approval send pipeline. Script-blasts and sequences coexist; backfilled rows are tagged so they can be filtered.
- Reprocessing test-redirect sends (entries where `to_actual !== email`, e.g. routed to `evan@opsprocket.com`). Those did not reach the recipient and must be excluded.
- Building a generic CSV-import-to-interactions tool. Scope is the three specific JSONL logs.
- Changing the existing inbox UI rendering of outbound emails (already handled via `inbound_emails.direction='outbound'`).

## Architecture

Three sequential stages plus two forward-looking guards. All stages are idempotent and safe to re-run.

### Stage 1 — One-time JSONL → `interactions` backfill

Add `scripts/backfill_script_sends.ts`. For each of the three JSONL files:

1. Read line-by-line; keep only entries where `status === "success"`, `dry_run !== true`, and **`to_actual === email`** (drop test-redirects — 12 entries in current data).
2. For each entry, build an `interactions` insert:
   - `person_id`: from log entry
   - `interaction_type`: `'cold_email'` (matches `app/api/sequences/generate/route.ts` conventions)
   - `channel`: `'email'`
   - `direction`: `'outbound'`
   - `status`: `'sent'`
   - `occurred_at`: `ts` from log entry
   - `subject`: from log entry
   - `body`: re-resolved from the matching source CSV by `(person_id, subject)` lookup. Map each log file to its source CSV(s):
     - `consensus/send_log.jsonl` → `consensus/outreach_messages.csv`, `consensus/outreach_messages_employees.csv` (Consensus pre-event campaign — subjects like `"Mike, ahead of your Consensus week"`)
     - `consensus/miami_dinner_send_log.jsonl` → `email-napalm.csv`, `email-napalm-q1q2.csv`, `email-napalm-q3.csv`, `email-napalm-q4-half.csv`, `email-napalm-no-replies.csv` (initial Miami Dinner blast — subjects start with `"Invite For …"`)
     - `consensus/miami_dinner_bump1_send_log.jsonl` → `email-napalm-bump1.csv`, `email-napalm-bump1-q1q2.csv`, `email-napalm-bump1-q3.csv` (bump 1 follow-ups — subjects start with `"Re: Invite For …"`)
   - The resolver should search each candidate CSV in order until a `(person_id, subject)` match is found. Build a per-CSV in-memory index keyed by `(person_id, subject)` once at startup, not per-row.
   - If `body` cannot be resolved (no matching CSV row), insert with `body=null` and log a warning. Do not fail the run.
   - `sender_profile_id`: lookup `sender_profiles` where `email = sender`. If missing, insert without it and warn.
   - `detail`: `{ sendgrid_message_id: messageId, source: 'script_backfill', source_log: <basename>, source_csv: <resolved csv basename or null> }`
3. **Idempotency:** before inserting, check `interactions` for any row whose `detail->>'sendgrid_message_id'` equals this `messageId`. Skip if present. (Add a partial unique index on `((detail->>'sendgrid_message_id'))` where the key is not null, in the same migration as Stage 3 reconciler — see below.)

The script prints per-log counts: `attempted`, `inserted`, `skipped_existing`, `skipped_test_redirect`, `body_missing`, `sender_profile_missing`, `error`. Add `--dry-run` and `--limit N` flags mirroring `send-outreach.ts`.

### Stage 2 — Retroactive reply correlation

Add `scripts/recorrelate_inbound.ts` (and an admin-only POST endpoint `app/api/inbox/recorrelate/route.ts` that calls the same module for one-off triggering).

Behavior:

1. Select all rows from `inbound_emails` where `direction = 'inbound'` and (`correlated_interaction_id IS NULL` OR `correlation_type = 'none'`), ordered by `received_at ASC`.
2. For each, call a new `correlateEmail(supabase, email, { notify: false })` variant — same logic as today's `correlateEmail`, plus an option to suppress the Telegram side-effect. Refactor `correlateAndNotify` to take this flag so we don't duplicate code.
3. Print summary: `processed`, `newly_matched`, `interactions_flipped_to_replied`, `still_unmatched`.

This must run **after** Stage 1, otherwise the correlator still won't find matching outbound interactions.

### Stage 3 — Close the leak going forward

**3a. DB write inside `scripts/send-outreach.ts`.** On every successful `sendEmail()`, insert the same `interactions` row Stage 1 builds (with `detail.source = 'script_send'`). The JSONL append remains as a redundant trail. If the DB insert fails, log it but do not block the send loop.

**3b. Sent-mailbox reconciler.** Extend `lib/inbox-sync.ts` so that when an outbound row is inserted into `inbound_emails` via `fetchSentEmails`, the sync also:
1. Correlates the outbound to a `person_id` (same exact-email / domain-match logic, but using `to_address` instead of `from_address`). Factor the matching logic out of `correlateEmail` into `findPersonByEmail(supabase, address)` and reuse.
2. If a `person_id` resolves AND no `interactions` row already exists for this person with `occurred_at` within ±2 minutes of `received_at` AND same subject (after stripping `Re: ` / `Fwd: `), insert a new `interactions` row with `detail.source = 'sent_folder_reconciler'`.
3. The ±2-min + subject check is the dedup against Stage 3a and against sequence-pipeline sends. This catches anything fired manually from Fastmail/Gmail.

**3c. Supporting migration (`030_interactions_message_id_index.sql`):**
```sql
CREATE UNIQUE INDEX IF NOT EXISTS uniq_interactions_sendgrid_message_id
  ON interactions ((detail->>'sendgrid_message_id'))
  WHERE detail->>'sendgrid_message_id' IS NOT NULL;
```
This enforces Stage 1's idempotency at the DB layer and lets Stage 3a use `ON CONFLICT DO NOTHING`.

### Pipeline / dashboard surfacing

Once Stages 1 and 2 land, the existing pipeline view and dashboard counts become correct automatically. Two small additions land in the same PR:

- **Pipeline view (`components/admin/pipeline-view.tsx`):** add a small `source` chip per row, derived from a new field `source` on `PipelineContact` populated in `app/admin/pipeline/page.tsx` from the best-status interaction's `detail->>'source'` (values: `script_blast`, `sequence`, `manual`, `null`). Lets the user distinguish how a contact entered the funnel — important because script-blast and sequence-sent recipients have different follow-up obligations.
- **Dashboard (`app/admin/page.tsx` + `useDashboardStats`):** add an "Active conversations" tile — count of distinct `person_id`s with both ≥1 `inbound_emails` row in the last 14 days and ≥1 `interactions` row with `direction='outbound'` and `status IN ('sent','delivered','opened','replied')` in the last 30 days. Implement as a new RPC `active_conversations_count(window_days int)` so the dashboard query stays cheap.

## Data Flow

```
JSONL log lines ──► Stage 1 script ──► interactions rows (source='script_backfill')
                                              │
inbound_emails (existing) ──► Stage 2 ──► interactions.status='replied' for matched outbound rows
                                              │
Fastmail Sent ─► inbox-sync ─► Stage 3b reconciler ──► interactions rows (source='sent_folder_reconciler')
SendGrid send ─► send-outreach.ts ─► Stage 3a inline insert ──► interactions rows (source='script_send')
                                              │
                                              ▼
                              Pipeline view + dashboard read same table
```

## Error Handling

- **JSONL parse error on a line:** log and skip that line, continue with the rest. Don't fail the run.
- **Person not found by `person_id` in the log:** insert the interaction anyway (the FK is `ON DELETE SET NULL` — a row with `person_id=NULL` is preferable to losing the send record). Print a warning.
- **CSV body lookup miss:** insert with `body=null`, warn, continue. Body is for future audit/reference; absence does not affect pipeline stage.
- **Sender profile missing:** insert with `sender_profile_id=null`, warn.
- **Idempotency conflict:** silent skip (Stage 1) or `ON CONFLICT DO NOTHING` (Stage 3a). Count separately as `skipped_existing`.
- **Telegram notification during Stage 2:** suppressed entirely. Historical replies have already been acknowledged; replaying notifications would spam.

## Testing

- **Unit:** `scripts/backfill_script_sends.test.ts` (or inline test fixtures) for the CSV body lookup and idempotency checks. Use a small fixture of 5–10 JSONL lines and matching CSV rows.
- **Manual dry-run gate:** Stage 1 script defaults to `--dry-run`. Live run requires `--yes` (mirror `send-outreach.ts` safety pattern). Print full summary before exit.
- **Live verification after Stage 1:**
  1. `SELECT COUNT(*) FROM interactions WHERE detail->>'source' = 'script_backfill'` matches expected ~4,039 (4,051 − 12 test-redirects).
  2. Spot-check 10 random rows: subject/sender/timestamp match the log; body matches the CSV row.
  3. Dashboard `sent` count increases by ~4,039.
- **Live verification after Stage 2:** `SELECT COUNT(*) FROM interactions WHERE status = 'replied' AND detail->>'source' = 'script_backfill'` — sanity-check against the count of `inbound_emails` rows from those recipients.
- **Stage 3a:** send 1 test email via `send-outreach.ts --limit 1 --test-to evan@opsprocket.com` (the test-redirect path means **no** interaction row should be created — same exclusion as backfill). Then send 1 live email to a known test person; verify a row appears.
- **Stage 3b:** send a manual email from Fastmail web to a known person in the DB. Run the inbox sync. Verify a new `interactions` row appears with `detail.source='sent_folder_reconciler'`.

## Open Questions

None. Defaults chosen: backfill all three logs in one pass; exclude test-redirects; tag rows by `detail.source` for downstream filtering.

## Out of Scope (Future Work)

- Reconciling against SendGrid's event webhook for `open`/`click`/`bounce` enrichment of backfilled rows. Today's backfill writes `status='sent'` flat — opens/clicks for those historical sends are lost.
- Surfacing the new `source` chip in the persons list and organization detail views.
- Backfilling `body` for napalm CSV rows that no longer parse cleanly (rare; warn-and-skip is sufficient).
