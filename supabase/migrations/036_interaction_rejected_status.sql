-- 036_interaction_rejected_status.sql
-- Separate human rejections from delivery failures in the message queue.
--
-- Background:
--   Rejecting a draft previously wrote status = 'failed' with detail.rejected =
--   true, so intentional rejections were indistinguishable from bounces / send
--   errors — they polluted the Failed tab, the failures page, and the dashboard
--   failure count. The app now writes a dedicated 'rejected' status.
--
--   interactions.status has no CHECK constraint (see 010_crm_redesign_schema.sql:
--   `status text DEFAULT 'draft'`), so no DDL is required — this is a one-time
--   backfill of the existing legacy rows.

UPDATE interactions
SET status = 'rejected'
WHERE status = 'failed'
  AND detail ->> 'rejected' = 'true';
