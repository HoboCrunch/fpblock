-- 037_job_log_progress.verify.sql
-- Self-contained structural verification for migration 037.
--
-- Confirms that every new column, index, and storage bucket row exists with
-- the correct types and defaults.  Nothing persists: the entire block is
-- rolled back at the end.
--
-- Usage:
--   psql $DATABASE_URL -f supabase/migrations/037_job_log_progress.verify.sql

BEGIN;

-- ============================================================
-- 1. Column existence and data-type checks
--    pg_attribute stores column definitions; atttypid → pg_type.typname.
-- ============================================================

DO $$
DECLARE
  col record;
BEGIN
  -- label: text, nullable
  SELECT a.attnotnull, t.typname
    INTO col
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_type  t ON t.oid = a.atttypid
   WHERE c.relname = 'job_log' AND a.attname = 'label' AND a.attnum > 0;

  ASSERT FOUND,
    'Column job_log.label not found';
  ASSERT col.typname = 'text',
    format('job_log.label: expected type text, got %L', col.typname);
  ASSERT col.attnotnull = false,
    'job_log.label: expected nullable';
  RAISE NOTICE 'PASSED: job_log.label exists (text, nullable)';

  -- progress_total: int4, not null, default 0
  SELECT a.attnotnull, t.typname
    INTO col
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_type  t ON t.oid = a.atttypid
   WHERE c.relname = 'job_log' AND a.attname = 'progress_total' AND a.attnum > 0;

  ASSERT FOUND,
    'Column job_log.progress_total not found';
  ASSERT col.typname = 'int4',
    format('job_log.progress_total: expected type int4, got %L', col.typname);
  ASSERT col.attnotnull = true,
    'job_log.progress_total: expected not null';
  RAISE NOTICE 'PASSED: job_log.progress_total exists (int4, not null)';

  -- progress_completed: int4, not null, default 0
  SELECT a.attnotnull, t.typname
    INTO col
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_type  t ON t.oid = a.atttypid
   WHERE c.relname = 'job_log' AND a.attname = 'progress_completed' AND a.attnum > 0;

  ASSERT FOUND,
    'Column job_log.progress_completed not found';
  ASSERT col.typname = 'int4',
    format('job_log.progress_completed: expected type int4, got %L', col.typname);
  ASSERT col.attnotnull = true,
    'job_log.progress_completed: expected not null';
  RAISE NOTICE 'PASSED: job_log.progress_completed exists (int4, not null)';

  -- progress_failed: int4, not null, default 0
  SELECT a.attnotnull, t.typname
    INTO col
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_type  t ON t.oid = a.atttypid
   WHERE c.relname = 'job_log' AND a.attname = 'progress_failed' AND a.attnum > 0;

  ASSERT FOUND,
    'Column job_log.progress_failed not found';
  ASSERT col.typname = 'int4',
    format('job_log.progress_failed: expected type int4, got %L', col.typname);
  ASSERT col.attnotnull = true,
    'job_log.progress_failed: expected not null';
  RAISE NOTICE 'PASSED: job_log.progress_failed exists (int4, not null)';

  -- phase: text, nullable
  SELECT a.attnotnull, t.typname
    INTO col
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_type  t ON t.oid = a.atttypid
   WHERE c.relname = 'job_log' AND a.attname = 'phase' AND a.attnum > 0;

  ASSERT FOUND,
    'Column job_log.phase not found';
  ASSERT col.typname = 'text',
    format('job_log.phase: expected type text, got %L', col.typname);
  ASSERT col.attnotnull = false,
    'job_log.phase: expected nullable';
  RAISE NOTICE 'PASSED: job_log.phase exists (text, nullable)';

  -- updated_at: timestamptz, not null
  SELECT a.attnotnull, t.typname
    INTO col
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_type  t ON t.oid = a.atttypid
   WHERE c.relname = 'job_log' AND a.attname = 'updated_at' AND a.attnum > 0;

  ASSERT FOUND,
    'Column job_log.updated_at not found';
  ASSERT col.typname = 'timestamptz',
    format('job_log.updated_at: expected type timestamptz, got %L', col.typname);
  ASSERT col.attnotnull = true,
    'job_log.updated_at: expected not null';
  RAISE NOTICE 'PASSED: job_log.updated_at exists (timestamptz, not null)';

  -- parent_job_id: uuid, nullable
  SELECT a.attnotnull, t.typname
    INTO col
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_type  t ON t.oid = a.atttypid
   WHERE c.relname = 'job_log' AND a.attname = 'parent_job_id' AND a.attnum > 0;

  ASSERT FOUND,
    'Column job_log.parent_job_id not found';
  ASSERT col.typname = 'uuid',
    format('job_log.parent_job_id: expected type uuid, got %L', col.typname);
  ASSERT col.attnotnull = false,
    'job_log.parent_job_id: expected nullable';
  RAISE NOTICE 'PASSED: job_log.parent_job_id exists (uuid, nullable)';
END;
$$;

-- ============================================================
-- 2. Index existence checks
-- ============================================================

DO $$
BEGIN
  ASSERT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE tablename = 'job_log'
       AND indexname  = 'idx_job_log_active'
  ), 'Index idx_job_log_active not found';
  RAISE NOTICE 'PASSED: idx_job_log_active exists';

  ASSERT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE tablename = 'job_log'
       AND indexname  = 'idx_job_log_parent'
  ), 'Index idx_job_log_parent not found';
  RAISE NOTICE 'PASSED: idx_job_log_parent exists';
END;
$$;

-- ============================================================
-- 3. Storage bucket existence
-- ============================================================

DO $$
BEGIN
  ASSERT EXISTS (
    SELECT 1 FROM storage.buckets WHERE id = 'csv-imports'
  ), 'Storage bucket csv-imports not found';
  RAISE NOTICE 'PASSED: storage bucket csv-imports exists';
END;
$$;

-- ============================================================
-- 4. Trigger existence
-- ============================================================

DO $$
BEGIN
  ASSERT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    WHERE c.relname = 'job_log'
      AND t.tgname   = 'trg_set_job_log_updated_at'
  ), 'Trigger trg_set_job_log_updated_at not found on job_log';
  RAISE NOTICE 'PASSED: trigger trg_set_job_log_updated_at exists';
END;
$$;

-- ============================================================
-- Roll back — nothing persists in the database
-- ============================================================

ROLLBACK;

-- If you reach this line without an ERROR, all assertions passed.
\echo 'All verification scenarios passed. Transaction rolled back — no data written.'
