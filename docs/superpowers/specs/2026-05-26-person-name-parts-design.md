# Person name parts (first/last) — design

**Date:** 2026-05-26
**Status:** Approved (design)

## Problem

`persons.full_name` is `NOT NULL`, but `first_name`/`last_name` are nullable and not
always populated. Template rendering (`lib/template-renderer.ts`,
`{person.first_name}`) produces empty output when `first_name` is null — observed
in the "Test Send" sequence where the recipient (`Evan Steinhilb`) had
`first_name = null`, rendering the greeting as `"Hey "`.

Scale: of **3,803** persons, only **1** has `first_name IS NULL` with a present
`full_name`. The existing import/enrichment paths populate names almost always;
the gap is rare but real, and nothing guarantees it across *all* creation paths
(uploads, the enrichment pipelines, scripts, MCP, raw SQL, future code).

A `splitName()` heuristic already exists in `scripts/seed-crm.ts:205` and inline
copies in `lib/enrichment/apollo-people.ts:231` and
`lib/enrichment/person-pipeline.ts:306` (the latter two split only to feed
Apollo's match API, not to persist back to `persons`).

## Goal

A **durable** mechanism that fills `first_name`/`last_name` from `full_name` for
every future person regardless of insertion path, plus a one-time backfill of
existing rows — without overwriting names that are already set.

## Approach (chosen): Postgres `BEFORE INSERT/UPDATE` trigger + backfill

Rejected alternatives:
- **Shared TS util wired into every creation path** — higher surface, must wire
  every current and future path, still bypassable by direct SQL/MCP. Marginal
  gain given only 1/3803 rows slipped through.
- **`STORED` generated columns** — would overwrite the 3,800+ rows that already
  have correct first/last with naive splits. Data loss. Rejected.

### Migration `035_person_name_parts.sql`

1. **Trigger function `fill_person_name_parts()`** (PL/pgSQL, `RETURNS trigger`):
   - Acts only when `NEW.first_name IS NULL AND NEW.last_name IS NULL AND
     NEW.full_name IS NOT NULL`. Otherwise returns `NEW` unchanged.
   - Normalize: collapse internal whitespace and trim
     (`regexp_replace(btrim(full_name), '\s+', ' ', 'g')`).
   - `first_name` = first token; `last_name` = remainder after the first token,
     or `NULL` if there is only one token. If the normalized name is empty, leave
     both null.
   - Mirrors the existing `splitName()` heuristic (first token / rest).

2. **Trigger** `trg_fill_person_name_parts` — `BEFORE INSERT OR UPDATE ON persons
   FOR EACH ROW`. Idempotent install: `DROP TRIGGER IF EXISTS … ; CREATE TRIGGER …`.
   `CREATE OR REPLACE FUNCTION` for the function.

3. **Backfill** — a single `UPDATE persons SET first_name = …, last_name = …`
   with the same expressions, scoped to
   `first_name IS NULL AND last_name IS NULL AND full_name IS NOT NULL`. Fixes the
   one existing row (Evan).

### Policy decisions

- **Fill-only-when-both-null.** Preserves accurate Apollo-provided and
  hand-edited names. Consistent with the inline `!first_name && !last_name` guard
  already used in `apollo-people.ts`.
- **No re-derivation on later `full_name` edits** when a row already has names —
  conservative; avoids clobbering. (Confirmed with user.)

### Known limitations (intentionally out of scope — YAGNI)

- No title/suffix stripping (`Dr.`, `Jr.`, `PhD`).
- No special handling of name particles (`van`, `de la`) — first token / rest.

These match current behavior; can revisit if real data shows it matters.

## Verification

Apply migration to the local DB, then:
1. Insert a throwaway person with only `full_name = 'Ada Lovelace'` → expect
   `first_name = 'Ada'`, `last_name = 'Lovelace'`.
2. Insert with explicit `first_name`/`last_name` → values preserved (trigger no-op).
3. Insert mononym `full_name = 'Cher'` → `first_name = 'Cher'`, `last_name = NULL`.
4. Insert name with extra whitespace `'  Mary   Anne  Smith '` →
   `first_name = 'Mary'`, `last_name = 'Anne Smith'`.
5. Confirm the backfilled `Evan Steinhilb` row now has `Evan` / `Steinhilb`.
6. Clean up throwaway rows.

No app code changes; existing `splitName()`/inline copies are left as-is (they
serve Apollo matching, a separate concern). Optional future cleanup: extract one
shared TS `splitName` util to dedupe — not in this scope.
