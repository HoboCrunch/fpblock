-- 037_job_log_progress.sql
-- Generalize job_log for unified job visibility across all background work types.
--
-- Adds first-class progress, label, phase, parent linkage, and updated_at columns
-- so CSV imports, enrichment runs, and any future job type share one relational
-- source of truth for live progress (see: feedback_enrichment_data_truth).
--
-- All new columns are nullable / defaulted so existing rows are unaffected.
-- Migration is safely re-runnable (uses IF NOT EXISTS / idempotent guards throughout).

-- ============================================================
-- 1. New columns
-- ============================================================

ALTER TABLE job_log
  ADD COLUMN IF NOT EXISTS label            text,
  ADD COLUMN IF NOT EXISTS progress_total   int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS progress_completed int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS progress_failed  int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS phase            text,
  ADD COLUMN IF NOT EXISTS updated_at       timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS parent_job_id    uuid REFERENCES job_log(id);

-- ============================================================
-- 2. Trigger: keep updated_at current on every write
-- ============================================================

-- No GRANT needed: invoked by the trigger engine, not called directly.
CREATE OR REPLACE FUNCTION set_job_log_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_job_log_updated_at ON job_log;

CREATE TRIGGER trg_set_job_log_updated_at
  BEFORE UPDATE ON job_log
  FOR EACH ROW
  EXECUTE FUNCTION set_job_log_updated_at();

-- ============================================================
-- 3. Indexes
-- ============================================================

-- Partial index keeps the global 4 s poll cheap (only active jobs scanned).
CREATE INDEX IF NOT EXISTS idx_job_log_active
  ON job_log (status)
  WHERE status IN ('pending', 'processing');

-- Foreign-key traversal for child-row lookups (drawer inline expansion).
CREATE INDEX IF NOT EXISTS idx_job_log_parent
  ON job_log (parent_job_id);

-- ============================================================
-- 4. Storage bucket for CSV uploads
-- ============================================================

-- Private bucket — files are read server-side only (no public URLs).
INSERT INTO storage.buckets (id, name, public)
VALUES ('csv-imports', 'csv-imports', false)
ON CONFLICT (id) DO NOTHING;
