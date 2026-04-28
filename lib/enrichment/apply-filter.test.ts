import { describe, it, expect } from "vitest";
import { applyFilter, type FilterContext } from "./apply-filter";
import type { PersonFilterState, OrgFilterState } from "@/app/admin/enrichment/components/filter-panel";
import { EMPTY_FILTERS_PERSONS, EMPTY_FILTERS_ORGS } from "@/app/admin/enrichment/components/filter-panel";

type PersonItem = {
  id: string;
  full_name: string;
  event_ids?: string[];
  source: string | null;
  enrichment_status: string;
  icp_score: number | null;
  email: string | null;
  linkedin_url: string | null;
  twitter_handle: string | null;
  phone: string | null;
};

const p = (over: Partial<PersonItem> & { id: string; full_name: string }): PersonItem => ({
  event_ids: [],
  source: null,
  enrichment_status: "none",
  icp_score: null,
  email: null,
  linkedin_url: null,
  twitter_handle: null,
  phone: null,
  ...over,
});

const ctx: FilterContext = { affiliatedPersonIds: null };

describe("applyFilter — persons", () => {
  const items: PersonItem[] = [
    p({ id: "1", full_name: "Alice", event_ids: ["e1"], enrichment_status: "complete", icp_score: 80, email: "a@x.com" }),
    p({ id: "2", full_name: "Bob", event_ids: [], enrichment_status: "none", icp_score: null }),
    p({ id: "3", full_name: "Cara", event_ids: ["e2"], enrichment_status: "failed", icp_score: 40, source: "org_enrichment" }),
    p({ id: "4", full_name: "Dan", event_ids: ["e1", "e2"], enrichment_status: "complete", icp_score: 90, linkedin_url: "https://x" }),
  ];

  it("returns all items when filter is empty", () => {
    expect(applyFilter(items, EMPTY_FILTERS_PERSONS, "persons", ctx).map((i) => i.id)).toEqual(["1", "2", "3", "4"]);
  });

  it("search matches case-insensitive substring on full_name", () => {
    const f: PersonFilterState = { ...EMPTY_FILTERS_PERSONS, search: "ar" };
    expect(applyFilter(items, f, "persons", ctx).map((i) => i.id)).toEqual(["3"]);
  });

  it("eventIds=['__none__'] returns only items with empty event_ids", () => {
    const f: PersonFilterState = { ...EMPTY_FILTERS_PERSONS, eventIds: ["__none__"] };
    expect(applyFilter(items, f, "persons", ctx).map((i) => i.id)).toEqual(["2"]);
  });

  it("eventIds=concrete uses ctx.affiliatedPersonIds", () => {
    const f: PersonFilterState = { ...EMPTY_FILTERS_PERSONS, eventIds: ["e1"] };
    const c2: FilterContext = { affiliatedPersonIds: new Set(["1", "4"]) };
    expect(applyFilter(items, f, "persons", c2).map((i) => i.id)).toEqual(["1", "4"]);
  });

  it("statuses multi-select is OR within dimension", () => {
    const f: PersonFilterState = { ...EMPTY_FILTERS_PERSONS, statuses: ["failed", "none"] };
    expect(applyFilter(items, f, "persons", ctx).map((i) => i.id)).toEqual(["2", "3"]);
  });

  it("icpMin filters with icpIncludeNull respected", () => {
    const f: PersonFilterState = { ...EMPTY_FILTERS_PERSONS, icpMin: 50, icpIncludeNull: false };
    expect(applyFilter(items, f, "persons", ctx).map((i) => i.id)).toEqual(["1", "4"]);
  });

  it("icpMin with icpIncludeNull=true keeps null-score rows", () => {
    const f: PersonFilterState = { ...EMPTY_FILTERS_PERSONS, icpMin: 50, icpIncludeNull: true };
    expect(applyFilter(items, f, "persons", ctx).map((i) => i.id)).toEqual(["1", "2", "4"]);
  });

  it("hasEmail=present", () => {
    const f: PersonFilterState = { ...EMPTY_FILTERS_PERSONS, hasEmail: "present" };
    expect(applyFilter(items, f, "persons", ctx).map((i) => i.id)).toEqual(["1"]);
  });

  it("hasLinkedin=missing", () => {
    const f: PersonFilterState = { ...EMPTY_FILTERS_PERSONS, hasLinkedin: "missing" };
    expect(applyFilter(items, f, "persons", ctx).map((i) => i.id)).toEqual(["1", "2", "3"]);
  });

  it("sources with __null__ sentinel matches null source", () => {
    const f: PersonFilterState = { ...EMPTY_FILTERS_PERSONS, sources: ["__null__"] };
    expect(applyFilter(items, f, "persons", ctx).map((i) => i.id)).toEqual(["1", "2", "4"]);
  });

  it("sources with __null__ + concrete value unions both", () => {
    const f: PersonFilterState = { ...EMPTY_FILTERS_PERSONS, sources: ["__null__", "org_enrichment"] };
    expect(applyFilter(items, f, "persons", ctx).map((i) => i.id)).toEqual(["1", "2", "3", "4"]);
  });

  it("specificIds intersects with everything", () => {
    const f: PersonFilterState = { ...EMPTY_FILTERS_PERSONS, specificIds: ["2", "3"] };
    expect(applyFilter(items, f, "persons", ctx).map((i) => i.id)).toEqual(["2", "3"]);
  });

  it("AND across dimensions: status + icp", () => {
    const f: PersonFilterState = {
      ...EMPTY_FILTERS_PERSONS,
      statuses: ["complete"],
      icpMin: 85,
      icpIncludeNull: false,
    };
    expect(applyFilter(items, f, "persons", ctx).map((i) => i.id)).toEqual(["4"]);
  });
});

