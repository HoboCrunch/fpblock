-- Sequences
CREATE TABLE sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  channel TEXT NOT NULL,
  event_id UUID REFERENCES events(id),
  steps JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE sequence_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id UUID REFERENCES sequences(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  current_step INT DEFAULT 0,
  status TEXT DEFAULT 'active' CHECK (status IN ('active','paused','completed','bounced')),
  enrolled_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(sequence_id, contact_id)
);

CREATE INDEX idx_sequence_enrollments_sequence ON sequence_enrollments(sequence_id);
CREATE INDEX idx_sequence_enrollments_contact ON sequence_enrollments(contact_id);
CREATE INDEX idx_sequences_event ON sequences(event_id);

-- Uploads
CREATE TABLE uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename TEXT NOT NULL,
  row_count INT,
  contacts_created INT DEFAULT 0,
  companies_created INT DEFAULT 0,
  event_id UUID REFERENCES events(id),
  status TEXT DEFAULT 'processing' CHECK (status IN ('processing','completed','failed')),
  errors JSONB,
  uploaded_by UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_uploads_event ON uploads(event_id);

-- Add replied_at to messages for inbox correlation
ALTER TABLE messages ADD COLUMN IF NOT EXISTS replied_at TIMESTAMPTZ;

-- Inbox sync tracking
CREATE TABLE inbox_sync_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_email TEXT NOT NULL UNIQUE,
  last_sync_at TIMESTAMPTZ,
  last_email_id TEXT,
  unread_count INT DEFAULT 0,
  status TEXT DEFAULT 'connected' CHECK (status IN ('connected','error','disconnected')),
  error_message TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO inbox_sync_state (account_email) VALUES
  ('jb@gofpblock.com'),
  ('wes@gofpblock.com');

-- Cached inbound emails for the inbox view
CREATE TABLE inbound_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_email TEXT NOT NULL,
  message_id TEXT NOT NULL UNIQUE,
  from_address TEXT NOT NULL,
  from_name TEXT,
  subject TEXT,
  body_preview TEXT,
  body_html TEXT,
  received_at TIMESTAMPTZ NOT NULL,
  is_read BOOLEAN DEFAULT false,
  contact_id UUID REFERENCES contacts(id),
  correlated_message_id UUID REFERENCES messages(id),
  correlation_type TEXT CHECK (correlation_type IN ('exact_email','domain_match','manual','none')),
  raw_headers JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_inbound_emails_account ON inbound_emails(account_email);
CREATE INDEX idx_inbound_emails_contact ON inbound_emails(contact_id);
CREATE INDEX idx_inbound_emails_received ON inbound_emails(received_at DESC);
CREATE INDEX idx_inbound_emails_from ON inbound_emails(from_address);

-- RPC for message status counts (used by dashboard)
CREATE OR REPLACE FUNCTION message_status_counts()
RETURNS TABLE(status TEXT, count BIGINT) AS $$
  SELECT status, COUNT(*) FROM messages GROUP BY status;
$$ LANGUAGE sql STABLE;
