# CRM Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current 18-table schema with a clean-slate relational CRM centered on persons, organizations, events, initiatives, and a unified interactions timeline — then seed from fp-data-seed CSVs and rebuild the admin UI.

**Architecture:** Next.js 16 + Supabase (PostgREST). Server components fetch data; client components handle interactivity. Glass-card UI system with Tailwind CSS v4. All state in Supabase — no client-side state management library. Correlation engine as Postgres functions using pg_trgm.

**Tech Stack:** Next.js 16, React 19, Supabase (PostgREST + RLS), TypeScript 5, Tailwind CSS v4, papaparse (CSV), lucide-react (icons), @hello-pangea/dnd (kanban)

**Spec:** `docs/superpowers/specs/2026-03-22-crm-redesign-design.md`

**Note on testing:** This project has no test framework configured. Verification steps use `npx tsc --noEmit` for type-checking and `npm run build` for build validation. Manual verification against Supabase dashboard for data integrity.

---

## File Structure

### New Files
```
supabase/migrations/
├── 010_crm_redesign_schema.sql        — New tables: persons, organizations, person_organization, events (updated), event_participations, initiatives, initiative_enrollments, interactions, correlation_candidates
├── 011_crm_redesign_rls.sql           — RLS policies for all new tables
├── 012_crm_redesign_functions.sql     — Triggers, views (persons_with_icp), correlation functions, updated_at triggers
├── 013_crm_drop_old_tables.sql        — Drop old tables after data is migrated

lib/types/
├── database.ts                        — REWRITE: All new interfaces matching new schema

scripts/
├── seed-crm.ts                        — Seed script: reads fp-data-seed CSVs, upserts into new tables

app/admin/
├── persons/page.tsx                   — Persons list (replaces contacts)
├── persons/[id]/page.tsx              — Person detail
├── organizations/page.tsx             — Organizations list (replaces companies)
├── organizations/[id]/page.tsx        — Organization detail
├── initiatives/page.tsx               — Initiatives list (new)
├── initiatives/[id]/page.tsx          — Initiative detail (new)
├── correlations/page.tsx              — Correlation review queue (new)

app/api/
├── correlations/merge/route.ts        — Merge/dismiss correlation candidates via RPC

components/admin/
├── person-table.tsx                   — Sortable person table (replaces contact-table)
├── organization-table.tsx             — Sortable org table (replaces company-table)
├── interactions-timeline.tsx          — Unified interaction timeline (replaces message-table)
├── initiative-table.tsx               — Initiative list table
├── correlation-review.tsx             — Side-by-side merge/dismiss UI
```

### Files to Modify
```
components/admin/sidebar.tsx           — Update nav: Contacts→Persons, Companies→Organizations, add Initiatives, Correlations
app/admin/layout.tsx                   — Update event fetch for sidebar to use new events table (slug field)
app/admin/page.tsx                     — Dashboard: update queries to new tables
app/admin/events/page.tsx              — Redesigned event cards with role-type counts
app/admin/events/[id]/page.tsx         — Redesigned with Speakers/Sponsors/Related/Schedule/Initiatives tabs
app/admin/pipeline/page.tsx            — Scoped to initiatives, queries interactions instead of messages
app/admin/pipeline/actions.ts          — Update status mutation to use interactions table
app/admin/sequences/page.tsx           — FK updates (contact→person)
app/admin/sequences/[id]/page.tsx      — FK updates
app/admin/sequences/actions.ts         — FK updates
app/admin/sequences/[id]/enrollment-panel.tsx — FK updates
app/admin/inbox/page.tsx               — FK updates (contact_id→person_id, correlated_message_id→correlated_interaction_id)
app/admin/inbox/inbox-client.tsx       — FK updates
app/admin/uploads/page.tsx             — FK updates (contacts_created→persons_created, companies_created→organizations_created)
app/admin/uploads/actions.ts           — FK updates, use new table names
app/admin/settings/page.tsx            — FK updates for event_config
app/admin/settings/actions.ts          — FK updates
app/admin/enrichment/page.tsx          — Update to target persons instead of contacts
app/api/enrich/route.ts                — Query persons instead of contacts
app/api/inbox/route.ts                 — FK updates
app/api/inbox/sync/route.ts            — FK updates
app/api/messages/generate/route.ts     — Rewrite: generate interactions instead of messages
app/api/messages/send/route.ts         — Rewrite: send interactions
app/api/messages/actions/route.ts      — Rewrite: interaction status updates
app/api/sequences/execute/route.ts     — FK updates
lib/inbox-correlator.ts                — Update to use persons + interactions
lib/types/pipeline.ts                  — Update to use new types
components/admin/pipeline-table.tsx     — Update to use new types
components/admin/kanban-board.tsx       — Update to use new types
components/admin/signals-timeline.tsx   — organization_signals instead of company_signals
components/admin/filter-bar.tsx         — Update filter options
```

### Files to Delete
```
app/admin/contacts/page.tsx
app/admin/contacts/[id]/page.tsx
app/admin/contacts/[id]/generate-button.tsx
app/admin/companies/page.tsx
app/admin/companies/[id]/page.tsx
components/admin/contact-table.tsx
components/admin/company-table.tsx
components/admin/message-table.tsx
components/admin/message-actions.tsx
```

---

## Task 1: Database Migration — New Schema

**Files:**
- Create: `supabase/migrations/010_crm_redesign_schema.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
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

ALTER TABLE events RENAME TO events_old;
ALTER TABLE events_new RENAME TO events;

ALTER TABLE event_config ADD CONSTRAINT event_config_event_id_fkey FOREIGN KEY (event_id) REFERENCES events (id);
ALTER TABLE sequences ADD CONSTRAINT sequences_event_id_fkey FOREIGN KEY (event_id) REFERENCES events (id);
ALTER TABLE uploads ADD CONSTRAINT uploads_event_id_fkey FOREIGN KEY (event_id) REFERENCES events (id);
```

