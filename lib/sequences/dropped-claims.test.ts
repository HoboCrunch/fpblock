import { describe, it, expect } from "vitest";
import { findUnhydratedClaimedIds } from "@/app/api/sequences/send/route";

// Root cause of the "stuck rows reclaimed" alert loop:
//
// claim_due_interactions flips any due 'scheduled' row to 'sending' — it does
// NOT require a non-null sequence_id. The hydrate query then joins
// persons!inner / sequences!inner, which SILENTLY DROPS any claimed row whose
// person or sequence relation is missing (e.g. sequence_id = null). A dropped
// row never enters the send loop, so it's never marked terminal — it sits in
// 'sending' until the sweeper reverts it to 'scheduled', then is re-claimed the
// next run, looping forever and alerting every ~10m.
//
// findUnhydratedClaimedIds finds those dropped rows so runSend can mark them
// failed instead of letting them loop.

describe("findUnhydratedClaimedIds", () => {
  it("returns [] when every claimed row was hydrated", () => {
    const claimed = ["a", "b", "c"];
    const hydrated = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(findUnhydratedClaimedIds(claimed, hydrated)).toEqual([]);
  });

  it("returns the id of a claimed row dropped by the inner join", () => {
    const claimed = ["a", "b", "c"];
    const hydrated = [{ id: "a" }, { id: "c" }]; // b had a null sequence_id
    expect(findUnhydratedClaimedIds(claimed, hydrated)).toEqual(["b"]);
  });

  it("returns all dropped ids when several are missing", () => {
    const claimed = ["a", "b", "c", "d"];
    const hydrated = [{ id: "c" }];
    expect(findUnhydratedClaimedIds(claimed, hydrated)).toEqual(["a", "b", "d"]);
  });

  it("returns [] for an empty claim set", () => {
    expect(findUnhydratedClaimedIds([], [])).toEqual([]);
  });

  it("ignores hydrated rows that were not part of the claim set", () => {
    const claimed = ["a"];
    const hydrated = [{ id: "a" }, { id: "z" }];
    expect(findUnhydratedClaimedIds(claimed, hydrated)).toEqual([]);
  });
});
