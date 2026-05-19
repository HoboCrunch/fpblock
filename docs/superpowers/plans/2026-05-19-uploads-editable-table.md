# Uploads Editable Table Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework `/admin/uploads` into a unified editable table that supports CSV upload, bulk paste, and direct typing, with per-mode (Persons / Organizations) field binding and on-submit detection of unknown event names.

**Architecture:** Single client component holds `ImportTableState = {mode, columns, rows}`. Three entry paths (empty, CSV via papaparse, paste) normalize into that shape. Column headers are field-binding dropdowns; cells are editable. On submit, scan the `event` column for unknown names; if any, open a modal to create/map/skip them; then dispatch to entity-specific server actions (`importPersons` / `importOrganizations`).

**Tech Stack:** Next.js App Router (client component), React 19, Supabase (`@supabase/ssr`), papaparse, vitest + @testing-library/react, Tailwind (existing glass design tokens).

**Spec:** `docs/superpowers/specs/2026-05-19-uploads-editable-table-design.md`

---

## File Structure

**New:**
- `lib/uploads/field-sets.ts` — `PERSON_FIELDS`, `ORGANIZATION_FIELDS`, types
- `lib/uploads/auto-match.ts` — header → field id heuristic per mode
- `lib/uploads/paste-parser.ts` — TSV/CSV clipboard parser
- `lib/uploads/event-detect.ts` — pure helper for `listUnknownEvents` result shape
- `components/admin/import-table.tsx` — the editable table
- `components/admin/event-detect-modal.tsx` — unknown-event resolution modal
- `lib/uploads/field-sets.test.ts`
- `lib/uploads/auto-match.test.ts`
- `lib/uploads/paste-parser.test.ts`
- `components/admin/import-table.test.tsx`
- `components/admin/event-detect-modal.test.tsx`

**Modified:**
- `app/admin/uploads/page.tsx` — rewrite around new components
- `app/admin/uploads/actions.ts` — split into `importPersons`, `importOrganizations`, add `listUnknownEvents` and `findOrCreateEvents`

**Deleted:**
- `components/admin/column-mapper.tsx`

---

## Task 1: Field sets per mode

**Files:**
- Create: `lib/uploads/field-sets.ts`
- Test: `lib/uploads/field-sets.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// lib/uploads/field-sets.test.ts
import { describe, it, expect } from "vitest";
import {
  PERSON_FIELDS,
  ORGANIZATION_FIELDS,
  fieldSetForMode,
  isValidFieldForMode,
} from "./field-sets";

describe("field sets", () => {
  it("PERSON_FIELDS contains the canonical person fields and event", () => {
    const ids = PERSON_FIELDS.map((f) => f.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "full_name",
        "first_name",
        "last_name",
        "email",
        "linkedin",
        "twitter",
        "telegram",
        "phone",
        "title",
        "seniority",
        "department",
        "organization_name",
        "event",
        "context",
      ])
    );
    expect(ids).not.toContain("name"); // org-only id
  });

  it("ORGANIZATION_FIELDS contains org fields and event but no person ids", () => {
    const ids = ORGANIZATION_FIELDS.map((f) => f.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "name",
        "website",
        "category",
        "linkedin_url",
        "icp_score",
        "icp_reason",
        "industry",
        "employee_count",
        "annual_revenue",
        "founded_year",
        "hq_location",
        "funding_total",
        "latest_funding_stage",
        "event",
      ])
    );
    expect(ids).not.toContain("full_name");
    expect(ids).not.toContain("email");
  });

  it("both sets contain event", () => {
    expect(PERSON_FIELDS.map((f) => f.id)).toContain("event");
    expect(ORGANIZATION_FIELDS.map((f) => f.id)).toContain("event");
  });

  it("fieldSetForMode returns the right set", () => {
    expect(fieldSetForMode("persons")).toBe(PERSON_FIELDS);
    expect(fieldSetForMode("organizations")).toBe(ORGANIZATION_FIELDS);
  });

  it("isValidFieldForMode validates by mode", () => {
    expect(isValidFieldForMode("email", "persons")).toBe(true);
    expect(isValidFieldForMode("email", "organizations")).toBe(false);
    expect(isValidFieldForMode("name", "organizations")).toBe(true);
    expect(isValidFieldForMode("event", "persons")).toBe(true);
    expect(isValidFieldForMode("event", "organizations")).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/uploads/field-sets.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// lib/uploads/field-sets.ts
export type ImportMode = "persons" | "organizations";

export interface FieldDef {
  id: string;
  label: string;
}

export const PERSON_FIELDS: FieldDef[] = [
  { id: "full_name", label: "Full Name" },
  { id: "first_name", label: "First Name" },
  { id: "last_name", label: "Last Name" },
  { id: "email", label: "Email" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "twitter", label: "Twitter" },
  { id: "telegram", label: "Telegram" },
  { id: "phone", label: "Phone" },
  { id: "title", label: "Title" },
  { id: "seniority", label: "Seniority" },
  { id: "department", label: "Department" },
  { id: "organization_name", label: "Organization (by name)" },
  { id: "event", label: "Event (by name)" },
  { id: "context", label: "Notes" },
];

export const ORGANIZATION_FIELDS: FieldDef[] = [
  { id: "name", label: "Name" },
  { id: "website", label: "Website" },
  { id: "category", label: "Category" },
  { id: "linkedin_url", label: "LinkedIn" },
  { id: "icp_score", label: "ICP Score" },
  { id: "icp_reason", label: "ICP Reason" },
  { id: "industry", label: "Industry" },
  { id: "employee_count", label: "Employee Count" },
  { id: "annual_revenue", label: "Annual Revenue" },
  { id: "founded_year", label: "Founded Year" },
  { id: "hq_location", label: "HQ Location" },
  { id: "funding_total", label: "Funding Total" },
  { id: "latest_funding_stage", label: "Latest Funding Stage" },
  { id: "event", label: "Event (by name)" },
];

export function fieldSetForMode(mode: ImportMode): FieldDef[] {
  return mode === "persons" ? PERSON_FIELDS : ORGANIZATION_FIELDS;
}

export function isValidFieldForMode(fieldId: string, mode: ImportMode): boolean {
  return fieldSetForMode(mode).some((f) => f.id === fieldId);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/uploads/field-sets.test.ts`
Expected: PASS — 5 passing.

- [ ] **Step 5: No commit yet — batch at end per project convention.**

---

## Task 2: Auto-match heuristic per mode