- [ ] **Step 2: Verify SQL syntax is valid**

Review the migration file for any syntax errors. Ensure all FK references point to correct table names. The `events` rename happens at the end so all references are correct.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/010_crm_redesign_schema.sql
git commit -m "feat(db): add CRM redesign schema migration"
```

---

## Task 2: Database Migration — RLS, Triggers, Views

**Files:**
- Create: `supabase/migrations/011_crm_redesign_rls.sql`
- Create: `supabase/migrations/012_crm_redesign_functions.sql`

- [ ] **Step 1: Write RLS policies**

```sql
-- 011_crm_redesign_rls.sql
-- Authenticated full access on all new tables (single-tenant trusted team)

ALTER TABLE persons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access" ON persons FOR ALL USING (auth.uid() IS NOT NULL);

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access" ON organizations FOR ALL USING (auth.uid() IS NOT NULL);

ALTER TABLE person_organization ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access" ON person_organization FOR ALL USING (auth.uid() IS NOT NULL);

ALTER TABLE events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access" ON events FOR ALL USING (auth.uid() IS NOT NULL);

ALTER TABLE event_participations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access" ON event_participations FOR ALL USING (auth.uid() IS NOT NULL);

ALTER TABLE initiatives ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access" ON initiatives FOR ALL USING (auth.uid() IS NOT NULL);

ALTER TABLE initiative_enrollments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access" ON initiative_enrollments FOR ALL USING (auth.uid() IS NOT NULL);

ALTER TABLE interactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access" ON interactions FOR ALL USING (auth.uid() IS NOT NULL);

ALTER TABLE correlation_candidates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access" ON correlation_candidates FOR ALL USING (auth.uid() IS NOT NULL);
```

- [ ] **Step 2: Write functions, triggers, and views**

```sql
-- 012_crm_redesign_functions.sql

-- updated_at trigger function (reuse existing or create)
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to new tables
CREATE TRIGGER trg_persons_updated_at BEFORE UPDATE ON persons FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_organizations_updated_at BEFORE UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_person_org_updated_at BEFORE UPDATE ON person_organization FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_initiatives_updated_at BEFORE UPDATE ON initiatives FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_interactions_updated_at BEFORE UPDATE ON interactions FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- persons_with_icp VIEW
-- ============================================
-- Exposes ICP score from primary org affiliation as a sortable column on persons
CREATE OR REPLACE VIEW persons_with_icp AS
SELECT
  p.*,
  o.name AS primary_org_name,
  o.icp_score,
  o.icp_reason,
  o.category AS org_category,
  po.role AS org_role
FROM persons p
LEFT JOIN person_organization po ON po.person_id = p.id AND po.is_primary = true
LEFT JOIN organizations o ON o.id = po.organization_id;

-- ============================================
-- interaction_status_counts RPC (replaces message_status_counts)
-- ============================================
CREATE OR REPLACE FUNCTION interaction_status_counts()
RETURNS TABLE (status text, count bigint) AS $$
  SELECT status, count(*)::bigint
  FROM interactions
  WHERE status IS NOT NULL
  GROUP BY status;
$$ LANGUAGE sql STABLE;

-- ============================================
-- find_correlations() — fuzzy matching function
-- ============================================
CREATE OR REPLACE FUNCTION find_person_correlations(p_person_id uuid)
RETURNS TABLE (
  target_id uuid,
  confidence float,
  match_reasons jsonb
) AS $$
DECLARE
  p_record RECORD;
BEGIN
  SELECT * INTO p_record FROM persons WHERE id = p_person_id;
  IF NOT FOUND THEN RETURN; END IF;

  RETURN QUERY
  SELECT
    existing.id AS target_id,
    GREATEST(
      -- Exact email match = 0.98
      CASE WHEN p_record.email IS NOT NULL AND existing.email IS NOT NULL
           AND lower(p_record.email) = lower(existing.email) THEN 0.98 ELSE 0.0 END,
      -- Exact LinkedIn match = 0.97
      CASE WHEN p_record.linkedin_url IS NOT NULL AND existing.linkedin_url IS NOT NULL
           AND lower(p_record.linkedin_url) = lower(existing.linkedin_url) THEN 0.97 ELSE 0.0 END,
      -- Exact Twitter match = 0.96
      CASE WHEN p_record.twitter_handle IS NOT NULL AND existing.twitter_handle IS NOT NULL
           AND lower(p_record.twitter_handle) = lower(existing.twitter_handle) THEN 0.96 ELSE 0.0 END,
      -- Fuzzy name similarity
      similarity(p_record.full_name, existing.full_name)
    ) AS confidence,
    jsonb_build_array(
      CASE WHEN p_record.email IS NOT NULL AND existing.email IS NOT NULL
           AND lower(p_record.email) = lower(existing.email) THEN 'exact_email' END,
      CASE WHEN p_record.linkedin_url IS NOT NULL AND existing.linkedin_url IS NOT NULL
           AND lower(p_record.linkedin_url) = lower(existing.linkedin_url) THEN 'exact_linkedin' END,
      CASE WHEN p_record.twitter_handle IS NOT NULL AND existing.twitter_handle IS NOT NULL
           AND lower(p_record.twitter_handle) = lower(existing.twitter_handle) THEN 'exact_twitter' END,
      CASE WHEN similarity(p_record.full_name, existing.full_name) >= 0.6
           THEN 'similar_name:' || round(similarity(p_record.full_name, existing.full_name)::numeric, 2)::text END
    ) - 'null'::jsonb AS match_reasons
  FROM persons existing
  WHERE existing.id != p_person_id
    AND (
      (p_record.email IS NOT NULL AND lower(existing.email) = lower(p_record.email))
      OR (p_record.linkedin_url IS NOT NULL AND lower(existing.linkedin_url) = lower(p_record.linkedin_url))
      OR (p_record.twitter_handle IS NOT NULL AND lower(existing.twitter_handle) = lower(p_record.twitter_handle))
      OR similarity(p_record.full_name, existing.full_name) >= 0.6
    );
