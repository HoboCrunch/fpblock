import { describe, it, expect, beforeEach, vi } from "vitest";

// FIX C — re-enrolling must be non-destructive.
//
// `enrollPersons` (app/admin/sequences/actions.ts) upserts sequence_enrollments
// on conflict (sequence_id, person_id). Re-running an enroll (e.g. "enroll from
// list" over the whole list again) must NOT reset current_step→0 /
// status→active for people who are already mid-sequence, paused, or completed.
// The fix is ignoreDuplicates:true, so only genuinely new (sequence, person)
// pairs are inserted.
//
// Server actions use the cookie-based supabase server client, so we mock that
// module with a tiny in-memory fake that models the upsert's ON CONFLICT
// semantics (ignoreDuplicates = skip existing, insert only new) and captures
// the options the action passed.

interface EnrollmentRow {
  sequence_id: string;
  person_id: string;
  current_step: number;
  status: string;
}

const SEQ = "seq-1";

// Shared mutable state the fake reads/writes; reset per test.
const state: {
  enrollments: EnrollmentRow[];
  lastUpsertOpts: { onConflict?: string; ignoreDuplicates?: boolean } | null;
} = { enrollments: [], lastUpsertOpts: null };

function fakeUpsert(
  rows: EnrollmentRow[],
  opts?: { onConflict?: string; ignoreDuplicates?: boolean }
) {
  state.lastUpsertOpts = opts ?? null;
  const cols = (opts?.onConflict ?? "").split(",").map((c) => c.trim());
  for (const row of rows) {
    const existing = state.enrollments.find((e) =>
      cols.every(
        (c) =>
          (e as unknown as Record<string, unknown>)[c] ===
          (row as unknown as Record<string, unknown>)[c]
      )
    );
    if (existing) {
      if (opts?.ignoreDuplicates) {
        // Non-destructive: leave the existing row exactly as-is.
        continue;
      }
      Object.assign(existing, row); // legacy clobbering behaviour
    } else {
      state.enrollments.push({ ...row });
    }
  }
  return Promise.resolve({ error: null });
}

const fakeClient = {
  from(table: string) {
    if (table === "sequence_enrollments") {
      return { upsert: fakeUpsert };
    }
    if (table === "sequences") {
      // status lookup after enroll → treat as draft so generation is skipped.
      return {
        select: () => ({
          eq: () => ({
            single: () =>
              Promise.resolve({ data: { status: "draft" }, error: null }),
          }),
        }),
      };
    }
    throw new Error(`unexpected table ${table}`);
  },
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => fakeClient,
}));

// applySequenceEnrollFilters normally drops bounced / already-active-elsewhere.
// For this unit it must pass through all requested ids (the same-sequence
// re-add guard is the upsert's job, per lib/segments.ts).
vi.mock("@/lib/segments", () => ({
  applySequenceEnrollFilters: async (
    _supabase: unknown,
    _sequenceId: string,
    ids: string[]
  ) => ({ ids, dropped: { bounced: 0, already_in_active_sequence: 0 } }),
}));

vi.mock("@/lib/sequences/trigger-generation", () => ({
  triggerSequenceGeneration: async () => {},
}));

// Import AFTER mocks are registered.
import { enrollPersons } from "@/app/admin/sequences/actions";

describe("enrollPersons re-enroll idempotency (FIX C)", () => {
  beforeEach(() => {
    state.enrollments = [];
    state.lastUpsertOpts = null;
  });

  it("uses ignoreDuplicates on the conflict upsert", async () => {
    await enrollPersons(SEQ, ["p1"]);
    expect(state.lastUpsertOpts?.onConflict).toBe("sequence_id,person_id");
    expect(state.lastUpsertOpts?.ignoreDuplicates).toBe(true);
  });

  it("does not reset an in-progress enrollment when re-enrolled", async () => {
    // Person p1 is already mid-sequence at step 2.
    state.enrollments.push({
      sequence_id: SEQ,
      person_id: "p1",
      current_step: 2,
      status: "active",
    });

    // Re-run enroll over [p1 (mid-drip), p2 (new)].
    const res = await enrollPersons(SEQ, ["p1", "p2"]);
    expect(res.success).toBe(true);

    const p1 = state.enrollments.find((e) => e.person_id === "p1")!;
    // Untouched — NOT reset to step 0.
    expect(p1.current_step).toBe(2);
    expect(p1.status).toBe("active");

    // New person still enrolled at step 0 / active.
    const p2 = state.enrollments.find((e) => e.person_id === "p2")!;
    expect(p2).toBeDefined();
    expect(p2.current_step).toBe(0);
    expect(p2.status).toBe("active");
  });

  it("does not reactivate a completed enrollment", async () => {
    state.enrollments.push({
      sequence_id: SEQ,
      person_id: "p1",
      current_step: 3,
      status: "completed",
    });
    await enrollPersons(SEQ, ["p1"]);
    const p1 = state.enrollments.find((e) => e.person_id === "p1")!;
    expect(p1.status).toBe("completed");
    expect(p1.current_step).toBe(3);
  });
});
