# Database Schema

Supabase Postgres. Project: `<your-project-ref>`.

## Migrations

| File | Purpose |
|------|---------|
| `001_schema.sql` | All tables, foreign keys, indexes |
| `002_rls.sql` | Row Level Security policies |
| `003_triggers.sql` | `updated_at` auto-update, `pg_notify` for automations |
| `004_cron.sql` | Hourly send-message + sync-status via pg_cron |
| `005_rpc.sql` | `message_status_counts()` function for dashboard |

## Tables

### Core Entities

#### contacts
Primary entity. Represents a person to outreach to.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | Auto-generated |
| first_name | text | |
| last_name | text | |
| full_name | text NOT NULL | Display name |
| title | text | Job title |
| seniority | text | From Apollo |
| department | text | From Apollo |
| email | text | |
| linkedin | text | Profile URL |
| twitter | text | Handle or URL |
| telegram | text | |
| phone | text | |
| context | text | Freeform context notes |
| apollo_id | text | Apollo CRM ID |
| source | text | e.g. "speakers", "apollo" |
| notes | text | |
| created_at | timestamptz | |
| updated_at | timestamptz | Auto-updated by trigger |

#### companies
Organizations that contacts belong to.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| name | text NOT NULL | |
| website | text | |
| linkedin_url | text | |
| category | text | e.g. "DeFi", "Infrastructure" |
| description | text | |
| context | text | AI-generated summary from enrichment |
| usp | text | Our angle for outreach |
| icp_score | integer | 0-100, >= 75 qualifying, >= 90 Tier 1 |
| icp_reason | text | Why this score |
| created_at / updated_at | timestamptz | |

#### events
Conferences/events we're targeting.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| name | text NOT NULL | e.g. "EthCC 2026" |
| location | text | |
| date_start / date_end | date | |
| website | text | |
| notes | text | |

### Messaging

#### messages
Generated outreach messages with full lifecycle tracking.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| contact_id | uuid FK contacts | CASCADE delete |
| company_id | uuid FK companies | SET NULL |
| event_id | uuid FK events | SET NULL |
| channel | text NOT NULL | "email", "linkedin", "twitter", "telegram" |
| sequence_number | int NOT NULL | Position in sequence (1 = intro, 2 = follow-up) |
| iteration | int NOT NULL | Regeneration count at this position |
| subject | text | Email subject line |
| body | text NOT NULL | Message body |
| status | text NOT NULL | See status lifecycle below |
| sender_id | uuid FK sender_profiles | |
| cta | text | Call-to-action URL |
| scheduled_at | timestamptz | When to send |
| sent_at | timestamptz | When actually sent |

**Status Lifecycle:**
```
draft → approved → scheduled → processing → sent → opened → replied
                                          ↘ bounced
                                          ↘ failed
(any) → superseded (when regenerated)
```

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
| system_prompt | text NOT NULL | AI system instructions with `{{sender.name}}` etc. |
| user_prompt_template | text NOT NULL | Per-message prompt with `{{contact.full_name}}` etc. |

Template variables: `{{contact.full_name}}`, `{{contact.title}}`, `{{contact.context}}`, `{{company.name}}`, `{{company.context}}`, `{{company.description}}`, `{{company.usp}}`, `{{company.icp_reason}}`, `{{sender.name}}`, `{{sender.tone_notes}}`, `{{cta}}`, `{{previous_message}}`

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

### Enrichment

#### company_signals
Structured intelligence about companies from enrichment.

| Column | Type | Notes |
|--------|------|-------|
| company_id | uuid FK companies | CASCADE delete |
| signal_type | text NOT NULL | news, funding, partnership, product_launch, regulatory, hiring, award |
| description | text NOT NULL | One-sentence summary |
| date | date | When the signal occurred |
| source | text | e.g. "enrichment", "company_news_cache" |

### Join Tables

#### contact_company
Many-to-many: contacts ↔ companies.

| Column | Type | Notes |
|--------|------|-------|
| contact_id | uuid FK | |
| company_id | uuid FK | |
| role | text | Job title at this company |
| role_type | text | |
| founder_status | text | |
| is_primary | boolean | Primary company affiliation |
| source | text | |

UNIQUE on (contact_id, company_id).

#### contact_event / company_event
Link contacts and companies to events.

- `contact_event`: participation_type ("speaker", "sponsor_rep"), track, notes
- `company_event`: relationship_type ("sponsor"), sponsor_tier, notes

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
| job_type | text NOT NULL | e.g. "enrich_contact", "send_message" |
| target_table | text | |
| target_id | uuid | |
| status | text | "started", "completed", "failed" |
| error | text | Error message if failed |
| metadata | jsonb | Job-specific data |

## Indexes

- `contacts`: email, apollo_id, full_name
- `companies`: name, icp_score
- `messages`: status, scheduled_at, contact_id, event_id
- `company_signals`: company_id
- `contact_company`: contact_id, company_id
- `contact_event`: event_id
- `company_event`: event_id
- `job_log`: created_at DESC

## Seed Data

The `supabase/seed.sql` file creates:
- 2 sender profiles (JB, Wes) with fixed UUIDs `a0000000-...-000000000001/2`
- 2 events (EthCC 2026, TOKEN2049 Dubai) with fixed UUIDs `b0000000-...-000000000001/2`
- 2 prompt templates (LinkedIn Intro, Email Intro) with fixed UUIDs `c0000000-...-000000000001/2`
- 1 event_config linking EthCC to JB sender + LinkedIn template
