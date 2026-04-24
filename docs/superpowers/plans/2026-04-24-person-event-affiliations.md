# Person ↔ Event Affiliations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the implicit "persons enriched from a participating org" ↔ event relationship into a first-class stored, trigger-maintained affiliation usable throughout the admin app.

**Architecture:** New `person_event_affiliations` table maintained by bidirectional Postgres triggers on `person_organization` and `event_participations`. Shared query helper (`lib/queries/event-persons.ts`) and a shared UI component (`<EventRelationToggle>`) give six admin surfaces a consistent tri-state (Speaker / Org-affiliated / Either) filter.

**Tech Stack:** Next.js 16, React 19, Supabase Postgres (plpgsql triggers), TanStack Query, Tailwind, Vitest (added to root for helper tests).

**Spec:** `docs/superpowers/specs/2026-04-24-person-event-affiliations-design.md`

---

## File map

**Create:**
- `supabase/migrations/025_person_event_affiliations.sql`
- `lib/queries/event-persons.ts`
- `lib/queries/event-persons.test.ts`
- `scripts/verify-event-affiliations.ts`
- `components/admin/event-relation-toggle.tsx`
- `lib/queries/use-event-affiliations.ts`
- `vitest.config.ts` (root)

**Modify:**
- `lib/types/database.ts` — add `PersonEventAffiliation` interface
- `lib/queries/query-keys.ts` — add `eventAffiliations` key factory
- `app/admin/persons/persons-table-client.tsx` — event filter + toggle + badges
- `app/admin/persons/page.tsx` — pipe new filter params
- `app/admin/events/[id]/page.tsx` — remove derived block, add two sections
- `app/admin/persons/[id]/page.tsx` — add "Event affiliations" section
- `app/admin/enrichment/enrichment-shell.tsx` + `app/api/enrich/persons/route.ts` + `app/api/enrich/organizations/route.ts` — relation param
- `app/admin/sequences/[id]/sequence-detail-client.tsx` (enrollment picker — exact file confirmed during Task 11)
- `app/admin/organizations/organizations-table-client.tsx` + `app/admin/organizations/[id]/page.tsx`
- `package.json` — add `test` script + vitest devDependency

---

## Task 1: Add `PersonEventAffiliation` type

**Files:**
- Modify: `lib/types/database.ts` (insert after `EventParticipation` interface at line ~117)

- [ ] **Step 1: Add the interface**

Edit `lib/types/database.ts`. After the `EventParticipation` interface block (ends near line 117), insert:

```ts
export interface PersonEventAffiliation {
  id: string;
  event_id: string;
  person_id: string;
  via_organization_id: string;
  created_at: string;
  updated_at: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/types/database.ts
git commit -m "types: add PersonEventAffiliation"
```

---

## Task 2: Migration — table, RLS, triggers, backfill

**Files:**
- Create: `supabase/migrations/025_person_event_affiliations.sql`

- [ ] **Step 1: Inspect the RLS shape of `event_participations`**

Run:
```bash
grep -n "event_participations" supabase/migrations/002_rls.sql supabase/migrations/009_rls_new_tables.sql 2>/dev/null
```

Copy the exact `CREATE POLICY` shape to mirror it in the new migration. If `event_participations` uses `FOR SELECT TO authenticated USING (true)` + service-role writes, mirror that exactly.

- [ ] **Step 2: Write the migration file**

Create `supabase/migrations/025_person_event_affiliations.sql`:

```sql
-- =============================================================================
-- Migration 025: person_event_affiliations
-- =============================================================================
-- Stores the indirect relationship between a person and an event that is
-- created when a person is linked (via person_organization) to an organization
-- that participates in that event (via event_participations).
-- Maintained by bidirectional triggers; see spec:
-- docs/superpowers/specs/2026-04-24-person-event-affiliations-design.md
-- =============================================================================

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

-- ---------------------------------------------------------------------------
-- RLS: mirror event_participations policies exactly (SELECT to authenticated;
-- service-role-only writes). If event_participations uses different shape,
-- adjust to match.
-- ---------------------------------------------------------------------------

ALTER TABLE person_event_affiliations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pea_select_authenticated"
  ON person_event_affiliations
  FOR SELECT
  TO authenticated
  USING (true);

-- Writes are service-role only (no policy = no row-level access for anon/auth).

-- ---------------------------------------------------------------------------
-- Trigger function: sync from person_organization
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION tg_pea_sync_from_person_org() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.is_current = true THEN
      INSERT INTO person_event_affiliations (event_id, person_id, via_organization_id)
      SELECT ep.event_id, NEW.person_id, NEW.organization_id
      FROM event_participations ep
      WHERE ep.organization_id = NEW.organization_id
      ON CONFLICT DO NOTHING;
    END IF;
    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    -- Handle pair changes as DELETE(old) + INSERT(new)
    IF NEW.person_id IS DISTINCT FROM OLD.person_id
       OR NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
      DELETE FROM person_event_affiliations
       WHERE person_id = OLD.person_id
         AND via_organization_id = OLD.organization_id;
      IF NEW.is_current = true THEN
        INSERT INTO person_event_affiliations (event_id, person_id, via_organization_id)
        SELECT ep.event_id, NEW.person_id, NEW.organization_id
        FROM event_participations ep
        WHERE ep.organization_id = NEW.organization_id
        ON CONFLICT DO NOTHING;
      END IF;
      RETURN NEW;
    END IF;

    -- is_current false -> true: insert
    IF OLD.is_current = false AND NEW.is_current = true THEN
      INSERT INTO person_event_affiliations (event_id, person_id, via_organization_id)
      SELECT ep.event_id, NEW.person_id, NEW.organization_id
      FROM event_participations ep
      WHERE ep.organization_id = NEW.organization_id
      ON CONFLICT DO NOTHING;
    END IF;

    -- is_current true -> false: NO-OP per lifecycle rule B
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    DELETE FROM person_event_affiliations
     WHERE person_id = OLD.person_id
       AND via_organization_id = OLD.organization_id;
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_pea_sync_from_person_org
  AFTER INSERT OR UPDATE OR DELETE ON person_organization
  FOR EACH ROW EXECUTE FUNCTION tg_pea_sync_from_person_org();

-- ---------------------------------------------------------------------------
-- Trigger function: sync from event_participations
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION tg_pea_sync_from_event_participation() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.organization_id IS NOT NULL THEN
      INSERT INTO person_event_affiliations (event_id, person_id, via_organization_id)
      SELECT NEW.event_id, po.person_id, NEW.organization_id
      FROM person_organization po
      WHERE po.organization_id = NEW.organization_id
        AND po.is_current = true
      ON CONFLICT DO NOTHING;
    END IF;
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.organization_id IS NOT NULL THEN
      DELETE FROM person_event_affiliations
       WHERE event_id = OLD.event_id
         AND via_organization_id = OLD.organization_id;
    END IF;
    RETURN OLD;
  END IF;

  -- UPDATE: no-op (role/tier changes don't affect affiliation)
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_pea_sync_from_event_participation
  AFTER INSERT OR DELETE ON event_participations
  FOR EACH ROW EXECUTE FUNCTION tg_pea_sync_from_event_participation();

-- ---------------------------------------------------------------------------
-- Backfill (idempotent, safe to re-run)
-- ---------------------------------------------------------------------------

INSERT INTO person_event_affiliations (event_id, person_id, via_organization_id)
SELECT DISTINCT ep.event_id, po.person_id, ep.organization_id
FROM event_participations ep
JOIN person_organization po ON po.organization_id = ep.organization_id
WHERE ep.organization_id IS NOT NULL
  AND po.is_current = true
ON CONFLICT DO NOTHING;
```

