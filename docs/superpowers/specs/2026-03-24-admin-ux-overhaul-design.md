# Admin UX Overhaul — Two-Panel Table & Detail Views

**Date:** 2026-03-24
**Status:** Draft

## Overview

Redesign all admin table views (persons, organizations, events, lists) and detail pages (person, organization) into a consistent two-panel layout. The goal: surface relationship correlations at scale (person → org → event → sponsorship chains) with power-filtering, dense tables, and contextual sidebars.

Core principle: **relationships first, data completeness second, outreach readiness third.**

## Shared Layout: `TwoPanelLayout`

All views share this shell:

```
┌─────────────────────────────────────────────────────────────────────┐
│  Page Title                                          [Actions]      │
├──────────────────────────────────────────┬──────────────────────────┤
│                                          │                          │
│  CENTER PANEL (~70%)                     │  RIGHT SIDEBAR (~30%)    │
│                                          │  min 280px, max 380px    │
│  Dense content area                      │                          │
│  (table or detail sections)              │  Stacked sections        │
│                                          │  (filters, context,      │
│                                          │   identity, actions)     │
│                                          │                          │
└──────────────────────────────────────────┴──────────────────────────┘
```

- Center: `flex-1`, scrollable
- Sidebar: sticky, scrolls independently, fixed width range 280–380px
- Responsive: screens < 1024px collapse sidebar to a slide-out drawer with toggle button (filter icon)
- Component: `components/admin/two-panel-layout.tsx`

```typescript
interface TwoPanelLayoutProps {
  title: string;
  actions?: React.ReactNode;
  sidebar: React.ReactNode;
  children: React.ReactNode; // center content
}
```

---

## Part 1: Table Views

All table views share common patterns:
- Sortable column headers (click to toggle asc/desc, chevron indicator)
- URL-persisted sort/filter state via searchParams
- Batch fetching for large datasets (1000-row batches)
- Row hover highlight, click-to-navigate to detail page
- Selection via checkboxes for bulk actions

### 1.1 Persons Table

**Route:** `/admin/persons`
**Data source:** `persons_with_icp` view + interaction counts + event_participations joins

#### Center Panel — Columns

| # | Column | Field(s) | Width | Notes |
|---|--------|----------|-------|-------|
| 1 | Avatar + Name | `photo_url`, `full_name` | 200px | 24px avatar (fallback: initials), name linked to detail |
| 2 | Title | `title` | 140px | Truncated 30ch |
| 3 | Organization | `primary_org_name` | 160px | Linked to org detail |
| 4 | Seniority | `seniority` | 100px | Badge: c-level, director, vp, manager, etc. |
| 5 | ICP | `icp_score` | 60px | Color-coded badge: green ≥90, yellow ≥75, gray <75 |
| 6 | Channels | email, linkedin, twitter, telegram, phone | 120px | Icon row — filled = has data, outline/muted = missing |
| 7 | Events | `event_participations` | 160px | Compact badges: "EthCC: Speaker" |
| 8 | Correlation | computed | 200px | Relationship chain (see below) |
| 9 | Enrichment | `enrichment_status` | 40px | Icon: green ✓, orange spinner, red ✗, gray — |
| 10 | Last Activity | latest interaction date | 90px | Relative date |

**Correlation column computation:**

Join chain: person → person_organization → organization → event_participations (on same event).

Display rules (first match wins):
- Person is speaker/panelist AND their org sponsors same event: `"Speaker → {OrgName} → {Tier} Sponsor"` (e.g., "Speaker → Alchemy → Gold Sponsor")
- Person's org sponsors an event they attend: `"{Title} @ {OrgName} · {Tier} Sponsor"` (e.g., "CTO @ Alchemy · Gold Sponsor")
- Person is speaker but org doesn't sponsor: `"Speaker"` with event name
- Person's org sponsors an event: `"{OrgName} · {Tier} Sponsor"` but person isn't participating
- No event relationship: `"—"`

Rendered as compact chain with `→` separators, muted gray text, org name linked.

**Default sort:** `icp_score` desc

#### Right Sidebar — Sections

**1. Search**
`GlassInput` — searches across `full_name`, `email`, `primary_org_name`. Debounced 300ms.

