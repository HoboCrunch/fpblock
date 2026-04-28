# Database Reference

Canonical schema reference for the FP Block Cannes outreach platform. Generated from `supabase/migrations/*.sql` (the source of truth) and cross-checked against `lib/types/database.ts` and `lib/queries/**`.

If anything here disagrees with the migrations on disk, the migrations win — fix this doc.

- DB: Supabase Postgres
- Extensions: `uuid-ossp`, `pg_trgm`, `pg_cron`, `pg_net`
- Generated types: `lib/types/database.ts` (hand-maintained, not codegen)
- Realtime publication includes: `inbound_emails`, `interactions`, `job_log`, `persons`, `organizations` (`supabase/migrations/021_enable_realtime.sql:2`)

---

## 1. Migration history

23 migrations on disk (numbers 001–025; 006 and 018 are intentionally absent — 018 was reserved for "people finder" but required no schema changes per the prior doc).

| # | File | Purpose |
|---|------|---------|
| 001 | `supabase/migrations/001_schema.sql` | Original schema: `contacts`, `companies`, `events`, `messages`, `event_config`, `sender_profiles`, `prompt_templates`, junction tables (`contact_company`, `contact_event`, `company_event`), `automation_rules`, `job_log`, `company_signals`. **Mostly superseded by 010.** |
| 002 | `supabase/migrations/002_rls.sql` | Enables RLS on every original table; one "Authenticated full access" policy each. |
| 003 | `supabase/migrations/003_triggers.sql` | `update_updated_at()` fn + triggers on `contacts`/`companies`/`prompt_templates`; `notify_automation()` `pg_notify` trigger fn + triggers on `contacts`/`companies`/`contact_company`. |
| 004 | `supabase/migrations/004_cron.sql` | `pg_cron` + `pg_net` extensions. Two cron jobs: `send-scheduled` (`0 * * * *`) and `sync-status` (`30 * * * *`) hitting Supabase Edge Functions. |
| 005 | `supabase/migrations/005_rpc.sql` | Original `message_status_counts()` RPC (later replaced by `interaction_status_counts()` in 012). |
| 007 | `supabase/migrations/007_sequences_uploads_inbox.sql` | Adds `sequences`, `sequence_enrollments`, `uploads`, `inbox_sync_state` (seeded with two accounts), `inbound_emails`. Adds `messages.replied_at`. Re-creates `message_status_counts()`. |
| 008 | `supabase/migrations/008_sequence_status.sql` | Adds `sequences.status` text with CHECK in (`draft`,`active`,`paused`,`completed`). |
| 009 | `supabase/migrations/009_rls_new_tables.sql` | RLS on the 007 tables. |
| 010 | `supabase/migrations/010_crm_redesign_schema.sql` | **CRM redesign.** Creates `persons`, `organizations`, `person_organization`, `events_new`, `event_participations`, `initiatives`, `initiative_enrollments`, `interactions`, `correlation_candidates`. Renames `company_signals` → `organization_signals`. Renames `inbound_emails.contact_id` → `person_id`, `correlated_message_id` → `correlated_interaction_id`. Renames `uploads.contacts_created/companies_created` → `persons_created/organizations_created`. Renames `events_new` → `events` (after `events` → `events_old`). |
| 011 | `supabase/migrations/011_crm_redesign_rls.sql` | RLS on every new CRM table (single policy each, `auth.uid() IS NOT NULL`). |
| 012 | `supabase/migrations/012_crm_redesign_functions.sql` | `update_updated_at()` triggers on new tables; `persons_with_icp` view; `interaction_status_counts()` RPC; `find_person_correlations()`, `find_org_correlations()`; `merge_persons()`, `merge_organizations()`. |
| 013 | `supabase/migrations/013_crm_drop_old_tables.sql` | Drops `contact_event`, `company_event`, `contact_company`, `messages`, `contacts`, `companies`, `events_old`. |
| 014 | `supabase/migrations/014_crm_upsert_constraints.sql` | `organizations_name_unique` UNIQUE constraint. Rewrites correlation fns to use proper jsonb array filtering (the original used invalid `jsonb - 'null'::jsonb`). |
| 015 | `supabase/migrations/015_crm_enrollment_constraint_and_correlation_fix.sql` | Re-adds partial unique indexes on `initiative_enrollments` for upsert support. `initiatives_name_unique`. Final correlation fn rewrite (proper VALUES + WHERE filter). |
| 016 | `supabase/migrations/016_inbox_sync_cron.sql` | Cron jobs `sync-inbox-jb` (`*/15 * * * *`) and `sync-inbox-wes` (`1-59/15 * * * *`) that POST to the Next.js `/api/inbox/sync` route. **Hardcoded `https://YOUR_APP_URL` placeholder must be replaced post-deploy.** |
| 017 | `supabase/migrations/017_fix_persons_with_icp_view.sql` | Rewrites `persons_with_icp` view with `DISTINCT ON (p.id)` ORDER BY `po.created_at DESC` to deduplicate when a person has multiple `is_primary = true` rows. |
| 019 | `supabase/migrations/019_company_context.sql` | Singleton `company_context` table + RLS + seeded with default ICP framework, positioning, language rules. |
| 020 | `supabase/migrations/020_person_lists.sql` | `person_lists`, `person_list_items` (saved lists for targeting). RLS on both. |
| 021 | `supabase/migrations/021_enable_realtime.sql` | Adds 5 tables to the `supabase_realtime` publication. |
| 022 | `supabase/migrations/022_enrichment_status.sql` | Adds `organizations.enrichment_status` (default `'none'`), `enrichment_stages jsonb`, `last_enriched_at`. Adds `persons.enrichment_status`, `persons.last_enriched_at`. Indexes + backfill (orgs with `icp_score` → `'complete'`; persons with `apollo_id` → `'complete'`). |
| 023 | `supabase/migrations/023_sequences_redesign.sql` | Adds `sequences.send_mode` (`'approval'`), `sequences.sender_id` FK, `sequences.schedule_config jsonb`. Migrates `steps` JSONB body/subject from raw strings into `ComposableTemplate` blocks. Drops `prompt_template_id` from each step. |
| 024 | `supabase/migrations/024_org_firmographic_columns.sql` | Adds `organizations.industry`, `employee_count`, `annual_revenue`, `founded_year`, `hq_location`, `funding_total`, `latest_funding_stage` + indexes on `industry` and `employee_count`. |
| 025 | `supabase/migrations/025_person_event_affiliations.sql` | New table `person_event_affiliations` + indexes + RLS. Two trigger functions (`tg_pea_sync_from_person_org`, `tg_pea_sync_from_event_participation`) keep it in sync from both sides. Idempotent backfill at the bottom. |