- [ ] **Step 3: Apply the migration locally**

Run (adjust to project's migration runner — check `package.json` / existing seed scripts):
```bash
npx supabase db push
```
Expected: migration applies without error; `person_event_affiliations` table exists; backfill populates rows.

If `npx supabase db push` isn't the local pattern, run the SQL file directly against the project's dev Postgres (check `supabase/config.toml` for connection).

- [ ] **Step 4: Confirm backfill count**

```bash
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM person_event_affiliations;"
```
Compare against the expected count:
```bash
psql "$DATABASE_URL" -c "
SELECT COUNT(*) FROM (
  SELECT DISTINCT ep.event_id, po.person_id, ep.organization_id
  FROM event_participations ep
  JOIN person_organization po ON po.organization_id = ep.organization_id
  WHERE ep.organization_id IS NOT NULL AND po.is_current = true
) t;"
```
The two numbers must match.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/025_person_event_affiliations.sql
git commit -m "feat(db): person_event_affiliations table + bidirectional triggers"
```

---

## Task 3: Verification script (exercises triggers end-to-end)

**Files:**
- Create: `scripts/verify-event-affiliations.ts`

- [ ] **Step 1: Write the verification script**

Create `scripts/verify-event-affiliations.ts`:

```ts
/**
 * scripts/verify-event-affiliations.ts
 *
 * Exercises the bidirectional triggers on person_event_affiliations by creating
 * isolated fixtures in the dev DB, performing each lifecycle event, and
 * asserting affiliation-row counts. Prints PASS/FAIL per scenario.
 *
 * Run:   npx tsx scripts/verify-event-affiliations.ts
 * Needs: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in env
 */
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import "dotenv/config";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required");
  process.exit(1);
}
const supabase = createClient(url, key);

let failures = 0;
function assert(name: string, cond: boolean, extra?: unknown) {
  if (cond) {
    console.log(`  PASS  ${name}`);
  } else {
    console.log(`  FAIL  ${name}`, extra ?? "");
    failures++;
  }
}

async function countAffiliations(eventId: string, personId?: string, viaOrgId?: string) {
  let q = supabase.from("person_event_affiliations").select("id", { count: "exact", head: true })
    .eq("event_id", eventId);
  if (personId) q = q.eq("person_id", personId);
  if (viaOrgId) q = q.eq("via_organization_id", viaOrgId);
  const { count, error } = await q;
  if (error) throw error;
  return count ?? 0;
}

async function setupFixture() {
  // Event
  const { data: event } = await supabase.from("events").insert({
    name: `verify-event-${Date.now()}`,
    slug: `verify-event-${Date.now()}`,
  }).select("id").single();

  // Two orgs
  const { data: orgA } = await supabase.from("organizations").insert({
    name: `verify-org-a-${Date.now()}`,
  }).select("id").single();
  const { data: orgB } = await supabase.from("organizations").insert({
    name: `verify-org-b-${Date.now()}`,
  }).select("id").single();

  // Person
  const { data: person } = await supabase.from("persons").insert({
    full_name: `verify-person-${Date.now()}`,
  }).select("id").single();

  return {
    eventId: event!.id as string,
    orgAId: orgA!.id as string,
    orgBId: orgB!.id as string,
    personId: person!.id as string,
  };
}

async function teardown(ids: { eventId: string; orgAId: string; orgBId: string; personId: string }) {
  // Cascades will handle dependent rows
  await supabase.from("events").delete().eq("id", ids.eventId);
  await supabase.from("organizations").delete().in("id", [ids.orgAId, ids.orgBId]);
  await supabase.from("persons").delete().eq("id", ids.personId);
}

