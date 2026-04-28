# List Builder from Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add filter-driven list building to `/admin/lists/[id]` so users can grow lists by applying filters and bulk-adding matches, while keeping concrete `person_list_items` rows as the only source of truth for downstream consumers.

**Architecture:** Extract the filter state, filter application logic, and filter sidebar from `app/admin/persons/persons-table-client.tsx` into reusable modules at `lib/filters/person-filters.ts` and `components/admin/person-filter-sidebar.tsx`. Add an optional `filter_rules` JSONB column to `person_lists` to persist a list's saved filter. Rebuild the list detail page as a two-pane layout: filter sidebar + tabbed Members/Matches table.

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase (Postgres), Vitest (jsdom), TanStack Virtual, React 19, Tailwind, lucide-react.

**Commit policy:** This project commits once at the end of the work, not per-step (per user feedback). Each task ends with verification, not a commit. The final task is a single squashed commit.

**Spec:** `docs/superpowers/specs/2026-04-28-list-builder-from-filters-design.md`

---

## File Structure

**New:**
- `supabase/migrations/027_person_lists_filter_rules.sql` — adds `filter_rules jsonb` column.
- `lib/filters/person-filters.ts` — `PersonFilterRules` type + pure `applyPersonFilters` + helpers.
- `lib/filters/person-filters.test.ts` — unit tests for filter application + active-filter chips.
- `lib/data/load-person-rows.ts` — shared loader producing the `PersonRow[]` shape used by /persons and /lists/[id].
- `components/admin/person-filter-sidebar.tsx` — controlled sidebar component (filter UI only).
- `app/admin/lists/[id]/page.tsx` — list detail server component (loads rows once, hands to client).
- `app/admin/lists/[id]/list-detail-client.tsx` — client component owning rules state, tabs, and matches selection.
- `app/admin/lists/[id]/list-members-table.tsx` — Members tab table.
- `app/admin/lists/[id]/list-matches-table.tsx` — Matches tab table.

**Modified:**
- `app/admin/lists/page.tsx` — strip `ListDetail` (moves to dedicated route); index navigates to `/admin/lists/[id]`.
- `app/admin/lists/actions.ts` — extend `getLists`/`getListItems` selects, add `saveListFilter`, add `getListById`.
- `app/admin/persons/page.tsx` — call `loadPersonRows` instead of inline loading.
- `app/admin/persons/persons-table-client.tsx` — adopt `PersonFilterRules` + `<PersonFilterSidebar />` + `applyPersonFilters`.

**Untouched:** `person-table-row.tsx`, `person-preview-panel.tsx`, `AddToListDropdown`, all enrichment/sequences/pipeline code.

---

## Task 1: Migration — add filter_rules column

**Files:**
- Create: `supabase/migrations/027_person_lists_filter_rules.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 027_person_lists_filter_rules.sql
-- Optional saved filter for a person_list. Null = manual list (no saved filter).

ALTER TABLE person_lists
  ADD COLUMN IF NOT EXISTS filter_rules jsonb;

COMMENT ON COLUMN person_lists.filter_rules IS
  'Optional saved PersonFilterRules used by /admin/lists/[id] to grow the list. Membership remains in person_list_items.';
```

- [ ] **Step 2: Apply locally**

Run: `npx supabase db push` (or whatever command this repo uses; check `package.json` scripts and Supabase CLI version).
Expected: migration applies cleanly, no errors.

- [ ] **Step 3: Verify column exists**

Run from psql or Supabase dashboard:
```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'person_lists' AND column_name = 'filter_rules';
```
Expected: one row, `filter_rules | jsonb`.

---

## Task 2: PersonFilterRules type + pure apply function (TDD)

**Files:**
- Create: `lib/filters/person-filters.ts`
- Create: `lib/filters/person-filters.test.ts`

- [ ] **Step 1: Write the failing test for the type + empty rules**

`lib/filters/person-filters.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  applyPersonFilters,
  defaultPersonFilterRules,
  type PersonFilterRules,
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
```

- [ ] **Step 2: Add tests for `applyPersonFilters` covering each filter type**

Append to the same file:

```ts
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
```

- [ ] **Step 3: Run tests to confirm they fail**

Run: `npx vitest run lib/filters/person-filters.test.ts`
Expected: All tests fail with "module not found" or similar.

- [ ] **Step 4: Implement the module**

Create `lib/filters/person-filters.ts`:

```ts
import type { PersonRow, CorrelationResult } from "@/app/admin/persons/person-table-row";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PersonFilterRules = {
  search?: string;
  events?: string[];
  hasOrg?: "yes" | "no";
  correlationType?: string[];
  seniority?: string[];
  department?: string[];
  source?: string[];
  hasEmail?: boolean;
  hasLinkedin?: boolean;
  hasPhone?: boolean;
  hasTwitter?: boolean;
  hasTelegram?: boolean;
  enrichmentStatus?: string[];
  icpMin?: number;
  icpMax?: number;
  eventScope?: { eventId: string; speaker: boolean; orgAffiliated: boolean };
};

export type PersonFilterDeps = {
  correlations?: Record<string, CorrelationResult>;
  eventPersonIds?: Set<string> | null;
};

// ---------------------------------------------------------------------------
// Defaults / predicates
// ---------------------------------------------------------------------------

export function defaultPersonFilterRules(): PersonFilterRules {
  return {};
}

export function isEmptyRules(r: PersonFilterRules): boolean {
  if (r.search && r.search.trim()) return false;
  if (r.events && r.events.length) return false;
  if (r.hasOrg) return false;
  if (r.correlationType && r.correlationType.length) return false;
  if (r.seniority && r.seniority.length) return false;
  if (r.department && r.department.length) return false;
  if (r.source && r.source.length) return false;
  if (r.hasEmail) return false;
  if (r.hasLinkedin) return false;
  if (r.hasPhone) return false;
  if (r.hasTwitter) return false;
  if (r.hasTelegram) return false;
  if (r.enrichmentStatus && r.enrichmentStatus.length) return false;
  if (r.icpMin !== undefined && r.icpMin !== null && !Number.isNaN(r.icpMin)) return false;
  if (r.icpMax !== undefined && r.icpMax !== null && !Number.isNaN(r.icpMax)) return false;
  if (r.eventScope) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------

export function applyPersonFilters(
  rows: PersonRow[],
  rules: PersonFilterRules,
  deps: PersonFilterDeps,
): PersonRow[] {
  let result = rows;

  if (rules.search && rules.search.trim()) {
    const q = rules.search.toLowerCase();
    result = result.filter(
      (r) =>
        r.full_name.toLowerCase().includes(q) ||
        (r.email && r.email.toLowerCase().includes(q)) ||
        (r.primary_org_name && r.primary_org_name.toLowerCase().includes(q)),
    );
  }

  if (rules.events && rules.events.length) {
    const set = new Set(rules.events);
    result = result.filter((r) => r.personEvents.some((pe) => set.has(pe.event_id)));
  }

  if (rules.hasOrg === "yes") result = result.filter((r) => !!r.primary_org_name);
  else if (rules.hasOrg === "no") result = result.filter((r) => !r.primary_org_name);

  if (rules.correlationType && rules.correlationType.length) {
    const set = new Set(rules.correlationType);
    const corr = deps.correlations ?? {};
    result = result.filter((r) => set.has(corr[r.id]?.type ?? "none"));
  }

  if (rules.seniority && rules.seniority.length) {
    const set = new Set(rules.seniority);
    result = result.filter((r) => r.seniority && set.has(r.seniority));
  }

  if (rules.department && rules.department.length) {
    const set = new Set(rules.department);
    result = result.filter((r) => r.department && set.has(r.department));
  }

  if (rules.source && rules.source.length) {
    const set = new Set(rules.source);
    result = result.filter((r) => r.source && set.has(r.source));
  }

  if (rules.hasEmail) result = result.filter((r) => !!r.email);
  if (rules.hasLinkedin) result = result.filter((r) => !!r.linkedin_url);
  if (rules.hasPhone) result = result.filter((r) => !!r.phone);
  if (rules.hasTwitter) result = result.filter((r) => !!r.twitter_handle);
  if (rules.hasTelegram) result = result.filter((r) => !!r.telegram_handle);

  if (rules.enrichmentStatus && rules.enrichmentStatus.length) {
    const set = new Set(rules.enrichmentStatus);
    result = result.filter((r) => set.has(r.enrichment_status || "none"));
  }

  if (rules.icpMin !== undefined && !Number.isNaN(rules.icpMin)) {
    const min = rules.icpMin;
    result = result.filter((r) => r.icp_score !== null && r.icp_score >= min);
  }
  if (rules.icpMax !== undefined && !Number.isNaN(rules.icpMax)) {
    const max = rules.icpMax;
    result = result.filter((r) => r.icp_score !== null && r.icp_score <= max);
  }

  if (rules.eventScope) {
    if (deps.eventPersonIds === null || deps.eventPersonIds === undefined) {
      // null = both toggles off (spec: empty set); undefined = data not yet loaded → empty for now
      result = [];
    } else {
      const ids = deps.eventPersonIds;
      result = result.filter((r) => ids.has(r.id));
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Active-filter chips
// ---------------------------------------------------------------------------

export type ActiveFilterChip = { key: string; label: string; value: string };

export type ActiveFiltersOptions = {
  eventOptions: { id: string; name: string }[];
};

export function personFilterRulesToActiveFilters(
  r: PersonFilterRules,
  opts: ActiveFiltersOptions,
): ActiveFilterChip[] {
  const chips: ActiveFilterChip[] = [];
  if (r.events && r.events.length) {
    const names = r.events.map((id) => opts.eventOptions.find((e) => e.id === id)?.name || id);
    chips.push({ key: "events", label: "Event", value: names.join(", ") });
  }
  if (r.hasOrg) chips.push({ key: "hasOrg", label: "Has Org", value: r.hasOrg });
  if (r.correlationType && r.correlationType.length)
    chips.push({ key: "correlationType", label: "Correlation", value: r.correlationType.join(", ") });
  if (r.seniority && r.seniority.length)
    chips.push({ key: "seniority", label: "Seniority", value: r.seniority.join(", ") });
  if (r.department && r.department.length)
    chips.push({ key: "department", label: "Department", value: r.department.join(", ") });
  if (r.source && r.source.length)
    chips.push({ key: "source", label: "Source", value: r.source.join(", ") });
  if (r.hasEmail) chips.push({ key: "hasEmail", label: "Has Email", value: "Yes" });
  if (r.hasLinkedin) chips.push({ key: "hasLinkedin", label: "Has LinkedIn", value: "Yes" });
  if (r.hasPhone) chips.push({ key: "hasPhone", label: "Has Phone", value: "Yes" });
  if (r.hasTwitter) chips.push({ key: "hasTwitter", label: "Has Twitter", value: "Yes" });
  if (r.hasTelegram) chips.push({ key: "hasTelegram", label: "Has Telegram", value: "Yes" });
  if (r.enrichmentStatus && r.enrichmentStatus.length)
    chips.push({ key: "enrichmentStatus", label: "Enrichment", value: r.enrichmentStatus.join(", ") });
  if (r.icpMin !== undefined && !Number.isNaN(r.icpMin))
    chips.push({ key: "icpMin", label: "ICP Min", value: String(r.icpMin) });
  if (r.icpMax !== undefined && !Number.isNaN(r.icpMax))
    chips.push({ key: "icpMax", label: "ICP Max", value: String(r.icpMax) });
  return chips;
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export type FilterKey =
  | "events"
  | "hasOrg"
  | "correlationType"
  | "seniority"
  | "department"
  | "source"
  | "hasEmail"
  | "hasLinkedin"
  | "hasPhone"
  | "hasTwitter"
  | "hasTelegram"
  | "enrichmentStatus"
  | "icpMin"
  | "icpMax"
  | "search"
  | "eventScope";

export function removeFilterKey(r: PersonFilterRules, key: FilterKey): PersonFilterRules {
  const next = { ...r };
  delete next[key];
  return next;
}

export function clearAllFilters(): PersonFilterRules {
  return {};
}

/** Strip empty arrays / empty strings so the JSONB stored is minimal. */
export function normalizeRules(r: PersonFilterRules): PersonFilterRules {
  const next: PersonFilterRules = {};
  if (r.search && r.search.trim()) next.search = r.search.trim();
  if (r.events && r.events.length) next.events = [...r.events];
  if (r.hasOrg) next.hasOrg = r.hasOrg;
  if (r.correlationType && r.correlationType.length) next.correlationType = [...r.correlationType];
  if (r.seniority && r.seniority.length) next.seniority = [...r.seniority];
  if (r.department && r.department.length) next.department = [...r.department];
  if (r.source && r.source.length) next.source = [...r.source];
  if (r.hasEmail) next.hasEmail = true;
  if (r.hasLinkedin) next.hasLinkedin = true;
  if (r.hasPhone) next.hasPhone = true;
  if (r.hasTwitter) next.hasTwitter = true;
  if (r.hasTelegram) next.hasTelegram = true;
  if (r.enrichmentStatus && r.enrichmentStatus.length) next.enrichmentStatus = [...r.enrichmentStatus];
  if (r.icpMin !== undefined && !Number.isNaN(r.icpMin)) next.icpMin = r.icpMin;
  if (r.icpMax !== undefined && !Number.isNaN(r.icpMax)) next.icpMax = r.icpMax;
  if (r.eventScope) next.eventScope = { ...r.eventScope };
  return next;
}
```

