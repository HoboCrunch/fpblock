import { describe, it, expect, beforeEach } from "vitest";
import { runGenerate, type ServiceClient } from "./generate";
import type { SequenceStep } from "@/lib/types/database";

// ─────────────────────────────────────────────────────────────────────────────
// In-memory fake Supabase client
//
// runGenerate only touches a handful of tables with a small set of chainable
// query shapes. We model the relational state directly and implement just
// enough of the PostgREST builder surface (select/eq/limit/single/insert/
// upsert/update) for the code under test. Each table builder is a thenable so
// `await supabase.from(t).select().eq(...)` resolves to `{ data, error }`.
//
// Idempotency is the central behaviour we assert, so the fake enforces the
// (sequence_id, person_id, sequence_step) uniqueness that migration 038 backs
// in prod: upsert with ignoreDuplicates is a no-op when a matching row exists.
// ─────────────────────────────────────────────────────────────────────────────

interface FakeDB {
  sequence_enrollments: Record<string, unknown>[];
  person_organizations: Record<string, unknown>[];
  events: Record<string, unknown>[];
  sender_profiles: Record<string, unknown>[];
  interactions: Record<string, unknown>[];
}

function matches(
  row: Record<string, unknown>,
  filters: [string, unknown][]
): boolean {
  return filters.every(([col, val]) => {
    // The enrollment query uses "sequences.status" — a joined-table filter.
    // Our enrollment rows carry an embedded `sequences` object, so resolve it.
    if (col.includes(".")) {
      const [rel, field] = col.split(".");
      const embedded = row[rel] as Record<string, unknown> | undefined;
      return embedded?.[field] === val;
    }
    return row[col] === val;
  });
}

function makeFake(db: FakeDB) {
  function builder(table: keyof FakeDB) {
    const filters: [string, unknown][] = [];
    let limitN: number | null = null;
    let pendingInsert: Record<string, unknown> | null = null;
    let pendingUpsert: {
      row: Record<string, unknown>;
      onConflict: string;
      ignoreDuplicates: boolean;
    } | null = null;
    let pendingUpdate: Record<string, unknown> | null = null;

    const api: Record<string, unknown> = {};

    api.select = () => api;
    api.eq = (col: string, val: unknown) => {
      filters.push([col, val]);
      return api;
    };
    api.limit = (n: number) => {
      limitN = n;
      return api;
    };
    api.insert = (row: Record<string, unknown>) => {
      pendingInsert = row;
      return api;
    };
    api.upsert = (
      row: Record<string, unknown>,
      opts?: { onConflict?: string; ignoreDuplicates?: boolean }
    ) => {
      pendingUpsert = {
        row,
        onConflict: opts?.onConflict ?? "",
        ignoreDuplicates: opts?.ignoreDuplicates ?? false,
      };
      return api;
    };
    api.update = (row: Record<string, unknown>) => {
      pendingUpdate = row;
      return api;
    };

    function run(): { data: unknown; error: null } {
      // Mutations apply against the matched set / conflict tuple.
      if (pendingUpdate) {
        for (const row of db[table]) {
          if (matches(row, filters)) Object.assign(row, pendingUpdate);
        }
        return { data: null, error: null };
      }
      if (pendingUpsert) {
        const { row, onConflict, ignoreDuplicates } = pendingUpsert;
        const cols = onConflict.split(",").map((c) => c.trim());
        const exists = db[table].some((r) =>
          cols.every((c) => r[c] === row[c])
        );
        if (exists && ignoreDuplicates) {
          return { data: null, error: null };
        }
        if (!exists) db[table].push({ ...row });
        return { data: null, error: null };
      }
      if (pendingInsert) {
        db[table].push({ ...pendingInsert });
        return { data: null, error: null };
      }
      // Read path.
      let result = db[table].filter((r) => matches(r, filters));
      if (limitN !== null) result = result.slice(0, limitN);
      return { data: result, error: null };
    }

    api.single = () => {
      const { data } = run();
      const arr = data as Record<string, unknown>[];
      return Promise.resolve({ data: arr[0] ?? null, error: null });
    };

    // Thenable: awaiting the builder runs the query.
    api.then = (
      resolve: (v: { data: unknown; error: null }) => unknown,
      reject?: (e: unknown) => unknown
    ) => {
      try {
        return Promise.resolve(run()).then(resolve, reject);
      } catch (e) {
        return Promise.reject(e).then(resolve, reject);
      }
    };

    return api;
  }

  return {
    from: (table: keyof FakeDB) => builder(table),
    functions: {
      // No AI blocks in these fixtures, so this should never be hit; stub it
      // to fail loudly if it ever is.
      invoke: async () => {
        throw new Error("functions.invoke should not be called for plain templates");
      },
    },
  } as unknown as ServiceClient & { __db: FakeDB };
}

