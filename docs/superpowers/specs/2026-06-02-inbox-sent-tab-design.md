# Inbox "Sent" Tab — Merged Threaded Sent View

**Date:** 2026-06-02
**Status:** Approved design, pending implementation plan

## Problem

The admin inbox (`/admin/inbox`) is built on the `inbound_emails` table, which syncs
from Fastmail/JMAP (jb@ and wes@gofpblock.com), including the Sent folder. Outbound
emails sent *through the inbox* therefore already appear inline in threads with a
small "Sent" badge.

But the bulk of outbound email — ~4,065 SendGrid/outreach sends — lives in a
**separate** table (`interactions`, `status='sent'`, `channel='email'`,
`detail.sendgrid_message_id`) and appears **nowhere** in the inbox. There is no
single place to review everything that went out, or to see a send next to the reply
it earned.

## Goal

Add a **"Sent" tab** to the inbox that shows a unified, threaded view of all
outbound email — both SendGrid/outreach sends (`interactions`) and inbox replies
(`inbound_emails`, `direction='outbound'`) — with inbound replies threaded onto the
send that prompted them.

## Approach (chosen: A)

Lazy-loaded Sent view with its own fetch and a dedicated grouping pass. SendGrid
sends are normalized **in memory** into the existing `InboundEmailWithRelations`
shape so the existing thread panel renders them unchanged. No DB migration, no
backfill; the main inbox's initial load is untouched.

Rejected alternatives:
- **B — one unified dataset on page load:** loads 4k+ rows on every inbox visit for
  a view most opens don't need. Perf-rejected.
- **C — materialize SendGrid sends into `inbound_emails`:** duplicates 4k rows,
  needs a backfill migration + an ongoing reconciler, and forces SendGrid concepts
  into a JMAP-shaped table. Heaviest/riskiest.

## Data model

**No migration.** A normalized in-memory shape only.

SendGrid sends from `interactions` are mapped into the existing
`InboundEmailWithRelations` shape:

| `InboundEmail` field        | Source from `interactions` row                          |
|-----------------------------|---------------------------------------------------------|
| `id`                        | `interaction.id`                                        |
| `message_id`                | `"interaction:" + interaction.id` (synthetic)           |
| `direction`                 | `"outbound"`                                            |
| `thread_id`                 | `null` (no JMAP thread)                                 |
| `from_address` / `from_name`| sender profile email/name (via `sequence.sender` or detail) |
| `to_address`                | `person.email`                                          |
| `subject`                   | `interaction.subject`                                   |
| `body_html`                 | `interaction.body`                                      |
| `body_preview`              | first ~140 chars of `interaction.body` (stripped)       |
| `received_at`               | `interaction.occurred_at`                               |
| `is_read`                   | `true`                                                  |
| `person_id` / `person`      | `interaction.person_id` + joined person                 |
| `correlated_interaction_id` | `interaction.id`                                        |

Two pieces of metadata ride alongside for the UI (carried on the normalized message,
not persisted): `source: "sendgrid" | "inbox"` and `delivery_status` (the raw
`interactions.status`: sent/delivered/opened/clicked/replied/bounced).

## New route: `GET /api/inbox/sent`

Auth-gated consistent with the other inbox routes. Query params:

- `cursor` — `occurred_at` ISO of the last send from the previous page (keyset pagination)
- `limit` — default ~50 sends
- `q` — optional recipient/subject search
- `correlation` — optional `all | correlated | uncorrelated` passthrough
- `identity` — optional sender filter

Server steps:

1. **Fetch a page of sends** from `interactions`:
   - `channel = 'email'`
   - `status IN ('sent','delivered','opened','clicked','replied','bounced')`
   - `detail->>'inbound_emails_id' IS NULL` — **dedup**: drops inbox replies already
     reconciled into `interactions` by the existing outbound reconciler, since those
     are represented by their `inbound_emails` row.
   - join `persons(id, full_name, email)` and `sequences(name)`
   - `ORDER BY occurred_at DESC`, keyset-paginated by `cursor`, `LIMIT limit`.
