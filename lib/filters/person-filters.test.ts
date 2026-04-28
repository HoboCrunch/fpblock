import { describe, it, expect } from "vitest";
import {
  applyPersonFilters,
  defaultPersonFilterRules,
  personFilterRulesToActiveFilters,
  removeFilterKey,
  isEmptyRules,
} from "./person-filters";
import type { PersonRow } from "@/app/admin/persons/person-table-row";

const baseRow = (over: Partial<PersonRow> & Pick<PersonRow, "id" | "full_name">): PersonRow => ({
  title: null,
  primary_org_name: null,
  seniority: null,
  department: null,
  icp_score: null,
  email: null,
  linkedin_url: null,
  twitter_handle: null,
  telegram_handle: null,
  phone: null,
  photo_url: null,
  bio: null,
  source: null,
  enrichment_status: "none",
  interaction_count: 0,
  last_interaction_at: null,
  personEvents: [],
  orgEvents: [],
  ...over,
});

describe("defaultPersonFilterRules", () => {
  it("returns an empty object", () => {
    expect(defaultPersonFilterRules()).toEqual({});
  });
});

describe("isEmptyRules", () => {
  it("treats {} as empty", () => {
    expect(isEmptyRules({})).toBe(true);
  });
  it("treats empty arrays / empty strings as empty", () => {
    expect(isEmptyRules({ events: [], search: "" })).toBe(true);
  });
  it("treats a non-empty array as non-empty", () => {
    expect(isEmptyRules({ events: ["x"] })).toBe(false);
  });
  it("treats a boolean toggle as non-empty when true", () => {
    expect(isEmptyRules({ hasEmail: true })).toBe(false);
    expect(isEmptyRules({ hasEmail: false })).toBe(true);
  });
});

describe("applyPersonFilters — search", () => {
  const rows = [
    baseRow({ id: "a", full_name: "Alice", email: "alice@x.com" }),
    baseRow({ id: "b", full_name: "Bob", primary_org_name: "Aperture" }),
    baseRow({ id: "c", full_name: "Carol" }),
  ];
  it("matches against name, email, and org name", () => {
    expect(applyPersonFilters(rows, { search: "alice" }, {}).map((r) => r.id)).toEqual(["a"]);
    expect(applyPersonFilters(rows, { search: "aper" }, {}).map((r) => r.id)).toEqual(["b"]);
  });
  it("returns all rows when search is empty", () => {
    expect(applyPersonFilters(rows, { search: "" }, {})).toHaveLength(3);
  });
});

describe("applyPersonFilters — events", () => {
  const rows = [
    baseRow({
      id: "a",
      full_name: "A",
      personEvents: [{ event_id: "e1", event_name: "E1", role: "speaker", talk_title: null, track: null }],
    }),
    baseRow({ id: "b", full_name: "B" }),
  ];
  it("keeps rows whose personEvents include any selected event id", () => {
    expect(applyPersonFilters(rows, { events: ["e1"] }, {}).map((r) => r.id)).toEqual(["a"]);
    expect(applyPersonFilters(rows, { events: ["e2"] }, {})).toHaveLength(0);
  });
});

describe("applyPersonFilters — hasOrg", () => {
  const rows = [
    baseRow({ id: "a", full_name: "A", primary_org_name: "Acme" }),
    baseRow({ id: "b", full_name: "B" }),
  ];
  it("filters yes/no", () => {
    expect(applyPersonFilters(rows, { hasOrg: "yes" }, {}).map((r) => r.id)).toEqual(["a"]);
    expect(applyPersonFilters(rows, { hasOrg: "no" }, {}).map((r) => r.id)).toEqual(["b"]);
  });
});

describe("applyPersonFilters — seniority / department / source", () => {
  const rows = [
    baseRow({ id: "a", full_name: "A", seniority: "VP", department: "Eng", source: "apollo" }),
    baseRow({ id: "b", full_name: "B", seniority: "Dir", department: "Sales", source: "luma" }),
  ];
  it("filters seniority by inclusion", () => {
    expect(applyPersonFilters(rows, { seniority: ["VP"] }, {}).map((r) => r.id)).toEqual(["a"]);
  });
  it("filters department by inclusion", () => {
    expect(applyPersonFilters(rows, { department: ["Sales"] }, {}).map((r) => r.id)).toEqual(["b"]);
  });
  it("filters source by inclusion", () => {
    expect(applyPersonFilters(rows, { source: ["apollo", "luma"] }, {})).toHaveLength(2);
  });
});