**Files:**
- Create: `lib/uploads/auto-match.ts`
- Test: `lib/uploads/auto-match.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// lib/uploads/auto-match.test.ts
import { describe, it, expect } from "vitest";
import { autoMatchHeader } from "./auto-match";

describe("autoMatchHeader (persons)", () => {
  it("matches common person headers", () => {
    expect(autoMatchHeader("Name", "persons")).toBe("full_name");
    expect(autoMatchHeader("Full Name", "persons")).toBe("full_name");
    expect(autoMatchHeader("first_name", "persons")).toBe("first_name");
    expect(autoMatchHeader("Email", "persons")).toBe("email");
    expect(autoMatchHeader("LinkedIn URL", "persons")).toBe("linkedin");
    expect(autoMatchHeader("Twitter Handle", "persons")).toBe("twitter");
    expect(autoMatchHeader("Job Title", "persons")).toBe("title");
    expect(autoMatchHeader("Company", "persons")).toBe("organization_name");
    expect(autoMatchHeader("Organization", "persons")).toBe("organization_name");
    expect(autoMatchHeader("Event", "persons")).toBe("event");
    expect(autoMatchHeader("Notes", "persons")).toBe("context");
  });

  it("returns empty string for unknown headers", () => {
    expect(autoMatchHeader("foo bar", "persons")).toBe("");
    expect(autoMatchHeader("", "persons")).toBe("");
  });

  it("is case- and whitespace-insensitive", () => {
    expect(autoMatchHeader("  EMAIL  ", "persons")).toBe("email");
    expect(autoMatchHeader("full-name", "persons")).toBe("full_name");
  });
});

describe("autoMatchHeader (organizations)", () => {
  it("matches common organization headers", () => {
    expect(autoMatchHeader("Company Name", "organizations")).toBe("name");
    expect(autoMatchHeader("Name", "organizations")).toBe("name");
    expect(autoMatchHeader("Website", "organizations")).toBe("website");
    expect(autoMatchHeader("LinkedIn", "organizations")).toBe("linkedin_url");
    expect(autoMatchHeader("Industry", "organizations")).toBe("industry");
    expect(autoMatchHeader("Employees", "organizations")).toBe("employee_count");
    expect(autoMatchHeader("HQ", "organizations")).toBe("hq_location");
    expect(autoMatchHeader("ICP Score", "organizations")).toBe("icp_score");
    expect(autoMatchHeader("Event", "organizations")).toBe("event");
  });

  it("does not match person-only fields in organizations mode", () => {
    expect(autoMatchHeader("Email", "organizations")).toBe("");
    expect(autoMatchHeader("First Name", "organizations")).toBe("");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run lib/uploads/auto-match.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// lib/uploads/auto-match.ts
import type { ImportMode } from "./field-sets";

function normalize(header: string): string {
  return header.toLowerCase().trim().replace(/[\s\-]+/g, "_");
}

const PERSON_MAP: Record<string, string> = {
  name: "full_name",
  full_name: "full_name",
  fullname: "full_name",
  first_name: "first_name",
  firstname: "first_name",
  last_name: "last_name",
  lastname: "last_name",
  email: "email",
  email_address: "email",
  linkedin: "linkedin",
  linkedin_url: "linkedin",
  linkedin_profile: "linkedin",
  twitter: "twitter",
  twitter_handle: "twitter",
  twitter_url: "twitter",
  telegram: "telegram",
  telegram_handle: "telegram",
  phone: "phone",
  phone_number: "phone",
  title: "title",
  job_title: "title",
  role: "title",
  seniority: "seniority",
  department: "department",
  company: "organization_name",
  company_name: "organization_name",
  org: "organization_name",
  organization: "organization_name",
  organization_name: "organization_name",
  event: "event",
  event_name: "event",
  notes: "context",
  context: "context",
};

const ORG_MAP: Record<string, string> = {
  name: "name",
  company: "name",
  company_name: "name",
  organization: "name",
  organization_name: "name",
  website: "website",
  url: "website",
  domain: "website",
  category: "category",
  linkedin: "linkedin_url",
  linkedin_url: "linkedin_url",
  industry: "industry",
  employees: "employee_count",
  employee_count: "employee_count",
  headcount: "employee_count",
  revenue: "annual_revenue",
  annual_revenue: "annual_revenue",
  founded: "founded_year",
  founded_year: "founded_year",
  hq: "hq_location",
  hq_location: "hq_location",
  headquarters: "hq_location",
  funding: "funding_total",
  funding_total: "funding_total",
  funding_stage: "latest_funding_stage",
  latest_funding_stage: "latest_funding_stage",
  stage: "latest_funding_stage",
  icp_score: "icp_score",
  icp_reason: "icp_reason",
  event: "event",
  event_name: "event",
};

export function autoMatchHeader(header: string, mode: ImportMode): string {
  if (!header) return "";
  const key = normalize(header);
  const map = mode === "persons" ? PERSON_MAP : ORG_MAP;
  return map[key] ?? "";
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run lib/uploads/auto-match.test.ts`
Expected: PASS — all tests passing.

---

## Task 3: Paste parser

**Files:**
- Create: `lib/uploads/paste-parser.ts`
- Test: `lib/uploads/paste-parser.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// lib/uploads/paste-parser.test.ts
import { describe, it, expect } from "vitest";
import { parseClipboard } from "./paste-parser";

describe("parseClipboard", () => {
  it("returns a single 1x1 grid for plain text", () => {
    expect(parseClipboard("hello")).toEqual([["hello"]]);
  });

  it("splits TSV (preferred when present)", () => {
    expect(parseClipboard("a\tb\tc\n1\t2\t3")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("splits CSV when there are no tabs", () => {
    expect(parseClipboard("a,b,c\n1,2,3")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("handles quoted CSV with commas in values", () => {
    expect(parseClipboard('a,"b,c",d')).toEqual([["a", "b,c", "d"]]);
  });

  it("trims trailing blank lines", () => {
    expect(parseClipboard("a\tb\n1\t2\n\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("returns [] for empty input", () => {
    expect(parseClipboard("")).toEqual([]);
    expect(parseClipboard("   \n  ")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run lib/uploads/paste-parser.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// lib/uploads/paste-parser.ts
import Papa from "papaparse";

export function parseClipboard(text: string): string[][] {
  const trimmed = text.replace(/\r\n/g, "\n").replace(/\n+$/, "");
  if (!trimmed.trim()) return [];

  const hasTab = trimmed.includes("\t");
  const hasNewline = trimmed.includes("\n");

  // Plain single value (no delimiters at all) — return 1x1
  if (!hasTab && !hasNewline && !trimmed.includes(",")) {
    return [[trimmed]];
  }

  const delimiter = hasTab ? "\t" : ",";
  const result = Papa.parse<string[]>(trimmed, {
    delimiter,
    skipEmptyLines: true,
  });

  return (result.data as string[][]).filter((row) => row.length > 0);
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run lib/uploads/paste-parser.test.ts`
Expected: PASS.

---

## Task 4: Event detection helpers

**Files:**
- Create: `lib/uploads/event-detect.ts`
- Test: `lib/uploads/event-detect.test.ts` (pure helper portion)

This task ships the pure helper used to dedupe event names and build the unknown list. The server-action wrapper (`listUnknownEvents`) is added in Task 7 alongside the other actions.

- [ ] **Step 1: Write the failing test**

```ts
// lib/uploads/event-detect.test.ts
import { describe, it, expect } from "vitest";
import { partitionEventNames, normalizeEventName } from "./event-detect";

describe("normalizeEventName", () => {
  it("lowercases and collapses whitespace", () => {
    expect(normalizeEventName("  EthCC  Cannes  ")).toBe("ethcc cannes");
  });
});

describe("partitionEventNames", () => {
  it("separates known from unknown using a case-insensitive name map", () => {
    const eventsByNormalized = new Map<string, string>([
      ["ethcc cannes", "evt_1"],
      ["eth sf", "evt_2"],
    ]);
    const result = partitionEventNames(
      ["EthCC Cannes", "EthCC Cannes", "ETHCC SF Hack", "  ", "ETH SF"],
      eventsByNormalized,
    );
    expect(result.known).toEqual({
      "EthCC Cannes": "evt_1",
      "ETH SF": "evt_2",
    });
    expect(result.unknown).toEqual(["ETHCC SF Hack"]);
  });

  it("returns empty arrays for empty input", () => {
    expect(partitionEventNames([], new Map())).toEqual({ known: {}, unknown: [] });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run lib/uploads/event-detect.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// lib/uploads/event-detect.ts
export function normalizeEventName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, " ");
}

export interface EventPartitionResult {
  /** Original (un-normalized) name → existing event id */
  known: Record<string, string>;
  /** Unique original-cased names not found in the map */
  unknown: string[];
}

export function partitionEventNames(
  rawNames: string[],
  eventsByNormalized: Map<string, string>,
): EventPartitionResult {
  const known: Record<string, string> = {};
  const unknownSet = new Set<string>();
  const seenOriginals = new Set<string>();

  for (const raw of rawNames) {
    const trimmed = raw?.trim();
    if (!trimmed) continue;
    if (seenOriginals.has(trimmed)) continue;
    seenOriginals.add(trimmed);

    const normalized = normalizeEventName(trimmed);
    const matched = eventsByNormalized.get(normalized);
    if (matched) {
      known[trimmed] = matched;
    } else {
      unknownSet.add(trimmed);
    }
  }

  return { known, unknown: [...unknownSet] };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run lib/uploads/event-detect.test.ts`
Expected: PASS.

---

## Task 5: ImportTable component (header dropdowns + add/remove)

**Files:**
- Create: `components/admin/import-table.tsx`
- Test: `components/admin/import-table.test.tsx`

This task ships the editable table without the paste handler (paste is Task 6). It owns rendering and basic edit/add/remove behavior.

- [ ] **Step 1: Write the failing test**

