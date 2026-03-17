# FP Block Cannes — Internal Outreach App Spec

## Overview

Lightweight internal outreach automation and pipeline management tool for FP Block's event-based BD operations. Not a SaaS — a single-tenant internal tool for JB, Wes, and team.

**Stack:** Next.js (app router) + Supabase (Postgres, Auth, Edge Functions, pg_cron, Realtime)

**External services:** SendGrid (email send), HeyReach (LinkedIn send), Apollo (contact enrichment), Gemini (message generation + context synthesis), Brave Search + Perplexity (company research)

---

## Routing

```
/jb          — JB's public landing page (unauthenticated, no nav, standalone)
/wes         — Wes's public landing page (unauthenticated, no nav, standalone)
/admin       — Dashboard (auth-protected)
/admin/events/:id  — Event view
/admin/contacts/:id — Contact detail
/admin/companies/:id — Company detail
/admin/queue  — Message queue
/admin/login  — Login page
```

Auth middleware applies only to `/admin/*`. Landing pages are completely isolated — no shared layout, no header, no links to admin.

---

## Database Schema

All tables in Supabase Postgres. RLS on every table: `auth.uid() IS NOT NULL` = full access.

### Core Tables

#### `contacts`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | default gen_random_uuid() |
| first_name | text | |
| last_name | text | |
| full_name | text | display name |
| title | text | job title |
| seniority | text | executive, founder, director, senior, manager, junior |
| department | text | e.g. master_sales, engineering |
| email | text | |
| linkedin | text | URL |
| twitter | text | URL or handle |
| telegram | text | handle |
| phone | text | |
| context | text | current situation, recent activity — used to personalize outreach |
| apollo_id | text | Apollo People API ID for dedup/re-enrichment |
| source | text | speakers, sponsors, eli-sheet, jb-sheet, apollo |
| notes | text | |
| created_at | timestamptz | default now() |
| updated_at | timestamptz | default now(), trigger on update |

#### `companies`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| name | text | |
| website | text | |
| linkedin_url | text | |
| category | text | Exchange, Custody, Protocol, Legal, Security, etc. |
| description | text | what they do |
| context | text | current situation, news, why relevant now |
| usp | text | FP Block's selling angle for this company |
| icp_score | integer | 0-100, >=75 qualifying, >=90 Tier 1 |
| icp_reason | text | why they score this way |
| created_at | timestamptz | |
| updated_at | timestamptz | |

#### `events`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| name | text | e.g. EthCC 2026 |
| location | text | e.g. Cannes |
| date_start | date | |
| date_end | date | |
| website | text | |
| notes | text | |
| created_at | timestamptz | |

#### `messages`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| contact_id | uuid FK → contacts | |
| company_id | uuid FK → companies | |
| event_id | uuid FK → events | context event |
| channel | text | email, linkedin, twitter, telegram |
| sequence_number | integer | 1 = intro, 2 = follow-up, 3 = breakup, etc. |
| iteration | integer | 1 = original, 2 = rewrite. Only latest iteration is active |
| subject | text | email subject line (nullable) |
| body | text | message content |
| status | text | draft, approved, scheduled, processing, sent, opened, replied, bounced, failed, superseded |
| sender_id | uuid FK → sender_profiles | per-message override (nullable, falls back to event_config) |
| cta | text | per-message CTA override (nullable, falls back to event_config) |
| scheduled_at | timestamptz | when to send |
| created_at | timestamptz | |
| sent_at | timestamptz | |

#### `company_signals`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| company_id | uuid FK → companies | |
| signal_type | text | news, funding, partnership, product_launch, regulatory, hiring, award |
| description | text | what happened |
| date | date | when it happened (nullable) |
| source | text | company_news_cache, jb-sheet, manual, brave, perplexity |
| created_at | timestamptz | |

### Join Tables

#### `contact_company`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| contact_id | uuid FK → contacts | |
| company_id | uuid FK → companies | |
| role | text | job title at this company |
| role_type | text | executive, founder, technical, sales, marketing, legal, other |
| founder_status | text | founder, cofounder, or null |
| is_primary | boolean | main affiliation? |
| source | text | where we learned this |

Unique constraint on (contact_id, company_id).

#### `contact_event`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| contact_id | uuid FK → contacts | |
| event_id | uuid FK → events | |
| participation_type | text | speaker, sponsor_rep, attendee, organizer, target |
| track | text | e.g. Built on Ethereum, RWA Tokenisation |
| notes | text | |

Unique constraint on (contact_id, event_id).

