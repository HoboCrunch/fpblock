-- 038_interactions_step_unique.sql
-- DB-level idempotency guard for per-(enrollment, step) interaction rows.
--
-- Background:
--   Sequence generation pre-creates one interaction row per (enrollment × step).
--   With eager generation (see docs/superpowers/specs/
--   2026-05-26-eager-sequence-generation-design.md, §4), activating or enrolling
--   into an active sequence fires generation immediately — which now overlaps the
--   every-5-minute generate cron backstop. The old "skip step if a row already
--   exists" check is check-then-insert and is racy under that concurrency, so two
--   overlapping runs could each insert a row for the same step.
--
--   This partial unique index makes the per-step insert collision-proof at the DB
--   level: the app switches to upsert(row, { onConflict:
--   'sequence_id,person_id,sequence_step', ignoreDuplicates: true }), and the
--   index enforces the exact same tuple. Overlapping eager + cron runs can no
--   longer produce duplicates.
--
--   interactions.sequence_id / person_id / sequence_step are all nullable (see
--   010_crm_redesign_schema.sql) — many interactions are not sequence steps — so
--   the index is partial, covering only rows where all three are non-null.
--
-- Note:
--   Pre-existing duplicate (sequence_id, person_id, sequence_step) rows would
--   block index creation. None are expected: existing rows were all created by the
--   same skip-existing generation logic, so the tuple is already effectively
--   unique. If any duplicate slipped through, CREATE UNIQUE INDEX will error
--   loudly rather than silently proceed — which is the desired surface-the-problem
--   behavior.

CREATE UNIQUE INDEX IF NOT EXISTS uniq_interactions_sequence_step
  ON interactions (sequence_id, person_id, sequence_step)
  WHERE sequence_id IS NOT NULL
    AND person_id IS NOT NULL
    AND sequence_step IS NOT NULL;