```tsx
// components/admin/import-table.test.tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { ImportTable } from "./import-table";
import { PERSON_FIELDS } from "@/lib/uploads/field-sets";

afterEach(cleanup);

const emptyState = {
  mode: "persons" as const,
  columns: [
    { id: "c1", field: "full_name" },
    { id: "c2", field: "email" },
  ],
  rows: [
    ["Alice", "alice@example.com"],
    ["", ""],
  ],
};

describe("ImportTable", () => {
  it("renders one header select per column and one input per cell", () => {
    render(
      <ImportTable
        state={emptyState}
        onChange={() => {}}
        fieldSet={PERSON_FIELDS}
      />
    );
    // 2 columns -> 2 header selects
    expect(screen.getAllByRole("combobox")).toHaveLength(2);
    // 2 rows × 2 cols = 4 inputs
    expect(screen.getAllByRole("textbox")).toHaveLength(4);
  });

  it("fires onChange with updated cell value when typing", () => {
    const onChange = vi.fn();
    render(
      <ImportTable
        state={emptyState}
        onChange={onChange}
        fieldSet={PERSON_FIELDS}
      />
    );
    const cells = screen.getAllByRole("textbox");
    fireEvent.change(cells[0], { target: { value: "Bob" } });
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0];
    expect(next.rows[0][0]).toBe("Bob");
  });

  it("fires onChange with updated column field when header select changes", () => {
    const onChange = vi.fn();
    render(
      <ImportTable
        state={emptyState}
        onChange={onChange}
        fieldSet={PERSON_FIELDS}
      />
    );
    const selects = screen.getAllByRole("combobox");
    fireEvent.change(selects[0], { target: { value: "first_name" } });
    const next = onChange.mock.calls[0][0];
    expect(next.columns[0].field).toBe("first_name");
  });

  it("adds a new empty row when + Row is clicked", () => {
    const onChange = vi.fn();
    render(
      <ImportTable
        state={emptyState}
        onChange={onChange}
        fieldSet={PERSON_FIELDS}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /add row/i }));
    const next = onChange.mock.calls[0][0];
    expect(next.rows).toHaveLength(3);
    expect(next.rows[2]).toEqual(["", ""]);
  });

  it("adds a new column with empty field and corresponding empty cells", () => {
    const onChange = vi.fn();
    render(
      <ImportTable
        state={emptyState}
        onChange={onChange}
        fieldSet={PERSON_FIELDS}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /add column/i }));
    const next = onChange.mock.calls[0][0];
    expect(next.columns).toHaveLength(3);
    expect(next.rows[0]).toHaveLength(3);
    expect(next.rows[0][2]).toBe("");
  });

  it("removes a column and its cells", () => {
    const onChange = vi.fn();
    render(
      <ImportTable
        state={emptyState}
        onChange={onChange}
        fieldSet={PERSON_FIELDS}
      />
    );
    const removeCol = screen.getAllByRole("button", { name: /remove column/i })[0];
    fireEvent.click(removeCol);
    const next = onChange.mock.calls[0][0];
    expect(next.columns).toHaveLength(1);
    expect(next.rows[0]).toEqual(["alice@example.com"]);
  });

  it("removes a row", () => {
    const onChange = vi.fn();
    render(
      <ImportTable
        state={emptyState}
        onChange={onChange}
        fieldSet={PERSON_FIELDS}
      />
    );
    const removeRow = screen.getAllByRole("button", { name: /remove row/i })[0];
    fireEvent.click(removeRow);
    const next = onChange.mock.calls[0][0];
    expect(next.rows).toHaveLength(1);
    expect(next.rows[0]).toEqual(["", ""]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run components/admin/import-table.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
// components/admin/import-table.tsx
"use client";

import { useId } from "react";
import { X, Plus } from "lucide-react";
import { GlassSelect } from "@/components/ui/glass-select";
import { GlassCard } from "@/components/ui/glass-card";
import type { FieldDef, ImportMode } from "@/lib/uploads/field-sets";

export interface ImportColumn {
  id: string;
  field: string;
  originalHeader?: string;
}

export interface ImportTableState {
  mode: ImportMode;
  columns: ImportColumn[];
  rows: string[][];
}

interface ImportTableProps {
  state: ImportTableState;
  onChange: (next: ImportTableState) => void;
  fieldSet: FieldDef[];
}

const FIELD_OPTION_DISCARD = { value: "", label: "— Discard —" };

function makeColumnId(): string {
  return `col_${Math.random().toString(36).slice(2, 9)}`;
}

export function ImportTable({ state, onChange, fieldSet }: ImportTableProps) {
  const labelId = useId();
  const options = [
    FIELD_OPTION_DISCARD,
    ...fieldSet.map((f) => ({ value: f.id, label: f.label })),
  ];

  function updateCell(r: number, c: number, value: string) {
    const rows = state.rows.map((row, ri) =>
      ri === r ? row.map((v, ci) => (ci === c ? value : v)) : row,
    );
    onChange({ ...state, rows });
  }

  function updateColumnField(c: number, field: string) {
    const columns = state.columns.map((col, ci) =>
      ci === c ? { ...col, field } : col,
    );
    onChange({ ...state, columns });
  }

  function addRow() {
    const rows = [...state.rows, state.columns.map(() => "")];
    onChange({ ...state, rows });
  }

  function addColumn() {
    const columns = [...state.columns, { id: makeColumnId(), field: "" }];
    const rows = state.rows.map((row) => [...row, ""]);
    onChange({ ...state, columns, rows });
  }

  function removeColumn(c: number) {
    const columns = state.columns.filter((_, ci) => ci !== c);
    const rows = state.rows.map((row) => row.filter((_, ci) => ci !== c));
    onChange({ ...state, columns, rows });
  }

  function removeRow(r: number) {
    const rows = state.rows.filter((_, ri) => ri !== r);
    onChange({ ...state, rows });
  }

  return (
    <GlassCard padding={false}>
      <div className="p-4 flex items-center gap-3 border-b border-[var(--glass-border)]">
        <button
          type="button"
          aria-label="Add row"
          onClick={addRow}
          className="flex items-center gap-1 text-sm text-[var(--text-secondary)] hover:text-white"
        >
          <Plus className="h-4 w-4" /> Row
        </button>
        <button
          type="button"
          aria-label="Add column"
          onClick={addColumn}
          className="flex items-center gap-1 text-sm text-[var(--text-secondary)] hover:text-white"
        >
          <Plus className="h-4 w-4" /> Column
        </button>
        <span id={labelId} className="sr-only">
          Import table — header cells choose the canonical field for each column
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm" aria-labelledby={labelId}>
          <thead>
            <tr className="border-b border-[var(--glass-border)]">
              {state.columns.map((col, ci) => (
                <th key={col.id} className="px-3 py-2 align-bottom">
                  <div className="flex items-center gap-2">
                    <GlassSelect
                      options={options}
                      value={col.field}
                      onChange={(e) => updateColumnField(ci, e.target.value)}
                    />
                    <button
                      type="button"
                      aria-label="Remove column"
                      onClick={() => removeColumn(ci)}
                      className="text-[var(--text-muted)] hover:text-red-400"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  {col.originalHeader && (
                    <div className="mt-1 text-xs font-mono text-[var(--text-muted)] truncate">
                      {col.originalHeader}
                    </div>
                  )}
                </th>
              ))}
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {state.rows.map((row, ri) => (
              <tr
                key={ri}
                className="border-b border-[var(--glass-border)] last:border-0"
              >
                {row.map((value, ci) => (
                  <td key={ci} className="px-3 py-1">
                    <input
                      type="text"
                      value={value}
                      onChange={(e) => updateCell(ri, ci, e.target.value)}
                      className="w-full bg-transparent border-0 px-1 py-1 text-[var(--text-secondary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-orange)] rounded"
                    />
                  </td>
                ))}
                <td className="px-2">
                  <button
                    type="button"
                    aria-label="Remove row"
                    onClick={() => removeRow(ri)}
                    className="text-[var(--text-muted)] hover:text-red-400"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </GlassCard>
  );
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run components/admin/import-table.test.tsx`
Expected: PASS — all tests passing.

---

## Task 6: Paste handler on ImportTable

