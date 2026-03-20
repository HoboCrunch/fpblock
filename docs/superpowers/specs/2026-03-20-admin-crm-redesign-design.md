# Admin CRM Redesign - Design Spec

## Overview

Redesign the /admin application from a basic dashboard into a full CRM for managing outreach sequences, Apollo enrichment flows, contact/company pipelines, and CSV imports. Design language inherits from the /jb and /wes public pages (glassmorphism, orange/indigo accents, Poppins/Inter typography) adapted for a productivity tool.

## 1. Design System

### Colors
- **Background:** `#0f0f13` — override Tailwind's gray-950 via CSS custom property `--bg-app`
- **Grid pattern:** 48px grid, stroke `rgba(255,255,255,0.03)`
- **Surface (glass):** `rgba(255,255,255,0.03)` background, `backdrop-blur-xl`, `border: 1px solid rgba(255,255,255,0.06)`
- **Surface hover:** `rgba(255,255,255,0.06)` with subtle border glow at accent color, low opacity
- **Primary accent:** `#f58327` (orange) — active nav, primary buttons, progress indicators
- **Secondary accent:** `#6e86ff` (indigo) — links, secondary actions, info badges
- **Status colors (unchanged):**
  - Draft: `yellow-500`
  - Scheduled: `blue-500`
  - Sending: `orange-400`
  - Sent: `green-500`
  - Delivered: `green-400`
  - Opened: `teal-400`
  - Replied: `emerald-500`
  - Bounced: `red-500`
  - Failed: `red-600`
- **Text:** White for headings, `rgba(255,255,255,0.7)` for body, `rgba(255,255,255,0.4)` for secondary

### Typography
- **Headings:** Poppins via `next/font/google`, semibold
- **Body:** Inter via `next/font/google`, regular
- **Mono:** Geist Mono (keep existing)
- Loaded in root `layout.tsx` using Next.js `next/font` — set as CSS variables `--font-heading` and `--font-body`

### Borders & Radius
- Cards: `rounded-xl`
- Inputs/buttons: `rounded-lg`
- Badges: `rounded-full`

### Transitions
- All interactive elements: `transition-all duration-200`
- Hover border glow: box-shadow with accent color at 0.1 opacity

### Loading, Error, and Empty States
- **Loading:** Glass card skeleton with pulsing `animate-pulse` bars matching the layout of the expected content
- **Error:** Glass card with red-tinted border, error message, and retry button
- **Empty:** Glass card with centered icon, descriptive text, and CTA button (e.g., "No contacts yet — Upload a CSV")

### Responsive Behavior
- **Desktop (≥1024px):** Full sidebar + main content
- **Tablet (768–1023px):** Collapsed sidebar (icon-only) + main content
- **Mobile (<768px):** Hidden sidebar with hamburger toggle, kanban columns scroll horizontally with snap

## 2. Layout Shell

### Sidebar (`w-60`, fixed left)
- Glass panel background
- Top: FP Block logo/wordmark
- Nav items with Lucide React icons:
  1. Dashboard (`LayoutDashboard`)
  2. Contacts (`Users`)
  3. Companies (`Building2`)
  4. Events (`Calendar`)
  5. Pipeline (`Kanban`)
  6. Sequences (`GitBranch`)
  7. Enrichment (`Sparkles`)
  8. Uploads (`Upload`)
  9. Settings (`Settings`) — pinned to bottom
- Active item: orange left border (3px) + orange text
- Inactive: `rgba(255,255,255,0.4)` text, hover → `rgba(255,255,255,0.7)`
- Events section: collapsible sub-items showing individual events
- Bottom: collapse toggle to icon-only mode (`w-16`)

### Header (`h-14`)
- Transparent background with bottom border `rgba(255,255,255,0.06)`
- Left: Breadcrumb trail (e.g., "Contacts / John Smith")
- Right: User email + Sign out button

### Main Content Area
- `p-6` padding
- Scrollable
- Page titles: Poppins semibold, `text-2xl`

## 3. Pages

### 3.1 Dashboard (`/admin`)