- [ ] **Step 5: Run tests to confirm they pass**

Run: `npx vitest run lib/filters/person-filters.test.ts`
Expected: All tests pass.

---

## Task 3: Shared row loader

**Files:**
- Create: `lib/data/load-person-rows.ts`
- Modify: `app/admin/persons/page.tsx`

- [ ] **Step 1: Extract the loader**

Create `lib/data/load-person-rows.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAll } from "@/lib/supabase/fetch-all";
import type { PersonRow, PersonEvent, OrgEvent } from "@/app/admin/persons/person-table-row";

export type LoadPersonRowsResult = {
  rows: PersonRow[];
  eventOptions: { id: string; name: string }[];
  sourceOptions: string[];
  seniorityOptions: string[];
  departmentOptions: string[];
};

export async function loadPersonRows(supabase: SupabaseClient): Promise<LoadPersonRowsResult> {
  const { data: allPersons } = await fetchAll(supabase, "persons_with_icp", "*", {
    order: { column: "full_name", ascending: true },
  });

  const seenIds = new Set<string>();
  const persons = allPersons.filter((p: any) => {
    if (seenIds.has(p.id)) return false;
    seenIds.add(p.id);
    return true;
  });

  const { data: personParticipations } = await fetchAll(
    supabase,
    "event_participations",
    "person_id, event_id, role, talk_title, track, events!inner(name)",
    { filters: (q: any) => q.not("person_id", "is", null) },
  );
  const personEventsMap: Record<string, PersonEvent[]> = {};
  for (const ep of personParticipations) {
    if (!ep.person_id) continue;
    (personEventsMap[ep.person_id] ||= []).push({
      event_id: ep.event_id,
      event_name: (ep as any).events?.name ?? "",
      role: ep.role ?? "",
      talk_title: ep.talk_title ?? null,
      track: ep.track ?? null,
    });
  }

  const { data: personOrgLinks } = await fetchAll(
    supabase,
    "person_organization",
    "person_id, organization_id, organizations!inner(id, name)",
    {},
  );
  const personOrgMap: Record<string, { org_id: string; org_name: string }[]> = {};
  for (const link of personOrgLinks) {
    if (!link.person_id) continue;
    (personOrgMap[link.person_id] ||= []).push({
      org_id: (link as any).organizations?.id ?? link.organization_id,
      org_name: (link as any).organizations?.name ?? "",
    });
  }

  const { data: orgParticipations } = await fetchAll(
    supabase,
    "event_participations",
    "organization_id, event_id, role, sponsor_tier, events!inner(name), organizations!inner(id, name)",
    { filters: (q: any) => q.not("organization_id", "is", null) },
  );
  const orgEventsMap: Record<string, OrgEvent[]> = {};
  for (const op of orgParticipations) {
    if (!op.organization_id) continue;
    (orgEventsMap[op.organization_id] ||= []).push({
      event_id: op.event_id,
      event_name: (op as any).events?.name ?? "",
      tier: op.sponsor_tier ?? null,
      role: op.role ?? "",
      org_name: (op as any).organizations?.name ?? "",
      org_id: (op as any).organizations?.id ?? op.organization_id,
    });
  }

  const { data: interactions } = await fetchAll(
    supabase,
    "interactions",
    "person_id, occurred_at, created_at",
    { filters: (q: any) => q.not("person_id", "is", null) },
  );
  const interactionStats: Record<string, { count: number; last_at: string | null }> = {};
  for (const ix of interactions) {
    if (!ix.person_id) continue;
    const ixDate = ix.occurred_at || ix.created_at;
    const existing = interactionStats[ix.person_id];
    if (!existing) {
      interactionStats[ix.person_id] = { count: 1, last_at: ixDate };
    } else {
      existing.count += 1;
      if (ixDate && (!existing.last_at || ixDate > existing.last_at)) existing.last_at = ixDate;
    }
  }

  const { data: events } = await supabase.from("events").select("id, name").order("name");
  const { data: sourcesRaw } = await supabase.from("persons").select("source").not("source", "is", null);
  const { data: senioritiesRaw } = await supabase.from("persons").select("seniority").not("seniority", "is", null);
  const { data: departmentsRaw } = await supabase.from("persons").select("department").not("department", "is", null);

  const rows: PersonRow[] = persons.map((person: any) => {
    const stats = interactionStats[person.id];
    const orgs = personOrgMap[person.id] || [];
    const orgEvents: OrgEvent[] = [];
    const seenOrgEvents = new Set<string>();
    for (const org of orgs) {
      for (const oe of orgEventsMap[org.org_id] || []) {
        const key = `${oe.org_id}-${oe.event_id}`;
        if (!seenOrgEvents.has(key)) {
          seenOrgEvents.add(key);
          orgEvents.push(oe);
        }
      }
    }
    return {
      id: person.id,
      full_name: person.full_name,
      title: person.title ?? null,
      primary_org_name: person.primary_org_name ?? null,
      seniority: person.seniority ?? null,
      department: person.department ?? null,
      icp_score: person.icp_score ?? null,
      email: person.email ?? null,
      linkedin_url: person.linkedin_url ?? null,
      twitter_handle: person.twitter_handle ?? null,
      telegram_handle: person.telegram_handle ?? null,
      phone: person.phone ?? null,
      photo_url: person.photo_url ?? null,
      bio: person.bio ?? null,
      source: person.source ?? null,
      enrichment_status: person.enrichment_status ?? "not_started",
      interaction_count: stats?.count ?? 0,
      last_interaction_at: stats?.last_at ?? null,
      personEvents: personEventsMap[person.id] || [],
      orgEvents,
    };
  });

  return {
    rows,
    eventOptions: (events || []).map((e: any) => ({ id: e.id, name: e.name })),
    sourceOptions: [...new Set((sourcesRaw || []).map((s: any) => s.source).filter(Boolean))].sort() as string[],
    seniorityOptions: [...new Set((senioritiesRaw || []).map((s: any) => s.seniority).filter(Boolean))].sort() as string[],
    departmentOptions: [...new Set((departmentsRaw || []).map((d: any) => d.department).filter(Boolean))].sort() as string[],
  };
}
```