**2. Filters** (collapsible groups with chevron toggles)

*Relationships:*
- Event — multi-select dropdown of events (from event_participations)
- Has Organization — yes/no toggle
- Correlation Type — multi-select: "Speaker + Sponsor", "Speaker Only", "Sponsor Contact", "No Event Link"

*Profile:*
- Seniority — multi-select: c-level, vp, director, manager, senior, entry, other
- Department — multi-select from distinct values
- Source — multi-select from distinct values

*Contact:*
- Has Email — toggle
- Has LinkedIn — toggle
- Has Phone — toggle
- Has Twitter — toggle
- Has Telegram — toggle

*Enrichment:*
- Status — multi-select: none, in_progress, complete, failed (person values)
- ICP Min — number input (GlassInput)
- ICP Max — number input (GlassInput)

**3. Active Filters**
Horizontal chip row below filters. Each chip shows filter name + value, click × to remove. "Clear all" link when > 2 filters active.

**4. Selection Summary**
Appears when ≥1 row is checked:
```
12 selected · Avg ICP 84 · 9 have email
[Add to List ▾] [Start Sequence] [Enrich]
```
Buttons use compact `Badge` styling with glass-orange variant.

**5. Row Preview**
On row hover (desktop) or selection (mobile), shows a compact card:
- Photo (48px), full name, title @ org
- Bio snippet (first 100 chars, if present)
- All contact links (clickable: mailto, linkedin URL, twitter URL, tel, telegram)
- Full correlation chain expanded with all event connections
- Disappears on mouse-out / deselection

Row Preview behavior:
- **Data source**: all preview data is included in the initial table fetch (no lazy loading)
- **Debounce**: 200ms delay before showing on hover to avoid flicker during mouse traversal
- **Mouse-into-preview**: preview stays visible when cursor moves into the preview card (for clicking links); dismisses when cursor leaves both the row and the preview card
- **Position**: anchored to right edge of hovered row, vertically centered, with viewport boundary detection to flip above/below if needed
- **Empty state**: when no row is hovered, the preview area is not rendered (no placeholder)

---

### 1.2 Organizations Table

**Route:** `/admin/organizations`
**Data source:** `organizations` + person_organization counts + organization_signals + event_participations

#### Center Panel — Columns

| # | Column | Field(s) | Width | Notes |
|---|--------|----------|-------|-------|
| 1 | Logo + Name | `logo_url`, `name` | 200px | 24px logo (fallback: first-letter), name linked |
| 2 | Category | `category` | 120px | Badge |
| 3 | ICP | `icp_score` | 60px | Color-coded badge |
| 4 | People | person_organization count | 100px | "{total} ({enriched}↑)" — enriched count in orange |
| 5 | Events | `event_participations` | 180px | Badge(s): "EthCC: Gold" showing event + sponsor tier |
| 6 | Signals | `signal_count` | 60px | Count |
| 7 | Industry | from enrichment metadata | 120px | Text, from Apollo data in job_log |
| 8 | Employees | from enrichment metadata | 90px | Range bucket: 1-10, 11-50, 51-200, 201-500, etc. |
| 9 | Enrichment | `enrichment_status` | 100px | Stage icon cluster: Search, Flask, Brain, Users — colored per status |
| 10 | Last Signal | latest signal date | 90px | Relative date |

**Default sort:** `icp_score` desc

#### Right Sidebar — Sections

**1. Search**
`GlassInput` — searches `name`, `website`, `description`. Debounced 300ms.

**2. Filters** (collapsible groups)

*Relationships:*
- Event — multi-select dropdown
- Sponsor Tier — multi-select: presented_by, platinum, diamond, emerald, gold, silver, bronze, copper, community
- Has People — yes/no toggle
- Min People Count — number input

*Profile:*
- Category — multi-select from distinct values
- Industry — multi-select from enrichment metadata
- Employee Range — bucket select: 1-10, 11-50, 51-200, 201-500, 501-1000, 1000+
- Founded Year — range inputs (min-max)

*Enrichment:*
- Status — multi-select: none, in_progress, partial, complete, failed (org values — includes 'partial' for multi-stage enrichment)
- ICP Min — number input
- ICP Max — number input

*Signals:*
- Has Signals — yes/no toggle
- Signal Type — multi-select from distinct values

