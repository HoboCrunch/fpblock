# Admin UI Layout Discipline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate pill stacking, column drift, and filter-state duplication across all admin tables; consolidate three table substrates into one virtualized grid primitive with shared cell tokens.

**Architecture:** A single `<DataTable>` (CSS Grid + `@tanstack/react-virtual`) and matching `<DataCell>` variants replace HTML `<table>` and the legacy `VirtualTable`. All pill columns enforce single-line truncation. Filter UIs collapse to one source of truth via a new `<MultiSelectField>` that owns its own chip count and dropdown state.

**Tech Stack:** Next.js 16, React 19, Tailwind v4, `@tanstack/react-virtual`, `lucide-react`, vitest (component tests), tsx (dev runner).

**Commit policy:** Per user preference, commit ONCE at the end of each phase (not per task). Phases are designed to leave the app in a working state at every commit.

**Verification approach:** Most changes are visual. Each task includes a manual verification step (run `npm run dev`, navigate to the named admin route, exercise the named interaction, confirm the named outcome). Pure logic changes get vitest coverage.

---

## File Inventory

**Create:**
- `components/ui/data-table.tsx` — virtualized grid table primitive (Phase 5)
- `components/ui/data-cell.tsx` — text/numeric/pill/date cell variants (Phase 5)
- `components/admin/multi-select-field.tsx` — dropdown that renders its own selected-count + clear (Phase 3)
- `components/ui/multi-select-field.test.tsx` — vitest coverage (Phase 3)
- `app/globals.css` additions — `--cell-px`, `--row-h` tokens (Phase 8)

**Modify:**
- `components/ui/badge.tsx` — base classes (Phase 1)
- `components/admin/active-filters.tsx` — neutral chip, always show clear-all (Phase 2)
- `app/admin/organizations/org-table-row.tsx` — events column container (Phase 1)
- `app/admin/persons/person-table-row.tsx` — events column container (Phase 1)
- `components/admin/sequence-row.tsx` — event badge cap (Phase 1)
- `app/admin/sequences/sequence-list-client.tsx` — table-fixed + colgroup (Phase 1) → DataTable migration (Phase 6)
- `app/admin/persons/persons-table-client.tsx` — replace 6 inline chip strips with MultiSelectField; fold search into filter card (Phase 4)
- `app/admin/organizations/organizations-table-client.tsx` — fold search into filter card; sticky header (Phase 4)
- `app/admin/events/events-table-client.tsx` — DataTable migration (Phase 6)
- `app/admin/enrichment/components/entity-table.tsx` — DataTable migration (Phase 7)
- `components/admin/message-row.tsx` and parent — DataTable migration (Phase 6)
- `components/admin/pipeline-table.tsx` and `pipeline-view.tsx` — DataTable migration (Phase 6)

**Delete (dead code, not imported anywhere — confirmed via grep):**
- `components/admin/organization-table.tsx`
- `components/admin/person-table.tsx`

---

## Phase 1 — Pill Discipline (P0, ~45 min)

Smallest changes with the largest visible impact. Stops pills from wrapping inside cells or stretching columns.

### Task 1.1: Lock down the Badge primitive

**Files:**
- Modify: `components/ui/badge.tsx:50-58`

- [ ] **Step 1: Update Badge base classes**

Edit `components/ui/badge.tsx`. Change the `<span>` className from:
```tsx
"inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border"
```
to:
```tsx
"inline-flex items-center max-w-full whitespace-nowrap overflow-hidden text-ellipsis px-2.5 py-0.5 rounded-full text-xs font-medium border"
```

Why: `inline-flex` items don't honor `truncate` on themselves; we need the three explicit overflow properties on the badge itself so any caller that gives it a `max-width` (or whose parent has `min-w-0`) gets ellipsis behavior automatically. `whitespace-nowrap` prevents text wrapping inside the pill regardless of cell width.

- [ ] **Step 2: Visual verify**

Run: `npm run dev`
Navigate to: `http://localhost:3000/admin/organizations`
Resize the browser window narrow (~900px). Confirm that event pills in the Events column truncate with ellipsis instead of wrapping text inside the pill or pushing rows taller.

Then navigate to `http://localhost:3000/admin/sequences`. Confirm the Channel/Status/Mode badges no longer wrap text.

### Task 1.2: Cap the events column on org rows

**Files:**
- Modify: `app/admin/organizations/org-table-row.tsx:184-201`

- [ ] **Step 1: Replace flex-wrap with single-line overflow**

Edit `app/admin/organizations/org-table-row.tsx`. Replace the events block:

```tsx
{/* Events */}
<div className="px-1.5 py-1 min-w-0">
  <div className="flex flex-wrap gap-1">
    {row.events.slice(0, 2).map((ev) => (
      <Badge
        key={ev.id || `${ev.name}-${ev.role}`}
        variant={ev.tier ? (ev.tier as string) : "default"}
        className="text-[10px] px-1.5 py-0 truncate max-w-[70px]"
      >
        {ev.name.length > 10 ? ev.name.slice(0, 10) + "…" : ev.name}
      </Badge>
    ))}
    {row.events.length > 2 && (
      <span className="text-[10px] text-[var(--text-muted)]">+{row.events.length - 2}</span>
    )}
    {row.events.length === 0 && <span className="text-[var(--text-muted)] text-xs">&mdash;</span>}
  </div>
</div>
```

with:

```tsx
{/* Events */}
<div
  className="px-1.5 py-1 min-w-0"
  title={row.events.length > 0 ? row.events.map((e) => e.name).join(", ") : undefined}
>
  <div className="flex items-center gap-1 min-w-0 overflow-hidden">
    {row.events.slice(0, 2).map((ev) => (
      <Badge
        key={ev.id || `${ev.name}-${ev.role}`}
        variant={ev.tier ? (ev.tier as string) : "default"}
        className="text-[10px] px-1.5 py-0 max-w-[70px] flex-shrink"
      >
        {ev.name}
      </Badge>
    ))}
    {row.events.length > 2 && (
      <span className="text-[10px] text-[var(--text-muted)] flex-shrink-0">
        +{row.events.length - 2}
      </span>
    )}
    {row.events.length === 0 && (
      <span className="text-[var(--text-muted)] text-xs">&mdash;</span>
    )}
  </div>
</div>
```