async function run() {
  const ids = await setupFixture();
  const { eventId, orgAId, orgBId, personId } = ids;

  try {
    console.log("Scenario 1: insert event_participations(org) then person_organization");
    await supabase.from("event_participations").insert({
      event_id: eventId, organization_id: orgAId, role: "sponsor",
    });
    await supabase.from("person_organization").insert({
      person_id: personId, organization_id: orgAId, is_current: true,
    });
    assert("affiliation exists after both writes",
      (await countAffiliations(eventId, personId, orgAId)) === 1);

    console.log("Scenario 2: is_current true -> false does NOT remove");
    await supabase.from("person_organization")
      .update({ is_current: false })
      .eq("person_id", personId).eq("organization_id", orgAId);
    assert("affiliation persists after is_current flip",
      (await countAffiliations(eventId, personId, orgAId)) === 1);

    console.log("Scenario 3: is_current false -> true idempotent");
    await supabase.from("person_organization")
      .update({ is_current: true })
      .eq("person_id", personId).eq("organization_id", orgAId);
    assert("still exactly one affiliation",
      (await countAffiliations(eventId, personId, orgAId)) === 1);

    console.log("Scenario 4: second participating org adds a second affiliation");
    await supabase.from("event_participations").insert({
      event_id: eventId, organization_id: orgBId, role: "partner",
    });
    await supabase.from("person_organization").insert({
      person_id: personId, organization_id: orgBId, is_current: true,
    });
    assert("two affiliations for same (event, person)",
      (await countAffiliations(eventId, personId)) === 2);

    console.log("Scenario 5: delete person_organization(orgA) removes only that path");
    await supabase.from("person_organization")
      .delete().eq("person_id", personId).eq("organization_id", orgAId);
    assert("orgA path removed",
      (await countAffiliations(eventId, personId, orgAId)) === 0);
    assert("orgB path remains",
      (await countAffiliations(eventId, personId, orgBId)) === 1);

    console.log("Scenario 6: delete event_participations(orgB) removes affiliation");
    await supabase.from("event_participations")
      .delete().eq("event_id", eventId).eq("organization_id", orgBId);
    assert("all affiliations for event gone",
      (await countAffiliations(eventId, personId)) === 0);

    console.log("Scenario 7: backfill idempotency (re-insert + ON CONFLICT)");
    await supabase.from("event_participations").insert({
      event_id: eventId, organization_id: orgAId, role: "sponsor",
    });
    await supabase.from("person_organization").insert({
      person_id: personId, organization_id: orgAId, is_current: true,
    });
    // Manually re-run the same insert path the trigger would run (simulate retry)
    const { error: reInsertErr } = await supabase.from("person_event_affiliations").insert({
      event_id: eventId, person_id: personId, via_organization_id: orgAId,
    });
    assert("direct re-insert collides and is swallowed",
      reInsertErr !== null && /duplicate|unique/i.test(reInsertErr!.message));
    assert("still exactly one row",
      (await countAffiliations(eventId, personId, orgAId)) === 1);
  } finally {
    await teardown(ids);
  }

  console.log(failures === 0 ? "\nALL SCENARIOS PASSED" : `\n${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Run it**

```bash
npx tsx scripts/verify-event-affiliations.ts
```
Expected: `ALL SCENARIOS PASSED` and exit 0. If any scenario fails, fix the trigger in `025_person_event_affiliations.sql`, re-apply, re-run.

- [ ] **Step 3: Commit**

```bash
git add scripts/verify-event-affiliations.ts
git commit -m "test(db): verification script for person_event_affiliations triggers"
```

---

## Task 4: Query helper + unit tests + vitest setup

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json` (add `test` script + `vitest` devDep)
- Create: `lib/queries/event-persons.ts`
- Create: `lib/queries/event-persons.test.ts`

- [ ] **Step 1: Install vitest at root**

```bash
npm install --save-dev vitest @vitest/ui
```

- [ ] **Step 2: Add root `vitest.config.ts`**

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    include: ["lib/**/*.test.ts", "app/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
```

- [ ] **Step 3: Add `test` script to `package.json`**

Edit `package.json` → `scripts`:

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint",
  "test": "vitest run",
  "test:watch": "vitest"
}
```

- [ ] **Step 4: Write the failing tests first**

Create `lib/queries/event-persons.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getPersonIdsForEvent,
  getPersonRelationsForEvent,
  type EventPersonRelation,
} from "./event-persons";

// Minimal fake supabase: each .from(table) returns a chainable stub whose
// terminal .select(...) resolves to { data: ... }.
function fakeSupabase(rows: {
  event_participations: { person_id: string }[];
  person_event_affiliations: { person_id: string; via_organization_id: string }[];
}): SupabaseClient {
  const chain = (data: unknown) => {
    const q: Record<string, unknown> = {};
    const terminal = { data, error: null };
    q.select = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        not: vi.fn().mockResolvedValue(terminal),
        then: (fn: (r: typeof terminal) => unknown) => fn(terminal),
      }),
    });
    return q as unknown;
  };
  return {
    from: (table: string) => {
      if (table === "event_participations") return chain(rows.event_participations);
      if (table === "person_event_affiliations") return chain(rows.person_event_affiliations);
      return chain([]);
    },
  } as unknown as SupabaseClient;
}

describe("getPersonIdsForEvent", () => {
  const base = {
    event_participations: [{ person_id: "p1" }, { person_id: "p2" }],
    person_event_affiliations: [
      { person_id: "p2", via_organization_id: "o1" },
      { person_id: "p3", via_organization_id: "o1" },
    ],
  };

  it("relation=direct returns only direct person ids", async () => {
    const ids = await getPersonIdsForEvent(fakeSupabase(base), "e1", "direct");
    expect(ids.sort()).toEqual(["p1", "p2"]);
  });

  it("relation=org_affiliated returns only affiliated ids (deduped)", async () => {
    const ids = await getPersonIdsForEvent(fakeSupabase(base), "e1", "org_affiliated");
    expect(ids.sort()).toEqual(["p2", "p3"]);
  });

  it("relation=either unions direct + affiliated", async () => {
    const ids = await getPersonIdsForEvent(fakeSupabase(base), "e1", "either");
    expect(ids.sort()).toEqual(["p1", "p2", "p3"]);
  });

  it("relation=both intersects direct + affiliated", async () => {
    const ids = await getPersonIdsForEvent(fakeSupabase(base), "e1", "both");
    expect(ids.sort()).toEqual(["p2"]);
  });

  it("empty event returns []", async () => {
    const empty = { event_participations: [], person_event_affiliations: [] };
    const ids = await getPersonIdsForEvent(fakeSupabase(empty), "e1", "either");
    expect(ids).toEqual([]);
  });
});

describe("getPersonRelationsForEvent", () => {
  it("produces per-person relation map with viaOrgIds", async () => {
    const rows = {
      event_participations: [{ person_id: "p1" }, { person_id: "p2" }],
      person_event_affiliations: [
        { person_id: "p2", via_organization_id: "o1" },
        { person_id: "p2", via_organization_id: "o2" },
        { person_id: "p3", via_organization_id: "o1" },
      ],
    };
    const map = await getPersonRelationsForEvent(fakeSupabase(rows), "e1");
    expect(map.get("p1")).toEqual({ direct: true, viaOrgIds: [] });
    expect(map.get("p2")).toEqual({ direct: true, viaOrgIds: ["o1", "o2"] });
    expect(map.get("p3")).toEqual({ direct: false, viaOrgIds: ["o1"] });
  });
});
```

- [ ] **Step 5: Run the tests — expect failure**

```bash
npm test
```
Expected: tests fail because `lib/queries/event-persons.ts` doesn't exist.

- [ ] **Step 6: Implement the helper**

Create `lib/queries/event-persons.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";

export type EventPersonRelation = "direct" | "org_affiliated" | "either" | "both";

interface DirectRow { person_id: string | null }
interface AffRow { person_id: string; via_organization_id: string }

async function fetchDirect(supabase: SupabaseClient, eventId: string): Promise<string[]> {
  const { data } = await supabase
    .from("event_participations")
    .select("person_id")
    .eq("event_id", eventId)
    .not("person_id", "is", null);
  return Array.from(
    new Set(
      ((data as DirectRow[] | null) ?? [])
        .map((r) => r.person_id)
        .filter((id): id is string => id !== null)
    )
  );
}

async function fetchAffiliated(supabase: SupabaseClient, eventId: string): Promise<AffRow[]> {
  const { data } = await supabase
    .from("person_event_affiliations")
    .select("person_id, via_organization_id")
    .eq("event_id", eventId);
  return (data as AffRow[] | null) ?? [];
}

export async function getPersonIdsForEvent(
  supabase: SupabaseClient,
  eventId: string,
  relation: EventPersonRelation
): Promise<string[]> {
  if (relation === "direct") {
    return fetchDirect(supabase, eventId);
  }
  if (relation === "org_affiliated") {
    const aff = await fetchAffiliated(supabase, eventId);
    return Array.from(new Set(aff.map((a) => a.person_id)));
  }
  const [direct, aff] = await Promise.all([
    fetchDirect(supabase, eventId),
    fetchAffiliated(supabase, eventId),
  ]);
  const affIds = new Set(aff.map((a) => a.person_id));
  if (relation === "both") {
    return direct.filter((id) => affIds.has(id));
  }
  // either
  const out = new Set(direct);
  for (const id of affIds) out.add(id);
  return Array.from(out);
}

export async function getPersonRelationsForEvent(
  supabase: SupabaseClient,
  eventId: string
): Promise<Map<string, { direct: boolean; viaOrgIds: string[] }>> {
  const [direct, aff] = await Promise.all([
    fetchDirect(supabase, eventId),
    fetchAffiliated(supabase, eventId),
  ]);
  const map = new Map<string, { direct: boolean; viaOrgIds: string[] }>();
  for (const id of direct) {
    map.set(id, { direct: true, viaOrgIds: [] });
  }
  for (const row of aff) {
    const cur = map.get(row.person_id) ?? { direct: false, viaOrgIds: [] };
    if (!cur.viaOrgIds.includes(row.via_organization_id)) {
      cur.viaOrgIds.push(row.via_organization_id);
    }
    map.set(row.person_id, cur);
  }
  return map;
}
```

- [ ] **Step 7: Run tests — expect pass**

```bash
npm test
```
Expected: all `event-persons` tests pass.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json vitest.config.ts lib/queries/event-persons.ts lib/queries/event-persons.test.ts
git commit -m "feat(queries): event-persons helper + vitest at root"
```

---

## Task 5: `<EventRelationToggle>` shared UI component

**Files:**
- Create: `components/admin/event-relation-toggle.tsx`

- [ ] **Step 1: Build the component**

Create `components/admin/event-relation-toggle.tsx`:

```tsx
"use client";

import type { EventPersonRelation } from "@/lib/queries/event-persons";

export interface EventRelationToggleProps {
  speaker: boolean;
  orgAffiliated: boolean;
  onChange: (next: { speaker: boolean; orgAffiliated: boolean }) => void;
  disabled?: boolean;
}

export function EventRelationToggle({
  speaker,
  orgAffiliated,
  onChange,
  disabled,
}: EventRelationToggleProps) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <label className="flex items-center gap-1.5 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={speaker}
          disabled={disabled}
          onChange={(e) => onChange({ speaker: e.target.checked, orgAffiliated })}
          className="accent-current"
        />
        <span>Speaker</span>
      </label>
      <label className="flex items-center gap-1.5 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={orgAffiliated}
          disabled={disabled}
          onChange={(e) => onChange({ speaker, orgAffiliated: e.target.checked })}
          className="accent-current"
        />
        <span>Org-affiliated</span>
      </label>
    </div>
  );
}

export function toggleToRelation(
  speaker: boolean,
  orgAffiliated: boolean
): EventPersonRelation | null {
  if (speaker && orgAffiliated) return "either";
  if (speaker && !orgAffiliated) return "direct";
  if (!speaker && orgAffiliated) return "org_affiliated";
  return null; // both off -> empty set
}
```

- [ ] **Step 2: Smoke-check import**

```bash
npm run lint
```
Expected: no errors referencing this file.

- [ ] **Step 3: Commit**

```bash
git add components/admin/event-relation-toggle.tsx
git commit -m "feat(ui): EventRelationToggle shared component"
```

---

## Task 6: React Query hook for affiliations

**Files:**
- Modify: `lib/queries/query-keys.ts` — add `eventAffiliations` key factory
- Create: `lib/queries/use-event-affiliations.ts`

- [ ] **Step 1: Add query keys**

Open `lib/queries/query-keys.ts` and add (following existing key-factory style — read the file first and mimic):

```ts
export const eventAffiliationsKeys = {
  all: ["event-affiliations"] as const,
  byEvent: (eventId: string) => ["event-affiliations", "event", eventId] as const,
  personIdsForEvent: (eventId: string, relation: string) =>
    ["event-affiliations", "event", eventId, "ids", relation] as const,
};
```

- [ ] **Step 2: Create the hook**

Create `lib/queries/use-event-affiliations.ts`:

```ts
"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import {
  getPersonIdsForEvent,
  getPersonRelationsForEvent,
  type EventPersonRelation,
} from "./event-persons";
import { eventAffiliationsKeys } from "./query-keys";

