import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  importPersonRow,
  importOrgRow,
  processImportJob,
  type ImportConfig,
} from "./import-runner";
import type { SupabaseClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Supabase client mock
// ---------------------------------------------------------------------------
// A chainable query-builder that records every write (insert/update/upsert) per
// table and lets each test control what the existence-check selects return.
//
// Call shapes exercised by the per-row import helpers:
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
    client: { from: vi.fn(from) } as unknown as SupabaseClient,
    records,
  };
}

function participationWrites(records: Recorded[]) {
  return records.filter((r) => r.table === "event_participations");
}

describe("importPersonRow — forcedEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("writes a participation with the forced event_id and role, ignoring row.event", async () => {
    const { client, records } = makeClient({
      existingPerson: null,
      existingParticipation: null,
    });

    const config: ImportConfig = {
      mode: "persons",
      duplicateHandling: "create_new",
      eventMap: { "Some Other Event": "event-from-column" },
      forcedEvent: { id: "forced-event-id", role: "speaker" },
    };

    await importPersonRow(
      client,
      { full_name: "Ada Lovelace", email: "ada@example.com", event: "Some Other Event" },
      config,
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

    const config: ImportConfig = {
      mode: "persons",
      duplicateHandling: "skip",
      eventMap: {},
      forcedEvent: { id: "forced-event-id", role: "panelist" },
    };

    await importPersonRow(
      client,
      { full_name: "Ada Lovelace", email: "ada@example.com" },
      config,
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

describe("importOrgRow — forcedEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("writes a participation with the forced role and sponsor_tier", async () => {
    const { client, records } = makeClient({
      existingOrg: null,
      existingParticipation: null,
    });

    const config: ImportConfig = {
      mode: "organizations",
      duplicateHandling: "create_new",
      eventMap: { "Ignored Event": "event-from-column" },
      forcedEvent: { id: "forced-event-id", role: "partner", sponsorTier: "gold" },
    };

    await importOrgRow(client, { name: "Acme Corp", event: "Ignored Event" }, config);

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

    const config: ImportConfig = {
      mode: "organizations",
      duplicateHandling: "create_new",
      eventMap: {},
      forcedEvent: { id: "forced-event-id", role: "exhibitor" },
    };

    await importOrgRow(client, { name: "Beta Inc" }, config);

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

    const config: ImportConfig = {
      mode: "persons",
      duplicateHandling: "create_new",
      eventMap: {},
      forcedEvent: { id: "forced-event-id", role: "attendee" },
    };

    await importPersonRow(
      client,
      { full_name: "New Person", email: "new@example.com" },
      config,
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

    const config: ImportConfig = {
      mode: "organizations",
      duplicateHandling: "skip",
      eventMap: {},
      forcedEvent: { id: "forced-event-id", role: "sponsor", sponsorTier: "platinum" },
    };

    await importOrgRow(client, { name: "Acme Corp" }, config);

    const writes = participationWrites(records);
    // One update, zero inserts on the participations table.
    expect(writes.filter((w) => w.op === "insert")).toHaveLength(0);
    const updates = writes.filter((w) => w.op === "update");
    expect(updates).toHaveLength(1);
    // Mergeable field (sponsor_tier) is applied on update.
    expect(updates[0].payload).toMatchObject({ sponsor_tier: "platinum" });
  });
});

// ---------------------------------------------------------------------------
// processImportJob — resume / progress / atomic-claim mock
// ---------------------------------------------------------------------------
// Models a single mutable job_log row, a Storage payload, and the per-row
// tables (every person insert succeeds). Records each job_log update so tests
// can assert the progress counters that were persisted.

function makeJobClient(opts: {
  jobRow: {
    status: string;
    progress_total: number;
    progress_completed?: number;
    progress_failed?: number;
    metadata: Record<string, unknown>;
  };
  payload: { mode: "persons" | "organizations"; rows: unknown[]; config: ImportConfig };
}) {
  // The single job_log row, mutated in place by updates.
  const job: Record<string, unknown> = {
    id: "job-1",
    status: opts.jobRow.status,
    progress_total: opts.jobRow.progress_total,
    progress_completed: opts.jobRow.progress_completed ?? 0,
    progress_failed: opts.jobRow.progress_failed ?? 0,
    metadata: { ...opts.jobRow.metadata },
  };

  const jobUpdates: Array<Record<string, unknown>> = [];
  // How many rows the claim allowed to proceed (claim returns rows or not).
  let claimSucceeded = true;

  function from(table: string) {
    const builder: Record<string, unknown> = {};
    const captured: { op?: string; payload?: Record<string, unknown>; isClaim?: boolean } = {};

    const selfReturning = ["select", "eq", "ilike", "not", "limit", "order", "in"];
    for (const m of selfReturning) {
      builder[m] = vi.fn(() => builder);
    }

    // .or(...) is used by the atomic claim (pending OR stale-processing)
    builder.or = vi.fn(() => {
      captured.isClaim = true;
      return builder;
    });

    builder.insert = vi.fn(() => builder);
    builder.upsert = vi.fn(() => builder);

    builder.update = vi.fn((payload: Record<string, unknown>) => {
      captured.op = "update";
      captured.payload = payload;
      // The claim's update is gated on .then (only applied if the claim wins);
      // all other job_log updates apply immediately here.
      if (table === "job_log" && !captured.isClaim) {
        const next = { ...payload };
        if (next.metadata) {
          next.metadata = { ...(job.metadata as object), ...(next.metadata as object) };
        }
        Object.assign(job, next);
        jobUpdates.push(payload);
      }
      return builder;
    });

    builder.single = vi.fn(async () => {
      if (table === "job_log") {
        return {
          data: {
            status: job.status,
            progress_total: job.progress_total,
            progress_completed: job.progress_completed,
            progress_failed: job.progress_failed,
            metadata: job.metadata,
          },
          error: null,
        };
      }
      if (table === "persons") return { data: { id: "person-x" }, error: null };
      if (table === "organizations") return { data: { id: "org-x" }, error: null };
      if (table === "uploads") return { data: { id: "upload-x" }, error: null };
      return { data: { id: "x" }, error: null };
    });

    builder.maybeSingle = vi.fn(async () => ({ data: null, error: null }));

    // The atomic claim ends in .or(...).select() and is awaited for its rows.
    // We model it as: claimable when current status is pending/processing AND
    // no other runner has grabbed it (claimSucceeded). Applying the update only
    // happens here so a lost claim never mutates the job.
    builder.then = (resolve: (v: { data: unknown; error: null }) => unknown) => {
      if (table === "job_log" && captured.op === "update" && captured.isClaim) {
        const claimable =
          (job.status === "pending" || job.status === "processing") && claimSucceeded;
        if (claimable) {
          const next = { ...(captured.payload ?? {}) };
          Object.assign(job, next);
          jobUpdates.push(captured.payload ?? {});
        }
        return resolve({ data: claimable ? [{ id: "job-1" }] : [], error: null });
      }
      return resolve({ data: null, error: null });
    };

    return builder;
  }

  const storage = {
    from: vi.fn(() => ({
      download: vi.fn(async () => ({
        data: { text: async () => JSON.stringify(opts.payload) },
        error: null,
      })),
    })),
  };

  return {
    client: { from: vi.fn(from), storage } as unknown as SupabaseClient,
    job,
    jobUpdates,
    setClaimSucceeded: (v: boolean) => {
      claimSucceeded = v;
    },
  };
}

describe("processImportJob — resume keeps progress cumulative", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("seeds progress_completed from the already-processed offset on a resumed run", async () => {
    // 10 total rows; a prior run already imported 7 (processed_offset = 7).
    const rows = Array.from({ length: 10 }, (_, i) => ({
      full_name: `Person ${i}`,
      email: `p${i}@example.com`,
    }));

    const config: ImportConfig = {
      mode: "persons",
      duplicateHandling: "create_new",
      eventMap: {},
      forcedEvent: null,
    };

    const { client, job } = makeJobClient({
      jobRow: {
        // A genuinely-stalled job is stored as 'processing' with a stale
        // heartbeat; the claim reclaims it via the processing branch.
        status: "processing",
        progress_total: 10,
        progress_completed: 7,
        progress_failed: 0,
        metadata: {
          mode: "persons",
          duplicateHandling: "create_new",
          eventMap: {},
          forcedEvent: null,
          filename: "f.csv",
          storage_path: "p/f.json",
          processed_offset: 7,
          recent_errors: [],
          uploads_row_id: "upload-1",
        },
      },
      payload: { mode: "persons", rows, config },
    });

    await processImportJob(client, "job-1");

    // After the resume, the job must reflect the CUMULATIVE total (10), not the
    // 3 rows processed by this run.
    expect(job.status).toBe("completed");
    expect(job.progress_completed).toBe(10);
    expect(job.progress_failed).toBe(0);
    expect((job.metadata as { processed_offset: number }).processed_offset).toBe(10);
  });

  it("checkpoints processed_offset after every row so a crash never re-imports", async () => {
    const rows = Array.from({ length: 3 }, (_, i) => ({
      full_name: `Person ${i}`,
      email: `p${i}@example.com`,
    }));

    const config: ImportConfig = {
      mode: "persons",
      duplicateHandling: "create_new",
      eventMap: {},
      forcedEvent: null,
    };

    const { client, jobUpdates } = makeJobClient({
      jobRow: {
        status: "pending",
        progress_total: 3,
        metadata: {
          mode: "persons",
          duplicateHandling: "create_new",
          eventMap: {},
          forcedEvent: null,
          filename: "f.csv",
          storage_path: "p/f.json",
          processed_offset: 0,
          recent_errors: [],
          uploads_row_id: "upload-1",
        },
      },
      payload: { mode: "persons", rows, config },
    });

    await processImportJob(client, "job-1");

    // Collect every processed_offset that was persisted (in order).
    const offsets = jobUpdates
      .filter((u) => u.metadata && typeof (u.metadata as Record<string, unknown>).processed_offset === "number")
      .map((u) => (u.metadata as { processed_offset: number }).processed_offset);

    // With per-row checkpointing we expect monotonically increasing offsets that
    // reach every row index (1, 2, 3), not just the final 3.
    expect(offsets).toContain(1);
    expect(offsets).toContain(2);
    expect(offsets[offsets.length - 1]).toBe(3);
  });
});

describe("processImportJob — atomic claim prevents double processing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("bails without importing rows when the claim returns zero rows (already claimed)", async () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({
      full_name: `Person ${i}`,
      email: `p${i}@example.com`,
    }));

    const config: ImportConfig = {
      mode: "persons",
      duplicateHandling: "create_new",
      eventMap: {},
      forcedEvent: null,
    };

    const { client, job, setClaimSucceeded } = makeJobClient({
      jobRow: {
        status: "pending",
        progress_total: 5,
        metadata: {
          mode: "persons",
          duplicateHandling: "create_new",
          eventMap: {},
          forcedEvent: null,
          filename: "f.csv",
          storage_path: "p/f.json",
          processed_offset: 0,
          recent_errors: [],
          uploads_row_id: "upload-1",
        },
      },
      payload: { mode: "persons", rows, config },
    });

    // Simulate another runner having already claimed the job.
    setClaimSucceeded(false);

    await processImportJob(client, "job-1");

    // No work done — status not flipped to completed, no rows imported.
    expect(job.progress_completed).toBe(0);
    expect(job.status).not.toBe("completed");
  });
});