2. **Fetch related inbound rows** for the persons (and counterparty emails) present
   in step 1 from `inbound_emails` (the replies, plus any pure-inbox outbound with no
   interaction twin) so they can be threaded onto the sends.
3. **Normalize** every row to `InboundEmailWithRelations`, **group** into threads,
   return `{ threads: Thread[], nextCursor: string | null }`.

## Grouping & correlation

New module `lib/inbox/group-sent-threads.ts`. Groups messages keyed by:

```
(person_id ?? counterparty_email) + "|" + normalizeSubject(subject)
```

`normalizeSubject` lower-cases, trims, and strips leading `Re:` / `Fwd:` / `Fw:`
(repeated). Returns the same `Thread` type the inbox already uses, so a SendGrid send
(no `thread_id`) and its JMAP reply merge into one thread and render in the existing
thread panel.

Conservative correlation rules:
- **Never** merge messages across different persons.
- Attach a reply onto a send's thread only when **person_id matches AND** normalized
  subject matches.
- Fall back to counterparty email matching only when `person_id` is null.

This mirrors the subject-matching philosophy already used by
`reconcileOutboundToInteraction` (match outbound to interaction by subject within a
time window).

## Client (`app/admin/inbox/inbox-client.tsx`)

- Add a top-level `view: "inbox" | "sent"` toggle, matching the existing `border-b-2`
  active-tab pattern (lines ~220-244).
- On first switch to **Sent**, lazily fetch `/api/inbox/sent`; cache in component
  state (or React Query). Subsequent switches reuse the loaded data.
- Render Sent threads with the **same thread list + thread panel** components as the
  inbox.
- Per-message **source badge**: "SendGrid" (from `interactions`) vs "Inbox" (from
  `inbound_emails` outbound).
- Per-message **delivery-status chip** from `delivery_status` (delivered / opened /
  bounced / replied) when present.
- **Infinite scroll** (the deliverable shipped this instead of a "Load more" button):
  the client requests 100 per page and an `IntersectionObserver` watches a sentinel
  near the bottom of the Sent list (root = the scroll container, 300px pre-load
  margin), auto-fetching the next page via `nextCursor` until exhausted. Appended
  threads are de-duped by `id` to avoid React key collisions at page boundaries.
- A **count header** above the list — `Showing {N} of {total} sent` — where `total`
  comes from the first page's response and `N` is the sum of `outbound_count` across
  loaded threads. Makes it clear the remaining sends are paged in, not missing.
- The existing All / Correlated / Uncorrelated correlation filter continues to apply
  within the Sent view.
- The inbox **Sync** button shares the Inbox/Sent toggle row (right-aligned via
  `ml-auto`) rather than occupying its own stacked row.

## Error handling & empty states

- Route: auth gate → `try/catch` → `500` with message on failure.
- Client: error state with a retry affordance; "No sent emails" empty state.
- Correlation stays conservative to avoid mis-threading unrelated mail.

## Testing (pure functions, vitest — matches existing `lib/sequences/*.test.ts` style)

- `normalizeInteractionToMessage` — interaction → message shape; verifies subject,
  body→body_html, occurred_at→received_at, synthetic message_id, direction, person.
- **Dedup** — rows with `detail.inbound_emails_id` are excluded from the SendGrid set.
- `normalizeSubject` — strips `Re:`/`Fwd:`/`Fw:` (incl. repeated), case/whitespace
  insensitive.
- `groupSentThreads`:
  - send + reply, same person + subject → 1 thread
  - send + reply, same person, different subject → 2 threads
  - send + reply, different persons → never merged
  - multiple sends, same person + subject → 1 thread, multiple messages

## Out of scope (YAGNI)

- No DB migration. If the `interactions` page query is slow at scale, a partial index
  on `(occurred_at DESC) WHERE channel='email' AND status IN (...)` is a follow-up;
  4k rows does not warrant it now.
- Pagination is by sends (the thread anchor); a thread spanning a page boundary could
  rarely render as two partial threads. Acceptable for MVP since cold-outreach sends
  are mostly one-per-person.
- No new sending capability; this is a read/review view. (Replying still uses the
  existing thread-panel composer.)