export function useEventPersonIds(
  eventId: string | null,
  relation: EventPersonRelation | null
) {
  return useQuery({
    queryKey: eventAffiliationsKeys.personIdsForEvent(eventId ?? "", relation ?? "none"),
    queryFn: async () => {
      if (!eventId || !relation) return [] as string[];
      const supabase = createClient();
      return getPersonIdsForEvent(supabase, eventId, relation);
    },
    enabled: eventId !== null,
  });
}

export function useEventRelationMap(eventId: string | null) {
  return useQuery({
    queryKey: eventAffiliationsKeys.byEvent(eventId ?? ""),
    queryFn: async () => {
      if (!eventId) return new Map();
      const supabase = createClient();
      return getPersonRelationsForEvent(supabase, eventId);
    },
    enabled: eventId !== null,
  });
}
```

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit
```
Expected: no errors related to these new files.

- [ ] **Step 4: Commit**

```bash
git add lib/queries/query-keys.ts lib/queries/use-event-affiliations.ts
git commit -m "feat(queries): useEventPersonIds + useEventRelationMap hooks"
```

---

## Task 7: Persons list — event filter + toggle + badges

**Files:**
- Modify: `app/admin/persons/persons-table-client.tsx`
- Modify: `app/admin/persons/page.tsx` (if query/filter state is lifted)

