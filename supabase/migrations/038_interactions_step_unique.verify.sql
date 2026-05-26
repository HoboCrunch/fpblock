-- 038_interactions_step_unique.verify.sql
-- Self-contained transactional verification for migration 038.
--
-- Confirms the partial unique index exists and actually rejects a duplicate
-- (sequence_id, person_id, sequence_step) row while still permitting independent
-- sequence-step rows and unrelated (all-null-tuple) interactions.
-- Nothing persists: the whole block is rolled back at the end.
--
-- Usage:
--   psql $DATABASE_URL -f supabase/migrations/038_interactions_step_unique.verify.sql

BEGIN;

-- ============================================================
-- Assertion 1: the index exists with the expected definition
-- ============================================================

DO $$
DECLARE
  v_def text;
BEGIN
  SELECT indexdef INTO v_def
  FROM pg_indexes
  WHERE schemaname = 'public'
    AND tablename = 'interactions'
    AND indexname = 'uniq_interactions_sequence_step';

  ASSERT v_def IS NOT NULL,
    'Index uniq_interactions_sequence_step does not exist on interactions';
  ASSERT position('UNIQUE INDEX' IN v_def) > 0,
    format('Index is not UNIQUE: %L', v_def);
  ASSERT position('sequence_id' IN v_def) > 0
     AND position('person_id' IN v_def) > 0
     AND position('sequence_step' IN v_def) > 0,
    format('Index does not cover the expected tuple: %L', v_def);
  ASSERT position('WHERE' IN v_def) > 0,
    format('Index is not partial (no WHERE clause): %L', v_def);

  RAISE NOTICE 'Assertion 1 PASSED: index present, unique, partial → %', v_def;
END;
$$;

-- ============================================================
-- Assertion 2: no pre-existing duplicate tuples (would have blocked creation)
-- ============================================================

DO $$
DECLARE
  v_dupes bigint;
BEGIN
  SELECT count(*) INTO v_dupes
  FROM (
    SELECT 1
    FROM interactions
    WHERE sequence_id IS NOT NULL
      AND person_id IS NOT NULL
      AND sequence_step IS NOT NULL
    GROUP BY sequence_id, person_id, sequence_step
    HAVING count(*) > 1
  ) d;

  ASSERT v_dupes = 0,
    format('Found %s duplicate (sequence_id, person_id, sequence_step) group(s)', v_dupes);

  RAISE NOTICE 'Assertion 2 PASSED: no duplicate sequence-step tuples.';
END;
$$;

-- ============================================================
-- Assertion 3: the index actually rejects a duplicate insert
-- ============================================================

-- Two distinct steps for the same (sequence, person) → both allowed.
INSERT INTO interactions (id, interaction_type, sequence_id, person_id, sequence_step)
VALUES
  ('00000000-0000-0000-0000-0000000b0001', 'cold_email',
   '00000000-0000-0000-0000-0000000bbbb1', '00000000-0000-0000-0000-0000000bbbc1', 1),
  ('00000000-0000-0000-0000-0000000b0002', 'cold_email',
   '00000000-0000-0000-0000-0000000bbbb1', '00000000-0000-0000-0000-0000000bbbc1', 2);

-- Two interactions with the all-null tuple → never collide (outside the index).
INSERT INTO interactions (id, interaction_type)
VALUES
  ('00000000-0000-0000-0000-0000000b0003', 'note'),
  ('00000000-0000-0000-0000-0000000b0004', 'note');

DO $$
DECLARE
  v_failed boolean := false;
BEGIN
  -- Re-inserting step 1 for the same (sequence, person) must violate the index.
  BEGIN
    INSERT INTO interactions (id, interaction_type, sequence_id, person_id, sequence_step)
    VALUES ('00000000-0000-0000-0000-0000000b0005', 'cold_email',
            '00000000-0000-0000-0000-0000000bbbb1', '00000000-0000-0000-0000-0000000bbbc1', 1);
  EXCEPTION WHEN unique_violation THEN
    v_failed := true;
  END;

  ASSERT v_failed,
    'Duplicate (sequence_id, person_id, sequence_step) insert was NOT rejected';

  RAISE NOTICE 'Assertion 3 PASSED: duplicate tuple rejected; distinct steps and null tuples allowed.';
END;
$$;

ROLLBACK;

\echo 'All verification scenarios passed. Transaction rolled back — no data written.'
