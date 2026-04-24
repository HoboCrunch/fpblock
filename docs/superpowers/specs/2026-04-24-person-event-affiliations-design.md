# Person ↔ Event Affiliations (via Participating Org)

**Date:** 2026-04-24
**Status:** Spec — pending implementation plan

## Problem

When People Finder enriches an organization that participates in an event (e.g., Binance sponsoring Cannes 2026), new persons get created and linked to that org via `person_organization` with `source='org_enrichment'`. However, these persons have no relationship to the event itself. The connection exists only implicitly through a three-table join. Today one UI (the event detail page, `app/admin/events/[id]/page.tsx:180`) papers over this with an ad-hoc derived "Related contacts" block, but the rest of the app (persons list, person detail, enrichment filters, sequences, organization pages) treats these persons as unaffiliated.

We want this relationship to be first-class throughout the app, distinguishable from direct participation (speakers, attendees), and filterable either separately or combined with direct participation.

## Scope decisions (from brainstorming)

- **Propagation rule:** any `event_participations` row with `organization_id IS NOT NULL` propagates — not limited to `role='sponsor'`.
- **Link currency:** only `person_organization` rows with `is_current=true` propagate.
- **Maintenance:** bidirectional Postgres triggers — `person_organization` writes propagate to affiliations; `event_participations` writes propagate to affiliations.
- **Lifecycle:** cascade on structural deletes (row removed from `person_organization` or `event_participations`), but a `is_current` flip from `true→false` is a **no-op** — affiliation persists. Rationale: the person *was* at the org during the org's event participation; that historical relationship remains a legitimate outreach target.
- **Granularity:** one affiliation row per `(event_id, person_id, via_organization_id)` — a person affiliated to the same event via two different participating orgs produces two rows.
- **UI terminology:** "Org-affiliated" (not "Sponsor-affiliated") to match the any-org-role propagation rule.

## Schema

### New table: `person_event_affiliations`

```sql
CREATE TABLE person_event_affiliations (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id             uuid NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  person_id            uuid NOT NULL REFERENCES persons (id) ON DELETE CASCADE,
  via_organization_id  uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, person_id, via_organization_id)
);

CREATE INDEX idx_pea_event        ON person_event_affiliations (event_id);
CREATE INDEX idx_pea_person       ON person_event_affiliations (person_id);
CREATE INDEX idx_pea_via_org      ON person_event_affiliations (via_organization_id);
CREATE INDEX idx_pea_event_person ON person_event_affiliations (event_id, person_id);
```

### RLS

Mirror the existing `event_participations` policies (migration 002 / 009 pattern). `authenticated` users can SELECT; writes are service-role only. Implementation verifies the exact policy shape in those migrations and copies it.

## Triggers

All triggers are `AFTER` row-level in plpgsql, living in migration `025_person_event_affiliations.sql`.

### `tg_pea_sync_from_person_org` on `person_organization`

**AFTER INSERT** when `NEW.is_current = true`:

```sql
INSERT INTO person_event_affiliations (event_id, person_id, via_organization_id)
SELECT ep.event_id, NEW.person_id, NEW.organization_id
FROM event_participations ep
WHERE ep.organization_id = NEW.organization_id
ON CONFLICT DO NOTHING;
```

**AFTER UPDATE**:
- If `OLD.is_current = false AND NEW.is_current = true` → run the same INSERT as above.
- If `OLD.is_current = true AND NEW.is_current = false` → **no-op** (rule B: keep).
- If `person_id` or `organization_id` changed (rare): treat as DELETE of OLD pair + INSERT of NEW pair.

**AFTER DELETE**:

```sql
DELETE FROM person_event_affiliations
WHERE person_id = OLD.person_id
  AND via_organization_id = OLD.organization_id;
```

### `tg_pea_sync_from_event_participation` on `event_participations`

**AFTER INSERT** when `NEW.organization_id IS NOT NULL`:

```sql
INSERT INTO person_event_affiliations (event_id, person_id, via_organization_id)
SELECT NEW.event_id, po.person_id, NEW.organization_id
FROM person_organization po
WHERE po.organization_id = NEW.organization_id
  AND po.is_current = true
ON CONFLICT DO NOTHING;
```

**AFTER DELETE** when `OLD.organization_id IS NOT NULL`:

```sql
DELETE FROM person_event_affiliations
WHERE event_id = OLD.event_id
  AND via_organization_id = OLD.organization_id;
```

**AFTER UPDATE**: no-op. Changing an org's `role` or `sponsor_tier` at an event doesn't change whether persons are affiliated — affiliation is a function of "org participates at event," independent of role.

## Backfill

Included inline in the same migration, run after triggers are active (so concurrent writes during migration land safely):

```sql
INSERT INTO person_event_affiliations (event_id, person_id, via_organization_id)
SELECT DISTINCT ep.event_id, po.person_id, ep.organization_id
FROM event_participations ep
JOIN person_organization po ON po.organization_id = ep.organization_id
WHERE ep.organization_id IS NOT NULL
  AND po.is_current = true
ON CONFLICT DO NOTHING;
```

Idempotent by construction; safe to re-run.

## Query helper

New module: `lib/queries/event-persons.ts`.

```ts
export type EventPersonRelation = "direct" | "org_affiliated" | "either" | "both";

// Simple form: returns de-duplicated person ids.
export async function getPersonIdsForEvent(
  supabase: SupabaseClient,
  eventId: string,
  relation: EventPersonRelation,
): Promise<string[]>;

// Rich form: for UIs that need to badge each row.
export async function getPersonRelationsForEvent(
  supabase: SupabaseClient,
  eventId: string,
): Promise<Map<string, { direct: boolean; viaOrgIds: string[] }>>;
```

