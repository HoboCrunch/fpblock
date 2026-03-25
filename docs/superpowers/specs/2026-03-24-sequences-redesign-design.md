# Sequences Redesign — Full Email Pipeline

**Date:** 2026-03-24
**Status:** Draft

## Overview

Redesign the sequences page from a bare-bones list+detail into a full email generation, scheduling, and sending pipeline. Three-route architecture (`/admin/sequences`, `/admin/sequences/[id]`, `/admin/sequences/[id]/messages`) using the two-panel layout pattern established in the admin UX overhaul spec. Introduces a composable template editor (static text + variable interpolation + AI-generated blocks), dual send modes (auto-send / approval-required), three scheduling modes (relative / window / anchor), and full SendGrid integration with webhook-based delivery tracking.

Email-only for now. Multi-channel (LinkedIn, Twitter, Telegram) deferred to future work.

---

## Part 1: Sequences List View

**Route:** `/admin/sequences`

### Layout

Two-panel: center table (~70%) + right sidebar (~30%, 280–380px). Follows `TwoPanelLayout` pattern.

### Page Header

```
Sequences                                        [+ New Sequence]
```

New Sequence button opens a create modal (name, channel, event, initiative, send mode) then navigates to the detail page.

### Center Panel — Table Columns

| # | Column | Source | Width | Notes |
|---|--------|--------|-------|-------|
| 1 | Name | `sequence.name` | 180px | Linked to detail page |
| 2 | Channel | `sequence.channel` | 80px | Badge: email (indigo) |
| 3 | Status | `sequence.status` | 90px | Badge: draft (gray), active (green), paused (orange), completed (indigo) |
| 4 | Steps | `sequence.steps.length` | 60px | Count |
| 5 | Enrolled | enrollment count | 120px | "24 (18 active)" — total with active subset |
| 6 | Delivery | computed | 200px | Mini funnel: "18 sent · 14 opened · 3 replied" |
| 7 | Mode | `sequence.send_mode` | 90px | Badge: "Auto" (green) or "Approval" (orange) |
| 8 | Event | `sequence.event_id` → event name | 120px | Badge, blank if none |
| 9 | Next Send | earliest pending scheduled_at | 100px | Relative date, or "Paused" / "—" |
| 10 | Updated | `sequence.updated_at` | 90px | Relative date |

- **Default sort:** `updated_at` desc
- Row click navigates to `/admin/sequences/[id]`
- Checkbox selection for bulk actions

### Right Sidebar — Sections

**1. Search**
`GlassInput` — searches sequence name. Debounced 300ms.

**2. Filters** (collapsible groups)

*Sequence:*
- Status — multi-select: draft, active, paused, completed
- Mode — auto-send, approval-required
- Event — dropdown of events
- Initiative — dropdown of initiatives

*Enrollments:*
- Has Enrollments — yes/no toggle

**3. Active Filters** — chip row with × remove, "Clear all" when > 2 filters

**4. Selection Summary** — appears when ≥1 row checked:
```
3 selected · 42 total enrolled
[Activate] [Pause] [Delete]
```

**5. Sequence Preview** — populates on row hover/selection:
- Name, status badge, channel badge
- Step timeline (compact vertical: "Day 0: Initial → Day 3: Follow-up → Day 7: Break-up")
- Enrollment snapshot: active / completed / bounced counts
- Performance: open rate, reply rate
- Next scheduled send
- "View Details →" link

Preview behavior: 200ms hover debounce, stays visible when cursor enters preview card, no placeholder when empty.

---

## Part 2: Sequence Detail View

**Route:** `/admin/sequences/[id]`

### Layout

Two-panel: center panel (step editor + config) + right sidebar (enrollments, schedule, status).

### Center Panel

#### Header Strip

```
← Sequences    {Sequence Name}  [Draft ▾]  [Email]  [Auto-Send / Approval]     [▶ Activate]
```