describe("applyPersonFilters — channel toggles", () => {
  const rows = [
    baseRow({ id: "a", full_name: "A", email: "a@x", linkedin_url: "li/a", phone: "1", twitter_handle: "@a", telegram_handle: "@a" }),
    baseRow({ id: "b", full_name: "B" }),
  ];
  it("hasEmail keeps only rows with email", () => {
    expect(applyPersonFilters(rows, { hasEmail: true }, {}).map((r) => r.id)).toEqual(["a"]);
  });
  it("ANDs all enabled toggles", () => {
    expect(
      applyPersonFilters(rows, { hasEmail: true, hasLinkedin: true, hasPhone: true, hasTwitter: true, hasTelegram: true }, {}).map((r) => r.id),
    ).toEqual(["a"]);
  });
  it("false toggles are no-ops", () => {
    expect(applyPersonFilters(rows, { hasEmail: false }, {})).toHaveLength(2);
  });
});

describe("applyPersonFilters — enrichmentStatus and ICP range", () => {
  const rows = [
    baseRow({ id: "a", full_name: "A", enrichment_status: "complete", icp_score: 90 }),
    baseRow({ id: "b", full_name: "B", enrichment_status: "failed", icp_score: 50 }),
    baseRow({ id: "c", full_name: "C", enrichment_status: "none", icp_score: null }),
  ];
  it("keeps matching enrichment_status; treats null/empty as 'none'", () => {
    expect(applyPersonFilters(rows, { enrichmentStatus: ["complete"] }, {}).map((r) => r.id)).toEqual(["a"]);
    expect(applyPersonFilters(rows, { enrichmentStatus: ["none"] }, {}).map((r) => r.id)).toEqual(["c"]);
  });
  it("ICP min/max excludes null scores", () => {
    expect(applyPersonFilters(rows, { icpMin: 75 }, {}).map((r) => r.id)).toEqual(["a"]);
    expect(applyPersonFilters(rows, { icpMax: 60 }, {}).map((r) => r.id)).toEqual(["b"]);
    expect(applyPersonFilters(rows, { icpMin: 60, icpMax: 95 }, {}).map((r) => r.id)).toEqual(["a"]);
  });
});

describe("applyPersonFilters — correlationType", () => {
  const rows = [
    baseRow({ id: "a", full_name: "A" }),
    baseRow({ id: "b", full_name: "B" }),
  ];
  const correlations = {
    a: { type: "speaker_sponsor", segments: [] },
    b: { type: "none", segments: [] },
  };
  it("uses precomputed correlations from deps", () => {
    expect(
      applyPersonFilters(rows, { correlationType: ["speaker_sponsor"] }, { correlations }).map((r) => r.id),
    ).toEqual(["a"]);
    expect(
      applyPersonFilters(rows, { correlationType: ["none"] }, { correlations }).map((r) => r.id),
    ).toEqual(["b"]);
  });
});

describe("applyPersonFilters — eventScope", () => {
  const rows = [
    baseRow({ id: "a", full_name: "A" }),
    baseRow({ id: "b", full_name: "B" }),
  ];
  it("intersects with eventPersonIds when provided", () => {
    expect(
      applyPersonFilters(
        rows,
        { eventScope: { eventId: "e1", speaker: true, orgAffiliated: false } },
        { eventPersonIds: new Set(["a"]) },
      ).map((r) => r.id),
    ).toEqual(["a"]);
  });
  it("returns empty when eventScope is set but eventPersonIds is null (both toggles off)", () => {
    expect(
      applyPersonFilters(
        rows,
        { eventScope: { eventId: "e1", speaker: false, orgAffiliated: false } },
        { eventPersonIds: null },
      ),
    ).toHaveLength(0);
  });
});

describe("personFilterRulesToActiveFilters", () => {
  it("emits chips for set keys", () => {
    const chips = personFilterRulesToActiveFilters(
      { events: ["e1"], hasEmail: true, icpMin: 75, source: ["apollo"] },
      {
        eventOptions: [{ id: "e1", name: "EthCC" }],
      },
    );
    const map = Object.fromEntries(chips.map((c) => [c.key, c.value]));
    expect(map.events).toBe("EthCC");
    expect(map.hasEmail).toBe("Yes");
    expect(map.icpMin).toBe("75");
    expect(map.source).toBe("apollo");
  });
  it("omits chips for unset keys", () => {
    const chips = personFilterRulesToActiveFilters({}, { eventOptions: [] });
    expect(chips).toEqual([]);
  });
});

describe("removeFilterKey", () => {
  it("clears the matching key without mutating others", () => {
    const next = removeFilterKey({ events: ["e1"], hasEmail: true }, "events");
    expect(next.events).toBeUndefined();
    expect(next.hasEmail).toBe(true);
  });
  it("clears the boolean toggle keys", () => {
    expect(removeFilterKey({ hasEmail: true }, "hasEmail").hasEmail).toBeUndefined();
  });
});