- [ ] **Step 1: Read the current filter bar**

```bash
grep -n "filter\|useState\|filterBy\|EventFilter" app/admin/persons/persons-table-client.tsx | head -30
```

Identify where filter UI lives. The existing component already has a filter bar; we add:
- An event dropdown (use `useEvents()` from `lib/queries/use-events.ts`).
- An `<EventRelationToggle>` rendered only when an event is selected.
- Badge rendering per row.

- [ ] **Step 2: Add state + data fetching**

In `persons-table-client.tsx` near other `useState` calls, add:

```ts
const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
const [speakerOn, setSpeakerOn] = useState(true);
const [orgAffiliatedOn, setOrgAffiliatedOn] = useState(true);

const eventRelation = toggleToRelation(speakerOn, orgAffiliatedOn);
const { data: eventPersonIds } = useEventPersonIds(selectedEventId, eventRelation);
const { data: eventRelationMap } = useEventRelationMap(selectedEventId);
```

Add imports at the top:
```ts
import { EventRelationToggle, toggleToRelation } from "@/components/admin/event-relation-toggle";
import { useEventPersonIds, useEventRelationMap } from "@/lib/queries/use-event-affiliations";
import { useEvents } from "@/lib/queries/use-events";
```

- [ ] **Step 3: Render the filter UI**

In the filter bar JSX, after existing filters, add:

```tsx
<div className="flex items-center gap-2">
  <select
    value={selectedEventId ?? ""}
    onChange={(e) => setSelectedEventId(e.target.value || null)}
    className="bg-transparent border rounded px-2 py-1 text-sm"
  >
    <option value="">All events</option>
    {(events ?? []).map((ev) => (
      <option key={ev.id} value={ev.id}>{ev.name}</option>
    ))}
  </select>
  {selectedEventId && (
    <EventRelationToggle
      speaker={speakerOn}
      orgAffiliated={orgAffiliatedOn}
      onChange={({ speaker, orgAffiliated }) => {
        setSpeakerOn(speaker);
        setOrgAffiliatedOn(orgAffiliated);
      }}
    />
  )}
</div>
```

(`events` comes from `const { data: events } = useEvents();` — add near the other hooks.)

- [ ] **Step 4: Filter the rows**

Where the existing `rows` or `filteredPersons` array is computed, add:

```ts
const eventScopedIds = selectedEventId
  ? new Set(eventPersonIds ?? [])
  : null;

const rowsAfterEvent = eventScopedIds
  ? persons.filter((p) => eventScopedIds.has(p.id))
  : persons;
```

Then feed `rowsAfterEvent` into the existing chain. If `eventRelation === null` and `selectedEventId` is set, `eventPersonIds` will be `[]`, so `rowsAfterEvent` becomes empty — which matches the spec ("both off = empty set").

- [ ] **Step 5: Add row badges**

In the row renderer (search for where person name is rendered), append:

```tsx
{selectedEventId && eventRelationMap && (() => {
  const rel = eventRelationMap.get(row.id);
  if (!rel) return null;
  return (
    <span className="flex gap-1 ml-2">
      {rel.direct && (
        <span className="px-1.5 py-0.5 text-[10px] rounded bg-sky-500/20 text-sky-300">SPK</span>
      )}
      {rel.viaOrgIds.length > 0 && (
        <span className="px-1.5 py-0.5 text-[10px] rounded bg-amber-500/20 text-amber-300">ORG</span>
      )}
    </span>
  );
})()}
```

- [ ] **Step 6: Manual smoke test**

```bash
npm run dev
```
Open `/admin/persons`. Pick an event. Toggle each checkbox. Confirm:
- Both on: union
- Speaker off: only org-affiliated persons (with ORG badge)
- Both off: empty list
- Badges render correctly

- [ ] **Step 7: Commit**

```bash
git add app/admin/persons/persons-table-client.tsx app/admin/persons/page.tsx
git commit -m "feat(persons): event filter with speaker/org-affiliated toggle + badges"
```

---

## Task 8: Event detail page — replace derived block

**Files:**
- Modify: `app/admin/events/[id]/page.tsx`

- [ ] **Step 1: Locate the derived block**

```bash
grep -n "Related contacts\|sponsorPersonOrgs\|relatedPersonsMap" app/admin/events/[id]/page.tsx
```
Lines ~180–~230 contain the derived logic. These go away.

- [ ] **Step 2: Replace with a `person_event_affiliations` query**

Delete lines implementing `sponsorOrgIds → sponsorPersonOrgs → relatedPersonIds → relatedPersonsMap`. Replace with:

```ts
// Org-affiliated contacts via new table
const { data: affiliationRows } = await supabase
  .from("person_event_affiliations")
  .select("person_id, via_organization_id")
  .eq("event_id", id);

// Dedup rule: if a person is already in direct participations, exclude them here
const directPersonIds = new Set(
  (participations || [])
    .map((p: any) => p.person_id)
    .filter((pid): pid is string => Boolean(pid))
);

const affRows = (affiliationRows ?? []).filter(
  (r) => !directPersonIds.has(r.person_id)
);

// Group by person to aggregate via-orgs
const byPerson = new Map<string, string[]>();
for (const r of affRows) {
  const arr = byPerson.get(r.person_id) ?? [];
  arr.push(r.via_organization_id);
  byPerson.set(r.person_id, arr);
}

const relatedPersonIds = Array.from(byPerson.keys());

let relatedPersonsMap: Record<string, Person> = {};
if (relatedPersonIds.length > 0) {
  const { data: relatedPersons } = await supabase
    .from("persons")
    .select("*")
    .in("id", relatedPersonIds);
  for (const rp of relatedPersons || []) {
    relatedPersonsMap[rp.id] = rp as Person;
  }
}

// Build (reuse) org name lookup — if participations query doesn't already carry
// the org names we need, fetch them for all via_organization_ids in one go.
const viaOrgIds = Array.from(new Set(affRows.map((r) => r.via_organization_id)));
const { data: viaOrgs } = await supabase
  .from("organizations")
  .select("id, name")
  .in("id", viaOrgIds.length > 0 ? viaOrgIds : ["00000000-0000-0000-0000-000000000000"]);
const orgNameById: Record<string, string> = Object.fromEntries(
  (viaOrgs ?? []).map((o) => [o.id, o.name])
);
```

- [ ] **Step 3: Update row type + render**

Change the `RelatedContactRow` type (find it in the file, around line ~216) to:

```ts
type RelatedContactRow = {
  person: Person;
  viaOrgs: { id: string; name: string | null }[];
};
```

Build rows:

```ts
const relatedContactRows: RelatedContactRow[] = relatedPersonIds.map((pid) => ({
  person: relatedPersonsMap[pid]!,
  viaOrgs: (byPerson.get(pid) ?? []).map((orgId) => ({
    id: orgId,
    name: orgNameById[orgId] ?? null,
  })),
}));
```

Render chips (find the existing render loop — replace with):

```tsx
{relatedContactRows.map((row) => (
  <div key={row.person.id} className="flex items-center justify-between py-2">
    <Link href={`/admin/persons/${row.person.id}`} className="hover:underline">
      {row.person.full_name}
    </Link>
    <div className="flex gap-1">
      {row.viaOrgs.map((o) => (
        <Link
          key={o.id}
          href={`/admin/organizations/${o.id}`}
          className="px-2 py-0.5 text-xs rounded bg-white/10 hover:bg-white/20"
        >
          via {o.name ?? "—"}
        </Link>
      ))}
    </div>
  </div>
))}
```

- [ ] **Step 4: Manual smoke test**

```bash
npm run dev
```
Open `/admin/events/<id>` for an event with sponsors. Confirm:
- Direct participants still render as before.
- Org-affiliated section shows rows with via-org chips.
- No person appears in both sections.

- [ ] **Step 5: Commit**

```bash
git add app/admin/events/[id]/page.tsx
git commit -m "feat(events): drive related contacts from person_event_affiliations"
```

---

## Task 9: Person detail — event affiliations section

**Files:**
- Modify: `app/admin/persons/[id]/page.tsx`

- [ ] **Step 1: Fetch affiliations**

In the parallel data-fetches block, add:

```ts
const affiliationsP = supabase
  .from("person_event_affiliations")
  .select("event_id, via_organization_id")
  .eq("person_id", id);
```

And include `affiliationsP` in the Promise.all / destructure.

- [ ] **Step 2: Resolve event + org names**