Numbers 006 and 018 are skipped intentionally — no files exist in `supabase/migrations/`.

---

## 2. Schema by domain

### 2.1 CRM core

#### `persons` (`010_crm_redesign_schema.sql:11`)

The permanent identity record. One row per real human.

| Column | Type | Null | Default | Notes |
|--------|------|------|---------|-------|
| `id` | uuid PK | NO | `gen_random_uuid()` | |
| `full_name` | text | NO | — | Display name |
| `first_name` | text | YES | — | |
| `last_name` | text | YES | — | |
| `email` | text | YES | — | Lowercase compare in correlation |
| `linkedin_url` | text | YES | — | |
| `twitter_handle` | text | YES | — | Handle or URL |
| `telegram_handle` | text | YES | — | |
| `phone` | text | YES | — | |
| `title` | text | YES | — | Current role/title |
| `seniority` | text | YES | — | |
| `department` | text | YES | — | |
| `bio` | text | YES | — | |
| `photo_url` | text | YES | — | |
| `source` | text | YES | — | First-touch origin (e.g. `org_enrichment`, `direct_enrichment`, csv source). Never overwritten after creation. |
| `apollo_id` | text | YES | — | |
| `notes` | text | YES | — | |
| `enrichment_status` | text | NO | `'none'` | `'none' \| 'in_progress' \| 'complete' \| 'failed'` (`022_enrichment_status.sql:8`) |
| `last_enriched_at` | timestamptz | YES | — | |
| `created_at` | timestamptz | NO | `now()` | |
| `updated_at` | timestamptz | NO | `now()` | Maintained by trigger |

**Indexes:** `idx_persons_email`, `idx_persons_apollo_id`, `idx_persons_full_name_trgm` (GIN, `gin_trgm_ops`), `idx_persons_linkedin`, `idx_persons_twitter`, `idx_persons_enrichment_status`.

**Triggers:** `trg_persons_updated_at` (BEFORE UPDATE → `update_updated_at()`).

#### `organizations` (`010_crm_redesign_schema.sql:39`)

Companies, DAOs, foundations, agencies.

| Column | Type | Null | Default | Notes |
|--------|------|------|---------|-------|
| `id` | uuid PK | NO | `gen_random_uuid()` | |
| `name` | text | NO | — | UNIQUE since 014 (`organizations_name_unique`) |
| `website` | text | YES | — | |
| `linkedin_url` | text | YES | — | |
| `category` | text | YES | — | "L1/L2", "Exchange", "VC", etc. |
| `description` | text | YES | — | |
| `logo_url` | text | YES | — | |
| `icp_score` | int | YES | — | 0–100; ≥75 qualifying, ≥90 Tier 1 |
| `icp_reason` | text | YES | — | |
| `context` | text | YES | — | |
| `usp` | text | YES | — | Outreach angle |
| `notes` | text | YES | — | |
| `industry` | text | YES | — | (`024:4`) |
| `employee_count` | int | YES | — | (`024:5`) |
| `annual_revenue` | text | YES | — | |
| `founded_year` | int | YES | — | |
| `hq_location` | text | YES | — | |
| `funding_total` | text | YES | — | |
| `latest_funding_stage` | text | YES | — | |
| `enrichment_status` | text | NO | `'none'` | `'none' \| 'in_progress' \| 'partial' \| 'complete' \| 'failed'` (per type defs) |
| `enrichment_stages` | jsonb | NO | `'{}'` | Per-stage log; **treat as a log, not the source of truth** — see CLAUDE.md feedback "enrichment data truth". |
| `last_enriched_at` | timestamptz | YES | — | |
| `created_at` | timestamptz | NO | `now()` | |
| `updated_at` | timestamptz | NO | `now()` | Trigger |

**Indexes:** `idx_organizations_name_trgm` (GIN), `idx_organizations_icp_score`, `idx_organizations_website`, `idx_organizations_enrichment_status`, `idx_organizations_industry`, `idx_organizations_employee_count`.

**Constraints:** UNIQUE on `name` (added in 014; required for PostgREST `upsert` by name).

**Triggers:** `trg_organizations_updated_at`.

#### `person_organization` (`010_crm_redesign_schema.sql:60`)

Affiliations. A person can belong to multiple orgs.

| Column | Type | Null | Default | Notes |
|--------|------|------|---------|-------|
| `id` | uuid PK | NO | `gen_random_uuid()` | |
| `person_id` | uuid | NO | — | FK `persons(id)` ON DELETE CASCADE |
| `organization_id` | uuid | NO | — | FK `organizations(id)` ON DELETE CASCADE |
| `role` | text | YES | — | "CEO", "Head of BD", etc. |
| `role_type` | text | YES | — | "founder", "executive", "employee", "advisor" |
| `is_current` | bool | YES | `true` | |
| `is_primary` | bool | YES | `false` | Drives `persons_with_icp` view |
| `source` | text | YES | — | e.g. `org_enrichment`, `direct_enrichment` |
| `created_at` | timestamptz | NO | `now()` | |
| `updated_at` | timestamptz | NO | `now()` | Trigger |