**Layout:** 2-column grid on desktop, single column on mobile.

**Top row — Stat cards (4 across):**
- Contacts, Companies, Messages (total), Replied
- Each card: glass surface, large number (Poppins, `text-3xl`), label below, accent-colored icon top-right
- Placeholder area for future sparkline/trend

**Middle — Pipeline funnel:**
- Horizontal stacked bar showing contact distribution across ALL stages: Not Contacted, Draft, Scheduled, Sent, Delivered, Opened, Replied, Bounced, Failed
- Each segment colored by its status color, labeled with count
- Glass card container
- Clickable segments → filter Pipeline page to that stage

**Bottom left — Recent Activity:**
- Feed of `job_log` entries
- Glass card rows with status dot, job type, timestamp
- Links to relevant detail pages

**Bottom right — Quick Actions:**
- Glass card with 3 action buttons:
  - Upload CSV → `/admin/uploads`
  - Run Enrichment → `/admin/enrichment`
  - Review Drafts → `/admin/pipeline?stage=draft`

### 3.2 Contacts (`/admin/contacts`)

**New page** (currently no contacts list page exists).

**Top bar:**
- Search input (glass styled, placeholder "Search contacts...")
- Filter dropdowns: ICP score range, Has Email (y/n), Outreach Status, Event, Company

**Computed columns:**
- **ICP Score:** Derived from the contact's primary company's `icp_score` via the `contact_company` join (same as existing `contact-table.tsx` behavior). No new column on `contacts` table.
- **Outreach Status:** The most advanced `messages.status` for that contact, ordered: failed < bounced < draft < scheduled < sending < sent < delivered < opened < replied. Computed via a subquery: `SELECT status FROM messages WHERE contact_id = ? ORDER BY CASE status ... END DESC LIMIT 1`. If no messages exist, status is "Not Contacted".
- **Last Touched:** `MAX(messages.updated_at)` for the contact. If no messages, falls back to `contact.created_at`.

**Table:**
| Name | Company | Title | ICP | Channels | Outreach Status | Last Touched |
|------|---------|-------|-----|----------|----------------|--------------|
| Link | Text | Text | Badge (company ICP) | Icon dots for populated channels | Status badge | Date |

- **Channels column:** Shows small icons for each channel the contact has data for (email icon if `email` is populated, LinkedIn icon if `linkedin` is populated, etc.)
- Row click → `/admin/contacts/[id]` (existing page, restyled)
- Checkbox column for multi-select
- **Bulk actions toolbar** (appears on selection):
  - **Enrich Selected:** Navigates to `/admin/enrichment?contacts=id1,id2,...` with those contacts pre-selected
  - **Generate Messages:** Opens modal — select Event, Channel, Prompt Template → creates draft messages via server action
  - **Add to Sequence:** Opens modal — select Sequence → creates enrollments via server action
- Pagination at bottom (25 per page)

**Contact detail page (`/admin/contacts/[id]`):**
- Restyle existing page with glass cards
- Same data/layout, new visual treatment

### 3.3 Companies (`/admin/companies`)

**New page** (currently no companies list page exists).

**Top bar:**
- Search input
- Filters: ICP range, Category, Has Signals

**Table:**
| Name | Category | ICP Score | Contacts | Signals | Last Signal |
|------|----------|-----------|----------|---------|-------------|
| Link | Text | Badge | Count (from contact_company) | Count (from company_signals) | Date (MAX company_signals.date) |

- Row click → `/admin/companies/[id]` (existing page, restyled)
- Pagination (25 per page)

**Company detail page (`/admin/companies/[id]`):**
- Restyle existing page with glass cards

### 3.4 Events (`/admin/events`)

**New list page** (currently events only appear in sidebar).

**Card grid:**
- Each event as a glass card
- Content: Event name (Poppins), dates, location
- Footer: Contact count, Company count, Message count as small stats
- Click → `/admin/events/[id]`

**Event detail page (`/admin/events/[id]`):**
- Restyle existing page with glass cards and tabs

### 3.5 Pipeline (`/admin/pipeline`)