END;
$$ LANGUAGE plpgsql STABLE;

-- Similar function for organizations
CREATE OR REPLACE FUNCTION find_org_correlations(p_org_id uuid)
RETURNS TABLE (
  target_id uuid,
  confidence float,
  match_reasons jsonb
) AS $$
DECLARE
  p_record RECORD;
BEGIN
  SELECT * INTO p_record FROM organizations WHERE id = p_org_id;
  IF NOT FOUND THEN RETURN; END IF;

  RETURN QUERY
  SELECT
    existing.id AS target_id,
    GREATEST(
      CASE WHEN p_record.website IS NOT NULL AND existing.website IS NOT NULL
           AND lower(p_record.website) = lower(existing.website) THEN 0.98 ELSE 0.0 END,
      CASE WHEN p_record.linkedin_url IS NOT NULL AND existing.linkedin_url IS NOT NULL
           AND lower(p_record.linkedin_url) = lower(existing.linkedin_url) THEN 0.97 ELSE 0.0 END,
      similarity(p_record.name, existing.name)
    ) AS confidence,
    jsonb_build_array(
      CASE WHEN p_record.website IS NOT NULL AND existing.website IS NOT NULL
           AND lower(p_record.website) = lower(existing.website) THEN 'exact_website' END,
      CASE WHEN p_record.linkedin_url IS NOT NULL AND existing.linkedin_url IS NOT NULL
           AND lower(p_record.linkedin_url) = lower(existing.linkedin_url) THEN 'exact_linkedin' END,
      CASE WHEN similarity(p_record.name, existing.name) >= 0.6
           THEN 'similar_name:' || round(similarity(p_record.name, existing.name)::numeric, 2)::text END
    ) - 'null'::jsonb AS match_reasons
  FROM organizations existing
  WHERE existing.id != p_org_id
    AND (
      (p_record.website IS NOT NULL AND lower(existing.website) = lower(p_record.website))
      OR (p_record.linkedin_url IS NOT NULL AND lower(existing.linkedin_url) = lower(p_record.linkedin_url))
      OR similarity(p_record.name, existing.name) >= 0.6
    );
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================
-- merge_persons() — merge two person records
-- ============================================
CREATE OR REPLACE FUNCTION merge_persons(winner_id uuid, loser_id uuid)
RETURNS void AS $$
BEGIN
  -- Reassign relationships
  UPDATE person_organization SET person_id = winner_id WHERE person_id = loser_id
    ON CONFLICT (person_id, organization_id) DO NOTHING;
  UPDATE event_participations SET person_id = winner_id WHERE person_id = loser_id;
  UPDATE initiative_enrollments SET person_id = winner_id WHERE person_id = loser_id;
  UPDATE interactions SET person_id = winner_id WHERE person_id = loser_id;
  UPDATE sequence_enrollments SET person_id = winner_id WHERE person_id = loser_id;
  UPDATE inbound_emails SET person_id = winner_id WHERE person_id = loser_id;

  -- Fill null fields on winner from loser
  UPDATE persons SET
    email = COALESCE(persons.email, l.email),
    linkedin_url = COALESCE(persons.linkedin_url, l.linkedin_url),
    twitter_handle = COALESCE(persons.twitter_handle, l.twitter_handle),
    telegram_handle = COALESCE(persons.telegram_handle, l.telegram_handle),
    phone = COALESCE(persons.phone, l.phone),
    title = COALESCE(persons.title, l.title),
    bio = COALESCE(persons.bio, l.bio),
    photo_url = COALESCE(persons.photo_url, l.photo_url),
    apollo_id = COALESCE(persons.apollo_id, l.apollo_id)
  FROM persons l
  WHERE persons.id = winner_id AND l.id = loser_id;

  -- Clean up correlation candidates
  DELETE FROM correlation_candidates WHERE source_id = loser_id OR target_id = loser_id;

  -- Delete loser
  DELETE FROM persons WHERE id = loser_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- merge_organizations() — merge two org records
-- ============================================
CREATE OR REPLACE FUNCTION merge_organizations(winner_id uuid, loser_id uuid)
RETURNS void AS $$
BEGIN
  -- Reassign relationships
  UPDATE person_organization SET organization_id = winner_id WHERE organization_id = loser_id
    ON CONFLICT (person_id, organization_id) DO NOTHING;
  UPDATE event_participations SET organization_id = winner_id WHERE organization_id = loser_id;
  UPDATE initiative_enrollments SET organization_id = winner_id WHERE organization_id = loser_id;
  UPDATE interactions SET organization_id = winner_id WHERE organization_id = loser_id;
  UPDATE organization_signals SET organization_id = winner_id WHERE organization_id = loser_id;

  -- Fill null fields on winner from loser
  UPDATE organizations SET
    website = COALESCE(organizations.website, l.website),
    linkedin_url = COALESCE(organizations.linkedin_url, l.linkedin_url),
    description = COALESCE(organizations.description, l.description),
    logo_url = COALESCE(organizations.logo_url, l.logo_url),
    category = COALESCE(organizations.category, l.category),
    context = COALESCE(organizations.context, l.context),
    usp = COALESCE(organizations.usp, l.usp),
    icp_score = COALESCE(organizations.icp_score, l.icp_score),
    icp_reason = COALESCE(organizations.icp_reason, l.icp_reason)
  FROM organizations l
  WHERE organizations.id = winner_id AND l.id = loser_id;

  -- Clean up correlation candidates
  DELETE FROM correlation_candidates WHERE source_id = loser_id OR target_id = loser_id;

  -- Delete loser
  DELETE FROM organizations WHERE id = loser_id;