**Constraints:** UNIQUE `(person_id, organization_id)`.
**Indexes:** `idx_person_org_person`, `idx_person_org_org`.
**Triggers:** `trg_person_org_updated_at`; `trg_pea_sync_from_person_org` AFTER INSERT/UPDATE/DELETE → maintains `person_event_affiliations`.

#### `events` (`010_crm_redesign_schema.sql:78`, originally `events_new`, renamed to `events` at the bottom of 010)

| Column | Type | Null | Default | Notes |
|--------|------|------|---------|-------|
| `id` | uuid PK | NO | `gen_random_uuid()` | |
| `name` | text | NO | — | "EthCC 9", "Consensus 2026" |
| `slug` | text | YES | — | UNIQUE |
| `location` | text | YES | — | |
| `date_start` | date | YES | — | |
| `date_end` | date | YES | — | |
| `website` | text | YES | — | |
| `event_type` | text | YES | — | "conference", "side_event", "meetup" |
| `notes` | text | YES | — | |
| `created_at` | timestamptz | NO | `now()` | |

**Indexes:** `idx_events_slug`, `idx_events_date`.

#### `event_participations` (`010_crm_redesign_schema.sql:98`)

Direct person-or-org participation. Exclusive-or constraint.

| Column | Type | Null | Default | Notes |
|--------|------|------|---------|-------|
| `id` | uuid PK | NO | `gen_random_uuid()` | |
| `event_id` | uuid | NO | — | FK `events(id)` CASCADE |
| `person_id` | uuid | YES | — | FK `persons(id)` CASCADE |
| `organization_id` | uuid | YES | — | FK `organizations(id)` CASCADE |
| `role` | text | NO | — | Person: speaker/attendee/organizer/panelist/mc; Org: sponsor/partner/exhibitor/media |
| `sponsor_tier` | text | YES | — | presented_by/platinum/diamond/emerald/gold/silver/bronze/copper/community |
| `confirmed` | bool | YES | `true` | `false` = inferred |
| `talk_title` | text | YES | — | |
| `time_slot` | text | YES | — | |
| `track` | text | YES | — | |
| `room` | text | YES | — | |
| `notes` | text | YES | — | |

**Constraints:**
- `CHECK ((person_id IS NULL) != (organization_id IS NULL))` — exactly one set.
- Partial UNIQUE `idx_ep_event_person_role (event_id, person_id, role) WHERE person_id IS NOT NULL`.
- Partial UNIQUE `idx_ep_event_org_role (event_id, organization_id, role) WHERE organization_id IS NOT NULL`.

