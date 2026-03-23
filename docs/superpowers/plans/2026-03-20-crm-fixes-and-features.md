# FP Block CRM Fixes & Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all broken CRM functionality (contacts view, inbox correlation, CSV import) and build out missing features (sequence management, event/company correlation, enrichment API, action buttons).

**Architecture:** Next.js 16 app router + Supabase (Postgres + Edge Functions + Auth). Server components fetch data, client components handle interactivity. Server actions for mutations. Edge functions for external API calls (Apollo, Gemini, SendGrid, HeyReach). Glassmorphic design system with `GlassCard`, `GlassInput`, `GlassSelect`, `Badge` components.

**Tech Stack:** Next.js 16, React 19, TypeScript, Supabase JS v2, Tailwind CSS v4, Deno (edge functions), Fastmail JMAP, Apollo API, Gemini 2.0 Flash

---

## File Map

### Bug Fixes (Tasks 1-2)
- Modify: `lib/inbox-correlator.ts:94,204` — Fix `contact_companies` → `contact_company`
- Modify: `app/admin/uploads/actions.ts:227,266` — Fix `contact_events` → `contact_event`

### Sequences (Tasks 3-5)
- Modify: `app/admin/sequences/page.tsx` — Add "Create Sequence" button + modal
- Modify: `app/admin/sequences/actions.ts` — Add create, delete, start/pause/stop, enroll/unenroll actions
- Modify: `app/admin/sequences/[id]/page.tsx` — Add enrollment UI, start/pause/stop buttons
- Create: `app/api/sequences/execute/route.ts` — Execute next step for active enrollments
- Modify: `lib/types/database.ts` — Add `status` field to Sequence type

### Database (Task 3)
- Create: `supabase/migrations/006_sequence_status.sql` — Add status column to sequences table

### Companies + Events Correlation (Tasks 6-7)
- Modify: `app/admin/companies/page.tsx` — Add event tags column
- Modify: `app/admin/companies/[id]/page.tsx` — Add events section
- Modify: `app/admin/events/[id]/page.tsx` — Show company category from company_event junction

### Contacts View Fix (Task 8)
- Modify: `app/admin/contacts/page.tsx` — Fix query to handle missing relations gracefully

### Inbox Fixes (Task 9)
- Modify: `app/api/inbox/route.ts` — Add contact search handler for GET requests

### Enrichment API (Task 10)
- Modify: `app/api/enrich/route.ts` — Implement Apollo enrichment logic

### Action Buttons (Tasks 11-12)
- Create: `app/api/messages/generate/route.ts` — Proxy to generate-messages edge function
- Create: `app/api/messages/send/route.ts` — Proxy to send-message edge function
- Create: `app/api/messages/actions/route.ts` — Approve, schedule, bulk actions
- Modify: `app/admin/contacts/[id]/page.tsx` — Add generate/send/approve message buttons
- Modify: `components/admin/message-table.tsx` — Add action buttons per message row
- Modify: `app/admin/enrichment/page.tsx` — Wire "Run Enrichment" button to API

---

## Task 1: Fix Table Name Bugs (inbox-correlator)

**Files:**
- Modify: `lib/inbox-correlator.ts:94` — Change `contact_companies` → `contact_company`
- Modify: `lib/inbox-correlator.ts:204` — Change `contact_companies` → `contact_company`

**Context:** The DB table is `contact_company` (singular, per `001_schema.sql:129`). The correlator uses plural, causing domain-match correlation to silently fail.

- [ ] **Step 1: Fix line 94**

Change `.from("contact_companies")` to `.from("contact_company")` at line 94.

- [ ] **Step 2: Fix line 204**

Change `.from("contact_companies")` to `.from("contact_company")` at line 204.

- [ ] **Step 3: Verify build**

Run: `npx next build 2>&1 | tail -5`
Expected: `✓ Compiled successfully`

- [ ] **Step 4: Commit**

```bash
git add lib/inbox-correlator.ts
git commit -m "fix: correct table name contact_companies → contact_company in inbox correlator"
```

---

## Task 2: Fix Table Name Bug (uploads actions)

**Files:**
- Modify: `app/admin/uploads/actions.ts:227,266` — Change `contact_events` → `contact_event`

**Context:** The DB table is `contact_event` (singular, per `001_schema.sql:142`). CSV import event linking silently fails.

- [ ] **Step 1: Fix line 227**

Change `.from("contact_events")` to `.from("contact_event")` at line 227.

- [ ] **Step 2: Fix line 266**

Change `.from("contact_events")` to `.from("contact_event")` at line 266.

- [ ] **Step 3: Verify build**

Run: `npx next build 2>&1 | tail -5`
Expected: `✓ Compiled successfully`

- [ ] **Step 4: Commit**

