# Database Schema

Supabase Postgres. Project: `<your-project-ref>`.

## Migrations

| File | Purpose |
|------|---------|
| `001_schema.sql` | Core 13 tables, foreign keys, indexes |
| `002_sequences_uploads_inbox.sql` | Sequences, uploads, inbox sync, inbound emails, replied_at, message_status_counts RPC |
| `002_rls.sql` | Row Level Security policies |
| `003_triggers.sql` | `updated_at` auto-update, `pg_notify` for automations |
| `004_cron.sql` | Hourly send-message + sync-status via pg_cron |
| `005_rpc.sql` | `message_status_counts()` function for dashboard |

## Tables (17 total)

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
| replied_at | timestamptz | When a reply was detected (from inbox correlation) |

**Status Lifecycle:**
```
draft → approved → scheduled → processing → sent → opened → replied
                                          ↘ bounced
                                          ↘ failed
(any) → superseded (when regenerated)
```

**Pipeline Stage Mapping (for Kanban view):**

| Pipeline Stage | Message Statuses |
|---------------|-----------------|
| Not Contacted | Contact has zero messages |
| Draft | Most advanced status is `draft` |
| Scheduled | Most advanced status is `scheduled` |
| Sent | Most advanced is `sending`, `sent`, or `delivered` |
| Opened | Most advanced is `opened` |
| Replied | Most advanced is `replied` |
| Bounced/Failed | Most advanced is `bounced` or `failed` |

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

### Sequences (new in 002)

#### sequences
Named outreach sequence templates with multi-step timing.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| name | text NOT NULL | e.g. "EthCC LinkedIn 3-touch" |
| channel | text NOT NULL | "email", "linkedin", etc. |
| event_id | uuid FK events | Optional event association |
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
Tracks which contacts are enrolled in which sequences.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| sequence_id | uuid FK sequences | CASCADE delete |
| contact_id | uuid FK contacts | CASCADE delete |
| current_step | int | 0-indexed current step |
| status | text | active, paused, completed, bounced |
| enrolled_at | timestamptz | |

UNIQUE on (sequence_id, contact_id).

### Uploads (new in 002)

#### uploads
Tracks CSV import operations.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| filename | text NOT NULL | Original CSV filename |
| row_count | int | Total rows in file |
| contacts_created | int | Contacts created by this import |
| companies_created | int | Companies created by this import |
| event_id | uuid FK events | Event contacts were linked to |
| status | text | processing, completed, failed |
| errors | jsonb | Import error details |
| uploaded_by | uuid | Auth user ID |
| created_at | timestamptz | |

### Inbox (new in 002)

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

Pre-seeded with both accounts.

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
| contact_id | uuid FK contacts | Correlated contact (if matched) |
| correlated_message_id | uuid FK messages | Matched outbound message |
| correlation_type | text | exact_email, domain_match, manual, none |
| raw_headers | jsonb | In-Reply-To, References headers |
| created_at | timestamptz | |

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
| job_type | text NOT NULL | e.g. "enrich_contact", "send_message", "inbox_correlation" |
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
- `sequences`: event_id
- `sequence_enrollments`: sequence_id, contact_id
- `uploads`: event_id
- `inbound_emails`: account_email, contact_id, received_at DESC, from_address

## Seed Data

The `supabase/seed.sql` file creates:
- 2 sender profiles (JB, Wes) with fixed UUIDs `a0000000-...-000000000001/2`
- 2 events (EthCC 2026, TOKEN2049 Dubai) with fixed UUIDs `b0000000-...-000000000001/2`
- 2 prompt templates (LinkedIn Intro, Email Intro) with fixed UUIDs `c0000000-...-000000000001/2`
- 1 event_config linking EthCC to JB sender + LinkedIn template
- 2 inbox_sync_state records for jb@gofpblock.com and wes@gofpblock.com
