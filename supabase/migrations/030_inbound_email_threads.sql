-- 029_inbound_email_threads.sql
-- Add threading + outbound support to inbound_emails so the inbox can render
-- full 2-way conversations grouped by JMAP threadId.

ALTER TABLE inbound_emails
  ADD COLUMN IF NOT EXISTS thread_id TEXT,
  ADD COLUMN IF NOT EXISTS direction TEXT NOT NULL DEFAULT 'inbound'
    CHECK (direction IN ('inbound', 'outbound')),
  ADD COLUMN IF NOT EXISTS to_address TEXT;

CREATE INDEX IF NOT EXISTS idx_inbound_emails_thread_id
  ON inbound_emails (thread_id);

CREATE INDEX IF NOT EXISTS idx_inbound_emails_thread_received
  ON inbound_emails (thread_id, received_at);

-- Per-identity cursor for the Sent mailbox (separate from the inbox cursor).
ALTER TABLE inbox_sync_state
  ADD COLUMN IF NOT EXISTS last_sent_email_id TEXT;
