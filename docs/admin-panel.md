# Admin Panel Guide

The admin panel is at `/admin/*`. All routes require authentication via Supabase Auth.

## Login

**URL:** `/login`

Email/password sign-in. Redirects to `/admin` on success. All `/admin/*` routes redirect here if unauthenticated. The login page lives outside the admin layout (at `app/login/page.tsx`) to avoid redirect loops.

**Credentials:** `admin@gofpblock.com` / `changeme`

## Dashboard

**URL:** `/admin`

Overview of the outreach pipeline:

- **Summary Cards** — total contacts, companies, and message counts by status (drafts, scheduled, sent, replied, bounced, failed)
- **Review Drafts** — quick link to the message queue
- **Recent Activity** — last 20 entries from the job_log table, showing enrichment, generation, and sending operations with status indicators

## Event View

**URL:** `/admin/events/{id}`

Shows event details and three tabs:

### Contacts Tab
All contacts linked to this event via `contact_event`. Shows:
- Name (links to contact detail)
- Primary company
- Role/title
- ICP score (color-coded: green >= 90, blue >= 75, gray < 75)
- Participation type (speaker, sponsor_rep)
- Latest message status

### Companies Tab
All companies linked to this event via `company_event`. Shows:
- Company name (links to company detail)
- Category
- Sponsor tier
- ICP score
- Contact count

### Messages Tab
All messages for this event. Shows:
- Contact name, company
- Channel (email, linkedin, twitter)
- Sequence number + iteration (e.g. #1.2 = first message, second draft)
- Status badge
- Scheduled date

## Contact Detail

**URL:** `/admin/contacts/{id}`

Full profile of a contact:

- **Header** — name, title, primary company, ICP score badge
- **Contact Info** — email, LinkedIn, Twitter, Telegram, phone, source
- **Context** — freeform notes about the contact
- **Companies** — all company affiliations with roles, founder status, primary indicator
- **Events** — events this contact is linked to, with participation type and track
- **Messages** — all messages to this contact across channels and sequences

## Company Detail

**URL:** `/admin/companies/{id}`

Full profile of a company:

- **Header** — company name, category, ICP score badge
- **Company Info** — description, context (AI-generated), our angle (USP), ICP reason
- **Signals** — chronological list of news, funding, partnerships, etc. from enrichment
- **Contacts** — all contacts at this company (reuses ContactTable)
- **Messages** — all messages sent to contacts at this company

## Message Queue

**URL:** `/admin/queue`

Four tabs filtering messages by status:

| Tab | Statuses | Sort |
|-----|----------|------|
| Drafts | `draft` | newest first |
| Scheduled | `scheduled` | by scheduled_at ascending |
| Recently Sent | `sent`, `opened`, `replied`, `bounced` | by sent_at descending, limit 100 |
| Failed | `failed` | newest first |

## Landing Pages

**URL:** `/jb` and `/wes`

Public-facing personal landing pages for JB and Wes. These render outside the admin shell (no sidebar/header). Static HTML ported from the original `landing-page/` directory.

## Navigation

The sidebar contains:
- **Dashboard** — `/admin`
- **Message Queue** — `/admin/queue`
- **Events** — dynamically lists all events from the database, linking to `/admin/events/{id}`

The header shows the logged-in user's email and a sign out button.