END;
$$ LANGUAGE plpgsql;
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/011_crm_redesign_rls.sql supabase/migrations/012_crm_redesign_functions.sql
git commit -m "feat(db): add RLS policies, triggers, views, and correlation functions"
```

---

## Task 3: TypeScript Types

**Files:**
- Rewrite: `lib/types/database.ts`
- Modify: `lib/types/pipeline.ts`

- [ ] **Step 1: Rewrite database.ts with all new interfaces**

Replace the entire file. New interfaces: `Person`, `Organization`, `PersonOrganization`, `Event` (updated with slug/event_type), `EventParticipation`, `Initiative`, `InitiativeEnrollment`, `Interaction`, `CorrelationCandidate`, `OrganizationSignal`. Keep unchanged: `SenderProfile`, `EventConfig`, `PromptTemplate`, `AutomationRule`, `JobLog`, `Sequence` (add initiative_id), `SequenceStep`, `SequenceEnrollment` (person_id), `Upload` (renamed columns), `InboxSyncState`, `InboundEmail` (person_id, correlated_interaction_id).

Key type definitions:

```typescript
export type InteractionType = "cold_email" | "cold_linkedin" | "cold_twitter" | "warm_intro" | "meeting" | "call" | "event_encounter" | "note" | "research";
export type InteractionChannel = "email" | "linkedin" | "twitter" | "telegram" | "in_person" | "phone";
export type InteractionDirection = "outbound" | "inbound" | "internal";
export type InteractionStatus = "draft" | "scheduled" | "sending" | "sent" | "delivered" | "opened" | "replied" | "bounced" | "failed";
export type ParticipationRole = "speaker" | "attendee" | "organizer" | "panelist" | "mc" | "sponsor" | "partner" | "exhibitor" | "media";
export type SponsorTier = "presented_by" | "platinum" | "diamond" | "emerald" | "gold" | "silver" | "bronze" | "copper" | "community";

export interface PersonWithIcp extends Person {
  primary_org_name: string | null;
  icp_score: number | null;
  icp_reason: string | null;
  org_category: string | null;
  org_role: string | null;
}
```

- [ ] **Step 2: Update pipeline.ts**

Update `PipelineContact` type to reference `Person` instead of `Contact`, use `interaction` status instead of message status.

```typescript
export interface PipelineContact {
  id: string;
  full_name: string;
  company_name: string | null;
  icp_score: number | null;
  channel: string | null;
  pipeline_stage: string;
  last_updated: string;
}
```

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: No type errors (there will be import errors in other files — that's expected, we'll fix those in later tasks)

- [ ] **Step 4: Commit**

```bash
git add lib/types/database.ts lib/types/pipeline.ts
git commit -m "feat(types): rewrite TypeScript types for CRM redesign schema"
```

---

## Task 4: Data Seeding Script

**Files:**
- Create: `scripts/seed-crm.ts`

- [ ] **Step 1: Write the seeding script**

The script should:
1. Read all 7 CSVs from `fp-data-seed/` using papaparse
2. Create events: "EthCC 9" (slug: ethcc-9) and "DC Blockchain Summit 2026" (slug: dc-blockchain-2026)
3. Import EthCC speakers → persons + person_organization (org from `organization` column) + event_participations(role=speaker, track from trackSlug)
4. Import EthCC sponsors → organizations + event_participations(role=sponsor, tier)
5. Import DC Blockchain speakers → persons + event_participations(role=speaker). Parse org from `title` field (split on comma, take last part)
6. Import DC Blockchain sponsors → organizations + event_participations(role=sponsor, tier)
7. Import Genzio Sheet3 → organizations (Company Name, Website, Category/Sector, "Why This Is a Fit" → context, "Potential Entry Angle" → usp) + persons (Target Person, Email, Telegram) + person_organization + initiative ("FP Block Partnerships") + initiative_enrollments with priority
8. Import Genzio Intros Made → minimal warm_intro interactions with `detail: { introducer }`
9. Run correlation pass: call `find_person_correlations()` and `find_org_correlations()` for each record via RPC, insert results into correlation_candidates. For confidence >= 0.95 (exact email/linkedin/twitter match), auto-merge immediately by calling `merge_persons()` or `merge_organizations()` RPC. For 0.6-0.95, just insert as pending candidates for human review. Note: this is O(n) RPC calls (~700 persons + ~600 orgs). Expected runtime: 1-3 minutes. Log progress every 50 records.

**CSV quality handling:**
- Skip entirely empty rows (all fields empty/whitespace)
- **All Genzio CSVs have leading empty rows and a leading empty column** (every row starts with a comma). Use robust header detection: scan for the first row with >2 non-empty fields, treat that as the header. After parsing, drop any column with an empty-string key (the leading comma artifact).
- For Exploration Leads: header is approximately line 5 (auto-detect, don't hardcode)
- For Intros Made: header is approximately line 5-6 (auto-detect), only ~7 data rows, very sparse (only Company Name and Introducer populated)
- Deduplicate Sheet3 vs Exploration Leads: they appear to be the same ~685 rows. Use Sheet3 as primary. After importing Sheet3, compare Exploration Leads by company name — only import rows from Exploration Leads that have a company name NOT already imported from Sheet3.
- **Exact filenames:**
  - `fp-data-seed/EthCC/ethcc9_speakers.csv`
  - `fp-data-seed/EthCC/ethcc9_sponsors.csv`
  - `fp-data-seed/DC-blockchain/dcbs2026_speakers.csv`
  - `fp-data-seed/DC-blockchain/dcbs2026_sponsors.csv`
  - `fp-data-seed/Genzio/FP Block Leads - Sheet3.csv`
  - `fp-data-seed/Genzio/FP Block Leads - Exploration Leads.csv`
  - `fp-data-seed/Genzio/FP Block Leads - Intros Made.csv`

**Key implementation details:**
- Use `@supabase/supabase-js` with service role key from `.env.local`
- Use papaparse with `header: true, skipEmptyLines: true`
- Batch upserts in groups of 50
- Log progress: "Imported X persons, Y organizations, Z event_participations"

- [ ] **Step 2: Test the script locally**

Run: `npx tsx scripts/seed-crm.ts`
Expected: Script completes without errors, logs import counts.

- [ ] **Step 3: Verify data in Supabase dashboard**

Check: persons table has records, organizations has records, event_participations links them to events, initiative_enrollments exist for Genzio data.

- [ ] **Step 4: Commit**

```bash
git add scripts/seed-crm.ts
git commit -m "feat(scripts): add CRM data seeding script for fp-data-seed CSVs"
```

---

## Task 5: Drop Old Tables Migration

**Files:**
- Create: `supabase/migrations/013_crm_drop_old_tables.sql`

- [ ] **Step 1: Write the drop migration**

```sql
-- 013_crm_drop_old_tables.sql
-- Drop old tables after data has been seeded into new schema
-- Run AFTER seed-crm.ts has been executed successfully

