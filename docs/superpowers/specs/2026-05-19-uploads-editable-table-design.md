# Uploads Editable Table Redesign

**Date:** 2026-05-19
**Status:** Approved (design)
**Scope:** `/admin/uploads`

## Summary

Rework the uploads page so a single editable table is the primary surface. Users land on an empty table scoped to either Persons or Organizations, then either bulk-paste rows, upload a CSV, or type rows directly. Column headers are field-binding dropdowns (CSV column → canonical field). On submit, the page detects event names that don't yet exist and prompts to create them before insertion.

## Motivation

The current page has three loosely connected sections (dropzone → column mapper → import config) and forces every import through CSV. Users can't fix typos without re-uploading, can't bulk-paste, and the field list mixes person and organization fields. The "import as both" option ambiguates dedupe logic and leaks org-rollup columns into the persons field list.

This redesign unifies the data shape (`{columns, rows}`) across all three entry paths (empty, CSV, paste), splits field sets by entity, and turns the column-mapping step into the headers of a directly-editable preview table.

## Non-Goals

- No changes to the underlying persons / organizations / events schema.
- No changes to the upload history table or `uploads` storage rows.
- No background-job/queueing for imports — keep the current synchronous server action model.
- No CSV export. Read-only of upload history continues as-is.

## User-Facing Flow

### Landing (empty table)

1. Page opens with `[Persons | Organizations]` toggle at top, defaulted to Persons.
2. Below the toggle: a toolbar with `[+ Column]`, `[Upload CSV]`, `[Reset table]`, duplicate-handling select, and `[Import N rows]` (disabled until something is staged). There is **no** `+ Row` button — the table maintains a persistent trailing empty row (the *ghost row*) and auto-expands on paste or when the last row gets content.
3. Empty editable table with 5 blank rows and a default column set:
   - **Persons default columns:** `full_name`, `email`, `linkedin`, `title`, `event`
   - **Organizations default columns:** `name`, `website`, `category`, `linkedin_url`, `event`
4. Each column header is a `<GlassSelect>` populated with the canonical fields for the current mode plus `— Discard —`. Subtle vertical separators (`border-l border-[var(--glass-border)]/40`) run between columns so empty columns are visually distinct.

### CSV upload

- `[Upload CSV]` opens the existing `FileDropzone`, or files can be dropped on the table itself.
- Papaparse parses the CSV; rows fill the table body, headers fill the column dropdowns.
- Auto-match (existing `AUTO_MATCH` map) pre-selects field bindings; unmatched headers stay set to `— Discard —` and render the original header string greyed out so the user knows what they're skipping.

### Bulk paste

- Pasting multi-line / tab-delimited text into any cell splatters the values across cells starting from the focused cell (rows × columns expanding as needed).
- Paste into an empty table without a focused cell seeds the entire table from `(0, 0)`.
- Single-cell paste (no tabs/newlines) behaves like a normal text input paste.

### Ghost row invariant

The table maintains a "ghost row" invariant: there is always exactly one trailing empty row. `ensureGhostRow()` wraps every state mutation (cell edit, column add/remove, row remove, paste expansion). When typing into the last row makes it non-empty, a fresh empty row is appended. The ghost row renders at reduced opacity and hides its Remove control (removing it would just re-add it). This removes the need for a `+ Row` button — the table grows organically as data arrives.

### Switching modes

- Toggling `Persons ↔ Organizations` with staged rows shows a confirmation: "Switch mode? Column bindings will reset." Confirm clears the column field bindings (rows + raw text are preserved so the user can re-bind), since field IDs don't transfer across entity types.

### Submit

1. Drop rows where every mapped (non-discarded) cell is empty.
2. Validate per-entity required fields (Persons: at least one of `full_name`, `email`; Organizations: `name`).
3. Scan the `event` column (if mapped). Trim + lowercase to dedupe values. Query `events` table by case-insensitive name match.
4. If any event values don't match an existing event, open the **Event Detect Modal** (see below).
5. Once events are resolved, call the entity-specific server action with `{rows, duplicateHandling, eventMap}`.
6. Show result inline below the toolbar (created / skipped / errors) — same shape as today.
7. Refresh upload history.

### Event Detect Modal

For each unknown event name, one row with three radio options:

- **Create event** (default) — optional `date_start` (date input) next to the radio.
- **Map to existing event** — `<GlassSelect>` of all events.
- **Skip** — affected rows will be inserted with `event_id = null`.

Modal footer: `[Cancel]` `[Confirm and import]`. Cancel returns to the table with no changes. Confirm batch-inserts the "Create" choices, builds the `{eventName → eventId | null}` map, then proceeds with the import.

## Architecture

### Data model (client-side)

```ts
type ImportColumn = {
  id: string;            // stable id for React keys
  field: string;         // canonical field id, or "" for discarded
  originalHeader?: string; // CSV header if loaded from CSV
};

type ImportTableState = {
  mode: "persons" | "organizations";
  columns: ImportColumn[];
  rows: string[][];        // rows[r][c] aligns with columns[c]
};
```