**New page.**

**View toggle:** Kanban (default) | Table — toggle buttons top-right

**Filter bar:**
- Event selector, Channel filter, ICP range, Date range
- URL query params for filters (e.g., `?stage=draft` from Dashboard Quick Action)

**Data model:** The pipeline operates on **contacts**, not messages. Each contact appears once, in the column matching their most advanced outreach status (same logic as Contacts page "Outreach Status" column).

**Kanban columns and their status mappings:**
| Column | Maps to |
|--------|---------|
| Not Contacted | Contact has zero messages |
| Draft | Most advanced status is `draft` |
| Scheduled | Most advanced status is `scheduled` |
| Sent | Most advanced status is `sending`, `sent`, or `delivered` |
| Opened | Most advanced status is `opened` |
| Replied | Most advanced status is `replied` |
| Bounced/Failed | Most advanced status is `bounced` or `failed` |

**Kanban view:**
- Each column: glass background, column header with count badge
- Cards: Contact name, company name, channel icon, ICP badge (small, showing company ICP)
- Cards are draggable between columns — **drag behavior:**
  - Moving a card RIGHT (to a more advanced stage): Updates the most recent message's `status` to the target column's primary status
  - Moving a card LEFT (to an earlier stage): Creates a new message with `status = draft` and `iteration + 1` (resets them in the sequence)
  - Moving FROM "Not Contacted": Creates a new `draft` message (modal appears to select channel + event)
  - Moving TO "Not Contacted": Not allowed (cannot un-contact someone)
- Column scroll if overflow

**Table view:**
- Same data as kanban, rendered as filterable/sortable table
- Columns: Contact, Company, Channel, Stage, ICP, Scheduled Date, Last Updated
- Stage column uses status badges

### 3.6 Sequences (`/admin/sequences`)

**New page.**

**List view:**
- Glass card table of sequence templates
- Columns: Name, Channel, Steps, Contacts Enrolled, Completion Rate
- Click → sequence detail

**Detail view (`/admin/sequences/[id]`):**
- Sequence name + metadata at top
- Visual step timeline:
  - Vertical list of steps, each as a glass card
  - Step card: Day number, action type, subject line (if email), message template preview
  - Add Step button at bottom
- Right sidebar: enrolled contacts list with current step indicator

**Sequence step JSONB schema:**
```json
{
  "steps": [
    {
      "step_number": 1,
      "delay_days": 0,
      "action_type": "initial",
      "subject_template": "Hey {first_name}",
      "body_template": "Hi {first_name}, ...",
      "prompt_template_id": null
    },
    {
      "step_number": 2,
      "delay_days": 3,
      "action_type": "follow_up",
      "subject_template": "Re: {previous_subject}",
      "body_template": "Just following up...",
      "prompt_template_id": null
    },
    {
      "step_number": 3,
      "delay_days": 7,
      "action_type": "break_up",
      "subject_template": null,
      "body_template": "Last note from me...",
      "prompt_template_id": null
    }
  ]
}
```

- `delay_days`: Days after enrollment (step 1) or after previous step (steps 2+) to send
- `action_type`: One of `initial`, `follow_up`, `break_up`
- `subject_template`: For email channel only; null for LinkedIn/Twitter DMs
- `body_template`: Message body with `{first_name}`, `{company_name}`, `{usp}` placeholders
- `prompt_template_id`: Optional — if set, uses the linked prompt template to AI-generate the message instead of using `body_template`

**Sequence progression:** Not automated in this phase. Users manually advance contacts through steps from the sequence detail page (click "Send Next Step" per contact). Future: Supabase Edge Function cron to auto-progress based on `delay_days`.

### 3.7 Enrichment (`/admin/enrichment`)

**New page.**

**Architecture:** Enrichment runs via a **Next.js API route** (`app/api/enrich/route.ts`) that calls the Apollo API directly (porting the logic from `scripts/apollo_enrich.py`). The API route accepts a list of contact IDs and fields to enrich, processes them sequentially, updates the contacts table, and logs results to `job_log`.