#### `company_event`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| company_id | uuid FK → companies | |
| event_id | uuid FK → events | |
| relationship_type | text | sponsor, exhibitor, partner, attendee |
| sponsor_tier | text | DIAMOND SPONSORS, RUBY SPONSORS, etc. |
| notes | text | |

Unique constraint on (company_id, event_id).

### Config Tables

#### `sender_profiles`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| name | text | JB, Wes, etc. |
| email | text | SendGrid from address |
| heyreach_account_id | text | HeyReach LinkedIn account identifier |
| signature | text | email signature block |
| tone_notes | text | guidance for AI generation (e.g. "direct, no fluff") |
| created_at | timestamptz | |

#### `event_config`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| event_id | uuid FK → events | unique |
| sender_id | uuid FK → sender_profiles | default sender for this event |
| cta_url | text | default CTA link |
| cta_text | text | default CTA display text |
| prompt_template_id | uuid FK → prompt_templates | default generation prompt |
| notify_emails | text[] | recipients for digest/notifications |
| created_at | timestamptz | |

#### `prompt_templates`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| name | text | e.g. "EthCC LinkedIn Intro", "Follow-up Email" |
| channel | text | email, linkedin, twitter, or null (any) |
| system_prompt | text | system message for Gemini |
| user_prompt_template | text | template with slots: {{contact.full_name}}, {{contact.context}}, {{company.name}}, {{company.context}}, {{company.usp}}, {{company.icp_reason}}, {{sender.name}}, {{sender.tone_notes}}, {{cta}}, {{previous_message}} |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### Automation Tables

#### `automation_rules`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| name | text | human-readable name |
| trigger_table | text | contacts, companies, contact_company |
| trigger_event | text | INSERT, UPDATE |
| conditions | jsonb | e.g. {"icp_score": {"gte": 75}} |
| action | text | enrich_contact, enrich_company, generate_sequence |
| action_params | jsonb | additional params passed to the edge function |
| enabled | boolean | default false |
| created_at | timestamptz | |

#### `job_log`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| job_type | text | enrich_contact, enrich_company, generate_messages, send_message, sync_status, automation |
| target_table | text | contacts, companies, messages |
| target_id | uuid | FK to the affected record |
| status | text | started, completed, failed |
| error | text | error message if failed |
| metadata | jsonb | additional context (API response snippets, etc.) |
| created_at | timestamptz | default now() |

---

## Edge Functions

All edge functions are Deno-based (Supabase Edge Functions). They receive the user's JWT from the frontend or the secret key when invoked by CRON. All external API keys stored as Supabase Edge Function secrets.

### 1. `enrich-contact`

**Input:** `{ contact_id: uuid }` or `{ contact_ids: uuid[] }`

