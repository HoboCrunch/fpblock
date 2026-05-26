import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Supabase client mock
// ---------------------------------------------------------------------------
// A chainable query-builder that records every write (insert/update) per table
// and lets each test control what the existence-check selects return.
//
// Call shapes exercised by the import actions:
//   - uploads:               .insert().select().single()    (insertUploadRow)
//                            .update().eq()                 (finalizeUploadRow)
//   - organizations:         .select().ilike().maybeSingle()  (dedupe)
//                            .insert().select().single()      (create)
//   - persons:               .select().eq().maybeSingle()     (dedupe)
//                            .insert().select().single()      (create)
//   - person_organization:   .upsert()
//   - event_participations:  .select().eq().eq().eq().maybeSingle()  (existence)
//                            .insert(row)                          (append)
//                            .update(row).eq()                     (merge)

interface Recorded {
  table: string;
  op: "insert" | "update" | "upsert";
  payload: unknown;
}

function makeClient(opts: {
  // existing event_participations row returned by the existence check (or null)
  existingParticipation?: { id: string } | null;
  // existing organization returned by dedupe ilike (or null)
  existingOrg?: { id: string } | null;
  // existing person returned by dedupe (or null)
  existingPerson?: { id: string } | null;
}) {
  const records: Recorded[] = [];
  let uploadInsertCount = 0;
  let orgInsertCount = 0;
  let personInsertCount = 0;

  function from(table: string) {
    // builder is a thenable chain; terminal awaits resolve to { data }
    const builder: Record<string, unknown> = {};

    const selfReturning = ["select", "eq", "ilike", "not", "limit", "order"];
    for (const m of selfReturning) {
      builder[m] = vi.fn(() => builder);
    }

    builder.maybeSingle = vi.fn(async () => {
      if (table === "event_participations") {
        return { data: opts.existingParticipation ?? null, error: null };
      }
      if (table === "organizations") {
        return { data: opts.existingOrg ?? null, error: null };
      }
      if (table === "persons") {
        return { data: opts.existingPerson ?? null, error: null };
      }
      return { data: null, error: null };
    });

    builder.single = vi.fn(async () => {
      if (table === "uploads") {
        uploadInsertCount++;
        return { data: { id: `upload-${uploadInsertCount}` }, error: null };
      }
      if (table === "organizations") {
        orgInsertCount++;
        return { data: { id: `org-new-${orgInsertCount}` }, error: null };
      }
      if (table === "persons") {
        personInsertCount++;
        return { data: { id: `person-new-${personInsertCount}` }, error: null };
      }
      return { data: { id: "x" }, error: null };
    });

    builder.insert = vi.fn((payload: unknown) => {
      records.push({ table, op: "insert", payload });
      // insert can be terminal (event_participations) or chained (.select().single())
      return builder;
    });

    builder.update = vi.fn((payload: unknown) => {
      records.push({ table, op: "update", payload });
      return builder;
    });

    builder.upsert = vi.fn((payload: unknown) => {
      records.push({ table, op: "upsert", payload });
      return builder;
    });

    // Make terminal awaits (e.g. .insert(...) with no select, .update().eq())
    // resolve cleanly.
    builder.then = (resolve: (v: { data: null; error: null }) => unknown) =>
      resolve({ data: null, error: null });

    return builder;
  }

  return {
    client: { from: vi.fn(from) } as unknown,
    records,
  };
}

// Hoisted mock state so the createClient mock can read the current client.
const state = vi.hoisted(() => ({
  current: null as unknown,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => state.current),
}));

import { importPersons, importOrganizations } from "./actions";

function participationWrites(records: Recorded[]) {
  return records.filter((r) => r.table === "event_participations");
}