**Top section — Run Enrichment:**
- Glass card with:
  - Source selector: Apollo (default, only option for now)
  - Target selector: "All unenriched contacts" / "Selected contacts" (from URL params) / "Contacts from event X"
  - Fields to enrich: checkboxes (Email, LinkedIn, Twitter, Phone)
  - Run button (orange primary) → calls `POST /api/enrich` → shows progress bar
  - Progress: polls `job_log` entry for status updates

**Bottom section — Job History:**
- Table of past enrichment runs from `job_log` where `job_type = 'enrichment'`
- Columns: Date, Source, Contacts Processed, Emails Found, LinkedIn Found, Status
- Row expand → detailed results from `job_log.metadata`

### 3.8 Uploads (`/admin/uploads`)

**New page.**

**Architecture:** CSV parsing happens client-side via `papaparse`. Import processing happens via a **Next.js server action** (`app/admin/uploads/actions.ts`) that receives the mapped rows and creates contacts/companies in Supabase.

**Upload zone:**
- Large drag-and-drop area (glass card, dashed border)
- "Drop CSV here or click to browse"
- Accepts `.csv` files

**Column mapper (appears after file selected):**
- Left column: detected CSV headers
- Right column: dropdown to map to contact/company fields
- Auto-match obvious columns (name → full_name, email → email, etc.)
- Preview: first 10 rows with mapped data in a glass table

**Import config:**
- Event selector: which event to link imported contacts to
- Import as: Contacts / Companies / Both
- Duplicate handling: Skip / Update / Create new (matched on email for contacts, name for companies)

**Import button → calls server action → shows progress → redirects to contacts list on completion**

**Upload history (below):**
- Table from `uploads` table: Date, Filename, Rows Imported, Contacts Created, Companies Created, Status

### 3.9 Settings (`/admin/settings`)

**Tabbed page using existing Tabs component (restyled).**

**Sender Profiles tab:**
- Table of sender profiles
- Add/Edit modal: name, email, heyreach_account_id, signature, tone_notes

**Prompt Templates tab:**
- Table of prompt templates
- Add/Edit: name, channel, system_prompt (textarea), user_prompt_template (textarea)

**Automation Rules tab:**
- Table of rules with enabled/disabled toggle
- Add/Edit: name, trigger_table, trigger_event, conditions (JSON editor), action, action_params

**Event Config tab:**
- Editable table with one row per event
- Columns: Event Name (read-only), Sender (dropdown), CTA URL (input), CTA Text (input), Prompt Template (dropdown), Notify Emails (input)
- Inline editing with save button per row

## 4. New Shared Components

### Glass components
- `GlassCard` — base glass surface container with variants (default, hover, interactive)
- `GlassInput` — text input with glass styling
- `GlassSelect` — dropdown with glass styling

### Functional components
- `SearchBar` — glass-styled search input with icon
- `FilterBar` — horizontal row of filter dropdowns
- `KanbanBoard` — column container with drag-and-drop
- `KanbanColumn` — single column with header and card list
- `DragCard` — draggable card for kanban
- `FileDropzone` — drag-and-drop file upload area
- `ColumnMapper` — CSV column mapping UI
- `StepEditor` — sequence step timeline editor
- `Breadcrumb` — breadcrumb navigation trail
- `StatCard` — dashboard stat card with icon
- `PipelineBar` — horizontal stacked bar for pipeline visualization

### Updated components
- `Badge` — updated with `rounded-full`, glass variants
- `Tabs` — glass-styled tab bar
- `Sidebar` — expanded with all nav items, collapse toggle, glass background
- `Header` — add breadcrumb, transparent glass style
- All table components — glass row hover states

## 5. New Dependencies

- `@hello-pangea/dnd` — drag and drop for kanban. If React 19 incompatible at build time, fallback to native HTML drag-and-drop API with custom implementation.
- `lucide-react` — icon library
- `papaparse` — CSV parsing for uploads (client-side)
- `@types/papaparse` — TypeScript types for papaparse

## 6. Schema Changes

New migration `002_sequences_uploads.sql`:

