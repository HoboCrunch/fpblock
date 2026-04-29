-- Persist hard-bounce timestamp on the person row so future enrollments can
-- skip recipients whose email has bounced. Written by the SendGrid webhook on
-- hard-bounce / dropped events; read by segment filters and enrollment-time
-- guards (sequence schedule_config.exclude_bounced).

ALTER TABLE persons ADD COLUMN IF NOT EXISTS email_bounced_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_persons_email_bounced_at
  ON persons (email_bounced_at)
  WHERE email_bounced_at IS NOT NULL;
