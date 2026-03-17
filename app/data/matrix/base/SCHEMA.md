# Matrix Base Schema

## Entity-Relationship Model

```
contacts ←→ contact_company ←→ companies
    ↕                              ↕           ↕
contact_event                company_event  company_signals
    ↕                              ↕
              events
    ↕
  messages → (contact, company, event)
  (supports sequences: msg 1 → msg 2 → msg 3 per contact/channel)
```

## Core Tables

### contacts.csv
All people across all sources (speakers, sponsor contacts, BD targets).

| Column | Type | Description |
|---|---|---|
| contact_id | PK | `C###` |
| first_name | text | |
| last_name | text | |
| full_name | text | Display name |
| title | text | Job title |
| seniority | enum | `executive`, `founder`, `director`, `senior`, `manager`, `junior` |
| department | text | e.g. `master_sales`, `master_human_resources`, `engineering` |
| email | text | |
| linkedin | url | |
| twitter | url/handle | |
| telegram | handle | |
| phone | text | |
| context | text | Current situation, recent activity, why this person matters — used to personalize outreach |
| apollo_id | text | Apollo People API ID (for dedup and re-enrichment) |
| source | text | Origin: `speakers`, `sponsors`, `eli-sheet`, `jb-sheet`, `apollo` |
| notes | text | |

### companies.csv
All organizations.

| Column | Type | Description |
|---|---|---|
| company_id | PK | `CO###` |
| name | text | |
| website | url | |
| linkedin_url | url | |
| category | text | e.g. `Exchange`, `Custody`, `Protocol`, `Legal`, `Security` |
| description | text | What they do |
| context | text | Current situation, recent news, why they're relevant right now — used to personalize outreach |
| usp | text | Our unique selling proposition angle |
| icp_score | int | 0-100, ≥75 qualifying, ≥90 Tier 1 |
| icp_reason | text | Why they score this way |

### events.csv
Events we're targeting for outreach.

| Column | Type | Description |
|---|---|---|
| event_id | PK | `E###` |
| name | text | |
| location | text | |
| date_start | date | ISO 8601 |
| date_end | date | ISO 8601 |
| website | url | |
| notes | text | |

### messages.csv
All outreach messages. Supports multi-step sequences (e.g. intro → follow-up → breakup) per contact/channel.

| Column | Type | Description |
|---|---|---|
| message_id | PK | `M###` |
| contact_id | FK → contacts | |
| company_id | FK → companies | |
| event_id | FK → events | Context event |
| channel | enum | `linkedin`, `email`, `twitter`, `telegram` |
| sequence_number | int | Position in sequence: `1` = intro, `2` = follow-up, `3` = breakup, etc. |
| iteration | int | Draft iteration: `1` = original, `2` = rewrite, etc. Only latest iteration is active |
| subject | text | Email subject line (nullable) |
| body | text | Message content |
| status | enum | `draft`, `approved`, `scheduled`, `sent`, `opened`, `replied`, `bounced`, `failed` |
| sender | text | Who sent it (team member name) |
| scheduled_at | datetime | When this message is scheduled to send |
| created_at | datetime | |
| sent_at | datetime | |

## Join Tables

### contact_company.csv
Links contacts to companies (many-to-many: person can represent multiple orgs).

| Column | Type | Description |
|---|---|---|
| contact_id | FK → contacts | |
| company_id | FK → companies | |
| role | text | Job title at this company |
| role_type | enum | `executive`, `founder`, `technical`, `sales`, `marketing`, `legal`, `other` |
| founder_status | enum | `founder`, `cofounder`, or empty — detects founding relationship |
| is_primary | bool | Is this their main affiliation? |
| source | text | Where we learned about this relationship |

### contact_event.csv
Links contacts to events.

| Column | Type | Description |
|---|---|---|
| contact_id | FK → contacts | |
| event_id | FK → events | |
| participation_type | enum | `speaker`, `sponsor_rep`, `attendee`, `organizer`, `target` |
| track | text | e.g. `Built on Ethereum`, `RWA Tokenisation` |
| notes | text | |

### company_event.csv
Links companies to events (sponsorship, exhibitor, etc.).

| Column | Type | Description |
|---|---|---|
| company_id | FK → companies | |
| event_id | FK → events | |
| relationship_type | enum | `sponsor`, `exhibitor`, `partner`, `attendee` |
| sponsor_tier | text | e.g. `DIAMOND SPONSORS`, `RUBY SPONSORS` |
| notes | text | |

