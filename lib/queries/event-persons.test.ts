import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getPersonIdsForEvent,
  getPersonRelationsForEvent,
} from "./event-persons";

// Minimal fake supabase: each .from(table) returns a chainable stub whose
// terminal await resolves to { data: ..., error: null }.
function fakeSupabase(rows: {
  event_participations: { person_id: string }[];
  person_event_affiliations: { person_id: string; via_organization_id: string }[];
}): SupabaseClient {
  const chain = (data: unknown) => {
    const terminal = { data, error: null };
    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          not: vi.fn().mockResolvedValue(terminal),
          then: (fn: (r: typeof terminal) => unknown) => fn(terminal),
        }),
      }),
    };
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
