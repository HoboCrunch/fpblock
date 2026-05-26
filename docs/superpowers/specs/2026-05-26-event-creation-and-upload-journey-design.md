# Event Creation + New-Event-List Upload Journey

**Date:** 2026-05-26
**Status:** Approved (design)

## Problem

There is no way to create an event in the admin UI. `/admin/events` is a read-only
table; the only event-creation path is the minimal `findOrCreateEvents` action
(name + `date_start` only) triggered when an unknown event name appears in a CSV's
`event` column.

We need:

1. First-class event creation on the events page.
2. A guided **"New event list"** journey on the uploads page: create an event, then
   run the CSV import with every row bound to that event.
3. A **full-list role picker** ("speaker status" toggle) within that journey that sets
   the `event_participations.role` for the entire imported list.

## Goals

- Shared, reusable event-creation modal used by both entry points.
- New-event-list journey forces all imported rows onto the newly created event,
  ignoring any `event` column (no `EventDetectModal` in this flow).
- Role picker per import mode: persons and organizations.
- Re-importing a list must not throw on duplicate participations.

## Non-Goals

- No event editing/deletion UI (create only).
- The role picker is scoped to the new-event-list journey; the normal upload flow
  keeps its existing default roles (`attendee` for persons, `sponsor` for orgs).
- No changes to the existing `event`-column detection flow for normal uploads.

## Relevant Schema

```
events(id, name, slug UNIQUE, location, date_start date, date_end date,
       website, event_type, notes, created_at)

event_participations(id, event_id, person_id, organization_id, role NOT NULL,
       sponsor_tier, confirmed, talk_title, time_slot, track, room, notes,
       CHECK ((person_id IS NULL) != (organization_id IS NULL)))

-- Partial unique indexes:
UNIQUE (event_id, person_id, role) WHERE person_id IS NOT NULL
UNIQUE (event_id, organization_id, role) WHERE organization_id IS NOT NULL
```

```
ParticipationRole = "speaker" | "attendee" | "organizer" | "panelist" | "mc"
                  | "sponsor" | "partner" | "exhibitor" | "media"
SponsorTier = "presented_by" | "platinum" | "diamond" | "emerald" | "gold"
            | "silver" | "bronze" | "copper" | "community"
```

`slug` is `UNIQUE` (nullable). `event_participations` has unique indexes per
`(event, entity, role)`, so the current bare `.insert` in the import actions throws
on a duplicate participation. The forced-event journey makes re-imports likely, so
participation writes must become duplicate-safe.

## Architecture

### 1. `createEvent` server action — `app/admin/events/actions.ts` (new)

```ts
interface CreateEventInput {
  name: string;            // required, trimmed, non-empty
  event_type?: string;
  date_start?: string;     // ISO date or ""
  date_end?: string;
  location?: string;
  website?: string;
  notes?: string;
}

async function createEvent(input: CreateEventInput): Promise<{ id: string; name: string }>
```

Behavior:
- Validate `name` is non-empty (throw otherwise).
- Derive `slug` via `slugify(name)` (lowercase, spaces/non-alphanumerics → `-`,
  collapse repeats, trim leading/trailing `-`).
- Insert with the derived slug. On a unique-violation (Postgres code `23505`),
  retry the insert with `slug: null`.
- Empty-string fields are normalized to `null`.
- `revalidatePath("/admin/events")`.
- Returns the created `{ id, name }`.

`slugify` lives in `lib/uploads/event-detect.ts` (alongside `normalizeEventName`) or a
small `lib/events/slug.ts`. Decided: **`lib/events/slug.ts`** to keep events concerns
separate from upload concerns. Unit-tested in isolation.

### 2. `EventCreateModal` — `components/admin/event-create-modal.tsx` (new)

Glass modal matching the visual pattern of `EventDetectModal` (`GlassCard`, fixed
overlay, `role="dialog"`, `aria-modal`).

Fields:
- **Name** — required text input.
- **Event type** — free text input with a `<datalist>` of existing types
  (`conference`, `hackathon`, `summit`, `meetup`); passed in via `eventTypes?` prop or
  hardcoded suggestions.
- **Date start**, **Date end** — `type="date"`.
- **Location** — text.
- **Website** — text (url).
- **Notes** — textarea.

Props:
```ts
interface EventCreateModalProps {
  initialName?: string;
  onCreated: (event: { id: string; name: string }) => void;
  onCancel: () => void;
}
```

Behavior:
- Submit disabled when name is empty or while pending.
- Calls `createEvent`, then `onCreated(event)`.
- Catches and shows the error message inline; stays open on error.

### 3. Events page — "New Event" button

In `app/admin/events/events-table-client.tsx`:
- Add a header row above the table `GlassCard`: an `Events` heading on the left and a
  right-aligned **New Event** button.
- Button opens `EventCreateModal`. On `onCreated`, call `router.refresh()`
  (import `useRouter` from `next/navigation`) so the server component re-fetches and
  the new event appears.

### 4. Uploads page — new-event-list journey

In `app/admin/uploads/page.tsx`, add journey state:

```ts
const [journeyEvent, setJourneyEvent] = useState<{ id: string; name: string } | null>(null);
const [showEventCreate, setShowEventCreate] = useState(false);
const [listRole, setListRole] = useState<ParticipationRole>("speaker");
const [sponsorTier, setSponsorTier] = useState<SponsorTier | "">("");
```

Toolbar gains a **New event list** button → `setShowEventCreate(true)`.

When `EventCreateModal` reports `onCreated(event)`:
- `setJourneyEvent(event)`, `setShowEventCreate(false)`.
- This activates **list mode**.

List-mode UI (rendered when `journeyEvent` is set):
- A banner `GlassCard`: *"Importing into **{event.name}**"* + the **role picker** +
  **Exit list mode** button (clears `journeyEvent`).
- Role picker options depend on `mode`:
  - persons → `speaker | panelist | mc | attendee | organizer | media` (default `speaker`)
  - organizations → `sponsor | partner | exhibitor` (default `sponsor`) plus an
    optional **Sponsor tier** select (`SponsorTier` values + "none").
- Switching `mode` resets `listRole` to the mode's default if the current role is
  invalid for the new mode.
- The `event` column is irrelevant in list mode: the `ImportTable` may still contain
  an `event` binding, but it is ignored on submit when `journeyEvent` is set. Columns
  are left as-is (no forced removal); the forced event wins.
- Import button label: *"Import N rows into {event.name} as {listRole}"*.

Submit in list mode:
- Skip `listUnknownEvents` and `EventDetectModal` entirely.
- Call the import action with `forcedEvent: { id: journeyEvent.id, role: listRole,
  sponsorTier: sponsorTier || null }` and an empty `eventMap`.

Exiting list mode returns the page to its normal upload behavior.

### 5. Import action changes — `app/admin/uploads/actions.ts`

Extend both configs:

```ts
config: {
  duplicateHandling: DuplicateHandling;
  eventMap: Record<string, string | null>;
  forcedEvent?: { id: string; role: ParticipationRole; sponsorTier?: SponsorTier | null };
}
```

`importPersons`:
- After resolving `personId`, attach event participation:
  - If `forcedEvent` set → `event_id = forcedEvent.id`, `role = forcedEvent.role`.
  - Else (existing) → resolve from `row.event` via `eventMap`, `role = "attendee"`.
- Write participation **duplicate-safe** (see below).

`importOrganizations`:
- After resolving `organizationId`, attach event participation:
  - If `forcedEvent` set → `event_id = forcedEvent.id`, `role = forcedEvent.role`,
    `sponsor_tier = forcedEvent.sponsorTier ?? null`.
  - Else (existing) → resolve from `row.event`, `role = "sponsor"`,
    `sponsor_tier` unset.
- Write participation duplicate-safe.

**Duplicate-safe participation write** (shared helper, e.g.
`upsertParticipation(supabase, { event_id, person_id|organization_id, role, sponsor_tier? })`):
- Query for an existing participation matching `(event_id, entity_id, role)`.
- If none, insert. If found, skip (optionally update `sponsor_tier` if provided and
  currently null — keep minimal: skip on conflict).
- This removes the current per-row duplicate-insert error on re-import.

### 6. Data flow

```
Events page:  New Event → EventCreateModal → createEvent → router.refresh()

Uploads page: New event list → EventCreateModal → createEvent
                → list mode (role picker, forcedEvent)
                → CSV/table → importPersons|importOrganizations(forcedEvent)
                → participations attached with chosen role
```

## Testing

- `slugify` unit tests: spaces, punctuation, casing, leading/trailing separators,
  unicode/empty → reasonable output.
- Import-action tests (mocked Supabase client, mirroring existing test patterns):
  - persons with `forcedEvent` → participation has the chosen role, `event_id` forced,
    `row.event`/`eventMap` ignored.
  - organizations with `forcedEvent` → role + `sponsor_tier` set.
  - duplicate participation is skipped, not thrown (existence check path).
- `EventCreateModal` test (testing-library, mirroring `event-detect-modal.test.tsx`):
  submit disabled with empty name; calls `onCreated` after successful create
  (mock `createEvent`).

## Files

**New:**
- `app/admin/events/actions.ts` — `createEvent`
- `lib/events/slug.ts` — `slugify`
- `lib/events/slug.test.ts`
- `components/admin/event-create-modal.tsx`
- `components/admin/event-create-modal.test.tsx`

**Modified:**
- `app/admin/events/events-table-client.tsx` — header + New Event button + modal + refresh
- `app/admin/uploads/page.tsx` — journey state, New event list button, list-mode
  banner + role picker, forced-event submit
- `app/admin/uploads/actions.ts` — `forcedEvent` config, duplicate-safe participations,
  generalized role
- (test) extend or add `app/admin/uploads/actions.test.ts` if it exists; otherwise new

## Implementation Tracks (agent team)

- **Agent A** — `lib/events/slug.ts` (+test), `app/admin/events/actions.ts`,
  `EventCreateModal` (+test). Self-contained.
- **Agent B** — `app/admin/uploads/actions.ts` `forcedEvent` + duplicate-safe
  participations (+test). No UI dependency.
- **Integration (after A & B)** — events page New Event button; uploads page journey
  wiring (role picker, forced submit). Depends on A's modal/action and B's action shape.
