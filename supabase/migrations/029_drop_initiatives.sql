-- 029: Drop initiatives feature
--
-- Removes the initiatives and initiative_enrollments tables along with the
-- initiative_id FK columns on dependent tables (sequences, interactions).
-- The CRM no longer surfaces initiatives in the UI; this migration excavates
-- the backend schema to match.

-- 1. Drop FK columns + indexes from dependent tables
ALTER TABLE sequences DROP COLUMN IF EXISTS initiative_id;
DROP INDEX IF EXISTS idx_sequences_initiative;

ALTER TABLE interactions DROP COLUMN IF EXISTS initiative_id;
DROP INDEX IF EXISTS idx_interactions_initiative;

-- 2. Drop the initiatives tables (children first)
DROP TABLE IF EXISTS initiative_enrollments CASCADE;
DROP TABLE IF EXISTS initiatives CASCADE;