```bash
git add app/admin/uploads/actions.ts
git commit -m "fix: correct table name contact_events → contact_event in CSV import"
```

---

## Task 3: Sequence Management — Create, Delete, Status

**Files:**
- Create: `supabase/migrations/006_sequence_status.sql`
- Modify: `lib/types/database.ts:176` — Add `status` to Sequence interface
- Modify: `app/admin/sequences/actions.ts` — Add createSequence, deleteSequence, updateSequenceStatus
- Modify: `app/admin/sequences/page.tsx` — Add "New Sequence" button with inline creation form, status badges, delete

**Context:** The sequences page currently has no way to create a new sequence. Sequences also need a status field (draft/active/paused/completed) to support start/pause/stop operations.

- [ ] **Step 1: Create migration for sequence status**

Create `supabase/migrations/006_sequence_status.sql`:
```sql
ALTER TABLE sequences ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'draft' CHECK (status IN ('draft','active','paused','completed'));
```

- [ ] **Step 2: Update Sequence type**

In `lib/types/database.ts`, add `status` to the `Sequence` interface:
```typescript
export interface Sequence {
  id: string;
  name: string;
  channel: string;
  event_id: string | null;
  steps: SequenceStep[];
  status: "draft" | "active" | "paused" | "completed";
  created_at: string;
  updated_at: string;
}
```

- [ ] **Step 3: Add server actions**

In `app/admin/sequences/actions.ts`, add these server actions:

```typescript
export async function createSequence(data: {
  name: string;
  channel: string;
  event_id: string | null;
}) {
  const supabase = await createClient();
  const { data: seq, error } = await supabase
    .from("sequences")
    .insert({ ...data, steps: [], status: "draft" })
    .select("id")
    .single();
  if (error) return { success: false, error: error.message };
  return { success: true, id: seq.id };
}

export async function deleteSequence(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("sequences").delete().eq("id", id);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function updateSequenceStatus(id: string, status: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("sequences")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { success: false, error: error.message };
  return { success: true };
}
```

- [ ] **Step 4: Update sequences list page**

Convert `app/admin/sequences/page.tsx` to a client wrapper that includes:
- A "New Sequence" button in the header that opens a creation modal
- Status badges on each sequence row
- A delete button per row
- Start/Pause/Stop dropdown per row

The page should remain a server component that fetches data, but wrap a client component for interactivity. Pattern: keep the server page, add a client component `SequenceListClient` that receives the data.

Create `app/admin/sequences/sequence-list-client.tsx` as a `"use client"` component that:
- Accepts `sequences` and `events` props
- Renders the create modal with: name (text), channel (select: email/linkedin/twitter/telegram), event (select from events)
- Shows status badge column with variant mapping: `draft → "draft"`, `active → "sent"`, `paused → "scheduled"`, `completed → "replied"`
- Has action buttons: Play (start), Pause, Stop, Delete
- Calls the server actions and uses `router.refresh()` to reload

Update `app/admin/sequences/page.tsx` to:
- Fetch events in addition to sequences
- Pass data to `SequenceListClient`

- [ ] **Step 5: Verify build**