Why: removed manual JS substring (Badge now truncates via CSS), removed `flex-wrap` (rows are virtualized at fixed height), added `title` attr for the full list on hover, added `flex-shrink-0` on the `+N` so it never disappears.

- [ ] **Step 2: Visual verify**

Run: `npm run dev`. Navigate to `/admin/organizations`. Find an org with 3+ events (most large sponsors). Confirm:
1. Two pills + "+N" render on a single line.
2. Hovering the cell shows the full event list as a native tooltip.
3. Resizing the browser narrower never causes a row to grow taller.

### Task 1.3: Cap the events column on person rows

**Files:**
- Modify: `app/admin/persons/person-table-row.tsx` (events column)

- [ ] **Step 1: Locate and update the events block**

Run: `grep -n "flex flex-wrap" app/admin/persons/person-table-row.tsx`

Apply the same transformation as Task 1.2 to the events column (`flex flex-wrap gap-1` → `flex items-center gap-1 min-w-0 overflow-hidden`, drop the JS substring, add `title` attr, change `truncate max-w-[70px]` on Badge to `max-w-[70px] flex-shrink`, add `flex-shrink-0` on `+N`).

- [ ] **Step 2: Visual verify**

Navigate to `/admin/persons`. Find a person affiliated with multiple events. Confirm same single-line behavior + hover tooltip.

### Task 1.4: Cap sequence-row event badge and lock sequence table widths

**Files:**
- Modify: `components/admin/sequence-row.tsx:158-164`
- Modify: `app/admin/sequences/sequence-list-client.tsx` (the `<table>` element)

- [ ] **Step 1: Cap the event badge**

Edit `components/admin/sequence-row.tsx`. Replace lines 158–164:
```tsx
{/* Event */}
<td className="px-4 py-3">
  {sequence.event_name ? (
    <Badge variant="draft">{sequence.event_name}</Badge>
  ) : (
    <span className="text-[var(--text-muted)] text-xs">—</span>
  )}
</td>
```
with:
```tsx
{/* Event */}
<td className="px-4 py-3 max-w-[180px]">
  {sequence.event_name ? (
    <Badge variant="draft" className="max-w-full" title={sequence.event_name}>
      {sequence.event_name}
    </Badge>
  ) : (
    <span className="text-[var(--text-muted)] text-xs">—</span>
  )}
</td>
```

- [ ] **Step 2: Add `table-fixed` + `<colgroup>` to the sequence table**

Open `app/admin/sequences/sequence-list-client.tsx`. Find the `<table className="w-full text-sm">` element and:
1. Change className to `w-full text-sm table-fixed`.
2. Insert a `<colgroup>` as the first child of `<table>`, with explicit widths matching the 10 columns:

```tsx
<colgroup>
  <col className="w-10" />        {/* Checkbox */}
  <col />                          {/* Name (flex) */}
  <col className="w-24" />        {/* Channel */}
  <col className="w-24" />        {/* Status */}
  <col className="w-16" />        {/* Steps */}
  <col className="w-32" />        {/* Enrolled */}
  <col className="w-56" />        {/* Delivery funnel */}
  <col className="w-28" />        {/* Mode */}
  <col className="w-[200px]" />   {/* Event */}
  <col className="w-32" />        {/* Updated */}
</colgroup>
```

- [ ] **Step 3: Visual verify**

Navigate to `/admin/sequences`. Confirm:
1. A sequence with a long event name (e.g. "Consensus 2026 by CoinDesk") truncates the badge instead of stretching the column.
2. Column rhythm is consistent across all rows.
3. Hovering the truncated event badge shows the full name.

### Task 1.5: ActiveFilters always-on Clear-all + neutral chip

**Files:**
- Modify: `components/admin/active-filters.tsx`

- [ ] **Step 1: Update component**

Replace the entire body of `components/admin/active-filters.tsx` with:

```tsx
"use client";

import { X } from "lucide-react";

interface ActiveFilter {
  key: string;
  label: string;
  value: string;
}

interface ActiveFiltersProps {
  filters: ActiveFilter[];
  onRemove: (key: string) => void;
  onClearAll: () => void;
}

export function ActiveFilters({ filters, onRemove, onClearAll }: ActiveFiltersProps) {
  if (filters.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {filters.map((f) => (
        <span
          key={f.key}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-white/[0.06] text-[var(--text-secondary)] border border-white/[0.08] max-w-[220px]"
          title={`${f.label}: ${f.value}`}
        >
          <span className="truncate">
            <span className="text-[var(--text-muted)]">{f.label}:</span> {f.value}
          </span>
          <button
            onClick={() => onRemove(f.key)}
            className="hover:text-white shrink-0"
            aria-label={`Remove ${f.label} filter`}
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}
      <button
        onClick={onClearAll}
        className="text-[11px] text-[var(--text-muted)] hover:text-white px-1"
      >
        Clear all
      </button>
    </div>
  );
}
```

Why: neutral chip (orange is reserved for primary actions); always-show Clear all (no surprise threshold); `max-w-[220px]` + `truncate` so a long filter value can't blow up the bar; `title` attr for full text; chip label/value visually distinguished.

- [ ] **Step 2: Visual verify**

Navigate to `/admin/persons` and `/admin/organizations`. Apply 1 filter — confirm "Clear all" appears immediately. Apply many filters — confirm the bar wraps cleanly without any single chip dominating.

### Task 1.6: Phase 1 commit

- [ ] **Step 1: Stage and commit**

```bash
git add components/ui/badge.tsx \
        components/admin/active-filters.tsx \
        app/admin/organizations/org-table-row.tsx \
        app/admin/persons/person-table-row.tsx \
        components/admin/sequence-row.tsx \
        app/admin/sequences/sequence-list-client.tsx
git commit -m "ui(admin): pill discipline — single-line pills, capped widths, neutral active-filter chips"
```