- Back link to list
- Inline-editable name (click to edit)
- Status dropdown (draft / active / paused / completed) — changing to active triggers validation: must have ≥1 step, ≥1 enrollment
- Channel badge (read-only, email only for now)
- Send mode toggle
- Sender profile dropdown (from `sender_profiles` table) — required before activation
- Primary action button changes contextually: Draft → "Activate", Active → "Pause", Paused → "Resume"

#### Section 1: Steps Timeline

Vertical timeline extending the current `step-editor.tsx` pattern with enhanced cards:

```
● Step 1 — Initial                                          Day 0
  ┃  Subject: [composable template field]
  ┃  Body:    [composable template editor]
  ┃
  ┃  Stats: 24 sent · 18 opened (75%) · 3 replied (12.5%)
  ┃
● Step 2 — Follow Up                                       +3 days
  ┃  Subject: [composable template field]
  ┃  Body:    [composable template editor]
  ┃
  ┃  Stats: 18 sent · 12 opened (67%) · 2 replied (11%)
  ┃
● Step 3 — Break Up                                        +7 days
   Subject: [composable template field]
   Body:    [composable template editor]

   Stats: 14 sent · 9 opened (64%) · 1 replied (7%)

[+ Add Step]
```

- Each step is a `GlassCard`
- Delay shows relative to previous step ("Day 0", "+3 days", "+7 days")
- Delay editable via inline number input
- Action type selectable via dropdown (initial, follow_up, break_up)
- Steps reorderable via drag handles or up/down arrows
- Delete step via × button (confirmation if sequence is active)
- Per-step stats only render if the sequence has sent messages — shows delivery funnel for that step

**Editing active sequences:** Changes to copy on active sequences take effect for future sends only. A warning banner appears: "This sequence is active. Changes apply to future messages only — already-sent or scheduled messages are not affected."

#### Section 2: Schedule Configuration

`GlassCard` below the steps timeline. Shows scheduling controls based on timing mode:

```
Timing Mode    [Relative ▾]

─── Relative (current) ───
Step delays are days after enrollment. Sends as soon as due.

─── Window ───
Send Window
Days:     [☑ Mon] [☑ Tue] [☑ Wed] [☑ Thu] [☑ Fri] [☐ Sat] [☐ Sun]
Hours:    [9] to [17]
Timezone: [Europe/Paris ▾]

─── Anchor ───
Anchor Date:     [2026-07-08]     (e.g., event start date)
Direction:       [Before ▾]       (steps count down to anchor)
```

Timing mode semantics: "Relative" sends immediately when due. "Window" adds send window constraints to relative delays. "Anchor" uses calendar-driven dates with optional send window constraints. See Part 6 for details.

### Right Sidebar

**Section 1: Enrollment Summary** (`GlassCard`)
```
Enrollments
Active: 18
Completed: 4
Paused: 2
Bounced: 1
Total: 25

[Enroll Persons] [View Messages →]
```

- "Enroll Persons" opens a search modal (reuses existing `enrollment-panel.tsx` search)
- "View Messages →" navigates to `/admin/sequences/[id]/messages`

**Section 2: Schedule Overview** (`GlassCard`)
```
Schedule
Mode: Auto-Send
Timing: Anchor (July 8, 2026)
Window: Mon–Fri, 9am–5pm CET
Next send: Tomorrow, 9:00 AM

Pending: 12 messages
Scheduled: 6 messages
```

Compact summary of the schedule config from the center panel.

**Section 3: Performance** (`GlassCard`)
```
Performance
Sent: 32
Delivered: 30 (94%)
Opened: 18 (56%)
Clicked: 8 (25%)
Replied: 4 (12.5%)
Bounced: 2 (6%)
```

Color-coded progress bars for each metric. Only shown if the sequence has sent messages.

**Section 4: Activity Log**
Compact chronological feed of recent events:
```
Mar 24, 2:15 PM — 6 messages sent (Step 2)
Mar 24, 9:00 AM — 12 messages generated
Mar 23, 3:30 PM — 3 replies received
Mar 21, 9:00 AM — Sequence activated
```

Most recent first, scrollable, limit 20 entries.

---

## Part 3: Message Queue

**Route:** `/admin/sequences/[id]/messages`

### Layout

