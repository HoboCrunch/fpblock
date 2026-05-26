-- 035_person_name_parts.sql
-- Durable fill of persons.first_name / persons.last_name from persons.full_name.
--
-- Strategy:
--   • A BEFORE INSERT OR UPDATE trigger derives name parts whenever both
--     first_name and last_name are NULL and full_name is not, mirroring the
--     JS heuristic in lib/enrichment/apollo-people.ts (~line 231):
--       first token / rest of string.
--   • The trigger is a no-op when either name part is already populated,
--     preserving accurate Apollo-provided or hand-edited values.
--   • A one-time backfill UPDATE covers the existing rows that already have
--     null name parts.
--   • Out of scope: title/suffix stripping, particle handling.

-- ============================================================
-- 1. Trigger function
-- ============================================================

-- No GRANT needed: invoked by the trigger engine, not called directly.
CREATE OR REPLACE FUNCTION fill_person_name_parts()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_normalized text;
  v_space_pos  int;
BEGIN
  -- Only act when both name parts are absent and full_name is present.
  -- Preserves accurate Apollo-provided / hand-edited names.
  IF NOT (NEW.first_name IS NULL AND NEW.last_name IS NULL AND NEW.full_name IS NOT NULL) THEN
    RETURN NEW;
  END IF;

  -- Normalize: trim outer whitespace, collapse internal runs to single spaces.
  v_normalized := regexp_replace(btrim(NEW.full_name), '\s+', ' ', 'g');

  -- If the result is empty after normalization, leave both parts NULL.
  IF v_normalized = '' THEN
    RETURN NEW;
  END IF;

  v_space_pos := position(' ' IN v_normalized);

  IF v_space_pos = 0 THEN
    -- Single-token name: first_name gets it, last_name stays NULL.
    NEW.first_name := v_normalized;
    NEW.last_name  := NULL;
  ELSE
    -- Multi-token name: first token / everything after first space.
    NEW.first_name := substring(v_normalized FROM 1 FOR v_space_pos - 1);
    NEW.last_name  := substring(v_normalized FROM v_space_pos + 1);
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================
-- 2. Trigger (idempotent install)
-- ============================================================

DROP TRIGGER IF EXISTS trg_fill_person_name_parts ON persons;

CREATE TRIGGER trg_fill_person_name_parts
  BEFORE INSERT OR UPDATE OF full_name, first_name, last_name ON persons
  FOR EACH ROW
  EXECUTE FUNCTION fill_person_name_parts();

-- ============================================================
-- 3. One-time backfill
-- ============================================================

UPDATE persons p
SET
  first_name = split_part(s.norm, ' ', 1),
  last_name  = CASE
                 WHEN position(' ' IN s.norm) = 0 THEN NULL
                 ELSE substring(s.norm FROM position(' ' IN s.norm) + 1)
               END
FROM (
  SELECT id,
         regexp_replace(btrim(full_name), '\s+', ' ', 'g') AS norm
  FROM   persons
  WHERE  first_name IS NULL
    AND  last_name  IS NULL
    AND  full_name  IS NOT NULL
    -- Match the trigger's no-op for empty/all-whitespace names: leave BOTH parts NULL.
    AND  btrim(full_name) <> ''
) s
WHERE p.id = s.id;
