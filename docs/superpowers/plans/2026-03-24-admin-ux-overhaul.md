# Admin UX Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign all admin table views and detail pages into a consistent two-panel layout that surfaces relationship correlations at scale.

**Architecture:** Shared `TwoPanelLayout` shell + reusable filter/sidebar components, applied to 4 table views (persons, orgs, events, lists) and 2 detail pages (person, org). All state is local React state + URL searchParams. Data fetched server-side with client-side joins following existing Supabase patterns.

**Tech Stack:** Next.js 14 (app router), Supabase (PostgreSQL), Tailwind CSS, Lucide React icons, existing glass-morphism component library.

**Spec:** `docs/superpowers/specs/2026-03-24-admin-ux-overhaul-design.md`

**Commit strategy:** Single commit at end — no intermediate commits.

---

## Task 1: Shared Components — Layout Shell & Filter Infrastructure

**Files:**
- Create: `components/admin/two-panel-layout.tsx`
- Create: `components/admin/filter-group.tsx`
- Create: `components/admin/active-filters.tsx`
- Create: `components/admin/selection-summary.tsx`
- Modify: `components/ui/badge.tsx` (add sponsor-tier and seniority variants)

These are pure presentational components with no data dependencies. All other tasks depend on these.

- [ ] **Step 1: Create `TwoPanelLayout`**

`components/admin/two-panel-layout.tsx` — Layout shell with center + sticky sidebar.

```typescript
"use client";

import { useState } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface TwoPanelLayoutProps {
  title: string;
  actions?: React.ReactNode;
  sidebar: React.ReactNode;
  children: React.ReactNode;
}

export function TwoPanelLayout({ title, actions, sidebar, children }: TwoPanelLayoutProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div>
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">{title}</h1>
        <div className="flex items-center gap-3">
          {actions}
          {/* Mobile drawer toggle */}
          <button
            onClick={() => setDrawerOpen(true)}
            className="lg:hidden p-2 rounded-lg glass hover:bg-white/[0.05]"
          >
            <SlidersHorizontal className="w-5 h-5 text-[var(--text-muted)]" />
          </button>
        </div>
      </div>

      {/* Two-panel layout */}
      <div className="flex gap-6">
        {/* Center panel */}
        <div className="flex-1 min-w-0">
          {children}
        </div>

        {/* Desktop sidebar */}
        <aside className="hidden lg:block w-[320px] xl:w-[360px] flex-shrink-0">
          <div className="sticky top-4 max-h-[calc(100vh-6rem)] overflow-y-auto space-y-4 scrollbar-thin">
            {sidebar}
          </div>
        </aside>
      </div>

      {/* Mobile drawer */}
      {drawerOpen && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setDrawerOpen(false)} />
          <div className="fixed right-0 top-0 h-full w-[340px] max-w-[85vw] z-50 lg:hidden bg-[#0f0f13] border-l border-[var(--glass-border)] overflow-y-auto p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">Filters</h2>
              <button onClick={() => setDrawerOpen(false)} className="p-1 rounded hover:bg-white/[0.05]">
                <X className="w-5 h-5 text-[var(--text-muted)]" />
              </button>
            </div>
            {sidebar}
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create `FilterGroup`**

`components/admin/filter-group.tsx` — Collapsible section for sidebar filters.

```typescript
"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

