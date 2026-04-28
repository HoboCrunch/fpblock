# Enrichment Filter Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the contradictory top-bar `FilterBar` and right-panel `target` selector with a single multi-dimensional filter panel where visible rows = candidate run set, with deselection refinement.

**Architecture:** Add a pure `applyFilter` function (testable in isolation) and a multi-event person-ids hook. Build a new `FilterPanel` and `JobHistoryDrawer`. Rename the existing `ConfigPanel` to `RunConfigPanel` and strip its target props. Refactor `enrichment-shell.tsx` to drive selection from the filter result via the preservation-by-id rule. Delete `filter-bar.tsx`.

**Tech Stack:** Next.js (App Router), React 19, TypeScript, TanStack Query, Supabase JS client, Vitest + React Testing Library, Tailwind.

**Spec:** `docs/superpowers/specs/2026-04-28-enrichment-filter-consolidation-design.md`

**Recommended:** Run this in a dedicated worktree (`git worktree add ../Cannes-filter-consolidation -b feat/enrichment-filter-consolidation`) so the eight-task surface area stays isolated from other in-flight work.

---

## File Structure

### Create

| Path | Responsibility |
|---|---|
| `lib/enrichment/apply-filter.ts` | Pure filter function: `applyFilter(items, filterState, tab, ctx)` returning visible subset. No React. |
| `lib/enrichment/apply-filter.test.ts` | Vitest unit tests for `applyFilter`. |
| `app/admin/enrichment/components/filter-panel.tsx` | All filter dimensions for active tab. Owns `FilterState` shape via shared types. |
| `app/admin/enrichment/components/job-history-drawer.tsx` | Bottom slide-up drawer wrapping existing `JobHistory`. |

### Modify

| Path | Change |
|---|---|
| `lib/queries/event-persons.ts` | Add `getPersonIdsForEvents(supabase, eventIds, relation)` — multi-event variant. |
| `lib/queries/event-persons.test.ts` | Add tests for `getPersonIdsForEvents`. |
| `lib/queries/use-event-affiliations.ts` | Add `useEventsPersonIds(eventIds, relation)` hook. |
| `lib/queries/query-keys.ts` | Add key for multi-event person ids. |
| `app/admin/enrichment/components/config-panel.tsx` | Rename file to `run-config-panel.tsx`; strip target/event/initiative/icp/savedList props. |
| `app/admin/enrichment/components/center-panel.tsx` | Drop `<FilterBar />`, drop `filters` / `events` / `initiatives` / `categories` / `sources` props. |
| `app/admin/enrichment/enrichment-shell.tsx` | Replace `target` state + `filters` state + `filteredItems` memo with `filterState` + `applyFilter` + selection-diff effect. Wire drawer. |

### Delete

| Path | Reason |
|---|---|
| `app/admin/enrichment/components/filter-bar.tsx` | Replaced by `filter-panel.tsx` in the right sidebar. |

### Type definitions (in `filter-panel.tsx`, exported)

```ts
export type TriState = "any" | "present" | "missing";

export interface PersonFilterState {
  search: string;
  eventIds: string[];                  // [] = inactive; ["__none__"] = no event; otherwise concrete ids
  speakerOn: boolean;                  // event relation toggle (only meaningful when eventIds has real ids)
  orgAffiliatedOn: boolean;            // event relation toggle
  initiativeIds: string[];
  savedListIds: string[];
  sources: string[];                   // may include "__null__" sentinel
  statuses: string[];                  // ["none","partial","complete","failed","in_progress"]
  icpMin: number | null;
  icpMax: number | null;
  icpIncludeNull: boolean;
  hasEmail: TriState;
  hasLinkedin: TriState;
  hasTwitter: TriState;
  hasPhone: TriState;
  specificIds: string[] | null;        // URL escape hatch
}

export interface OrgFilterState {
  search: string;
  eventIds: string[];                  // [] inactive; ["__none__"] no event; otherwise concrete ids
  initiativeIds: string[];
  categories: string[];                // may include "__null__"
  statuses: string[];                  // ["none","partial","complete","failed"]
  icpMin: number | null;
  icpMax: number | null;
  icpIncludeNull: boolean;
  hasPeople: TriState;
  specificIds: string[] | null;
}

export const EMPTY_FILTERS_PERSONS: PersonFilterState = {
  search: "",
  eventIds: [],
  speakerOn: true,
  orgAffiliatedOn: true,
  initiativeIds: [],
  savedListIds: [],
  sources: [],
  statuses: [],
  icpMin: null,
  icpMax: null,
  icpIncludeNull: true,
  hasEmail: "any",
  hasLinkedin: "any",
  hasTwitter: "any",
  hasPhone: "any",
  specificIds: null,
};

export const EMPTY_FILTERS_ORGS: OrgFilterState = {
  search: "",
  eventIds: [],
  initiativeIds: [],
  categories: [],
  statuses: [],
  icpMin: null,
  icpMax: null,
  icpIncludeNull: true,
  hasPeople: "any",
  specificIds: null,
};
```

