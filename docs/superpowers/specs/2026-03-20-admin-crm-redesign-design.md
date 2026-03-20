# Admin CRM Redesign - Design Spec

## Overview

Redesign the /admin application from a basic dashboard into a full CRM for managing outreach sequences, Apollo enrichment flows, contact/company pipelines, and CSV imports. Design language inherits from the /jb and /wes public pages (glassmorphism, orange/indigo accents, Poppins/Inter typography) adapted for a productivity tool.

## 1. Design System

### Colors
- **Background:** `#0f0f13` with subtle grid pattern (48px grid, `rgba(255,255,255,0.03)`)
- **Surface (glass):** `rgba(255,255,255,0.03)` background, `backdrop-blur-xl`, `border: 1px solid rgba(255,255,255,0.06)`
- **Surface hover:** `rgba(255,255,255,0.06)` with subtle border glow at accent color, low opacity
- **Primary accent:** `#f58327` (orange) — active nav, primary buttons, progress indicators
- **Secondary accent:** `#6e86ff` (indigo) — links, secondary actions, info badges
- **Status colors (unchanged):**
  - Draft: `yellow-500`
  - Scheduled: `blue-500`
  - Sent: `green-500`
  - Replied: `emerald-500`
  - Bounced/Failed: `red-500`
  - Approved: `purple-500`
  - Processing: `orange-500`
- **Text:** White for headings, `rgba(255,255,255,0.7)` for body, `rgba(255,255,255,0.4)` for secondary

### Typography
- **Headings:** Poppins, semibold
- **Body:** Inter, regular
- **Mono:** Geist Mono (keep existing)

### Borders & Radius
- Cards: `rounded-xl`
- Inputs/buttons: `rounded-lg`
- Badges: `rounded-full`

### Transitions
- All interactive elements: `transition-all duration-200`
- Hover border glow: box-shadow with accent color at 0.1 opacity

## 2. Layout Shell

### Sidebar (`w-60`, fixed left)
- Glass panel background
- Top: FP Block logo/wordmark
- Nav items with Lucide-style SVG icons:
  1. Dashboard (LayoutDashboard)
  2. Contacts (Users)
  3. Companies (Building2)
  4. Events (Calendar)
  5. Pipeline (Kanban)
  6. Sequences (GitBranch)
  7. Enrichment (Sparkles)
  8. Uploads (Upload)
  9. Settings (Settings) — pinned to bottom
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
- Contacts, Companies, Drafts, Sent
- Each card: glass surface, large number (Poppins, `text-3xl`), label below, accent-colored icon top-right
- Placeholder area for future sparkline/trend

**Middle — Pipeline funnel:**
- Horizontal stacked bar showing contact distribution across stages
- Each segment colored by status, labeled with count
- Glass card container

**Bottom left — Recent Activity:**
- Feed of `job_log` entries
- Glass card rows with status dot, job type, timestamp
- Links to relevant detail pages

**Bottom right — Quick Actions:**
- Glass card with 3 action buttons:
  - Upload CSV → `/admin/uploads`
  - Run Enrichment → `/admin/enrichment`
  - Review Drafts → `/admin/queue` (renamed to pipeline drafts tab)

### 3.2 Contacts (`/admin/contacts`)

**New page** (currently no contacts list page exists).

**Top bar:**
- Search input (glass styled, placeholder "Search contacts...")
- Filter dropdowns: ICP score range, Has Email (y/n), Outreach Status, Event, Company

**Table:**
| Name | Company | Title | ICP | Channels | Outreach Status | Last Touched |
|------|---------|-------|-----|----------|----------------|--------------|
| Link | Text | Text | Badge | Icon dots (email/linkedin/twitter/telegram) | Status badge | Date |

- Row click → `/admin/contacts/[id]` (existing page, restyled)
- Checkbox column for multi-select
- **Bulk actions toolbar** (appears on selection): Enrich Selected, Generate Messages, Add to Sequence
- Pagination at bottom

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
| Link | Text | Badge | Count | Count | Date |

- Row click → `/admin/companies/[id]` (existing page, restyled)
- Pagination

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

**Kanban view:**
- Columns: Not Contacted, Drafted, Scheduled, Sent, Replied, Bounced
- Each column: glass background, column header with count badge
- Cards: Contact name, company name, channel icon, ICP badge (small)
- Cards are draggable between columns (client-side drag, triggers Supabase status update on drop)
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
  - Step card: Day number, action type (initial/follow-up/break-up), message template preview
  - Add Step button at bottom
- Right sidebar: enrolled contacts list with current step indicator

**Data model note:** Sequences map to the existing `messages` table via `sequence_number` and `iteration` fields. A "sequence" is conceptually a named group of message templates with timing rules. This may require a new `sequences` table:

```sql
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
  sequence_id UUID REFERENCES sequences(id),
  contact_id UUID REFERENCES contacts(id),
  current_step INT DEFAULT 0,
  status TEXT DEFAULT 'active',
  enrolled_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(sequence_id, contact_id)
);
```

### 3.7 Enrichment (`/admin/enrichment`)

**New page.**

**Top section — Run Enrichment:**
- Glass card with:
  - Source selector: Apollo (default, only option for now)
  - Target selector: "All unenriched contacts" / "Selected contacts" / "Contacts from event X"
  - Fields to enrich: checkboxes (Email, LinkedIn, Twitter, Phone)
  - Run button (orange primary)

**Bottom section — Job History:**
- Table of past enrichment runs from `job_log` where `job_type = 'enrichment'`
- Columns: Date, Source, Contacts Processed, Emails Found, LinkedIn Found, Status
- Row expand → detailed results

### 3.8 Uploads (`/admin/uploads`)

**New page.**

**Upload zone:**
- Large drag-and-drop area (glass card, dashed border)
- "Drop CSV here or click to browse"
- Accepts `.csv` files

**Column mapper (appears after file selected):**
- Left column: detected CSV headers
- Right column: dropdown to map to contact/company fields
- Auto-match obvious columns (name → full_name, email → email, etc.)
- Preview: first 10 rows with mapped data

**Import config:**
- Event selector: which event to link imported contacts to
- Import as: Contacts / Companies / Both
- Duplicate handling: Skip / Update / Create new

**Import button → processes rows, shows progress**

**Upload history (below):**
- Table of past imports: Date, Filename, Rows Imported, Contacts Created, Companies Created

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
- Per-event settings: sender, CTA URL/text, prompt template, notify emails

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

- `@hello-pangea/dnd` — drag and drop for kanban (React 19 compatible fork of react-beautiful-dnd)
- `lucide-react` — icon library (consistent with modern Next.js apps)
- `papaparse` — CSV parsing for uploads (client-side)

## 6. Schema Changes

New tables needed for Sequences feature:

```sql
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
```

New `uploads` table for tracking imports:

```sql
CREATE TABLE uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename TEXT NOT NULL,
  row_count INT,
  contacts_created INT DEFAULT 0,
  companies_created INT DEFAULT 0,
  event_id UUID REFERENCES events(id),
  status TEXT DEFAULT 'processing',
  errors JSONB,
  uploaded_by UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);
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
  settings/
    page.tsx                    (NEW — tabbed settings)
  queue/
    page.tsx                    (REMOVE — replaced by pipeline)

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

supabase/migrations/
  002_sequences_uploads.sql     (NEW)
```
