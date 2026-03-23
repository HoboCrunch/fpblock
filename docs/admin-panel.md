# Admin CRM Guide

The admin CRM is at `/admin/*`. All routes require authentication via Supabase Auth.

## Login

**URL:** `/login`

Email/password sign-in. Redirects to `/admin` on success. All `/admin/*` routes redirect here if unauthenticated. The login page lives outside the admin layout (at `app/login/page.tsx`) to avoid redirect loops.

**Credentials:** `admin@gofpblock.com` / `changeme`

## Navigation

The sidebar contains 11 sections with Lucide icons:

| Section | URL | Icon |
|---------|-----|------|
| Dashboard | `/admin` | LayoutDashboard |
| Persons | `/admin/persons` | Users |
| Organizations | `/admin/organizations` | Building2 |
| Events | `/admin/events` | Calendar |
| Pipeline | `/admin/pipeline` | Kanban |
| Initiatives | `/admin/initiatives` | Target |
| Sequences | `/admin/sequences` | GitBranch |
| Inbox | `/admin/inbox` | Mail |
| Enrichment | `/admin/enrichment` | Sparkles |
| Uploads | `/admin/uploads` | Upload |
| Correlations | `/admin/correlations` | GitMerge |
| Settings | `/admin/settings` | Settings |

Events sub-items expand inline under the Events nav item. The sidebar collapses to icon-only mode via a toggle at the bottom, and auto-collapses on tablet viewports.

The header shows a breadcrumb trail (auto-generated from the URL path) on the left and the logged-in user's email + sign out on the right.

## Dashboard

**URL:** `/admin`

Overview of the CRM:

- **Stat Cards** (4 across) — Persons, Organizations, Interactions (total), Replied. Glass cards with large numbers and accent-colored Lucide icons.
- **Pipeline Funnel** — horizontal stacked bar showing person distribution across interaction stages (Not Contacted → Draft → Scheduled → Sent → Opened → Replied → Bounced/Failed). Segments are clickable and link to the Pipeline page filtered to that stage.
- **Recent Activity** — last 20 entries from the job_log table with status indicators
- **Quick Actions** — Upload CSV, Run Enrichment, Review Drafts

## Persons

**URL:** `/admin/persons`

Searchable, filterable list of all persons with computed fields:

- **Search** — by name (trigram fuzzy search via pg_trgm)
- **Filters** — ICP score range, Has Email, Last Interaction Status, Event, Organization
- **Table columns:**
  - Name (link to detail)
  - Organization (primary org from person_organization where is_primary = true)
  - Title
  - ICP (primary organization's icp_score via `persons_with_icp` Postgres view, color-coded badge)
  - Channels (small icons for each populated channel: email, LinkedIn, Twitter, Telegram)
  - Last Interaction (most recent interaction date)
  - Interaction Count
- **Pagination** — 25 per page
- **Bulk actions** (on multi-select): Enrich Selected, Generate Messages, Enroll in Initiative

### Person Detail

**URL:** `/admin/persons/{id}`

Full profile in glass cards:
- **Header** — name, title, primary organization, ICP score badge, photo
- **Contact Info** — email, LinkedIn, Twitter, Telegram, phone, source
- **Notes** — freeform notes, bio
- **Affiliations** — all organization memberships (current and historical) with role, role_type, is_current indicator, primary flag
- **Events** — event participations across all events with role (speaker, attendee, etc.), talk_title, track, time_slot
- **Interactions Timeline** — unified chronological feed of all interactions (see Interactions Timeline section below)
- **Initiative Enrollments** — initiatives this person is enrolled in with status, priority, and scoped interaction progress

## Organizations

**URL:** `/admin/organizations`

Searchable, filterable list of all organizations:

- **Filters** — ICP range, Category, Has Signals
- **Table columns:** Name (link to detail), Category, ICP Score (badge), Person Count, Signal Count, Events (with sponsor tier badges), Last Interaction
- **Pagination** — 25 per page

### Organization Detail

**URL:** `/admin/organizations/{id}`

Full profile with:
- **Header** — name, category, ICP score badge, logo, website
- **Context** — description, strategic context, USP angle, ICP reason
- **People Roster** — persons affiliated via person_organization with role, role_type, current/historical status
- **Signals Timeline** — organization_signals in reverse chronological order
- **Events** — event participations with role (sponsor, partner, exhibitor) and sponsor tier
- **Interactions Timeline** — aggregated interaction timeline across all persons in the org (see Interactions Timeline section below)

## Events

**URL:** `/admin/events`

Card grid layout. Each event as a glass card showing name, dates, location, event_type, and footer stats (counts per role type: speakers, sponsors, related contacts). Click to open detail.

### Event Detail

**URL:** `/admin/events/{id}`

Five tabs:

#### Speakers
Confirmed speakers from event_participations (role = "speaker"). Table columns: Name, Organization, Talk Title, Track, Time Slot, Room. Links to person detail.

#### Sponsors
Sponsoring organizations from event_participations (role = "sponsor"). Table columns: Organization Name, Sponsor Tier (badge), Person Count (from affiliated persons). Links to organization detail.

#### Related Contacts
People from sponsoring/partner organizations joined via person_organization, who are not themselves confirmed event participants. Labeled "not confirmed" with an option to mark as confirmed (creates an event_participation with confirmed = true). Table columns: Name, Organization, Role, Title, ICP.

#### Schedule
Lightweight day/track/slot grid view assembled from event_participation metadata (time_slot, track, room, talk_title). Grouped by day, sorted by time within track.

#### Initiatives
Campaigns and workstreams tied to this event via initiatives.event_id. Table columns: Name, Type, Status, Owner, Enrollment Count, Interaction Stats. Links to initiative detail.

## Initiatives

**URL:** `/admin/initiatives`

List of campaigns and workstreams:

- **Filters** — Status (active/paused/completed), Type, Event, Owner
- **Table columns:** Name (link to detail), Type, Event, Status, Owner, Enrollment Count, Interaction Stats (sent/replied/meeting counts)
- **Actions** — Create New Initiative

### Initiative Detail

**URL:** `/admin/initiatives/{id}`

- **Header** — name, type, status, owner, linked event
- **Enrolled Persons/Organizations** — table with priority, enrollment status, last interaction, interaction count. Bulk enroll/remove actions.
- **Interactions Timeline** — scoped to this initiative (interactions where initiative_id matches), showing all touchpoints chronologically
- **Sequence Progress** — sequences linked to this initiative with enrollment counts and step completion rates

## Interactions Timeline

Reusable component embedded on Person, Organization, Event, and Initiative detail views.

- **Chronological feed** — reverse chronological by occurred_at
- **Entry display** — type icon (email, handshake, phone, etc.), channel badge, direction arrow (inbound/outbound/internal), status pill (draft/sent/replied/etc.), handled_by tag
- **Filterable** — by interaction_type, channel, direction
- **Expandable** — click to reveal full body, subject, and type-specific detail from the JSONB `detail` field
- **Interaction types:** cold_email, cold_linkedin, cold_twitter, warm_intro, meeting, call, event_encounter, note, research

## Correlations

**URL:** `/admin/correlations`

Fuzzy match review queue for deduplication:

- **Queue** — pending correlation_candidates sorted by confidence (highest first)
- **Side-by-side comparison** — source record vs. target record with all fields displayed for comparison
- **Match reasons** — displayed as badges (e.g., "exact_email", "similar_name:0.92", "same_linkedin")
- **Confidence score** — prominently displayed with color coding (green > 0.9, yellow 0.7-0.9, orange 0.6-0.7)
- **Actions:**
  - **Merge** — combines records, reassigns all relationships (event_participations, interactions, initiative_enrollments, person_organization) to the winning record, deletes the losing record
  - **Dismiss** — marks candidate as dismissed, keeps both records separate
- **Filters** — entity_type (person/organization), confidence range, status (pending/merged/dismissed)
- **Stats** — counts of pending, merged, and dismissed candidates

## Pipeline

**URL:** `/admin/pipeline`

Scoped to a selected initiative (dropdown at top). Derives stages from interaction status.

Two views (toggle top-right):

### Kanban View (default)
- **Columns:** Not Contacted, Draft, Scheduled, Sent, Opened, Replied, Bounced/Failed
- **Cards:** Person name, organization, channel icon, ICP badge
- **Drag and drop:** Move persons between stages. Moving right updates the most recent interaction status. Moving left creates a new draft. Moving from "Not Contacted" creates a new interaction (modal for channel + type selection).
- **Filters:** Channel, ICP range

### Table View
Same data as a sortable, filterable table: Person, Organization, Channel, Stage, ICP, Scheduled Date, Last Updated.

**Deep linking:** `?stage=draft` pre-filters to a specific stage (used by Dashboard "Review Drafts" quick action). `?initiative={id}` pre-selects an initiative.

## Sequences

**URL:** `/admin/sequences`

Manage outreach sequence templates. Sequences can be linked to an initiative via initiative_id.

### List View
Table: Name, Channel, Steps count, Persons Enrolled, Completion Rate, Initiative.

### Detail View (`/admin/sequences/{id}`)
- **Step timeline** — vertical list of glass cards, each showing: step number, delay (days), action type (initial/follow_up/break_up), subject template (email only), body template preview
- **Step editor** — add/remove/edit steps, save via server action
- **Enrolled persons** — right sidebar showing persons with their current step and status

## Inbox

**URL:** `/admin/inbox`

Unified inbound email view for `jb@gofpblock.com` and `wes@gofpblock.com` via Fastmail JMAP.

### Header
"Inbox" heading with a right-aligned "Sync" button that syncs both accounts in parallel. No per-account status cards.

### Email View (two-column)
- **Left (email list):** Each email card shows sender name, subject, snippet. Top-right: orange pill with account tag (JB / Wes). Bottom-right: relative timestamp. Pipeline-aware styling:
  - **Unread, from known person:** orange left accent + subtle orange background fill
  - **Unread, unknown sender:** white left accent, default background
  - **Read, from known person:** subtle orange background fill, no accent
  - **Read, unknown sender:** default background, no accent
  - "Known person" = sender email exists in the persons table (pipeline detection)
  - Correlated emails additionally show a badge with person name + ICP score
- **Right (email detail):** Full email body (HTML rendered). If correlated: person card with name, organization, ICP score, link to person detail. Action buttons: Mark as Read, Link to Person, Ignore.
- **Filter tabs:** All | Correlated | Uncorrelated | Account filter (JB / Wes / Both)

### Auto-Sync
A pg_cron job (`016_inbox_sync_cron.sql`) polls every 15 minutes per account (JB at :00/:15/:30/:45, Wes offset by 1 minute) via pg_net HTTP POST to `/api/inbox/sync`.

### Auto-Correlation
When emails are synced:
1. Exact match on sender email → persons.email
2. Domain match on sender → organizations.website
3. On match: updates interaction status to "replied", sends Telegram notification

## Enrichment

**URL:** `/admin/enrichment`

### Run Enrichment
- Source: Apollo (only option currently)
- Target: All unenriched persons / Selected persons / Persons from event
- Fields: Email, LinkedIn, Twitter, Phone (checkboxes)
- Run button → creates job_log entry, kicks off enrichment

### Job History
Table of past enrichment runs from job_log: Date, Source, Persons Processed, Emails Found, LinkedIn Found, Status.

**Pre-selection:** Bulk "Enrich Selected" action from Persons page passes person IDs via URL params.

## Uploads

**URL:** `/admin/uploads`

### CSV Upload
1. **Drop zone** — drag and drop or click to browse for .csv files
2. **Column mapper** — maps CSV headers to person/organization fields with auto-matching
3. **Preview** — first 10 rows with mapped data
4. **Import config:** event selector, import as (Persons/Organizations/Both), duplicate handling (Skip/Update/Create new)
5. **Import** — server action creates records, links to event, handles dedup. After import, runs correlation pass to flag potential duplicates.

### Upload History
Table of past imports: Date, Filename, Rows, Persons Created, Organizations Created, Status.

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
