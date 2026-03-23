# CRM Redesign: Intelligent Evolving Contact & Relationship System

**Date:** 2026-03-22
**Status:** Approved
**Approach:** Clean-Slate Relational (Approach B)

## Problem

The current 18-table schema conflates contacts with persons, companies with organizations, and ties everything implicitly to events. There is no unified interaction timeline, no correlation/dedup engine, no initiative-based tracking, and event views don't distinguish between confirmed attendees vs inferred contacts. Data has strayed — starting from scratch with seed data from `fp-data-seed/`.

## Design Decisions

- **Per-initiative ownership** — a formality tracking which Genzio team member handles a relationship, stored as a text field (`handled_by`), not a user/auth concept
- **Hybrid interaction model** — unified `interactions` timeline with type-specific detail in JSONB
- **Lightweight session metadata** — no formal session table; talk_title, time_slot, track, room stored on event_participations
- **Fuzzy matching with confidence scores** — auto-merge on high-confidence signals, flag ambiguous matches for human review
- **Agency model not modeled** — Genzio team members are text fields, Wes/JB are sender profiles for outbound identity

## Schema

### Core Entities

#### `persons`
The permanent identity record. One row per real human, survives across events, initiatives, and time.

| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK, default gen_random_uuid() |
| full_name | text | NOT NULL |
| first_name | text | |
| last_name | text | |
| email | text | |
| linkedin_url | text | |
| twitter_handle | text | |
| telegram_handle | text | |
| phone | text | |
| title | text | Current role/title |
| seniority | text | |
| department | text | |
| bio | text | |
| photo_url | text | |
| source | text | How they first entered the system |
| apollo_id | text | |
| notes | text | |
| created_at | timestamptz | NOT NULL, default now() |
| updated_at | timestamptz | NOT NULL, default now() |

**Indexes:** email, apollo_id, full_name (trigram via pg_trgm for fuzzy search), linkedin_url, twitter_handle

#### `organizations`
Companies, DAOs, foundations, government agencies.

| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK, default gen_random_uuid() |
| name | text | NOT NULL |
| website | text | |
| linkedin_url | text | |
| category | text | e.g., "L1/L2", "Exchange", "VC", "Government" |
| description | text | |
| logo_url | text | |
| icp_score | int | 0-100 |
| icp_reason | text | |
| context | text | Strategic context / why this org matters |
| usp | text | Unique selling proposition |
| notes | text | |
| created_at | timestamptz | NOT NULL, default now() |
| updated_at | timestamptz | NOT NULL, default now() |

**Indexes:** name (trigram), icp_score, website

#### `person_organization`
Affiliations. A person can belong to multiple orgs over time.

| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK |
| person_id | uuid | FK → persons, ON DELETE CASCADE |
| organization_id | uuid | FK → organizations, ON DELETE CASCADE |
| role | text | "CEO", "Head of BD", etc. |
| role_type | text | "founder", "executive", "employee", "advisor" |
| is_current | boolean | default true |
| is_primary | boolean | default false |
| source | text | |
| created_at | timestamptz | NOT NULL, default now() |
| updated_at | timestamptz | NOT NULL, default now() |

**Constraints:** UNIQUE(person_id, organization_id)
**Indexes:** person_id, organization_id

#### `events`
Conferences, side events, meetups.

| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK |
| name | text | NOT NULL |
| slug | text | UNIQUE, e.g., "ethcc-9" |
| location | text | |
| date_start | date | |
| date_end | date | |
| website | text | |
| event_type | text | "conference", "side_event", "meetup" |
| notes | text | |
| created_at | timestamptz | NOT NULL, default now() |

**Indexes:** slug, date_start

### Event Relationships

#### `event_participations`
How persons and organizations relate to events. Explicit role semantics.

| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK |
| event_id | uuid | FK → events, ON DELETE CASCADE |
| person_id | uuid | FK → persons, ON DELETE CASCADE, nullable |
| organization_id | uuid | FK → organizations, ON DELETE CASCADE, nullable |
| role | text | NOT NULL. Person: "speaker", "attendee", "organizer", "panelist", "mc". Org: "sponsor", "partner", "exhibitor", "media" |
| sponsor_tier | text | For org sponsors: "presented_by", "platinum", "diamond", "emerald", "gold", "silver", "bronze", "copper", "community" |
| confirmed | boolean | default true. False = inferred (e.g., sponsor contact) |
| talk_title | text | Lightweight session metadata |
| time_slot | text | "Day 2, 14:00" |
| track | text | "defi", "security", etc. |
| room | text | |
| notes | text | |

**Constraints:**
- CHECK((person_id IS NULL) != (organization_id IS NULL)) — exactly one must be set (exclusive OR)
- Partial unique indexes (must use CREATE UNIQUE INDEX syntax, not table-level UNIQUE):
  - `CREATE UNIQUE INDEX ... ON event_participations(event_id, person_id, role) WHERE person_id IS NOT NULL`
  - `CREATE UNIQUE INDEX ... ON event_participations(event_id, organization_id, role) WHERE organization_id IS NOT NULL`