**Indexes:** `idx_ep_event`, `idx_ep_person`, `idx_ep_org`.
**Triggers:** `trg_pea_sync_from_event_participation` AFTER INSERT OR DELETE — maintains `person_event_affiliations`. UPDATE is intentionally NOT in the trigger (role/sponsor_tier changes don't affect affiliation).

#### `person_event_affiliations` (`025_person_event_affiliations.sql:11`)

Indirect person↔event link maintained by triggers — *never* written by application code.

| Column | Type | Null | Default | Notes |
|--------|------|------|---------|-------|
| `id` | uuid PK | NO | `gen_random_uuid()` | |
| `event_id` | uuid | NO | — | FK `events(id)` CASCADE |
| `person_id` | uuid | NO | — | FK `persons(id)` CASCADE |
| `via_organization_id` | uuid | NO | — | FK `organizations(id)` CASCADE |
| `created_at` | timestamptz | NO | `now()` | |
| `updated_at` | timestamptz | NO | `now()` | |

**Constraint:** UNIQUE `(event_id, person_id, via_organization_id)`. A person can have multiple rows for the same event when affiliated through multiple orgs.

**Indexes:** `idx_pea_event`, `idx_pea_person`, `idx_pea_via_org`, `idx_pea_event_person`.

**Trigger semantics (see `025_person_event_affiliations.sql:35-120`):**

`tg_pea_sync_from_person_org` ON `person_organization`:
- INSERT with `is_current=true` → INSERT row for every existing `event_participations` on that org.
- UPDATE of `person_id` or `organization_id` → DELETE old + INSERT new (when `is_current=true`).
- UPDATE of `is_current` `false → true` → INSERT.
- UPDATE of `is_current` `true → false` → **no-op** ("Rule B: person stays affiliated for the event they were at").
- DELETE → DELETE all rows for that `(person_id, via_organization_id)` pair.

`tg_pea_sync_from_event_participation` ON `event_participations`:
- INSERT with `organization_id IS NOT NULL` → INSERT for every `is_current=true` `person_organization` on that org.
- DELETE with `organization_id IS NOT NULL` → DELETE for that `(event_id, via_organization_id)` pair.
- UPDATE → no trigger.

**Access pattern:** `lib/queries/event-persons.ts` → `getPersonIdsForEvent(supabase, eventId, relation)` with `relation: "direct" | "org_affiliated" | "either" | "both"`. Do not hand-join `event_participations ↔ person_organization`.

#### `person_lists` / `person_list_items` (`020_person_lists.sql`)

Saved lists for targeting in enrichment, sequences, and initiatives.

`person_lists`:

| Column | Type | Null | Default |
|--------|------|------|---------|
| `id` | uuid PK | NO | `gen_random_uuid()` |
| `name` | text | NO | — |
| `description` | text | YES | — |
| `created_at` | timestamptz | NO | `now()` |
| `updated_at` | timestamptz | NO | `now()` (trigger `trg_person_lists_updated_at`) |

`person_list_items`:

| Column | Type | Null | Default |
|--------|------|------|---------|
| `id` | uuid PK | NO | `gen_random_uuid()` |
| `list_id` | uuid | NO | FK `person_lists(id)` CASCADE |
| `person_id` | uuid | NO | FK `persons(id)` CASCADE |
| `added_at` | timestamptz | NO | `now()` |

**Constraint:** UNIQUE `(list_id, person_id)`. **Indexes:** `idx_person_list_items_list`, `idx_person_list_items_person`.

### 2.2 Enrichment

Enrichment is a cross-cutting concern stored on `persons` and `organizations` rather than in dedicated tables.

**Status fields (added in 022 + revised types):**
- `organizations.enrichment_status`: `'none' | 'in_progress' | 'partial' | 'complete' | 'failed'`
- `organizations.enrichment_stages jsonb` — per-stage log, e.g. `{"apollo_org": {"status": "success", "at": "..."}, "gemini_icp": {"status": "fail", "error": "..."}}`. **This is a log, not a source of truth.** Derive whether enrichment "produced results" from actual columns (`icp_score`, `description`, `enriched_person_count`) — see CLAUDE.md `feedback_enrichment_data_truth`.
- `organizations.last_enriched_at timestamptz`.
- `persons.enrichment_status`: `'none' | 'in_progress' | 'complete' | 'failed'`. (No `'partial'`.)
- `persons.last_enriched_at timestamptz`.

**Firmographic columns (24):** see `organizations` row layout above (`industry`, `employee_count`, `annual_revenue`, `founded_year`, `hq_location`, `funding_total`, `latest_funding_stage`). Apollo writes these directly during the org-enrichment stage.

**Source tagging convention:**
- `persons.source = 'org_enrichment'` for persons created by the people-finder stage.
- `person_organization.source = 'org_enrichment'` for links created by people-finder.
- `person_organization.source = 'direct_enrichment'` for links created by the persons-pipeline reverse-org-link logic.
- `persons.source` is set on creation only and never overwritten.

### 2.3 Sequences

Templates and enrollments for outreach sequences.

#### `sequences` (`007_sequences_uploads_inbox.sql:2`, augmented by 008, 010, 023)

| Column | Type | Null | Default | Notes |
|--------|------|------|---------|-------|
| `id` | uuid PK | NO | `gen_random_uuid()` | |
| `name` | text | NO | — | |
| `channel` | text | NO | — | "email", "linkedin", etc. |
| `event_id` | uuid | YES | — | FK `events(id)` (rebound to new events table in 010) |
| `initiative_id` | uuid | YES | — | FK `initiatives(id)` (added in 010) |
| `steps` | jsonb | NO | `'[]'` | Array of step objects (schema below) |
| `status` | text | YES | `'draft'` | CHECK in (`draft`,`active`,`paused`,`completed`) (added in 008) |
| `send_mode` | text | NO | `'approval'` | (`023:1`) `'auto' \| 'approval'` |
| `sender_id` | uuid | YES | — | FK `sender_profiles(id)` (`023:2`) |
| `schedule_config` | jsonb | NO | `'{}'` | `SequenceSchedule` shape (timing_mode, send_window, anchor_date/direction) (`023:3`) |
| `created_at` | timestamptz | YES | `now()` | |
| `updated_at` | timestamptz | YES | `now()` | |

**Indexes:** `idx_sequences_event`, `idx_sequences_initiative`.

**Steps schema** (post-023; see `lib/types/database.ts:292`):
```jsonc
[
  {
    "step_number": 1,
    "delay_days": 0,
    "action_type": "initial",          // | "follow_up" | "break_up"
    "subject_template": { "blocks": [{"type": "text", "content": "..."}] } | null,
    "body_template":    { "blocks": [{"type": "text", "content": "..."} | {"type":"ai","prompt":"...","tone":"...","max_tokens":150}] }
  }
]
```
Migration 023 rewrote pre-existing rows from raw `subject_template`/`body_template` strings into `ComposableTemplate` blocks and dropped per-step `prompt_template_id`.

#### `sequence_enrollments` (`007_sequences_uploads_inbox.sql:12`, repointed in 010)

| Column | Type | Null | Default | Notes |
|--------|------|------|---------|-------|
| `id` | uuid PK | NO | `gen_random_uuid()` | |
| `sequence_id` | uuid | YES | — | FK `sequences(id)` CASCADE |
| `person_id` | uuid | YES | — | FK `persons(id)` CASCADE (renamed from `contact_id` in 010) |
| `current_step` | int | YES | `0` | |
| `status` | text | YES | `'active'` | CHECK in (`active`,`paused`,`completed`,`bounced`) |
| `enrolled_at` | timestamptz | YES | `now()` | |

**Constraint:** UNIQUE `(sequence_id, person_id)`. **Indexes:** `idx_sequence_enrollments_sequence`, `idx_sequence_enrollments_contact` (kept its old name).

#### `interactions` (`010_crm_redesign_schema.sql:156`)

Replaces the original `messages` table. Single timeline for cold emails, LinkedIn DMs, Twitter DMs, warm intros, meetings, calls, event encounters, internal notes, and research.

| Column | Type | Null | Default | Notes |
|--------|------|------|---------|-------|
| `id` | uuid PK | NO | `gen_random_uuid()` | |
| `person_id` | uuid | YES | — | FK `persons(id)` SET NULL |
| `organization_id` | uuid | YES | — | FK `organizations(id)` SET NULL |
| `event_id` | uuid | YES | — | FK `events(id)` SET NULL |
| `initiative_id` | uuid | YES | — | FK `initiatives(id)` SET NULL |
| `interaction_type` | text | NO | — | `cold_email \| cold_linkedin \| cold_twitter \| warm_intro \| meeting \| call \| event_encounter \| note \| research` |
| `channel` | text | YES | — | `email \| linkedin \| twitter \| telegram \| in_person \| phone` |
| `direction` | text | YES | — | `outbound \| inbound \| internal` |
| `subject` | text | YES | — | |
| `body` | text | YES | — | |
| `status` | text | YES | `'draft'` | `draft → scheduled → sending → sent → delivered → opened → clicked → replied`; terminal `bounced`/`failed` |
| `handled_by` | text | YES | — | Genzio team member |
| `sender_profile_id` | uuid | YES | — | FK `sender_profiles(id)` SET NULL |
| `sequence_id` | uuid | YES | — | FK `sequences(id)` SET NULL (added at the bottom of 010) |
| `sequence_step` | int | YES | — | |
| `scheduled_at` | timestamptz | YES | — | |
| `occurred_at` | timestamptz | YES | — | |
| `detail` | jsonb | YES | — | Type-specific fields |
| `created_at` | timestamptz | YES | `now()` | |
| `updated_at` | timestamptz | YES | `now()` | Trigger |

**Indexes:** `idx_interactions_person`, `idx_interactions_org`, `idx_interactions_event`, `idx_interactions_initiative`, `idx_interactions_status`, `idx_interactions_occurred` (DESC), `idx_interactions_type`.

**`detail` shapes by `interaction_type`:**
- `warm_intro`: `{ introducer, relationship_strength, target_outcome, intro_status, follow_up_date }`
- `meeting`: `{ location, attendees[], outcome, follow_up_date }`
- `cold_email`: `{ iteration, cta, message_id_header }`
- `research`: `{ findings, sources[] }`

### 2.4 Inbox / messaging

#### `inbox_sync_state` (`007_sequences_uploads_inbox.sql:46`)

Per-account JMAP cursor state for Fastmail polling.

| Column | Type | Null | Default | Notes |
|--------|------|------|---------|-------|
| `id` | uuid PK | NO | `gen_random_uuid()` | |
| `account_email` | text | NO | — | UNIQUE |
| `last_sync_at` | timestamptz | YES | — | |
| `last_email_id` | text | YES | — | JMAP cursor |
| `unread_count` | int | YES | `0` | |
| `status` | text | YES | `'connected'` | CHECK in (`connected`,`error`,`disconnected`) |
| `error_message` | text | YES | — | |
| `updated_at` | timestamptz | YES | `now()` | |

Seeded with `jb@gofpblock.com` and `wes@gofpblock.com`.

#### `inbound_emails` (`007_sequences_uploads_inbox.sql:62`, repointed in 010)

| Column | Type | Null | Default | Notes |
|--------|------|------|---------|-------|
| `id` | uuid PK | NO | `gen_random_uuid()` | |
| `account_email` | text | NO | — | |
| `message_id` | text | NO | — | UNIQUE — JMAP email ID, dedup key |
| `from_address` | text | NO | — | |
| `from_name` | text | YES | — | |
| `subject` | text | YES | — | |
| `body_preview` | text | YES | — | First 500 chars |
| `body_html` | text | YES | — | |
| `received_at` | timestamptz | NO | — | |
| `is_read` | bool | YES | `false` | |
| `person_id` | uuid | YES | — | FK `persons(id)` (renamed from `contact_id` in 010) |
| `correlated_interaction_id` | uuid | YES | — | (renamed from `correlated_message_id` in 010; **FK was dropped on rename and not re-added** — this is now a loose uuid pointing into `interactions.id`) |
| `correlation_type` | text | YES | — | CHECK in (`exact_email`,`domain_match`,`manual`,`none`) |
| `raw_headers` | jsonb | YES | — | In-Reply-To, References |
| `created_at` | timestamptz | YES | `now()` | |

**Indexes:** `idx_inbound_emails_account`, `idx_inbound_emails_contact` (kept old name; really person), `idx_inbound_emails_received` (DESC), `idx_inbound_emails_from`.

### 2.5 Initiatives & enrollment

#### `initiatives` (`010_crm_redesign_schema.sql:124`)

Campaigns / workstreams.

| Column | Type | Null | Default | Notes |
|--------|------|------|---------|-------|
| `id` | uuid PK | NO | `gen_random_uuid()` | |
| `name` | text | NO | — | UNIQUE since 015 (`initiatives_name_unique`) |
| `initiative_type` | text | YES | — | "cold_outreach", "partnership", "event_prep", "research" |
| `event_id` | uuid | YES | — | FK `events(id)` |
| `status` | text | YES | `'active'` | "active", "paused", "completed" |
| `owner` | text | YES | — | |
| `notes` | text | YES | — | |
| `created_at` | timestamptz | YES | `now()` | |
| `updated_at` | timestamptz | YES | `now()` | Trigger |

**Indexes:** `idx_initiatives_event`, `idx_initiatives_status`.

#### `initiative_enrollments` (`010_crm_redesign_schema.sql:139`)

| Column | Type | Null | Default | Notes |
|--------|------|------|---------|-------|
| `id` | uuid PK | NO | `gen_random_uuid()` | |
| `initiative_id` | uuid | NO | — | FK `initiatives(id)` CASCADE |
| `person_id` | uuid | YES | — | FK `persons(id)` CASCADE |
| `organization_id` | uuid | YES | — | FK `organizations(id)` CASCADE |
| `status` | text | YES | `'active'` | "active", "paused", "completed", "removed" |
| `priority` | text | YES | — | high/medium/low |
| `enrolled_at` | timestamptz | YES | `now()` | |

**Constraints:** XOR `CHECK ((person_id IS NULL) != (organization_id IS NULL))`. Partial UNIQUE `(initiative_id, person_id) WHERE person_id IS NOT NULL` — original from 010 + duplicate-but-idempotent re-add `idx_ie_upsert_person/org` in 015 for PostgREST upsert support. **Indexes:** `idx_ie_initiative`, `idx_ie_person`, `idx_ie_org`.

### 2.6 Auxiliary

#### `correlation_candidates` (`010_crm_redesign_schema.sql:191`)

Staging table for fuzzy-match review.

| Column | Type | Null | Default | Notes |
|--------|------|------|---------|-------|
| `id` | uuid PK | NO | `gen_random_uuid()` | |
| `entity_type` | text | NO | — | "person" or "organization" |
| `source_id` | uuid | NO | — | New/incoming record |
| `target_id` | uuid | NO | — | Possible existing match |
| `confidence` | float | NO | — | 0.0 – 1.0 |
| `match_reasons` | jsonb | YES | — | e.g. `["exact_email", "similar_name:0.92"]` |
| `status` | text | YES | `'pending'` | "pending", "merged", "dismissed" |
| `resolved_by` | text | YES | — | |
| `created_at` | timestamptz | YES | `now()` | |

**Indexes:** `idx_cc_status`, `idx_cc_entity`, `idx_cc_source`, `idx_cc_target`.

**Confidence policy:**
- ≥ 0.95 → auto-merge (exact email 0.98, exact LinkedIn 0.97, exact Twitter 0.96, exact website 0.98).
- 0.6 – 0.95 → flag for review (pg_trgm name similarity).
- < 0.6 → no match, create new.

#### `uploads` (`007_sequences_uploads_inbox.sql:27`, columns renamed in 010)

| Column | Type | Null | Default | Notes |
|--------|------|------|---------|-------|
| `id` | uuid PK | NO | `gen_random_uuid()` | |
| `filename` | text | NO | — | |
| `row_count` | int | YES | — | |
| `persons_created` | int | YES | `0` | (renamed from `contacts_created`) |
| `organizations_created` | int | YES | `0` | (renamed from `companies_created`) |
| `event_id` | uuid | YES | — | FK `events(id)` (rebound to new events in 010) |
| `status` | text | YES | `'processing'` | CHECK in (`processing`,`completed`,`failed`) |
| `errors` | jsonb | YES | — | |
| `uploaded_by` | uuid | YES | — | Auth user id (no FK to `auth.users`) |
| `created_at` | timestamptz | YES | `now()` | |

**Index:** `idx_uploads_event`.

#### `sender_profiles` (`001_schema.sql:64`)

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `name` | text NOT NULL | "JB" or "Wes" |
| `email` | text | |
| `heyreach_account_id` | text | |
| `signature` | text | |
| `tone_notes` | text | AI persona instructions |
| `created_at` | timestamptz | |

#### `prompt_templates` (`001_schema.sql:75`)

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `name` | text NOT NULL | |
| `channel` | text | |
| `system_prompt` | text NOT NULL | |
| `user_prompt_template` | text NOT NULL | |
| `created_at` / `updated_at` | timestamptz | |

#### `event_config` (`001_schema.sql:86`)

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `event_id` | uuid FK `events(id)` | UNIQUE (rebound in 010 to new events) |
| `sender_id` | uuid FK `sender_profiles(id)` | |
| `cta_url` | text | |
| `cta_text` | text | |
| `prompt_template_id` | uuid FK `prompt_templates(id)` | |
| `notify_emails` | text[] | |
| `created_at` | timestamptz | |

#### `organization_signals` (originally `company_signals`; `001_schema.sql:118`, renamed in `010:213`)

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `organization_id` | uuid FK `organizations(id)` CASCADE | (renamed from `company_id`) |
| `signal_type` | text NOT NULL | news/funding/partnership/product_launch/regulatory/hiring/award |
| `description` | text NOT NULL | |
| `date` | date | |
| `source` | text | |
| `created_at` | timestamptz | |

Index `idx_company_signals_company_id` was created in 001 and **not renamed**. The column underneath was renamed to `organization_id`, but the index name still says `company_id`.

#### `automation_rules` (`001_schema.sql:164`)

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `name` | text NOT NULL | |
| `trigger_table` | text NOT NULL | |
| `trigger_event` | text NOT NULL | INSERT/UPDATE |
| `conditions` | jsonb | e.g. `{"icp_score": {"gte": 75}}` |
| `action` | text NOT NULL | |
| `action_params` | jsonb | |
| `enabled` | bool | default `false` |
| `created_at` | timestamptz | |

Driven via `pg_notify('automation_trigger', ...)` from `notify_automation()` (`003_triggers.sql:30`).

#### `job_log` (`001_schema.sql:177`)

Audit trail for background ops.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `job_type` | text NOT NULL | enrich_contact, send_message, inbox_correlation, etc. |
| `target_table` | text | |
| `target_id` | uuid | |
| `status` | text NOT NULL | "started", "completed", "failed" |
| `error` | text | |
| `metadata` | jsonb | |
| `created_at` | timestamptz | DESC indexed |

**Index:** `idx_job_log_created_at` (DESC).

#### `company_context` (`019_company_context.sql:4`)

Singleton table holding the FP Block company profile. Editable via Settings > Company Profile. Used verbatim in Gemini ICP prompts and outreach generation.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `company_name` | text NOT NULL | default `'FP Block'` |
| `about` | text | |
| `icp_criteria` | text | The 4-of-5 framework |
| `positioning` | text | |
| `language_rules` | text | "lead with permanence/ownership/irreversibility; avoid blockchain/Web3/crypto" |
| `outreach_strategy` | text | |
| `updated_at` | timestamptz NOT NULL | trigger `trg_company_context_updated_at` |

Seed row inserted by 019 with the production ICP/positioning/language-rules content.

---

## 3. RLS model

**Posture:** single-tenant trusted team. Every table has RLS enabled, with one permissive `FOR ALL USING (auth.uid() IS NOT NULL)` policy named `"Authenticated full access"`. Anonymous users see nothing; the `service_role` bypasses RLS as usual.

**Tables with RLS + this policy** (created in 002, 009, 011, 019, 020, 025):

| Table | Policy file |
|-------|-------------|
| `persons` | 011 |
| `organizations` | 011 |
| `person_organization` | 011 |
| `events` | 011 |
| `event_participations` | 011 |
| `initiatives` | 011 |
| `initiative_enrollments` | 011 |
| `interactions` | 011 |
| `correlation_candidates` | 011 |
| `sequences` | 009 |
| `sequence_enrollments` | 009 |
| `uploads` | 009 |
| `inbox_sync_state` | 009 |
| `inbound_emails` | 009 |
| `sender_profiles` | 002 (table created in 001) |
| `prompt_templates` | 002 |
| `event_config` | 002 |
| `organization_signals` (formerly `company_signals`) | 002 (policy travels with the table on rename) |
| `automation_rules` | 002 |
| `job_log` | 002 |
| `company_context` | 019 |
| `person_lists` | 020 |
| `person_list_items` | 020 |
| `person_event_affiliations` | 025 |

Plain English: anyone signed in via Supabase Auth can do anything. There is no per-user data partitioning. Server-side calls that need to bypass auth (cron, webhooks, edge functions) use the service-role key.

---

## 4. RPCs

All defined in `supabase/migrations/012_crm_redesign_functions.sql` (with rewrites in 014 and 015 fixing jsonb-array filtering bugs in the original implementation).

### `interaction_status_counts() → TABLE(status text, count bigint)` (`012:38`)
```sql
SELECT status, count(*)::bigint FROM interactions WHERE status IS NOT NULL GROUP BY status;
```
LANGUAGE sql STABLE. Powers the dashboard status widget. Replaces the legacy `message_status_counts()` (defined in 005 and again in 007 against the now-dropped `messages` table — those references are dead but not explicitly dropped).

### `find_person_correlations(p_person_id uuid) → TABLE(target_id uuid, confidence float, match_reasons jsonb)` (current impl `015:16`)
For a candidate person, returns potential duplicates by:
- Exact lowercase email → confidence 0.98
- Exact lowercase LinkedIn URL → 0.97
- Exact lowercase Twitter handle → 0.96
- pg_trgm `similarity(full_name)` ≥ 0.6 → use the trigram score
Match reasons array contains any of `'exact_email'`, `'exact_linkedin'`, `'exact_twitter'`, `'similar_name:<0.NN>'`.

### `find_org_correlations(p_org_id uuid) → TABLE(target_id uuid, confidence float, match_reasons jsonb)` (current impl `015:61`)
Same pattern: website 0.98, linkedin 0.97, name trigram ≥ 0.6.

### `merge_persons(winner_id uuid, loser_id uuid) → void` (`012:142`)
Repoints all loser FKs to winner across `person_organization`, `event_participations`, `initiative_enrollments`, `interactions`, `sequence_enrollments`, `inbound_emails`. Pre-deletes `person_organization` rows that would violate the `(person_id, organization_id)` UNIQUE before the UPDATE. COALESCEs winner's null fields from loser. Deletes loser correlation candidates and the loser row itself.

**NOT updated by this fn (gap to know about):** `person_event_affiliations`. Affiliations belonging to the loser would currently orphan or duplicate after merge unless the trigger is re-fired (the trigger only watches `person_organization`, which the merge does update). Verify before relying on merge in production.

### `merge_organizations(winner_id uuid, loser_id uuid) → void` (`012:180`)
Same pattern across `person_organization`, `event_participations`, `initiative_enrollments`, `interactions`, `organization_signals`. COALESCEs winner null fields.

### `update_updated_at() → trigger` (`003_triggers.sql:6`, recreated `012:4`)
Standard `NEW.updated_at = now()` trigger fn shared by every table that has an `updated_at`.

### `notify_automation() → trigger` (`003_triggers.sql:30`)
`pg_notify('automation_trigger', json{ table, event, id })`. Currently only attached to legacy tables (`contacts`, `companies`, `contact_company`) which were dropped in 013, so this function is effectively orphaned — nothing fires it post-redesign.

### Trigger functions for `person_event_affiliations`
- `tg_pea_sync_from_person_org()` (`025:35`)
- `tg_pea_sync_from_event_participation()` (`025:92`)
See section 2.1 for behaviour.

### Legacy / orphaned
- `message_status_counts()` (`005`, redefined `007:86`) — references the dropped `messages` table; calling it post-013 errors.

---

## 5. Views

### `persons_with_icp` (current definition `017_fix_persons_with_icp_view.sql:2`)

```sql
CREATE OR REPLACE VIEW persons_with_icp AS
SELECT DISTINCT ON (p.id)
  p.*,
  o.name      AS primary_org_name,
  o.icp_score,
  o.icp_reason,
  o.category  AS org_category,
  po.role     AS org_role
FROM persons p
LEFT JOIN person_organization po ON po.person_id = p.id AND po.is_primary = true
LEFT JOIN organizations o ON o.id = po.organization_id
ORDER BY p.id, po.created_at DESC;
```

`DISTINCT ON (p.id)` was added in 017 to fix duplicate rows when a person has multiple `is_primary = true` rows on `person_organization`. Tie-break: most recently created primary affiliation wins.

The TS shape (`PersonWithIcp` in `lib/types/database.ts:206`) extends `Person` with `primary_org_name`, `icp_score`, `icp_reason`, `org_category`, `org_role`.

No materialized views exist.

---

## 6. Triggers

| Trigger | Table | Fires | Function | Source |
|---------|-------|-------|----------|--------|
| `trg_persons_updated_at` | `persons` | BEFORE UPDATE | `update_updated_at()` | `012:13` |
| `trg_organizations_updated_at` | `organizations` | BEFORE UPDATE | `update_updated_at()` | `012:14` |
| `trg_person_org_updated_at` | `person_organization` | BEFORE UPDATE | `update_updated_at()` | `012:15` |
| `trg_initiatives_updated_at` | `initiatives` | BEFORE UPDATE | `update_updated_at()` | `012:16` |
| `trg_interactions_updated_at` | `interactions` | BEFORE UPDATE | `update_updated_at()` | `012:17` |
| `trg_company_context_updated_at` | `company_context` | BEFORE UPDATE | `update_updated_at()` | `019:16` |
| `trg_person_lists_updated_at` | `person_lists` | BEFORE UPDATE | `update_updated_at()` | `020:12` |
| `trg_pea_sync_from_person_org` | `person_organization` | AFTER INSERT/UPDATE/DELETE | `tg_pea_sync_from_person_org()` | `025:84` |
| `trg_pea_sync_from_event_participation` | `event_participations` | AFTER INSERT/DELETE | `tg_pea_sync_from_event_participation()` | `025:118` |

Originally created on tables now dropped (kept here for completeness):

| Trigger | Original table | Status |
|---------|---------------|--------|
| `trg_contacts_updated_at` | `contacts` | Gone with table (013) |
| `trg_companies_updated_at` | `companies` | Gone with table (013) |
| `trg_prompt_templates_updated_at` | `prompt_templates` | Still attached |
| `trg_contacts_automation` | `contacts` | Gone with table (013) |
| `trg_companies_automation` | `companies` | Gone with table (013) |
| `trg_contact_company_automation` | `contact_company` | Gone with table (013) |

---

## 7. Cron jobs

Both jobs use `pg_cron` with `pg_net` HTTP POST. Three scheduled jobs total.

### `send-scheduled` (`004_cron.sql:14`)
- Schedule: `0 * * * *` (top of every hour)
- Action: `POST {SUPABASE_URL}/functions/v1/send-message` with service-role bearer auth
- Uses `current_setting('app.settings.supabase_url')` and `app.settings.secret_key` (must be set via `ALTER DATABASE … SET …`)

### `sync-status` (`004_cron.sql:30`)
- Schedule: `30 * * * *` (every hour at :30)
- Action: `POST {SUPABASE_URL}/functions/v1/sync-status`

### `sync-inbox-jb` (`016_inbox_sync_cron.sql:17`)
- Schedule: `*/15 * * * *` (`:00`, `:15`, `:30`, `:45`)
- Action: `POST https://YOUR_APP_URL/api/inbox/sync` body `{"accountEmail":"jb@gofpblock.com"}`
- **Hardcoded `YOUR_APP_URL` placeholder** — must be updated post-deploy.

### `sync-inbox-wes` (`016_inbox_sync_cron.sql:33`)
- Schedule: `1-59/15 * * * *` (`:01`, `:16`, `:31`, `:46`) — offset by 1 min from JB
- Same pattern, body `{"accountEmail":"wes@gofpblock.com"}`

Both inbox cron entries are guarded by `cron.unschedule(...) WHERE EXISTS` so the migration is idempotent.

---

## 8. Conventions

- **Timestamps:** every table has `created_at timestamptz NOT NULL DEFAULT now()`. Tables that mutate also have `updated_at` driven by `update_updated_at()` BEFORE-UPDATE triggers.
- **PKs:** uuid via `gen_random_uuid()` (Postgres built-in; the `uuid-ossp` extension is enabled by 001 but `gen_random_uuid()` is from `pgcrypto`/built-in).
- **Soft deletes:** none. Deletes are real. Junction tables CASCADE; `interactions` and `inbound_emails` SET NULL.
- **XOR junction pattern:** `event_participations` and `initiative_enrollments` use `CHECK ((person_id IS NULL) != (organization_id IS NULL))` so a row references exactly one side.
- **Source tagging:** `person.source` and `person_organization.source` track first-touch origin and are *never overwritten*. See 2.2.
- **Naming:**
  - tables: snake_case singular (`persons`, `organizations`) or junction (`person_organization`).
  - indexes: `idx_<table>_<col>` (some legacy ones — `idx_inbound_emails_contact`, `idx_company_signals_company_id` — kept old names after column renames in 010).
  - triggers: `trg_<table>_<purpose>`.
  - constraints: `<table>_<col>_unique` for added uniques (`organizations_name_unique`, `initiatives_name_unique`).
  - RPCs: snake_case verb-first (`merge_persons`, `find_person_correlations`).
- **Renames in 010:** `contact_id → person_id` on `inbound_emails` and `sequence_enrollments`; `company_id → organization_id` on `organization_signals`; `correlated_message_id → correlated_interaction_id`. Some downstream index names were not renamed (see notes).
- **Enrichment data truth:** the `enrichment_stages` jsonb is a log only. Derive whether enrichment "produced results" from real columns (`organizations.icp_score`, `organizations.description`, person counts on `person_organization`).

---

## 9. Migration practices

- **Add migrations as `NNN_short_name.sql`** under `supabase/migrations/`, monotonically numbered. The current next number is `026`.
- **Do not edit applied migrations.** Once a migration has been run against any environment (local, staging, prod), it is immutable. Add a follow-up migration instead. Migrations 014 and 015 demonstrate this — they re-defined `find_person_correlations` and `find_org_correlations` rather than editing 012.
- **Idempotency:** prefer `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`. For `cron.schedule`, guard with `cron.unschedule(...) WHERE EXISTS (...)` — see 016 for the pattern.
- **Renames:** when renaming a column referenced by indexes, drop+recreate the index too (010 missed a couple, see notes on `idx_inbound_emails_contact` and `idx_company_signals_company_id`).
- **RLS:** every new table must `ENABLE ROW LEVEL SECURITY` and create the standard `"Authenticated full access"` policy in the same migration (see 011, 020, 025).
- **Triggers for `updated_at`:** any new mutable table must add a `trg_<table>_updated_at` BEFORE-UPDATE trigger calling `update_updated_at()`.
- **Realtime:** if a table needs to be observed by the Telegram bot or live UIs, add it to `supabase_realtime` publication (`021` is the pattern).
- **Backfills:** include them in the same migration when feasible (e.g. 022's `enrichment_status` backfill, 025's `person_event_affiliations` backfill). Make them idempotent with `ON CONFLICT DO NOTHING`.
- **Data drops:** 010 hard-truncates several tables (`event_config`, `sequence_enrollments`, `sequences`, `uploads`, `inbound_emails`, `inbox_sync_state`) before re-pointing FKs to the new `events` table. This is *destructive* and was acceptable mid-redesign — be very cautious replicating that pattern in production now that the platform has live data.
- **Generated types:** `lib/types/database.ts` is hand-written. Update it alongside any schema-changing migration so TypeScript stays accurate (it is *not* `supabase gen types`-driven).