- [ ] **Step 2: Replace the inline loader in `app/admin/persons/page.tsx`**

Rewrite the file to:

```tsx
import { createClient } from "@/lib/supabase/server";
import { loadPersonRows } from "@/lib/data/load-person-rows";
import { PersonsTableClient } from "./persons-table-client";

export default async function PersonsListPage() {
  const supabase = await createClient();
  const { rows, eventOptions, sourceOptions, seniorityOptions, departmentOptions } = await loadPersonRows(supabase);
  return (
    <PersonsTableClient
      rows={rows}
      eventOptions={eventOptions}
      sourceOptions={sourceOptions}
      seniorityOptions={seniorityOptions}
      departmentOptions={departmentOptions}
    />
  );
}
```

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit`
Expected: No new errors.

Run: `npx next build` (or skip if too slow; rely on tsc + manual smoke). Expected: passes if attempted.

- [ ] **Step 4: Manual smoke**

Start the dev server (`npm run dev`), open `/admin/persons`. Expected: page renders with the same data and filters as before. Click through one event filter, one ICP range, one source filter — all should still narrow rows the same way.

---

## Task 4: PersonFilterSidebar component

**Files:**
- Create: `components/admin/person-filter-sidebar.tsx`

- [ ] **Step 1: Implement the controlled sidebar**

Create `components/admin/person-filter-sidebar.tsx`:

```tsx
"use client";

import React from "react";
import { Search } from "lucide-react";
import { GlassInput } from "@/components/ui/glass-input";
import { GlassSelect } from "@/components/ui/glass-select";
import { MultiSelectField } from "@/components/admin/multi-select-field";
import { FilterGroup } from "@/components/admin/filter-group";
import { EventRelationToggle } from "@/components/admin/event-relation-toggle";
import type { PersonFilterRules } from "@/lib/filters/person-filters";
import { cn } from "@/lib/utils";

type Option = { id: string; name: string };

export type PersonFilterSidebarProps = {
  rules: PersonFilterRules;
  onChange: (next: PersonFilterRules) => void;
  eventOptions: Option[];
  sourceOptions: string[];
  seniorityOptions: string[];
  departmentOptions: string[];
};

function Toggle({
  label, checked, onChange,
}: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer text-sm text-[var(--text-secondary)] hover:text-white transition-colors">
      <div
        className={cn(
          "w-8 h-4.5 rounded-full relative transition-colors",
          checked ? "bg-[var(--accent-orange)]/40" : "bg-white/[0.08]",
        )}
        onClick={(e) => { e.preventDefault(); onChange(!checked); }}
      >
        <div
          className={cn(
            "absolute top-0.5 w-3.5 h-3.5 rounded-full transition-all",
            checked ? "left-4 bg-[var(--accent-orange)]" : "left-0.5 bg-[var(--text-muted)]",
          )}
        />
      </div>
      {label}
    </label>
  );
}