Two-panel: center panel (message table with inline expansion) + right sidebar (stats, filters, batch actions, generation controls).

### Center Panel

#### Header Strip

```
← {Sequence Name}    Messages    [All | Pending | Approved | Sent | Failed]
```

Tab-style status filter for quick switching.

#### Message Table

| # | Column | Source | Width | Notes |
|---|--------|--------|-------|-------|
| 1 | Recipient | person.full_name | 180px | Linked to person detail, shows title @ org below name |
| 2 | Step | step_number + action_type | 100px | "Step 1 · Initial" |
| 3 | Subject | rendered subject | 200px | Truncated 40ch |
| 4 | Status | interaction.status | 100px | Badge: draft (gray), scheduled (indigo), sending (orange pulse), sent (green), delivered (green), opened (blue), clicked (teal), replied (purple), bounced (red), failed (red) |
| 5 | Scheduled | interaction.scheduled_at | 110px | Date/time, or "Awaiting approval" for approval-mode drafts |
| 6 | Sent | interaction.occurred_at | 110px | Date/time when actually sent, blank if not yet |
| 7 | Engagement | computed | 100px | Icon cluster: Eye (opened), Reply (replied), Link (clicked) — colored if yes, absent if no |

**Default sort:** `scheduled_at` asc (upcoming first).

#### Row Expansion

Clicking a row expands inline to show the full rendered message (subject + body). From the expanded view:

- **Edit** — Opens the message body in an editable textarea. Changes save to the interaction record. Only available for draft/scheduled status.
- **Approve** — (Approval-mode sequences only) Moves from draft → scheduled. Assigns the next valid send window time.
- **Reject** — Removes the draft and advances enrollment to the next step (`current_step + 1`). If all steps are exhausted, enrollment completes normally with `status: 'completed'`.
- **Resend** — For failed/bounced messages, re-queue for sending.
- **Cancel** — For scheduled messages, pulls back to draft.

### Right Sidebar

**1. Stats Summary** (always visible)
```
Total: 72
Pending Approval: 12
Scheduled: 24
Sent: 32
Opened: 18 (56%)
Replied: 4 (12.5%)
Bounced: 2
Failed: 2
```
Compact stat rows with color-coded counts.

**2. Filters**
- Step — dropdown (Step 1, Step 2, Step 3...)
- Status — multi-select
- Recipient search — GlassInput
- Date range — scheduled_at from/to

**3. Batch Actions** — appears when rows are checked:
```
8 selected
[Approve All] [Reject All] [Reschedule ▾]
```
- Approve All: bulk approve drafts
- Reject All: bulk skip
- Reschedule: date/time picker to move scheduled sends

**4. Generation Controls** — for generating the next batch:
```
Generate Messages
Step: [Step 2 ▾]
For:  [All pending enrollments ▾]
[Generate 18 Messages]
```
Triggers message generation for enrollments that haven't had messages created for a given step yet. In auto-send mode this happens automatically; in approval mode this is how you manually trigger a batch to review.

---

## Part 4: Composable Template Editor

The core new UI component. Replaces plain textarea in step editor with a block-based input.

### Block Types

**1. Text Block**
Regular typed text with inline variable tokens. Variables render as styled chips within the text. Typing `{` or clicking an insert button opens the variable picker.

**2. AI Block**
A distinct card within the editor that expands to generated content at render time:
```
🤖 AI Generate
Prompt: "Write a 2-sentence personalized hook about {person.full_name}'s
         role as {person.title} at {org.name}, referencing their {event.role}
         at {event.name}. Tone: casual, no blockchain jargon."
Max length: 100 words
```

- Configurable prompt (which itself supports variable interpolation)
- Max token / length constraint
- Optional tone directive (pulled from `CompanyContext.language_rules` by default)
- Uses Gemini for generation at render time

### Variable Picker

Triggered by typing `{` in any text field or clicking the insert button. Dropdown grouped by entity:

- **Person:** first_name, full_name, title, seniority, department, email, linkedin_url, bio
- **Organization:** name, category, icp_score, icp_reason, usp, context, website
- **Event:** name, date_start, location
- **Sender:** name, email, signature

