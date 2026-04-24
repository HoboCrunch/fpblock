# Database Schema

Supabase Postgres.

## Migrations

| File | Purpose |
|------|---------|
| `001_schema.sql` | Original schema (superseded by CRM redesign) |
| `002_rls.sql` | Original RLS policies |
| `003_triggers.sql` | Original `updated_at` trigger, `pg_notify` |
| `004_cron.sql` | Hourly send-message + sync-status via pg_cron |
| `005_rpc.sql` | Original `message_status_counts()` (replaced by `interaction_status_counts()`) |
| `007_sequences_uploads_inbox.sql` | Sequences, uploads, inbox sync, inbound emails |
| `008_sequence_status.sql` | Sequence status additions |
| `009_rls_new_tables.sql` | RLS for sequences/uploads/inbox tables |
| `010_crm_redesign_schema.sql` | New core tables, event redesign, initiatives, interactions, correlation, supporting table migrations |
| `011_crm_redesign_rls.sql` | RLS on all new tables |
| `012_crm_redesign_functions.sql` | Triggers, views, correlation functions, merge functions |
| `013_crm_drop_old_tables.sql` | Drop old tables (contacts, companies, etc.) |
| `014_crm_upsert_constraints.sql` | Unique constraint on organizations.name, fix correlation functions |
| `015_crm_enrollment_constraint_and_correlation_fix.sql` | Unique constraint on initiatives.name, final correlation function fix |
| `016_inbox_sync_cron.sql` | pg_cron job: auto-syncs Fastmail inbox every 15 min per account (JB at :00/:15/:30/:45, Wes offset by 1 min) via pg_net HTTP POST to `/api/inbox/sync` |
| `017_fix_persons_with_icp_view.sql` | Fixes `persons_with_icp` view with `DISTINCT ON (p.id)` to prevent duplicate rows when a person has multiple organization affiliations |
| `018_people_finder.sql` | (Reserved — no schema changes needed for people finder) |
| `019_company_context.sql` | Company context singleton table (ICP criteria, positioning, language rules), RLS, seed data |

## Extensions

- `pg_trgm` — trigram fuzzy matching for person/org name similarity

## Tables

### Core Entities

#### persons
The permanent identity record. One row per real human, survives across events, initiatives, and time.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | Auto-generated |
| full_name | text NOT NULL | Display name |
| first_name | text | |
| last_name | text | |
| email | text | |
| linkedin_url | text | Profile URL |
| twitter_handle | text | Handle or URL |
| telegram_handle | text | |
| phone | text | |
| title | text | Current role/title |
| seniority | text | |
| department | text | |
| bio | text | |
| photo_url | text | |
| source | text | How they first entered the system |
| apollo_id | text | Apollo CRM ID |
| notes | text | |
| created_at | timestamptz NOT NULL | Default now() |
| updated_at | timestamptz NOT NULL | Auto-updated by trigger |

**Indexes:** email, apollo_id, full_name (trigram via `gin_trgm_ops`), linkedin_url, twitter_handle

#### organizations
Companies, DAOs, foundations, government agencies.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | Auto-generated |
| name | text NOT NULL UNIQUE | |
| website | text | |
| linkedin_url | text | |
| category | text | e.g. "L1/L2", "Exchange", "VC", "Government" |
| description | text | |
| logo_url | text | |
| icp_score | int | 0-100, >= 75 qualifying, >= 90 Tier 1 |
| icp_reason | text | Why this score |
| context | text | Strategic context / why this org matters |
| usp | text | Our angle for outreach |
| notes | text | |
| created_at | timestamptz NOT NULL | Default now() |
| updated_at | timestamptz NOT NULL | Auto-updated by trigger |

**Indexes:** name (trigram via `gin_trgm_ops`), icp_score, website
**Constraints:** UNIQUE on name (for PostgREST upsert)

#### person_organization
Affiliations. A person can belong to multiple orgs over time.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| person_id | uuid FK persons | CASCADE delete |
| organization_id | uuid FK organizations | CASCADE delete |
| role | text | "CEO", "Head of BD", etc. |
| role_type | text | "founder", "executive", "employee", "advisor" |
| is_current | boolean | Default true |
| is_primary | boolean | Default false |
| source | text | |
| created_at | timestamptz NOT NULL | Default now() |
| updated_at | timestamptz NOT NULL | Auto-updated by trigger |