-- Drop junction tables first (they reference the core tables)
DROP TABLE IF EXISTS contact_event CASCADE;
DROP TABLE IF EXISTS company_event CASCADE;
DROP TABLE IF EXISTS contact_company CASCADE;

-- Drop core tables
DROP TABLE IF EXISTS messages CASCADE;
DROP TABLE IF EXISTS contacts CASCADE;
DROP TABLE IF EXISTS companies CASCADE;
DROP TABLE IF EXISTS events_old CASCADE;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/013_crm_drop_old_tables.sql
git commit -m "feat(db): add migration to drop old CRM tables"
```

---

## Task 6: Sidebar Navigation Update

**Files:**
- Modify: `components/admin/sidebar.tsx`

- [ ] **Step 1: Update nav items**

Replace the `mainNavItems` array:
- "Contacts" → "Persons" (href: `/admin/persons`, icon: Users)
- "Companies" → "Organizations" (href: `/admin/organizations`, icon: Building2)
- Add "Initiatives" after Pipeline (href: `/admin/initiatives`, icon: Rocket from lucide-react)
- Add "Correlations" after Enrichment (href: `/admin/correlations`, icon: GitMerge from lucide-react)
- Keep everything else the same

- [ ] **Step 2: Commit**

```bash
git add components/admin/sidebar.tsx
git commit -m "feat(ui): update sidebar navigation for CRM redesign"
```

---

## Task 7: Persons List & Detail Pages

**Files:**
- Create: `app/admin/persons/page.tsx`
- Create: `app/admin/persons/[id]/page.tsx`
- Create: `components/admin/person-table.tsx`
- Create: `components/admin/interactions-timeline.tsx`
- Modify: `components/admin/filter-bar.tsx` — update filter options to use new entity names (persons/organizations instead of contacts/companies)

- [ ] **Step 1: Create person-table.tsx**

Sortable table component. Props: `persons: PersonWithIcp[]` plus optional event/interaction data for display.

Columns: ICP score (color badge), Name (linked to detail), Organization, Title, Channels (email/linkedin/twitter/telegram icons — show if field is non-null), Last Interaction (date), Interaction Count.

Follow the exact same patterns as the existing `contact-table.tsx` for sort headers, glass styling, and row hover effects. Reference `components/admin/contact-table.tsx` for the implementation pattern.

- [ ] **Step 2: Create interactions-timeline.tsx**

Reusable timeline component. Props: `interactions: Interaction[]`, optional filters.

Renders a chronological feed:
- Each entry: type icon (Mail for email, Linkedin for linkedin, MessageSquare for meeting, etc.), channel badge, direction arrow (↗ outbound, ↙ inbound, ↔ internal), status pill, subject/preview, timestamp
- Expandable: click to show full body + detail JSONB rendered as key-value pairs
- Filter bar: by interaction_type, channel, direction (dropdowns)

Reference `components/admin/message-table.tsx` for the expandable row pattern and glass styling.

- [ ] **Step 3: Create persons list page**

Server component. Fetches from `persons_with_icp` view using `fetchAll()` from `lib/supabase/fetch-all.ts`. Also fetch interactions for last-interaction-date and count (aggregate query or RPC).

Pass data to a client wrapper that handles search (name/email filter), ICP range filter, event filter (via event_participations join), and source filter.

Reference `app/admin/contacts/page.tsx` for the exact data fetching + client filtering pattern.

- [ ] **Step 4: Create person detail page**

Server component at `app/admin/persons/[id]/page.tsx`. Fetches:
- Person record
- `person_organization` with nested organization data (all affiliations)
- `event_participations` with nested event data
- `interactions` ordered by `occurred_at DESC` or `created_at DESC`
- `initiative_enrollments` with nested initiative data

Layout:
- Header: Name, title @ primary org, ICP badge
- Contact info card: email, linkedin, twitter, telegram, phone, source
- Bio section (if exists)
- Organizations section: list of affiliations with role, role_type, is_current badge
- Events section: list of event participations with role, track, talk_title
- Initiatives section: list of enrollments with status, priority
- Interactions timeline: full `InteractionsTimeline` component with all interactions

Reference `app/admin/contacts/[id]/page.tsx` for layout pattern.

- [ ] **Step 5: Verify build**

Run: `npx tsc --noEmit` — fix any type errors
Run: `npm run build` — verify pages compile

- [ ] **Step 6: Commit**

```bash
git add app/admin/persons/ components/admin/person-table.tsx components/admin/interactions-timeline.tsx
git commit -m "feat(ui): add persons list and detail pages with interactions timeline"
```

---

## Task 8: Organizations List & Detail Pages

**Files:**
- Create: `app/admin/organizations/page.tsx`
- Create: `app/admin/organizations/[id]/page.tsx`
- Create: `components/admin/organization-table.tsx`

- [ ] **Step 1: Create organization-table.tsx**

Sortable table. Columns: ICP score, Name (linked), Category, Person Count, Signals Count, Last Signal Date, Events (badges with sponsor tier).

Reference `components/admin/company-table.tsx` for pattern.

- [ ] **Step 2: Create organizations list page**

Server component. Fetch organizations with:
- `person_organization` count (for person count)
- `organization_signals` count + latest date
- `event_participations` where organization_id is set (with nested event data for badges)

Client wrapper handles search, ICP range filter, category filter.

Reference `app/admin/companies/page.tsx`.

- [ ] **Step 3: Create organization detail page**

Server component. Fetches:
- Organization record
- `organization_signals` ordered by date desc
- `person_organization` with nested person data (the roster)
- `interactions` where organization_id matches
- `event_participations` with nested event data

Layout:
- Header: Name, category, ICP badge
- Info card: description, context, USP, ICP reason, website, linkedin
- Signals timeline (reuse `components/admin/signals-timeline.tsx` — update prop types from company_id to organization_id)
- Events section: list with relationship_type, sponsor_tier, location
- People roster: person-table component scoped to this org
- Interactions timeline: scoped to this org

Reference `app/admin/companies/[id]/page.tsx`.

- [ ] **Step 4: Update signals-timeline.tsx**

Rename internal references from `CompanySignal` to `OrganizationSignal`. Update the interface import.

- [ ] **Step 5: Verify build**

Run: `npx tsc --noEmit` and `npm run build`

- [ ] **Step 6: Commit**

```bash
git add app/admin/organizations/ components/admin/organization-table.tsx components/admin/signals-timeline.tsx
git commit -m "feat(ui): add organizations list and detail pages"
```

---

## Task 9: Events Pages Redesign

**Files:**
- Rewrite: `app/admin/events/page.tsx`
- Rewrite: `app/admin/events/[id]/page.tsx`

- [ ] **Step 1: Rewrite events list page**

Event cards with role-type counts. For each event, query `event_participations`:
- Speaker count: `WHERE person_id IS NOT NULL AND role = 'speaker'`
- Sponsor count: `WHERE organization_id IS NOT NULL AND role = 'sponsor'`
- Related contacts count: count of persons in sponsoring orgs (via person_organization join to event_participations orgs) who don't have their own event_participation

Display: event name, date range, location, event_type badge, speaker/sponsor/related-contact counts.

Reference existing `app/admin/events/page.tsx` for card grid layout.

- [ ] **Step 2: Rewrite event detail page with tabs**

Tabbed interface using existing `Tabs` component pattern. 5 tabs:

**Speakers tab:** person-table showing event_participations WHERE role='speaker', joined with persons. Columns: name, org (from person_organization), talk_title, track, time_slot.

**Sponsors tab:** organization-table showing event_participations WHERE role='sponsor', joined with organizations. Columns: name, tier badge, category, person count.

**Related Contacts tab:** Persons from sponsoring orgs who are NOT directly in event_participations. Query: persons via person_organization → organizations that have event_participations with role='sponsor'. Exclude persons already in event_participations for this event. Show "Mark as confirmed" button that creates an event_participation with role='attendee', confirmed=true.

**Schedule tab:** Group event_participations by time_slot or track. Display as a simple grid/list grouped by day/track.

**Initiatives tab:** Query initiatives WHERE event_id = this event. Show initiative-table with name, type, status, owner, enrollment count.

Reference existing `app/admin/events/[id]/page.tsx` for tab pattern.

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit` and `npm run build`

