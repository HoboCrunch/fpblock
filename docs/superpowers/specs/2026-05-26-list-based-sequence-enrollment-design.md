# List-based sequence enrollment

**Date:** 2026-05-26
**Status:** Approved

## Problem

The sequence Enroll modal only supports enrolling individual people one at a
time via name/email search. Users want to enroll a whole `person_list` into a
sequence in one action.

## Membership model (decided)

A list's enrollable membership is its **static members** (`person_list_items`)
only. The dynamic `filter_rules` "Matches" tab is just a tool for finding people
to *add to* a list (via the existing "add to list" action); once added, they are
static members. So `enrollFromList` reads `person_list_items` and nothing else.

Enrollment is a **one-time snapshot**: list members are resolved and enrolled at
the moment of action. People added to the list later are not auto-enrolled. This
mirrors the existing `enrollFromEvent` / `enrollFromSegment` behavior.

## Server action

Add `enrollFromList(sequenceId, listId)` to `app/admin/sequences/actions.ts`:

1. Select `person_id` from `person_list_items` where `list_id = listId`.
2. If empty, return `{ success: true, enrolled: 0, requested: 0, dropped }`.
3. Delegate the resolved IDs to the existing `enrollPersons(sequenceId, ids)`,
   which already applies `applySequenceEnrollFilters` (excludes bounced and,
   if configured, already-enrolled) and upserts on `(sequence_id, person_id)`.
4. `revalidatePath` the sequence page and return the same result shape as
   `enrollPersons`: `{ success, enrolled, requested, dropped }`.

No schema change. No change to the generate/send pipelines — list enrollment
produces identical `sequence_enrollments` rows as every other path.

## UI — augment the existing Enroll modal

In `app/admin/sequences/[id]/sequence-detail-client.tsx`:

- Add a segmented toggle at the top of the Enroll modal: **People** | **Lists**.
- **People** tab: the existing search-and-enroll flow, unchanged.
- **Lists** tab: render available lists, each row showing name, optional
  description, and a member-count badge, with an "Enroll" button per list.
- After a list enroll, show an inline result line (e.g.
  `Enrolled 42 · 3 skipped`) because the count matters for a bulk action. The
  modal stays open so the user can enroll another list or close.

Data fetching: a `useQuery(["person_lists"], getLists)` hook, mirroring the
existing `useSenderProfiles` pattern. `getLists()` already returns
`person_list_items(count)`, so member counts come for free.

## Out of scope (YAGNI)

- Live sync between a list and a sequence.
- Wiring up event/segment enrollment UI (actions exist; not requested).
- Enrolling dynamic filter matches directly (user materializes them into the
  list first).

## Testing

- `enrollFromList` on a list with members enrolls them and reports the count;
  bounced / already-enrolled members are dropped and counted.
- `enrollFromList` on an empty list returns `enrolled: 0` without error.
- Modal: switching tabs preserves each tab's state; enrolling a list shows the
  result line and updates the enrollment counter after invalidation.