**Constraints:** UNIQUE on (person_id, organization_id)
**Indexes:** person_id, organization_id

#### events
Conferences, side events, meetups.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | Auto-generated |
| name | text NOT NULL | e.g. "EthCC 9" |
| slug | text UNIQUE | e.g. "ethcc-9" |
| location | text | |
| date_start | date | |
| date_end | date | |
| website | text | |
| event_type | text | "conference", "side_event", "meetup" |
| notes | text | |
| created_at | timestamptz NOT NULL | Default now() |

**Indexes:** slug, date_start

### Event Relationships

#### event_participations
How persons and organizations relate to events. Uses exclusive-or constraint: exactly one of person_id or organization_id must be set per row.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| event_id | uuid FK events | CASCADE delete, NOT NULL |
| person_id | uuid FK persons | CASCADE delete, nullable |
| organization_id | uuid FK organizations | CASCADE delete, nullable |
| role | text NOT NULL | Person: "speaker", "attendee", "organizer", "panelist", "mc". Org: "sponsor", "partner", "exhibitor", "media" |
| sponsor_tier | text | For org sponsors: "presented_by", "platinum", "diamond", etc. |
| confirmed | boolean | Default true. False = inferred |
| talk_title | text | Session metadata |
| time_slot | text | e.g. "Day 2, 14:00" |
| track | text | e.g. "defi", "security" |
| room | text | |
| notes | text | |

**Constraints:**
- `CHECK ((person_id IS NULL) != (organization_id IS NULL))` — exactly one must be set
- Partial unique index on `(event_id, person_id, role) WHERE person_id IS NOT NULL`
- Partial unique index on `(event_id, organization_id, role) WHERE organization_id IS NOT NULL`

**Indexes:** event_id, person_id, organization_id

#### person_event_affiliations
Indirect person↔event link: a person is affiliated with an event because they belong to an organization that participates in that event. Maintained automatically by triggers (see below); never written by application code.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| event_id | uuid FK events | CASCADE delete, NOT NULL |
| person_id | uuid FK persons | CASCADE delete, NOT NULL |
| via_organization_id | uuid FK organizations | CASCADE delete, NOT NULL |
| created_at | timestamptz NOT NULL | Default now() |
| updated_at | timestamptz NOT NULL | Default now() |

**Constraints:** UNIQUE on (event_id, person_id, via_organization_id) — a person can have multiple rows for the same event when affiliated through multiple participating orgs.

**Indexes:** event_id, person_id, via_organization_id, (event_id, person_id)