export function PersonFilterSidebar({
  rules, onChange, eventOptions, sourceOptions, seniorityOptions, departmentOptions,
}: PersonFilterSidebarProps) {
  const set = (patch: Partial<PersonFilterRules>) => onChange({ ...rules, ...patch });

  const eventScope = rules.eventScope;

  return (
    <div className="p-3 space-y-1">
      <div className="pb-3">
        <GlassInput
          icon={Search}
          placeholder="Search name, email, org..."
          value={rules.search ?? ""}
          onChange={(e) => set({ search: e.target.value })}
        />
      </div>

      <FilterGroup title="Relationships" defaultOpen={true}>
        <div className="space-y-2">
          <GlassSelect
            placeholder="Scope by event..."
            options={eventOptions.map((ev) => ({ value: ev.id, label: ev.name }))}
            value={eventScope?.eventId ?? ""}
            onChange={(e) => {
              const eventId = e.target.value;
              if (!eventId) set({ eventScope: undefined });
              else set({ eventScope: { eventId, speaker: true, orgAffiliated: true } });
            }}
          />
          {eventScope && (
            <EventRelationToggle
              speaker={eventScope.speaker}
              orgAffiliated={eventScope.orgAffiliated}
              onChange={({ speaker, orgAffiliated }) =>
                set({ eventScope: { ...eventScope, speaker, orgAffiliated } })
              }
            />
          )}

          <MultiSelectField
            placeholder="Filter by event..."
            options={eventOptions.map((e) => ({ value: e.id, label: e.name }))}
            values={rules.events ?? []}
            onChange={(v) => set({ events: v.length ? v : undefined })}
          />

          <GlassSelect
            placeholder="Has Organization"
            options={[
              { value: "yes", label: "Yes" },
              { value: "no", label: "No" },
            ]}
            value={rules.hasOrg ?? ""}
            onChange={(e) => set({ hasOrg: (e.target.value || undefined) as PersonFilterRules["hasOrg"] })}
          />

          <MultiSelectField
            placeholder="Correlation Type"
            options={[
              { value: "speaker_sponsor", label: "Speaker + Sponsor" },
              { value: "speaker_only", label: "Speaker Only" },
              { value: "sponsor_contact", label: "Sponsor Contact" },
              { value: "org_sponsor", label: "Org Sponsor" },
              { value: "none", label: "No Event Link" },
            ]}
            values={rules.correlationType ?? []}
            onChange={(v) => set({ correlationType: v.length ? v : undefined })}
          />
        </div>
      </FilterGroup>

      <FilterGroup title="Profile" defaultOpen={false}>
        <div className="space-y-2">
          <MultiSelectField
            placeholder="Seniority"
            options={seniorityOptions.map((s) => ({ value: s, label: s }))}
            values={rules.seniority ?? []}
            onChange={(v) => set({ seniority: v.length ? v : undefined })}
          />
          <MultiSelectField
            placeholder="Department"
            options={departmentOptions.map((d) => ({ value: d, label: d }))}
            values={rules.department ?? []}
            onChange={(v) => set({ department: v.length ? v : undefined })}
          />
          <MultiSelectField
            placeholder="Source"
            options={sourceOptions.map((s) => ({ value: s, label: s }))}
            values={rules.source ?? []}
            onChange={(v) => set({ source: v.length ? v : undefined })}
          />
        </div>
      </FilterGroup>

      <FilterGroup title="Contact" defaultOpen={false}>
        <div className="space-y-2">
          <Toggle label="Has Email" checked={!!rules.hasEmail} onChange={(v) => set({ hasEmail: v || undefined })} />
          <Toggle label="Has LinkedIn" checked={!!rules.hasLinkedin} onChange={(v) => set({ hasLinkedin: v || undefined })} />
          <Toggle label="Has Phone" checked={!!rules.hasPhone} onChange={(v) => set({ hasPhone: v || undefined })} />
          <Toggle label="Has Twitter" checked={!!rules.hasTwitter} onChange={(v) => set({ hasTwitter: v || undefined })} />
          <Toggle label="Has Telegram" checked={!!rules.hasTelegram} onChange={(v) => set({ hasTelegram: v || undefined })} />
        </div>
      </FilterGroup>

      <FilterGroup title="Enrichment" defaultOpen={false}>
        <div className="space-y-2">
          <MultiSelectField
            placeholder="Enrichment Status"
            options={[
              { value: "none", label: "None" },
              { value: "in_progress", label: "In Progress" },
              { value: "complete", label: "Complete" },
              { value: "failed", label: "Failed" },
            ]}
            values={rules.enrichmentStatus ?? []}
            onChange={(v) => set({ enrichmentStatus: v.length ? v : undefined })}
          />
          <div className="flex items-center gap-2">
            <GlassInput
              placeholder="ICP Min"
              type="number"
              value={rules.icpMin?.toString() ?? ""}
              onChange={(e) => {
                const n = e.target.value === "" ? undefined : parseInt(e.target.value);
                set({ icpMin: n !== undefined && !Number.isNaN(n) ? n : undefined });
              }}
              className="w-full"
            />
            <GlassInput
              placeholder="ICP Max"
              type="number"
              value={rules.icpMax?.toString() ?? ""}
              onChange={(e) => {
                const n = e.target.value === "" ? undefined : parseInt(e.target.value);
                set({ icpMax: n !== undefined && !Number.isNaN(n) ? n : undefined });
              }}
              className="w-full"
            />
          </div>
        </div>
      </FilterGroup>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors.

---

## Task 5: Refactor `persons-table-client.tsx` to use the extracted module

**Files:**
- Modify: `app/admin/persons/persons-table-client.tsx`

- [ ] **Step 1: Replace inline filter state, sidebar JSX, and filter loop**

Open the file. Make these focused edits:

(a) Imports — add:

```tsx
import {
  PersonFilterSidebar,
} from "@/components/admin/person-filter-sidebar";
import {
  applyPersonFilters,
  defaultPersonFilterRules,
  personFilterRulesToActiveFilters,
  removeFilterKey,
  clearAllFilters,
  type PersonFilterRules,
  type FilterKey,
} from "@/lib/filters/person-filters";
```

(b) Replace the block of `useState` filter declarations (lines ~137–157, the 14 individual filter useStates including `selectedEventId`, `speakerOn`, `orgAffiliatedOn`) with a single state:

```tsx
const [rules, setRules] = useState<PersonFilterRules>(defaultPersonFilterRules);
const [searchDebounced, setSearchDebounced] = useState("");

useEffect(() => {
  const t = setTimeout(() => setSearchDebounced(rules.search ?? ""), 300);
  return () => clearTimeout(t);
}, [rules.search]);
```

Note: search debounce continues to live here. Below, when applying, pass a derived rules object that uses the debounced search.

(c) Replace the event-relation hooks block:

```tsx
const eventRelation = rules.eventScope
  ? toggleToRelation(rules.eventScope.speaker, rules.eventScope.orgAffiliated)
  : null;
const { data: events } = useEvents();
const { data: eventPersonIds } = useEventPersonIds(rules.eventScope?.eventId ?? null, eventRelation);
const { data: eventRelationMap } = useEventRelationMap(rules.eventScope?.eventId ?? null);
```

(d) Replace the `filteredRows` `useMemo` body. Drop the inline filter loop and call the extracted function. Sort logic stays:

```tsx
const filteredRows = useMemo(() => {
  const rulesForApply: PersonFilterRules = { ...rules, search: searchDebounced };
  let result = applyPersonFilters(rows, rulesForApply, {
    correlations,
    eventPersonIds: rules.eventScope ? (eventPersonIds ? new Set(eventPersonIds) : null) : undefined,
  });

  result = [...result].sort((a, b) => {
    let aVal: any = (a as any)[sortField];
    let bVal: any = (b as any)[sortField];
    if (aVal == null && bVal == null) return 0;
    if (aVal == null) return 1;
    if (bVal == null) return -1;
    if (typeof aVal === "string") aVal = aVal.toLowerCase();
    if (typeof bVal === "string") bVal = bVal.toLowerCase();
    const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
    return sortDir === "desc" ? -cmp : cmp;
  });

  return result;
}, [rows, rules, searchDebounced, eventPersonIds, sortField, sortDir, correlations]);
```

(e) Replace `activeFilters` and the remove/clear handlers:

```tsx
const activeFilters = useMemo(
  () => personFilterRulesToActiveFilters(rules, { eventOptions }),
  [rules, eventOptions],
);

const handleRemoveFilter = useCallback((key: string) => {
  setRules((r) => removeFilterKey(r, key as FilterKey));
}, []);

const handleClearAll = useCallback(() => {
  setRules(clearAllFilters());
}, []);
```

(f) Replace the entire sidebar JSX block (the giant `<GlassCard>` with `FilterGroup`s) with `<PersonFilterSidebar />`:

```tsx
const sidebar = (
  <div className="space-y-3">
    <GlassCard padding={false} className="overflow-hidden">
      <PersonFilterSidebar
        rules={rules}
        onChange={setRules}
        eventOptions={eventOptions}
        sourceOptions={sourceOptions}
        seniorityOptions={seniorityOptions}
        departmentOptions={departmentOptions}
      />
    </GlassCard>

    <ActiveFilters
      filters={activeFilters}
      onRemove={handleRemoveFilter}
      onClearAll={handleClearAll}
    />

    <SelectionSummary
      count={selectedIds.size}
      stats={selectionStats}
      actions={
        <div className="flex items-center gap-2">
          <AddToListDropdown personIds={Array.from(selectedIds)} />
          <Link
            href={`/admin/enrichment?persons=${Array.from(selectedIds).join(",")}`}
            className="px-2.5 py-1 text-xs font-medium rounded-lg bg-[var(--accent-orange)]/15 text-[var(--accent-orange)] border border-[var(--accent-orange)]/20 hover:bg-[var(--accent-orange)]/25 whitespace-nowrap"
          >
            Enrich
          </Link>
        </div>
      }
    />

    <PersonPreviewPanel
      setterRef={previewSetterRef}
      correlations={correlations}
      onMouseEnter={handlePreviewMouseEnter}
      onMouseLeave={handlePreviewMouseLeave}
    />
  </div>
);
```

(g) Update `PersonTableRow` `eventRelation` prop (was `selectedEventId`-keyed, now `rules.eventScope?.eventId`):

```tsx
eventRelation={
  rules.eventScope?.eventId ? eventRelationMap?.get(row.id) : undefined
}
```

(h) Remove now-dead imports (the individual filter components imported only inline). The remaining used imports include `GlassCard`, `Search`/etc. icons used elsewhere.

- [ ] **Step 2: Verify build and types**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Manual smoke /persons**

Start dev server, open `/admin/persons`. Verify:
- Search narrows rows (debounced).
- Each filter (events, hasOrg, correlation type, seniority, department, source, has-channel toggles, enrichment status, ICP min/max) still narrows rows the same as before.
- Event scope dropdown + speaker/org-affiliated toggles still scope rows.
- Active-filter chips still appear and clearing one still works.
- Sort columns still work.
- Selection + AddToListDropdown still works.

Expected: behavior identical to pre-refactor.

---

## Task 6: List server actions — saveListFilter + extended selects

**Files:**
- Modify: `app/admin/lists/actions.ts`

- [ ] **Step 1: Update file**

Replace the contents of `app/admin/lists/actions.ts`:

```ts
"use server";

import { createClient } from "@/lib/supabase/server";
import type { PersonFilterRules } from "@/lib/filters/person-filters";

export async function getLists() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("person_lists")
    .select("*, person_list_items(count)")
    .order("updated_at", { ascending: false });
  return { data: data ?? [], error: error?.message ?? null };
}

export async function getListById(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("person_lists")
    .select("*, person_list_items(count)")
    .eq("id", id)
    .single();
  return { data, error: error?.message ?? null };
}

export async function createList(name: string, description?: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("person_lists")
    .insert({ name, description: description || null })
    .select("id")
    .single();
  return { data, error: error?.message ?? null };
}

export async function updateList(id: string, updates: { name?: string; description?: string }) {
  const supabase = await createClient();
  const { error } = await supabase.from("person_lists").update(updates).eq("id", id);
  return { success: !error, error: error?.message ?? null };
}

export async function saveListFilter(id: string, rules: PersonFilterRules | null) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("person_lists")
    .update({ filter_rules: rules })
    .eq("id", id);
  return { success: !error, error: error?.message ?? null };
}

export async function deleteList(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("person_lists").delete().eq("id", id);
  return { success: !error, error: error?.message ?? null };
}

export async function getListItems(listId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("person_list_items")
    .select("person_id")
    .eq("list_id", listId);
  return { data: data ?? [], error: error?.message ?? null };
}

export async function addToList(listId: string, personIds: string[]) {
  if (personIds.length === 0) return { success: true, error: null };
  const supabase = await createClient();
  const rows = personIds.map((pid) => ({ list_id: listId, person_id: pid }));
  const { error } = await supabase
    .from("person_list_items")
    .upsert(rows, { onConflict: "list_id,person_id", ignoreDuplicates: true });
  return { success: !error, error: error?.message ?? null };
}

export async function removeFromList(listId: string, personIds: string[]) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("person_list_items")
    .delete()
    .eq("list_id", listId)
    .in("person_id", personIds);
  return { success: !error, error: error?.message ?? null };
}
```

Note: `getListItems` was previously joining `persons(...)`. We no longer need the join because the list detail page already has the full `PersonRow[]` from `loadPersonRows()`; we only need the set of `person_id`s in the list.

- [ ] **Step 2: Update consumers of `getListItems`**

The old result shape was `{ id, list_id, person_id, added_at, person: {…} }[]`. After the change, downstream usage on the detail page is rebuilt in Task 7. There are no other consumers of `getListItems` outside `app/admin/lists/page.tsx`.

Verify: `grep -rn "getListItems" /Users/evansteinhilv/genzio/Cannes/app /Users/evansteinhilv/genzio/Cannes/components /Users/evansteinhilv/genzio/Cannes/lib`. Expected: only `app/admin/lists/page.tsx` (and after Task 7, only the new `[id]` route).

- [ ] **Step 3: Verify types**

Run: `npx tsc --noEmit`
Expected: errors only inside `app/admin/lists/page.tsx` (it still references the old `ListItem` shape and `getListItems` join). These get fixed in Task 7.

---

## Task 7: List detail route — server shell

**Files:**
- Create: `app/admin/lists/[id]/page.tsx`

- [ ] **Step 1: Implement the server component**

Create `app/admin/lists/[id]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadPersonRows } from "@/lib/data/load-person-rows";
import { getListById, getListItems } from "../actions";
import { ListDetailClient } from "./list-detail-client";

export default async function ListDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: list }, { data: itemRows }, rowsResult] = await Promise.all([
    getListById(id),
    getListItems(id),
    loadPersonRows(supabase),
  ]);

  if (!list) notFound();

  const memberIds = (itemRows as { person_id: string }[]).map((r) => r.person_id);

  return (
    <ListDetailClient
      list={{
        id: list.id,
        name: list.name,
        description: list.description,
        filter_rules: list.filter_rules ?? null,
      }}
      initialMemberIds={memberIds}
      rows={rowsResult.rows}
      eventOptions={rowsResult.eventOptions}
      sourceOptions={rowsResult.sourceOptions}
      seniorityOptions={rowsResult.seniorityOptions}
      departmentOptions={rowsResult.departmentOptions}
    />
  );
}
```

- [ ] **Step 2: Verify it compiles (will fail until Task 8 client exists)**

Defer verification to Task 8.

---

## Task 8: List detail client — top-level component, tabs, saved filter

**Files:**
- Create: `app/admin/lists/[id]/list-detail-client.tsx`

- [ ] **Step 1: Implement the client component**

```tsx
"use client";

import React, { useState, useMemo, useCallback, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Bookmark,
  BookmarkCheck,
  Loader2,
  Pencil,
  Save,
  UserPlus,
  X,
} from "lucide-react";
import { TwoPanelLayout } from "@/components/admin/two-panel-layout";
import { GlassCard } from "@/components/ui/glass-card";
import { ActiveFilters } from "@/components/admin/active-filters";
import { PersonFilterSidebar } from "@/components/admin/person-filter-sidebar";
import {
  applyPersonFilters,
  defaultPersonFilterRules,
  isEmptyRules,
  normalizeRules,
  personFilterRulesToActiveFilters,
  removeFilterKey,
  clearAllFilters,
  type PersonFilterRules,
  type FilterKey,
} from "@/lib/filters/person-filters";
import { useEvents } from "@/lib/queries/use-events";
import { useEventPersonIds, useEventRelationMap } from "@/lib/queries/use-event-affiliations";
import { toggleToRelation } from "@/components/admin/event-relation-toggle";
import type { PersonRow, CorrelationResult } from "@/app/admin/persons/person-table-row";
import { ListMembersTable } from "./list-members-table";
import { ListMatchesTable } from "./list-matches-table";
import {
  addToList,
  removeFromList,
  saveListFilter,
  updateList,
  getListItems,
} from "../actions";
import { cn } from "@/lib/utils";

const SPEAKER_ROLES = ["speaker", "panelist", "mc"];

function computeCorrelation(row: PersonRow): CorrelationResult {
  const personSpeakerEvents = row.personEvents.filter((e) => SPEAKER_ROLES.includes(e.role));
  for (const pe of personSpeakerEvents) {
    const orgMatch = row.orgEvents.find((oe) => oe.event_id === pe.event_id);
    if (orgMatch && orgMatch.tier) {
      return {
        type: "speaker_sponsor",
        segments: [
          { text: "Speaker" },
          { text: orgMatch.org_name, href: `/admin/organizations/${orgMatch.org_id}` },
          { text: `${orgMatch.tier} Sponsor`, badge: orgMatch.tier.toLowerCase() },
        ],
      };
    }
  }
  for (const pe of row.personEvents) {
    const orgMatch = row.orgEvents.find((oe) => oe.event_id === pe.event_id);
    if (orgMatch && orgMatch.tier) {
      return {
        type: "sponsor_contact",
        segments: [
          { text: pe.role },
          { text: orgMatch.org_name, href: `/admin/organizations/${orgMatch.org_id}` },
          { text: `${orgMatch.tier} Sponsor`, badge: orgMatch.tier.toLowerCase() },
        ],
      };
    }
  }
  if (personSpeakerEvents.length > 0) {
    const pe = personSpeakerEvents[0];
    return { type: "speaker_only", segments: [{ text: "Speaker" }, { text: pe.event_name }] };
  }
  if (row.orgEvents.length > 0) {
    const oe = row.orgEvents.find((o) => o.tier) || row.orgEvents[0];
    if (oe.tier) {
      return {
        type: "org_sponsor",
        segments: [
          { text: oe.org_name, href: `/admin/organizations/${oe.org_id}` },
          { text: `${oe.tier} Sponsor`, badge: oe.tier.toLowerCase() },
        ],
      };
    }
  }
  return { type: "none", segments: [] };
}

export type ListDetailClientProps = {
  list: { id: string; name: string; description: string | null; filter_rules: PersonFilterRules | null };
  initialMemberIds: string[];
  rows: PersonRow[];
  eventOptions: { id: string; name: string }[];
  sourceOptions: string[];
  seniorityOptions: string[];
  departmentOptions: string[];
};

export function ListDetailClient(props: ListDetailClientProps) {
  const router = useRouter();
  const { list, rows, eventOptions, sourceOptions, seniorityOptions, departmentOptions } = props;

  const [memberIds, setMemberIds] = useState<Set<string>>(() => new Set(props.initialMemberIds));
  const [tab, setTab] = useState<"members" | "matches">("members");
  const [rules, setRules] = useState<PersonFilterRules>(() => list.filter_rules ?? defaultPersonFilterRules());
  const [savedRules, setSavedRules] = useState<PersonFilterRules | null>(list.filter_rules);
  const [isSavingFilter, setIsSavingFilter] = useState(false);
  const [, startTransition] = useTransition();

  // Inline edit
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(list.name);
  const [editingDesc, setEditingDesc] = useState(false);
  const [descValue, setDescValue] = useState(list.description ?? "");

  // Event scope (mirrors /persons)
  const eventRelation = rules.eventScope
    ? toggleToRelation(rules.eventScope.speaker, rules.eventScope.orgAffiliated)
    : null;
  const { data: events } = useEvents();
  const { data: eventPersonIds } = useEventPersonIds(rules.eventScope?.eventId ?? null, eventRelation);
  const { data: eventRelationMap } = useEventRelationMap(rules.eventScope?.eventId ?? null);
  void events; // hook kept for consistency; eventOptions already provided server-side

  // Correlations precomputed once
  const correlations = useMemo(() => {
    const map: Record<string, CorrelationResult> = {};
    for (const row of rows) map[row.id] = computeCorrelation(row);
    return map;
  }, [rows]);

  const memberRows = useMemo(() => rows.filter((r) => memberIds.has(r.id)), [rows, memberIds]);

  // Apply filters — Members tab scopes to memberRows; Matches tab scopes to all rows.
  const filteredMembers = useMemo(() =>
    applyPersonFilters(memberRows, rules, {
      correlations,
      eventPersonIds: rules.eventScope ? (eventPersonIds ? new Set(eventPersonIds) : null) : undefined,
    }),
    [memberRows, rules, correlations, eventPersonIds],
  );

  const filteredMatches = useMemo(() =>
    applyPersonFilters(rows, rules, {
      correlations,
      eventPersonIds: rules.eventScope ? (eventPersonIds ? new Set(eventPersonIds) : null) : undefined,
    }),
    [rows, rules, correlations, eventPersonIds],
  );

  const newMatchesCount = useMemo(
    () => filteredMatches.reduce((n, r) => (memberIds.has(r.id) ? n : n + 1), 0),
    [filteredMatches, memberIds],
  );

  const activeFilters = useMemo(
    () => personFilterRulesToActiveFilters(rules, { eventOptions }),
    [rules, eventOptions],
  );

  const handleRemoveFilter = useCallback(
    (key: string) => setRules((r) => removeFilterKey(r, key as FilterKey)),
    [],
  );
  const handleClearAll = useCallback(() => setRules(clearAllFilters()), []);

  // Saved filter state
  const rulesEqualSaved = useMemo(() => {
    return JSON.stringify(normalizeRules(rules)) === JSON.stringify(savedRules ?? {});
  }, [rules, savedRules]);

  const hasSavedFilter = savedRules !== null && !isEmptyRules(savedRules);

  async function handleSaveFilter() {
    setIsSavingFilter(true);
    const normalized = normalizeRules(rules);
    const toSave = isEmptyRules(normalized) ? null : normalized;
    const { success } = await saveListFilter(list.id, toSave);
    if (success) setSavedRules(toSave);
    setIsSavingFilter(false);
  }

  async function handleClearSavedFilter() {
    setIsSavingFilter(true);
    const { success } = await saveListFilter(list.id, null);
    if (success) setSavedRules(null);
    setIsSavingFilter(false);
  }

  // Members mutations
  async function refreshMembers() {
    const { data } = await getListItems(list.id);
    setMemberIds(new Set((data as { person_id: string }[]).map((r) => r.person_id)));
  }
  async function handleAddMatches(ids: string[]) {
    const toAdd = ids.filter((id) => !memberIds.has(id));
    if (toAdd.length === 0) return;
    await addToList(list.id, toAdd);
    await refreshMembers();
  }
  async function handleRemoveMembers(ids: string[]) {
    if (ids.length === 0) return;
    await removeFromList(list.id, ids);
    await refreshMembers();
  }

  // Inline name/desc save
  async function saveName() {
    if (!nameValue.trim() || nameValue.trim() === list.name) {
      setEditingName(false);
      setNameValue(list.name);
      return;
    }
    await updateList(list.id, { name: nameValue.trim() });
    setEditingName(false);
    startTransition(() => router.refresh());
  }
  async function saveDesc() {
    if (descValue.trim() === (list.description ?? "")) {
      setEditingDesc(false);
      return;
    }
    await updateList(list.id, { description: descValue.trim() || undefined });
    setEditingDesc(false);
    startTransition(() => router.refresh());
  }

  // Sidebar
  const sidebar = (
    <div className="space-y-3">
      <GlassCard padding={false} className="overflow-hidden">
        <PersonFilterSidebar
          rules={rules}
          onChange={setRules}
          eventOptions={eventOptions}
          sourceOptions={sourceOptions}
          seniorityOptions={seniorityOptions}
          departmentOptions={departmentOptions}
        />
      </GlassCard>
      <ActiveFilters filters={activeFilters} onRemove={handleRemoveFilter} onClearAll={handleClearAll} />
    </div>
  );

  return (
    <TwoPanelLayout sidebar={sidebar}>
      <div className="space-y-4">
        {/* Header */}
        <div>
          <Link
            href="/admin/lists"
            className="flex items-center gap-1.5 text-sm text-[var(--text-muted)] hover:text-white transition-colors mb-3"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Lists
          </Link>

          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              {editingName ? (
                <input
                  autoFocus
                  value={nameValue}
                  onChange={(e) => setNameValue(e.target.value)}
                  onBlur={saveName}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveName();
                    if (e.key === "Escape") { setNameValue(list.name); setEditingName(false); }
                  }}
                  className="text-2xl font-semibold font-[family-name:var(--font-heading)] bg-transparent border-b border-[var(--accent-orange)]/50 text-white w-full focus:outline-none pb-0.5"
                />
              ) : (
                <button onClick={() => setEditingName(true)} className="group flex items-center gap-2">
                  <h1 className="text-2xl font-semibold font-[family-name:var(--font-heading)] text-white">
                    {list.name}
                  </h1>
                  <Pencil className="h-4 w-4 text-[var(--text-muted)] opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                </button>
              )}

              <div className="mt-1">
                {editingDesc ? (
                  <input
                    autoFocus
                    value={descValue}
                    onChange={(e) => setDescValue(e.target.value)}
                    onBlur={saveDesc}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveDesc();
                      if (e.key === "Escape") { setDescValue(list.description ?? ""); setEditingDesc(false); }
                    }}
                    placeholder="Add a description..."
                    className="text-sm bg-transparent border-b border-[var(--accent-orange)]/30 text-[var(--text-secondary)] w-full focus:outline-none pb-0.5 placeholder:text-[var(--text-muted)]"
                  />
                ) : (
                  <button onClick={() => setEditingDesc(true)} className="group flex items-center gap-1.5">
                    <span className="text-sm text-[var(--text-muted)]">
                      {list.description || "Add a description..."}
                    </span>
                    <Pencil className="h-3 w-3 text-[var(--text-muted)] opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {/* Saved filter chip */}
              {hasSavedFilter && (
                <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-[var(--accent-indigo)]/10 border border-[var(--accent-indigo)]/20 text-[var(--accent-indigo)] text-xs">
                  <BookmarkCheck className="h-3.5 w-3.5" />
                  <span>Saved filter</span>
                  <button
                    onClick={handleClearSavedFilter}
                    disabled={isSavingFilter}
                    title="Clear saved filter"
                    className="ml-1 hover:text-white"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )}
              {/* Save filter */}
              <button
                onClick={handleSaveFilter}
                disabled={isSavingFilter || isEmptyRules(rules) || rulesEqualSaved}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200",
                  "bg-[var(--accent-orange)]/15 text-[var(--accent-orange)] border border-[var(--accent-orange)]/20 hover:bg-[var(--accent-orange)]/25",
                  "disabled:opacity-40 disabled:cursor-not-allowed",
                )}
              >
                {isSavingFilter ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                {hasSavedFilter ? "Update saved filter" : "Save filter"}
              </button>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-[var(--glass-border)]">
          <button
            onClick={() => setTab("members")}
            className={cn(
              "px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px",
              tab === "members"
                ? "border-[var(--accent-orange)] text-white"
                : "border-transparent text-[var(--text-muted)] hover:text-white",
            )}
          >
            Members <span className="ml-1 tabular-nums text-xs">{memberIds.size}</span>
          </button>
          <button
            onClick={() => setTab("matches")}
            className={cn(
              "px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px",
              tab === "matches"
                ? "border-[var(--accent-orange)] text-white"
                : "border-transparent text-[var(--text-muted)] hover:text-white",
            )}
          >
            Matches
            {!isEmptyRules(rules) && (
              <span className="ml-1 tabular-nums text-xs text-[var(--accent-indigo)]">
                {filteredMatches.length}
                {newMatchesCount > 0 && ` (+${newMatchesCount})`}
              </span>
            )}
          </button>
        </div>

        {/* Body */}
        {tab === "members" ? (
          <ListMembersTable
            rows={filteredMembers}
            correlations={correlations}
            eventRelationMap={rules.eventScope?.eventId ? eventRelationMap : undefined}
            onRemove={handleRemoveMembers}
            isFiltered={!isEmptyRules(rules)}
            totalMembers={memberIds.size}
          />
        ) : (
          <ListMatchesTable
            rows={filteredMatches}
            correlations={correlations}
            eventRelationMap={rules.eventScope?.eventId ? eventRelationMap : undefined}
            memberIds={memberIds}
            onAdd={handleAddMatches}
            isFiltered={!isEmptyRules(rules)}
          />
        )}
      </div>
    </TwoPanelLayout>
  );
}
```

Note: `useEvents()` import is kept to populate `eventOptions` in case the prop isn't passed; here `eventOptions` is server-provided so the hook return is unused. This pattern matches `/persons`.

- [ ] **Step 2: Defer compile until Tasks 9–10 land**

---

## Task 9: ListMembersTable

**Files:**
- Create: `app/admin/lists/[id]/list-members-table.tsx`

- [ ] **Step 1: Implement**

```tsx
"use client";

import React, { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Trash2, Users } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { HeaderCell } from "@/components/ui/data-cell";
import { PersonTableRow, GlassCheckbox, PERSON_GRID_COLS } from "@/app/admin/persons/person-table-row";
import type { PersonRow, CorrelationResult } from "@/app/admin/persons/person-table-row";
import type { EventRelation } from "@/lib/queries/use-event-affiliations";
import { cn } from "@/lib/utils";

export type ListMembersTableProps = {
  rows: PersonRow[];
  correlations: Record<string, CorrelationResult>;
  eventRelationMap?: Map<string, EventRelation> | undefined;
  onRemove: (personIds: string[]) => Promise<void>;
  isFiltered: boolean;
  totalMembers: number;
};

export function ListMembersTable({
  rows, correlations, eventRelationMap, onRemove, isFiltered, totalMembers,
}: ListMembersTableProps) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isRemoving, setIsRemoving] = useState(false);
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 36,
    overscan: 5,
  });

  const allSelected = rows.length > 0 && rows.every((r) => selectedIds.has(r.id));

  const toggleAll = useCallback(() => {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(rows.map((r) => r.id)));
  }, [allSelected, rows]);

  const handleCheckboxClick = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  async function handleRemoveSelected() {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Remove ${selectedIds.size} ${selectedIds.size === 1 ? "person" : "persons"} from this list?`)) return;
    setIsRemoving(true);
    await onRemove(Array.from(selectedIds));
    setSelectedIds(new Set());
    setIsRemoving(false);
  }

  const noop = useCallback(() => {}, []);

  return (
    <GlassCard padding={false}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--glass-border)]">
        <h2 className="text-sm font-medium text-[var(--text-muted)]">
          {isFiltered ? `Filtered members` : `All members`}
          <span className="ml-1.5 tabular-nums">{rows.length}</span>
          {isFiltered && <span className="ml-1 text-[var(--text-muted)]">/ {totalMembers}</span>}
        </h2>
        {selectedIds.size > 0 && (
          <button
            onClick={handleRemoveSelected}
            disabled={isRemoving}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 disabled:opacity-50"
          >
            <Trash2 className="h-3 w-3" />
            Remove {selectedIds.size}
          </button>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Users className="h-8 w-8 text-[var(--text-muted)] mb-3" />
          <p className="text-sm text-[var(--text-muted)]">
            {isFiltered ? "No members match these filters." : "No members yet."}
          </p>
          {!isFiltered && (
            <p className="text-xs text-[var(--text-muted)] mt-2">
              Switch to Matches and apply filters to add people.
            </p>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div
            ref={parentRef}
            className="w-full min-w-[800px] overflow-y-auto"
            style={{ maxHeight: "calc(100vh - 280px)" }}
          >
            <div
              className="grid sticky top-0 z-10 bg-[var(--glass-bg)] backdrop-blur-sm border-b border-[var(--glass-border)]"
              style={{ gridTemplateColumns: PERSON_GRID_COLS }}
            >
              <HeaderCell>
                <GlassCheckbox checked={allSelected} onChange={toggleAll} />
              </HeaderCell>
              <HeaderCell>Name</HeaderCell>
              <HeaderCell>Organization</HeaderCell>
              <HeaderCell>ICP</HeaderCell>
              <HeaderCell>Channels</HeaderCell>
              <HeaderCell>Events</HeaderCell>
              <HeaderCell className="hidden lg:block">Correlation</HeaderCell>
              <HeaderCell className="hidden lg:block">Enr.</HeaderCell>
              <HeaderCell>Activity</HeaderCell>
            </div>
            <div style={{ position: "relative", height: `${virtualizer.getTotalSize()}px` }}>
              {virtualizer.getVirtualItems().map((vi) => {
                const row = rows[vi.index];
                return (
                  <PersonTableRow
                    key={row.id}
                    row={row}
                    isSelected={selectedIds.has(row.id)}
                    correlation={correlations[row.id]}
                    eventRelation={eventRelationMap?.get(row.id)}
                    idx={vi.index}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      height: `${vi.size}px`,
                      transform: `translateY(${vi.start}px)`,
                    }}
                    onMouseEnter={noop}
                    onMouseLeave={noop}
                    onCheckboxClick={(id) => handleCheckboxClick(id)}
                    onRowClick={(id) => router.push(`/admin/persons/${id}`)}
                  />
                );
              })}
            </div>
          </div>
        </div>
      )}
    </GlassCard>
  );
}
```

Note: hover-preview is dropped here for simplicity; the persons page keeps it.

---

## Task 10: ListMatchesTable

**Files:**
- Create: `app/admin/lists/[id]/list-matches-table.tsx`

- [ ] **Step 1: Implement**

```tsx
"use client";

