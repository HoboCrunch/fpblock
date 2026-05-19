-- 031_interactions_message_id_index.sql
-- Enforce idempotency for backfill + inline script sends. SendGrid message-ids
-- are unique per request, so two rows sharing one indicate a duplicate insert.

CREATE UNIQUE INDEX IF NOT EXISTS uniq_interactions_sendgrid_message_id
  ON interactions ((detail->>'sendgrid_message_id'))
  WHERE detail->>'sendgrid_message_id' IS NOT NULL;