**3. Active Filters** — same pattern as persons

**4. Selection Summary**
```
8 selected · Avg ICP 79 · 23 total contacts
[Enrich] [Add to Initiative ▾]
```

**5. Row Preview**
On hover: logo (48px), name, description snippet (120ch), website + linkedin links, ICP reason, USP summary (first 100ch), top 5 people by seniority (name + title).

Same Row Preview behavior as persons table (200ms debounce, mouse-into-preview, data pre-fetched, no placeholder).

---

### 1.3 Events Table

**Route:** `/admin/events`
**Data source:** `events` + event_participations aggregates + organization enrichment data

Replacing the current card grid with a proper table + sidebar.

#### Center Panel — Columns

| # | Column | Field(s) | Width | Notes |
|---|--------|----------|-------|-------|
| 1 | Name | `name` | 200px | Linked to event detail |
| 2 | Type | `event_type` | 100px | Badge |
| 3 | Dates | `date_start`, `date_end` | 110px | Compact range: "Jul 8–10" |
| 4 | Location | `location` | 130px | Truncated |
| 5 | Speakers | count (role=speaker/panelist/mc) | 70px | Number |
| 6 | Sponsors | count (role=sponsor/partner/exhibitor) | 70px | Number |
| 7 | Contacts | unique person count | 70px | Number |
| 8 | Orgs | unique org count | 60px | Number |
| 9 | Coverage | computed | 160px | Three mini-metrics (see below) |

**Coverage column** — answers "how well do we know this event's ecosystem?":
- `👤 80%` — % of sponsor orgs where we have ≥1 enriched contact
- `📊 72` — avg ICP of participating orgs (color-coded)
- `📡 14` — total signals across participating orgs

Rendered as three compact inline badges.

**Default sort:** `date_start` desc

#### Right Sidebar — Sections

**1. Search** — event name, location

**2. Filters**

*Event:*
- Type — multi-select: conference, hackathon, summit, meetup, etc.
- Date Range — from/to date inputs
- Location — text input (ilike)

*Coverage:*
- Min Speakers — number input
- Min Sponsors — number input
- Has Enriched Contacts — yes/no toggle
- Min Avg ICP — number input

**3. Active Filters** — chip row

**4. Event Preview**
On hover: full date range, location, website link, top 5 sponsors by tier with ICP scores, speaker count breakdown by seniority, readiness summary: "12/18 sponsors enriched · 34 contacts found · Avg ICP 81"

---

### 1.4 Lists Table

**Route:** `/admin/lists`
**Data source:** `person_lists` + `person_list_items` aggregates + member ICP data

#### Center Panel — Columns

| # | Column | Field(s) | Width | Notes |
|---|--------|----------|-------|-------|
| 1 | Name | `name` | 200px | Linked to list detail |
| 2 | Description | `description` | 200px | Truncated 50ch |
| 3 | Members | item count | 70px | Number |
| 4 | Avg ICP | computed | 70px | Color-coded |
| 5 | Has Email | computed | 100px | "34/42 (81%)" |
| 6 | Top Orgs | most common orgs | 180px | 2-3 org name badges |
| 7 | Created | `created_at` | 90px | Relative date |
| 8 | Updated | `updated_at` | 90px | Relative date |

**Default sort:** `updated_at` desc

#### Right Sidebar — Sections

**1. Search** — list name

**2. Filters**
- Min Members — number input
- Min Avg ICP — number input
- Created range — from/to date inputs

**3. List Preview**
On hover: full description, member breakdown by seniority, top 5 members by ICP (name + title + org), contact coverage stats (% email, % linkedin, % phone).

---

## Part 2: Detail Pages

### 2.1 Person Detail Page

**Route:** `/admin/persons/[id]`
**Data fetched:** person + person_organization (with org details) + event_participations (with event details) + interactions + org signals + org event_participations (for correlation)

#### Center Panel — Relationship Sections

**Section 1: Correlation Summary**

Horizontal strip at top, always visible. Sentence-level synthesis of key relationship chains:

```
Speaker at EthCC 2026 (Panel: "Onchain Incentives") · CTO at Alchemy · Alchemy is Gold Sponsor at EthCC
Also: Panelist at ETHDenver 2025 · Previously at Coinbase (Director of Eng)
```