Variables render as inline chips: `{person.first_name}` shows as a styled badge within the text.

### Preview

Preview button per step opens a modal showing the rendered message for a sample enrollment. User can select which enrolled person to preview for. AI blocks show generated output. Sender variables resolve from the sequence's configured `sender_id` — if no sender profile is set, a warning appears: "Configure a sender profile to preview sender variables." This is the QA mechanism before activating a sequence.

### AI Block Failure Handling

If Gemini generation fails for an AI block during message generation (rate limit, timeout, content policy), the interaction is created with `status: 'failed'` and `detail.error` describing the failure. The message appears in the queue with a "Generation Failed" badge. From there, the user can:
- **Regenerate** — retry the AI generation
- **Edit** — manually write the content to replace the failed AI block
- **Reject** — skip this message and advance the enrollment

### Template Storage Format

```typescript
interface ComposableTemplate {
  blocks: TemplateBlock[];
}

type TemplateBlock =
  | { type: 'text'; content: string }
  | { type: 'ai'; prompt: string; max_tokens?: number; tone?: string }
```

Variable tokens (`{person.first_name}`) live within text block `content` strings and AI block `prompt` strings. Resolved at render time by the template renderer.

---

## Part 5: Sending Pipeline

### Architecture

```
Enrollment due → Generate message → interaction (status: draft)
                                          │
                    ┌─────────────────────┤
                    │                     │
              Auto-send mode       Approval mode
                    │                     │
                    ▼                     ▼
            Schedule immediately    Sit as draft in queue
                    │                     │
                    │              Human approves
                    │                     │
                    ▼                     ▼
            interaction (status: scheduled, scheduled_at set)
                    │
                    ▼
            Cron job picks up (checks sending window)
                    │
                    ▼
            SendGrid API call → status: sending
                    │
              ┌─────┴─────┐
              │            │
           Success      Failure
              │            │
              ▼            ▼
         status: sent   status: failed
              │         (retry up to 3x)
              │
              ▼
         SendGrid webhooks update:
         delivered → opened → clicked → replied
```

### SendGrid Integration

**Module:** `lib/sendgrid.ts`
- Wraps SendGrid v3 API for single email sends
- Uses `SENDGRID_API_KEY` env var
- From address from `SenderProfile.email`
- Tracks SendGrid `message_id` in `interaction.detail` JSONB for webhook correlation

### Message Generation Job: `POST /api/sequences/generate`

- Finds active enrollments in active sequences where the current step hasn't had a message generated yet
- Checks delay timing: cumulative delay from enrollment date (relative mode) or from anchor date (anchor mode)
- Renders templates: substitutes variables from person/org/event data, calls Gemini for AI blocks
- Creates `interaction` records with rendered subject/body
- Auto-send mode: sets `status: scheduled` with `scheduled_at` based on next valid send window
- Approval mode: sets `status: draft`

### Sending Job: `POST /api/sequences/send`

- Runs every 5 minutes (requires Vercel Pro for cron scheduling, or use external cron service like Upstash QStash)
- Queries interactions where `status = 'scheduled'` AND `scheduled_at <= now()`
- Checks sending window constraints (weekday/hour check if window configured)
- Sends via SendGrid, updates status to `sending` then `sent`
- Handles rate limiting: batch size cap of 50 per run
- Failed sends retried up to 3 times with exponential backoff (tracked in `detail.retry_count`)

### SendGrid Webhooks: `POST /api/webhooks/sendgrid`

- Receives delivery events: delivered, open, click, bounce, dropped, spam_report
- Matches via `message_id` stored in `interaction.detail.sendgrid_message_id`
- Updates `interaction.status` accordingly
- Bounce handling: updates interaction to `bounced`, updates enrollment to `bounced`, optionally flags person's email as invalid
- Webhook signature verification via SendGrid's signed event webhook v3

### Generation + Send Decoupling