Run: `npx next build 2>&1 | tail -5`

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/006_sequence_status.sql lib/types/database.ts app/admin/sequences/
git commit -m "feat: sequence create/delete/status management"
```

---

## Task 4: Sequence Enrollment — Add/Remove Contacts

**Files:**
- Modify: `app/admin/sequences/actions.ts` — Add enrollContacts, unenrollContact
- Modify: `app/admin/sequences/[id]/page.tsx` — Add enrollment UI (contact search + enroll, remove button)

**Context:** The sequence detail page shows enrolled contacts but has no way to add or remove them.

- [ ] **Step 1: Add enrollment server actions**

In `app/admin/sequences/actions.ts`, add:

```typescript
export async function enrollContacts(sequenceId: string, contactIds: string[]) {
  const supabase = await createClient();
  const rows = contactIds.map((cid) => ({
    sequence_id: sequenceId,
    contact_id: cid,
    current_step: 0,
    status: "active",
  }));
  const { error } = await supabase
    .from("sequence_enrollments")
    .upsert(rows, { onConflict: "sequence_id,contact_id" });
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function unenrollContact(enrollmentId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("sequence_enrollments")
    .delete()
    .eq("id", enrollmentId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function searchContacts(query: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("contacts")
    .select("id, full_name, email")
    .or(`full_name.ilike.%${query}%,email.ilike.%${query}%`)
    .limit(20);
  return data || [];
}
```

- [ ] **Step 2: Create enrollment client component**

Create `app/admin/sequences/[id]/enrollment-panel.tsx` — a `"use client"` component that:
- Has an "Add Contacts" button that opens a search modal
- Shows a search input that calls `searchContacts` server action
- Renders results as clickable rows with a checkbox for multi-select
- Has "Enroll Selected" button that calls `enrollContacts`
- Each enrolled contact row has a "Remove" button calling `unenrollContact`
- Has pause/resume per enrollment (updates enrollment status)

- [ ] **Step 3: Update sequence detail page**

Modify `app/admin/sequences/[id]/page.tsx` to:
- Import and use `EnrollmentPanel` instead of the static enrolled contacts list
- Pass enrollments and sequence data to the client component

- [ ] **Step 4: Verify build**

Run: `npx next build 2>&1 | tail -5`

- [ ] **Step 5: Commit**

```bash
git add app/admin/sequences/
git commit -m "feat: sequence enrollment - add/remove contacts"
```

---

## Task 5: Sequence Execution Engine

**Files:**
- Create: `app/api/sequences/execute/route.ts` — Process active enrollments (advance steps, generate/send messages)

**Context:** Sequences need to actually execute: advance contacts through steps based on delay_days, trigger message generation/sending per step. This API route will be called by the CRON job.

- [ ] **Step 1: Create the execution route**

Create `app/api/sequences/execute/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createClient();

  // Find active enrollments whose next step is due
  const { data: enrollments } = await supabase
    .from("sequence_enrollments")
    .select("*, sequence:sequences(*)")
    .eq("status", "active");

  if (!enrollments || enrollments.length === 0) {
    return NextResponse.json({ processed: 0 });
  }

  let processed = 0;

  for (const enrollment of enrollments) {
    const seq = enrollment.sequence as any;
    if (seq.status !== "active") continue;

    const steps = Array.isArray(seq.steps) ? seq.steps : [];
    const currentStep = enrollment.current_step;

    if (currentStep >= steps.length) {
      // Sequence complete for this contact
      await supabase
        .from("sequence_enrollments")
        .update({ status: "completed" })
        .eq("id", enrollment.id);
      continue;
    }

    const step = steps[currentStep];

    // Check if delay has elapsed since enrollment or last step
    const enrolledAt = new Date(enrollment.enrolled_at);
    let delayDays = 0;
    for (let i = 0; i <= currentStep; i++) {
      delayDays += steps[i]?.delay_days || 0;
    }

    const dueDate = new Date(enrolledAt.getTime() + delayDays * 86400000);
    if (new Date() < dueDate) continue; // Not yet due

    // Check if message already exists for this step (avoid duplicates)
    const { data: existing } = await supabase
      .from("messages")
      .select("id")
      .eq("contact_id", enrollment.contact_id)
      .eq("sequence_number", currentStep + 1)
      .neq("status", "superseded")
      .limit(1);

    if (existing && existing.length > 0) {
      // Already generated — advance step
      await supabase
        .from("sequence_enrollments")
        .update({ current_step: currentStep + 1 })
        .eq("id", enrollment.id);
      processed++;
      continue;
    }

    // Generate message for this step using the step's body_template
    // If body_template has {{variables}}, it'll be used as-is (simple template)
    // If prompt_template_id is set, call generate-messages edge function instead
    if (step.prompt_template_id) {
      // Call edge function for AI generation
      const { error } = await supabase.functions.invoke("generate-messages", {
        body: {
          contact_ids: [enrollment.contact_id],
          event_id: seq.event_id,
          channels: [seq.channel],
          sequence_number: currentStep + 1,
          prompt_template_id: step.prompt_template_id,
        },
      });
      if (error) {
        console.error(`Sequence execution error:`, error);
        continue;
      }
    } else {
      // Use the step's body_template directly
      // Fetch contact for template variable substitution
      const { data: contact } = await supabase
        .from("contacts")
        .select("*, contact_company(company:companies(id, name))")
        .eq("id", enrollment.contact_id)
        .single();

      if (!contact) continue;

      const primaryCompany = contact.contact_company?.[0]?.company;
      let body = step.body_template || "";
      let subject = step.subject_template || null;

      // Simple variable substitution
      const vars: Record<string, string> = {
        first_name: contact.first_name || contact.full_name?.split(" ")[0] || "",
        full_name: contact.full_name || "",
        company_name: primaryCompany?.name || "",
        title: contact.title || "",
      };

      for (const [key, val] of Object.entries(vars)) {
        body = body.replace(new RegExp(`\\{${key}\\}`, "g"), val);
        if (subject) subject = subject.replace(new RegExp(`\\{${key}\\}`, "g"), val);
      }

      await supabase.from("messages").insert({
        contact_id: enrollment.contact_id,
        company_id: primaryCompany?.id || null,
        event_id: seq.event_id,
        channel: seq.channel,
        sequence_number: currentStep + 1,
        iteration: 1,
        subject,
        body,
        status: "draft",
      });
    }

    // Advance step
    await supabase
      .from("sequence_enrollments")
      .update({ current_step: currentStep + 1 })
      .eq("id", enrollment.id);

    processed++;
  }

  return NextResponse.json({ processed });
}
```

- [ ] **Step 2: Verify build**

Run: `npx next build 2>&1 | tail -5`

- [ ] **Step 3: Commit**

```bash
git add app/api/sequences/
git commit -m "feat: sequence execution engine — advances steps and generates messages"
```

---

## Task 6: Companies — Event Tags Display

**Files:**
- Modify: `app/admin/companies/page.tsx` — Add event tags column to table, include company_event data
- Modify: `app/admin/companies/[id]/page.tsx` — Add events section with relationship type

**Context:** Companies need to show which events they're associated with and why (sponsor, speaker's company). The `company_event` junction table has `relationship_type` and `sponsor_tier`.

- [ ] **Step 1: Update companies list page**

In `app/admin/companies/page.tsx`:

1. Add `company_event(event_id, relationship_type, sponsor_tier, event:events(id, name))` to the select query (line 36):
```typescript
let query = supabase
  .from("companies")
  .select(
    "*, contact_company(id), company_signals(id, date), company_event(event_id, relationship_type, sponsor_tier, event:events(id, name))",
    { count: "exact" }
  );
```

2. Add event data to the row processing (after line 91):
```typescript
events: (company.company_event || []).map((ce: any) => ({
  name: ce.event?.name,
  type: ce.relationship_type,
  tier: ce.sponsor_tier,
})),
```

3. Add an "Events" column to the table header (after the "Signals" column).

4. Add event badge cells in the table body:
```tsx
<td className="px-5 py-3">
  <div className="flex flex-wrap gap-1">
    {row.events.map((ev: any, i: number) => (
      <Badge key={i} variant="glass-indigo">
        {ev.name}{ev.tier ? ` (${ev.tier})` : ""}
      </Badge>
    ))}
  </div>
</td>
```

- [ ] **Step 2: Update company detail page**

In `app/admin/companies/[id]/page.tsx`, add an events section after Signals.

Add a query for company events:
```typescript
const { data: companyEvents } = await supabase
  .from("company_event")
  .select("*, event:events(*)")
  .eq("company_id", id);
```

Add JSX section:
```tsx
{/* Events */}
<div>
  <h2 className="text-lg font-medium font-[family-name:var(--font-heading)] mb-2">
    Events ({(companyEvents || []).length})
  </h2>
  <div className="space-y-2">
    {(companyEvents || []).map((ce: any) => (
      <GlassCard key={ce.id} className="flex items-center gap-3 !p-3">
        <Link href={`/admin/events/${ce.event.id}`} className="text-[var(--accent-indigo)] hover:underline text-sm">
          {ce.event.name}
        </Link>
        {ce.relationship_type && <Badge>{ce.relationship_type}</Badge>}
        {ce.sponsor_tier && <Badge variant="glass-orange">{ce.sponsor_tier}</Badge>}
      </GlassCard>
    ))}
  </div>
</div>
```

- [ ] **Step 3: Verify build**

Run: `npx next build 2>&1 | tail -5`

- [ ] **Step 4: Commit**

```bash
git add app/admin/companies/
git commit -m "feat: display event tags on companies list and detail pages"
```

---

## Task 7: Events — Company Correlation with Shared Fields

**Files:**
- Modify: `app/admin/events/[id]/page.tsx` — Enhance companies tab with category, relationship_type from company_event
- Modify: `app/admin/events/page.tsx` — Add category indicator to event cards

**Context:** The events detail page shows companies but doesn't display their category or the relationship type (sponsor/etc). The event cards on the list page should also hint at what kinds of companies are involved.

- [ ] **Step 1: Enhance event detail companies tab**

In `app/admin/events/[id]/page.tsx`, the companies query already fetches `sponsor_tier` and `relationship_type`. Update the companies mapping to include `category` from the company:

Change line 36-37:
```typescript
const { data: companyEvents } = await supabase
  .from("company_event")
  .select("sponsor_tier, relationship_type, notes, company:companies(*, contact_company(id))")
  .eq("event_id", id);
```

Update the companies mapping (line 51-54):
```typescript
const companies = (companyEvents || []).map((ce: any) => ({
  ...ce.company,
  sponsor_tier: ce.sponsor_tier,
  relationship_type: ce.relationship_type,
  contact_count: ce.company?.contact_company?.length || 0,
}));
```

- [ ] **Step 2: Update CompanyTable to display new fields**

Read `components/admin/company-table.tsx` to understand its interface, then add `relationship_type` and `sponsor_tier` columns if not already present. If the component doesn't support these fields, add them.

- [ ] **Step 3: Verify build**

Run: `npx next build 2>&1 | tail -5`

- [ ] **Step 4: Commit**

```bash
git add app/admin/events/ components/admin/company-table.tsx
git commit -m "feat: show company category and event relationship in events detail"
```

---

## Task 8: Fix Contacts View

**Files:**
- Modify: `app/admin/contacts/page.tsx` — Fix query to handle edge cases, ensure data renders

**Context:** User reports "can't see contacts in the view." The query joins `contact_company` with nested `companies` and `messages` — if any relation fails or returns unexpected shape, rows will be empty. The query also does client-side filtering after server-side pagination, which can result in empty pages even when contacts exist.

- [ ] **Step 1: Fix the query and filtering**

The current approach has a fundamental issue: it paginates server-side (`.range()`) but then filters client-side (ICP, event, company filters), which means a page could return 0 rows even though matching contacts exist.

Fix by moving more filters server-side:

1. For ICP filtering: Since ICP is on the company (not contact), and we're joining `contact_company(company:companies(icp_score))`, we can't easily filter server-side. Keep client-side but remove pagination when filters are active.

2. For event/company filtering: These already filter by contact IDs. Apply these IDs as `.in("id", [...ids])` to the main query before pagination.

Updated approach in `app/admin/contacts/page.tsx`:

```typescript
// Build base query
let query = supabase
  .from("contacts")
  .select(
    "*, contact_company(*, company:companies(id, name, icp_score)), messages(id, status, updated_at)",
    { count: "exact" }
  );

if (params.search) {
  query = query.or(
    `full_name.ilike.%${params.search}%,email.ilike.%${params.search}%`
  );
}

if (params.has_email === "yes") {
  query = query.not("email", "is", null);
} else if (params.has_email === "no") {
  query = query.is("email", null);
}

// Pre-filter by event and company contact IDs (server-side)
let filterIds: string[] | null = null;

if (params.event) {
  const { data: contactEvents } = await supabase
    .from("contact_event")
    .select("contact_id")
    .eq("event_id", params.event);
  const ids = (contactEvents || []).map((ce: any) => ce.contact_id);
  filterIds = filterIds ? filterIds.filter(id => ids.includes(id)) : ids;
}

if (params.company) {
  const { data: contactCompanies } = await supabase
    .from("contact_company")
    .select("contact_id")
    .eq("company_id", params.company);
  const ids = (contactCompanies || []).map((cc: any) => cc.contact_id);
  filterIds = filterIds ? filterIds.filter(id => ids.includes(id)) : ids;
}

if (filterIds !== null) {
  if (filterIds.length === 0) {
    // No matches — return empty
    // render empty state
  } else {
    query = query.in("id", filterIds);
  }
}

const { data: contacts, count } = await query
  .order("full_name")
  .range(offset, offset + PAGE_SIZE - 1);
```

This moves event/company filtering server-side so pagination works correctly. ICP and outreach_status filters remain client-side since they depend on joined data.

- [ ] **Step 2: Add null-safe data processing**

Ensure the row mapping handles null `contact_company` and `messages` gracefully:

```typescript
const rows = (contacts || []).map((contact: any) => {
  const affiliations = Array.isArray(contact.contact_company) ? contact.contact_company : [];
  const primaryAff = affiliations.find((cc: any) => cc.is_primary) || affiliations[0];
  const company = primaryAff?.company;
  // ... rest stays the same
});
```

- [ ] **Step 3: Verify build**

Run: `npx next build 2>&1 | tail -5`

- [ ] **Step 4: Commit**

```bash
git add app/admin/contacts/page.tsx
git commit -m "fix: contacts view - server-side event/company filtering, null-safe data"
```

---

## Task 9: Inbox Contact Search API

**Files:**
- Modify: `app/api/inbox/route.ts` — Add contact search capability to GET handler

**Context:** The inbox "Link to Contact" modal calls `GET /api/inbox?search=...&type=contacts` but the GET handler only fetches emails. This breaks the contact search in the link modal.

- [ ] **Step 1: Add contact search to GET handler**

In `app/api/inbox/route.ts`, update the GET function to check for search params:

```typescript
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const searchType = url.searchParams.get("type");
  const search = url.searchParams.get("search");

  // If this is a contact search request
  if (searchType === "contacts" && search) {
    const supabase = await createClient();
    const { data: contacts } = await supabase
      .from("contacts")
      .select("id, full_name, email")
      .or(`full_name.ilike.%${search}%,email.ilike.%${search}%`)
      .limit(20);
    return NextResponse.json({ contacts: contacts || [] });
  }

  // Original email fetch logic below...
```

Note: Change the function signature from `GET()` to `GET(request: NextRequest)` to access the request URL.

- [ ] **Step 2: Verify build**

Run: `npx next build 2>&1 | tail -5`

- [ ] **Step 3: Commit**

```bash
git add app/api/inbox/route.ts
git commit -m "feat: add contact search API to inbox route for link-to-contact modal"
```

---

## Task 10: Apollo Enrichment Implementation

**Files:**
- Modify: `app/api/enrich/route.ts` — Implement actual Apollo People Match API calls

**Context:** The enrichment route currently creates a job_log entry but never actually enriches. Port logic from `scraping/scripts/apollo_enrich.py`. Apollo API auth uses `X-Api-Key` header (NOT body param). Endpoint: `https://api.apollo.io/v1/people/match`.

- [ ] **Step 1: Implement the enrichment logic**

Replace the TODO section in `app/api/enrich/route.ts` with:

```typescript
// Resolve contacts to enrich
let contactQuery = supabase.from("contacts").select("id, full_name, first_name, last_name, email, linkedin, twitter, phone, apollo_id, contact_company(company:companies(name, website))");

if (contactIds && contactIds.length > 0) {
  contactQuery = contactQuery.in("id", contactIds);
} else if (eventId) {
  const { data: eventContacts } = await supabase
    .from("contact_event")
    .select("contact_id")
    .eq("event_id", eventId);
  const ids = (eventContacts || []).map((ec: any) => ec.contact_id);
  if (ids.length > 0) {
    contactQuery = contactQuery.in("id", ids);
  }
} else {
  // All unenriched (no apollo_id)
  contactQuery = contactQuery.is("apollo_id", null);
}

const { data: contacts } = await contactQuery.limit(100);

if (!contacts || contacts.length === 0) {
  await supabase.from("job_log").update({
    status: "completed",
    metadata: { ...job_metadata, contacts_processed: 0, note: "No contacts to enrich" },
  }).eq("id", job.id);
  return NextResponse.json({ jobId: job.id, status: "completed", processed: 0 });
}

const APOLLO_API_KEY = process.env.APOLLO_API_KEY;
if (!APOLLO_API_KEY) {
  await supabase.from("job_log").update({ status: "failed", error: "APOLLO_API_KEY not configured" }).eq("id", job.id);
  return NextResponse.json({ error: "APOLLO_API_KEY not configured" }, { status: 500 });
}

let contactsProcessed = 0;
let emailsFound = 0;
let linkedinFound = 0;
let twitterFound = 0;

for (const contact of contacts) {
  try {
    const company = contact.contact_company?.[0]?.company;
    const matchBody: Record<string, string> = {};

    if (contact.first_name) matchBody.first_name = contact.first_name;
    if (contact.last_name) matchBody.last_name = contact.last_name;
    if (!contact.first_name && !contact.last_name && contact.full_name) {
      const parts = contact.full_name.split(" ");
      matchBody.first_name = parts[0];
      matchBody.last_name = parts.slice(1).join(" ");
    }
    if (company?.name) matchBody.organization_name = company.name;
    if (company?.website) matchBody.domain = new URL(company.website.startsWith("http") ? company.website : `https://${company.website}`).hostname.replace("www.", "");
    if (contact.linkedin) matchBody.linkedin_url = contact.linkedin;

    const res = await fetch("https://api.apollo.io/v1/people/match", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": APOLLO_API_KEY,
      },
      body: JSON.stringify(matchBody),
    });

    if (!res.ok) continue;

    const data = await res.json();
    const person = data.person;
    if (!person) continue;

    const updates: Record<string, any> = { apollo_id: person.id };

    if (fields.includes("email") && person.email && !contact.email) {
      updates.email = person.email;
      emailsFound++;
    }
    if (fields.includes("linkedin") && person.linkedin_url && !contact.linkedin) {
      updates.linkedin = person.linkedin_url;
      linkedinFound++;
    }
    if (fields.includes("twitter") && person.twitter_url && !contact.twitter) {
      updates.twitter = person.twitter_url;
      twitterFound++;
    }
    if (fields.includes("phone") && person.phone_numbers?.[0]?.sanitized_number && !contact.phone) {
      updates.phone = person.phone_numbers[0].sanitized_number;
    }
    if (person.title && !contact.title) updates.title = person.title;
    if (person.seniority && !contact.seniority) updates.seniority = person.seniority;

    await supabase.from("contacts").update(updates).eq("id", contact.id);
    contactsProcessed++;

    // Rate limiting: Apollo free tier has limits
    await new Promise(r => setTimeout(r, 500));
  } catch (err) {
    console.error(`Apollo enrichment error for ${contact.full_name}:`, err);
  }
}