Construction rules:
1. For each event participation, check if any of person's orgs sponsor that event
2. For each org link, check if that org has event participations
3. Build chain: role + event + org role + org event presence
4. Show current org connections first, then former
5. All entity names are clickable links

Component: `PersonCorrelationSummary` — receives person, orgs, events, org-event links.

**Section 2: Events & Roles**

`GlassCard` with table:

| Event | Role | Talk/Panel | Track | Org Also Sponsoring? |
|-------|------|-----------|-------|---------------------|

- Event: linked to event detail
- Role: badge (speaker, panelist, sponsor, etc.)
- Talk/Panel: `talk_title`, italicized, truncated
- Track: text
- "Org Also Sponsoring?": checks if any person_organization matches an org sponsoring the same event. Shows tier badge if yes, `—` if no.

Query: join event_participations → events, cross-reference person's org IDs against event_participations where role in (sponsor, partner, exhibitor).

**Section 3: Organizations**

`GlassCard` with table:

| Organization | Role | Status | ICP | Category | Event Presence |
|-------------|------|--------|-----|----------|---------------|

- Organization: linked to org detail, shows `logo_url` 20px if available
- Role: from `person_organization.role`
- Status: "Current ✓" (green) or "Former" (muted) from `is_current`
- ICP: org's `icp_score`, color-coded
- Category: org's `category` badge
- Event Presence: badges showing events where this org participates, with tier: "EthCC: Gold"

**Section 4: Signals**

`SignalsTimeline` component, aggregated from all related orgs. Each signal prefixed with org name badge.

Query: collect all org IDs from person_organization, fetch signals for all, tag each with org name.

Only shown if signals exist.

**Section 5: Initiative Enrollments**

`GlassCard` with table, only shown if enrollments exist:

| Initiative | Type | Status | Priority | Event |
|-----------|------|--------|----------|-------|

- Initiative: linked to initiative detail
- Type: badge (outreach, sponsorship, partnership, event, research)
- Status: badge (draft, active, paused, completed, archived)
- Priority: color-coded (high = orange, medium = yellow, low = default)
- Event: linked to event if associated

**Section 6: Interactions History**

Existing `InteractionsTimeline` component with `showFilters={true}`.

#### Right Sidebar

**Section 1: Identity Card** (`GlassCard`)

```
[Photo — 64px circle, fallback to initials]
Full Name
Title at Primary Org
Seniority · Department

📧 email (clickable mailto:)
🔗 LinkedIn (clickable URL)
🐦 Twitter (clickable URL)
📱 Phone (clickable tel:)
✈️ Telegram (clickable URL)

Source: {source} · Added: {created_at relative}
```

Missing channels shown as muted text "Not available". Photo fallback: 64px circle with first+last initials, glass background.

**Section 2: Data Completeness** (`GlassCard`)

Visual progress bar + field checklist:

```
Completeness: ████████░░ 78%

✓ Email       ✓ LinkedIn    ✗ Phone
✓ Twitter     ✓ Telegram    ✓ Title
✓ Seniority   ✓ Department  ✗ Bio
✓ Photo       ✓ Apollo ID
```

Fields checked: email, linkedin_url, twitter_handle, telegram_handle, phone, title, seniority, department, bio, photo_url, apollo_id (11 total). Percentage = filled / 11.

Enrichment status line: icon + text matching enrichment_status. Last enriched date if available.

**Section 3: Quick Actions**

```
[Enrich] [Add to List ▾] [Start Sequence]
```

- Enrich: navigates to enrichment page with person pre-selected
- Add to List: dropdown of existing person_lists, adds person_list_item on select
- Start Sequence: navigates to sequence creation with person pre-enrolled

**Section 4: Outreach Brief** (`GlassCard`)

```
ICP Score: {score} (via {primary_org_name})

Why they fit:
"{icp_reason from primary org, first 200ch}"

Our angle:
"{usp from primary org, first 200ch}"

Talking points:
• {event} {role} — relate to FP Block's {relevant angle}
• {org}'s {tier} sponsorship = warm intro path
• {any shared track/topic connections}
```