**Files:**
- Modify: `components/admin/import-table.tsx`
- Modify: `components/admin/import-table.test.tsx`

- [ ] **Step 1: Add failing tests**

Add to `components/admin/import-table.test.tsx`:

```tsx
import { parseClipboard } from "@/lib/uploads/paste-parser";

describe("ImportTable paste", () => {
  it("spreads TSV paste from the focused cell across rows and columns", () => {
    const onChange = vi.fn();
    render(
      <ImportTable
        state={{
          mode: "persons",
          columns: [
            { id: "c1", field: "full_name" },
            { id: "c2", field: "email" },
          ],
          rows: [
            ["", ""],
            ["", ""],
          ],
        }}
        onChange={onChange}
        fieldSet={PERSON_FIELDS}
      />
    );
    const cells = screen.getAllByRole("textbox");
    // Focus row 0, col 0; paste "Alice\talice\nBob\tbob"
    fireEvent.paste(cells[0], {
      clipboardData: { getData: () => "Alice\talice\nBob\tbob" },
    });
    const next = onChange.mock.calls[0][0];
    expect(next.rows[0]).toEqual(["Alice", "alice"]);
    expect(next.rows[1]).toEqual(["Bob", "bob"]);
  });

  it("expands rows/columns when paste exceeds current dimensions", () => {
    const onChange = vi.fn();
    render(
      <ImportTable
        state={{
          mode: "persons",
          columns: [{ id: "c1", field: "full_name" }],
          rows: [[""]],
        }}
        onChange={onChange}
        fieldSet={PERSON_FIELDS}
      />
    );
    const cells = screen.getAllByRole("textbox");
    fireEvent.paste(cells[0], {
      clipboardData: { getData: () => "a\tb\n1\t2" },
    });
    const next = onChange.mock.calls[0][0];
    expect(next.columns).toHaveLength(2);
    expect(next.rows).toHaveLength(2);
    expect(next.rows[0]).toEqual(["a", "b"]);
    expect(next.rows[1]).toEqual(["1", "2"]);
  });

  it("treats a single-value paste as a normal input change (no spread)", () => {
    const onChange = vi.fn();
    render(
      <ImportTable
        state={{
          mode: "persons",
          columns: [{ id: "c1", field: "full_name" }],
          rows: [[""]],
        }}
        onChange={onChange}
        fieldSet={PERSON_FIELDS}
      />
    );
    const cells = screen.getAllByRole("textbox");
    fireEvent.paste(cells[0], {
      clipboardData: { getData: () => "Alice" },
    });
    // Should NOT call onChange from paste handler; the input's onChange fires naturally.
    expect(onChange).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run components/admin/import-table.test.tsx`
Expected: FAIL — new tests fail (paste behavior not implemented).

- [ ] **Step 3: Add paste handler to ImportTable**

In `components/admin/import-table.tsx`:

Add the import near the top:

```tsx
import { parseClipboard } from "@/lib/uploads/paste-parser";
```

Add a helper inside the component, alongside `updateCell`:

```tsx
function handlePaste(r: number, c: number, e: React.ClipboardEvent<HTMLInputElement>) {
  const text = e.clipboardData.getData("text/plain");
  const grid = parseClipboard(text);
  // Single value or empty — let the input handle it normally
  if (grid.length === 0) return;
  if (grid.length === 1 && grid[0].length === 1) return;

  e.preventDefault();

  const neededRows = r + grid.length;
  const neededCols = c + Math.max(...grid.map((row) => row.length));

  // Expand columns if needed
  const newColumnIds: ImportColumn[] = [];
  while (state.columns.length + newColumnIds.length < neededCols) {
    newColumnIds.push({ id: makeColumnId(), field: "" });
  }
  const columns = [...state.columns, ...newColumnIds];

  // Pad existing rows for new columns
  const padded = state.rows.map((row) => {
    const out = [...row];
    while (out.length < columns.length) out.push("");
    return out;
  });

  // Expand rows if needed
  while (padded.length < neededRows) {
    padded.push(columns.map(() => ""));
  }

  // Write the grid
  for (let i = 0; i < grid.length; i++) {
    for (let j = 0; j < grid[i].length; j++) {
      padded[r + i][c + j] = grid[i][j];
    }
  }

  onChange({ ...state, columns, rows: padded });
}
```

Wire it onto the cell input. Replace the existing `<input ... />` JSX with:

```tsx
<input
  type="text"
  value={value}
  onChange={(e) => updateCell(ri, ci, e.target.value)}
  onPaste={(e) => handlePaste(ri, ci, e)}
  className="w-full bg-transparent border-0 px-1 py-1 text-[var(--text-secondary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-orange)] rounded"
/>
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run components/admin/import-table.test.tsx`
Expected: PASS — all tests in the file pass.

---

## Task 7: Server actions — split, plus event helpers

**Files:**
- Modify: `app/admin/uploads/actions.ts`

Replace the file's contents entirely. The action signatures are: `listUnknownEvents`, `findOrCreateEvents`, `importPersons`, `importOrganizations`.

- [ ] **Step 1: Rewrite the file**

