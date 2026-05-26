-- 035_person_name_parts.verify.sql
-- Self-contained transactional verification for migration 035.
--
-- Run this against the target database to confirm correctness.
-- Nothing persists: the entire block is rolled back at the end.
--
-- Intended for a test DB or a pre-migration run: this transiently drops and
-- recreates the live trigger inside the transaction, all of which is undone by
-- the closing ROLLBACK.
--
-- Usage:
--   psql $DATABASE_URL -f supabase/migrations/035_person_name_parts.verify.sql

BEGIN;

-- ============================================================
-- Install the migration DDL inside this transaction
-- ============================================================

-- Exact copy of migration DDL — keep in sync.
CREATE OR REPLACE FUNCTION fill_person_name_parts()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_normalized text;
  v_space_pos  int;
BEGIN
  IF NOT (NEW.first_name IS NULL AND NEW.last_name IS NULL AND NEW.full_name IS NOT NULL) THEN
    RETURN NEW;
  END IF;

  v_normalized := regexp_replace(btrim(NEW.full_name), '\s+', ' ', 'g');

  IF v_normalized = '' THEN
    RETURN NEW;
  END IF;

  v_space_pos := position(' ' IN v_normalized);

  IF v_space_pos = 0 THEN
    NEW.first_name := v_normalized;
    NEW.last_name  := NULL;
  ELSE
    NEW.first_name := substring(v_normalized FROM 1 FOR v_space_pos - 1);
    NEW.last_name  := substring(v_normalized FROM v_space_pos + 1);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fill_person_name_parts ON persons;

CREATE TRIGGER trg_fill_person_name_parts
  BEFORE INSERT OR UPDATE OF full_name, first_name, last_name ON persons
  FOR EACH ROW
  EXECUTE FUNCTION fill_person_name_parts();

-- ============================================================
-- Scenario 1: two-token full_name, no first/last provided
--   full_name = 'Ada Lovelace'
--   expected : first_name = 'Ada', last_name = 'Lovelace'
-- ============================================================

INSERT INTO persons (id, full_name)
VALUES ('00000000-0000-0000-0000-000000000001', 'Ada Lovelace');

DO $$
DECLARE
  r persons%ROWTYPE;
BEGIN
  SELECT * INTO r FROM persons WHERE id = '00000000-0000-0000-0000-000000000001';
  ASSERT r.first_name = 'Ada',
    format('Scenario 1 first_name: expected ''Ada'', got %L', r.first_name);
  ASSERT r.last_name = 'Lovelace',
    format('Scenario 1 last_name: expected ''Lovelace'', got %L', r.last_name);
  RAISE NOTICE 'Scenario 1 PASSED: Ada Lovelace → first=%, last=%', r.first_name, r.last_name;
END;
$$;

-- ============================================================
-- Scenario 2: explicit first/last provided — trigger must be no-op
--   expected : values preserved exactly as inserted
-- ============================================================

INSERT INTO persons (id, full_name, first_name, last_name)
VALUES ('00000000-0000-0000-0000-000000000002', 'Grace Hopper', 'Grace', 'Hopper');

DO $$
DECLARE
  r persons%ROWTYPE;
BEGIN
  SELECT * INTO r FROM persons WHERE id = '00000000-0000-0000-0000-000000000002';
  ASSERT r.first_name = 'Grace',
    format('Scenario 2 first_name: expected ''Grace'', got %L', r.first_name);
  ASSERT r.last_name = 'Hopper',
    format('Scenario 2 last_name: expected ''Hopper'', got %L', r.last_name);
  RAISE NOTICE 'Scenario 2 PASSED: explicit names preserved → first=%, last=%', r.first_name, r.last_name;
END;
$$;

-- ============================================================
-- Scenario 3: single-token name
--   full_name = 'Cher'
--   expected : first_name = 'Cher', last_name = NULL
-- ============================================================

INSERT INTO persons (id, full_name)
VALUES ('00000000-0000-0000-0000-000000000003', 'Cher');

DO $$
DECLARE
  r persons%ROWTYPE;
BEGIN
  SELECT * INTO r FROM persons WHERE id = '00000000-0000-0000-0000-000000000003';
  ASSERT r.first_name = 'Cher',
    format('Scenario 3 first_name: expected ''Cher'', got %L', r.first_name);
  ASSERT r.last_name IS NULL,
    format('Scenario 3 last_name: expected NULL, got %L', r.last_name);
  RAISE NOTICE 'Scenario 3 PASSED: single-token → first=%, last=%', r.first_name, r.last_name;
END;
$$;

-- ============================================================
-- Scenario 4: excess whitespace (leading, trailing, internal)
--   full_name = '  Mary   Anne  Smith '
--   expected : first_name = 'Mary', last_name = 'Anne Smith'
-- ============================================================

INSERT INTO persons (id, full_name)
VALUES ('00000000-0000-0000-0000-000000000004', '  Mary   Anne  Smith ');

DO $$
DECLARE
  r persons%ROWTYPE;
BEGIN
  SELECT * INTO r FROM persons WHERE id = '00000000-0000-0000-0000-000000000004';
  ASSERT r.first_name = 'Mary',
    format('Scenario 4 first_name: expected ''Mary'', got %L', r.first_name);
  ASSERT r.last_name = 'Anne Smith',
    format('Scenario 4 last_name: expected ''Anne Smith'', got %L', r.last_name);
  RAISE NOTICE 'Scenario 4 PASSED: whitespace-normalized → first=%, last=%', r.first_name, r.last_name;
END;
$$;

-- ============================================================
-- Scenario 5: all-whitespace full_name normalizes to empty
--   full_name = '   '
--   expected : first_name IS NULL AND last_name IS NULL (trigger no-op)
-- ============================================================

INSERT INTO persons (id, full_name)
VALUES ('00000000-0000-0000-0000-000000000005', '   ');

DO $$
DECLARE
  r persons%ROWTYPE;
BEGIN
  SELECT * INTO r FROM persons WHERE id = '00000000-0000-0000-0000-000000000005';
  ASSERT r.first_name IS NULL,
    format('Scenario 5 first_name: expected NULL, got %L', r.first_name);
  ASSERT r.last_name IS NULL,
    format('Scenario 5 last_name: expected NULL, got %L', r.last_name);
  RAISE NOTICE 'Scenario 5 PASSED: all-whitespace → first=NULL, last=NULL';
END;
$$;

-- ============================================================
-- Roll back — nothing persists in the database
-- ============================================================

ROLLBACK;

-- If you reach this line without an ERROR, all 5 assertions passed.
\echo 'All verification scenarios passed. Transaction rolled back — no data written.'