**Indexes:** event_id, person_id, organization_id

### Initiatives & Interactions

#### `initiatives`
Campaigns, workstreams, outreach efforts.

| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK |
| name | text | NOT NULL |
| initiative_type | text | "cold_outreach", "partnership", "event_prep", "research" |
| event_id | uuid | FK → events, nullable |
| status | text | "active", "paused", "completed" |
| owner | text | Genzio team member |
| notes | text | |
| created_at | timestamptz | default now() |
| updated_at | timestamptz | default now() |

**Indexes:** event_id, status

#### `initiative_enrollments`
Which persons/orgs are enrolled in an initiative.

| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK |
| initiative_id | uuid | FK → initiatives, ON DELETE CASCADE |
| person_id | uuid | FK → persons, ON DELETE CASCADE, nullable |
| organization_id | uuid | FK → organizations, ON DELETE CASCADE, nullable |
| status | text | "active", "paused", "completed", "removed" |
| priority | text | "high", "medium", "low" |
| enrolled_at | timestamptz | default now() |

**Constraints:**
- CHECK((person_id IS NULL) != (organization_id IS NULL)) — exactly one must be set
- Partial unique indexes (CREATE UNIQUE INDEX syntax):
  - `CREATE UNIQUE INDEX ... ON initiative_enrollments(initiative_id, person_id) WHERE person_id IS NOT NULL`
  - `CREATE UNIQUE INDEX ... ON initiative_enrollments(initiative_id, organization_id) WHERE organization_id IS NOT NULL`

**Indexes:** initiative_id, person_id, organization_id

#### `interactions`
Unified timeline. Every touchpoint lives here.

| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK |
| person_id | uuid | FK → persons, ON DELETE SET NULL, nullable |
| organization_id | uuid | FK → organizations, ON DELETE SET NULL, nullable |
| event_id | uuid | FK → events, ON DELETE SET NULL, nullable |
| initiative_id | uuid | FK → initiatives, ON DELETE SET NULL, nullable |
| interaction_type | text | NOT NULL. "cold_email", "cold_linkedin", "cold_twitter", "warm_intro", "meeting", "call", "event_encounter", "note", "research" |
| channel | text | "email", "linkedin", "twitter", "telegram", "in_person", "phone" |
| direction | text | "outbound", "inbound", "internal" |
| subject | text | |
| body | text | |
| status | text | "draft", "scheduled", "sending", "sent", "delivered", "opened", "replied", "bounced", "failed" |
| handled_by | text | Genzio team member |
| sender_profile_id | uuid | FK → sender_profiles, ON DELETE SET NULL, nullable |
| sequence_id | uuid | FK → sequences, ON DELETE SET NULL, nullable |
| sequence_step | int | Step number within sequence |
| scheduled_at | timestamptz | |
| occurred_at | timestamptz | When it actually happened |
| detail | jsonb | Type-specific fields (see below) |
| created_at | timestamptz | default now() |

**Detail JSONB by type:**
- `warm_intro`: `{ introducer, relationship_strength, target_outcome, intro_status, follow_up_date }`
- `meeting`: `{ location, attendees[], outcome, follow_up_date }`
- `cold_email`: `{ iteration, cta, message_id_header }`
- `research`: `{ findings, sources[] }`

**Indexes:** person_id, organization_id, event_id, initiative_id, status, occurred_at DESC, interaction_type

### Correlation & Deduplication

#### `correlation_candidates`
Staging table for fuzzy match review.

| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK |
| entity_type | text | "person" or "organization" |
| source_id | uuid | The new/incoming record |
| target_id | uuid | The existing record it might match |
| confidence | float | 0.0 to 1.0 |
| match_reasons | jsonb | e.g., ["exact_email", "similar_name:0.92", "same_linkedin"] |
| status | text | "pending", "merged", "dismissed" |
| resolved_by | text | |
| created_at | timestamptz | default now() |

**Indexes:** status, entity_type, source_id, target_id

**Matching logic** — Postgres function `find_correlations()`:
1. **Auto-merge (>= 0.95):** Exact email, exact LinkedIn URL, exact Twitter handle → merge incoming into existing, fill null fields
2. **Flag for review (0.6–0.95):** Fuzzy name (pg_trgm similarity) + same org, similar name + overlapping socials, same name different org (possible job change)
3. **No match (< 0.6):** Create new record

**On merge:** Losing record's relationships (event_participations, interactions, initiative_enrollments, person_organization) reassigned to winning record. Losing record deleted. Correlation_candidates rows referencing the losing record are cleaned up (deleted or updated to point to winner).

### Supporting Tables (Migrated)

These carry forward with FK updates from contacts→persons, companies→organizations, messages→interactions:

- **`sender_profiles`** — unchanged
- **`prompt_templates`** — unchanged
- **`event_config`** — unchanged, FK to events
- **`sequences`** — add `initiative_id` FK → initiatives (nullable). Links a sequence to its parent initiative for scoped progress tracking
- **`sequence_enrollments`** — contact_id → person_id
- **`inbox_sync_state`** — unchanged
- **`inbound_emails`** — contact_id → person_id, correlated_message_id → correlated_interaction_id
- **`uploads`** — rename `contacts_created` → `persons_created`, `companies_created` → `organizations_created`
- **`job_log`** — unchanged
- **`automation_rules`** — unchanged
- **`organization_signals`** — renamed from company_signals, company_id → organization_id