**Triggers (migration 025):**
- `trg_pea_sync_from_person_org` on `person_organization` (INSERT/UPDATE/DELETE) — INSERT with `is_current=true` inserts affiliations for every `event_participations` row on the same org. UPDATE of `is_current` `false→true` inserts; `true→false` is a no-op (rule B: person stays affiliated for the event they were at). UPDATE of `person_id` or `organization_id` is treated as DELETE+INSERT. DELETE removes affiliations for that `(person, via_organization_id)` pair.
- `trg_pea_sync_from_event_participation` on `event_participations` (INSERT/DELETE) — INSERT with `organization_id IS NOT NULL` inserts affiliations for every `is_current=true` person_organization on that org. DELETE removes affiliations for that `(event_id, via_organization_id)` pair. UPDATE is a no-op (role/sponsor_tier changes don't affect affiliation).

**Access pattern:** Always query through `lib/queries/event-persons.ts` → `getPersonIdsForEvent(supabase, eventId, relation)` where `relation` is `"direct" | "org_affiliated" | "either" | "both"`. Never hand-join `event_participations ↔ person_organization`.

### Initiatives

#### initiatives
Campaigns, workstreams, outreach efforts.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| name | text NOT NULL UNIQUE | |
| initiative_type | text | "cold_outreach", "partnership", "event_prep", "research" |
| event_id | uuid FK events | Optional event association |
| status | text | Default "active". "active", "paused", "completed" |
| owner | text | Genzio team member |
| notes | text | |
| created_at | timestamptz | Default now() |
| updated_at | timestamptz | Auto-updated by trigger |

**Indexes:** event_id, status
**Constraints:** UNIQUE on name (for PostgREST upsert)

#### initiative_enrollments
Which persons or organizations are enrolled in an initiative. Uses same exclusive-or pattern as event_participations.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| initiative_id | uuid FK initiatives | CASCADE delete, NOT NULL |
| person_id | uuid FK persons | CASCADE delete, nullable |
| organization_id | uuid FK organizations | CASCADE delete, nullable |
| status | text | Default "active". "active", "paused", "completed", "removed" |
| priority | text | "high", "medium", "low" |
| enrolled_at | timestamptz | Default now() |

**Constraints:**
- `CHECK ((person_id IS NULL) != (organization_id IS NULL))` — exactly one must be set
- Partial unique index on `(initiative_id, person_id) WHERE person_id IS NOT NULL`
- Partial unique index on `(initiative_id, organization_id) WHERE organization_id IS NOT NULL`

**Indexes:** initiative_id, person_id, organization_id

### Interactions

#### interactions
Unified timeline. Every touchpoint — outbound messages, inbound replies, meetings, notes, research — lives here. Replaces the old `messages` table.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| person_id | uuid FK persons | SET NULL on delete, nullable |
| organization_id | uuid FK organizations | SET NULL on delete, nullable |
| event_id | uuid FK events | SET NULL on delete, nullable |
| initiative_id | uuid FK initiatives | SET NULL on delete, nullable |
| interaction_type | text NOT NULL | "cold_email", "cold_linkedin", "cold_twitter", "warm_intro", "meeting", "call", "event_encounter", "note", "research" |
| channel | text | "email", "linkedin", "twitter", "telegram", "in_person", "phone" |
| direction | text | "outbound", "inbound", "internal" |
| subject | text | |
| body | text | |
| status | text | Default "draft". See status lifecycle below |
| handled_by | text | Genzio team member |
| sender_profile_id | uuid FK sender_profiles | SET NULL on delete |
| sequence_id | uuid FK sequences | SET NULL on delete |
| sequence_step | int | Step number within sequence |
| scheduled_at | timestamptz | When to send |
| occurred_at | timestamptz | When it actually happened |
| detail | jsonb | Type-specific fields (see below) |
| created_at | timestamptz | Default now() |
| updated_at | timestamptz | Auto-updated by trigger |

**Status Lifecycle:**
```
draft -> scheduled -> sending -> sent -> delivered -> opened -> replied
                                      \-> bounced
                                      \-> failed
```

**Detail JSONB by interaction_type:**
- `warm_intro`: `{ introducer, relationship_strength, target_outcome, intro_status, follow_up_date }`
- `meeting`: `{ location, attendees[], outcome, follow_up_date }`
- `cold_email`: `{ iteration, cta, message_id_header }`
- `research`: `{ findings, sources[] }`

**Indexes:** person_id, organization_id, event_id, initiative_id, status, occurred_at DESC, interaction_type

### Correlation & Deduplication

#### correlation_candidates
Staging table for fuzzy match review.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| entity_type | text NOT NULL | "person" or "organization" |
| source_id | uuid NOT NULL | The new/incoming record |
| target_id | uuid NOT NULL | The existing record it might match |
| confidence | float NOT NULL | 0.0 to 1.0 |
| match_reasons | jsonb | e.g. `["exact_email", "similar_name:0.92"]` |
| status | text | Default "pending". "pending", "merged", "dismissed" |
| resolved_by | text | |
| created_at | timestamptz | Default now() |

**Indexes:** status, entity_type, source_id, target_id

**Confidence thresholds:**
- **>= 0.95 (auto-merge):** Exact email (0.98), exact LinkedIn (0.97), exact Twitter/website (0.96-0.98)
- **0.6-0.95 (flag for review):** Fuzzy name match via pg_trgm similarity
- **< 0.6:** No match, create new record

### Supporting Tables

#### sender_profiles
Who sends the messages.

| Column | Type | Notes |
|--------|------|-------|
| name | text NOT NULL | "JB" or "Wes" |
| email | text | Sender email for SendGrid |
| heyreach_account_id | text | For LinkedIn sending |
| signature | text | Email signature HTML |
| tone_notes | text | AI persona instructions |

#### prompt_templates
Templates for AI message generation.

| Column | Type | Notes |
|--------|------|-------|
| name | text NOT NULL | e.g. "EthCC LinkedIn Intro" |
| channel | text | "email", "linkedin", etc. |
| system_prompt | text NOT NULL | AI system instructions |
| user_prompt_template | text NOT NULL | Per-message prompt with template variables |

#### event_config
Per-event defaults for message generation.

| Column | Type | Notes |
|--------|------|-------|
| event_id | uuid FK events | UNIQUE |
| sender_id | uuid FK sender_profiles | Default sender |
| cta_url | text | Default CTA link |
| cta_text | text | |
| prompt_template_id | uuid FK prompt_templates | Default template |
| notify_emails | text[] | Alert recipients |

#### sequences
Named outreach sequence templates with multi-step timing.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| name | text NOT NULL | e.g. "EthCC LinkedIn 3-touch" |
| channel | text NOT NULL | "email", "linkedin", etc. |
| event_id | uuid FK events | Optional event association |
| initiative_id | uuid FK initiatives | Links sequence to parent initiative |
| steps | jsonb NOT NULL | Array of step objects (see below) |
| created_at / updated_at | timestamptz | |

**Steps JSONB schema:**
```json
[
  {
    "step_number": 1,
    "delay_days": 0,
    "action_type": "initial",
    "subject_template": "Hey {first_name}",
    "body_template": "Hi {first_name}, ...",
    "prompt_template_id": null
  }
]
```

Fields: `step_number`, `delay_days` (days after previous step), `action_type` (initial/follow_up/break_up), `subject_template` (email only), `body_template`, `prompt_template_id` (optional, for AI generation).

#### sequence_enrollments
Tracks which persons are enrolled in which sequences.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| sequence_id | uuid FK sequences | CASCADE delete |
| person_id | uuid FK persons | CASCADE delete |
| current_step | int | 0-indexed current step |
| status | text | active, paused, completed, bounced |
| enrolled_at | timestamptz | |

UNIQUE on (sequence_id, person_id).

#### uploads
Tracks CSV import operations.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| filename | text NOT NULL | Original CSV filename |
| row_count | int | Total rows in file |
| persons_created | int | Persons created by this import |
| organizations_created | int | Organizations created by this import |
| event_id | uuid FK events | Event records were linked to |
| status | text | processing, completed, failed |
| errors | jsonb | Import error details |
| uploaded_by | uuid | Auth user ID |
| created_at | timestamptz | |

#### inbox_sync_state
Tracks Fastmail sync state per connected email account.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| account_email | text UNIQUE | jb@gofpblock.com or wes@gofpblock.com |
| last_sync_at | timestamptz | Last successful sync time |
| last_email_id | text | JMAP email ID for incremental sync |
| unread_count | int | Current unread count |
| status | text | connected, error, disconnected |
| error_message | text | Error details if status = error |
| updated_at | timestamptz | |

#### inbound_emails
Cached inbound emails from Fastmail for the inbox view.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| account_email | text NOT NULL | Which account received this |
| message_id | text UNIQUE | JMAP email ID (dedup key) |
| from_address | text NOT NULL | Sender email |
| from_name | text | Sender display name |
| subject | text | |
| body_preview | text | First 500 chars of body |
| body_html | text | Full HTML body |
| received_at | timestamptz NOT NULL | |
| is_read | boolean | |
| person_id | uuid FK persons | Correlated person (if matched) |
| correlated_interaction_id | uuid | Matched outbound interaction |
| correlation_type | text | exact_email, domain_match, manual, none |
| raw_headers | jsonb | In-Reply-To, References headers |
| created_at | timestamptz | |

#### organization_signals
Structured intelligence about organizations from enrichment. Renamed from `company_signals`.

| Column | Type | Notes |
|--------|------|-------|
| organization_id | uuid FK organizations | CASCADE delete |
| signal_type | text NOT NULL | news, funding, partnership, product_launch, regulatory, hiring, award |
| description | text NOT NULL | One-sentence summary |
| date | date | When the signal occurred |
| source | text | e.g. "enrichment", "company_news_cache" |

### Company Context

#### company_context
Singleton table storing company profile data used in enrichment and generation flows. Editable via Settings > Company Profile.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | Auto-generated |
| company_name | text NOT NULL | Default 'FP Block'. Used in Gemini prompts |
| about | text | Company description |
| icp_criteria | text | Full ICP framework, used verbatim by Gemini for scoring |
| positioning | text | Market positioning statement |
| language_rules | text | Words/phrases to lead with or avoid |
| outreach_strategy | text | High-level outreach strategy notes |
| updated_at | timestamptz NOT NULL | Auto-updated by trigger |

**RLS:** Authenticated full access
**Trigger:** `updated_at` auto-update

### Automation

#### automation_rules
Configurable rules that trigger actions on data changes.

| Column | Type | Notes |
|--------|------|-------|
| trigger_table | text | Which table triggers this rule |
| trigger_event | text | INSERT, UPDATE |
| conditions | jsonb | e.g. `{"icp_score": {"gte": 75}}` |
| action | text | e.g. "enrich_contact", "generate_sequence" |
| action_params | jsonb | Passed to the edge function |
| enabled | boolean | |

#### job_log
Audit trail for all background operations.

| Column | Type | Notes |
|--------|------|-------|
| job_type | text NOT NULL | e.g. "enrich_contact", "send_message", "inbox_correlation" |
| target_table | text | |
| target_id | uuid | |
| status | text | "started", "completed", "failed" |
| error | text | Error message if failed |
| metadata | jsonb | Job-specific data |

## Views

#### persons_with_icp
Joins persons with their primary organization's ICP data for sortable list views.

```sql
SELECT DISTINCT ON (p.id)
  p.*,
  o.name AS primary_org_name,
  o.icp_score,
  o.icp_reason,
  o.category AS org_category,
  po.role AS org_role
FROM persons p
LEFT JOIN person_organization po ON po.person_id = p.id AND po.is_primary = true
LEFT JOIN organizations o ON o.id = po.organization_id
ORDER BY p.id;
```

**Note:** `DISTINCT ON (p.id)` prevents duplicate rows when a person has multiple organization affiliations (fixed in migration 017).

## Functions

#### interaction_status_counts()
RPC that returns interaction status distribution for dashboard widgets.

```sql
SELECT status, count(*)::bigint FROM interactions WHERE status IS NOT NULL GROUP BY status;
```

#### find_person_correlations(p_person_id uuid)
Finds potential duplicate persons by comparing email, LinkedIn, Twitter (exact match), and full_name (pg_trgm similarity >= 0.6). Returns `(target_id, confidence, match_reasons)`.

Confidence scores: exact email = 0.98, exact LinkedIn = 0.97, exact Twitter = 0.96, name similarity = trigram score.

#### find_org_correlations(p_org_id uuid)
Same pattern for organizations. Compares website (0.98), LinkedIn (0.97), and name similarity (>= 0.6).

#### merge_persons(winner_id uuid, loser_id uuid)
Merges two person records. Reassigns all relationships (person_organization, event_participations, initiative_enrollments, interactions, sequence_enrollments, inbound_emails) from loser to winner. Fills null fields on winner from loser. Cleans up correlation_candidates. Deletes loser record.

#### merge_organizations(winner_id uuid, loser_id uuid)
Same pattern for organizations. Reassigns person_organization, event_participations, initiative_enrollments, interactions, organization_signals. Fills null fields. Cleans up correlation_candidates. Deletes loser.

## Triggers

`updated_at` auto-update trigger on:
- `persons`
- `organizations`
- `person_organization`
- `initiatives`
- `interactions`
- `company_context`

## RLS

Authenticated full access (`auth.uid() IS NOT NULL`) on all tables:
- persons, organizations, person_organization, events, event_participations
- initiatives, initiative_enrollments, interactions, correlation_candidates
- sender_profiles, prompt_templates, event_config, sequences, sequence_enrollments
- uploads, inbox_sync_state, inbound_emails, organization_signals
- automation_rules, job_log
- company_context

## Indexes Summary

- `persons`: email, apollo_id, full_name (trigram GIN), linkedin_url, twitter_handle
- `organizations`: name (trigram GIN), icp_score, website
- `person_organization`: person_id, organization_id
- `events`: slug, date_start
- `event_participations`: event_id, person_id, organization_id + partial unique indexes on (event_id, person_id, role) and (event_id, organization_id, role)
- `initiatives`: event_id, status
- `initiative_enrollments`: initiative_id, person_id, organization_id + partial unique indexes
- `interactions`: person_id, organization_id, event_id, initiative_id, status, occurred_at DESC, interaction_type
- `correlation_candidates`: status, entity_type, source_id, target_id
- `sequences`: event_id, initiative_id
- `sequence_enrollments`: sequence_id, person_id
- `uploads`: event_id
- `inbound_emails`: account_email, person_id, received_at DESC, from_address
- `job_log`: created_at DESC