Generation and sending are separate jobs. Generation can run ahead of send time (e.g., generate tomorrow's messages tonight for review). This enables the approval workflow: generate a batch → human reviews in the message queue → approves → messages become scheduled → cron sends them.

---

## Part 6: Scheduling Model

### Three Timing Modes

Stored on the sequence in `schedule_config` JSONB:

```typescript
interface SequenceSchedule {
  timing_mode: 'relative' | 'window' | 'anchor';

  // Send window: optional constraints, respected when timing_mode is 'window' or 'anchor'
  // Ignored when timing_mode is 'relative' (sends immediately when due)
  send_window?: {
    days: ('mon'|'tue'|'wed'|'thu'|'fri'|'sat'|'sun')[];
    start_hour: number;  // 0-23
    end_hour: number;
    timezone: string;    // e.g., "Europe/Paris"
  };

  // Anchor: calendar-driven, only used when timing_mode is 'anchor'
  anchor_date?: string;          // ISO date (e.g., event start)
  anchor_direction?: 'before' | 'after';
}
```

**Relative** (default): Step delays are days after enrollment. Sends immediately when due. `send_window` is ignored even if present.

**Window**: Same delay logic as relative, but sends are constrained to the configured `send_window`. If a message comes due Saturday and window is Mon–Fri 9–17, it queues for Monday 9am.

**Anchor**: Step delays are days before/after the anchor date. Step 1 at delay_days=30 with direction "before" = anchor_date minus 30 days. If linked to an event, anchor_date can auto-populate from `events.date_start`. Respects `send_window` if configured (anchor sets the target dates, window constrains the delivery times).

---

## Part 7: Data Model Changes

### `sequences` Table — New Columns

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `send_mode` | text | `'approval'` | `'auto'` or `'approval'` |
| `sender_id` | uuid, nullable | null | FK → `sender_profiles.id` |
| `schedule_config` | jsonb | `'{}'` | `SequenceSchedule` object |

Migration 02X adds these columns. No new tables needed.

### `interactions` Table — New Fields in `detail` JSONB

| Key | Type | Notes |
|-----|------|-------|
| `sendgrid_message_id` | string | For webhook correlation |
| `retry_count` | number | Failed send retry tracking, max 3 |
| `ai_blocks_used` | boolean | Whether AI generation was used |
| `generated_at` | string | ISO timestamp of when message was rendered |

### `SequenceStep` — Enhanced Type

```typescript
interface SequenceStep {
  step_number: number;
  delay_days: number;
  action_type: 'initial' | 'follow_up' | 'break_up';
  subject_template: ComposableTemplate;  // was string | null
  body_template: ComposableTemplate;     // was string
  // prompt_template_id is removed — its functionality is replaced by AI blocks in ComposableTemplate
}

interface ComposableTemplate {
  blocks: TemplateBlock[];
}

type TemplateBlock =
  | { type: 'text'; content: string }
  | { type: 'ai'; prompt: string; max_tokens?: number; tone?: string }
```

Note: `subject_template` is `ComposableTemplate | null` — null means no subject (unlikely for email but preserves the existing nullable pattern).

**Migration path:** Existing string templates get wrapped as `{ blocks: [{ type: 'text', content: existingString }] }`. Null subject templates remain null. A one-time migration script handles this.

### New API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/sequences/generate` | POST | Generate messages for due enrollments |
| `/api/sequences/send` | POST | Send scheduled messages via SendGrid |
| `/api/sequences/[id]/messages` | GET | Fetch rendered messages for a sequence |
| `/api/sequences/[id]/messages/[msgId]` | PATCH | Edit/approve/reject a message |
| `/api/sequences/[id]/messages/bulk` | POST | Bulk approve/reject/reschedule |
| `/api/sequences/[id]/preview` | POST | Preview a rendered step for a specific person |
| `/api/webhooks/sendgrid` | POST | Receive SendGrid delivery events |

---

## Part 8: File Decomposition

### Pages

```
app/admin/sequences/
  page.tsx                          — Server: fetch sequences + enrollment/delivery stats
  sequence-list-client.tsx          — Rewrite: two-panel list view
  [id]/
    page.tsx                        — Server: fetch sequence + enrollments + stats
    sequence-detail-client.tsx      — Two-panel detail view
    messages/
      page.tsx                      — Server: fetch messages for sequence
      message-queue-client.tsx      — Two-panel message queue
```

### Components

```
components/admin/
  composable-template-editor.tsx    — Block-based editor (text + variables + AI blocks)
  variable-picker.tsx               — Dropdown grouped by entity for inserting {tokens}
  ai-block-editor.tsx               — Config card for AI generation blocks
  message-preview-modal.tsx         — Renders a template for a sample person
  sequence-preview.tsx              — Compact sidebar preview card
  step-editor.tsx                   — Extend existing: composable templates, stats, reorder
  enrollment-panel.tsx              — Extend existing: schedule info, status breakdown
```

### API Routes

```
app/api/sequences/
  generate/route.ts                 — Message generation job
  send/route.ts                     — Sending job (cron-triggered)
  [id]/messages/route.ts            — GET messages for sequence
  [id]/messages/bulk/route.ts       — POST bulk approve/reject/reschedule
  [id]/messages/[msgId]/route.ts    — PATCH single message
  [id]/preview/route.ts             — POST preview render
app/api/webhooks/
  sendgrid/route.ts                 — Delivery event handler
```

### Lib

```
lib/sendgrid.ts                     — SendGrid API wrapper
lib/template-renderer.ts            — Resolves ComposableTemplate → rendered string
```

### Existing Files Modified

- `components/admin/step-editor.tsx` — Replace textarea with ComposableTemplateEditor
- `app/admin/sequences/[id]/enrollment-panel.tsx` — Add schedule/status info
- `lib/types/database.ts` — Extend `Sequence` interface with `send_mode: 'auto' | 'approval'`, `sender_id: string | null`, `schedule_config: SequenceSchedule`; add `'clicked'` to `InteractionStatus`; add SequenceSchedule, ComposableTemplate, TemplateBlock types; update SequenceStep
- `app/admin/sequences/actions.ts` — Extend with new server actions

### Components Reused

- `TwoPanelLayout`, `GlassCard`, `GlassInput`, `GlassSelect`, `Badge`, `Tabs`
- `InteractionsTimeline` (on detail page)
- Lucide icons: Mail, Clock, Play, Pause, Square, Send, Eye, Reply, AlertCircle, ChevronDown, Plus, Trash2, GripVertical, Sparkles (AI blocks), Link, Calendar, SlidersHorizontal

---

## Part 9: Responsive Behavior

| Breakpoint | Layout |
|-----------|--------|
| ≥ 1280px | Full two-panel, sidebar visible |
| 1024–1279px | Two-panel, sidebar narrower (280px) |
| < 1024px | Single column, sidebar becomes slide-out drawer |

Follows the same responsive pattern as the admin UX overhaul spec:
- Drawer triggered by SlidersHorizontal icon button
- Overlays content with backdrop
- Close on backdrop click or × button
- Table columns hide lower-priority columns (Delivery, Event, Updated) at narrow widths
- Horizontal scroll enabled on tables

---

## Part 10: Interaction Summary

1. **User opens `/admin/sequences`** → List view with all sequences, sidebar filters + preview
2. **User clicks "+ New Sequence"** → Create modal (name, channel, event, send mode) → navigates to detail
3. **User builds steps** → Composable template editor with variables and AI blocks per step
4. **User configures schedule** → Picks timing mode, sets window/anchor as needed
5. **User enrolls persons** → Via sidebar enrollment panel (search + add)
6. **User previews** → Preview button renders a sample message for a selected person
7. **User activates** → Validation passes → sequence goes active
8. **Generation job runs** → Creates interaction drafts (auto-send: scheduled, approval: draft)
9. **User reviews messages** (approval mode) → Message queue, expand/edit/approve/reject
10. **Send job runs** → Picks up scheduled messages within send window, sends via SendGrid
11. **Webhooks update** → Delivery status flows back: delivered → opened → clicked → replied
12. **User monitors** → Detail sidebar shows performance stats, activity log
13. **User edits live sequence** → Changes apply to future messages only, warning banner shown
14. **User pauses/resumes** → Pausing holds all pending sends, resuming re-queues them