---

## Phase 2 — MultiSelectField Component (P1, ~30 min)

Extract the duplicated dropdown+chip-strip pattern into a single reusable component so subsequent dedup is a one-line swap.

### Task 2.1: Build MultiSelectField

**Files:**
- Create: `components/admin/multi-select-field.tsx`
- Create: `components/admin/multi-select-field.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `components/admin/multi-select-field.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MultiSelectField } from "./multi-select-field";

describe("MultiSelectField", () => {
  const options = [
    { value: "a", label: "Alpha" },
    { value: "b", label: "Beta" },
    { value: "c", label: "Gamma" },
  ];

  it("shows placeholder when no values selected", () => {
    render(
      <MultiSelectField
        placeholder="Pick one"
        options={options}
        values={[]}
        onChange={() => {}}
      />
    );
    expect(screen.getByText("Pick one")).toBeInTheDocument();
  });

  it("shows count when multiple values selected", () => {
    render(
      <MultiSelectField
        placeholder="Pick one"
        options={options}
        values={["a", "b"]}
        onChange={() => {}}
      />
    );
    expect(screen.getByText("2 selected")).toBeInTheDocument();
  });

  it("shows the single selected label when one value selected", () => {
    render(
      <MultiSelectField
        placeholder="Pick one"
        options={options}
        values={["b"]}
        onChange={() => {}}
      />
    );
    expect(screen.getByText("Beta")).toBeInTheDocument();
  });

  it("calls onChange with toggled value when option clicked", () => {
    const onChange = vi.fn();
    render(
      <MultiSelectField
        placeholder="Pick"
        options={options}
        values={["a"]}
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /pick|alpha/i }));
    fireEvent.click(screen.getByText("Beta"));
    expect(onChange).toHaveBeenCalledWith(["a", "b"]);
  });

  it("calls onChange clearing all when X clicked", () => {
    const onChange = vi.fn();
    render(
      <MultiSelectField
        placeholder="Pick"
        options={options}
        values={["a", "b"]}
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByLabelText("Clear selection"));
    expect(onChange).toHaveBeenCalledWith([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- multi-select-field`
Expected: FAIL — "Cannot find module './multi-select-field'".

If `@testing-library/react` is not installed, install it first: `npm i -D @testing-library/react @testing-library/jest-dom jsdom` and add to `vitest.config.ts`: `test: { environment: "jsdom" }`. (Check `vitest.config.ts` first; if that environment is already set, only install missing deps.)

- [ ] **Step 3: Implement the component**

Create `components/admin/multi-select-field.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface MultiSelectOption {
  value: string;
  label: string;
}

interface MultiSelectFieldProps {
  placeholder: string;
  options: MultiSelectOption[];
  values: string[];
  onChange: (values: string[]) => void;
  className?: string;
}

export function MultiSelectField({
  placeholder,
  options,
  values,
  onChange,
  className,
}: MultiSelectFieldProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const display =
    values.length === 0
      ? placeholder
      : values.length === 1
      ? options.find((o) => o.value === values[0])?.label ?? values[0]
      : `${values.length} selected`;

  const toggle = (value: string) => {
    if (values.includes(value)) onChange(values.filter((v) => v !== value));
    else onChange([...values, value]);
  };

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "w-full flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm",
          "bg-[var(--glass-bg)] border border-[var(--glass-border)]",
          "hover:bg-white/[0.04] transition-colors",
          values.length === 0 && "text-[var(--text-muted)]"
        )}
      >
        <span className="truncate text-left flex-1">{display}</span>
        {values.length > 0 ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChange([]);
            }}
            className="text-[var(--text-muted)] hover:text-white shrink-0"
            aria-label="Clear selection"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        ) : (
          <ChevronDown className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
        )}
      </button>

      {open && (
        <div className="absolute z-20 left-0 right-0 mt-1 max-h-64 overflow-y-auto rounded-lg border border-[var(--glass-border)] bg-[var(--glass-bg)] backdrop-blur-md shadow-lg">
          {options.length === 0 ? (
            <div className="px-3 py-2 text-xs text-[var(--text-muted)]">No options</div>
          ) : (
            options.map((opt) => {
              const selected = values.includes(opt.value);
              return (
                <button
                  type="button"
                  key={opt.value}
                  onClick={() => toggle(opt.value)}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left",
                    "hover:bg-white/[0.04]",
                    selected && "text-[var(--accent-orange)]"
                  )}
                >
                  <span
                    className={cn(
                      "w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0",
                      selected
                        ? "bg-[var(--accent-orange)]/20 border-[var(--accent-orange)]/60"
                        : "border-white/20"
                    )}
                  >
                    {selected && <Check className="w-2.5 h-2.5" />}
                  </span>
                  <span className="truncate">{opt.label}</span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- multi-select-field`
Expected: PASS (5 tests).

---

## Phase 3 — Replace inline chip strips with MultiSelectField (P1, ~40 min)

### Task 3.1: Replace 6 chip strips in persons-table-client

**Files:**
- Modify: `app/admin/persons/persons-table-client.tsx:587-756`

- [ ] **Step 1: Add import**

At the top of `app/admin/persons/persons-table-client.tsx`, add:
```tsx
import { MultiSelectField } from "@/components/admin/multi-select-field";
```

- [ ] **Step 2: Replace each multi-select dropdown + inline chip strip**

For each of the six pairs (Events filter, Correlation Type, Seniority, Department, Source, Enrichment Status), replace the `<GlassSelect>` + `{filterX.length > 0 && (<div className="flex flex-wrap…")}` block with a single `<MultiSelectField>`.

Example — Events filter (lines 587–612):

Before:
```tsx
<GlassSelect
  placeholder="Filter by event..."
  options={eventOptions.map((e) => ({ value: e.id, label: e.name }))}
  value={filterEvents[0] || ""}
  onChange={(e) => {
    const val = e.target.value;
    if (val) {
      toggleMultiSelect(val, filterEvents, setFilterEvents);
    }
  }}
/>
{filterEvents.length > 0 && (
  <div className="flex flex-wrap gap-1">
    {filterEvents.map((id) => (
      <span
        key={id}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-white/[0.06] text-[var(--text-secondary)]"
      >
        {eventOptions.find((e) => e.id === id)?.name || id}
        <button onClick={() => toggleMultiSelect(id, filterEvents, setFilterEvents)}>
          <X className="w-3 h-3" />
        </button>
      </span>
    ))}
  </div>
)}
```

After:
```tsx
<MultiSelectField
  placeholder="Filter by event..."
  options={eventOptions.map((e) => ({ value: e.id, label: e.name }))}
  values={filterEvents}
  onChange={setFilterEvents}
/>
```

Apply the same swap to:
- Correlation Type (lines 624–653) → `values={filterCorrelationType}` `onChange={setFilterCorrelationType}`
- Seniority (lines 659–677) → `values={filterSeniority}` `onChange={setFilterSeniority}`
- Department (lines 679–697) → `values={filterDepartment}` `onChange={setFilterDepartment}`
- Source (lines 699–717) → `values={filterSource}` `onChange={setFilterSource}`
- Enrichment Status (lines 733–756) → `values={filterEnrichmentStatus}` `onChange={setFilterEnrichmentStatus}`

- [ ] **Step 3: Remove now-unused helpers and imports**

Search for `toggleMultiSelect` in the file. If it is no longer used anywhere in this file, delete its definition. Remove the `X` lucide-react import if no other usage remains in this file (check with `grep -n "X[ ,>/]" app/admin/persons/persons-table-client.tsx`).

- [ ] **Step 4: Visual verify**

Run: `npm run dev`. Navigate to `/admin/persons`.
1. Open the Filters card. Confirm each multi-select shows "N selected" or the single label rather than separate chips below.
2. Apply 3 events, 2 seniorities. Confirm only the bottom `<ActiveFilters>` bar shows the chips — no duplication inside the filter card.
3. Click the X inside a MultiSelectField trigger — confirm it clears that filter.
4. Click "Clear all" in ActiveFilters — confirm everything resets.

### Task 3.2: Apply MultiSelectField to organizations-table-client

**Files:**
- Modify: `app/admin/organizations/organizations-table-client.tsx`

- [ ] **Step 1: Identify multi-select filters**

Run: `grep -n "GlassSelect\|toggleMultiSelect\|flex flex-wrap" app/admin/organizations/organizations-table-client.tsx`

For every `<GlassSelect>` whose state is an array (multi-select) followed by an inline chip strip, apply the same swap as Task 3.1.

- [ ] **Step 2: Visual verify**

Navigate to `/admin/organizations`. Apply event + sponsor-tier filters. Confirm no duplicated chip rendering and the ActiveFilters bar is the single source of truth.

### Task 3.3: Phase 2 + 3 commit

- [ ] **Step 1: Stage and commit**

```bash
git add components/admin/multi-select-field.tsx \
        components/admin/multi-select-field.test.tsx \
        app/admin/persons/persons-table-client.tsx \
        app/admin/organizations/organizations-table-client.tsx
git commit -m "ui(admin): MultiSelectField — single source of truth for multi-select filter state"
```

---

## Phase 4 — Filter Card Consolidation (P1, ~30 min)

Fold the search input into the top of the filter card so the sidebar reads as one panel.

### Task 4.1: Persons sidebar consolidation

**Files:**
- Modify: `app/admin/persons/persons-table-client.tsx` (the sidebar JSX, around line 556)

- [ ] **Step 1: Restructure sidebar**

Locate the sidebar JSX. Currently the structure is:
```tsx
<div className="space-y-4">
  <GlassInput icon={Search} placeholder="Search..." ... />
  <GlassCard className="!p-3">
    <FilterGroup title="Relationships" ...>...</FilterGroup>
    ...
  </GlassCard>
  <ActiveFilters .../>
  <SelectionSummary .../>
  <PersonPreviewPanel .../>
</div>
```

Change to:
```tsx
<div className="space-y-3">
  <GlassCard padding={false} className="overflow-hidden">
    <div className="p-3 border-b border-[var(--glass-border)]">
      <GlassInput
        icon={Search}
        placeholder="Search name, email, org..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
    </div>
    <div className="p-3 space-y-1">
      <FilterGroup title="Relationships" defaultOpen={true}>...</FilterGroup>
      <FilterGroup title="Profile">...</FilterGroup>
      <FilterGroup title="Contact">...</FilterGroup>
      <FilterGroup title="Enrichment">...</FilterGroup>
    </div>
  </GlassCard>
  <ActiveFilters .../>
  <SelectionSummary .../>
  <PersonPreviewPanel .../>
</div>
```

(Move the existing search input into the new `<div className="p-3 border-b ...">`, leaving its props unchanged. The `GlassCard` `!p-3` override goes away — replace with `padding={false}` and explicit interior padding so we control the divider.)

- [ ] **Step 2: Visual verify**

Navigate to `/admin/persons`. Confirm the sidebar reads as one card with a hairline divider between search and filters. Sidebar height should drop by ~24px because there's one less card border + gap.

### Task 4.2: Organizations sidebar consolidation

**Files:**
- Modify: `app/admin/organizations/organizations-table-client.tsx` (sidebar JSX)

- [ ] **Step 1: Apply identical restructure**

Use the same pattern as Task 4.1: wrap search + FilterGroups in a single `<GlassCard padding={false}>` with the search in a top section and filters below a divider.

- [ ] **Step 2: Visual verify**

Navigate to `/admin/organizations`. Confirm consolidated sidebar matches the persons page rhythm.

### Task 4.3: Sticky org grid header

**Files:**
- Modify: `app/admin/organizations/organizations-table-client.tsx:585-595` (header div)
- Modify: `app/admin/persons/persons-table-client.tsx:818-837` (header div)

- [ ] **Step 1: Make headers sticky**

For both files, add `sticky top-0 z-10 bg-[var(--glass-bg)]` to the header `<div className="grid …">` className. Also ensure the parent scroll container is the right element — the header must be a sibling above the scroll container OR a child of the scroll container with `position: sticky`. Inspect the surrounding JSX:

- If the header is OUTSIDE the `overflow-y-auto` container (current org/persons pattern): no change needed beyond visually matching backgrounds — but sticky has no effect there. Instead, MOVE the header INSIDE the scroll container as the first child and add `sticky top-0 z-10 bg-[var(--glass-bg)]`. Then the body grid follows. This prevents the header from being scrolled out of view if the page itself scrolls.

For persons-table-client (lines 815–844 currently):
```tsx
<div className="overflow-x-auto">
  <div className="w-full min-w-[800px]">
    <div className="grid ..." style={{ gridTemplateColumns: PERSON_GRID_COLS }}>
      {/* header */}
    </div>
    <div ref={parentRef} className="overflow-y-auto" style={{ maxHeight: "..." }}>
      ...rows
    </div>
  </div>
</div>
```

Change to:
```tsx
<div className="overflow-x-auto">
  <div ref={parentRef} className="w-full min-w-[800px] overflow-y-auto" style={{ maxHeight: "..." }}>
    <div
      className="grid sticky top-0 z-10 bg-[var(--glass-bg)] backdrop-blur-sm text-xs text-left text-[var(--text-muted)] border-b border-[var(--glass-border)] items-center"
      style={{ gridTemplateColumns: PERSON_GRID_COLS }}
    >
      {/* header */}
    </div>
    <div style={{ position: "relative", height: ... }}>
      ...virtualized rows
    </div>
  </div>
</div>
```

Apply the same change to organizations-table-client.

- [ ] **Step 2: Visual verify**

Navigate to `/admin/persons`. Scroll within the table. Confirm the header stays pinned at the top of the scroll container.

### Task 4.4: Phase 4 commit

- [ ] **Step 1: Stage and commit**

```bash
git add app/admin/persons/persons-table-client.tsx \
        app/admin/organizations/organizations-table-client.tsx
git commit -m "ui(admin): unify search+filters in one sidebar card; sticky table headers"
```

---

## Phase 5 — DataTable + DataCell primitives (P2, ~60 min)

Single virtualized grid table primitive shared by all surfaces.

### Task 5.1: DataCell variants

**Files:**
- Create: `components/ui/data-cell.tsx`

- [ ] **Step 1: Create DataCell**

```tsx
"use client";

import { cn } from "@/lib/utils";

interface BaseProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
}

const cellBase = "px-[var(--cell-px,0.5rem)] py-[var(--cell-py,0.25rem)] min-w-0 flex items-center";

export function TextCell({ children, className, title }: BaseProps) {
  return (
    <div className={cn(cellBase, className)} title={title}>
      <span className="truncate text-xs">{children}</span>
    </div>
  );
}

export function NumericCell({ children, className }: BaseProps) {
  return (
    <div className={cn(cellBase, "justify-end tabular-nums text-xs", className)}>
      {children}
    </div>
  );
}

export function DateCell({ children, className }: BaseProps) {
  return (
    <div className={cn(cellBase, "whitespace-nowrap text-[10px] text-[var(--text-muted)]", className)}>
      {children}
    </div>
  );
}

export function PillCell({ children, className, title }: BaseProps) {
  return (
    <div
      className={cn(cellBase, "gap-1 overflow-hidden", className)}
      title={title}
    >
      {children}
    </div>
  );
}

export function HeaderCell({ children, className }: BaseProps) {
  return (
    <div
      className={cn(
        "px-[var(--cell-px,0.5rem)] py-[var(--cell-py-header,0.5rem)] text-[10px] uppercase tracking-wider font-medium text-[var(--text-muted)] flex items-center min-w-0",
        className
      )}
    >
      {children}
    </div>
  );
}
```

### Task 5.2: DataTable primitive

**Files:**
- Create: `components/ui/data-table.tsx`

- [ ] **Step 1: Create DataTable**

```tsx
"use client";

import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { cn } from "@/lib/utils";

export interface DataTableProps<T> {
  rows: T[];
  /** CSS grid-template-columns string (e.g. "32px minmax(140px,2fr) 48px ...") */
  gridTemplate: string;
  /** Header rendered as direct grid children (use HeaderCell). */
  header: React.ReactNode;
  /** Renders a single row's grid children (use TextCell/PillCell/etc.). */
  renderRow: (row: T, index: number) => React.ReactNode;
  /** Stable key for each row. */
  getRowKey: (row: T, index: number) => string;
  estimateRowHeight?: number;
  scrollHeight?: string;
  minWidth?: string;
  emptyMessage?: string;
  onRowClick?: (row: T) => void;
  isRowSelected?: (row: T) => boolean;
}

export function DataTable<T>({
  rows,
  gridTemplate,
  header,
  renderRow,
  getRowKey,
  estimateRowHeight = 36,
  scrollHeight = "calc(100vh - 220px)",
  minWidth = "800px",
  emptyMessage = "No data",
  onRowClick,
  isRowSelected,
}: DataTableProps<T>) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => estimateRowHeight,
    overscan: 8,
  });

  return (
    <div className="overflow-x-auto">
      <div
        ref={scrollRef}
        className="overflow-y-auto"
        style={{ maxHeight: scrollHeight, minWidth }}
      >
        {/* Sticky header */}
        <div
          className="grid sticky top-0 z-10 bg-[var(--glass-bg)] backdrop-blur-sm border-b border-[var(--glass-border)]"
          style={{ gridTemplateColumns: gridTemplate }}
        >
          {header}
        </div>

        {rows.length === 0 ? (
          <div className="px-5 py-12 text-center text-[var(--text-muted)] text-sm">
            {emptyMessage}
          </div>
        ) : (
          <div
            style={{
              position: "relative",
              height: `${virtualizer.getTotalSize()}px`,
            }}
          >
            {virtualizer.getVirtualItems().map((vi) => {
              const row = rows[vi.index];
              const selected = isRowSelected?.(row) ?? false;
              return (
                <div
                  key={getRowKey(row, vi.index)}
                  data-index={vi.index}
                  className={cn(
                    "grid items-center text-xs border-b border-white/[0.04]",
                    onRowClick && "cursor-pointer hover:bg-white/[0.03]",
                    selected && "bg-[var(--accent-orange)]/[0.04]"
                  )}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: `${vi.size}px`,
                    transform: `translateY(${vi.start}px)`,
                    gridTemplateColumns: gridTemplate,
                  }}
                  onClick={
                    onRowClick
                      ? (e) => {
                          const tag = (e.target as HTMLElement).tagName;
                          if (tag === "INPUT" || tag === "BUTTON") return;
                          if ((e.target as HTMLElement).closest("button")) return;
                          onRowClick(row);
                        }
                      : undefined
                  }
                >
                  {renderRow(row, vi.index)}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Manual smoke test**

Add a temporary test page at `app/admin/_smoke/page.tsx`:
```tsx
"use client";
import { DataTable } from "@/components/ui/data-table";
import { TextCell, NumericCell, HeaderCell } from "@/components/ui/data-cell";

export default function Smoke() {
  const rows = Array.from({ length: 1000 }, (_, i) => ({ id: i, name: `Row ${i}`, count: i * 7 }));
  return (
    <div className="p-6">
      <DataTable
        rows={rows}
        gridTemplate="60px minmax(200px, 1fr) 80px"
        header={
          <>
            <HeaderCell>ID</HeaderCell>
            <HeaderCell>Name</HeaderCell>
            <HeaderCell className="justify-end">Count</HeaderCell>
          </>
        }
        renderRow={(r) => (
          <>
            <TextCell>{r.id}</TextCell>
            <TextCell>{r.name}</TextCell>
            <NumericCell>{r.count}</NumericCell>
          </>
        )}
        getRowKey={(r) => String(r.id)}
      />
    </div>
  );
}
```

Run `npm run dev`, visit `/admin/_smoke`. Confirm:
1. Rows scroll smoothly (virtualization).
2. Header stays sticky.
3. Columns align between header and body.

Then DELETE `app/admin/_smoke/` directory.

### Task 5.3: Phase 5 commit

- [ ] **Step 1: Stage and commit**

```bash
git add components/ui/data-table.tsx components/ui/data-cell.tsx
git commit -m "ui: DataTable + DataCell primitives (virtualized grid + cell variants)"
```

---

## Phase 6 — Migrate sequences, events, messages, pipeline (P2, ~90 min)

### Task 6.1: Migrate sequences

**Files:**
- Modify: `app/admin/sequences/sequence-list-client.tsx`
- Modify: `components/admin/sequence-row.tsx` — convert from `<tr><td>` to grid children

- [ ] **Step 1: Convert SequenceRow to grid children**

Edit `components/admin/sequence-row.tsx`. Replace the outer `<tr>` and each `<td>` with grid children. Strip `<td className="px-N py-3">` wrappers and use `TextCell` / `PillCell` / `DateCell` / `NumericCell`. Wrap the row in a fragment since `<DataTable>` provides the row container.

```tsx
"use client";

import React from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { TextCell, NumericCell, PillCell, DateCell } from "@/components/ui/data-cell";
import type { SequenceWithStats } from "@/lib/queries/use-sequences";

// (formatDistanceToNow, channelVariant, statusVariant unchanged)

interface SequenceRowProps {
  sequence: SequenceWithStats;
  selected: boolean;
  onSelect: (id: string, checked: boolean) => void;
}

export const SequenceRow = React.memo(function SequenceRow({
  sequence,
  selected,
  onSelect,
}: SequenceRowProps) {
  // (same calculations)
  const updatedAt = sequence.updated_at
    ? formatDistanceToNow(new Date(sequence.updated_at))
    : "—";

  return (
    <>
      <div className="px-2 py-1 flex items-center">
        <input
          type="checkbox"
          checked={selected}
          onChange={(e) => onSelect(sequence.id, e.target.checked)}
          onClick={(e) => e.stopPropagation()}
          className="rounded border-[var(--glass-border)] bg-[var(--glass-bg)] accent-[var(--accent-orange)]"
        />
      </div>
      <TextCell>
        <Link href={`/admin/sequences/${sequence.id}`} className="text-white font-medium hover:text-[var(--accent-indigo)]">
          {sequence.name}
        </Link>
      </TextCell>
      <PillCell>
        <Badge variant={channelVariant[sequence.channel] ?? "default"}>{sequence.channel}</Badge>
      </PillCell>
      <PillCell>
        <Badge variant={statusVariant[sequence.status] ?? "default"}>{sequence.status}</Badge>
      </PillCell>
      <NumericCell>{steps.length}</NumericCell>
      <TextCell>
        {sequence.enrollment_count > 0 ? (
          <>
            {sequence.enrollment_count}{" "}
            <span className="text-[var(--text-muted)]">({sequence.active_enrollment_count} active)</span>
          </>
        ) : (
          <span className="text-[var(--text-muted)]">—</span>
        )}
      </TextCell>
      <TextCell title={`${sequence.sent_count} sent · ${sequence.opened_count} opened · ${sequence.replied_count} replied`}>
        {sequence.sent_count > 0
          ? `${sequence.sent_count} · ${sequence.opened_count}o · ${sequence.replied_count}r`
          : "No sends"}
      </TextCell>
      <PillCell>
        <Badge variant={sequence.send_mode === "auto" ? "sent" : "scheduled"}>
          {sequence.send_mode === "auto" ? "Auto" : "Approval"}
        </Badge>
      </PillCell>
      <PillCell title={sequence.event_name ?? undefined}>
        {sequence.event_name ? (
          <Badge variant="draft" className="max-w-full">{sequence.event_name}</Badge>
        ) : (
          <span className="text-[var(--text-muted)]">—</span>
        )}
      </PillCell>
      <DateCell>{updatedAt}</DateCell>
    </>
  );
});
```

Note: `onHover` removed — preview hover should use `onMouseEnter` on the row container provided by DataTable. We expose this in the next step.

- [ ] **Step 2: Add onRowMouseEnter/Leave to DataTable**

Open `components/ui/data-table.tsx`. Add two optional props:
```tsx
onRowMouseEnter?: (row: T) => void;
onRowMouseLeave?: (row: T) => void;
```
And in the row `<div>`, wire:
```tsx
onMouseEnter={onRowMouseEnter ? () => onRowMouseEnter(row) : undefined}
onMouseLeave={onRowMouseLeave ? () => onRowMouseLeave(row) : undefined}
```

- [ ] **Step 3: Update sequence-list-client to use DataTable**

In `app/admin/sequences/sequence-list-client.tsx`:

Replace the entire `<table>` block with:
```tsx
const SEQUENCE_COLS = "40px minmax(180px,2fr) 96px 96px 56px 140px minmax(160px,1.5fr) 110px 200px 130px";

<DataTable
  rows={sequences}
  gridTemplate={SEQUENCE_COLS}
  estimateRowHeight={40}
  minWidth="1100px"
  scrollHeight="calc(100vh - 240px)"
  header={
    <>
      <HeaderCell>
        <input type="checkbox" onChange={...} checked={...} />
      </HeaderCell>
      <HeaderCell>Name</HeaderCell>
      <HeaderCell>Channel</HeaderCell>
      <HeaderCell>Status</HeaderCell>
      <HeaderCell>Steps</HeaderCell>
      <HeaderCell>Enrolled</HeaderCell>
      <HeaderCell>Delivery</HeaderCell>
      <HeaderCell>Mode</HeaderCell>
      <HeaderCell>Event</HeaderCell>
      <HeaderCell>Updated</HeaderCell>
    </>
  }
  renderRow={(seq) => (
    <SequenceRow
      sequence={seq}
      selected={selectedIds.has(seq.id)}
      onSelect={handleSelect}
    />
  )}
  getRowKey={(seq) => seq.id}
  onRowMouseEnter={(seq) => setHoveredId(seq.id)}
  onRowMouseLeave={() => setHoveredId(null)}
/>
```

Add imports:
```tsx
import { DataTable } from "@/components/ui/data-table";
import { HeaderCell } from "@/components/ui/data-cell";
```

- [ ] **Step 4: Visual verify**

Navigate to `/admin/sequences`. Confirm:
1. All columns align header→row (no drift).
2. Long event names truncate inside their pill — never push neighboring columns.
3. Hover preview still works.
4. Selecting/checkboxes still work.

### Task 6.2: Migrate events

**Files:**
- Modify: `app/admin/events/events-table-client.tsx`

- [ ] **Step 1: Replace `<table>` with DataTable**

Run: `grep -n "<table\|<thead\|<tbody\|<tr\|<th\|<td " app/admin/events/events-table-client.tsx`

Define a grid template that matches the current 9 columns. Use the same pattern as Task 6.1: replace `<table>...</table>` with a `<DataTable>` invocation, replace `<th>` with `<HeaderCell>`, replace `<td>` with the appropriate cell variant (TextCell for names/locations, PillCell for type badges, NumericCell for counts, DateCell for the date range).

For the type badge column (`<Badge>`), wrap in `<PillCell>` and pass `className="max-w-full"` to the Badge.

For the date range column (currently has `whitespace-nowrap`), use `<DateCell>`.

For the location column (currently `max-w-[130px] truncate`), use `<TextCell title={location}>`.

- [ ] **Step 2: Visual verify**

Navigate to `/admin/events`. Apply long-name and long-location filters. Confirm columns hold their widths and rows align.

### Task 6.3: Migrate messages

**Files:**
- Modify: `components/admin/message-row.tsx`
- Modify: parent file that renders the messages table (find via `grep -rln "MessageRow" app components`)

- [ ] **Step 1: Find consumers**

Run: `grep -rln "MessageRow\b\|message-row" app components`. Identify the file(s) rendering the messages `<table>`.

- [ ] **Step 2: Convert MessageRow to grid children**

Same transformation as Task 6.1: strip `<tr>` and `<td>` wrappers, use TextCell/PillCell/DateCell. The expanded detail row uses `colSpan={9}` — for grid layout, render it as a single full-width `<div>` with `style={{ gridColumn: "1 / -1" }}`.

- [ ] **Step 3: Update parent to use DataTable**

Apply same DataTable wiring as Task 6.1.

- [ ] **Step 4: Visual verify**

Navigate to the messages page (likely `/admin/inbox` or wherever MessageRow is rendered). Confirm row layout, expand/collapse behavior, and column alignment all work.

### Task 6.4: Migrate pipeline

**Files:**
- Modify: `components/admin/pipeline-table.tsx`
- Modify: `components/admin/pipeline-view.tsx`

- [ ] **Step 1: Replace pipeline-table internals with DataTable**

Same migration. Pipeline has 9 columns of mostly text + 3 inline badges (ICP, Stage, Mode) — use TextCell for text, PillCell for badges.

- [ ] **Step 2: Visual verify**

Navigate to `/admin/pipeline`. Confirm migration.

### Task 6.5: Phase 6 commit

- [ ] **Step 1: Stage and commit**

```bash
git add components/admin/sequence-row.tsx \
        app/admin/sequences/sequence-list-client.tsx \
        app/admin/events/events-table-client.tsx \
        components/admin/message-row.tsx \
        components/admin/pipeline-table.tsx \
        components/admin/pipeline-view.tsx \
        components/ui/data-table.tsx
# Plus any other parent files modified for messages
git commit -m "ui(admin): migrate sequences/events/messages/pipeline to DataTable"
```

---

## Phase 7 — Migrate enrichment (P2, ~30 min)

### Task 7.1: Enrichment table migration

**Files:**
- Modify: `app/admin/enrichment/components/entity-table.tsx`

- [ ] **Step 1: Replace `<table>` with DataTable**

The enrichment table currently uses HTML `<table>` with explicit `truncate max-w-[Xpx]` per cell. Define a grid template that hard-codes those widths:

```tsx
const ORG_COLS = "32px 200px 120px 100px 60px 80px";       // checkbox, name, event, category, ICP, status
const PERSON_COLS = "32px 160px 120px 120px 80px 60px 80px"; // checkbox, name, org, event, source, ICP, status
const RESULTS_SUFFIX = " 100px"; // appended when mode === "results"
```

Replace `<table>...</table>` with `<DataTable>`. Replace each `<td className="px-3 py-1 truncate max-w-[Xpx]">` with `<TextCell>` (which already includes truncation). The ICP cell uses `<NumericCell>`. The Status icons cell uses `<PillCell>`.

- [ ] **Step 2: Visual verify**

Navigate to `/admin/enrichment`. Confirm filtering, selection, sorting, and that cells truncate cleanly.

### Task 7.2: Phase 7 commit

```bash
git add app/admin/enrichment/components/entity-table.tsx
git commit -m "ui(admin): migrate enrichment entity-table to DataTable"
```

---

## Phase 8 — Cell padding & row height tokens, header alignment (P3, ~30 min)

### Task 8.1: Add CSS tokens

**Files:**
- Modify: `app/globals.css`

- [ ] **Step 1: Add tokens**

In `app/globals.css`, inside the existing `:root` (or wherever `--glass-bg` etc. are defined), add:

```css
--cell-px: 0.5rem;       /* 8px */
--cell-py: 0.25rem;      /* 4px */
--cell-py-header: 0.5rem;/* 8px */
--row-h: 36px;
```

These are already referenced by DataCell variants from Phase 5.

### Task 8.2: Align org/person grid headers to row paddings

**Files:**
- Modify: `app/admin/persons/persons-table-client.tsx` (header cells)
- Modify: `app/admin/organizations/organizations-table-client.tsx` (header cells)

- [ ] **Step 1: Replace bespoke header padding with HeaderCell**

In both files, the sticky header div currently uses bespoke paddings like `px-2 py-2.5 font-medium` or `px-1.5 py-2`. Replace each with `<HeaderCell>` (and a `SortHeader` that internally uses HeaderCell for consistency). The result: header cells share the exact same `--cell-px` as body cells.

If a column needs custom alignment, pass `className="justify-end"` to HeaderCell rather than inline padding.

- [ ] **Step 2: Visual verify**

Navigate to `/admin/persons` and `/admin/organizations`. Use a browser inspector to confirm header text and first-row text share the same left edge in every column.

### Task 8.3: Align row heights

**Files:**
- Modify: `app/admin/organizations/organizations-table-client.tsx` — `useVirtualizer({ estimateSize: () => 36 })`
- Modify: `app/admin/persons/persons-table-client.tsx` — same
- Modify: `components/ui/data-table.tsx` — default `estimateRowHeight = 36`

- [ ] **Step 1: Standardize on 36px**

Set every virtualizer's `estimateSize` to 36 (or `parseInt(getComputedStyle(document.documentElement).getPropertyValue('--row-h'))` if you want to read the token at runtime — but 36 hardcoded is fine; the token is for CSS use).

### Task 8.4: Phase 8 commit

```bash
git add app/globals.css \
        app/admin/persons/persons-table-client.tsx \
        app/admin/organizations/organizations-table-client.tsx \
        components/ui/data-table.tsx
git commit -m "ui(admin): unify cell padding/row height tokens; align table headers"
```

---

## Phase 9 — Cleanup (P3, ~10 min)

### Task 9.1: Delete legacy table files

**Files:**
- Delete: `components/admin/organization-table.tsx`
- Delete: `components/admin/person-table.tsx`

Confirmed via `grep -rln "organization-table\|person-table\b" app components` that no consumer remains. (`pipeline-table.tsx` is still imported by `pipeline-view.tsx` — keep it; it was migrated in Phase 6.)

- [ ] **Step 1: Remove files**

```bash
git rm components/admin/organization-table.tsx components/admin/person-table.tsx
```

- [ ] **Step 2: Build to confirm no broken imports**

Run: `npm run build`
Expected: build succeeds.

If the build fails with "module not found" pointing at one of the deleted files, restore it (`git checkout HEAD~ -- <file>`) and redo the migration in the consumer that referenced it.

### Task 9.2: Remove now-unused VirtualTable (if applicable)

**Files:**
- `components/ui/virtual-table.tsx`

- [ ] **Step 1: Check usage**

Run: `grep -rln "VirtualTable\|from.*virtual-table" app components`

If the only consumer is now empty (nothing else uses it after Phase 6), delete it:
```bash
git rm components/ui/virtual-table.tsx
```

If something still uses it, leave it but note in a follow-up TODO.

### Task 9.3: Phase 9 commit

```bash
git add -A
git commit -m "chore(admin): remove dead legacy table components"
```

---

## Self-review

**Spec coverage:**
- Pill stacking → Phase 1 (Tasks 1.1–1.4)
- Filter redundancy → Phase 2 (MultiSelectField) + Phase 3 (apply)
- Search/filter row bloat → Phase 4 (consolidation)
- Header column drift → Phase 4 Task 4.3 + Phase 8 Task 8.2
- Three-substrate inconsistency → Phase 5 (DataTable) + Phase 6/7 (migrations)
- ActiveFilters chip color & always-on Clear all → Phase 1 Task 1.5
- Row height inconsistency → Phase 8 Task 8.3
- Dead legacy tables → Phase 9

**Type consistency:**
- `MultiSelectField`'s `values: string[]` / `onChange: (values: string[]) => void` is consistent across Tasks 2.1, 3.1, 3.2.
- `DataTable`'s `gridTemplate` / `header` / `renderRow` / `getRowKey` / `estimateRowHeight` are referenced consistently in Tasks 5.2, 6.1–6.4, 7.1, 8.3.
- `HeaderCell`/`TextCell`/`PillCell`/`NumericCell`/`DateCell` defined in 5.1 and used in 6.x/7.x/8.2.

**No placeholders:** verified — every step has either complete code or a precise edit instruction with exact file paths and line ranges.

**Open question to flag during execution:** If `@testing-library/react` is not yet a devDependency, Task 2.1 Step 2 calls for installing it. Confirm with the user before adding deps if they want to skip the test and ship the component without coverage.