- [ ] **Step 4: Commit**

```bash
git add app/admin/events/
git commit -m "feat(ui): redesign events pages with speakers/sponsors/related/schedule/initiatives tabs"
```

---

## Task 10: Initiatives Pages (New)

**Files:**
- Create: `app/admin/initiatives/page.tsx`
- Create: `app/admin/initiatives/[id]/page.tsx`
- Create: `components/admin/initiative-table.tsx`

- [ ] **Step 1: Create initiative-table.tsx**

Simple sortable table. Columns: Name (linked), Type badge, Status badge, Owner, Event (linked if present), Enrollments count, Interactions count.

- [ ] **Step 2: Create initiatives list page**

Server component. Fetch all initiatives with:
- Nested event data (name, slug)
- initiative_enrollments count
- interactions count (WHERE initiative_id = id)

Client wrapper: filter by status, initiative_type, owner, event.

- [ ] **Step 3: Create initiative detail page**

Server component. Fetches:
- Initiative record with event data
- initiative_enrollments with nested person/organization data
- interactions scoped to this initiative
- sequences where initiative_id matches (with enrollment progress)

Layout:
- Header: name, type badge, status badge, owner, event link
- Enrolled Persons section: person-table of enrolled persons with priority/status
- Enrolled Organizations section: organization-table of enrolled orgs with priority/status
- Sequences section: list of linked sequences with step count and enrollment count
- Interactions timeline: scoped to this initiative

- [ ] **Step 4: Verify build**

Run: `npx tsc --noEmit` and `npm run build`

- [ ] **Step 5: Commit**

```bash
git add app/admin/initiatives/ components/admin/initiative-table.tsx
git commit -m "feat(ui): add initiatives list and detail pages"
```

---

## Task 11: Correlation Review Page (New)

**Files:**
- Create: `app/admin/correlations/page.tsx`
- Create: `components/admin/correlation-review.tsx`

- [ ] **Step 1: Create correlation-review.tsx**

Client component. Props: `candidates: CorrelationCandidate[]` with nested person/org data for both source and target.

For each candidate:
- Side-by-side cards showing source vs target record fields
- Confidence score bar (color-coded: green >= 0.9, yellow >= 0.7, orange >= 0.6)
- Match reasons as badges
- Two action buttons: "Merge" (calls merge_persons/merge_orgs RPC) and "Dismiss" (updates status to 'dismissed')

- [ ] **Step 2: Create correlations page**