describe("importPersons — forcedEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("writes a participation with the forced event_id and role, ignoring row.event", async () => {
    const { client, records } = makeClient({
      existingPerson: null,
      existingParticipation: null,
    });
    state.current = client;

    await importPersons(
      [{ full_name: "Ada Lovelace", email: "ada@example.com", event: "Some Other Event" }],
      {
        duplicateHandling: "create_new",
        eventMap: { "Some Other Event": "event-from-column" },
        forcedEvent: { id: "forced-event-id", role: "speaker" },
      },
      "people.csv",
    );

    const writes = participationWrites(records);
    expect(writes).toHaveLength(1);
    expect(writes[0].op).toBe("insert");
    expect(writes[0].payload).toMatchObject({
      event_id: "forced-event-id",
      role: "speaker",
      person_id: "person-new-1",
    });
    // The eventMap event id from the row.event column must NOT be used.
    expect(JSON.stringify(writes[0].payload)).not.toContain("event-from-column");
    expect(JSON.stringify(writes[0].payload)).not.toContain("attendee");
  });

  it("appends a participation for an EXISTING (skipped) person to the forced event", async () => {
    const { client, records } = makeClient({
      existingPerson: { id: "existing-person-1" },
      existingParticipation: null,
    });
    state.current = client;

    await importPersons(
      [{ full_name: "Ada Lovelace", email: "ada@example.com" }],
      {
        duplicateHandling: "skip",
        eventMap: {},
        forcedEvent: { id: "forced-event-id", role: "panelist" },
      },
      "people.csv",
    );

    const writes = participationWrites(records);
    expect(writes).toHaveLength(1);
    expect(writes[0].op).toBe("insert");
    expect(writes[0].payload).toMatchObject({
      event_id: "forced-event-id",
      role: "panelist",
      person_id: "existing-person-1",
    });
  });
});

describe("importOrganizations — forcedEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("writes a participation with the forced role and sponsor_tier", async () => {
    const { client, records } = makeClient({
      existingOrg: null,
      existingParticipation: null,
    });
    state.current = client;

    await importOrganizations(
      [{ name: "Acme Corp", event: "Ignored Event" }],
      {
        duplicateHandling: "create_new",
        eventMap: { "Ignored Event": "event-from-column" },
        forcedEvent: { id: "forced-event-id", role: "partner", sponsorTier: "gold" },
      },
      "orgs.csv",
    );

    const writes = participationWrites(records);
    expect(writes).toHaveLength(1);
    expect(writes[0].op).toBe("insert");
    expect(writes[0].payload).toMatchObject({
      event_id: "forced-event-id",
      role: "partner",
      sponsor_tier: "gold",
      organization_id: "org-new-1",
    });
    expect(JSON.stringify(writes[0].payload)).not.toContain("event-from-column");
  });

  it("forces sponsor_tier to null when not provided", async () => {
    const { client, records } = makeClient({
      existingOrg: null,
      existingParticipation: null,
    });
    state.current = client;

    await importOrganizations(
      [{ name: "Beta Inc" }],
      {
        duplicateHandling: "create_new",
        eventMap: {},
        forcedEvent: { id: "forced-event-id", role: "exhibitor" },
      },
      "orgs.csv",
    );

    const writes = participationWrites(records);
    expect(writes).toHaveLength(1);
    expect(writes[0].payload).toMatchObject({
      event_id: "forced-event-id",
      role: "exhibitor",
      sponsor_tier: null,
    });
  });
});

describe("upsert behavior (insert vs update)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("inserts a new participation when the existence check returns null", async () => {
    const { client, records } = makeClient({
      existingPerson: null,
      existingParticipation: null,
    });
    state.current = client;

    await importPersons(
      [{ full_name: "New Person", email: "new@example.com" }],
      {
        duplicateHandling: "create_new",
        eventMap: {},
        forcedEvent: { id: "forced-event-id", role: "attendee" },
      },
      "people.csv",
    );

    const writes = participationWrites(records);
    expect(writes).toHaveLength(1);
    expect(writes[0].op).toBe("insert");
  });

  it("updates the existing row (no duplicate insert) when the same (event,entity,role) exists", async () => {
    const { client, records } = makeClient({
      existingOrg: { id: "org-existing-1" },
      // existence check for event_participations finds a matching row
      existingParticipation: { id: "participation-1" },
    });
    state.current = client;

    await importOrganizations(
      [{ name: "Acme Corp" }],
      {
        duplicateHandling: "skip",
        eventMap: {},
        forcedEvent: { id: "forced-event-id", role: "sponsor", sponsorTier: "platinum" },
      },
      "orgs.csv",
    );

    const writes = participationWrites(records);
    // One update, zero inserts on the participations table.
    expect(writes.filter((w) => w.op === "insert")).toHaveLength(0);
    const updates = writes.filter((w) => w.op === "update");
    expect(updates).toHaveLength(1);
    // Mergeable field (sponsor_tier) is applied on update.
    expect(updates[0].payload).toMatchObject({ sponsor_tier: "platinum" });
  });
});
