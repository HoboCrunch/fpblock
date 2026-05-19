-- 028_sequence_send_atomic_claim.sql
-- Concurrency primitives for the sequence dispatcher.
--
-- Two functions:
--   claim_due_interactions     — atomically flips eligible 'scheduled' rows to 'sending'
--                                using FOR UPDATE SKIP LOCKED so overlapping cron
--                                invocations claim disjoint sets.
--   reclaim_stuck_interactions — reverts 'sending' rows that never progressed back to
--                                'scheduled' with retry_count incremented, so a crashed
--                                handler or function timeout doesn't strand a row.
--
-- Both return SETOF interactions so the caller can load joined data via the returned ids.

CREATE INDEX IF NOT EXISTS idx_interactions_due
  ON interactions (status, scheduled_at)
  WHERE status = 'scheduled';

CREATE INDEX IF NOT EXISTS idx_interactions_sending
  ON interactions (status, updated_at)
  WHERE status = 'sending';

CREATE OR REPLACE FUNCTION claim_due_interactions(p_limit int DEFAULT 50)
RETURNS SETOF interactions
LANGUAGE sql
AS $$
  WITH claimed AS (
    SELECT id
    FROM interactions
    WHERE status = 'scheduled'
      AND scheduled_at <= now()
    ORDER BY scheduled_at
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE interactions i
  SET status = 'sending',
      updated_at = now(),
      detail = COALESCE(i.detail, '{}'::jsonb)
               || jsonb_build_object('claimed_at', to_jsonb(now()))
  FROM claimed c
  WHERE i.id = c.id
  RETURNING i.*;
$$;

CREATE OR REPLACE FUNCTION reclaim_stuck_interactions(p_stuck_minutes int DEFAULT 10)
RETURNS SETOF interactions
LANGUAGE sql
AS $$
  WITH stuck AS (
    SELECT id
    FROM interactions
    WHERE status = 'sending'
      AND updated_at < now() - make_interval(mins => p_stuck_minutes)
    FOR UPDATE SKIP LOCKED
  )
  UPDATE interactions i
  SET status = 'scheduled',
      scheduled_at = now(),
      updated_at = now(),
      detail = COALESCE(i.detail, '{}'::jsonb)
               || jsonb_build_object(
                    'retry_count', COALESCE((i.detail->>'retry_count')::int, 0) + 1,
                    'last_error', 'sweeper: stuck in sending state',
                    'last_sweep_at', to_jsonb(now())
                  )
  FROM stuck s
  WHERE i.id = s.id
  RETURNING i.*;
$$;

GRANT EXECUTE ON FUNCTION claim_due_interactions(int) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION reclaim_stuck_interactions(int) TO service_role, authenticated;