```ts
// app/admin/uploads/actions.ts
"use server";

import { createClient } from "@/lib/supabase/server";
import { partitionEventNames, normalizeEventName } from "@/lib/uploads/event-detect";

export type DuplicateHandling = "skip" | "update" | "create_new";

export interface PersonImportRow {
  full_name?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  linkedin?: string;
  twitter?: string;
  telegram?: string;
  phone?: string;
  title?: string;
  seniority?: string;
  department?: string;
  organization_name?: string;
  event?: string;
  context?: string;
}

export interface OrganizationImportRow {
  name?: string;
  website?: string;
  category?: string;
  linkedin_url?: string;
  icp_score?: string;
  icp_reason?: string;
  industry?: string;
  employee_count?: string;
  annual_revenue?: string;
  founded_year?: string;
  hq_location?: string;
  funding_total?: string;
  latest_funding_stage?: string;
  event?: string;
}

export interface ImportResult {
  success: boolean;
  uploadId?: string;
  personsCreated: number;
  organizationsCreated: number;
  skipped: number;
  errors: string[];
}

export interface EventDecision {
  name: string; // original (un-normalized) name as seen in the row
  mode: "create" | "map" | "skip";
  eventId?: string; // for "map"
  date_start?: string; // for "create"
}

export async function listUnknownEvents(names: string[]): Promise<{
  known: Record<string, string>;
  unknown: string[];
}> {
  const supabase = await createClient();
  const trimmed = [
    ...new Set(names.map((n) => n.trim()).filter((n) => n.length > 0)),
  ];
  if (trimmed.length === 0) return { known: {}, unknown: [] };

  const { data: events } = await supabase
    .from("events")
    .select("id, name");

  const byNormalized = new Map<string, string>();
  for (const e of events ?? []) {
    byNormalized.set(normalizeEventName((e as { name: string }).name), (e as { id: string }).id);
  }

  return partitionEventNames(trimmed, byNormalized);
}

export async function findOrCreateEvents(
  decisions: EventDecision[],
): Promise<Record<string, string | null>> {
  const supabase = await createClient();
  const out: Record<string, string | null> = {};

  for (const d of decisions) {
    if (d.mode === "skip") {
      out[d.name] = null;
      continue;
    }
    if (d.mode === "map") {
      out[d.name] = d.eventId ?? null;
      continue;
    }
    // create
    const { data, error } = await supabase
      .from("events")
      .insert({
        name: d.name,
        date_start: d.date_start || null,
      })
      .select("id")
      .single();
    if (error || !data) {
      throw new Error(`Failed to create event "${d.name}": ${error?.message ?? "unknown"}`);
    }
    out[d.name] = (data as { id: string }).id;
  }
  return out;
}

async function insertUploadRow(
  filename: string,
  rowCount: number,
): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("uploads")
    .insert({ filename, row_count: rowCount, status: "processing" })
    .select("id")
    .single();
  if (error || !data) {
    throw new Error(`Failed to create upload record: ${error?.message ?? "unknown"}`);
  }
  return (data as { id: string }).id;
}

async function finalizeUploadRow(
  uploadId: string,
  personsCreated: number,
  organizationsCreated: number,
  errors: string[],
): Promise<void> {
  const supabase = await createClient();
  await supabase
    .from("uploads")
    .update({
      persons_created: personsCreated,
      organizations_created: organizationsCreated,
      status:
        errors.length > 0 && personsCreated + organizationsCreated === 0
          ? "failed"
          : "completed",
      errors: errors.length > 0 ? { messages: errors } : null,
    })
    .eq("id", uploadId);
}

export async function importPersons(
  rows: PersonImportRow[],
  config: {
    duplicateHandling: DuplicateHandling;
    eventMap: Record<string, string | null>;
  },
  filename: string,
): Promise<ImportResult> {
  const supabase = await createClient();
  const uploadId = await insertUploadRow(filename, rows.length);

  let personsCreated = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      const email = row.email?.trim();
      const fullName =
        row.full_name?.trim() ||
        [row.first_name, row.last_name].filter(Boolean).join(" ").trim() ||
        null;

      if (!fullName && !email) {
        skipped++;
        continue;
      }

      // Resolve organization (link only — no firmographic writes here)
      let organizationId: string | null = null;
      const orgName = row.organization_name?.trim();
      if (orgName) {
        const { data: existing } = await supabase
          .from("organizations")
          .select("id")
          .ilike("name", orgName)
          .maybeSingle();
        if (existing) {
          organizationId = (existing as { id: string }).id;
        } else {
          const { data: newOrg } = await supabase
            .from("organizations")
            .insert({ name: orgName })
            .select("id")
            .single();
          if (newOrg) organizationId = (newOrg as { id: string }).id;
        }
      }

      // Dedupe person by email
      let existingPerson: { id: string } | null = null;
      if (email) {
        const { data } = await supabase
          .from("persons")
          .select("id")
          .eq("email", email)
          .maybeSingle();
        existingPerson = data as { id: string } | null;
      }

      const personFields = {
        full_name: fullName ?? "Unknown",
        first_name: row.first_name?.trim() || null,
        last_name: row.last_name?.trim() || null,
        email: email || null,
        linkedin_url: row.linkedin?.trim() || null,
        twitter_handle: row.twitter?.trim() || null,
        telegram_handle: row.telegram?.trim() || null,
        phone: row.phone?.trim() || null,
        title: row.title?.trim() || null,
        seniority: row.seniority?.trim() || null,
        department: row.department?.trim() || null,
        notes: row.context?.trim() || null,
      };

      let personId: string | null = null;

      if (existingPerson) {
        if (config.duplicateHandling === "skip") {
          skipped++;
          personId = existingPerson.id; // still link event/org below
        } else if (config.duplicateHandling === "update") {
          const update: Record<string, string | null> = {};
          for (const [k, v] of Object.entries(personFields)) {
            if (v !== null && v !== "Unknown") update[k] = v;
          }
          if (Object.keys(update).length > 0) {
            await supabase.from("persons").update(update).eq("id", existingPerson.id);
          }
          personId = existingPerson.id;
          skipped++;
        } else {
          // create_new
          const { data: created } = await supabase
            .from("persons")
            .insert({ ...personFields, source: "csv_import" })
            .select("id")
            .single();
          if (created) {
            personId = (created as { id: string }).id;
            personsCreated++;
          }
        }
      } else {
        const { data: created } = await supabase
          .from("persons")
          .insert({ ...personFields, source: "csv_import" })
          .select("id")
          .single();
        if (created) {
          personId = (created as { id: string }).id;
          personsCreated++;
        }
      }

      if (personId && organizationId) {
        await supabase
          .from("person_organization")
          .upsert(
            {
              person_id: personId,
              organization_id: organizationId,
              is_primary: true,
              is_current: true,
              source: "csv_import",
            },
            { onConflict: "person_id,organization_id" },
          );
      }

      const eventName = row.event?.trim();
      if (personId && eventName) {
        const eventId = config.eventMap[eventName];
        if (eventId) {
          await supabase
            .from("event_participations")
            .insert({
              person_id: personId,
              event_id: eventId,
              role: "attendee",
            });
        }
      }
    } catch (err) {
      errors.push(`Row ${i + 1}: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  }

  await finalizeUploadRow(uploadId, personsCreated, 0, errors);
  return {
    success: true,
    uploadId,
    personsCreated,
    organizationsCreated: 0,
    skipped,
    errors,
  };
}

