-- 010_crm_redesign_schema.sql
-- CRM Redesign: Clean-slate relational schema

-- Enable pg_trgm for fuzzy matching
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================
-- CORE ENTITIES
-- ============================================

CREATE TABLE persons (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name         text NOT NULL,
  first_name        text,
  last_name         text,
  email             text,
  linkedin_url      text,
  twitter_handle    text,
  telegram_handle   text,
  phone             text,
  title             text,
  seniority         text,
  department        text,
  bio               text,
  photo_url         text,
  source            text,
  apollo_id         text,
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_persons_email ON persons (email);
CREATE INDEX idx_persons_apollo_id ON persons (apollo_id);
CREATE INDEX idx_persons_full_name_trgm ON persons USING gin (full_name gin_trgm_ops);
CREATE INDEX idx_persons_linkedin ON persons (linkedin_url);
CREATE INDEX idx_persons_twitter ON persons (twitter_handle);

CREATE TABLE organizations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text NOT NULL,
  website           text,
  linkedin_url      text,
  category          text,
  description       text,
  logo_url          text,
  icp_score         int,
  icp_reason        text,
  context           text,
  usp               text,
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_organizations_name_trgm ON organizations USING gin (name gin_trgm_ops);
CREATE INDEX idx_organizations_icp_score ON organizations (icp_score);
CREATE INDEX idx_organizations_website ON organizations (website);

CREATE TABLE person_organization (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id         uuid NOT NULL REFERENCES persons (id) ON DELETE CASCADE,
  organization_id   uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  role              text,
  role_type         text,
  is_current        boolean DEFAULT true,
  is_primary        boolean DEFAULT false,
  source            text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (person_id, organization_id)
);

CREATE INDEX idx_person_org_person ON person_organization (person_id);
CREATE INDEX idx_person_org_org ON person_organization (organization_id);

-- Events: add slug and event_type to existing schema shape
CREATE TABLE events_new (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text NOT NULL,
  slug              text UNIQUE,
  location          text,
  date_start        date,
  date_end          date,
  website           text,
  event_type        text,
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_events_slug ON events_new (slug);
CREATE INDEX idx_events_date ON events_new (date_start);

-- ============================================
-- EVENT RELATIONSHIPS
-- ============================================

CREATE TABLE event_participations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id          uuid NOT NULL REFERENCES events_new (id) ON DELETE CASCADE,
  person_id         uuid REFERENCES persons (id) ON DELETE CASCADE,
  organization_id   uuid REFERENCES organizations (id) ON DELETE CASCADE,
  role              text NOT NULL,
  sponsor_tier      text,
  confirmed         boolean DEFAULT true,
  talk_title        text,
  time_slot         text,
  track             text,
  room              text,
  notes             text,
  CHECK ((person_id IS NULL) != (organization_id IS NULL))
);

CREATE UNIQUE INDEX idx_ep_event_person_role ON event_participations (event_id, person_id, role) WHERE person_id IS NOT NULL;
CREATE UNIQUE INDEX idx_ep_event_org_role ON event_participations (event_id, organization_id, role) WHERE organization_id IS NOT NULL;
CREATE INDEX idx_ep_event ON event_participations (event_id);
CREATE INDEX idx_ep_person ON event_participations (person_id);
CREATE INDEX idx_ep_org ON event_participations (organization_id);

-- ============================================
-- INITIATIVES & INTERACTIONS
-- ============================================

CREATE TABLE initiatives (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text NOT NULL,
  initiative_type   text,
  event_id          uuid REFERENCES events_new (id),
  status            text DEFAULT 'active',
  owner             text,
  notes             text,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);

CREATE INDEX idx_initiatives_event ON initiatives (event_id);
CREATE INDEX idx_initiatives_status ON initiatives (status);

CREATE TABLE initiative_enrollments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  initiative_id     uuid NOT NULL REFERENCES initiatives (id) ON DELETE CASCADE,
  person_id         uuid REFERENCES persons (id) ON DELETE CASCADE,
  organization_id   uuid REFERENCES organizations (id) ON DELETE CASCADE,
  status            text DEFAULT 'active',
  priority          text,
  enrolled_at       timestamptz DEFAULT now(),
  CHECK ((person_id IS NULL) != (organization_id IS NULL))
);

CREATE UNIQUE INDEX idx_ie_initiative_person ON initiative_enrollments (initiative_id, person_id) WHERE person_id IS NOT NULL;
CREATE UNIQUE INDEX idx_ie_initiative_org ON initiative_enrollments (initiative_id, organization_id) WHERE organization_id IS NOT NULL;
CREATE INDEX idx_ie_initiative ON initiative_enrollments (initiative_id);
CREATE INDEX idx_ie_person ON initiative_enrollments (person_id);
CREATE INDEX idx_ie_org ON initiative_enrollments (organization_id);

CREATE TABLE interactions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id         uuid REFERENCES persons (id) ON DELETE SET NULL,
  organization_id   uuid REFERENCES organizations (id) ON DELETE SET NULL,
  event_id          uuid REFERENCES events_new (id) ON DELETE SET NULL,
  initiative_id     uuid REFERENCES initiatives (id) ON DELETE SET NULL,
  interaction_type  text NOT NULL,
  channel           text,
  direction         text,
  subject           text,
  body              text,
  status            text DEFAULT 'draft',
  handled_by        text,
  sender_profile_id uuid REFERENCES sender_profiles (id) ON DELETE SET NULL,
  sequence_id       uuid,  -- FK added after sequences table is updated
  sequence_step     int,
  scheduled_at      timestamptz,
  occurred_at       timestamptz,
  detail            jsonb,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);