ICP reason and USP pulled from primary org. Talking points are **template-generated at render time** (no LLM call) using simple rules:
1. If person has event participation with a talk_title → "Their {event} talk on {talk_title} — relate to FP Block's {track overlap}"
2. If person's org has a sponsor tier → "{org}'s {tier} sponsorship at {event} = warm intro path via organizers"
3. If person and FP Block share a track → "{track} alignment — natural conversation starter"

Falls back to "No specific talking points — use ICP reason above" if no event/sponsorship data exists.

**Section 5: Notes**

`GlassCard` with textarea, auto-saves via debounced PATCH to `/api/persons/[id]` on blur. Shows `notes` field.

---

### 2.2 Organization Detail Page

**Route:** `/admin/organizations/[id]`
**Data fetched:** organization + person_organization (with person details) + event_participations (with event details) + signals + interactions (via people) + enrichment job metadata

#### Center Panel — Relationship Sections

**Section 1: Correlation Summary**

Horizontal strip at top:

```
Gold Sponsor at EthCC 2026 · 4 enriched contacts (2 speakers) · 47 signals · ICP 92
Also: Silver Sponsor at ETHDenver 2025 · 12 total people linked
```

Construction:
1. List event participations with tier
2. Count people linked + how many are enriched + how many are event speakers
3. Signal count
4. ICP score
5. All entity names linked

Component: `OrgCorrelationSummary`

**Section 2: Event Presence**

`GlassCard` with table:

| Event | Tier | Role | Our Contacts There | Speakers From Here |
|-------|------|------|-------------------|-------------------|

- Event: linked to event detail
- Tier: sponsor tier badge (color-coded per existing tier palette)
- Role: participation role
- Our Contacts There: count of people in person_organization who also have event_participations for this event. Clickable to expand inline list.
- Speakers From Here: when ≤3, show names directly (linked). When >3, show count with tooltip listing all names.

Query: event_participations for this org → for each event, cross-reference person_organization people against that event's person-level participations.

**Section 3: People Roster**

`GlassCard` with table:

| Name | Title | Seniority | Status | Events | Channels | Source |
|------|-------|-----------|--------|--------|----------|--------|

- Name: linked to person detail, show 20px avatar if photo_url
- Title: person.title
- Seniority: badge
- Status: "Current ✓" (green) / "Former" (muted)
- Events: badges showing events this person participates in, with role: "EthCC: Speaker"
- Channels: icon row (filled/outline) for email, linkedin, twitter, phone, telegram
- Source: badge showing person_organization.source ("apollo", "enriched", "upload", etc.)

Sorted by: is_current desc, seniority rank, full_name asc.

**Section 4: Firmographics**

`GlassCard`, only rendered if any firmographic data exists. Horizontal key-value grid:

Row 1:
- Industry (Briefcase icon)
- Employees (Users icon)
- Revenue (DollarSign icon)
- Funding (TrendingUp icon): "{stage} · ${total}" (e.g., "Series C · $120M")

Row 2:
- Founded (Calendar icon)
- HQ Location (MapPin icon)
- Website (Globe icon, clickable)
- LinkedIn (Linkedin icon, clickable)

Row 3 (full width):
- Tech Stack: pill badges, first 15 shown, "+N more" expands to show all

Data source: enrichment job metadata from `job_log` where `entity_type = 'organization'` and `entity_id = org.id`, extracted from `metadata` JSONB field.

**Section 5: Signals Timeline**

Existing `SignalsTimeline` component. Shows all signals for this org.

**Section 6: Interactions History**

`InteractionsTimeline` with `showPersonLink={true}` — aggregated across all people at this org. Each interaction tagged with which person it's associated with.

Query: get all person IDs from person_organization, fetch interactions where person_id in those IDs.

#### Right Sidebar

**Section 1: Identity Card** (`GlassCard`)

```
[Logo — 48px square, fallback to first-letter]
Organization Name
Category badge
ICP: {score} (color-coded large badge)

🌐 website (clickable)
🔗 LinkedIn (clickable)

{person_count} people · {enriched_count} enriched
{signal_count} signals
{event_count} events
```

**Section 2: Data Completeness** (`GlassCard`)