export async function importOrganizations(
  rows: OrganizationImportRow[],
  config: {
    duplicateHandling: DuplicateHandling;
    eventMap: Record<string, string | null>;
  },
  filename: string,
): Promise<ImportResult> {
  const supabase = await createClient();
  const uploadId = await insertUploadRow(filename, rows.length);

  let organizationsCreated = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      const name = row.name?.trim();
      if (!name) {
        skipped++;
        continue;
      }

      const orgFields = {
        name,
        website: row.website?.trim() || null,
        category: row.category?.trim() || null,
        linkedin_url: row.linkedin_url?.trim() || null,
        icp_score: row.icp_score ? parseInt(row.icp_score, 10) || null : null,
        icp_reason: row.icp_reason?.trim() || null,
        industry: row.industry?.trim() || null,
        employee_count: row.employee_count
          ? parseInt(row.employee_count, 10) || null
          : null,
        annual_revenue: row.annual_revenue
          ? parseInt(row.annual_revenue, 10) || null
          : null,
        founded_year: row.founded_year
          ? parseInt(row.founded_year, 10) || null
          : null,
        hq_location: row.hq_location?.trim() || null,
        funding_total: row.funding_total?.trim() || null,
        latest_funding_stage: row.latest_funding_stage?.trim() || null,
      };

      const { data: existing } = await supabase
        .from("organizations")
        .select("id")
        .ilike("name", name)
        .maybeSingle();

      let organizationId: string | null = null;

      if (existing) {
        if (config.duplicateHandling === "skip") {
          organizationId = (existing as { id: string }).id;
          skipped++;
        } else if (config.duplicateHandling === "update") {
          const update: Record<string, string | number | null> = {};
          for (const [k, v] of Object.entries(orgFields)) {
            if (v !== null && k !== "name") update[k] = v;
          }
          if (Object.keys(update).length > 0) {
            await supabase
              .from("organizations")
              .update(update)
              .eq("id", (existing as { id: string }).id);
          }
          organizationId = (existing as { id: string }).id;
          skipped++;
        } else {
          // create_new
          const { data: created } = await supabase
            .from("organizations")
            .insert(orgFields)
            .select("id")
            .single();
          if (created) {
            organizationId = (created as { id: string }).id;
            organizationsCreated++;
          }
        }
      } else {
        const { data: created } = await supabase
          .from("organizations")
          .insert(orgFields)
          .select("id")
          .single();
        if (created) {
          organizationId = (created as { id: string }).id;
          organizationsCreated++;
        }
      }

      const eventName = row.event?.trim();
      if (organizationId && eventName) {
        const eventId = config.eventMap[eventName];
        if (eventId) {
          await supabase
            .from("event_participations")
            .insert({
              organization_id: organizationId,
              event_id: eventId,
              role: "sponsor",
            });
        }
      }
    } catch (err) {
      errors.push(`Row ${i + 1}: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  }

  await finalizeUploadRow(uploadId, 0, organizationsCreated, errors);
  return {
    success: true,
    uploadId,
    personsCreated: 0,
    organizationsCreated,
    skipped,
    errors,
  };
}
```

- [ ] **Step 2: Verify type-check passes**

Run: `npx tsc --noEmit`
Expected: PASS (no new errors introduced by `actions.ts`). If existing errors unrelated to this work are reported, ignore them; if a new error from `actions.ts` appears, fix it before moving on.

---

## Task 8: EventDetectModal component

**Files:**
- Create: `components/admin/event-detect-modal.tsx`
- Test: `components/admin/event-detect-modal.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// components/admin/event-detect-modal.test.tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { EventDetectModal } from "./event-detect-modal";

afterEach(cleanup);

const existingEvents = [
  { id: "e1", name: "EthCC Cannes 2026" },
  { id: "e2", name: "ETHGlobal SF" },
];

describe("EventDetectModal", () => {
  it("lists each unknown event with a row", () => {
    render(
      <EventDetectModal
        unknownEvents={["DevCon 7", "ETHWaterloo"]}
        existingEvents={existingEvents}
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );
    expect(screen.getByText("DevCon 7")).toBeInTheDocument();
    expect(screen.getByText("ETHWaterloo")).toBeInTheDocument();
  });

  it("defaults each row to 'create' and emits create decisions on confirm", () => {
    const onConfirm = vi.fn();
    render(
      <EventDetectModal
        unknownEvents={["DevCon 7"]}
        existingEvents={existingEvents}
        onConfirm={onConfirm}
        onCancel={() => {}}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /confirm/i }));
    expect(onConfirm).toHaveBeenCalledWith([
      { name: "DevCon 7", mode: "create", date_start: "" },
    ]);
  });

  it("emits skip decision when skip radio is chosen", () => {
    const onConfirm = vi.fn();
    render(
      <EventDetectModal
        unknownEvents={["DevCon 7"]}
        existingEvents={existingEvents}
        onConfirm={onConfirm}
        onCancel={() => {}}
      />
    );
    fireEvent.click(screen.getByLabelText(/skip/i));
    fireEvent.click(screen.getByRole("button", { name: /confirm/i }));
    expect(onConfirm).toHaveBeenCalledWith([{ name: "DevCon 7", mode: "skip" }]);
  });

  it("emits map decision with selected event id", () => {
    const onConfirm = vi.fn();
    render(
      <EventDetectModal
        unknownEvents={["DevCon 7"]}
        existingEvents={existingEvents}
        onConfirm={onConfirm}
        onCancel={() => {}}
      />
    );
    fireEvent.click(screen.getByLabelText(/map to existing/i));
    const select = screen.getByLabelText(/existing event/i);
    fireEvent.change(select, { target: { value: "e1" } });
    fireEvent.click(screen.getByRole("button", { name: /confirm/i }));
    expect(onConfirm).toHaveBeenCalledWith([
      { name: "DevCon 7", mode: "map", eventId: "e1" },
    ]);
  });

  it("calls onCancel when cancel is clicked", () => {
    const onCancel = vi.fn();
    render(
      <EventDetectModal
        unknownEvents={["DevCon 7"]}
        existingEvents={existingEvents}
        onConfirm={() => {}}
        onCancel={onCancel}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run components/admin/event-detect-modal.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
// components/admin/event-detect-modal.tsx
"use client";

import { useState } from "react";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassSelect } from "@/components/ui/glass-select";
import type { EventDecision } from "@/app/admin/uploads/actions";

interface RowState {
  mode: "create" | "map" | "skip";
  eventId: string;
  dateStart: string;
}

interface EventDetectModalProps {
  unknownEvents: string[];
  existingEvents: { id: string; name: string }[];
  onConfirm: (decisions: EventDecision[]) => void;
  onCancel: () => void;
}

export function EventDetectModal({
  unknownEvents,
  existingEvents,
  onConfirm,
  onCancel,
}: EventDetectModalProps) {
  const [rows, setRows] = useState<Record<string, RowState>>(() =>
    Object.fromEntries(
      unknownEvents.map((name) => [
        name,
        { mode: "create", eventId: "", dateStart: "" } as RowState,
      ]),
    ),
  );

  function setRow(name: string, patch: Partial<RowState>) {
    setRows((prev) => ({ ...prev, [name]: { ...prev[name], ...patch } }));
  }

  function confirm() {
    const decisions: EventDecision[] = unknownEvents.map((name) => {
      const r = rows[name];
      if (r.mode === "skip") return { name, mode: "skip" };
      if (r.mode === "map") return { name, mode: "map", eventId: r.eventId };
      return { name, mode: "create", date_start: r.dateStart };
    });
    onConfirm(decisions);
  }

  const eventOptions = [
    { value: "", label: "— Select an event —" },
    ...existingEvents.map((e) => ({ value: e.id, label: e.name })),
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Unknown events"
    >
      <GlassCard className="w-full max-w-2xl max-h-[80vh] overflow-y-auto">
        <h2 className="text-white font-semibold font-[family-name:var(--font-heading)] mb-2">
          New events detected
        </h2>
        <p className="text-sm text-[var(--text-muted)] mb-4">
          These event names aren&apos;t in the database yet. Choose what to do
          with each.
        </p>
        <div className="space-y-4">
          {unknownEvents.map((name) => {
            const r = rows[name];
            return (
              <div
                key={name}
                className="border border-[var(--glass-border)] rounded-lg p-3"
              >
                <div className="text-white font-medium mb-2">{name}</div>
                <div className="space-y-2 text-sm">
                  <label className="flex items-center gap-3">
                    <input
                      type="radio"
                      name={`mode-${name}`}
                      checked={r.mode === "create"}
                      onChange={() => setRow(name, { mode: "create" })}
                    />
                    <span>Create event</span>
                    <input
                      type="date"
                      aria-label={`Date start for ${name}`}
                      value={r.dateStart}
                      disabled={r.mode !== "create"}
                      onChange={(e) =>
                        setRow(name, { dateStart: e.target.value })
                      }
                      className="bg-transparent border border-[var(--glass-border)] rounded px-2 py-1 text-sm disabled:opacity-50"
                    />
                  </label>
                  <label className="flex items-center gap-3">
                    <input
                      type="radio"
                      name={`mode-${name}`}
                      checked={r.mode === "map"}
                      onChange={() => setRow(name, { mode: "map" })}
                    />
                    <span>Map to existing</span>
                    <div className="flex-1">
                      <GlassSelect
                        aria-label={`Existing event for ${name}`}
                        options={eventOptions}
                        value={r.eventId}
                        onChange={(e) =>
                          setRow(name, { eventId: e.target.value })
                        }
                        disabled={r.mode !== "map"}
                      />
                    </div>
                  </label>
                  <label className="flex items-center gap-3">
                    <input
                      type="radio"
                      name={`mode-${name}`}
                      checked={r.mode === "skip"}
                      onChange={() => setRow(name, { mode: "skip" })}
                    />
                    <span>Skip (leave event blank for these rows)</span>
                  </label>
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm text-[var(--text-secondary)] hover:text-white"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirm}
            className="px-4 py-2 text-sm rounded-lg bg-[var(--accent-orange)]/15 text-[var(--accent-orange)] border border-[var(--accent-orange)]/20 hover:bg-[var(--accent-orange)]/25"
          >
            Confirm and import
          </button>
        </div>
      </GlassCard>
    </div>
  );
}
```

Note: `GlassSelect` must accept and forward `disabled` and `aria-label`. Check `components/ui/glass-select.tsx` — if either is missing, add `disabled?: boolean` to its props and spread it onto the underlying `<select>`. If `aria-label` is not already forwarded via `...rest`, accept it explicitly and pass through.

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run components/admin/event-detect-modal.test.tsx`
Expected: PASS — all tests passing.

---

## Task 9: Rewrite `app/admin/uploads/page.tsx`

**Files:**
- Modify: `app/admin/uploads/page.tsx` (full rewrite)

- [ ] **Step 1: Replace the file's contents**

```tsx
// app/admin/uploads/page.tsx
"use client";

import { useState, useEffect, useTransition, useRef } from "react";
import Papa from "papaparse";
import { Upload as UploadIcon, CheckCircle, AlertCircle } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassSelect } from "@/components/ui/glass-select";
import { Badge } from "@/components/ui/badge";
import { FileDropzone } from "@/components/admin/file-dropzone";
import {
  ImportTable,
  type ImportTableState,
  type ImportColumn,
} from "@/components/admin/import-table";
import { EventDetectModal } from "@/components/admin/event-detect-modal";
import {
  fieldSetForMode,
  isValidFieldForMode,
  type ImportMode,
} from "@/lib/uploads/field-sets";
import { autoMatchHeader } from "@/lib/uploads/auto-match";
import {
  importPersons,
  importOrganizations,
  listUnknownEvents,
  findOrCreateEvents,
  type DuplicateHandling,
  type EventDecision,
  type PersonImportRow,
  type OrganizationImportRow,
} from "./actions";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import type { Upload, Event } from "@/lib/types/database";

const DEFAULT_PERSON_COLUMNS = ["full_name", "email", "linkedin", "title", "event"];
const DEFAULT_ORG_COLUMNS = ["name", "website", "category", "linkedin_url", "event"];

function makeColumnId(): string {
  return `col_${Math.random().toString(36).slice(2, 9)}`;
}

function emptyStateFor(mode: ImportMode): ImportTableState {
  const fields = mode === "persons" ? DEFAULT_PERSON_COLUMNS : DEFAULT_ORG_COLUMNS;
  return {
    mode,
    columns: fields.map((f) => ({ id: makeColumnId(), field: f })),
    rows: Array.from({ length: 5 }, () => fields.map(() => "")),
  };
}

function rowToRecord(
  columns: ImportColumn[],
  row: string[],
): Record<string, string> {
  const out: Record<string, string> = {};
  columns.forEach((col, i) => {
    if (col.field) out[col.field] = row[i] ?? "";
  });
  return out;
}

function dropEmptyRows(state: ImportTableState): string[][] {
  return state.rows.filter((row) =>
    state.columns.some((col, i) => col.field && (row[i]?.trim() ?? "") !== ""),
  );
}

export default function UploadsPage() {
  const [mode, setMode] = useState<ImportMode>("persons");
  const [state, setState] = useState<ImportTableState>(() => emptyStateFor("persons"));
  const [filename, setFilename] = useState("manual-import.csv");
  const [events, setEvents] = useState<Pick<Event, "id" | "name">[]>([]);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [duplicateHandling, setDuplicateHandling] = useState<DuplicateHandling>("skip");
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{
    personsCreated: number;
    organizationsCreated: number;
    skipped: number;
    errors: string[];
  } | null>(null);
  const [pendingEventResolution, setPendingEventResolution] = useState<{
    unknown: string[];
    known: Record<string, string>;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("events")
      .select("id, name")
      .order("date_start", { ascending: false })
      .then(({ data }) => {
        if (data) setEvents(data as Pick<Event, "id" | "name">[]);
      });
    supabase
      .from("uploads")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (data) setUploads(data as Upload[]);
      });
  }, []);

  function switchMode(next: ImportMode) {
    if (next === mode) return;
    const hasUserContent =
      state.rows.some((row) => row.some((v) => v.trim() !== "")) ||
      state.columns.some((c) => c.field && !DEFAULT_PERSON_COLUMNS.includes(c.field) && !DEFAULT_ORG_COLUMNS.includes(c.field));
    if (
      hasUserContent &&
      !confirm("Switch mode? Column bindings will reset. Row data will be preserved.")
    ) {
      return;
    }
    setMode(next);
    setState((prev) => ({
      ...prev,
      mode: next,
      columns: prev.columns.map((c) => ({
        ...c,
        field: isValidFieldForMode(c.field, next) ? c.field : "",
      })),
    }));
  }

  function handleCsv(file: File) {
    setResult(null);
    setFilename(file.name);
    Papa.parse(file, {
      header: false,
      skipEmptyLines: true,
      complete: (results) => {
        const all = results.data as string[][];
        if (all.length === 0) return;
        const headers = all[0];
        const body = all.slice(1);
        const columns: ImportColumn[] = headers.map((h) => ({
          id: makeColumnId(),
          field: autoMatchHeader(h, mode),
          originalHeader: h,
        }));
        setState({ mode, columns, rows: body });
      },
    });
  }

  async function handleSubmit() {
    const validRows = dropEmptyRows(state);
    if (validRows.length === 0) return;

    // Extract event-column values
    const eventColIndex = state.columns.findIndex((c) => c.field === "event");
    const rawEventNames =
      eventColIndex >= 0 ? validRows.map((r) => r[eventColIndex] ?? "") : [];

    const partition = await listUnknownEvents(rawEventNames);
    if (partition.unknown.length > 0) {
      setPendingEventResolution(partition);
      return;
    }
    await runImport(validRows, partition.known);
  }

  async function resolveEventsAndImport(decisions: EventDecision[]) {
    if (!pendingEventResolution) return;
    try {
      const created = await findOrCreateEvents(decisions);
      const eventMap = { ...pendingEventResolution.known, ...created };
      setPendingEventResolution(null);
      await runImport(dropEmptyRows(state), eventMap);
    } catch (err) {
      setResult({
        personsCreated: 0,
        organizationsCreated: 0,
        skipped: 0,
        errors: [err instanceof Error ? err.message : "Unknown error creating events"],
      });
      setPendingEventResolution(null);
    }
  }

  function runImport(
    validRows: string[][],
    eventMap: Record<string, string | null>,
  ) {
    return new Promise<void>((resolve) => {
      startTransition(async () => {
        const records = validRows.map((row) => rowToRecord(state.columns, row));
        const res =
          mode === "persons"
            ? await importPersons(records as PersonImportRow[], { duplicateHandling, eventMap }, filename)
            : await importOrganizations(records as OrganizationImportRow[], { duplicateHandling, eventMap }, filename);
        setResult({
          personsCreated: res.personsCreated,
          organizationsCreated: res.organizationsCreated,
          skipped: res.skipped,
          errors: res.errors,
        });
        const supabase = createClient();
        const { data } = await supabase
          .from("uploads")
          .select("*")
          .order("created_at", { ascending: false });
        if (data) setUploads(data as Upload[]);
        resolve();
      });
    });
  }

  const totalValidRows = dropEmptyRows(state).length;
  const hasMappedField = state.columns.some((c) => c.field);

  return (
    <div className="space-y-6">
      {/* Mode toggle + toolbar */}
      <GlassCard>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex rounded-lg overflow-hidden border border-[var(--glass-border)]">
            {(["persons", "organizations"] as const).map((m) => (
              <button
                key={m}
                onClick={() => switchMode(m)}
                className={cn(
                  "px-4 py-2 text-sm capitalize transition-colors",
                  mode === m
                    ? "bg-[var(--accent-orange)]/20 text-[var(--accent-orange)]"
                    : "text-[var(--text-secondary)] hover:text-white",
                )}
              >
                {m}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleCsv(f);
                e.target.value = "";
              }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-3 py-2 text-sm rounded-lg border border-[var(--glass-border)] text-[var(--text-secondary)] hover:text-white"
            >
              Upload CSV
            </button>
            <button
              onClick={() => {
                setState(emptyStateFor(mode));
                setFilename("manual-import.csv");
                setResult(null);
              }}
              className="px-3 py-2 text-sm rounded-lg border border-[var(--glass-border)] text-[var(--text-secondary)] hover:text-white"
            >
              Reset table
            </button>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <label className="text-xs text-[var(--text-muted)]">Duplicates</label>
            <GlassSelect
              options={[
                { value: "skip", label: "Skip duplicates" },
                { value: "update", label: "Update existing" },
                { value: "create_new", label: "Create new" },
              ]}
              value={duplicateHandling}
              onChange={(e) =>
                setDuplicateHandling(e.target.value as DuplicateHandling)
              }
            />
            <button
              onClick={handleSubmit}
              disabled={isPending || !hasMappedField || totalValidRows === 0}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium",
                "bg-[var(--accent-orange)]/15 text-[var(--accent-orange)] border border-[var(--accent-orange)]/20",
                "hover:bg-[var(--accent-orange)]/25",
                (isPending || !hasMappedField || totalValidRows === 0) &&
                  "opacity-50 cursor-not-allowed",
              )}
            >
              <UploadIcon className="h-4 w-4" />
              {isPending ? "Importing..." : `Import ${totalValidRows} row${totalValidRows === 1 ? "" : "s"}`}
            </button>
          </div>
        </div>
        {result && (
          <div className="mt-3 flex items-center gap-2 text-sm">
            {result.errors.length === 0 ? (
              <>
                <CheckCircle className="h-4 w-4 text-emerald-400" />
                <span className="text-emerald-400">
                  {result.personsCreated} persons, {result.organizationsCreated} organizations created. {result.skipped} skipped.
                </span>
              </>
            ) : (
              <>
                <AlertCircle className="h-4 w-4 text-yellow-400" />
                <span className="text-yellow-400">
                  {result.personsCreated + result.organizationsCreated} created, {result.errors.length} errors
                </span>
              </>
            )}
          </div>
        )}
      </GlassCard>

      {/* Drop target (also click to open file picker via toolbar) */}
      <FileDropzone onFile={handleCsv} />

      {/* The editable table */}
      <ImportTable
        state={state}
        onChange={setState}
        fieldSet={fieldSetForMode(mode)}
      />

      {/* Event resolution modal */}
      {pendingEventResolution && (
        <EventDetectModal
          unknownEvents={pendingEventResolution.unknown}
          existingEvents={events}
          onConfirm={resolveEventsAndImport}
          onCancel={() => setPendingEventResolution(null)}
        />
      )}

      {/* Upload history */}
      <div>
        <h2 className="text-lg font-semibold font-[family-name:var(--font-heading)] text-white mb-3">
          Upload History
        </h2>
        {uploads.length === 0 ? (
          <GlassCard className="text-center py-8">
            <p className="text-[var(--text-muted)]">No uploads yet</p>
          </GlassCard>
        ) : (
          <GlassCard padding={false}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--glass-border)] text-left">
                    <th className="px-5 py-3 text-[var(--text-muted)] font-medium">Date</th>
                    <th className="px-5 py-3 text-[var(--text-muted)] font-medium">Filename</th>
                    <th className="px-5 py-3 text-[var(--text-muted)] font-medium">Rows</th>
                    <th className="px-5 py-3 text-[var(--text-muted)] font-medium">Persons</th>
                    <th className="px-5 py-3 text-[var(--text-muted)] font-medium">Organizations</th>
                    <th className="px-5 py-3 text-[var(--text-muted)] font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {uploads.map((u) => (
                    <tr
                      key={u.id}
                      className="border-b border-[var(--glass-border)] last:border-0 hover:bg-[var(--glass-bg-hover)] transition-all duration-200"
                    >
                      <td className="px-5 py-4 text-[var(--text-secondary)]">
                        {new Date(u.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-5 py-4 text-white">{u.filename}</td>
                      <td className="px-5 py-4 text-[var(--text-secondary)]">{u.row_count ?? "-"}</td>
                      <td className="px-5 py-4 text-[var(--text-secondary)]">{u.persons_created}</td>
                      <td className="px-5 py-4 text-[var(--text-secondary)]">{u.organizations_created}</td>
                      <td className="px-5 py-4">
                        <Badge
                          variant={
                            u.status === "completed"
                              ? "sent"
                              : u.status === "failed"
                                ? "failed"
                                : "processing"
                          }
                        >
                          {u.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </GlassCard>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS (no new errors from `app/admin/uploads/page.tsx`).

---

## Task 10: Delete the old column-mapper

**Files:**
- Delete: `components/admin/column-mapper.tsx`

- [ ] **Step 1: Confirm no other consumers**

Run: `grep -rn "column-mapper\|ColumnMapper" --include="*.ts" --include="*.tsx" .`
Expected: only matches inside the file itself (already removed from `page.tsx` in Task 9). If anything else matches, stop and resolve before deleting.

- [ ] **Step 2: Delete the file**

Run: `rm components/admin/column-mapper.tsx`

- [ ] **Step 3: Re-run typecheck and tests**

Run:
```
npx tsc --noEmit
npx vitest run lib/uploads components/admin/import-table.test.tsx components/admin/event-detect-modal.test.tsx
```
Expected: both pass.

---

## Task 11: Manual verification (dev server)

This task is required — server actions and the integrated UI aren't unit-tested.

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`

- [ ] **Step 2: Verify the empty-table flow**

1. Navigate to `/admin/uploads`.
2. Confirm Persons mode is selected by default, table has 5 blank rows + 5 default columns (full_name, email, linkedin, title, event).
3. Type a person into row 1 (full_name + email + a brand-new event name).
4. Click `Import 1 row`. Modal should appear listing the new event.
5. Leave default "Create event", confirm. Verify the result strip shows "1 persons created".
6. Visit `/admin/events` — the new event should exist. Visit `/admin/persons` — the new person should exist and be associated.

- [ ] **Step 3: Verify CSV upload flow**

1. Reset table. Click `Upload CSV`. Upload a small CSV with headers including `Email`, `Job Title`, `Company`, `Event`. Confirm columns auto-mapped to `email`, `title`, `organization_name`, `event`.
2. Edit one cell inline.
3. Import. Verify counts.

- [ ] **Step 4: Verify paste flow**

1. Reset table. Click the first cell. Paste TSV (e.g. `Alice\talice@x\nBob\tbob@x`). Confirm cells fill.
2. Bind columns, import.

- [ ] **Step 5: Verify Organizations mode**

1. Switch to Organizations. Confirm column bindings reset; table shows org defaults.
2. Add one row with `name` + `website` + `event` (existing event). Import. Verify org appears in `/admin/organizations`.

- [ ] **Step 6: Verify the "switch mode resets bindings" guard**

1. Type something into a row. Switch modes. Confirm the confirm() prompt fires; accept; bindings reset to empty for any field not valid in the new mode.

---

## Task 12: Commit

- [ ] **Step 1: Stage and commit**

```bash
git add lib/uploads components/admin/import-table.tsx components/admin/import-table.test.tsx components/admin/event-detect-modal.tsx components/admin/event-detect-modal.test.tsx app/admin/uploads/page.tsx app/admin/uploads/actions.ts docs/superpowers/specs/2026-05-19-uploads-editable-table-design.md docs/superpowers/plans/2026-05-19-uploads-editable-table.md
git rm components/admin/column-mapper.tsx
git commit -m "$(cat <<'EOF'
feat(uploads): editable table with per-mode fields and event detection

Unify CSV upload, empty table, and bulk paste into a single editable
table at /admin/uploads. Headers are field-binding dropdowns scoped to
Persons or Organizations. On submit, scan the event column and prompt
to create/map/skip any unknown event names before insertion. Split the
import server action into importPersons and importOrganizations.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 2: Verify the working tree is clean for the touched paths**

Run: `git status -- app/admin/uploads components/admin/import-table.tsx components/admin/event-detect-modal.tsx components/admin/column-mapper.tsx lib/uploads docs/superpowers/plans docs/superpowers/specs`
Expected: nothing returned for those paths.

---

## Self-Review

**Spec coverage:**
- Mode toggle at top, drops "both" → Task 9 (mode toggle), Task 1 (field sets disjoint).
- Three entry paths → empty defaults Task 9 (`emptyStateFor`), CSV Task 9 (`handleCsv`), paste Task 6.
- Editable header dropdowns + cells + per-column/row remove → Task 5.
- Field sets split by mode → Task 1.
- Event detection modal with create/map/skip → Tasks 4, 7, 8.
- Server actions split by entity → Task 7.
- `findOrCreateEvents`, `listUnknownEvents` → Task 7.
- `column-mapper.tsx` retired → Task 10.
- Switch-mode guard preserving rows + clearing bindings → Task 9 (`switchMode`).
- Drop entirely-empty rows on submit → Task 9 (`dropEmptyRows`).
- Required field validation noted in spec — covered by the per-row "skip if no name/email" branch inside the server actions (Task 7); intentionally not blocking client-side because the user can also leave the rest of the row valid.

**Placeholder scan:** No TBD/TODO/fill-in. Every code step has the literal code.

**Type consistency:**
- `ImportTableState`, `ImportColumn` defined in `import-table.tsx` (Task 5), re-imported by `page.tsx` (Task 9). ✓
- `EventDecision` defined in `actions.ts` (Task 7), imported by `event-detect-modal.tsx` (Task 8). ✓
- `PersonImportRow` / `OrganizationImportRow` defined in `actions.ts` (Task 7), used in `page.tsx` (Task 9). ✓
- `DuplicateHandling` exported from `actions.ts` (Task 7), used in `page.tsx`. ✓
- `ImportMode` defined in `field-sets.ts` (Task 1), used everywhere else consistently. ✓
- `parseClipboard` from `paste-parser.ts` (Task 3), imported by `import-table.tsx` (Task 6). ✓
- `partitionEventNames`, `normalizeEventName` from `event-detect.ts` (Task 4), used in `actions.ts` (Task 7). ✓
- `Task 8 GlassSelect note`: a check-and-extend instruction is included rather than a silent assumption.

No issues remaining.
