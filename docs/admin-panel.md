# Admin CRM Guide

The admin CRM is at `/admin/*`. All routes require authentication via Supabase Auth.

## Login

**URL:** `/login`

Email/password sign-in. Redirects to `/admin` on success. All `/admin/*` routes redirect here if unauthenticated. The login page lives outside the admin layout (at `app/login/page.tsx`) to avoid redirect loops.

**Credentials:** `admin@gofpblock.com` / `changeme`

## Navigation

The sidebar contains 10 sections with Lucide icons:

| Section | URL | Icon |
|---------|-----|------|
| Dashboard | `/admin` | LayoutDashboard |
| Contacts | `/admin/contacts` | Users |
| Companies | `/admin/companies` | Building2 |
| Events | `/admin/events` | Calendar |
| Pipeline | `/admin/pipeline` | Kanban |
| Sequences | `/admin/sequences` | GitBranch |
| Inbox | `/admin/inbox` | Mail |
| Enrichment | `/admin/enrichment` | Sparkles |
| Uploads | `/admin/uploads` | Upload |
| Settings | `/admin/settings` | Settings |

Events sub-items expand inline under the Events nav item. The sidebar collapses to icon-only mode via a toggle at the bottom, and auto-collapses on tablet viewports.

The header shows a breadcrumb trail (auto-generated from the URL path) on the left and the logged-in user's email + sign out on the right.

## Dashboard

**URL:** `/admin`

Overview of the outreach pipeline:

- **Stat Cards** (4 across) — Contacts, Companies, Messages (total), Replied. Glass cards with large numbers and accent-colored Lucide icons.
- **Pipeline Funnel** — horizontal stacked bar showing contact distribution across all outreach stages (Not Contacted → Draft → Scheduled → Sent → Opened → Replied → Bounced/Failed). Segments are clickable and link to the Pipeline page filtered to that stage.
- **Recent Activity** — last 20 entries from the job_log table with status indicators
- **Quick Actions** — Upload CSV, Run Enrichment, Review Drafts

## Contacts

**URL:** `/admin/contacts`

Searchable, filterable list of all contacts with computed fields:

- **Search** — by name
- **Filters** — ICP score range, Has Email, Outreach Status, Event, Company
- **Table columns:**
  - Name (link to detail)
  - Company (primary company from contact_company join)
  - Title
  - ICP (primary company's icp_score, color-coded badge)
  - Channels (small icons for each populated channel: email, LinkedIn, Twitter, Telegram)
  - Outreach Status (most advanced message status for this contact; "Not Contacted" if no messages)
  - Last Touched (most recent message activity date)
- **Pagination** — 25 per page
- **Bulk actions** (on multi-select): Enrich Selected, Generate Messages, Add to Sequence

### Contact Detail

**URL:** `/admin/contacts/{id}`

Full profile in glass cards:
- Header — name, title, primary company, ICP score badge
- Contact Info — email, LinkedIn, Twitter, Telegram, phone, source
- Context — freeform notes
- Companies — all affiliations with roles, founder status, primary indicator
- Events — linked events with participation type and track
- Messages — all messages to this contact

## Companies

**URL:** `/admin/companies`

Searchable, filterable list of all companies:

- **Filters** — ICP range, Category, Has Signals
- **Table columns:** Name (link), Category, ICP Score (badge), Contact Count, Signal Count, Last Signal Date
- **Pagination** — 25 per page

### Company Detail

**URL:** `/admin/companies/{id}`

Full profile with: description, context, USP angle, ICP reason, signals timeline, contacts table, messages table.

## Events

**URL:** `/admin/events`

Card grid layout. Each event as a glass card showing name, dates, location, and footer stats (contact/company/message counts). Click to open detail.

### Event Detail

**URL:** `/admin/events/{id}`

Three tabs: Contacts (linked via contact_event), Companies (linked via company_event), Messages (for this event).

## Pipeline

**URL:** `/admin/pipeline`

Two views (toggle top-right):

### Kanban View (default)
- **Columns:** Not Contacted, Draft, Scheduled, Sent, Opened, Replied, Bounced/Failed
- **Cards:** Contact name, company, channel icon, ICP badge
- **Drag and drop:** Move contacts between stages. Moving right updates the most recent message status. Moving left creates a new draft. Moving from "Not Contacted" creates a new message (modal for channel + event selection).
- **Filters:** Event, Channel, ICP range

### Table View
Same data as a sortable, filterable table: Contact, Company, Channel, Stage, ICP, Scheduled Date, Last Updated.

**Deep linking:** `?stage=draft` pre-filters to a specific stage (used by Dashboard "Review Drafts" quick action).

## Sequences

**URL:** `/admin/sequences`

Manage outreach sequence templates.

### List View
Table: Name, Channel, Steps count, Contacts Enrolled, Completion Rate.

### Detail View (`/admin/sequences/{id}`)
- **Step timeline** — vertical list of glass cards, each showing: step number, delay (days), action type (initial/follow_up/break_up), subject template (email only), body template preview
- **Step editor** — add/remove/edit steps, save via server action
- **Enrolled contacts** — right sidebar showing contacts with their current step and status

## Inbox

**URL:** `/admin/inbox`

Unified inbound email view for `jb@gofpblock.com` and `wes@gofpblock.com` via Fastmail JMAP.

### Connected Accounts (top)
Glass cards for each account: email, last sync time, unread count, status indicator (green/red), "Sync Now" button.

### Email View (two-column)
- **Left (email list):** Sender, subject, snippet, timestamp. Unread emails have orange left border. Correlated emails show a pipeline badge (contact name + ICP). Uncorrelated emails show "Link to Contact".
- **Right (email detail):** Full email body. If correlated: contact card with name, company, stage, link to contact detail. Action buttons: Mark as Read, Link to Contact, Ignore.
- **Filter tabs:** All | Correlated | Uncorrelated | Account filter (JB / Wes / Both)

### Auto-Correlation
When emails are synced:
1. Exact match on sender email → contacts.email
2. Domain match on sender → companies.website
3. On match: updates outbound message to "replied", sends Telegram notification

## Enrichment

**URL:** `/admin/enrichment`

### Run Enrichment
- Source: Apollo (only option currently)
- Target: All unenriched contacts / Selected contacts / Contacts from event
- Fields: Email, LinkedIn, Twitter, Phone (checkboxes)
- Run button → creates job_log entry, kicks off enrichment

### Job History
Table of past enrichment runs from job_log: Date, Source, Contacts Processed, Emails Found, LinkedIn Found, Status.

**Pre-selection:** Bulk "Enrich Selected" action from Contacts page passes contact IDs via URL params.

## Uploads

**URL:** `/admin/uploads`

### CSV Upload
1. **Drop zone** — drag and drop or click to browse for .csv files
2. **Column mapper** — maps CSV headers to contact/company fields with auto-matching
3. **Preview** — first 10 rows with mapped data
4. **Import config:** event selector, import as (Contacts/Companies/Both), duplicate handling (Skip/Update/Create new)
5. **Import** — server action creates records, links to event, handles dedup

### Upload History
Table of past imports: Date, Filename, Rows, Contacts Created, Companies Created, Status.

## Settings

**URL:** `/admin/settings`

Four tabs:

### Sender Profiles
CRUD for sender accounts: name, email, heyreach_account_id, signature, tone_notes.

### Prompt Templates
CRUD for AI message templates: name, channel, system_prompt, user_prompt_template.

### Automation Rules
CRUD for automation triggers: name, trigger_table, trigger_event, conditions (JSON), action, action_params. Toggle enabled/disabled.

### Event Config
Inline-editable table (one row per event): sender, CTA URL, CTA text, prompt template, notify emails.

## Landing Pages

**URL:** `/jb` and `/wes`

Public-facing personal landing pages. These render outside the admin shell (no sidebar/header). Glassmorphic design with orange/indigo accents, grid background, Poppins/Inter fonts.