```
Completeness: ██████████ 95%

✓ Description  ✓ Category   ✓ Website
✓ LinkedIn     ✓ ICP Score  ✓ ICP Reason
✓ Context      ✓ USP        ✓ Logo

Enrichment: Complete ✓
Stages: 🔍✓ 🧪✓ 🧠✓ 👥✓
Last enriched: Mar 24, 2026
```

Fields checked: description, category, website, linkedin_url, icp_score, icp_reason, context, usp, logo_url (9 total). Percentage = filled / 9.

Stage icons reuse the enrichment page pattern — Search (Apollo), FlaskConical (Perplexity), Brain (Gemini), Users (People Finder). Color per stage status from `enrichment_stages` JSONB.

**Section 3: Quick Actions**

```
[Enrich] [Add to Initiative ▾] [View in Enrichment]
```

- Enrich: navigates to enrichment page with org pre-selected
- Add to Initiative: dropdown of existing initiatives
- View in Enrichment: navigates to enrichment page filtered to this org

**Section 4: ICP Analysis** (`GlassCard`)

```
Score: {icp_score} (large, color-coded)

Why they fit:
"{icp_reason}"

Our angle:
"{usp}"

Context:
"{context}"
```

Full text for each field, no truncation (sidebar scrolls).

**Section 5: Notes**

`GlassCard` with textarea, auto-saves via debounced PATCH to `/api/organizations/[id]` on blur.

---

## Part 3: Component Architecture

### New Shared Components

| Component | File | Purpose |
|-----------|------|---------|
| `TwoPanelLayout` | `components/admin/two-panel-layout.tsx` | Layout shell: center + sticky sidebar, responsive collapse |
| `FilterSidebar` | `components/admin/filter-sidebar.tsx` | Reusable sidebar with search, collapsible filter groups, active chips, selection summary |
| `FilterGroup` | `components/admin/filter-group.tsx` | Collapsible group with chevron toggle, renders children |
| `ActiveFilters` | `components/admin/active-filters.tsx` | Chip row of applied filters with × remove |
| `SelectionSummary` | `components/admin/selection-summary.tsx` | "N selected · stats" bar with bulk action buttons |
| `RowPreview` | `components/admin/row-preview.tsx` | Hover preview card, positioned relative to hovered row |
| `DataCompleteness` | `components/admin/data-completeness.tsx` | Progress bar + field checklist |
| `CorrelationBadge` | `components/admin/correlation-badge.tsx` | Renders a relationship chain with → separators and entity links |
| `IdentityCard` | `components/admin/identity-card.tsx` | Photo/logo + name + contact links card |
| `CoverageMetrics` | `components/admin/coverage-metrics.tsx` | Three inline mini-metric badges for events table |
| `PersonCorrelationSummary` | `components/admin/person-correlation-summary.tsx` | Builds and renders person's relationship chain summary |
| `OrgCorrelationSummary` | `components/admin/org-correlation-summary.tsx` | Builds and renders org's relationship chain summary |

### Existing Components Reused

- `GlassCard` — all card containers
- `GlassInput` — search inputs, number inputs
- `GlassSelect` — dropdown filters
- `Badge` — all status/category/tier indicators
- `Tabs` — where needed
- `InteractionsTimeline` — interaction sections on detail pages
- `SignalsTimeline` — signal sections on detail pages
- Lucide icons: Mail, Linkedin, Twitter, Send (Telegram), Phone, Search, FlaskConical, Brain, Users, Globe, MapPin, Calendar, Briefcase, DollarSign, TrendingUp, ChevronDown, ChevronUp, X, Check, AlertCircle

### New Badge Variants Needed

- `sponsor-tier` variants: color-coded per tier (presented_by = purple, platinum = silver, gold = amber, etc.)
- `seniority` variants: c-level = orange, vp/director = indigo, manager = default

---

## Part 4: Data Fetching Strategy

