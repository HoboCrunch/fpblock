# List Builder from Filters — Design

**Date:** 2026-04-28
**Status:** Spec
**Owners:** Evan

## Problem

`/admin/lists` is the canonical way to bucket persons for downstream features (enrichment, /persons views, sequences, pipeline). Today the lists detail page only supports adding members by typing names into a search modal. With ~thousands of persons, this scales poorly and ignores the rich filter set already implemented on `/admin/persons` (events, ICP score range, seniority, department, source, contact-channel presence, enrichment status, event-relation toggle, correlation type, search, etc.).

Goal: let users build and grow lists by applying filters and bulk-adding the resulting matches, while keeping every downstream consumer reading concrete `person_list_items` rows unchanged.

## Approach (decided)

Hybrid. Lists keep concrete membership rows (`person_list_items`) and gain an **optional saved filter** (`person_lists.filter_rules`).

- Filter never auto-mutates membership.
- "Add matches to list" is an explicit, idempotent snapshot action.
- Re-running a saved filter adds **net-new** matches only; never removes.
- Filter UX lives **inside the list detail page** (left sidebar + tabs), not in a separate builder.

## Data model

```sql
ALTER TABLE person_lists ADD COLUMN filter_rules jsonb;
```

`filter_rules` is `null` for plain manual lists. When populated, it is a serialized `PersonFilterRules` object. No changes to `person_list_items`.

```ts
type PersonFilterRules = {
  search?: string;
  events?: string[];                // event ids — match if any personEvent.event_id ∈ list
  hasOrg?: "yes" | "no";
  correlationType?: string[];       // speaker_sponsor | speaker_only | sponsor_contact | org_sponsor | none
  seniority?: string[];
  department?: string[];
  source?: string[];
  hasEmail?: boolean;
  hasLinkedin?: boolean;
  hasPhone?: boolean;
  hasTwitter?: boolean;
  hasTelegram?: boolean;
  enrichmentStatus?: string[];      // none | in_progress | complete | failed
  icpMin?: number;
  icpMax?: number;
  eventScope?: { eventId: string; speaker: boolean; orgAffiliated: boolean };
};
```

Undefined keys = no constraint. Empty arrays are normalized to `undefined` on save.

## Architecture — extracted filter module

The filter logic in `app/admin/persons/persons-table-client.tsx` is currently inline (state + sidebar UI + filtering). Extract so both `/admin/persons` and `/admin/lists/[id]` can consume it.

**New files:**

- `lib/filters/person-filters.ts`
  - `type PersonFilterRules` (above).
  - `defaultPersonFilterRules(): PersonFilterRules` — returns `{}`.
  - `applyPersonFilters(rows, rules, deps): PersonRow[]` — pure function. `deps` carries precomputed maps that the existing /persons code already builds (correlations, eventPersonIds for event scoping). Sort is **not** part of this function.
  - `personFilterRulesToActiveFilters(rules, options): { key, label, value }[]` — produces the chips the existing `<ActiveFilters />` component renders.
  - `removeFilterKey(rules, key): PersonFilterRules`.
  - `clearAllFilters(): PersonFilterRules`.

- `components/admin/person-filter-sidebar.tsx`
  - Pure controlled component. Props: `rules`, `onChange(rules)`, `eventOptions`, `sourceOptions`, `seniorityOptions`, `departmentOptions`, plus `eventScope` controls (selected event id + relation toggles) since those drive a query hook.
  - Renders the same `<FilterGroup>` blocks already in /persons (`Relationships`, `Profile`, `Contact`, `Enrichment`).
  - Owns no filtering logic — only emits state changes.

**Refactor:**

- `app/admin/persons/persons-table-client.tsx` swaps inline `useState`s and the inline `useMemo` filter loop for `useState<PersonFilterRules>` + `<PersonFilterSidebar />` + `applyPersonFilters(rows, rules, deps)`. Sort and selection state stay where they are. `<ActiveFilters />` consumes `personFilterRulesToActiveFilters(rules, …)`. Net behavior on /persons unchanged.

- `app/admin/persons/page.tsx`'s row-loading block (persons + event participations + person-org links + org events + interactions + dropdown options) is factored into `lib/data/load-person-rows.ts` exporting `loadPersonRows(supabase): { rows, eventOptions, sourceOptions, seniorityOptions, departmentOptions }`. /persons calls it; /lists/[id] calls it; identical row shape.

## List detail page UX

Layout:

```
[← Back to Lists]
[List name (inline edit)]    [Save filter]  [Add by name]
[Description (inline edit)]

Left sidebar                Right pane
─────────────               ─────────────────────────────────
Search…                     [Members (N)]  [Matches]   ← tabs
Relationships
Profile                     Members tab (default):
Contact                       — Members of the list.
Enrichment                    — Filters scope WITHIN members.
                              — Existing row UI; "Remove from list" stays.
Active filters →
chip strip                  Matches tab:
                              — Persons across DB matching filters.
                              — Rows in list: "✓ in list" + disabled.
                              — Others: checkbox + bulk select.
                              — Footer: [Add N to list] (snapshot).
                              — Empty filters → "Apply filters to find matches."
```