**Flow:**
1. Read contact(s) from DB
2. For each: Apollo People API search by name + company name
3. Fill: email, linkedin, twitter, phone, apollo_id, seniority, department
4. Skip fields that already have values (don't overwrite manual edits)
5. Write to `contacts`, log to `job_log`

**Rate limiting:** Apollo API has rate limits. Batch requests are processed sequentially with 500ms delay between calls.

### 2. `enrich-company`

**Input:** `{ company_id: uuid }` or `{ company_ids: uuid[] }`

**Flow:**
1. Read company from DB
2. Brave Search API: search for recent news/events about the company
3. Perplexity API: deeper research query for company context
4. Gemini: synthesize search results into a concise `context` paragraph
5. Parse out individual signals and insert into `company_signals`
6. Update `companies.context` with the synthesized paragraph
7. Apollo Organization API: fill website, linkedin_url if missing
8. Log to `job_log`

### 3. `generate-messages`

**Input:**
```json
{
  "contact_ids": ["uuid", ...],
  "event_id": "uuid",
  "channels": ["email", "linkedin"],
  "sequence_number": 1,
  "prompt_template_id": "uuid | null (use event default)",
  "sender_id": "uuid | null (use event default)",
  "cta": "string | null (use event default)"
}
```

**Flow:**
1. Load event_config → sender_profile, CTA, prompt_template
2. Apply overrides from input (sender_id, cta, prompt_template_id)
3. For each contact:
   a. Load contact + contact_company + company (with context, usp, icp_reason) + company_signals
   b. If sequence_number > 1, load the previous message body for context
   c. Assemble the prompt by filling template slots
   d. Call Gemini to generate message(s) per channel
   e. If this is a rewrite (existing message at same contact/channel/sequence_number), increment iteration and mark old message as `superseded`
   f. Insert into `messages` as `status: draft`
4. Log to `job_log`

### 4. `send-message`

**Input:** `{ message_id: uuid }` or `{ message_ids: uuid[] }`

**Flow:**
1. Set status to `processing` (prevents double-sends from CRON)
2. For each message, load contact + sender_profile
3. Route by channel:
   - **email:** SendGrid v3 API. From: sender_profile.email. To: contact.email. Subject + body from message. Signature from sender_profile.
   - **linkedin:** HeyReach API. Send single message from sender_profile.heyreach_account_id to contact.linkedin.
   - **twitter:** Not automated. Set status to `approved` with a note that manual send is required.
4. On success: status → `sent`, set `sent_at`
5. On failure: status → `failed`, log error to `job_log`

### 5. `sync-status`

**Input:** none (called by CRON or manually)

**Flow:**
1. Query messages with status `sent` that haven't been synced recently
2. **SendGrid:** Fetch email events (delivered, opened, bounced) via Event Webhook or Activity API
3. **HeyReach:** Poll campaign/message status for LinkedIn messages
4. Update message statuses: sent → opened, sent → bounced, sent/opened → replied
5. Log sync results to `job_log`

### 6. `process-automations`

**Trigger:** Database webhook via pg_notify on INSERT/UPDATE to contacts, companies, contact_company

**Flow:**
1. Receive the changed row + table + event type
2. Query `automation_rules` where `trigger_table` and `trigger_event` match and `enabled = true`
3. For each matching rule, evaluate `conditions` against the row
4. If conditions match, invoke the appropriate edge function:
   - `enrich_contact` → call `enrich-contact`
   - `enrich_company` → call `enrich-company`
   - `generate_sequence` → call `generate-messages` with params from `action_params`
5. Log to `job_log`

---

## CRON Jobs (pg_cron)

### 1. `send-scheduled` — every hour
```sql
SELECT cron.schedule('send-scheduled', '0 * * * *', $$
  SELECT net.http_post(
    'https://<project>.supabase.co/functions/v1/send-message',
    '{}',
    headers := '{"Authorization": "Bearer <secret_key>"}'
  );
$$);
```

The edge function itself queries `messages WHERE status = 'scheduled' AND scheduled_at <= now()`.

### 2. `sync-status` — every hour
```sql
SELECT cron.schedule('sync-status', '30 * * * *', $$
  SELECT net.http_post(
    'https://<project>.supabase.co/functions/v1/sync-status',
    '{}',
    headers := '{"Authorization": "Bearer <secret_key>"}'
  );
$$);
```

Offset by 30 minutes from send-scheduled so they don't compete.

---

## Next.js Admin Panel

### Tech
- Next.js 15 (app router)
- Supabase SSR client (`@supabase/ssr`)
- Supabase Auth (email/password only)
- Tailwind CSS for styling
- Supabase Realtime for live status updates on message queue

### Route Structure

```
app/
├── (public)/
│   ├── jb/page.tsx          — JB landing page
│   └── wes/page.tsx         — Wes landing page
├── admin/
│   ├── layout.tsx           — Auth-protected layout (sidebar, header)
│   ├── login/page.tsx       — Login page (outside protected layout)
│   ├── page.tsx             — Dashboard
│   ├── events/
│   │   └── [id]/page.tsx    — Event view
│   ├── contacts/
│   │   └── [id]/page.tsx    — Contact detail
│   ├── companies/
│   │   └── [id]/page.tsx    — Company detail
│   └── queue/page.tsx       — Message queue
├── middleware.ts            — Auth check for /admin/* only
```

### Auth Flow
- `middleware.ts` checks for Supabase session on all `/admin/*` routes except `/admin/login`
- No session → redirect to `/admin/login`
- Login page uses `supabase.auth.signInWithPassword()`
- Supabase client initialized with `NEXT_SUPABASE_PUBLISHABLE_KEY` on client, `NEXT_SUPABASE_SECRET_KEY` on server
- User accounts created manually via Supabase dashboard

### Views

#### Dashboard (`/admin`)
- **Summary cards:** Total contacts, companies, messages by status (draft/scheduled/sent/replied/bounced)
- **Recent activity:** Last 20 `job_log` entries
- **Quick actions:** "Enrich batch", "Generate messages", "Review drafts" — each opens a modal or navigates to the relevant view

#### Event View (`/admin/events/:id`)
- **Header:** Event name, dates, location. Inline-editable event_config (sender, CTA, prompt template).
- **Tabs:**
  - **Contacts:** Table of contacts linked via `contact_event`. Columns: name, company, role, ICP score, message status (icon badges), participation type. Filterable by ICP tier, participation type, message status. Bulk select → "Enrich selected" / "Generate messages for selected".
  - **Companies:** Table of companies via `company_event`. Columns: name, category, sponsor tier, ICP score, contact count, message coverage. Expandable rows showing contacts.
  - **Messages:** Table of all messages for this event. Columns: contact, company, channel, sequence #, status, scheduled date, sender. Filterable by status, channel, sender. Bulk approve/schedule/send.

#### Contact Detail (`/admin/contacts/:id`)
- **Header:** Full name, title, company, ICP score badge
- **Info panel:** All contact fields, inline editable. Context field has a larger text area.
- **Company affiliations:** Cards showing each company via `contact_company` with role, founder_status.
- **Events:** List of events via `contact_event` with participation type and track.
- **Messages:** Grouped by channel → sequence → iteration. Shows full message body, status, timestamps. Actions per message: edit, approve, schedule, send.
- **Actions bar:** "Enrich", "Generate message", "Edit context"

#### Company Detail (`/admin/companies/:id`)
- **Header:** Name, category, ICP score badge
- **Info panel:** All company fields, inline editable. Context and USP have larger text areas.
- **Signals timeline:** Chronological list of `company_signals` — type badge, description, date.
- **Contacts:** Table of people at this company via `contact_company`, with role, founder_status, message status.
- **Messages:** All messages across contacts at this company.
- **Actions bar:** "Enrich", "Generate messages for all contacts", "Edit context"

#### Message Queue (`/admin/queue`)
- **Tabs:** Drafts | Scheduled | Recently Sent | Failed
- **Drafts tab:** Messages needing review. Per-message: inline edit body/subject, override sender/CTA dropdowns, approve button, schedule button (with datetime picker).
- **Scheduled tab:** Upcoming sends sorted by `scheduled_at`. Cancel/reschedule actions.
- **Recently Sent tab:** Last 48 hours. Status badges (sent, opened, replied, bounced). Link to contact.
- **Failed tab:** Messages that failed to send. Error details from `job_log`. Retry button.
- **Batch actions:** Select multiple → approve all, schedule all (with shared datetime), send all now.

### Landing Pages

#### `/jb` and `/wes`
- Completely isolated — own layout with no shared components from admin
- Public (no auth)
- No navigation to admin or to each other
- Content is static/CMS-driven (out of scope for this spec — placeholder pages for now)

---

## Data Migration

One-time script to ETL existing CSV/JSON data into Supabase:

1. Parse `Cannes-Grid view.csv` (primary source, 238 rows) → `contacts`, `companies`, `contact_company`, `contact_event`, `messages`
   - `Emails Sent = 0.0` → message with status `sent`, channel `email`
   - `Emails Sent = empty` → no email message
2. Parse `sponsor_contacts.csv` (464 rows) → `contacts`, `contact_company`, `contact_event` (sponsor_rep)
3. Parse `sponsors.csv` (77 rows) → `companies`, `company_event`
4. Parse `company_news_cache.json` (206 entries) → `company_signals`, `companies.context`
5. Parse `company_research.csv` (201 rows) → `companies` (usp, icp_score, icp_reason)
6. Parse `jb-sheet.csv` → `contacts`, `companies`, `messages` (merge by name/company, don't duplicate)
7. Parse `eli-sheet.csv` → `contacts`, `companies`, `messages` (merge by name/company)
8. Dedup contacts by (full_name + company) — prefer records with more complete data

Seed `sender_profiles` with JB and Wes. Seed `events` with EthCC 2026 and TOKEN2049 Dubai 2026. Seed `event_config` for EthCC with JB as default sender and gofpblock.com as CTA.

---

## Environment Variables

Already in `.env.local`:
```
NEXT_SUPABASE_PUBLISHABLE_KEY  — client-side Supabase calls
NEXT_SUPABASE_SECRET_KEY       — server-side / CRON Supabase calls
NEXT_SUPABASE_PROJECT_ID       — project identifier
NEXT_SUPABASE_PROJECT_URL      — Supabase API URL
SENDGRID_API_KEY               — email sending
HEYREACH_API_KEY               — LinkedIn sending
APOLLO_API_KEY                 — contact enrichment
GEMINI_API_KEY                 — message generation + context synthesis
BRAVE_SEARCH_API_KEY           — company research
PERPLEXITY_API_KEY             — company research
```

Edge function secrets (set via `supabase secrets set`):
Same keys as above, accessed via `Deno.env.get()` in edge functions.

---

## What's Out of Scope

- Twitter/X automated sending (manual for now)
- Telegram automated sending
- Multi-tenant / team permissions beyond basic auth
- Analytics / reporting beyond dashboard summary cards
- Landing page content for /jb and /wes (placeholder only)
- Mobile responsiveness (desktop internal tool)