### Persons Table
```sql
-- Base query via persons_with_icp view
SELECT p.*,
  -- Interaction stats
  (SELECT COUNT(*) FROM interactions WHERE person_id = p.id) as interaction_count,
  (SELECT MAX(occurred_at) FROM interactions WHERE person_id = p.id) as last_interaction_at,
  -- Event participations
  (SELECT json_agg(json_build_object('event_name', e.name, 'role', ep.role, 'event_id', e.id))
   FROM event_participations ep JOIN events e ON ep.event_id = e.id
   WHERE ep.person_id = p.id) as events,
  -- Org event participations (for correlation)
  (SELECT json_agg(json_build_object('org_name', o.name, 'org_id', o.id, 'event_name', e.name, 'tier', ep.sponsor_tier, 'event_id', e.id))
   FROM person_organization po
   JOIN organizations o ON po.organization_id = o.id
   JOIN event_participations ep ON ep.organization_id = o.id
   JOIN events e ON ep.event_id = e.id
   WHERE po.person_id = p.id) as org_events
FROM persons_with_icp p
```

### Organizations Table
```sql
SELECT o.*,
  -- People counts
  (SELECT COUNT(*) FROM person_organization WHERE organization_id = o.id) as person_count,
  (SELECT COUNT(*) FROM person_organization po JOIN persons p ON po.person_id = p.id
   WHERE po.organization_id = o.id AND p.enrichment_status = 'complete') as enriched_person_count,
  -- Signal stats
  (SELECT COUNT(*) FROM organization_signals WHERE organization_id = o.id) as signal_count,
  (SELECT MAX(date) FROM organization_signals WHERE organization_id = o.id) as last_signal_date,
  -- Event participations
  (SELECT json_agg(json_build_object('event_name', e.name, 'event_id', e.id, 'tier', ep.sponsor_tier, 'role', ep.role))
   FROM event_participations ep JOIN events e ON ep.event_id = e.id
   WHERE ep.organization_id = o.id) as events,
  -- Firmographic metadata from enrichment jobs
  (SELECT jl.metadata FROM job_log jl
   WHERE jl.target_table = 'organizations' AND jl.target_id = o.id
   AND jl.status = 'completed'
   ORDER BY jl.created_at DESC LIMIT 1) as enrichment_metadata
FROM organizations o
```