Server component. Fetch correlation_candidates WHERE status='pending', ordered by confidence DESC. For each candidate, fetch the source and target person/org records.

Display: count of pending candidates, then the CorrelationReview component.

- [ ] **Step 3: Add merge API route**

Create `app/api/correlations/merge/route.ts`:
- POST handler: receives `{ candidate_id, winner_id, loser_id, entity_type }`
- Calls `merge_persons(winner_id, loser_id)` RPC for persons
- For organizations: similar merge logic (reassign person_organization, event_participations, initiative_enrollments, interactions, organization_signals)
- Updates correlation_candidate status to 'merged'

- [ ] **Step 4: Verify build**

Run: `npx tsc --noEmit` and `npm run build`

- [ ] **Step 5: Commit**

```bash
git add app/admin/correlations/ components/admin/correlation-review.tsx app/api/correlations/
git commit -m "feat(ui): add correlation review page with merge/dismiss actions"
```

---

## Task 12: Pipeline Update

**Files:**
- Modify: `app/admin/pipeline/page.tsx`
- Modify: `app/admin/pipeline/actions.ts`
- Modify: `components/admin/pipeline-table.tsx`
- Modify: `components/admin/kanban-board.tsx`
- Modify: `components/admin/kanban-column.tsx`
- Modify: `components/admin/drag-card.tsx`

- [ ] **Step 1: Update pipeline page data fetching**

Replace contacts/messages queries with persons/interactions:
- Fetch persons (from `persons_with_icp` view)
- Fetch interactions (id, person_id, status, channel, initiative_id)
- Compute pipeline stage from most advanced interaction status per person (same STATUS_RANK logic, just using interactions)
- Add initiative filter: dropdown to scope pipeline to a specific initiative
- Fetch initiatives for filter dropdown

- [ ] **Step 2: Update pipeline components**

Update all pipeline components to use `Person` instead of `Contact`, `Interaction` instead of `Message`. Update imports from `lib/types/database.ts` and `lib/types/pipeline.ts`.

- [ ] **Step 3: Update pipeline actions**

`actions.ts`: update status mutation to write to `interactions` table instead of `messages`.

- [ ] **Step 4: Verify build**

Run: `npx tsc --noEmit` and `npm run build`

- [ ] **Step 5: Commit**

```bash
git add app/admin/pipeline/ components/admin/pipeline-table.tsx components/admin/kanban-board.tsx components/admin/kanban-column.tsx components/admin/drag-card.tsx
git commit -m "feat(ui): update pipeline to use interactions and initiative scoping"
```

---

## Task 13: Dashboard Update

**Files:**
- Modify: `app/admin/page.tsx`

- [ ] **Step 1: Update dashboard queries**

Replace:
- `contacts` count → `persons` count
- `companies` count → `organizations` count
- `message_status_counts()` RPC → `interaction_status_counts()` RPC
- Pipeline stage computation: use interactions instead of messages
- Recent activity: job_log stays the same
- Quick action links: "Upload CSV" stays, "Run Enrichment" stays, "Review Drafts" → links to interactions with status=draft

- [ ] **Step 2: Verify build**

Run: `npm run build`

- [ ] **Step 3: Commit**

```bash
git add app/admin/page.tsx
git commit -m "feat(ui): update dashboard for CRM redesign"
```

---

## Task 14: Update Sequences, Inbox, Uploads, Settings, Enrichment

**Files:**
- Modify: `app/admin/sequences/page.tsx`
- Modify: `app/admin/sequences/[id]/page.tsx`
- Modify: `app/admin/sequences/actions.ts`
- Modify: `app/admin/sequences/sequence-list-client.tsx`
- Modify: `app/admin/sequences/[id]/enrollment-panel.tsx`
- Modify: `app/admin/sequences/[id]/sequence-controls.tsx`
- Modify: `app/admin/inbox/page.tsx`
- Modify: `app/admin/inbox/inbox-client.tsx`
- Modify: `app/admin/uploads/page.tsx`
- Modify: `app/admin/uploads/actions.ts`
- Modify: `app/admin/settings/page.tsx`
- Modify: `app/admin/settings/actions.ts`
- Modify: `app/admin/enrichment/page.tsx`

- [ ] **Step 1: Update sequences module**

- Import `Person` instead of `Contact`, `Sequence` (now has initiative_id)
- `sequence_enrollments.contact_id` → `person_id` in all queries
- Enrollment panel: show person full_name instead of contact full_name
- Sequence list: add initiative name column (join via initiative_id)

- [ ] **Step 2: Update inbox module**

- `inbound_emails.contact_id` → `person_id` in queries
- `correlated_message_id` → `correlated_interaction_id`
- Import `Person` instead of `Contact`
- Display person name instead of contact name in email list

- [ ] **Step 3: Update uploads module**

- `contacts_created` → `persons_created` in queries and display
- `companies_created` → `organizations_created`
- Import action: update `importCsvData` to insert into `persons`/`organizations` instead of `contacts`/`companies`
- Column mapper: update field options (full_name, email, company_name → org_name, etc.)

- [ ] **Step 4: Update settings module**

- Event config stays the same (events table structure preserved)
- Update any references to old type names

- [ ] **Step 5: Update enrichment module**

- Target "persons" instead of "contacts" in UI text and API calls
- Update `app/api/enrich/route.ts` to query `persons` table

- [ ] **Step 6: Verify build**

Run: `npx tsc --noEmit` and `npm run build`

- [ ] **Step 7: Commit**

```bash
git add app/admin/sequences/ app/admin/inbox/ app/admin/uploads/ app/admin/settings/ app/admin/enrichment/ app/api/enrich/
git commit -m "feat(ui): update sequences, inbox, uploads, settings, enrichment for CRM redesign"
```

---

## Task 15: Update API Routes & Lib