```ts
const { data: affRows } = await affiliationsP;
const affEventIds = Array.from(new Set((affRows ?? []).map((r) => r.event_id)));
const affOrgIds = Array.from(new Set((affRows ?? []).map((r) => r.via_organization_id)));

const [affEventsRes, affOrgsRes] = await Promise.all([
  affEventIds.length > 0
    ? supabase.from("events").select("id, name").in("id", affEventIds)
    : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  affOrgIds.length > 0
    ? supabase.from("organizations").select("id, name").in("id", affOrgIds)
    : Promise.resolve({ data: [] as { id: string; name: string }[] }),
]);

const eventNameById = Object.fromEntries((affEventsRes.data ?? []).map((e) => [e.id, e.name]));
const orgNameById2 = Object.fromEntries((affOrgsRes.data ?? []).map((o) => [o.id, o.name]));
```

- [ ] **Step 3: Render a new "Event affiliations" section**

Next to the existing "Events" (direct participation) block, add:

```tsx
{(affRows?.length ?? 0) > 0 && (
  <GlassCard className="p-4">
    <h3 className="text-sm font-semibold mb-2">Event affiliations (via org)</h3>
    <ul className="space-y-1 text-sm">
      {affRows!.map((r, i) => (
        <li key={i} className="flex items-center justify-between">
          <Link href={`/admin/events/${r.event_id}`} className="hover:underline">
            {eventNameById[r.event_id] ?? "—"}
          </Link>
          <Link
            href={`/admin/organizations/${r.via_organization_id}`}
            className="px-2 py-0.5 text-xs rounded bg-white/10 hover:bg-white/20"
          >
            via {orgNameById2[r.via_organization_id] ?? "—"}
          </Link>
        </li>
      ))}
    </ul>
  </GlassCard>
)}
```

- [ ] **Step 4: Manual smoke test**

Open a person page for someone enriched via People Finder from a sponsor org. Confirm the new section renders with event name + via-org chip.

- [ ] **Step 5: Commit**

```bash
git add app/admin/persons/[id]/page.tsx
git commit -m "feat(persons): event affiliations section on detail page"
```

---

## Task 10: Enrichment — relation-aware filtering

**Files:**
- Modify: `app/api/enrich/persons/route.ts`
- Modify: `app/api/enrich/organizations/route.ts` (symmetric change if it accepts eventId)
- Modify: `app/admin/enrichment/enrichment-shell.tsx` — add toggle when event scope is selected

### 10a: API routes

- [ ] **Step 1: Update `/api/enrich/persons` eventId branch**

In `app/api/enrich/persons/route.ts`, replace the `eventId` branch (lines ~52–66) with:

```ts
} else if (eventId) {
  const relation = (body.relation ?? "either") as
    | "direct" | "org_affiliated" | "either" | "both";
  personIds = await getPersonIdsForEvent(supabase, eventId, relation);
}
```

Add the import at the top:
```ts
import { getPersonIdsForEvent } from "@/lib/queries/event-persons";
```

- [ ] **Step 2: Do the same in `/api/enrich/organizations/route.ts`**

```bash
grep -n "eventId\|event_participations" app/api/enrich/organizations/route.ts
```

If it also derives a person/org set from eventId, apply the same `getPersonIdsForEvent` replacement. Orgs-by-event derivation stays as is (orgs come from `event_participations` with `organization_id`).

- [ ] **Step 3: Verify request works**

Start dev server, hit the route with `curl`:

```bash
curl -X POST http://localhost:3000/api/enrich/persons \
  -H "Content-Type: application/json" \
  -d '{"eventId":"<EVENT_ID>","relation":"org_affiliated","dryRun":true}'
```

If the route doesn't support `dryRun`, use a small personIds set or check the log output for the resolved list length.

### 10b: Enrichment UI shell

- [ ] **Step 4: Add toggle next to event-scope selector**

Open `app/admin/enrichment/enrichment-shell.tsx`. Where the event-scope control lives (grep for it if unclear), add:

```tsx
import { EventRelationToggle, toggleToRelation } from "@/components/admin/event-relation-toggle";
// ...state:
const [speakerOn, setSpeakerOn] = useState(true);
const [orgAffiliatedOn, setOrgAffiliatedOn] = useState(true);
const relation = toggleToRelation(speakerOn, orgAffiliatedOn);
```

Render next to the event selector:
```tsx
{selectedEventId && (
  <EventRelationToggle
    speaker={speakerOn}
    orgAffiliated={orgAffiliatedOn}
    onChange={({ speaker, orgAffiliated }) => {
      setSpeakerOn(speaker);
      setOrgAffiliatedOn(orgAffiliated);
    }}
  />
)}
```

When firing the enrichment POST, include `relation` in the body (or omit when null — server treats missing as "either"; when null, disable the Run button).

- [ ] **Step 5: Manual smoke test**

Pick an event in `/admin/enrichment`, toggle org-affiliated-only, kick off enrichment (or inspect the request payload in devtools). Confirm the payload has `relation: "org_affiliated"`.

- [ ] **Step 6: Commit**

```bash
git add app/api/enrich/persons/route.ts app/api/enrich/organizations/route.ts app/admin/enrichment/enrichment-shell.tsx
git commit -m "feat(enrichment): event-scope relation toggle (direct / org-affiliated)"
```

---

## Task 11: Sequences — event-scoped enrollment toggle

**Files:**
- Modify: the sequence enrollment picker (confirm exact file via grep)

- [ ] **Step 1: Find the enrollment picker**

```bash
grep -rn "eventId\|event_participations" app/admin/sequences/ | head -20
```
Open the file that handles event-scoped person selection for enrollment.

- [ ] **Step 2: Replace direct-only person lookup with helper**

Wherever it currently does `.from("event_participations").select("person_id").eq("event_id", ...)`, replace with:

```ts
import { getPersonIdsForEvent } from "@/lib/queries/event-persons";
// ...
const relation = toggleToRelation(speakerOn, orgAffiliatedOn);
if (!relation) { /* both off: show 0 */ }
else {
  const personIds = await getPersonIdsForEvent(supabase, eventId, relation);
  // feed into enrollment creation
}
```

- [ ] **Step 3: Add the toggle to the UI**