// ── Fixtures ────────────────────────────────────────────────────────────────

function textTemplate(content: string): SequenceStep["body_template"] {
  return {
    blocks: [{ type: "text", content }],
  } as unknown as SequenceStep["body_template"];
}

function plainStep(stepNumber: number, delay_days: number): SequenceStep {
  return {
    step_number: stepNumber,
    delay_days,
    action_type: stepNumber === 1 ? "initial" : "follow_up",
    subject_template: textTemplate(`Subject ${stepNumber}`),
    body_template: textTemplate(`Body ${stepNumber}`),
  };
}

const SEQ_ID = "seq-1";
const PERSON_ID = "person-1";
const ENROLLMENT_ID = "enr-1";

function freshDB(): FakeDB {
  const steps = [plainStep(1, 0), plainStep(2, 3)];
  return {
    sequence_enrollments: [
      {
        id: ENROLLMENT_ID,
        sequence_id: SEQ_ID,
        person_id: PERSON_ID,
        current_step: 0,
        status: "active",
        enrolled_at: "2026-05-26T00:00:00.000Z",
        sequences: {
          id: SEQ_ID,
          name: "Test Sequence",
          channel: "email",
          status: "active",
          send_mode: "auto",
          sender_id: null,
          event_id: null,
          schedule_config: { timing_mode: "relative" },
          steps,
        },
        persons: {
          id: PERSON_ID,
          full_name: "Ada Lovelace",
          first_name: "Ada",
          last_name: "Lovelace",
          email: "ada@example.com",
        },
      },
    ],
    person_organizations: [],
    events: [],
    sender_profiles: [],
    interactions: [],
  };
}

describe("runGenerate", () => {
  let db: FakeDB;
  let supabase: ServiceClient;

  beforeEach(() => {
    db = freshDB();
    supabase = makeFake(db);
  });

  it("idempotency: a second full run inserts nothing new", async () => {
    const first = await runGenerate(supabase, { sequenceId: SEQ_ID });
    expect(first.generated).toBe(2);
    expect(first.failed).toBe(0);
    expect(db.interactions).toHaveLength(2);

    // Re-activate the enrollment so the second run's query still matches it
    // (mirrors an overlapping eager + cron run hitting the same enrollment).
    db.sequence_enrollments[0].status = "active";
    db.sequence_enrollments[0].current_step = 0;

    const second = await runGenerate(supabase, { sequenceId: SEQ_ID });
    expect(second.generated).toBe(0);
    // Each (sequence_id, person_id, sequence_step) row exists at most once.
    expect(db.interactions).toHaveLength(2);
    const keys = db.interactions.map(
      (r) => `${r.sequence_id}|${r.person_id}|${r.sequence_step}`
    );
    expect(new Set(keys).size).toBe(2);
  });

  it("stepFilter scopes generation to the targeted step only", async () => {
    const result = await runGenerate(supabase, {
      sequenceId: SEQ_ID,
      stepFilter: 1,
    });
    expect(result.generated).toBe(1);
    expect(db.interactions).toHaveLength(1);
    expect(db.interactions[0].sequence_step).toBe(1);
  });

  it("advances the enrollment to completed after a full run", async () => {
    const steps = (db.sequence_enrollments[0].sequences as { steps: unknown[] })
      .steps;
    await runGenerate(supabase, { sequenceId: SEQ_ID });
    const enr = db.sequence_enrollments[0];
    expect(enr.current_step).toBe(steps.length);
    expect(enr.status).toBe("completed");
  });

  it("does NOT advance the enrollment on a scoped stepFilter run", async () => {
    await runGenerate(supabase, { sequenceId: SEQ_ID, stepFilter: 0 });
    const enr = db.sequence_enrollments[0];
    expect(enr.current_step).toBe(0);
    expect(enr.status).toBe("active");
  });
});