All three entry paths normalize into this shape:
- Empty → defaults from the mode's field set
- CSV → `columns` from parsed headers + auto-match, `rows` from parsed body
- Paste → either expands an existing table or seeds it from clipboard data

### Field sets (split by mode)

`lib/uploads/field-sets.ts` (new):

```ts
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
  { id: "organization_name", label: "Organization (name only, links by name)" },
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
```

Auto-match map (`lib/uploads/auto-match.ts`) keyed by mode — header string → field id.

### Components

- **`app/admin/uploads/page.tsx`** — owns `ImportTableState`, mode toggle, toolbar, result strip, history. Coordinates between table, CSV parser, and submit.
- **`components/admin/import-table.tsx`** (new) — the editable table. Props: `{state, onChange, fieldSet}`. Handles:
  - Header dropdowns + per-column remove
  - Editable cells + per-row remove
  - Paste handler (TSV / CSV detection via `\t` vs `,`)
  - Empty-row drop on blur
- **`components/admin/event-detect-modal.tsx`** (new) — props: `{unknownEvents: string[], existingEvents: Event[], onConfirm(eventMap), onCancel}`. Owns per-row choice state.
- **`components/admin/file-dropzone.tsx`** — reused; now triggered by toolbar button and overlaid on the table for drag-and-drop.
- **Retire:** `components/admin/column-mapper.tsx` (its preview-table + mapping UI move into `import-table.tsx`).

### Server actions

`app/admin/uploads/actions.ts` becomes:

```ts
export async function importPersons(
  rows: PersonRow[],
  config: { duplicateHandling, eventMap: Record<string, string | null> },
  filename: string,
): Promise<ImportResult>;

export async function importOrganizations(
  rows: OrgRow[],
  config: { duplicateHandling, eventMap: Record<string, string | null> },
  filename: string,
): Promise<ImportResult>;

export async function findOrCreateEvents(
  decisions: Array<
    | { name: string; mode: "create"; date_start?: string }
    | { name: string; mode: "map"; eventId: string }
    | { name: string; mode: "skip" }
  >,
): Promise<Record<string, string | null>>;  // name → eventId | null

export async function listUnknownEvents(
  names: string[],
): Promise<{ known: Record<string, string>; unknown: string[] }>;
```

Both `importPersons` and `importOrganizations`:
1. Insert an `uploads` row (status `processing`).
2. Iterate rows; for each, look up the row's event name in `eventMap` to get `event_id`.
3. Apply duplicate handling (skip/update/create_new). Persons key on email; orgs key on `name` (case-insensitive trim — current behavior).
4. Create `event_participations` rows for any non-null event_id (existing behavior, just driven per-row now).
5. Update the `uploads` row with results.

Person rows with `organization_name` set: look up org by name, create stub if missing (matches existing CSV behavior so we don't lose persons whose company isn't in the system yet).

## Data Flow

```
[mode toggle / + Column / CSV upload / paste / typing into ghost row]
    │
    ▼
ImportTableState  ──(edit)──►  ImportTableState
    │
    ▼ [Submit]
listUnknownEvents(rowEventNames)
    │
    ▼
if any unknown → EventDetectModal → findOrCreateEvents → eventMap
else            → eventMap built from known matches
    │
    ▼
importPersons | importOrganizations  (per mode)
    │
    ▼
result + refreshed history
```

## Error Handling

- **Parse errors** (CSV): surface inline above the table with row count and first error message; do not load partial data.
- **Validation errors** at submit: list rows with missing required fields, scroll first offender into view, do not call the server action.
- **Event creation failures**: modal stays open with per-row error states.
- **Server action errors**: same as today — errors array in result; surface count + first three messages, full list in upload history detail (already in `uploads.errors` JSONB).

## Testing

- Unit: `PERSON_FIELDS` / `ORGANIZATION_FIELDS` are disjoint where intended, both contain `event`. Auto-match returns expected canonical ids for common headers per mode.
- Unit: paste handler — single cell, multi-cell TSV, multi-cell CSV, paste into empty table.
- Unit: empty-row + empty-cell filtering on submit.
- Unit: `findOrCreateEvents` produces correct map for create/map/skip mixes.
- Integration (manual via dev server): CSV → preview → fix typo inline → submit. Empty table → paste 20 rows → submit. Submit with unknown event → modal → confirm → import. Mode switch with staged rows → confirmation → reset bindings.

## Open Calls (from brainstorming, approved)

- "Import as both" is dropped; pick one mode per import.
- Empty editable table is the default view; CSV upload is a toolbar action and a drop target on the table.
- Event resolution is per-row (driven by the `event` column), not file-wide.
- `duplicateHandling` (skip / update / create_new) is retained as-is in the submit toolbar.
- `column-mapper.tsx` is retired; preview behavior moves into the new `import-table.tsx`.