### Person Detail
Parallel fetches via `Promise.all`:
1. Person record
2. Person organizations with full org details (including org's icp_score, category, event_participations)
3. Event participations with event details
4. Initiative enrollments with initiative + event details
5. Interactions (with showFilters support)
6. Signals aggregated from all related orgs
7. Org event participations (for correlation: which of person's orgs sponsor which events)

### Events Table
```sql
SELECT e.*,
  -- Participation counts
  (SELECT COUNT(DISTINCT person_id) FROM event_participations
   WHERE event_id = e.id AND person_id IS NOT NULL
   AND role IN ('speaker','panelist','mc')) as speaker_count,
  (SELECT COUNT(DISTINCT organization_id) FROM event_participations
   WHERE event_id = e.id AND organization_id IS NOT NULL
   AND role IN ('sponsor','partner','exhibitor')) as sponsor_count,
  (SELECT COUNT(DISTINCT person_id) FROM event_participations
   WHERE event_id = e.id AND person_id IS NOT NULL) as contact_count,
  (SELECT COUNT(DISTINCT organization_id) FROM event_participations
   WHERE event_id = e.id AND organization_id IS NOT NULL) as org_count,
  -- Coverage: % of sponsor orgs with enriched contacts
  -- (computed client-side from org + person_organization data)
  -- Avg ICP of participating orgs
  (SELECT AVG(o.icp_score) FROM event_participations ep
   JOIN organizations o ON ep.organization_id = o.id
   WHERE ep.event_id = e.id AND o.icp_score IS NOT NULL) as avg_icp,
  -- Total signals across participating orgs
  (SELECT COUNT(*) FROM organization_signals os
   JOIN event_participations ep ON os.organization_id = ep.organization_id
   WHERE ep.event_id = e.id) as total_signals
FROM events e
```

Coverage "enriched contact %" requires a multi-hop join (event → sponsor orgs → person_organization → persons where enrichment_status = 'complete'). This is computed client-side after fetching the base data to avoid query complexity.

### Lists Table
```sql
SELECT pl.*,
  (SELECT COUNT(*) FROM person_list_items WHERE person_list_id = pl.id) as member_count,
  -- Avg ICP via person → person_organization → organization
  (SELECT AVG(o.icp_score)
   FROM person_list_items pli
   JOIN persons p ON pli.person_id = p.id
   JOIN person_organization po ON po.person_id = p.id AND po.is_primary = true
   JOIN organizations o ON po.organization_id = o.id
   WHERE pli.person_list_id = pl.id AND o.icp_score IS NOT NULL) as avg_icp,
  -- Email coverage
  (SELECT COUNT(*) FROM person_list_items pli JOIN persons p ON pli.person_id = p.id
   WHERE pli.person_list_id = pl.id AND p.email IS NOT NULL) as has_email_count,
  -- Top orgs (fetched separately client-side for JSON aggregation)
FROM person_lists pl
```

Top Orgs for lists is computed client-side: fetch person_list_items → persons → person_organization → organizations, group by org name, sort by count desc, take top 3.

### Organization Detail
Parallel fetches via `Promise.all`:
1. Organization record
2. Person organization links with full person details (including person's event_participations)
3. Event participations with event details
4. Signals
5. Interactions: union of `interactions WHERE organization_id = org.id` AND `interactions WHERE person_id IN (linked person IDs)` — deduplicated by interaction ID
6. Enrichment job metadata (firmographics) via `job_log WHERE target_table = 'organizations' AND target_id = org.id`

### Implementation Note: Batch Fetching

The SQL sketches above are **illustrative** — showing what data is needed, not how to query it. Implementation should follow the existing codebase pattern:

1. Fetch base entity list (with `.range()` for 1000-row batches)
2. Fetch related data in separate parallel queries (interactions, event_participations, person_organizations, signals)
3. Join client-side in the page component

This avoids correlated subquery performance issues and aligns with existing Supabase query patterns.

---

## Part 5: Responsive Behavior

| Breakpoint | Layout |
|-----------|--------|
| ≥ 1280px | Full two-panel, sidebar visible |
| 1024–1279px | Two-panel, sidebar narrower (280px) |
| < 1024px | Single column, sidebar becomes slide-out drawer with toggle button |

Drawer behavior:
- Toggle button: filter icon (SlidersHorizontal) fixed to right edge
- Drawer slides in from right, overlays center content with backdrop
- Close on backdrop click or × button
- On detail pages at < 1024px, sidebar content moves to collapsible sections above center content (not a drawer):
  - Sections render in order: Identity Card (default open), Quick Actions (default open), Data Completeness (default closed), Outreach Brief/ICP Analysis (default closed), Notes (default closed)
  - Each section has a chevron toggle header
  - Keeps critical info (identity, actions) visible without scrolling

Breadcrumbs: The existing `breadcrumb.tsx` component continues to render in the admin layout. `TwoPanelLayout` does not include a breadcrumb slot — breadcrumbs sit above it in the page hierarchy.

Table columns at < 1024px:
- Hide lower-priority columns: Correlation, Enrichment, Last Activity
- Remaining columns get min-width constraints
- Horizontal scroll enabled

---

## Part 6: File Structure

```
components/admin/
  two-panel-layout.tsx          — Layout shell
  filter-sidebar.tsx            — Reusable filter sidebar
  filter-group.tsx              — Collapsible filter group
  active-filters.tsx            — Filter chip row
  selection-summary.tsx         — Selection stats + bulk actions
  row-preview.tsx               — Hover preview card
  data-completeness.tsx         — Progress bar + field checklist
  correlation-badge.tsx         — Relationship chain renderer
  identity-card.tsx             — Photo/logo + contact links
  coverage-metrics.tsx          — Event coverage mini-metrics
  person-correlation-summary.tsx — Person relationship summary
  org-correlation-summary.tsx   — Org relationship summary
  person-table.tsx              — (existing, extended with new columns)
  organization-table.tsx        — (existing, extended with new columns)
  interactions-timeline.tsx     — (existing, unchanged)
  signals-timeline.tsx          — (existing, unchanged)

app/admin/
  persons/
    page.tsx                    — Persons table (rewrite with two-panel)
    [id]/page.tsx               — Person detail (rewrite with two-panel)
  organizations/
    page.tsx                    — Orgs table (rewrite with two-panel)
    [id]/page.tsx               — Org detail (rewrite with two-panel)
  events/
    page.tsx                    — Events table (rewrite from card grid)
    [id]/page.tsx               — (existing, no changes in this spec)
  lists/
    page.tsx                    — Lists table (rewrite with two-panel)
```