The existing `EventPersonRelation = "direct" | "org_affiliated" | "either" | "both"` type and `toggleToRelation(speaker, orgAffiliated)` helper from `components/admin/event-relation-toggle.tsx` are reused (matches the spec's `eventRelation` semantics — the spec name was conceptual, the implementation uses the existing two-boolean pattern).

---

## Task 1: Pure `applyFilter` function with tests

**Files:**
- Create: `lib/enrichment/apply-filter.ts`
- Create: `lib/enrichment/apply-filter.test.ts`

This is the core filtering logic. Pure function, no React, fully unit-tested. It accepts a context object holding the precomputed event-affiliation set so we don't put a React hook inside.

- [ ] **Step 1: Write `apply-filter.test.ts` with persons cases**

```ts
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
  full_name: "",
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
```

- [ ] **Step 2: Add orgs cases to the same test file**

```ts
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
```

- [ ] **Step 3: Run tests to verify they fail (file doesn't exist yet)**

Run: `pnpm vitest run lib/enrichment/apply-filter.test.ts`
Expected: FAIL with module-not-found on `./apply-filter`.

- [ ] **Step 4: Implement `lib/enrichment/apply-filter.ts`**

```ts
import type {
  PersonFilterState,
  OrgFilterState,
  TriState,
} from "@/app/admin/enrichment/components/filter-panel";

export interface FilterContext {
  /**
   * Set of person ids matching the current (eventIds, relation) selection,
   * fetched via useEventsPersonIds. null when not applicable (orgs tab, or
   * persons tab with no concrete event selection).
   */
  affiliatedPersonIds: Set<string> | null;
}

interface PersonItem {
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
}

interface OrgItem {
  id: string;
  name: string;
  event_ids?: string[];
  category: string | null;
  enrichment_status: string;
  icp_score: number | null;
  enriched_person_count?: number;
}

const NONE_SENTINEL = "__none__";
const NULL_SENTINEL = "__null__";

function checkTriState(value: unknown, state: TriState): boolean {
  if (state === "any") return true;
  const present = value !== null && value !== undefined && value !== "";
  return state === "present" ? present : !present;
}

function inIcpRange(
  score: number | null,
  min: number | null,
  max: number | null,
  includeNull: boolean
): boolean {
  if (score === null) return includeNull;
  if (min !== null && score < min) return false;
  if (max !== null && score > max) return false;
  return true;
}

function multiOr<T>(values: T[], selected: T[]): boolean {
  if (selected.length === 0) return true;
  return selected.some((s) => values.includes(s));
}

export function applyFilter<T extends PersonItem | OrgItem>(
  items: T[],
  filter: PersonFilterState | OrgFilterState,
  tab: "persons" | "organizations",
  ctx: FilterContext
): T[] {
  return items.filter((item) => {
    if (filter.specificIds && !filter.specificIds.includes(item.id)) return false;

    if (filter.search) {
      const name =
        tab === "persons" ? (item as PersonItem).full_name : (item as OrgItem).name;
      if (!name.toLowerCase().includes(filter.search.toLowerCase())) return false;
    }

    // Event filter
    if (filter.eventIds.length > 0) {
      const itemEvents = item.event_ids ?? [];
      if (filter.eventIds.includes(NONE_SENTINEL)) {
        if (itemEvents.length > 0) return false;
      } else if (tab === "persons" && ctx.affiliatedPersonIds) {
        if (!ctx.affiliatedPersonIds.has(item.id)) return false;
      } else {
        // Orgs tab, or persons fallback: direct event_ids overlap
        if (!itemEvents.some((id) => filter.eventIds.includes(id))) return false;
      }
    }

    // Status
    if (filter.statuses.length > 0) {
      if (!filter.statuses.includes(item.enrichment_status)) return false;
    }

    // ICP
    if (
      filter.icpMin !== null ||
      filter.icpMax !== null ||
      !filter.icpIncludeNull
    ) {
      if (!inIcpRange(item.icp_score, filter.icpMin, filter.icpMax, filter.icpIncludeNull)) {
        return false;
      }
    }

    if (tab === "persons") {
      const p = item as PersonItem;
      const f = filter as PersonFilterState;

      if (f.sources.length > 0) {
        const matchesNull = f.sources.includes(NULL_SENTINEL) && p.source === null;
        const matchesConcrete = p.source !== null && f.sources.includes(p.source);
        if (!matchesNull && !matchesConcrete) return false;
      }

      // initiativeIds, savedListIds: stub-applied below — see Task 6 for data wiring
      // Until item shape includes initiative/list ids, these dimensions are no-ops.
      // (We keep the filter fields wired so the UI works; integration with item data
      // happens when the items hook returns those columns.)

      if (!checkTriState(p.email, f.hasEmail)) return false;
      if (!checkTriState(p.linkedin_url, f.hasLinkedin)) return false;
      if (!checkTriState(p.twitter_handle, f.hasTwitter)) return false;
      if (!checkTriState(p.phone, f.hasPhone)) return false;
    } else {
      const o = item as OrgItem;
      const f = filter as OrgFilterState;

      if (f.categories.length > 0) {
        const matchesNull = f.categories.includes(NULL_SENTINEL) && o.category === null;
        const matchesConcrete = o.category !== null && f.categories.includes(o.category);
        if (!matchesNull && !matchesConcrete) return false;
      }

      if (f.hasPeople !== "any") {
        const count = o.enriched_person_count ?? 0;
        if (f.hasPeople === "present" && count === 0) return false;
        if (f.hasPeople === "missing" && count > 0) return false;
      }
    }

    return true;
  });
}

// Re-export so callers can import the sentinel by name
export const FILTER_SENTINELS = {
  NONE: NONE_SENTINEL,
  NULL: NULL_SENTINEL,
} as const;

// multiOr is unused at the moment but kept for future multi-value comparisons;
// remove if linter flags it.
void multiOr;
```

Note: the file imports types from `filter-panel.tsx` which doesn't exist yet. To make this task self-contained, create a minimal stub of `filter-panel.tsx` first (just types + EMPTY constants — full UI lands in Task 4):

- [ ] **Step 5: Create `filter-panel.tsx` with types-only stub**

```tsx
"use client";

export type TriState = "any" | "present" | "missing";

export interface PersonFilterState {
  search: string;
  eventIds: string[];
  speakerOn: boolean;
  orgAffiliatedOn: boolean;
  initiativeIds: string[];
  savedListIds: string[];
  sources: string[];
  statuses: string[];
  icpMin: number | null;
  icpMax: number | null;
  icpIncludeNull: boolean;
  hasEmail: TriState;
  hasLinkedin: TriState;
  hasTwitter: TriState;
  hasPhone: TriState;
  specificIds: string[] | null;
}

export interface OrgFilterState {
  search: string;
  eventIds: string[];
  initiativeIds: string[];
  categories: string[];
  statuses: string[];
  icpMin: number | null;
  icpMax: number | null;
  icpIncludeNull: boolean;
  hasPeople: TriState;
  specificIds: string[] | null;
}

export const EMPTY_FILTERS_PERSONS: PersonFilterState = {
  search: "",
  eventIds: [],
  speakerOn: true,
  orgAffiliatedOn: true,
  initiativeIds: [],
  savedListIds: [],
  sources: [],
  statuses: [],
  icpMin: null,
  icpMax: null,
  icpIncludeNull: true,
  hasEmail: "any",
  hasLinkedin: "any",
  hasTwitter: "any",
  hasPhone: "any",
  specificIds: null,
};

export const EMPTY_FILTERS_ORGS: OrgFilterState = {
  search: "",
  eventIds: [],
  initiativeIds: [],
  categories: [],
  statuses: [],
  icpMin: null,
  icpMax: null,
  icpIncludeNull: true,
  hasPeople: "any",
  specificIds: null,
};

// Component implementation lands in Task 4. Stub export so other modules
// can import the types now.
export function FilterPanel(): null {
  return null;
}
```

- [ ] **Step 6: Run tests, verify pass**

Run: `pnpm vitest run lib/enrichment/apply-filter.test.ts`
Expected: All ~17 tests PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/enrichment/apply-filter.ts lib/enrichment/apply-filter.test.ts app/admin/enrichment/components/filter-panel.tsx
git commit -m "feat(enrichment): add applyFilter pure function and FilterState types

Tested filter combinator that supports AND across dimensions, OR within
multi-selects, null/missing sentinels, and tri-state has-field checks.
Filter-panel UI lands in a follow-up task."
```

---

## Task 2: Multi-event person ids fetch

**Files:**
- Modify: `lib/queries/event-persons.ts`
- Modify: `lib/queries/event-persons.test.ts`
- Modify: `lib/queries/use-event-affiliations.ts`
- Modify: `lib/queries/query-keys.ts`

The current `getPersonIdsForEvent` works on one event. We need a multi-event union for the new event-multi-select filter.

- [ ] **Step 1: Add failing test for `getPersonIdsForEvents`**

Append to `lib/queries/event-persons.test.ts`:

```ts
import { getPersonIdsForEvents } from "./event-persons";

describe("getPersonIdsForEvents", () => {
  it("returns empty array when eventIds is empty", async () => {
    const supabase = fakeSupabase({
      event_participations: [],
      person_event_affiliations: [],
    });
    const ids = await getPersonIdsForEvents(supabase, [], "either");
    expect(ids).toEqual([]);
  });

  it("unions person ids across multiple events for relation=either", async () => {
    // For test simplicity, return same rows regardless of event_id filter —
    // the implementation calls fetchDirect/fetchAffiliated per id and unions.
    const supabase = fakeSupabase({
      event_participations: [{ person_id: "p1" }, { person_id: "p2" }],
      person_event_affiliations: [
        { person_id: "p2", via_organization_id: "o1" },
        { person_id: "p3", via_organization_id: "o1" },
      ],
    });
    const ids = await getPersonIdsForEvents(supabase, ["e1", "e2"], "either");
    expect(ids.sort()).toEqual(["p1", "p2", "p3"]);
  });

  it("respects relation=direct across multiple events", async () => {
    const supabase = fakeSupabase({
      event_participations: [{ person_id: "p1" }, { person_id: "p2" }],
      person_event_affiliations: [{ person_id: "p9", via_organization_id: "o1" }],
    });
    const ids = await getPersonIdsForEvents(supabase, ["e1", "e2"], "direct");
    expect(ids.sort()).toEqual(["p1", "p2"]);
  });
});
```

- [ ] **Step 2: Run test, verify fail**

Run: `pnpm vitest run lib/queries/event-persons.test.ts`
Expected: FAIL on import (`getPersonIdsForEvents` not exported).

- [ ] **Step 3: Implement `getPersonIdsForEvents` in `lib/queries/event-persons.ts`**

Append at end of file:

```ts
export async function getPersonIdsForEvents(
  supabase: SupabaseClient,
  eventIds: string[],
  relation: EventPersonRelation
): Promise<string[]> {
  if (eventIds.length === 0) return [];
  const perEvent = await Promise.all(
    eventIds.map((id) => getPersonIdsForEvent(supabase, id, relation))
  );
  const out = new Set<string>();
  for (const ids of perEvent) {
    for (const id of ids) out.add(id);
  }
  return Array.from(out);
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `pnpm vitest run lib/queries/event-persons.test.ts`
Expected: All tests PASS (existing + 3 new).

- [ ] **Step 5: Add query key for multi-event lookup**

Modify `lib/queries/query-keys.ts` — add a new key alongside `personIdsForEvent`:

```ts
  eventAffiliations: {
    all: ["event-affiliations"] as const,
    byEvent: (eventId: string) => ["event-affiliations", "event", eventId] as const,
    personIdsForEvent: (eventId: string, relation: string) =>
      ["event-affiliations", "event", eventId, "ids", relation] as const,
    personIdsForEvents: (eventIds: string[], relation: string) =>
      ["event-affiliations", "events", [...eventIds].sort().join(","), "ids", relation] as const,
  },
```

The `[...eventIds].sort().join(",")` ensures the cache key is stable regardless of input order.

- [ ] **Step 6: Add `useEventsPersonIds` hook**

Modify `lib/queries/use-event-affiliations.ts` — append at end:

```ts
import { getPersonIdsForEvents } from "./event-persons";

export function useEventsPersonIds(
  eventIds: string[] | null,
  relation: EventPersonRelation | null
) {
  const safeIds = eventIds ?? [];
  return useQuery({
    queryKey: queryKeys.eventAffiliations.personIdsForEvents(safeIds, relation ?? "none"),
    queryFn: async () => {
      if (safeIds.length === 0 || !relation) return [] as string[];
      const supabase = createClient();
      return getPersonIdsForEvents(supabase, safeIds, relation);
    },
    enabled: safeIds.length > 0 && relation !== null,
  });
}
```

(The existing `import { getPersonIdsForEvent }` line stays; we just add `getPersonIdsForEvents` next to it. Combine the imports if both are from the same file.)

- [ ] **Step 7: Type-check passes**

Run: `pnpm tsc --noEmit`
Expected: No errors related to `event-persons.ts` / `use-event-affiliations.ts` / `query-keys.ts`. Pre-existing errors in unrelated files are OK to leave.

- [ ] **Step 8: Commit**

```bash
git add lib/queries/event-persons.ts lib/queries/event-persons.test.ts lib/queries/use-event-affiliations.ts lib/queries/query-keys.ts
git commit -m "feat(queries): add multi-event person-ids fetch and hook

getPersonIdsForEvents unions per-event lookups; useEventsPersonIds is
the React Query wrapper. Cache key sorts event ids for stability."
```

---

## Task 3: `FilterPanel` component (full UI)

**Files:**
- Modify: `app/admin/enrichment/components/filter-panel.tsx` (replaces the types-only stub)

This task replaces the stub with the full panel UI. No tests for the component itself — the logic was tested in Task 1; this task wires UI to that logic.

- [ ] **Step 1: Replace `filter-panel.tsx` with the full implementation**

Overwrite the file. Keep the types and `EMPTY_FILTERS_*` exports from Task 1 at the top; add the React component below them.

```tsx
"use client";

import React from "react";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassInput } from "@/components/ui/glass-input";
import { MultiSelectField } from "@/components/admin/multi-select-field";
import { EventRelationToggle } from "@/components/admin/event-relation-toggle";
import { cn } from "@/lib/utils";
import { Search, X, RotateCcw } from "lucide-react";

// ----- Types (re-export hoisted from Task 1) -----

export type TriState = "any" | "present" | "missing";

export interface PersonFilterState {
  search: string;
  eventIds: string[];
  speakerOn: boolean;
  orgAffiliatedOn: boolean;
  initiativeIds: string[];
  savedListIds: string[];
  sources: string[];
  statuses: string[];
  icpMin: number | null;
  icpMax: number | null;
  icpIncludeNull: boolean;
  hasEmail: TriState;
  hasLinkedin: TriState;
  hasTwitter: TriState;
  hasPhone: TriState;
  specificIds: string[] | null;
}

export interface OrgFilterState {
  search: string;
  eventIds: string[];
  initiativeIds: string[];
  categories: string[];
  statuses: string[];
  icpMin: number | null;
  icpMax: number | null;
  icpIncludeNull: boolean;
  hasPeople: TriState;
  specificIds: string[] | null;
}

export const EMPTY_FILTERS_PERSONS: PersonFilterState = {
  search: "",
  eventIds: [],
  speakerOn: true,
  orgAffiliatedOn: true,
  initiativeIds: [],
  savedListIds: [],
  sources: [],
  statuses: [],
  icpMin: null,
  icpMax: null,
  icpIncludeNull: true,
  hasEmail: "any",
  hasLinkedin: "any",
  hasTwitter: "any",
  hasPhone: "any",
  specificIds: null,
};

export const EMPTY_FILTERS_ORGS: OrgFilterState = {
  search: "",
  eventIds: [],
  initiativeIds: [],
  categories: [],
  statuses: [],
  icpMin: null,
  icpMax: null,
  icpIncludeNull: true,
  hasPeople: "any",
  specificIds: null,
};

// ----- Constants -----

const NONE_SENTINEL = "__none__";
const NULL_SENTINEL = "__null__";

const PERSON_STATUS_OPTIONS = [
  { value: "none", label: "New" },
  { value: "partial", label: "Partial" },
  { value: "complete", label: "Complete" },
  { value: "failed", label: "Failed" },
  { value: "in_progress", label: "In progress" },
];

const ORG_STATUS_OPTIONS = [
  { value: "none", label: "New" },
  { value: "partial", label: "Partial" },
  { value: "complete", label: "Complete" },
  { value: "failed", label: "Failed" },
];

// ----- Tri-state pill -----

function TriStatePill({
  label,
  value,
  onChange,
}: {
  label: string;
  value: TriState;
  onChange: (next: TriState) => void;
}) {
  const next: Record<TriState, TriState> = { any: "present", present: "missing", missing: "any" };
  const display = value === "any" ? "any" : value === "present" ? "✓ present" : "✗ missing";
  const tone =
    value === "present"
      ? "bg-[var(--accent-orange)]/15 text-[var(--accent-orange)] border-[var(--accent-orange)]/20"
      : value === "missing"
        ? "bg-red-500/15 text-red-400 border-red-500/20"
        : "bg-[var(--glass-bg)] text-[var(--text-muted)] border-[var(--glass-border)]";
  return (
    <button
      type="button"
      onClick={() => onChange(next[value])}
      className={cn("flex items-center justify-between px-2 py-1 rounded-md text-[11px] font-medium border transition-colors", tone)}
    >
      <span>{label}</span>
      <span className="ml-2 opacity-80">{display}</span>
    </button>
  );
}

// ----- Section header helper -----

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-1.5 mt-3 first:mt-0">
      {children}
    </div>
  );
}

// ----- Common props -----

export interface FilterPanelProps {
  tab: "persons" | "organizations";
  filterPersons: PersonFilterState;
  filterOrgs: OrgFilterState;
  onFilterPersonsChange: (f: PersonFilterState) => void;
  onFilterOrgsChange: (f: OrgFilterState) => void;
  events: { id: string; name: string }[];
  initiatives: { id: string; name: string }[];
  savedLists: { id: string; name: string; count: number }[];
  categories: string[];
  sources: string[];
  filteredCount: number;
  selectedCount: number;
  onSelectAllVisible: () => void;
  onClearVisible: () => void;
  disabled?: boolean;
}

// ----- Component -----

export const FilterPanel = React.memo(function FilterPanel({
  tab,
  filterPersons,
  filterOrgs,
  onFilterPersonsChange,
  onFilterOrgsChange,
  events,
  initiatives,
  savedLists,
  categories,
  sources,
  filteredCount,
  selectedCount,
  onSelectAllVisible,
  onClearVisible,
  disabled,
}: FilterPanelProps) {
  const f = tab === "persons" ? filterPersons : filterOrgs;
  const updatePerson = (patch: Partial<PersonFilterState>) =>
    onFilterPersonsChange({ ...filterPersons, ...patch });
  const updateOrg = (patch: Partial<OrgFilterState>) =>
    onFilterOrgsChange({ ...filterOrgs, ...patch });

  function reset() {
    if (tab === "persons") {
      onFilterPersonsChange({ ...EMPTY_FILTERS_PERSONS, specificIds: filterPersons.specificIds });
    } else {
      onFilterOrgsChange({ ...EMPTY_FILTERS_ORGS, specificIds: filterOrgs.specificIds });
    }
  }

  function clearSpecificIds() {
    if (tab === "persons") updatePerson({ specificIds: null });
    else updateOrg({ specificIds: null });
  }

  // Event multi-select option list (with __none__ sentinel)
  const eventOptions = [
    { value: NONE_SENTINEL, label: "(no event)" },
    ...events.map((e) => ({ value: e.id, label: e.name })),
  ];

  // Selecting __none__ clears concrete; selecting concrete clears __none__
  function setEventIds(next: string[]) {
    let cleaned = next;
    if (next.includes(NONE_SENTINEL) && next.length > 1) {
      // If user just toggled __none__ on while concrete selected, keep __none__ alone
      cleaned = next[next.length - 1] === NONE_SENTINEL ? [NONE_SENTINEL] : next.filter((v) => v !== NONE_SENTINEL);
    }
    if (tab === "persons") updatePerson({ eventIds: cleaned });
    else updateOrg({ eventIds: cleaned });
  }

  const hasConcreteEvents =
    f.eventIds.length > 0 && !f.eventIds.includes(NONE_SENTINEL);

  return (
    <GlassCard className={cn("relative", disabled && "pointer-events-none opacity-40")}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-[var(--text-muted)] uppercase tracking-wider font-medium">
          Filters
        </span>
        <button
          onClick={reset}
          className="text-[10px] text-[var(--text-muted)] hover:text-white flex items-center gap-1 transition-colors"
        >
          <RotateCcw className="h-3 w-3" />
          Reset
        </button>
      </div>

      {/* specificIds chip */}
      {f.specificIds && (
        <div className="mb-3 flex items-center justify-between gap-2 px-2 py-1.5 rounded-md bg-[var(--accent-orange)]/10 border border-[var(--accent-orange)]/20 text-[var(--accent-orange)] text-xs">
          <span>Showing {f.specificIds.length} specific item{f.specificIds.length !== 1 ? "s" : ""}</span>
          <button onClick={clearSpecificIds} aria-label="Clear specific items">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Search */}
      <SectionLabel>Search</SectionLabel>
      <GlassInput
        icon={Search}
        placeholder={tab === "persons" ? "Name..." : "Org name..."}
        value={f.search}
        onChange={(e) =>
          tab === "persons"
            ? updatePerson({ search: e.target.value })
            : updateOrg({ search: e.target.value })
        }
        className="text-xs py-1.5"
      />

      {/* Events */}
      <SectionLabel>Event affiliation</SectionLabel>
      <MultiSelectField
        placeholder="Any event"
        options={eventOptions}
        values={f.eventIds}
        onChange={setEventIds}
      />
      {tab === "persons" && hasConcreteEvents && (
        <div className="mt-2 px-2 py-1.5 rounded-md bg-white/[0.02] border border-white/[0.04]">
          <div className="text-[10px] text-[var(--text-muted)] mb-1">Relation</div>
          <EventRelationToggle
            speaker={(f as PersonFilterState).speakerOn}
            orgAffiliated={(f as PersonFilterState).orgAffiliatedOn}
            onChange={({ speaker, orgAffiliated }) =>
              updatePerson({ speakerOn: speaker, orgAffiliatedOn: orgAffiliated })
            }
          />
        </div>
      )}

      {/* Initiative */}
      <SectionLabel>Initiative</SectionLabel>
      <MultiSelectField
        placeholder="Any initiative"
        options={initiatives.map((i) => ({ value: i.id, label: i.name }))}
        values={f.initiativeIds}
        onChange={(next) =>
          tab === "persons"
            ? updatePerson({ initiativeIds: next })
            : updateOrg({ initiativeIds: next })
        }
      />

      {/* Saved list (persons only) */}
      {tab === "persons" && (
        <>
          <SectionLabel>Saved list</SectionLabel>
          <MultiSelectField
            placeholder="Any list"
            options={savedLists.map((l) => ({ value: l.id, label: `${l.name} (${l.count})` }))}
            values={(f as PersonFilterState).savedListIds}
            onChange={(next) => updatePerson({ savedListIds: next })}
          />
        </>
      )}

      {/* Source / Category */}
      <SectionLabel>{tab === "persons" ? "Source" : "Category"}</SectionLabel>
      <MultiSelectField
        placeholder={tab === "persons" ? "Any source" : "Any category"}
        options={[
          { value: NULL_SENTINEL, label: "(none)" },
          ...(tab === "persons" ? sources : categories).map((v) => ({ value: v, label: v })),
        ]}
        values={tab === "persons" ? (f as PersonFilterState).sources : (f as OrgFilterState).categories}
        onChange={(next) =>
          tab === "persons"
            ? updatePerson({ sources: next })
            : updateOrg({ categories: next })
        }
      />

      {/* Status */}
      <SectionLabel>Enrichment status</SectionLabel>
      <div className="flex flex-wrap gap-1">
        {(tab === "persons" ? PERSON_STATUS_OPTIONS : ORG_STATUS_OPTIONS).map((opt) => {
          const active = f.statuses.includes(opt.value);
          return (
            <button
              key={opt.value}
              onClick={() => {
                const next = active
                  ? f.statuses.filter((s) => s !== opt.value)
                  : [...f.statuses, opt.value];
                if (tab === "persons") updatePerson({ statuses: next });
                else updateOrg({ statuses: next });
              }}
              className={cn(
                "px-2 py-1 rounded-md text-[10px] font-medium border transition-colors",
                active
                  ? "bg-[var(--accent-orange)]/15 text-[var(--accent-orange)] border-[var(--accent-orange)]/20"
                  : "bg-[var(--glass-bg)] text-[var(--text-muted)] border-[var(--glass-border)]"
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {/* ICP */}
      <SectionLabel>ICP score</SectionLabel>
      <div className="flex items-center gap-1">
        <GlassInput
          type="number"
          min={0}
          max={100}
          placeholder="≥"
          value={f.icpMin ?? ""}
          onChange={(e) => {
            const v = e.target.value === "" ? null : Number(e.target.value);
            if (tab === "persons") updatePerson({ icpMin: v });
            else updateOrg({ icpMin: v });
          }}
          className="w-16 text-xs py-1.5"
        />
        <span className="text-[var(--text-muted)] text-xs">–</span>
        <GlassInput
          type="number"
          min={0}
          max={100}
          placeholder="≤"
          value={f.icpMax ?? ""}
          onChange={(e) => {
            const v = e.target.value === "" ? null : Number(e.target.value);
            if (tab === "persons") updatePerson({ icpMax: v });
            else updateOrg({ icpMax: v });
          }}
          className="w-16 text-xs py-1.5"
        />
      </div>
      <label className="flex items-center gap-1.5 mt-1.5 text-[11px] text-[var(--text-muted)] cursor-pointer">
        <input
          type="checkbox"
          checked={f.icpIncludeNull}
          onChange={(e) => {
            if (tab === "persons") updatePerson({ icpIncludeNull: e.target.checked });
            else updateOrg({ icpIncludeNull: e.target.checked });
          }}
          className="accent-current"
        />
        Include items with no score
      </label>

      {/* Tri-states */}
      {tab === "persons" ? (
        <>
          <SectionLabel>Contact fields</SectionLabel>
          <div className="grid grid-cols-2 gap-1">
            <TriStatePill label="Email" value={(f as PersonFilterState).hasEmail} onChange={(v) => updatePerson({ hasEmail: v })} />
            <TriStatePill label="LinkedIn" value={(f as PersonFilterState).hasLinkedin} onChange={(v) => updatePerson({ hasLinkedin: v })} />
            <TriStatePill label="Twitter" value={(f as PersonFilterState).hasTwitter} onChange={(v) => updatePerson({ hasTwitter: v })} />
            <TriStatePill label="Phone" value={(f as PersonFilterState).hasPhone} onChange={(v) => updatePerson({ hasPhone: v })} />
          </div>
        </>
      ) : (
        <>
          <SectionLabel>People</SectionLabel>
          <TriStatePill
            label="Has enriched persons"
            value={(f as OrgFilterState).hasPeople}
            onChange={(v) => updateOrg({ hasPeople: v })}
          />
        </>
      )}

      {/* Footer */}
      <div className="mt-4 pt-3 border-t border-white/[0.04] flex items-center justify-between text-[11px]">
        <span className="text-[var(--text-muted)]">
          Filtered: {filteredCount} • Selected: {selectedCount}
        </span>
        <div className="flex gap-2">
          <button onClick={onSelectAllVisible} className="text-[var(--accent-orange)] hover:underline">
            Select all
          </button>
          <button onClick={onClearVisible} className="text-[var(--text-muted)] hover:text-white">
            Clear
          </button>
        </div>
      </div>
    </GlassCard>
  );
});

FilterPanel.displayName = "FilterPanel";
```

- [ ] **Step 2: Verify type-check passes**

Run: `pnpm tsc --noEmit`
Expected: No errors in `filter-panel.tsx`. (Pre-existing errors elsewhere are fine.)

- [ ] **Step 3: Commit**

```bash
git add app/admin/enrichment/components/filter-panel.tsx
git commit -m "feat(enrichment): build FilterPanel with all dimensions

Search, multi-event affiliation with relation toggle, initiative,
saved list (persons only), source/category, status chips, ICP range
with null toggle, contact-field tri-states. Footer count + select-all/clear."
```

---

## Task 4: `JobHistoryDrawer` component

**Files:**
- Create: `app/admin/enrichment/components/job-history-drawer.tsx`

- [ ] **Step 1: Create the file**

```tsx
"use client";

import React from "react";
import { ChevronUp, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { JobHistory } from "./job-history";
import type { ComponentProps } from "react";

type JobHistoryProps = ComponentProps<typeof JobHistory>;

export interface JobHistoryDrawerProps extends JobHistoryProps {
  open: boolean;
  onToggle: () => void;
}

export const JobHistoryDrawer = React.memo(function JobHistoryDrawer({
  open,
  onToggle,
  jobs,
  activeJobId,
  viewingJobId,
  onSelectJob,
}: JobHistoryDrawerProps) {
  return (
    <div
      className={cn(
        "hidden lg:flex fixed bottom-0 right-6 z-30 flex-col bg-[#0f0f13] border border-white/[0.06] border-b-0 rounded-t-lg shadow-2xl transition-all duration-300 ease-out",
        open ? "h-[40vh] w-[420px]" : "h-8 w-[200px]"
      )}
    >
      <button
        onClick={onToggle}
        className="flex items-center justify-between px-3 h-8 shrink-0 text-xs text-[var(--text-muted)] hover:text-white transition-colors"
      >
        <span>History · {jobs.length} job{jobs.length !== 1 ? "s" : ""}</span>
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
      </button>
      {open && (
        <div className="flex-1 min-h-0 overflow-hidden p-2">
          <JobHistory
            jobs={jobs}
            activeJobId={activeJobId}
            viewingJobId={viewingJobId}
            onSelectJob={onSelectJob}
          />
        </div>
      )}
    </div>
  );
});

JobHistoryDrawer.displayName = "JobHistoryDrawer";
```

- [ ] **Step 2: Type-check**

Run: `pnpm tsc --noEmit`
Expected: No new errors.

- [ ] **Step 3: Commit**

```bash
git add app/admin/enrichment/components/job-history-drawer.tsx
git commit -m "feat(enrichment): add JobHistoryDrawer

Bottom-right slide-up drawer wrapping JobHistory. 32px collapsed tab
with job count, expands to 40vh on click."
```

---

## Task 5: Rename `config-panel` → `run-config-panel` and strip target props

**Files:**
- Rename: `app/admin/enrichment/components/config-panel.tsx` → `run-config-panel.tsx`
- Modify: removed/renamed exports

The current `ConfigPanel` mixes run config (stages, fields, run button) with target selection (the `target` dropdown + sub-inputs). We strip the target half.

- [ ] **Step 1: `git mv` the file**

```bash
git mv app/admin/enrichment/components/config-panel.tsx app/admin/enrichment/components/run-config-panel.tsx
```

- [ ] **Step 2: Edit the file — remove target-related props, JSX, and helpers**

Open `app/admin/enrichment/components/run-config-panel.tsx` and apply these edits:

1. Rename the exported component: `export const ConfigPanel = React.memo(...)` → `export const RunConfigPanel = React.memo(...)`. Update `displayName` to `"RunConfigPanel"`.
2. Rename the props interface: `ConfigPanelProps` → `RunConfigPanelProps`.
3. Remove the `TargetType` export entirely (no consumer left after Task 6).
4. Remove these props from the interface and the destructured argument list:
   - `target`, `onTargetChange`, `eventId`, `onEventIdChange`, `initiativeId`, `onInitiativeIdChange`, `icpThreshold`, `onIcpThresholdChange`, `savedListId`, `onSavedListIdChange`, `events`, `initiatives`, `savedLists`
5. Remove the `targetOptions` constant declaration.
6. Remove the entire `{/* ---- Target Selector ---- */}` block (the `<GlassSelect>` for target plus the conditional sub-inputs `<div>` that follows it). That's roughly the last ~60 lines before the closing `</GlassCard>`.
7. Keep `selectedCount` in the interface — Task 6 will pass it in for use in the run button label (next step).
8. In the run button's label, change `Run Pipeline` to:

```tsx
<Play className="h-3.5 w-3.5" />
Run Pipeline {selectedCount > 0 ? `(${selectedCount})` : ""}
```

- [ ] **Step 3: Type-check the file in isolation**

Run: `pnpm tsc --noEmit`
Expected: Errors only in `enrichment-shell.tsx` and `center-panel.tsx` (still importing the old `ConfigPanel` / `TargetType`). Those get fixed in Task 6 / 7. No errors in `run-config-panel.tsx` itself.

- [ ] **Step 4: Commit**

```bash
git add app/admin/enrichment/components/run-config-panel.tsx
git commit -m "refactor(enrichment): rename ConfigPanel to RunConfigPanel; strip target props

Removes target/event/initiative/icp/savedList props and the target selector
block. The component is now exclusively about run configuration (stages,
fields, run button). Run button label now reflects selected count.
Shell wiring moves in the next task; build is broken between commits."
```

---

## Task 6: Refactor `enrichment-shell.tsx` to drive selection from filter

**Files:**
- Modify: `app/admin/enrichment/enrichment-shell.tsx`

This is the central refactor. The file shrinks substantially (target state + `useEffect` deletion outweighs new state).

- [ ] **Step 1: Update imports**

At the top of `enrichment-shell.tsx`:

```tsx
import {
  CenterPanel,
  type CenterState,
} from "./components/center-panel";
import {
  RunConfigPanel,
  type OrgStage,
  type EnrichField,
} from "./components/run-config-panel";
import {
  FilterPanel,
  type PersonFilterState,
  type OrgFilterState,
  EMPTY_FILTERS_PERSONS,
  EMPTY_FILTERS_ORGS,
} from "./components/filter-panel";
import { JobHistoryDrawer } from "./components/job-history-drawer";
import { applyFilter } from "@/lib/enrichment/apply-filter";
import { toggleToRelation } from "@/components/admin/event-relation-toggle";
import { useEventsPersonIds } from "@/lib/queries/use-event-affiliations";
```

Remove these imports:
- `EventRelationToggle` (still used inside `FilterPanel`, no longer in shell)
- `JobHistory` (replaced by `JobHistoryDrawer`)
- `useEventPersonIds` (replaced by `useEventsPersonIds`)
- `type FilterState` from `./components/filter-bar` (file is being deleted in Task 7)
- `type TargetType` from the old config-panel
- `Settings2` from `lucide-react` (only used for the mobile toggle, can stay if mobile sidebar stays — see Step 9)

- [ ] **Step 2: Replace state declarations**

Find the state block in `EnrichmentShell` (currently around lines 86–148). Replace target/filter state with:

```tsx
// ---- Tab ----
const [activeTab, setActiveTab] = useState<"persons" | "organizations">(defaultTab);

// ---- Center state machine ----
const [centerState, setCenterState] = useState<CenterState>("list");

// ---- Filter state (per-tab so the inactive tab keeps its filter) ----
const [filterPersons, setFilterPersons] = useState<PersonFilterState>({ ...EMPTY_FILTERS_PERSONS });
const [filterOrgs, setFilterOrgs] = useState<OrgFilterState>({ ...EMPTY_FILTERS_ORGS });

// ---- Selection (refined by user) ----
const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
const prevVisibleIdsRef = useRef<Set<string>>(new Set());

// ---- Run config (unchanged) ----
const [stages, setStages] = useState<OrgStage[]>(["apollo", "perplexity", "gemini"]);
const [personFields, setPersonFields] = useState<EnrichField[]>(["email", "linkedin"]);
const [pfPerCompany, setPfPerCompany] = useState(5);
const [pfSeniorities, setPfSeniorities] = useState([
  "Owner", "Founder", "C-Suite", "VP", "Director",
]);
const [pfDepartments, setPfDepartments] = useState<string[]>([]);

// ---- Drawer ----
const [historyOpen, setHistoryOpen] = useState<boolean>(() => {
  if (typeof window === "undefined") return false;
  return localStorage.getItem("enrichment.history.open") === "true";
});
useEffect(() => {
  localStorage.setItem("enrichment.history.open", String(historyOpen));
}, [historyOpen]);

// ---- Running / progress / queued (unchanged from current code) ----
// ... keep existing isRunning, activeJobId, jobStartTime, abortControllerRef,
// progressData, activeStages, progressCompleted, progressTotal, queuedItems,
// resultStats, resultOutcomes, viewingJobId, sortKey, sortDir, sidebarOpen
// declarations exactly as they are.
```

Delete: `target`, `setTarget`, `eventId`, `setEventId`, `initiativeId`, `setInitiativeId`, `icpThreshold`, `setIcpThreshold`, `savedListId`, `setSavedListId`, `speakerOn`, `setSpeakerOn`, `orgAffiliatedOn`, `setOrgAffiliatedOn`, `eventRelation`, `filters`, `setFilters`.

- [ ] **Step 3: Replace `useEventPersonIds` call with multi-event hook**

Find the existing call (around line 160):

```tsx
const { data: affiliatedPersonIds } = useEventPersonIds(
  activeTab === "persons" && target === "event" && eventId ? eventId : null,
  activeTab === "persons" && target === "event" ? eventRelation : null,
);
```

Replace with:

```tsx
// Compute concrete event ids and relation for the multi-event hook.
// Hook stays disabled when not on persons tab, no concrete events selected,
// or relation toggles are both off.
const concreteEventIds = useMemo(() => {
  if (activeTab !== "persons") return null;
  const ids = filterPersons.eventIds.filter((id) => id !== "__none__");
  return ids.length > 0 ? ids : null;
}, [activeTab, filterPersons.eventIds]);

const eventRelation = useMemo(
  () => toggleToRelation(filterPersons.speakerOn, filterPersons.orgAffiliatedOn),
  [filterPersons.speakerOn, filterPersons.orgAffiliatedOn]
);

const { data: affiliatedPersonIdsArr } = useEventsPersonIds(concreteEventIds, eventRelation);

const affiliatedPersonIdsSet = useMemo(
  () => (affiliatedPersonIdsArr ? new Set(affiliatedPersonIdsArr) : null),
  [affiliatedPersonIdsArr]
);
```

- [ ] **Step 4: Replace `filteredItems` memo with `applyFilter` call**

Find the existing `filteredItems` memo (around line 252) and replace with:

```tsx
const filteredItems = useMemo(() => {
  const filter = activeTab === "persons" ? filterPersons : filterOrgs;
  return applyFilter(allItems, filter, activeTab, {
    affiliatedPersonIds: affiliatedPersonIdsSet,
  });
}, [allItems, activeTab, filterPersons, filterOrgs, affiliatedPersonIdsSet]);
```

`sortedItems`, `displayItems`, and `handleSort` remain unchanged.

- [ ] **Step 5: Replace target → selection effect with filter → selection diff**

Delete the existing `useEffect` that derives `selectedIds` from `target` (around lines 342–382).

Add this new effect right after `sortedItems` is computed:

```tsx
// Selection diff: keep prior decisions for rows that stayed visible, auto-check
// rows newly entering the filter. See spec Selection-model section.
useEffect(() => {
  const nextVisible = new Set<string>(filteredItems.map((i) => i.id));
  const prevVisible = prevVisibleIdsRef.current;
  setSelectedIds((prev) => {
    const next = new Set<string>();
    // (prev ∩ nextVisible) — keep deselections from being lost on no-op refilters
    for (const id of prev) if (nextVisible.has(id)) next.add(id);
    // (nextVisible \ prevVisible) — newly visible rows auto-check
    for (const id of nextVisible) if (!prevVisible.has(id)) next.add(id);
    return next;
  });
  prevVisibleIdsRef.current = nextVisible;
}, [filteredItems]);
```

- [ ] **Step 6: Add Select-all / Clear-visible callbacks**

Add near the other handlers:

```tsx
const handleSelectAllVisible = useCallback(() => {
  setSelectedIds((prev) => {
    const next = new Set(prev);
    for (const item of filteredItems) next.add(item.id);
    return next;
  });
}, [filteredItems]);

const handleClearVisible = useCallback(() => {
  setSelectedIds((prev) => {
    const next = new Set(prev);
    for (const item of filteredItems) next.delete(item.id);
    return next;
  });
}, [filteredItems]);
```

- [ ] **Step 7: Update URL query-param effects to populate `specificIds`**

Replace the existing `preSelectedOrgs` / `preSelectedPersons` effect:

```tsx
const hasAppliedQueryParams = useRef(false);
useEffect(() => {
  if (hasAppliedQueryParams.current) return;
  if (itemsLoading || allItems.length === 0) return;

  if (activeTab === "organizations" && preSelectedOrgs.length > 0) {
    setFilterOrgs((prev) => ({ ...prev, specificIds: preSelectedOrgs }));
    hasAppliedQueryParams.current = true;
  } else if (activeTab === "persons" && preSelectedPersons.length > 0) {
    setFilterPersons((prev) => ({ ...prev, specificIds: preSelectedPersons }));
    hasAppliedQueryParams.current = true;
  }
}, [activeTab, allItems, itemsLoading, preSelectedOrgs, preSelectedPersons]);
```

Replace the `?retry=` effect:

```tsx
useEffect(() => {
  if (!retryJobId || activeTab !== "organizations") return;
  if (itemsLoading || allItems.length === 0) return;

  (async () => {
    const supabase = createClient();
    const { data: childJobs } = await supabase
      .from("job_log")
      .select("target_id, status")
      .or(`metadata->>parent_job_id.eq.${retryJobId}`)
      .in("status", ["failed", "error"]);

    if (childJobs) {
      const failedIds = childJobs
        .map((j: Record<string, unknown>) => j.target_id as string)
        .filter(Boolean);
      if (failedIds.length > 0) {
        setFilterOrgs((prev) => ({ ...prev, specificIds: failedIds }));
      }
    }
  })();
}, [retryJobId, activeTab, allItems, itemsLoading]);
```

- [ ] **Step 8: Update `switchTab` and `canRun`**

```tsx
function switchTab(tab: "persons" | "organizations") {
  if (tab === activeTab) return;
  setActiveTab(tab);
  setCenterState("list");
  setSelectedIds(new Set());
  prevVisibleIdsRef.current = new Set();
  setViewingJobId(null);
  setResultStats(undefined);
  setResultOutcomes(new Map());
  setSortKey(tab === "organizations" ? "name" : "full_name");
  setSortDir("asc");
}

const canRun = useMemo(() => {
  if (selectedIds.size === 0) return false;
  if (activeTab === "organizations" && stages.length === 0) return false;
  if (activeTab === "persons" && personFields.length === 0) return false;
  return true;
}, [selectedIds.size, activeTab, stages.length, personFields.length]);
```

Note: the previous `canRun` had a special case for "persons + target=event + eventId set + relation null". With the new model, that case is impossible — if `concreteEventIds` is non-null and `eventRelation` is null, the affiliated set is empty so `selectedIds.size === 0` already disables the run. The general check subsumes it.

- [ ] **Step 9: Update `handleRun` request body**

In the `else` branch (persons tab) of `handleRun`, simplify the body construction:

```tsx
} else {
  body.fields = personFields;
  body.source = "apollo";
  body.personIds = ids;
  // Note: we no longer send eventId/relation — selection is already authoritative.

  const res = await fetch("/api/enrich/persons", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: controller.signal,
  });
  // ... rest unchanged
}
```

The `if (target === "event" && eventId && eventRelation) { ... }` block is deleted.

- [ ] **Step 10: Replace right-sidebar JSX**

Find the desktop right-sidebar block (around line 842) and replace the children with:

```tsx
<div
  className={cn(
    "hidden lg:flex w-[360px] min-w-[320px] max-w-[400px] flex-col gap-4 shrink-0",
  )}
>
  <FilterPanel
    tab={activeTab}
    filterPersons={filterPersons}
    filterOrgs={filterOrgs}
    onFilterPersonsChange={setFilterPersons}
    onFilterOrgsChange={setFilterOrgs}
    events={events}
    initiatives={initiatives}
    savedLists={savedLists}
    categories={categories}
    sources={sources}
    filteredCount={filteredItems.length}
    selectedCount={selectedIds.size}
    onSelectAllVisible={handleSelectAllVisible}
    onClearVisible={handleClearVisible}
    disabled={isRunning}
  />

  <RunConfigPanel
    tab={activeTab}
    stages={stages}
    onStagesChange={setStages}
    personFields={personFields}
    onPersonFieldsChange={setPersonFields}
    pfPerCompany={pfPerCompany}
    onPfPerCompanyChange={setPfPerCompany}
    pfSeniorities={pfSeniorities}
    onPfSenioritiesChange={setPfSeniorities}
    pfDepartments={pfDepartments}
    onPfDepartmentsChange={setPfDepartments}
    selectedCount={selectedIds.size}
    isRunning={isRunning}
    canRun={canRun}
    onRun={handleRun}
    onStop={handleStop}
  />
</div>
```

(The `EventRelationToggle` card from the old shell is gone — it's now inside `FilterPanel`.)

Do the same replacement inside the mobile sidebar overlay (around line 906). Use the same `FilterPanel` + `RunConfigPanel` props. Drop the `EventRelationToggle` card from the mobile overlay too.

- [ ] **Step 11: Add the `JobHistoryDrawer` to the page**

The desktop sidebar no longer contains `JobHistory`. Add the drawer outside the two-panel container, as a sibling of the main flex column:

In the JSX returned by `EnrichmentShell`, just before the closing tag of the outer `<div className="flex flex-col h-[calc(100vh-120px)]">`, append:

```tsx
<JobHistoryDrawer
  open={historyOpen}
  onToggle={() => setHistoryOpen((o) => !o)}
  jobs={jobs}
  activeJobId={activeJobId}
  viewingJobId={viewingJobId}
  onSelectJob={handleSelectJob}
/>
```

For the mobile overlay, keep the existing inline `<JobHistory />` render — drawer is desktop-only per spec.

- [ ] **Step 12: Update `CenterPanel` props passed in**

Find the `<CenterPanel ... />` render (around line 813) and update:

```tsx
<CenterPanel
  state={centerState}
  tab={activeTab}
  items={displayItems}
  loading={itemsLoading}
  totalCount={totalCount}
  selectedIds={selectedIds}
  onSelectionChange={handleSelectionChange}
  progressData={progressData}
  activeStages={activeStages}
  progressCompleted={progressCompleted}
  progressTotal={progressTotal}
  resultStats={resultStats}
  resultOutcomes={resultOutcomes}
  onBackToList={handleBackToList}
  viewingJobId={viewingJobId}
  sortKey={sortKey}
  sortDir={sortDir}
  onSort={handleSort}
/>
```

The `filters`, `onFiltersChange`, `events`, `initiatives`, `categories`, `sources` props are gone — `CenterPanel` will be slimmed in Task 7.

- [ ] **Step 13: Type-check (will still error until Task 7 lands)**

Run: `pnpm tsc --noEmit`
Expected: Errors only in `center-panel.tsx` (it still expects the dropped props) and possibly in `filter-bar.tsx` (orphan file). The shell itself should be clean.

- [ ] **Step 14: Commit**

```bash
git add app/admin/enrichment/enrichment-shell.tsx
git commit -m "refactor(enrichment): drive selection from filter result

Replaces target-based selection with the filter-narrows/checkboxes-refine
model. Filter state lives per tab; selection diff preserves deselections
on no-op refilter and auto-checks newly visible rows. URL ?orgs/?persons/
?retry params populate specificIds. Drawer wired up on desktop.
center-panel.tsx still references deleted FilterBar — fixed in next task."
```

---

## Task 7: Slim `center-panel.tsx` and delete `filter-bar.tsx`

**Files:**
- Modify: `app/admin/enrichment/components/center-panel.tsx`
- Delete: `app/admin/enrichment/components/filter-bar.tsx`

- [ ] **Step 1: Edit `center-panel.tsx`**

Open the file and:

1. Remove the import of `FilterBar` and `FilterState`:
   - Delete: `import { FilterBar, type FilterState } from "./filter-bar";`
2. Remove these props from `CenterPanelProps`:
   - `filters`, `onFiltersChange`, `events`, `initiatives`, `categories`, `sources`
3. Remove from the destructured argument list: `filters`, `onFiltersChange`, `events`, `initiatives`, `categories`, `sources`.
4. Remove the `<FilterBar ... />` render block.
5. The "Count summary — between filter bar and table" `<div>` stays as-is — it still shows `Showing {filteredCount} of {totalCount}` plus the selected count, which remains useful above the table.

The result is a cleaner `CenterPanel` whose only inputs are state machine + table data + result/progress.

- [ ] **Step 2: Delete `filter-bar.tsx`**

```bash
rm app/admin/enrichment/components/filter-bar.tsx
```

- [ ] **Step 3: Type-check the whole project**

Run: `pnpm tsc --noEmit`
Expected: Zero errors related to enrichment files. Pre-existing unrelated errors are fine.

- [ ] **Step 4: Run all tests**

Run: `pnpm vitest run`
Expected: All tests pass, including new ones from Tasks 1-2 and existing ones.

- [ ] **Step 5: Commit**

```bash
git add app/admin/enrichment/components/center-panel.tsx
git rm app/admin/enrichment/components/filter-bar.tsx
git commit -m "refactor(enrichment): delete FilterBar and slim CenterPanel

Top filter row is gone; CenterPanel is now state machine + table only.
The contradictory filter surfaces are unified into the right sidebar."
```

---

## Task 8: Manual verification & polish

**Files:** none — verification only.

- [ ] **Step 1: Start the dev server**

Run: `pnpm dev`

- [ ] **Step 2: Walk the test plan from the spec**

Open `http://localhost:3000/admin/enrichment` and exercise each case from the spec's "Test plan (informal)" section, in order:

1. Cold load → both tabs show all rows, all checked, run count = total.
2. Apply event filter → visible drops, selected count drops in lockstep, run button label updates.
3. Uncheck 5 rows → tweak ICP min so 4 of those leave the visible set → widen → 4 reappear all checked, the 1 still-visible deselected row stays unchecked.
4. Select `(no event)` sentinel → only persons with empty `event_ids` show; relation toggle hidden.
5. Source `["__null__", "org_enrichment"]` → null sources + concrete value both included.
6. ICP min=70, include-null on → matches `score >= 70 OR null`.
7. Has-email = `missing`, has-linkedin = `present` → both apply (AND).
8. Visit `/admin/enrichment?persons=<3 ids>` → chip shows 3, filter neutral, all 3 checked. Click chip ✕ → full list returns.
9. Visit `/admin/enrichment?retry=<a known failed job id>` (use one from `pnpm supabase` or the bot) → chip populated with that job's failed ids.
10. Tab switch persons → orgs → orgs filter resets, selection clears, drawer state persists.
11. Toggle history drawer; reload page → drawer state survives.
12. Mid-run: filter and run-config dim, drawer toggle still works, results land on the queued set.

For each case, note any visual or behavior issue. Fix in this task before committing.

- [ ] **Step 3: Lint**

Run: `pnpm lint`
Expected: No new errors in enrichment files. Fix anything that this refactor introduced.

- [ ] **Step 4: Run all tests once more**

Run: `pnpm vitest run`
Expected: PASS.

- [ ] **Step 5: Commit any verification fixes**

If Step 2 surfaced bugs that needed fixes, commit them now:

```bash
git add -A
git commit -m "fix(enrichment): polish issues found during manual verification

[describe specific fixes]"
```

If no fixes needed, skip this step.

- [ ] **Step 6: Update CLAUDE memory**

If the spec or this implementation reveals patterns worth capturing for future sessions (e.g., the "filter-narrows + selection-diff" pattern, drawer placement convention), add a short feedback or project memory entry. This is optional.

---

## Self-review notes

- All 13 spec test-plan items are covered by Task 8 Step 2.
- All 7 file-structure entries from the spec map to specific tasks.
- `EventPersonRelation` discrepancy: spec used `"speaker" | "org" | "either"` conceptually; plan implements via existing two-boolean toggle + `toggleToRelation` helper, which matches the existing codebase.
- No placeholders, TBDs, or "similar to above" steps.
- `applyFilter` signature, `FilterContext`, `FilterPanel` props, and `JobHistoryDrawer` props are consistent across tasks.
- Build is intentionally broken between Tasks 5 and 7. Plan calls this out.