```sql
-- Sequences
CREATE TABLE sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  channel TEXT NOT NULL,
  event_id UUID REFERENCES events(id),
  steps JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE sequence_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id UUID REFERENCES sequences(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  current_step INT DEFAULT 0,
  status TEXT DEFAULT 'active' CHECK (status IN ('active','paused','completed','bounced')),
  enrolled_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(sequence_id, contact_id)
);

CREATE INDEX idx_sequence_enrollments_sequence ON sequence_enrollments(sequence_id);
CREATE INDEX idx_sequence_enrollments_contact ON sequence_enrollments(contact_id);
CREATE INDEX idx_sequences_event ON sequences(event_id);

-- Uploads
CREATE TABLE uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename TEXT NOT NULL,
  row_count INT,
  contacts_created INT DEFAULT 0,
  companies_created INT DEFAULT 0,
  event_id UUID REFERENCES events(id),
  status TEXT DEFAULT 'processing' CHECK (status IN ('processing','completed','failed')),
  errors JSONB,
  uploaded_by UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_uploads_event ON uploads(event_id);

-- RPC for message status counts (used by dashboard, was missing from schema)
CREATE OR REPLACE FUNCTION message_status_counts()
RETURNS TABLE(status TEXT, count BIGINT) AS $$
  SELECT status, COUNT(*) FROM messages GROUP BY status;
$$ LANGUAGE sql STABLE;
```

## 7. File Structure (new/modified)

```
app/admin/
  layout.tsx                    (modified — new sidebar, header, glass shell)
  page.tsx                      (modified — redesigned dashboard)
  contacts/
    page.tsx                    (NEW — contacts list)
    [id]/page.tsx               (modified — restyled)
  companies/
    page.tsx                    (NEW — companies list)
    [id]/page.tsx               (modified — restyled)
  events/
    page.tsx                    (NEW — events grid)
    [id]/page.tsx               (modified — restyled)
  pipeline/
    page.tsx                    (NEW — kanban + table pipeline)
  sequences/
    page.tsx                    (NEW — sequence list)
    [id]/page.tsx               (NEW — sequence detail/editor)
  enrichment/
    page.tsx                    (NEW — enrichment runner + history)
  uploads/
    page.tsx                    (NEW — CSV upload + mapper)
    actions.ts                  (NEW — server action for import processing)
  settings/
    page.tsx                    (NEW — tabbed settings)
  queue/
    page.tsx                    (REMOVE — replaced by pipeline)

app/api/
  enrich/
    route.ts                    (NEW — Apollo enrichment API route)

components/admin/
  sidebar.tsx                   (modified — expanded nav, collapse, glass)
  header.tsx                    (modified — breadcrumb, glass)
  summary-cards.tsx             (modified → stat-card.tsx restyled)
  activity-feed.tsx             (modified — glass cards)
  contact-table.tsx             (modified — glass styling, bulk select)
  company-table.tsx             (modified — glass styling)
  message-table.tsx             (modified — glass styling)
  signals-timeline.tsx          (modified — glass styling)
  kanban-board.tsx              (NEW)
  kanban-column.tsx             (NEW)
  drag-card.tsx                 (NEW)
  file-dropzone.tsx             (NEW)
  column-mapper.tsx             (NEW)
  step-editor.tsx               (NEW)
  pipeline-bar.tsx              (NEW)
  breadcrumb.tsx                (NEW)
  filter-bar.tsx                (NEW)
  search-bar.tsx                (NEW)

components/ui/
  badge.tsx                     (modified)
  tabs.tsx                      (modified)
  glass-card.tsx                (NEW)
  glass-input.tsx               (NEW)
  glass-select.tsx              (NEW)
  stat-card.tsx                 (NEW)

app/globals.css                 (modified — grid pattern, glass utilities, font imports)
app/layout.tsx                  (modified — Poppins + Inter via next/font)

lib/types/database.ts           (modified — add Sequence, SequenceEnrollment, Upload types)

supabase/migrations/
  002_sequences_uploads.sql     (NEW)
```