CREATE INDEX idx_interactions_person ON interactions (person_id);
CREATE INDEX idx_interactions_org ON interactions (organization_id);
CREATE INDEX idx_interactions_event ON interactions (event_id);
CREATE INDEX idx_interactions_initiative ON interactions (initiative_id);
CREATE INDEX idx_interactions_status ON interactions (status);
CREATE INDEX idx_interactions_occurred ON interactions (occurred_at DESC);
CREATE INDEX idx_interactions_type ON interactions (interaction_type);

-- ============================================
-- CORRELATION
-- ============================================

CREATE TABLE correlation_candidates (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type       text NOT NULL,
  source_id         uuid NOT NULL,
  target_id         uuid NOT NULL,
  confidence        float NOT NULL,
  match_reasons     jsonb,
  status            text DEFAULT 'pending',
  resolved_by       text,
  created_at        timestamptz DEFAULT now()
);

CREATE INDEX idx_cc_status ON correlation_candidates (status);
CREATE INDEX idx_cc_entity ON correlation_candidates (entity_type);
CREATE INDEX idx_cc_source ON correlation_candidates (source_id);
CREATE INDEX idx_cc_target ON correlation_candidates (target_id);

-- ============================================
-- SUPPORTING TABLE UPDATES
-- ============================================

-- Rename company_signals → organization_signals
ALTER TABLE company_signals RENAME TO organization_signals;
ALTER TABLE organization_signals RENAME COLUMN company_id TO organization_id;

-- Add initiative_id to sequences
ALTER TABLE sequences ADD COLUMN initiative_id uuid REFERENCES initiatives (id);
CREATE INDEX idx_sequences_initiative ON sequences (initiative_id);

-- Update sequence_enrollments: contact_id → person_id (rename column + repoint FK)
ALTER TABLE sequence_enrollments DROP CONSTRAINT sequence_enrollments_contact_id_fkey;
ALTER TABLE sequence_enrollments RENAME COLUMN contact_id TO person_id;
ALTER TABLE sequence_enrollments ADD CONSTRAINT sequence_enrollments_person_id_fkey FOREIGN KEY (person_id) REFERENCES persons (id) ON DELETE CASCADE;

-- Update inbound_emails FK names (rename columns + repoint FKs)
ALTER TABLE inbound_emails DROP CONSTRAINT IF EXISTS inbound_emails_contact_id_fkey;
ALTER TABLE inbound_emails RENAME COLUMN contact_id TO person_id;
ALTER TABLE inbound_emails ADD CONSTRAINT inbound_emails_person_id_fkey FOREIGN KEY (person_id) REFERENCES persons (id);
ALTER TABLE inbound_emails DROP CONSTRAINT IF EXISTS inbound_emails_correlated_message_id_fkey;
ALTER TABLE inbound_emails RENAME COLUMN correlated_message_id TO correlated_interaction_id;

-- Update uploads column names
ALTER TABLE uploads RENAME COLUMN contacts_created TO persons_created;
ALTER TABLE uploads RENAME COLUMN companies_created TO organizations_created;

-- Add sequence FK to interactions now that sequences is updated
ALTER TABLE interactions ADD CONSTRAINT fk_interactions_sequence FOREIGN KEY (sequence_id) REFERENCES sequences (id) ON DELETE SET NULL;

-- ============================================
-- RENAME events → events_old, events_new → events
-- ============================================
-- Note: Postgres allows renaming tables even when referenced by FKs (it updates internal OIDs).
-- We still need to drop/recreate FKs that should point to the NEW events table.
-- Using DROP CONSTRAINT IF EXISTS for safety since auto-generated constraint names
-- may vary. If the IF EXISTS drops fail, query pg_constraint to find actual names.

ALTER TABLE event_config DROP CONSTRAINT IF EXISTS event_config_event_id_fkey;
ALTER TABLE sequences DROP CONSTRAINT IF EXISTS sequences_event_id_fkey;
ALTER TABLE uploads DROP CONSTRAINT IF EXISTS uploads_event_id_fkey;

-- Clear old data from tables referencing events (starting fresh — seed script will repopulate)
TRUNCATE event_config CASCADE;
TRUNCATE sequence_enrollments CASCADE;
TRUNCATE sequences CASCADE;
TRUNCATE uploads CASCADE;
TRUNCATE inbound_emails CASCADE;
TRUNCATE inbox_sync_state CASCADE;

ALTER TABLE events RENAME TO events_old;
ALTER TABLE events_new RENAME TO events;

ALTER TABLE event_config ADD CONSTRAINT event_config_event_id_fkey FOREIGN KEY (event_id) REFERENCES events (id);
ALTER TABLE sequences ADD CONSTRAINT sequences_event_id_fkey FOREIGN KEY (event_id) REFERENCES events (id);
ALTER TABLE uploads ADD CONSTRAINT uploads_event_id_fkey FOREIGN KEY (event_id) REFERENCES events (id);