interface FilterGroupProps {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

export function FilterGroup({ title, defaultOpen = true, children }: FilterGroupProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full text-left py-2 text-sm font-medium text-[var(--text-secondary)] hover:text-white transition-colors"
      >
        {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        {title}
      </button>
      {open && <div className="space-y-2 pb-3">{children}</div>}
    </div>
  );
}
```

- [ ] **Step 3: Create `ActiveFilters`**

`components/admin/active-filters.tsx` — Chip row showing active filters with remove buttons.

```typescript
"use client";

import { X } from "lucide-react";

interface ActiveFilter {
  key: string;
  label: string;
  value: string;
}

interface ActiveFiltersProps {
  filters: ActiveFilter[];
  onRemove: (key: string) => void;
  onClearAll: () => void;
}

export function ActiveFilters({ filters, onRemove, onClearAll }: ActiveFiltersProps) {
  if (filters.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {filters.map((f) => (
        <span
          key={f.key}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-[var(--accent-orange)]/10 text-[var(--accent-orange)] border border-[var(--accent-orange)]/20"
        >
          {f.label}: {f.value}
          <button onClick={() => onRemove(f.key)} className="hover:text-white ml-0.5">
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}
      {filters.length > 2 && (
        <button onClick={onClearAll} className="text-xs text-[var(--text-muted)] hover:text-white ml-1">
          Clear all
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Create `SelectionSummary`**

`components/admin/selection-summary.tsx` — Stats bar when rows are selected.

```typescript
interface SelectionSummaryProps {
  count: number;
  stats: string; // e.g., "Avg ICP 84 · 9 have email"
  actions: React.ReactNode;
}

export function SelectionSummary({ count, stats, actions }: SelectionSummaryProps) {
  if (count === 0) return null;

  return (
    <div className="glass rounded-lg p-3 flex items-center justify-between">
      <span className="text-sm text-white">
        <strong>{count}</strong> selected{stats ? ` · ${stats}` : ""}
      </span>
      <div className="flex items-center gap-2">{actions}</div>
    </div>
  );
}
```

- [ ] **Step 5: Add badge variants**

Modify `components/ui/badge.tsx` — add sponsor-tier and seniority variants to the `variants` object:

```typescript
// Add after existing variants:
// Sponsor tier variants
"presented_by": "bg-purple-500/10 text-purple-400 border-purple-500/20",
"platinum": "bg-gray-300/10 text-gray-300 border-gray-300/20",
"diamond": "bg-cyan-400/10 text-cyan-400 border-cyan-400/20",
"emerald": "bg-emerald-400/10 text-emerald-400 border-emerald-400/20",
"gold": "bg-amber-400/10 text-amber-400 border-amber-400/20",
"silver": "bg-gray-400/10 text-gray-400 border-gray-400/20",
"bronze": "bg-orange-700/10 text-orange-600 border-orange-700/20",
"copper": "bg-orange-400/10 text-orange-300 border-orange-400/20",
"community": "bg-blue-400/10 text-blue-400 border-blue-400/20",
// Seniority variants
"c-level": "bg-[var(--accent-orange)]/10 text-[var(--accent-orange)] border-[var(--accent-orange)]/20",
"vp": "bg-[var(--accent-indigo)]/10 text-[var(--accent-indigo)] border-[var(--accent-indigo)]/20",
"director": "bg-[var(--accent-indigo)]/10 text-[var(--accent-indigo)] border-[var(--accent-indigo)]/20",
```

- [ ] **Step 6: Verify all shared components render**

Run: `npm run build` or `npx next build` (whichever the project uses)
Expected: No TypeScript errors in the new files.

---

## Task 2: Shared Components — Detail Page Sidebar Widgets

**Files:**
- Create: `components/admin/identity-card.tsx`
- Create: `components/admin/data-completeness.tsx`
- Create: `components/admin/correlation-badge.tsx`

Pure presentational components used by both person and org detail pages.

- [ ] **Step 1: Create `IdentityCard`**

`components/admin/identity-card.tsx` — Photo/logo + name + title + contact links.

```typescript
import { GlassCard } from "@/components/ui/glass-card";
import { Mail, Linkedin, Twitter, Send, Phone, Globe } from "lucide-react";
import Link from "next/link";

interface ContactLink {
  type: "email" | "linkedin" | "twitter" | "telegram" | "phone" | "website";
  value: string | null;
}

interface IdentityCardProps {
  name: string;
  subtitle?: string;          // e.g., "CTO at Alchemy"
  secondaryLine?: string;     // e.g., "C-Level · Engineering"
  imageUrl?: string | null;
  imageShape?: "circle" | "square";
  contacts: ContactLink[];
  footer?: React.ReactNode;   // e.g., "Source: Apollo · Added: Mar 3"
  stats?: React.ReactNode;    // e.g., "12 people · 4 enriched"
  icpScore?: number | null;
}
```

The component should:
- Render a 64px image (circle for person, rounded square for org) with initials fallback
- Name in white, subtitle in text-secondary, secondaryLine in text-muted
- Contact links as icon rows: filled icon = has value (clickable), muted icon = missing
- Icon mapping: email→Mail, linkedin→Linkedin, twitter→Twitter, telegram→Send, phone→Phone, website→Globe
- Link behavior: email→`mailto:`, phone→`tel:`, others→direct URL
- If icpScore provided, show color-coded badge (green ≥90, yellow ≥75, gray <75)
- Stats and footer as pass-through ReactNode below contacts

- [ ] **Step 2: Create `DataCompleteness`**

`components/admin/data-completeness.tsx` — Progress bar + field checklist.

```typescript
import { GlassCard } from "@/components/ui/glass-card";
import { Check, X as XIcon } from "lucide-react";

interface FieldCheck {
  label: string;
  present: boolean;
}

interface DataCompletenessProps {
  fields: FieldCheck[];
  enrichmentStatus?: string;
  lastEnrichedAt?: string | null;
  enrichmentStages?: React.ReactNode; // For org stage icons
}
```

The component should:
- Calculate percentage = (fields with present=true / total fields) * 100
- Render a horizontal progress bar (glass background, orange fill)
- 3-column grid of fields, each with Check (green) or XIcon (red/muted) + label
- Below the grid: enrichment status line with icon, last enriched date if available
- Optional enrichmentStages node for orgs (stage icon cluster)

- [ ] **Step 3: Create `CorrelationBadge`**

`components/admin/correlation-badge.tsx` — Renders relationship chains with → separators.

```typescript
import Link from "next/link";
import { Badge } from "@/components/ui/badge";

interface ChainSegment {
  text: string;
  href?: string;       // If provided, segment is a link
  badge?: string;      // If provided, render as Badge with this variant
}

interface CorrelationBadgeProps {
  segments: ChainSegment[];
  className?: string;
}
```

The component should:
- Render segments inline with ` → ` separators in muted gray
- Text segments: `text-xs text-[var(--text-secondary)]`
- Link segments: same styling but with hover:underline, wrapped in `<Link>`
- Badge segments: render as `<Badge variant={badge}>{text}</Badge>`
- If segments is empty, render `—` in muted text

---

## Task 3: Persons Table View

**Files:**
- Rewrite: `app/admin/persons/page.tsx`

**Dependencies:** Task 1 (shared components)

This is a full rewrite of the persons list page with the two-panel layout, dense table, sidebar filters, and correlation column.

- [ ] **Step 1: Rewrite persons page with two-panel layout**

The page is a server component. Key changes from current implementation:

**Data fetching** (server-side, follow existing batch pattern):
1. Fetch `persons_with_icp` (existing) — all person fields + primary_org_name, icp_score, org_category, org_role
2. Fetch all `event_participations` with event names (for person-level participations)
3. Fetch all `person_organization` links (for org→event cross-reference)
4. Fetch all org-level `event_participations` with sponsor_tier (for correlation column)
5. Fetch interaction counts per person (existing pattern)
6. Fetch distinct values for filter dropdowns: events, seniority values, department values, source values

**Client component** for the table body (needs useState for filters, selection, sorting, hover):

Create an inline `PersonsTableClient` component (or extract to `components/admin/persons-table-client.tsx` if >300 lines) that receives all pre-fetched data as props.

**Correlation computation** (client-side):
```typescript
function computeCorrelation(person, personEvents, orgEvents) {
  // personEvents: [{event_name, role, event_id}]
  // orgEvents: [{org_name, org_id, event_name, tier, event_id}]

  const speakerRoles = ["speaker", "panelist", "mc"];
  const personSpeakerEvents = personEvents.filter(e => speakerRoles.includes(e.role));

  for (const pe of personSpeakerEvents) {
    const orgMatch = orgEvents.find(oe => oe.event_id === pe.event_id);
    if (orgMatch) {
      return { type: "speaker_sponsor", segments: [
        { text: "Speaker" },
        { text: orgMatch.org_name, href: `/admin/organizations/${orgMatch.org_id}` },
        { text: `${orgMatch.tier} Sponsor`, badge: orgMatch.tier }
      ]};
    }
  }
  // ... continue with other rules per spec
}
```

**Table columns:** Follow spec Section 1.1 exactly — Avatar+Name, Title, Organization, Seniority, ICP, Channels, Events, Correlation, Enrichment, Last Activity.

**Sidebar:** Search (GlassInput with Search icon), FilterGroups for Relationships/Profile/Contact/Enrichment, ActiveFilters, SelectionSummary, RowPreview (on hover — debounced 200ms, stays visible when mouse enters preview card).

**Sorting:** Client-side via useState. Column headers are clickable with chevron indicators. Default: icp_score desc.

**Selection:** Checkbox column, header checkbox for select-all-visible, shift+click for range select.

**Row click:** Navigate to `/admin/persons/${id}` (not on checkbox click).

- [ ] **Step 2: Verify persons table renders correctly**

Run: `npm run dev` → navigate to `/admin/persons`
Expected: Two-panel layout with dense table, sidebar filters, correlation column populated for persons with event+org connections.

---

## Task 4: Organizations Table View

**Files:**
- Rewrite: `app/admin/organizations/page.tsx`

**Dependencies:** Task 1

Full rewrite following spec Section 1.2. Same patterns as Task 3 but for organizations.

- [ ] **Step 1: Rewrite organizations page with two-panel layout**

**Data fetching** (server-side):
1. Fetch all organizations (existing batch pattern)
2. Fetch person_organization counts per org (total + enriched where person.enrichment_status = 'complete')
3. Fetch signal counts and last signal dates per org
4. Fetch event_participations with event names and sponsor tiers per org
5. Fetch enrichment job metadata from job_log (target_table='organizations') for firmographic fields (industry, employee_count)
6. Fetch distinct values for filters: categories, signal types, industries from enrichment metadata

**Table columns:** Logo+Name, Category, ICP, People, Events, Signals, Industry, Employees, Enrichment (stage icon cluster), Last Signal.

**Enrichment column:** Reuse the stage icon pattern from the enrichment page — Search/Flask/Brain/Users icons colored green (success), gray (no data), red (failed), absent (never attempted). Read status from `enrichment_stages` JSONB on the organization record.

**Sidebar:** Search, FilterGroups (Relationships/Profile/Enrichment/Signals), ActiveFilters, SelectionSummary, RowPreview.

**Sorting:** Client-side, default icp_score desc.

- [ ] **Step 2: Verify organizations table renders**

Run: `npm run dev` → navigate to `/admin/organizations`
Expected: Two-panel layout with all columns populated, enrichment stage icons, event badges with sponsor tiers.

---

## Task 5: Events Table View

**Files:**
- Rewrite: `app/admin/events/page.tsx`
- Create: `components/admin/coverage-metrics.tsx`

**Dependencies:** Task 1

Replace the card grid with a proper table + sidebar. Spec Section 1.3.

- [ ] **Step 1: Create `CoverageMetrics` component**

`components/admin/coverage-metrics.tsx` — Three inline mini-metrics for the coverage column.

```typescript
interface CoverageMetricsProps {
  enrichedContactPct: number; // 0-100
  avgIcp: number | null;
  totalSignals: number;
}
```

Renders three compact inline badges:
- 👤 {pct}% — enriched contact coverage (green ≥80, yellow ≥50, gray <50)
- 📊 {icp} — avg ICP (same color scale as ICP badges)
- 📡 {count} — signal count

- [ ] **Step 2: Rewrite events page with two-panel table**

**Data fetching:**
1. Fetch all events ordered by date_start desc
2. Fetch event_participations with person_id and organization_id
3. Compute per-event: speaker_count, sponsor_count, contact_count, org_count
4. Compute coverage: enriched contact % (requires person_organization + persons join), avg ICP (from org icp_scores), total signals

**Table columns:** Name, Type, Dates, Location, Speakers, Sponsors, Contacts, Orgs, Coverage.

**Sidebar:** Search (name, location), Filters (Type, Date Range, Location, Coverage metrics), Event Preview on hover.

- [ ] **Step 3: Verify events table renders**

Run: `npm run dev` → navigate to `/admin/events`
Expected: Table with all columns, coverage metrics populated, filters working.

---

## Task 6: Lists Table View

**Files:**
- Rewrite: `app/admin/lists/page.tsx`

**Dependencies:** Task 1

Upgrade the lists index view with the two-panel pattern. Spec Section 1.4. The existing list detail view (inline member management) should be preserved — only the index/listing view gets the two-panel treatment.

- [ ] **Step 1: Rewrite lists index page**

**Data fetching:**
1. Fetch all person_lists
2. Fetch person_list_items with member counts
3. Compute per list: avg ICP (via person→person_org→org), email coverage count, top 3 orgs

**Table columns:** Name, Description, Members, Avg ICP, Has Email (ratio), Top Orgs (badges), Created, Updated.

**Sidebar:** Search (list name), Filters (Min Members, Min Avg ICP, Created range), List Preview on hover.

**Preserve:** The existing `selectedListId` detail view with member management, modals, etc. The two-panel layout wraps only the index view. When a list is selected, switch to the existing detail view (or keep it as-is with minor styling alignment).

- [ ] **Step 2: Verify lists page renders**

Run: `npm run dev` → navigate to `/admin/lists`
Expected: Two-panel table view for index, detail view still works when clicking a list.

---

## Task 7: Person Detail Page

**Files:**
- Rewrite: `app/admin/persons/[id]/page.tsx`
- Create: `components/admin/person-correlation-summary.tsx`

**Dependencies:** Task 1, Task 2

Full rewrite following spec Section 2.1.

- [ ] **Step 1: Create `PersonCorrelationSummary`**

`components/admin/person-correlation-summary.tsx` — Builds and renders the relationship chain summary strip.

Props:
```typescript
interface PersonCorrelationSummaryProps {
  personEvents: Array<{ event_id: string; event_name: string; role: string; talk_title: string | null; track: string | null }>;
  personOrgs: Array<{ org_id: string; org_name: string; role: string | null; is_current: boolean; title: string | null }>;
  orgEventLinks: Array<{ org_id: string; org_name: string; event_id: string; event_name: string; tier: string | null }>;
}
```

Construction rules per spec:
1. For each event participation, check if any org sponsors that event
2. Show current org connections first, then former
3. All entity names are clickable links
4. Render as sentence-level text with `·` separators, links in accent-indigo

- [ ] **Step 2: Rewrite person detail page**

**Data fetching** (server-side, parallel via Promise.all):
1. Person record (from persons table)
2. Person organizations with full org details: `person_organization` → `organizations` (select id, name, logo_url, icp_score, category)
3. Event participations with event details: `event_participations` → `events` (where person_id = id)
4. Org-level event participations (for "Org Also Sponsoring?" column): for each org in step 2, fetch their event_participations
5. Initiative enrollments with initiative + event details
6. Interactions (existing pattern)
7. Signals aggregated from all related orgs: fetch `organization_signals` where organization_id in org IDs from step 2

**Center panel sections:**
1. **Correlation Summary** — `PersonCorrelationSummary` component
2. **Events & Roles** — GlassCard table: Event, Role (badge), Talk/Panel, Track, Org Also Sponsoring? (tier badge or —)
3. **Organizations** — GlassCard table: Organization (linked, logo), Role, Status (Current/Former), ICP, Category, Event Presence (badges)
4. **Signals** — SignalsTimeline, aggregated from all orgs, each tagged with org name badge. Only shown if signals exist.
5. **Initiative Enrollments** — GlassCard table, only shown if enrollments exist
6. **Interactions** — InteractionsTimeline with showFilters

**Right sidebar sections:**
1. **IdentityCard** — photo, name, title@org, seniority·department, contact links, source+date
2. **DataCompleteness** — 11 fields checked, enrichment status line
3. **Quick Actions** — Enrich, Add to List dropdown, Start Sequence
4. **Outreach Brief** — ICP score, icp_reason, usp, template-generated talking points
5. **Notes** — textarea with auto-save

**Notes auto-save:** Client component with useState for notes text, debounced 1000ms onBlur/onChange that PATCHes to a simple API route (or use Supabase client directly since there's an existing pattern with `useSupabase()`).

- [ ] **Step 3: Verify person detail page**

Run: `npm run dev` → navigate to a person detail page (pick one with event participations and org links)
Expected: Two-panel layout, correlation summary at top, all sections populated, sidebar with identity card and completeness meter.

---

## Task 8: Organization Detail Page

**Files:**
- Rewrite: `app/admin/organizations/[id]/page.tsx`
- Create: `components/admin/org-correlation-summary.tsx`

**Dependencies:** Task 1, Task 2

Full rewrite following spec Section 2.2.

- [ ] **Step 1: Create `OrgCorrelationSummary`**

`components/admin/org-correlation-summary.tsx` — Builds the org relationship chain summary.

Props:
```typescript
interface OrgCorrelationSummaryProps {
  orgEvents: Array<{ event_id: string; event_name: string; tier: string | null; role: string }>;
  people: Array<{ id: string; full_name: string; enrichment_status: string }>;
  peopleSpeaking: Array<{ person_id: string; person_name: string; event_id: string; event_name: string }>;
  signalCount: number;
  icpScore: number | null;
}
```

Renders: "{Tier} Sponsor at {Event} · {N} enriched contacts ({M} speakers) · {S} signals · ICP {score}"
Second line for additional events.

- [ ] **Step 2: Rewrite organization detail page**

**Data fetching** (server-side, parallel):
1. Organization record
2. Person organization links with full person details (including person event_participations for the "Events" column in people roster)
3. Event participations with event details
4. Signals
5. Interactions: fetch where organization_id = id, PLUS fetch where person_id in linked person IDs, deduplicate by interaction ID
6. Enrichment job metadata: `job_log` where target_table = 'organizations' and target_id = id, status = 'completed', order by created_at desc limit 1 → extract metadata JSONB for firmographics

**Center panel sections:**
1. **Correlation Summary** — OrgCorrelationSummary
2. **Event Presence** — GlassCard table: Event, Tier (badge), Role, Our Contacts There (count, expandable), Speakers From Here (names or count)
3. **People Roster** — GlassCard table: Name (avatar, linked), Title, Seniority (badge), Status, Events (badges), Channels (icon row), Source (badge)
4. **Firmographics** — GlassCard, only if enrichment metadata exists. 4-col grid: Industry, Employees, Revenue, Funding. Second row: Founded, HQ, Website, LinkedIn. Third row: Tech Stack pills.
5. **Signals Timeline** — existing SignalsTimeline
6. **Interactions** — InteractionsTimeline with showPersonLink

**Right sidebar sections:**
1. **IdentityCard** — logo, name, category, ICP badge, website+linkedin, stats (people/signals/events counts)
2. **DataCompleteness** — 9 fields, enrichment stages icons
3. **Quick Actions** — Enrich, Add to Initiative dropdown, View in Enrichment
4. **ICP Analysis** — score, icp_reason, usp, context (full text)
5. **Notes** — textarea with auto-save

- [ ] **Step 3: Verify organization detail page**

Run: `npm run dev` → navigate to an org detail page (pick one with event participations and people)
Expected: Two-panel layout, correlation summary, event presence table with contact cross-references, firmographics if enriched, all sidebar sections.

---

## Task 9: Final Integration & Verification

**Dependencies:** Tasks 1-8

- [ ] **Step 1: Cross-page navigation check**

Verify all links work:
- Persons table → Person detail (click row)
- Person detail → Org detail (click org in Organizations section)
- Org detail → Person detail (click person in People Roster)
- Org detail → Event detail (click event in Event Presence)
- Person detail → Event detail (click event in Events & Roles)
- All table views → respective detail pages

- [ ] **Step 2: Build verification**

Run: `npx next build`
Expected: No TypeScript errors, no build failures.

- [ ] **Step 3: Visual consistency check**

Navigate through all 6 rewritten pages and verify:
- TwoPanelLayout renders consistently
- Glass morphism styling matches existing pages
- Sidebar is sticky and scrolls independently
- Responsive: resize to < 1024px, verify drawer toggle works on table views

---

## Parallelization Map

```
Task 1 (shared layout + filter components)
  ├── Task 3 (persons table)     ─┐
  ├── Task 4 (orgs table)        ─┤
  ├── Task 5 (events table)      ─┤── All independent
  └── Task 6 (lists table)       ─┘

Task 2 (detail page widgets)
  ├── Task 7 (person detail)     ─┐── Independent
  └── Task 8 (org detail)        ─┘

Task 9 (integration) — after all above
```

Tasks 1 and 2 can run in parallel. Tasks 3-6 can run in parallel after Task 1. Tasks 7-8 can run in parallel after Tasks 1+2. Task 9 runs last.
