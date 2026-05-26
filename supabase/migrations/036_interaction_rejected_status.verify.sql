-- 036_interaction_rejected_status.verify.sql
-- Self-contained transactional verification for migration 036.
--
-- Confirms the backfill reclassifies legacy human-rejected rows (failed +
-- detail.rejected) as 'rejected' while leaving genuine delivery failures alone.
-- Nothing persists: the whole block is rolled back at the end.
--
-- Usage:
--   psql $DATABASE_URL -f supabase/migrations/036_interaction_rejected_status.verify.sql

BEGIN;

-- A legacy rejection (failed + detail.rejected) → should become 'rejected'.
INSERT INTO interactions (id, interaction_type, status, detail)
VALUES (
  '00000000-0000-0000-0000-0000000a0001',
  'cold_email',
  'failed',
  '{"rejected": true, "reason": "off-target"}'::jsonb
);

-- A genuine delivery failure → must stay 'failed'.
INSERT INTO interactions (id, interaction_type, status, detail)
VALUES (
  '00000000-0000-0000-0000-0000000a0002',
  'cold_email',
  'failed',
  '{"last_error": "550 mailbox unavailable"}'::jsonb
);

-- A bounce → untouched.
INSERT INTO interactions (id, interaction_type, status, detail)
VALUES (
  '00000000-0000-0000-0000-0000000a0003',
  'cold_email',
  'bounced',
  '{}'::jsonb
);

-- ── Run the backfill (exact copy of the migration — keep in sync) ────────────
UPDATE interactions
SET status = 'rejected'
WHERE status = 'failed'
  AND detail ->> 'rejected' = 'true';

DO $$
DECLARE
  r interactions%ROWTYPE;
BEGIN
  SELECT * INTO r FROM interactions WHERE id = '00000000-0000-0000-0000-0000000a0001';
  ASSERT r.status = 'rejected',
    format('Legacy rejection: expected ''rejected'', got %L', r.status);

  SELECT * INTO r FROM interactions WHERE id = '00000000-0000-0000-0000-0000000a0002';
  ASSERT r.status = 'failed',
    format('Delivery failure: expected ''failed'', got %L', r.status);

  SELECT * INTO r FROM interactions WHERE id = '00000000-0000-0000-0000-0000000a0003';
  ASSERT r.status = 'bounced',
    format('Bounce: expected ''bounced'', got %L', r.status);

  RAISE NOTICE 'All scenarios PASSED.';
END;
$$;

ROLLBACK;

\echo 'All verification scenarios passed. Transaction rolled back — no data written.'