Same pattern as Task 10b: render `<EventRelationToggle>` next to the event selector.

- [ ] **Step 4: Manual smoke test**

Create a new event-scoped enrollment; confirm with only "Org-affiliated" on, the count reflects the affiliation table.

- [ ] **Step 5: Commit**

```bash
git add app/admin/sequences/
git commit -m "feat(sequences): event-scoped enrollment honors speaker/org-affiliated toggle"
```

---

## Task 12: Organizations list/detail — propagation stats

**Files:**
- Modify: `app/admin/organizations/[id]/page.tsx` — add "N persons affiliated across M events"
- Modify: `app/admin/organizations/organizations-table-client.tsx` — add "Events propagated" column

- [ ] **Step 1: Org detail — fetch propagation**

In `app/admin/organizations/[id]/page.tsx`, add:

```ts
const { data: affRows } = await supabase
  .from("person_event_affiliations")
  .select("event_id, person_id")
  .eq("via_organization_id", id);

const affEventIds = Array.from(new Set((affRows ?? []).map((r) => r.event_id)));
const affPersonIds = Array.from(new Set((affRows ?? []).map((r) => r.person_id)));

const affEvents = affEventIds.length > 0
  ? (await supabase.from("events").select("id, name").in("id", affEventIds)).data ?? []
  : [];

const affPersonsPerEvent: Record<string, number> = {};
for (const r of (affRows ?? [])) {
  affPersonsPerEvent[r.event_id] = (affPersonsPerEvent[r.event_id] ?? 0) + 1;
}
```

- [ ] **Step 2: Org detail — render the stat block**

```tsx
<GlassCard className="p-4">
  <h3 className="text-sm font-semibold mb-2">
    Event propagation — {affPersonIds.length} persons across {affEventIds.length} events
  </h3>
  {affEvents.length === 0 ? (
    <p className="text-xs opacity-60">None yet.</p>
  ) : (
    <ul className="text-sm space-y-1">
      {affEvents.map((ev) => (
        <li key={ev.id} className="flex justify-between">
          <Link href={`/admin/events/${ev.id}`} className="hover:underline">{ev.name}</Link>
          <span className="opacity-70">{affPersonsPerEvent[ev.id] ?? 0} persons</span>
        </li>
      ))}
    </ul>
  )}
</GlassCard>
```

- [ ] **Step 3: Org list — propagation column**

In `app/admin/organizations/organizations-table-client.tsx`:

- Fetch the counts: one extra query (or compute from the existing org-loading hook) grouping affiliations by `via_organization_id`. Easiest: add a Postgres RPC or use a CSV of org_ids to query. For now (YAGNI), do a single query on page load:

```ts
const { data: allAff } = await supabase
  .from("person_event_affiliations")
  .select("via_organization_id, event_id");
const eventsByOrg: Record<string, Set<string>> = {};
for (const r of allAff ?? []) {
  (eventsByOrg[r.via_organization_id] ??= new Set()).add(r.event_id);
}
// countByOrg: Record<string, number> = Object.fromEntries(Object.entries(eventsByOrg).map(([k,v]) => [k, v.size]))
```

Expose `countByOrg[orgId] ?? 0` as a sortable column header "Events propagated."

(If the page uses server fetch, put this on the server side; if it uses `useOrganizations`, add a separate `useOrgPropagation` hook mirroring the shape.)

- [ ] **Step 4: Manual smoke test**

Open `/admin/organizations` — confirm new column populates. Open a sponsor org's detail page — confirm stat block.

- [ ] **Step 5: Commit**

```bash
git add app/admin/organizations/
git commit -m "feat(orgs): event-propagation stat block + list column"
```

---

## Task 13: End-to-end verification + final commit

- [ ] **Step 1: Re-run DB verification script**

```bash
npx tsx scripts/verify-event-affiliations.ts
```
Expected: `ALL SCENARIOS PASSED`.

- [ ] **Step 2: Re-run unit tests**

```bash
npm test
```
Expected: all pass.

- [ ] **Step 3: Typecheck + lint**

```bash
npx tsc --noEmit
npm run lint
```
Expected: no errors.

- [ ] **Step 4: Manual end-to-end smoke**

1. Pick an event with sponsor orgs in `/admin/events/<id>` — confirm Direct + Org-affiliated sections.
2. Navigate to an org-affiliated person's page — confirm Event affiliations section.
3. `/admin/persons` with event filter + both toggles — confirm set size = direct + org-affiliated (deduped).
4. `/admin/enrichment` kick off with event + Org-affiliated only — confirm payload.
5. Enroll a sequence event-scoped with only Speaker on — confirm count equals direct only.
6. `/admin/organizations` — confirm Events propagated column populates.

- [ ] **Step 5: Update memory**

Run (outside the plan, but note here): after merge, add a memory entry documenting the new `person_event_affiliations` table and trigger behavior so future sessions know it exists.

- [ ] **Step 6: Final commit & push**

```bash
git status
# If anything uncommitted, commit appropriately.
git push
```

---

## Notes for the implementing agent

- **Trigger migrations are not safely reversible without data cleanup.** If you need to drop and recreate the table in dev, run `DROP TABLE person_event_affiliations CASCADE; DROP FUNCTION tg_pea_sync_from_person_org(); DROP FUNCTION tg_pea_sync_from_event_participation();` and re-apply.
- **Prod rollout order:** apply migration → backfill runs inline → deploy app changes. Because backfill is idempotent and the new table is only read by code shipped in Task 4+ and later, there is no window where readers see a half-populated table.
- **Do not add columns to `event_participations`** in this plan — the explicit architectural decision is a separate table.
- **Do not propagate non-current `person_organization` rows** — the propagation rule is current-only.
- **Terminology in UI:** "Org-affiliated," not "Sponsor-affiliated." The propagation rule is any org participation, not sponsor-specific.