await supabase.from("job_log").update({
  status: "completed",
  metadata: { source, fields, contacts_processed: contactsProcessed, emails_found: emailsFound, linkedin_found: linkedinFound, twitter_found: twitterFound },
}).eq("id", job.id);

return NextResponse.json({
  jobId: job.id,
  status: "completed",
  contacts_processed: contactsProcessed,
  emails_found: emailsFound,
  linkedin_found: linkedinFound,
  twitter_found: twitterFound,
});
```

Note: The enrichment runs synchronously in the API route. For production, this should be moved to an edge function with a webhook callback, but for the internal CRM tool this is acceptable.

- [ ] **Step 2: Verify build**

Run: `npx next build 2>&1 | tail -5`

- [ ] **Step 3: Commit**

```bash
git add app/api/enrich/route.ts
git commit -m "feat: implement Apollo People Match enrichment API"
```

---

## Task 11: Message Action API Routes

**Files:**
- Create: `app/api/messages/generate/route.ts` — Proxy to generate-messages edge function
- Create: `app/api/messages/send/route.ts` — Proxy to send-message edge function
- Create: `app/api/messages/actions/route.ts` — Approve, schedule, delete messages

**Context:** The UI buttons need API endpoints to call. Edge functions run in Deno on Supabase, but the UI needs Next.js API routes that call them via `supabase.functions.invoke()`.

- [ ] **Step 1: Create generate messages route**

Create `app/api/messages/generate/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const body = await request.json();

  const { contact_ids, event_id, channels, sequence_number, prompt_template_id, sender_id, cta } = body;

  if (!contact_ids || !Array.isArray(contact_ids) || contact_ids.length === 0) {
    return NextResponse.json({ error: "contact_ids required" }, { status: 400 });
  }

  const { data, error } = await supabase.functions.invoke("generate-messages", {
    body: { contact_ids, event_id, channels, sequence_number, prompt_template_id, sender_id, cta },
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
```

- [ ] **Step 2: Create send messages route**

Create `app/api/messages/send/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const body = await request.json();

  const { message_id, message_ids } = body;

  if (!message_id && (!message_ids || message_ids.length === 0)) {
    return NextResponse.json({ error: "message_id or message_ids required" }, { status: 400 });
  }

  const { data, error } = await supabase.functions.invoke("send-message", {
    body: { message_id, message_ids },
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
```

- [ ] **Step 3: Create message actions route**

Create `app/api/messages/actions/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const body = await request.json();

  const { action, message_ids, scheduled_at } = body as {
    action: "approve" | "schedule" | "delete" | "supersede";
    message_ids: string[];
    scheduled_at?: string;
  };

  if (!action || !message_ids || message_ids.length === 0) {
    return NextResponse.json({ error: "action and message_ids required" }, { status: 400 });
  }

  switch (action) {
    case "approve": {
      const { error } = await supabase
        .from("messages")
        .update({ status: "approved" })
        .in("id", message_ids)
        .eq("status", "draft");
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      break;
    }
    case "schedule": {
      if (!scheduled_at) {
        return NextResponse.json({ error: "scheduled_at required for schedule action" }, { status: 400 });
      }
      const { error } = await supabase
        .from("messages")
        .update({ status: "scheduled", scheduled_at })
        .in("id", message_ids);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      break;
    }
    case "delete": {
      const { error } = await supabase
        .from("messages")
        .delete()
        .in("id", message_ids);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      break;
    }
    case "supersede": {
      const { error } = await supabase
        .from("messages")
        .update({ status: "superseded" })
        .in("id", message_ids);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      break;
    }
    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  return NextResponse.json({ success: true, action, count: message_ids.length });
}
```

- [ ] **Step 4: Verify build**

Run: `npx next build 2>&1 | tail -5`

- [ ] **Step 5: Commit**

```bash
git add app/api/messages/
git commit -m "feat: message generate, send, and action API routes"
```

---

## Task 12: Wire UI Action Buttons

**Files:**
- Modify: `components/admin/message-table.tsx` — Add approve/schedule/send/delete action buttons per row
- Modify: `app/admin/contacts/[id]/page.tsx` — Add "Generate Messages" button
- Modify: `app/admin/enrichment/page.tsx` — Wire "Run Enrichment" button to show progress/results

**Context:** All the API routes now exist but the UI doesn't call them. Need action buttons that call the APIs and show feedback.

- [ ] **Step 1: Read message-table.tsx to understand current interface**

Read `components/admin/message-table.tsx`.

- [ ] **Step 2: Add action buttons to message table**

The message table should become a client component (or have a client wrapper) that adds:
- "Approve" button on draft messages → calls `/api/messages/actions` with `action: "approve"`
- "Schedule" button on approved messages → calls `/api/messages/actions` with `action: "schedule"` (prompts for date/time)
- "Send Now" button on scheduled/approved messages → calls `/api/messages/send`
- "Delete" button → calls `/api/messages/actions` with `action: "delete"`

Create `components/admin/message-actions.tsx` as a `"use client"` component:

```tsx
"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Check, Clock, Send, Trash2, Loader2 } from "lucide-react";

interface MessageActionsProps {
  messageId: string;
  status: string;
  onAction?: () => void;
}

export function MessageActions({ messageId, status, onAction }: MessageActionsProps) {
  const [loading, setLoading] = useState(false);

  async function handleAction(action: string, extra?: Record<string, unknown>) {
    setLoading(true);
    try {
      const endpoint = action === "send"
        ? "/api/messages/send"
        : "/api/messages/actions";

      const body = action === "send"
        ? { message_id: messageId }
        : { action, message_ids: [messageId], ...extra };

      await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      onAction?.();
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <Loader2 className="h-3.5 w-3.5 animate-spin text-white/40" />;
  }

  const btnClass = "p-1.5 rounded-md hover:bg-white/10 transition-colors text-white/40 hover:text-white";

  return (
    <div className="flex items-center gap-1">
      {status === "draft" && (
        <button onClick={() => handleAction("approve")} className={btnClass} title="Approve">
          <Check className="h-3.5 w-3.5" />
        </button>
      )}
      {(status === "draft" || status === "approved") && (
        <button
          onClick={() => {
            const date = new Date();
            date.setHours(date.getHours() + 1);
            handleAction("schedule", { scheduled_at: date.toISOString() });
          }}
          className={btnClass}
          title="Schedule (+1h)"
        >
          <Clock className="h-3.5 w-3.5" />
        </button>
      )}
      {(status === "approved" || status === "scheduled") && (
        <button onClick={() => handleAction("send")} className={cn(btnClass, "hover:text-[#f58327]")} title="Send Now">
          <Send className="h-3.5 w-3.5" />
        </button>
      )}
      {(status === "draft" || status === "approved") && (
        <button onClick={() => handleAction("delete")} className={cn(btnClass, "hover:text-red-400")} title="Delete">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Update message-table to include actions column**

Add the `MessageActions` component as a column in the message table. Since `MessageTable` might be a server component, wrap the actions cell in the client component.

- [ ] **Step 4: Add "Generate Messages" button to contact detail**

In `app/admin/contacts/[id]/page.tsx`, add a client component button below the messages section that calls `/api/messages/generate`:

Create `app/admin/contacts/[id]/generate-button.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function GenerateButton({ contactId, eventId }: { contactId: string; eventId?: string }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function handleGenerate() {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/messages/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contact_ids: [contactId],
          event_id: eventId,
          channels: ["email", "linkedin"],
          sequence_number: 1,
        }),
      });
      if (res.ok) {
        setResult("Messages generated — refresh to see them");
      } else {
        const data = await res.json();
        setResult(`Error: ${data.error}`);
      }
    } catch {
      setResult("Failed to generate messages");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={handleGenerate}
        disabled={loading}
        className={cn(
          "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200",
          "bg-[var(--accent-orange)]/15 text-[var(--accent-orange)] border border-[var(--accent-orange)]/20",
          "hover:bg-[var(--accent-orange)]/25",
          loading && "opacity-50 cursor-not-allowed"
        )}
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        Generate Messages
      </button>
      {result && <span className="text-xs text-[var(--text-muted)]">{result}</span>}
    </div>
  );
}
```

Import and use in the contact detail page above the messages section.

- [ ] **Step 5: Wire enrichment page**

In `app/admin/enrichment/page.tsx`, the "Run" button already exists but the page is a client component. Wire it to call `/api/enrich` and show job progress by polling the `job_log` table.

Read the enrichment page, then add:
- After successful POST to `/api/enrich`, poll `job_log` by `jobId` every 2 seconds until status is `completed` or `failed`
- Show result counts (contacts processed, emails found, etc.)

- [ ] **Step 6: Verify build**

Run: `npx next build 2>&1 | tail -5`

- [ ] **Step 7: Commit**

```bash
git add components/admin/message-actions.tsx components/admin/message-table.tsx app/admin/contacts/\[id\]/ app/admin/enrichment/
git commit -m "feat: wire UI action buttons for messages, enrichment, and generation"
```

---

## Execution Order

Tasks 1-2 are independent bug fixes — do first.
Tasks 3-5 are sequential (sequences).
Tasks 6-7 are independent (companies/events).
Task 8 is independent (contacts fix).
Task 9 is independent (inbox API).
Task 10 is independent (enrichment).
Tasks 11-12 are sequential (API routes then UI wiring).

**Parallelization:** Tasks 1+2, 3→4→5, 6, 7, 8, 9, 10, 11→12 — up to 6 parallel streams.
