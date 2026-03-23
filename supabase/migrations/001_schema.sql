-- 001_schema.sql  –  Core tables for FP Block outreach platform
-- Core schema for FP Block outreach platform

-- ============================================================
-- EXTENSIONS
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" SCHEMA extensions;

-- ============================================================
-- TABLES
-- ============================================================

-- Contacts ---------------------------------------------------
CREATE TABLE contacts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name  text,
  last_name   text,
  full_name   text NOT NULL,
  title       text,
  seniority   text,
  department  text,
  email       text,
  linkedin    text,
  twitter     text,
  telegram    text,
  phone       text,
  context     text,
  apollo_id   text,
  source      text,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Companies --------------------------------------------------
CREATE TABLE companies (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  website     text,
  linkedin_url text,
  category    text,
  description text,
  context     text,
  usp         text,
  icp_score   integer,
  icp_reason  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Events -----------------------------------------------------
CREATE TABLE events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  location    text,
  date_start  date,
  date_end    date,
  website     text,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Sender Profiles --------------------------------------------
CREATE TABLE sender_profiles (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 text NOT NULL,
  email                text,
  heyreach_account_id  text,
  signature            text,
  tone_notes           text,
  created_at           timestamptz NOT NULL DEFAULT now()
);

-- Prompt Templates -------------------------------------------
CREATE TABLE prompt_templates (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  text NOT NULL,
  channel               text,
  system_prompt         text NOT NULL,
  user_prompt_template  text NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- Event Config -----------------------------------------------
CREATE TABLE event_config (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id            uuid NOT NULL REFERENCES events (id),
  sender_id           uuid REFERENCES sender_profiles (id),
  cta_url             text,
  cta_text            text,
  prompt_template_id  uuid REFERENCES prompt_templates (id),
  notify_emails       text[],
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id)
);

-- Messages ---------------------------------------------------
CREATE TABLE messages (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id       uuid NOT NULL REFERENCES contacts (id) ON DELETE CASCADE,
  company_id       uuid REFERENCES companies (id) ON DELETE SET NULL,
  event_id         uuid REFERENCES events (id) ON DELETE SET NULL,
  channel          text NOT NULL,
  sequence_number  int NOT NULL DEFAULT 1,
  iteration        int NOT NULL DEFAULT 1,
  subject          text,
  body             text NOT NULL,
  status           text NOT NULL DEFAULT 'draft',
  sender_id        uuid REFERENCES sender_profiles (id),
  cta              text,
  scheduled_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  sent_at          timestamptz
);

-- Company Signals --------------------------------------------
CREATE TABLE company_signals (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  signal_type text NOT NULL,
  description text NOT NULL,
  date        date,
  source      text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Contact ↔ Company (junction) --------------------------------
CREATE TABLE contact_company (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id      uuid NOT NULL REFERENCES contacts (id) ON DELETE CASCADE,
  company_id      uuid NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  role            text,
  role_type       text,
  founder_status  text,
  is_primary      boolean DEFAULT false,
  source          text,
  UNIQUE (contact_id, company_id)
);

-- Contact ↔ Event (junction) ----------------------------------
CREATE TABLE contact_event (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id          uuid NOT NULL REFERENCES contacts (id) ON DELETE CASCADE,
  event_id            uuid NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  participation_type  text,
  track               text,
  notes               text,
  UNIQUE (contact_id, event_id)
);

-- Company ↔ Event (junction) ----------------------------------
CREATE TABLE company_event (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         uuid NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  event_id           uuid NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  relationship_type  text,
  sponsor_tier       text,
  notes              text,
  UNIQUE (company_id, event_id)
);

-- Automation Rules -------------------------------------------
CREATE TABLE automation_rules (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text NOT NULL,
  trigger_table  text NOT NULL,
  trigger_event  text NOT NULL,
  conditions     jsonb DEFAULT '{}',
  action         text NOT NULL,
  action_params  jsonb DEFAULT '{}',
  enabled        boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- Job Log ----------------------------------------------------
CREATE TABLE job_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type      text NOT NULL,
  target_table  text,
  target_id     uuid,
  status        text NOT NULL DEFAULT 'started',
  error         text,
  metadata      jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX idx_contacts_email        ON contacts (email);
CREATE INDEX idx_contacts_apollo_id    ON contacts (apollo_id);
CREATE INDEX idx_contacts_full_name    ON contacts (full_name);

CREATE INDEX idx_companies_name        ON companies (name);
CREATE INDEX idx_companies_icp_score   ON companies (icp_score);

CREATE INDEX idx_messages_status       ON messages (status);
CREATE INDEX idx_messages_scheduled_at ON messages (scheduled_at);
CREATE INDEX idx_messages_contact_id   ON messages (contact_id);
CREATE INDEX idx_messages_event_id     ON messages (event_id);

CREATE INDEX idx_company_signals_company_id ON company_signals (company_id);

CREATE INDEX idx_contact_company_contact_id ON contact_company (contact_id);
CREATE INDEX idx_contact_company_company_id ON contact_company (company_id);

CREATE INDEX idx_contact_event_event_id     ON contact_event (event_id);
CREATE INDEX idx_company_event_event_id     ON company_event (event_id);

CREATE INDEX idx_job_log_created_at         ON job_log (created_at DESC);