type OrgItem = {
  id: string;
  name: string;
  event_ids?: string[];
  category: string | null;
  enrichment_status: string;
  icp_score: number | null;
  enriched_person_count?: number;
};

const o = (over: Partial<OrgItem> & { id: string; name: string }): OrgItem => ({
  event_ids: [],
  category: null,
  enrichment_status: "none",
  icp_score: null,
  enriched_person_count: 0,
  ...over,
});

describe("applyFilter — organizations", () => {
  const items: OrgItem[] = [
    o({ id: "1", name: "Acme", event_ids: ["e1"], category: "Infra", icp_score: 80, enriched_person_count: 3 }),
    o({ id: "2", name: "Beta Corp", event_ids: [], category: null, icp_score: null }),
    o({ id: "3", name: "Cega", event_ids: ["e2"], category: "DeFi", enrichment_status: "failed" }),
  ];

  it("categories with __null__ matches null category", () => {
    const f: OrgFilterState = { ...EMPTY_FILTERS_ORGS, categories: ["__null__"] };
    expect(applyFilter(items, f, "organizations", ctx).map((i) => i.id)).toEqual(["2"]);
  });

  it("hasPeople=present matches enriched_person_count > 0", () => {
    const f: OrgFilterState = { ...EMPTY_FILTERS_ORGS, hasPeople: "present" };
    expect(applyFilter(items, f, "organizations", ctx).map((i) => i.id)).toEqual(["1"]);
  });

  it("hasPeople=missing matches no people", () => {
    const f: OrgFilterState = { ...EMPTY_FILTERS_ORGS, hasPeople: "missing" };
    expect(applyFilter(items, f, "organizations", ctx).map((i) => i.id)).toEqual(["2", "3"]);
  });

  it("eventIds=['__none__'] returns orgs with empty event_ids", () => {
    const f: OrgFilterState = { ...EMPTY_FILTERS_ORGS, eventIds: ["__none__"] };
    expect(applyFilter(items, f, "organizations", ctx).map((i) => i.id)).toEqual(["2"]);
  });

  it("eventIds=concrete tests event_ids membership directly (no ctx for orgs)", () => {
    const f: OrgFilterState = { ...EMPTY_FILTERS_ORGS, eventIds: ["e1", "e2"] };
    expect(applyFilter(items, f, "organizations", ctx).map((i) => i.id)).toEqual(["1", "3"]);
  });
});