### Dropped Tables

- `contacts` → replaced by `persons`
- `companies` → replaced by `organizations`
- `contact_company` → replaced by `person_organization`
- `contact_event` → replaced by `event_participations`
- `company_event` → replaced by `event_participations`
- `messages` → replaced by `interactions`

## UX Views

### Persons (replaces Contacts)
- **List:** Searchable table — name, current org, title, ICP score (from primary org via Postgres view `persons_with_icp`), channel icons, last interaction date, interaction count
- **Note:** ICP score lives on `organizations`. A Postgres view `persons_with_icp` joins through `person_organization(is_primary=true)` to expose ICP score as a queryable/sortable column on persons. This avoids client-side sorting limitations with PostgREST embedded selects.
- **Detail:** Full profile — affiliations (current + historical), event participations across all events, complete interaction timeline (all types interleaved chronologically), initiative enrollments with status

### Organizations (replaces Companies)
- **List:** Name, category, ICP score, person count, events with sponsor tier badges, signals count, last interaction
- **Detail:** Org profile, people roster, signals timeline, events, aggregated interaction timeline

### Events (redesigned)
- **List:** Event cards with date, location, counts per role type (speakers, sponsors, related contacts)
- **Detail tabs:**
  - **Speakers:** Confirmed speakers with talk_title, track, time_slot, org
  - **Sponsors:** Sponsoring orgs with tier, person count
  - **Related Contacts:** People from sponsoring orgs (joined via person_organization), labeled "not confirmed." Option to mark confirmed
  - **Schedule:** Lightweight day/track/slot view from event_participation metadata
  - **Initiatives:** Campaigns tied to this event

### Initiatives (new)
- **List:** Active/paused/completed with type, owner, event link, enrollment count, interaction stats
- **Detail:** Enrolled persons/orgs with priority/status, scoped interaction timeline, sequence progress

### Interactions Timeline (embedded component)
- Appears on Person, Org, Event, and Initiative detail views
- Chronological feed with type icons, channel badges, status pills
- Filterable by type, channel, direction
- Expandable for body/detail

### Correlation Review (new)
- Queue of pending matches — side-by-side comparison
- Merge or dismiss actions
- Match reasons + confidence displayed

### Pipeline (updated)
- Kanban/table stays, stages derived from interaction status
- Scoped to initiative rather than global

### Kept As-Is
- Sequences, Inbox, Enrichment, Uploads, Settings — same workflows, updated FKs

## Data Seeding

Source: `fp-data-seed/` with 3 folders:

### EthCC (ethcc9_speakers.csv, ethcc9_sponsors.csv)
1. Create event: "EthCC 9" with slug "ethcc-9"
2. Import speakers → persons + person_organization + event_participations(role=speaker, track from trackSlug)
3. Import sponsors → organizations + event_participations(role=sponsor, tier from tier column)

### DC Blockchain (dcbs2026_speakers.csv, dcbs2026_sponsors.csv)
1. Create event: "DC Blockchain Summit 2026" with slug "dc-blockchain-2026"
2. Import speakers → persons + event_participations(role=speaker, category mapped to track). **Note:** This CSV has no `organization` column — only name, title, category, photoUrl, profileLink. Parse org name from `title` field where possible (e.g., "Chairman, U.S. SEC" → org "U.S. SEC"). Speakers without parseable org will have person records without person_organization affiliations.
3. Import sponsors → organizations + event_participations(role=sponsor, tier)

### Genzio (Sheet3.csv, Exploration Leads.csv, Intros Made.csv)
1. Create initiative: "FP Block Partnerships" (type=partnership, owner from Genzio Contact column)
2. Import companies → organizations (with ICP context from "Why This Is a Fit" → `context`, "Potential Entry Angle" → `usp`)
3. Import target persons → persons + person_organization
4. Create initiative_enrollments with priority mapping
5. **CSV quality note:** `Exploration Leads.csv` has empty leading rows — seeding script must skip empty rows and auto-detect the header row. `Intros Made.csv` has the header on line 5 (not line 1) and only 7 data rows with mostly empty fields (only Company Name and Introducer are populated). For Intros Made, create minimal interaction records (type=warm_intro) with `detail: { introducer }` — do not expect other fields to be present. Skip rows that are entirely empty.

### Correlation Pass
After all imports, run `find_correlations()` across all persons and organizations to flag cross-event duplicates (e.g., a company sponsoring both EthCC and DC Blockchain).

## RLS Policy

Same pattern as current: authenticated full access on all tables. Single-tenant trusted team.

## Migration Strategy

1. Create new tables in a fresh migration
2. Seed from fp-data-seed CSVs (no migration of old data — starting fresh)
3. Drop old tables
4. Update all UI components to use new schema