### State

- `rules: PersonFilterRules` — local; hydrated from `list.filter_rules` on mount.
- `tab: "members" | "matches"` — defaults to `"members"`.
- `selectedToAdd: Set<string>` — only meaningful in Matches tab.
- All persons rows loaded once via `loadPersonRows()`; the right pane derives its dataset from `tab` + `rules`.

### Members tab

- Dataset: `allRows.filter(r => memberIds.has(r.id))`.
- `applyPersonFilters(memberRows, rules, deps)` for the visible set.
- Row component: existing `PersonTableRow` (or a slim variant) with a "Remove from list" affordance.

### Matches tab

- Dataset: `applyPersonFilters(allRows, rules, deps)`.
- Each row tagged "in list" if `memberIds.has(r.id)`.
- Bulk-add bar: shows `selectedToAdd.size` selected, `[Add N to list]` calls `addMatchesToList(listId, ids)`.
- Convenience: "Select all not-in-list matches" toggles `selectedToAdd` to all match ids minus members.
- After successful add: refetch list items, clear `selectedToAdd`.

### Saved filter

- A "Saved filter" chip renders near the title when `list.filter_rules` is non-null.
- `[Save filter]` button persists current `rules` to `person_lists.filter_rules` via `saveListFilter`. Disabled when `rules` is empty and nothing is saved.
- The chip has a small "Clear" affordance to delete the saved filter (sets `filter_rules` to `null`); does **not** clear the in-memory `rules`.
- Re-run flow is implicit: open list → sidebar is pre-populated → switch to Matches → see net-new count → click `[Add N to list]`.

### "Add by name" fallback

- The existing `AddMembersPanel` modal (name/email search + ICP-sorted results) is reachable via the `[Add by name]` button. Unchanged.

### Empty states

- List with 0 members, no rules: Members tab says "No members yet — switch to Matches to find people, or click Add by name."
- Matches tab with empty rules: "Apply filters to find matches."
- Matches tab, rules applied, 0 results: "No persons match these filters."
- Matches tab, all results already in list: shows table with all rows disabled; bulk-add button hidden; helper text "Every match is already in this list."

## Server actions

Extend `app/admin/lists/actions.ts`:

```ts
getLists()                                       // unchanged signature, now also selects filter_rules
saveListFilter(listId: string, rules: PersonFilterRules | null)
  → updates person_lists.filter_rules; returns { success, error }
```

Reuse:
- `addToList(listId, personIds[])` — used as the "Add N to list" implementation. Already idempotent via `(list_id, person_id)` unique constraint with `ignoreDuplicates: true`.
- `removeFromList`, `getListItems`, `updateList`, `deleteList`, `createList` — unchanged.

No new API route. Server actions only.

## Component changes summary

**New:**
- `lib/filters/person-filters.ts`
- `components/admin/person-filter-sidebar.tsx`
- `lib/data/load-person-rows.ts`
- `supabase/migrations/0NN_person_lists_filter_rules.sql` (next free migration number)

**Modified:**
- `app/admin/lists/page.tsx` — list detail becomes the canvas described above.
- `app/admin/lists/actions.ts` — add `saveListFilter`, extend `getLists` select.
- `app/admin/persons/page.tsx` — call `loadPersonRows`.
- `app/admin/persons/persons-table-client.tsx` — adopt extracted filter module + sidebar.

**Untouched:**
- `person-table-row.tsx`, `person-preview-panel.tsx`, table virtualization, sort logic.
- `AddToListDropdown` (still works against the new actions).
- All downstream consumers of `person_list_items`.

## Out of scope

- Boolean OR / NOT across filter groups — everything is AND, parity with /persons.
- Smart-list auto-evaluation on read (membership stays concrete rows).
- Org/company lists.
- Filtering by membership in another list (e.g. "in list X, not in list Y").
- Soft-deleting filter rules with audit trail.
- Sharing / permissions on lists.

## Validation

- /persons keeps every existing filter behavior after refactor (smoke test: each filter type still narrows rows).
- A `person_lists` row with no `filter_rules` opens with an empty sidebar and behaves like today's lists.
- `AddToListDropdown` on /persons continues to add selected persons to a chosen list.
- Adding the same person twice via Matches → `[Add N to list]` is a no-op (unique constraint).
- Saving an empty `rules` object as a filter is rejected client-side (button disabled).
- Clearing a saved filter sets the column to `null` and removes the chip without clearing the in-memory rules.
- Members tab is the default view when opening any list, even one with a saved filter.