**Files:**
- Modify: `app/api/messages/generate/route.ts`
- Modify: `app/api/messages/send/route.ts`
- Modify: `app/api/messages/actions/route.ts`
- Modify: `app/api/sequences/execute/route.ts`
- Modify: `app/api/inbox/route.ts`
- Modify: `app/api/inbox/sync/route.ts`
- Modify: `lib/inbox-correlator.ts`

- [ ] **Step 1: Update message API routes**

These routes now create/update `interactions` instead of `messages`:
- `generate/route.ts`: Insert into `interactions` with interaction_type='cold_email'/'cold_linkedin'/etc., move channel/sequence metadata into the interaction record
- `send/route.ts`: Update `interactions.status` instead of `messages.status`
- `actions/route.ts`: Update `interactions` status fields

- [ ] **Step 2: Update sequence execution**

`execute/route.ts`: Query `sequence_enrollments.person_id` instead of `contact_id`. Create `interactions` instead of `messages` for each step.

- [ ] **Step 3: Update inbox routes**

- `route.ts`: Query `inbound_emails.person_id` instead of `contact_id`
- `sync/route.ts`: Correlate against `persons` instead of `contacts`

- [ ] **Step 4: Update inbox-correlator.ts**

Update the correlation engine to match inbound emails against `persons.email` and `interactions` instead of `contacts.email` and `messages`. Update the `correlated_interaction_id` field name.

- [ ] **Step 5: Verify build**

Run: `npx tsc --noEmit` and `npm run build`

- [ ] **Step 6: Commit**

```bash
git add app/api/ lib/inbox-correlator.ts
git commit -m "feat(api): update API routes and inbox correlator for CRM redesign"
```

---

## Task 16: Update Layout & Delete Old Files

**Files:**
- Modify: `app/admin/layout.tsx`
- Delete: `app/admin/contacts/page.tsx`
- Delete: `app/admin/contacts/[id]/page.tsx`
- Delete: `app/admin/contacts/[id]/generate-button.tsx`
- Delete: `app/admin/companies/page.tsx`
- Delete: `app/admin/companies/[id]/page.tsx`
- Delete: `components/admin/contact-table.tsx`
- Delete: `components/admin/company-table.tsx`
- Delete: `components/admin/message-table.tsx`
- Delete: `components/admin/message-actions.tsx`

- [ ] **Step 1: Update layout.tsx**

The layout fetches events for the sidebar. Update the query to use the new `events` table (which now has `slug`). The shape is the same — just ensure the query works with the renamed table.

- [ ] **Step 2: Delete old files**

```bash
rm -rf app/admin/contacts app/admin/companies
rm components/admin/contact-table.tsx components/admin/company-table.tsx components/admin/message-table.tsx components/admin/message-actions.tsx
```

- [ ] **Step 3: Final build verification**

Run: `npx tsc --noEmit` — should be zero errors
Run: `npm run build` — should complete successfully

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(ui): update layout, delete old contacts/companies/messages files"
```

---

## Task 17: Apply Migrations & Seed Data

**Note:** This task requires access to the Supabase project. Run migrations via Supabase dashboard or CLI.

- [ ] **Step 1: Apply migration 010 (new schema)**

Run via Supabase SQL editor or `supabase db push`:
```bash
supabase db push
```
Or paste `010_crm_redesign_schema.sql` into the Supabase SQL editor and execute.

- [ ] **Step 2: Apply migration 011 (RLS)**

Paste and execute `011_crm_redesign_rls.sql`.

- [ ] **Step 3: Apply migration 012 (functions/views)**

Paste and execute `012_crm_redesign_functions.sql`.

- [ ] **Step 4: Run seed script**

```bash
npx tsx scripts/seed-crm.ts
```

Verify output: should report counts for persons, organizations, event_participations, initiatives, initiative_enrollments, interactions, correlation_candidates.

- [ ] **Step 5: Apply migration 013 (drop old tables)**

Only after verifying seed data looks correct in Supabase dashboard.
Paste and execute `013_crm_drop_old_tables.sql`.

- [ ] **Step 6: Verify application works end-to-end**

```bash
npm run dev
```

Open http://localhost:3000/admin and verify:
- Dashboard loads with correct counts
- Persons list shows seeded data
- Person detail shows affiliations, events, timeline
- Organizations list shows seeded orgs with ICP scores
- Events show speakers/sponsors in correct tabs
- Initiatives list shows "FP Block Partnerships"
- Correlations page shows any flagged duplicates
- Pipeline scopes to initiatives

- [ ] **Step 7: Commit any fixes**

```bash
git add -A
git commit -m "fix: post-migration adjustments"
```

---

## Execution Order & Dependencies

```
Task 1 (Schema) ──→ Task 2 (RLS/Functions) ──→ Task 5 (Drop Old - write only)
     │
     ↓
Task 3 (Types) ──→ Task 4 (Seed Script)
     │
     ├──→ Task 6 (Sidebar) ──────────────────────────────────────┐
     ├──→ Task 7 (Persons) ──────────────────────────────────────┤
     ├──→ Task 8 (Organizations) ────────────────────────────────┤
     ├──→ Task 9 (Events) ──────────────────────────────────────┤
     ├──→ Task 10 (Initiatives) ────────────────────────────────┤
     ├──→ Task 11 (Correlations) ───────────────────────────────┤
     ├──→ Task 12 (Pipeline) ──────────────────────────────────┤
     ├──→ Task 13 (Dashboard) ─────────────────────────────────┤  All converge
     ├──→ Task 14 (Sequences/Inbox/Uploads/Settings/Enrichment)┤  ──→ Task 16 (Delete Old)
     └──→ Task 15 (API Routes) ────────────────────────────────┘       ──→ Task 17 (Apply & Seed)
```

**Parallelizable tasks (after Task 3 completes):** Tasks 6-15 can all be executed in parallel by independent agents since they touch different files. Task 16 depends on all of them. Task 17 is the final integration step.