Semantics:
- `direct` → ids from `event_participations WHERE event_id=? AND person_id IS NOT NULL`.
- `org_affiliated` → ids from `person_event_affiliations WHERE event_id=?`.
- `either` → union.
- `both` → intersection.

All `/api/enrich/*` routes and sequence enrollment go through this helper — no bespoke joins in route handlers.

## UI filter model

A single shared component `<EventRelationToggle>` (two checkboxes: `Speaker`, `Org-affiliated`) is used everywhere event scope is selected.

Mapping checkbox state to `EventPersonRelation`:

| Speaker | Org-affiliated | Relation passed to helper |
|---|---|---|
| ✓ | ✓ | `either` (default) |
| ✓ | — | `direct` |
| — | ✓ | `org_affiliated` |
| — | — | empty set (return `[]`, show nothing event-scoped) |

The "neither checked" case intentionally returns empty rather than "all persons, ignore event" — avoids the silent-fallback footgun.

## Surface-by-surface changes

### 1. Persons list (`/admin/persons`)
- Add event filter dropdown + `<EventRelationToggle>`.
- Default when event picked: both toggles on (`either`).
- Row badges: `SPK` if in direct set, `ORG` if in org-affiliated set, both are possible.
- Data layer: use `getPersonRelationsForEvent` to produce per-row badge state.

### 2. Event detail (`/admin/events/[id]`)
- **Remove** the existing derived "Related contacts" block (`page.tsx` lines ~180–220).
- Replace with two sections driven by new table:
  - `Direct participants` — existing query against `event_participations`.
  - `Org-affiliated contacts` — rows show person + one chip per `via_organization_id`.
- Dedup rule: if a person is in both sets, show them only in `Direct participants` (no duplicate humans). This differs intentionally from the Persons list, where a person can carry both `SPK` and `ORG` badges — event detail is a categorized view (avoid seeing the same face twice), list is a lookup view (badges are metadata, not categories).

### 3. Person detail (`/admin/persons/[id]`)
- Existing "Events" block splits into two:
  - `Direct participation` (existing behavior).
  - `Event affiliations (via org)` — each row: event name + `via <OrgName>` chip linking to the org. One row per `(event, via_org)`.

### 4. Enrichment (`/admin/enrichment`, `/api/enrich/persons`, `/api/enrich/organizations`)
- When event scope is selected in the enrichment UI, render `<EventRelationToggle>`.
- API routes gain a `relation` query param (default `either` for backwards compat). Routes call `getPersonIdsForEvent` before running the pipeline.

### 5. Sequences
- Event-scoped enrollment picker gets `<EventRelationToggle>`.
- Default both on. Existing sequences (explicit person lists) are unaffected.

### 6. Organizations list/detail
- **Org detail:** read-only stat block "N persons affiliated across M events," expandable to show event × person-count table. Queries new table grouped by `event_id`.
- **Org list:** one new sortable column `Events propagated` — `COUNT(DISTINCT event_id)` from the new table grouped by `via_organization_id`.
- No mutating controls.

### 7. Lists (manual person lists)
- No schema or behavior change.
- "Add to list" on persons list continues to respect the current filter selection — event+relation filtering therefore works end-to-end without changes here.

## Testing

### Trigger tests (integration against Supabase, matching existing test pattern)
1. Insert `event_participations` (org) → affiliations created for every `is_current=true` person_organization on that org. Assert count and `via_organization_id`.
2. Insert new `person_organization` (is_current=true) for org already at an event → affiliation appears.
3. `is_current` true→false → no row removed.
4. `is_current` false→true → affiliation reappears/stays.
5. Delete `person_organization` → affiliation for `(person, via_org)` removed; other via-orgs for same person untouched.
6. Delete `event_participations` (org) → affiliations for `(event, via_org)` removed.
7. Person linked to two participating orgs at same event → two affiliation rows; delete one path → one remains.
8. Re-running the trigger's INSERT path on identical input doesn't error (`ON CONFLICT DO NOTHING`).
9. Backfill SQL on a fixture of pre-existing data produces correct rows and is idempotent on re-run.

### Query helper tests (`lib/queries/event-persons.ts`)
10. All four relation modes return correct ids for a mixed fixture.
11. Dedup across the two tables (person who is both direct and org-affiliated appears once in `either`).
12. Empty event returns `[]`.

### UI smoke (Playwright or existing e2e pattern)
13. Persons list with event + both toggles → union; toggling one off narrows; both off → empty.
14. Event detail page renders both sections without duplicate humans.
15. Enrichment kickoff with event + "Org-affiliated only" passes correct `relation` param to the API route.

### Out of scope
- Load testing (volumes are small: hundreds of events × tens of orgs × tens of persons).
- Re-testing RLS beyond mirroring the `event_participations` policy.

## Migration summary

One new migration, `025_person_event_affiliations.sql`, containing (in order):
1. `CREATE TABLE person_event_affiliations` + indexes.
2. RLS enable + policies mirroring `event_participations`.
3. Trigger functions + triggers on `person_organization` and `event_participations`.
4. Idempotent backfill `INSERT … ON CONFLICT DO NOTHING`.

## Deferred / out of scope

- Columns on `person_event_affiliations` beyond `via_organization_id` (e.g., `notes`, `suppressed`, `affiliation_reason`). Not needed for current use cases; the schema has room to add them later.
- Propagating via non-current `person_organization` rows.
- Surfacing the affiliation in the Gmail/inbox/interactions views — those already reference `event_id` directly on `interactions` and don't benefit from this table.
- Alerting/notifications when new affiliations are auto-created.