### company_signals.csv
News, events, and contextual signals about companies — used to personalize and time outreach.

| Column | Type | Description |
|---|---|---|
| signal_id | PK | `S###` |
| company_id | FK → companies | |
| signal_type | enum | `news`, `funding`, `partnership`, `product_launch`, `regulatory`, `hiring`, `award` |
| description | text | What happened |
| date | date | When it happened (ISO 8601, nullable if unknown) |
| source | text | Where we learned this: `company_news_cache`, `jb-sheet`, `manual` |

## Source Data Mapping

| Original Source | Maps To |
|---|---|
| `app/matrix/base/Cannes-Grid view.csv` | **Primary source** — contacts + companies + messages (238 rows, Airtable export) |
| `scraping/data/speakers.csv` | contacts + contact_company + contact_event (speaker) |
| `scraping/data/enriched_speakers.csv` | contacts (enriched fields) + messages |
| `scraping/data/sponsors.csv` | companies + company_event (58 sponsors across 6 tiers) |
| `scraping/data/sponsor_contacts.csv` | **464 Apollo-sourced contacts** across 58 sponsor companies → contacts (with apollo_id) + contact_company + contact_event (sponsor_rep) |
| `scraping/data/company_research.csv` | companies (usp, icp_score, icp_reason) |
| `scraping/data/company_news_cache.json` | company_signals (206 entries) + companies.context |
| `scraping/data/outreach.csv` | messages |
| `scraping/data/outreach_messages.csv` | messages (twitter channel) |
| `scraping/data/messages_batch*.json` | messages (raw → processed) |
| `app/matrix/base/eli-sheet.csv` | contacts + companies + messages |
| `app/matrix/base/jb-sheet.csv` | contacts + companies + messages |

### Cannes-Grid view.csv Field Mapping

This is the Airtable production tracker (238 speakers). Key translation rules:

| Grid view field | Maps to | Notes |
|---|---|---|
| Score | companies.icp_score | |
| Name | contacts.full_name | ALL CAPS in source |
| Message | messages.body | |
| Email | contacts.email | |
| **Emails Sent = `0.0`** | **messages.status = `sent`, messages.channel = `email`** | **Counter shows 0 but email was sent via n8n webhook** |
| Emails Sent = `` (empty) | No email message exists | No email address or not targeted |
| Open URL | _(not migrated)_ | n8n webhook trigger URL — contains encoded email params |
| Subject | messages.subject | Email subject line |
| Role | contacts.title + contact_company.role | |
| Role_Type | contact_company.role_type | |
| Company | companies.name | |
| Category (from Company) | companies.category | |
| LinkedIn | contacts.linkedin | |
| LinkedIn_Sent = `TRUE` | messages (channel=linkedin, status=sent) | Currently all FALSE |
| X | contacts.twitter | Note: sometimes contains LinkedIn URL |
| X_Sent = `TRUE` | messages (channel=twitter, status=sent) | Currently all FALSE |
| Cat 1 | companies.category | Duplicate of Category |
| Notes | companies.description | Company description, not contact notes |
| Reply | messages (status=replied) | |
| Comment | messages.notes or contact notes | |
| Messages Sent | _(derived)_ | Total count across channels |

## Key Queries the App Needs

1. **All contacts at a company**: `contact_company WHERE company_id = X` → `contacts`
2. **All speakers at an event**: `contact_event WHERE event_id = X AND participation_type = 'speaker'` → `contacts`
3. **Sponsors for an event**: `company_event WHERE event_id = X AND relationship_type = 'sponsor'` → `companies`
4. **Message status for a contact**: `messages WHERE contact_id = X`
5. **Unsent messages**: `messages WHERE status = 'draft'`
6. **Scheduled queue**: `messages WHERE status = 'scheduled' ORDER BY scheduled_at`
7. **Sequence progress**: `messages WHERE contact_id = X AND channel = Y ORDER BY sequence_number` — shows where a contact is in their outreach sequence
8. **High-ICP companies**: `companies WHERE icp_score >= 75`
9. **Founders only**: `contact_company WHERE founder_status IN ('founder', 'cofounder')` → `contacts`
10. **Company signals**: `company_signals WHERE company_id = X ORDER BY date DESC`
11. **Contact with all context**: `contacts` JOIN `contact_company` JOIN `companies` JOIN `company_signals` JOIN `contact_event` JOIN `events` JOIN `messages`