import React, { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Loader2, UserPlus, Users, Check } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { HeaderCell } from "@/components/ui/data-cell";
import { PersonTableRow, GlassCheckbox, PERSON_GRID_COLS } from "@/app/admin/persons/person-table-row";
import type { PersonRow, CorrelationResult } from "@/app/admin/persons/person-table-row";
import type { EventRelation } from "@/lib/queries/use-event-affiliations";
import { cn } from "@/lib/utils";

export type ListMatchesTableProps = {
  rows: PersonRow[];
  correlations: Record<string, CorrelationResult>;
  eventRelationMap?: Map<string, EventRelation> | undefined;
  memberIds: Set<string>;
  onAdd: (personIds: string[]) => Promise<void>;
  isFiltered: boolean;
};

export function ListMatchesTable({
  rows, correlations, eventRelationMap, memberIds, onAdd, isFiltered,
}: ListMatchesTableProps) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isAdding, setIsAdding] = useState(false);
  const parentRef = useRef<HTMLDivElement>(null);

  const newMatches = useMemo(() => rows.filter((r) => !memberIds.has(r.id)), [rows, memberIds]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 36,
    overscan: 5,
  });

  const allNotInListSelected =
    newMatches.length > 0 && newMatches.every((r) => selectedIds.has(r.id));

  const toggleSelectAllNew = useCallback(() => {
    if (allNotInListSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(newMatches.map((r) => r.id)));
    }
  }, [allNotInListSelected, newMatches]);

  const handleCheckboxClick = useCallback((id: string) => {
    if (memberIds.has(id)) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, [memberIds]);

  async function handleAddSelected() {
    if (selectedIds.size === 0) return;
    setIsAdding(true);
    await onAdd(Array.from(selectedIds));
    setSelectedIds(new Set());
    setIsAdding(false);
  }

  const noop = useCallback(() => {}, []);

  // Empty states
  if (!isFiltered) {
    return (
      <GlassCard>
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Users className="h-8 w-8 text-[var(--text-muted)] mb-3" />
          <p className="text-sm text-[var(--text-muted)]">Apply filters to find matches.</p>
        </div>
      </GlassCard>
    );
  }

  if (rows.length === 0) {
    return (
      <GlassCard>
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Users className="h-8 w-8 text-[var(--text-muted)] mb-3" />
          <p className="text-sm text-[var(--text-muted)]">No persons match these filters.</p>
        </div>
      </GlassCard>
    );
  }

  return (
    <GlassCard padding={false}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--glass-border)]">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-medium text-[var(--text-muted)]">
            Matches <span className="ml-1.5 tabular-nums">{rows.length}</span>
            {newMatches.length > 0 && (
              <span className="ml-2 text-xs text-[var(--accent-indigo)]">
                {newMatches.length} not in list
              </span>
            )}
          </h2>
          {newMatches.length > 0 && (
            <button
              onClick={toggleSelectAllNew}
              className="text-xs text-[var(--accent-indigo)] hover:underline"
            >
              {allNotInListSelected ? "Clear selection" : `Select all ${newMatches.length}`}
            </button>
          )}
        </div>
        <button
          onClick={handleAddSelected}
          disabled={selectedIds.size === 0 || isAdding}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200",
            "bg-[var(--accent-orange)] text-white hover:bg-[var(--accent-orange)]/90",
            "shadow-lg shadow-[var(--accent-orange)]/20",
            "disabled:opacity-40 disabled:cursor-not-allowed",
          )}
        >
          {isAdding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
          Add {selectedIds.size > 0 ? selectedIds.size : ""} to list
        </button>
      </div>

      <div className="overflow-x-auto">
        <div
          ref={parentRef}
          className="w-full min-w-[800px] overflow-y-auto"
          style={{ maxHeight: "calc(100vh - 280px)" }}
        >
          <div
            className="grid sticky top-0 z-10 bg-[var(--glass-bg)] backdrop-blur-sm border-b border-[var(--glass-border)]"
            style={{ gridTemplateColumns: PERSON_GRID_COLS }}
          >
            <HeaderCell />
            <HeaderCell>Name</HeaderCell>
            <HeaderCell>Organization</HeaderCell>
            <HeaderCell>ICP</HeaderCell>
            <HeaderCell>Channels</HeaderCell>
            <HeaderCell>Events</HeaderCell>
            <HeaderCell className="hidden lg:block">Correlation</HeaderCell>
            <HeaderCell className="hidden lg:block">Enr.</HeaderCell>
            <HeaderCell>Status</HeaderCell>
          </div>
          <div style={{ position: "relative", height: `${virtualizer.getTotalSize()}px` }}>
            {virtualizer.getVirtualItems().map((vi) => {
              const row = rows[vi.index];
              const inList = memberIds.has(row.id);
              return (
                <div
                  key={row.id}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: `${vi.size}px`,
                    transform: `translateY(${vi.start}px)`,
                    opacity: inList ? 0.55 : 1,
                  }}
                >
                  <PersonTableRow
                    row={row}
                    isSelected={selectedIds.has(row.id)}
                    correlation={correlations[row.id]}
                    eventRelation={eventRelationMap?.get(row.id)}
                    idx={vi.index}
                    style={{}}
                    onMouseEnter={noop}
                    onMouseLeave={noop}
                    onCheckboxClick={(id) => handleCheckboxClick(id)}
                    onRowClick={(id) => router.push(`/admin/persons/${id}`)}
                  />
                  {inList && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 text-xs text-[var(--accent-indigo)] bg-[var(--accent-indigo)]/10 px-2 py-0.5 rounded">
                      <Check className="h-3 w-3" /> in list
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </GlassCard>
  );
}
```

Note on row visuals: `PersonTableRow` already shows a checkbox in column 1; for "in list" rows we soften the row with opacity and a corner badge to indicate the row is non-interactable as a selection (handled in `handleCheckboxClick` early return).

---

## Task 11: Index page navigates to dedicated detail route

**Files:**
- Modify: `app/admin/lists/page.tsx`

- [ ] **Step 1: Strip the inline detail view; index navigates by URL**

The existing `app/admin/lists/page.tsx` mixes index + detail in one client component using local state. With the new dedicated `[id]` route, the index becomes simpler: clicking a list navigates to `/admin/lists/<id>`.

Apply these changes to the file:

(a) Delete `ListDetail`, `AddMembersPanel`, and `ListItem`/`PersonSearchResult` types. Keep `NewListModal`, `ListsIndex`, and the `ListsPage` root.

(b) In `ListsPage`, remove `selectedListId` state and the conditional that renders `<ListDetail />`. Add a router and use it on select:

```tsx
"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassInput } from "@/components/ui/glass-input";
import { cn } from "@/lib/utils";
import {
  Plus, Trash2, Users, Loader2, X, ChevronRight,
} from "lucide-react";
import { getLists, createList, deleteList } from "./actions";

interface PersonList {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  filter_rules: unknown | null;
  person_list_items: { count: number }[];
}

function NewListModal({
  onClose, onCreate,
}: { onClose: () => void; onCreate: (id: string) => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    if (!name.trim()) return;
    setIsCreating(true);
    setError(null);
    const result = await createList(name.trim(), description.trim() || undefined);
    if (result.error || !result.data) {
      setError(result.error ?? "Failed to create list");
      setIsCreating(false);
      return;
    }
    onCreate(result.data.id);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative glass rounded-xl p-6 w-full max-w-md mx-4 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-white">New List</h2>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-[var(--text-muted)] mb-1.5">
              Name <span className="text-red-400">*</span>
            </label>
            <GlassInput
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") onClose(); }}
              placeholder="e.g. EthCC Tier 1 Speakers"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs text-[var(--text-muted)] mb-1.5">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
              placeholder="Optional description..."
              rows={3}
              className={cn(
                "w-full rounded-lg bg-[var(--glass-bg)] border border-[var(--glass-border)]",
                "backdrop-blur-xl text-white placeholder:text-[var(--text-muted)]",
                "px-3 py-2 text-sm transition-all duration-200 resize-none",
                "focus:outline-none focus:ring-2 focus:ring-[var(--accent-orange)]/40",
              )}
            />
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
        <div className="flex items-center justify-end gap-3 mt-6">
          <button onClick={onClose} className="px-4 py-2 text-sm text-[var(--text-muted)] hover:text-white">
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!name.trim() || isCreating}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-[var(--accent-orange)] text-white hover:bg-[var(--accent-orange)]/90 disabled:opacity-50"
          >
            {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Create List
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ListsPage() {
  const router = useRouter();
  const [lists, setLists] = useState<PersonList[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showNewModal, setShowNewModal] = useState(false);

  const loadLists = useCallback(async () => {
    const result = await getLists();
    setLists(result.data as PersonList[]);
    setIsLoading(false);
  }, []);

  useEffect(() => { loadLists(); }, [loadLists]);

  async function handleDelete(id: string, name: string) {
    if (!window.confirm(`Delete list "${name}"? This will also remove all members from the list.`)) return;
    await deleteList(id);
    await loadLists();
  }

  function handleNewCreated(id: string) {
    setShowNewModal(false);
    router.push(`/admin/lists/${id}`);
  }

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-end">
          <button
            onClick={() => setShowNewModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-[var(--accent-orange)]/15 text-[var(--accent-orange)] border border-[var(--accent-orange)]/20 hover:bg-[var(--accent-orange)]/25"
          >
            <Plus className="h-4 w-4" />
            New List
          </button>
        </div>

        <GlassCard padding={false}>
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 text-[var(--text-muted)] animate-spin" />
            </div>
          ) : lists.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="h-12 w-12 rounded-xl bg-[var(--accent-orange)]/10 flex items-center justify-center mb-4">
                <Users className="h-6 w-6 text-[var(--accent-orange)]" />
              </div>
              <p className="text-[var(--text-muted)] text-sm">No lists yet.</p>
              <button onClick={() => setShowNewModal(true)} className="mt-3 text-sm text-[var(--accent-indigo)] hover:underline">
                Create your first list
              </button>
            </div>
          ) : (
            <div className="divide-y divide-white/[0.04]">
              {lists.map((list) => {
                const count = list.person_list_items?.[0]?.count ?? 0;
                const hasFilter = list.filter_rules !== null;
                return (
                  <div
                    key={list.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => router.push(`/admin/lists/${list.id}`)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") router.push(`/admin/lists/${list.id}`); }}
                    className="w-full flex items-center gap-4 px-5 py-4 hover:bg-white/[0.04] transition-all duration-200 text-left group cursor-pointer"
                  >
                    <div className="h-9 w-9 rounded-lg bg-[var(--accent-orange)]/10 flex items-center justify-center shrink-0">
                      <Users className="h-4 w-4 text-[var(--accent-orange)]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-white font-medium text-sm block truncate">{list.name}</span>
                        {hasFilter && (
                          <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-[var(--accent-indigo)]/10 text-[var(--accent-indigo)] border border-[var(--accent-indigo)]/20">
                            saved filter
                          </span>
                        )}
                      </div>
                      {list.description && (
                        <span className="text-[var(--text-muted)] text-xs truncate block">{list.description}</span>
                      )}
                    </div>
                    <span className="text-xs text-[var(--text-muted)] tabular-nums shrink-0">
                      {count} {count === 1 ? "person" : "persons"}
                    </span>
                    <span className="text-xs text-[var(--text-muted)] shrink-0">
                      {new Date(list.updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </span>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(list.id, list.name); }}
                      className="opacity-0 group-hover:opacity-100 p-1.5 rounded text-[var(--text-muted)] hover:text-red-400 hover:bg-red-500/10 transition-all"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                    <ChevronRight className="h-4 w-4 text-[var(--text-muted)] shrink-0 opacity-40 group-hover:opacity-100 transition-opacity" />
                  </div>
                );
              })}
            </div>
          )}
        </GlassCard>

        {lists.length > 0 && (
          <p className="text-xs text-[var(--text-muted)] px-1">
            {lists.length} {lists.length === 1 ? "list" : "lists"}
          </p>
        )}
      </div>

      {showNewModal && (
        <NewListModal onClose={() => setShowNewModal(false)} onCreate={handleNewCreated} />
      )}
    </>
  );
}
```

- [ ] **Step 2: Verify type-check passes overall**

Run: `npx tsc --noEmit`
Expected: No errors anywhere in the project.

---

## Task 12: End-to-end manual smoke

- [ ] **Step 1: Start dev server**

Run: `npm run dev`
Expected: server starts, no compile errors in terminal.

- [ ] **Step 2: /admin/persons regression**

- Open `/admin/persons`. Verify all filters still work and selection + AddToListDropdown still adds members to a list.

- [ ] **Step 3: Index page**

- Open `/admin/lists`. Existing lists render; a "saved filter" pill is hidden on rows without `filter_rules`.
- Click "New List." Modal opens. Create "Smoke Test List." Page navigates to `/admin/lists/<id>`.

- [ ] **Step 4: List detail empty state**

- The Members tab is the default and shows "No members yet — switch to Matches and apply filters."
- Switch to Matches. Empty filters → "Apply filters to find matches."

- [ ] **Step 5: Filter to populate**

- Apply ICP Min = 75. Active filter chip appears.
- Matches tab now shows N persons. None are "in list" yet.
- Click "Select all N." Click "Add N to list."
- Members tab badge updates; switch tabs and confirm members render.

- [ ] **Step 6: Add new matches incrementally**

- Set ICP Min = 70 (broader). Matches tab shows total + `+(M)` count of "not in list."
- Click "Select all M not in list" then "Add M to list." Confirm members count grew by exactly M.

- [ ] **Step 7: Save filter + reload**

- Click "Save filter." Pill flips to "Saved filter."
- Reload the page. Sidebar rules are pre-populated; pill still present.
- Switch to Matches. Net-new count is 0 (everything already in list).

- [ ] **Step 8: Clear saved filter**

- Click X on the saved-filter pill. Pill disappears. In-memory rules remain (still applied to current view).

- [ ] **Step 9: Members-tab in-list filtering**

- On Members tab, set Has Email = on. Visible members narrow to those with email; total count chip shows `Filtered members N / total`.

- [ ] **Step 10: Remove members**

- Select a couple of members; click Remove. Confirm dialog → Yes. Count drops.

- [ ] **Step 11: Index page reflects updates**

- Navigate back to `/admin/lists`. Smoke Test List shows updated count and "saved filter" pill (if saved earlier).

- [ ] **Step 12: AddToListDropdown on /persons still works**

- On /persons, select 2 persons → "Add to List" → pick the smoke list. Navigate to the smoke list, verify they appeared.

---

## Task 13: Run the full test + lint pass

- [ ] **Step 1: Tests**

Run: `npm test`
Expected: All tests pass, including the new `lib/filters/person-filters.test.ts`.

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: No new errors. (Pre-existing warnings/errors unrelated to these files are fine; do not fix them in this plan.)

---

## Task 14: Single final commit

- [ ] **Step 1: Stage and commit**

```bash
git add supabase/migrations/027_person_lists_filter_rules.sql \
        lib/filters/person-filters.ts \
        lib/filters/person-filters.test.ts \
        lib/data/load-person-rows.ts \
        components/admin/person-filter-sidebar.tsx \
        app/admin/lists/page.tsx \
        app/admin/lists/actions.ts \
        app/admin/lists/[id]/page.tsx \
        app/admin/lists/[id]/list-detail-client.tsx \
        app/admin/lists/[id]/list-members-table.tsx \
        app/admin/lists/[id]/list-matches-table.tsx \
        app/admin/persons/page.tsx \
        app/admin/persons/persons-table-client.tsx

git commit -m "$(cat <<'EOF'
feat(lists): build lists from filters

Adds optional saved filter rules to person_lists and a filter sidebar +
Members/Matches tabs to /admin/lists/[id] so users can grow lists by
applying filters and bulk-adding matches. Membership stays as concrete
person_list_items rows; downstream consumers unchanged.

- migration 027: person_lists.filter_rules jsonb (nullable)
- lib/filters/person-filters.ts: extracted PersonFilterRules + apply
- lib/data/load-person-rows.ts: shared row loader for /persons + /lists
- components/admin/person-filter-sidebar.tsx: reusable sidebar
- app/admin/lists/[id]/...: dedicated detail route w/ tabs + saved filter
- /admin/persons refactored to consume the extracted module unchanged

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 2: Verify clean tree**

Run: `git status`
Expected: clean working tree.

---

## Self-Review

**Spec coverage:**
- Hybrid model (concrete rows + optional rules) → Tasks 1, 6, 8.
- Filter UX inside list detail → Tasks 7–10.
- Add-only re-run semantics → Task 8 (`handleAddMatches` filters out already-in-list ids; saved filter does not auto-mutate).
- Members vs Matches tabs → Tasks 8–10.
- Filter parity with /persons → Tasks 2, 4, 5.
- Refactor scope (extract module + sidebar + row loader) → Tasks 2, 3, 4, 5.
- AddToListDropdown unchanged → verified in Task 12 step 12.
- Out-of-scope items (Boolean OR, smart-list autoeval, org lists, list-of-lists filtering) — not implemented; no tasks added.

**Placeholder scan:** No "TBD," no "implement later." Each step shows actual content.

**Type consistency:** `PersonFilterRules`, `applyPersonFilters`, `personFilterRulesToActiveFilters`, `removeFilterKey`, `clearAllFilters`, `defaultPersonFilterRules`, `isEmptyRules`, `normalizeRules`, `FilterKey` are defined in Task 2 and used identically in Tasks 4, 5, 8. `PersonFilterDeps` keys (`correlations`, `eventPersonIds`) match call sites. `loadPersonRows` return shape matches consumers in Tasks 3 and 7. Server action signatures (`saveListFilter`, `getListById`, slimmed `getListItems`) match call sites in Tasks 7, 8.

**Commit policy:** Single final commit (Task 14), per user feedback. No per-step commits.
