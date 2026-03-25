# Sequences Redesign — Full Email Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a full email generation, scheduling, and sending pipeline with composable templates, dual send modes, three scheduling modes, and SendGrid integration.

**Architecture:** Three-route app (`/admin/sequences`, `/admin/sequences/[id]`, `/admin/sequences/[id]/messages`) using two-panel layout. React Query for all client data fetching. Composable template engine (text blocks + variable interpolation + AI blocks). SendGrid for email delivery with webhook-based tracking. Cron jobs for generation and sending.

**Tech Stack:** Next.js 14 (app router), Supabase (PostgreSQL), React Query v5, TanStack Virtual, SendGrid v3, Gemini (AI blocks), Tailwind CSS, glass-morphism component library.

**Spec:** `docs/superpowers/specs/2026-03-24-sequences-redesign-design.md`

**Commit strategy:** Single commit at end — no intermediate commits.

**Dependencies:** This plan consumes `TwoPanelLayout` from the admin UX overhaul plan and React Query/virtual-table infrastructure from the performance optimization plan. If those haven't landed yet, Tasks 1-2 bootstrap the minimum needed infrastructure.

---

## Dependency Graph

```
Task 1: Types & Migration ──────────────────────────┐
Task 2: React Query Infrastructure ──────────────────┤
                                                      ├──▶ Task 5: Query Hooks
Task 3: Template Renderer ──────────────┐             │
Task 4: SendGrid Lib ──────────────────┐│             │
                                        ││             │
Task 6: Variable Picker ───────┐        ││             │
Task 7: AI Block Editor ──────┤        ││             │
                               ▼        ││             │
Task 8: Composable Template Editor      ││             │
               │                        ││             │
               ▼                        ▼▼             ▼
Task 9: Step Editor Rewrite    Task 12: Generate API   Task 5
               │               Task 13: Send API       │
               │               Task 14: Webhook API    │
               ▼                        │              ▼
Task 10: Sequence Detail View           │    Task 11: Sequences List View
Task 15: Message Queue View ◀───────────┘
Task 16: Server Actions & Integration
```

**Parallelizable groups:**
- Group A (no deps): Tasks 1, 2, 3, 4, 6, 7
- Group B (after Group A): Tasks 5, 8, 12, 13, 14
- Group C (after Group B): Tasks 9, 10, 11, 15, 16

---

## Task 1: Types & Database Migration

**Files:**
- Modify: `lib/types/database.ts`
- Create: `supabase/migrations/02X_sequences_pipeline.sql` (use next migration number)

- [ ] **Step 1: Update TypeScript types**

In `lib/types/database.ts`, make these changes:

Add `'clicked'` to `InteractionStatus`:
```typescript
export type InteractionStatus =
  | "draft" | "scheduled" | "sending" | "sent" | "delivered"
  | "opened" | "clicked" | "replied" | "bounced" | "failed";
```

Add new types after the existing `SequenceStep`:
```typescript
export interface ComposableTemplate {
  blocks: TemplateBlock[];
}

export type TemplateBlock =
  | { type: 'text'; content: string }
  | { type: 'ai'; prompt: string; max_tokens?: number; tone?: string };

export interface SequenceSchedule {
  timing_mode: 'relative' | 'window' | 'anchor';
  send_window?: {
    days: ('mon'|'tue'|'wed'|'thu'|'fri'|'sat'|'sun')[];
    start_hour: number;
    end_hour: number;
    timezone: string;
  };
  anchor_date?: string;
  anchor_direction?: 'before' | 'after';
}
```

Update `SequenceStep`:
```typescript
export interface SequenceStep {
  step_number: number;
  delay_days: number;
  action_type: "initial" | "follow_up" | "break_up";
  subject_template: ComposableTemplate | null;
  body_template: ComposableTemplate;
}
```

Extend `Sequence` interface — add after `updated_at`:
```typescript
  send_mode: 'auto' | 'approval';
  sender_id: string | null;
  schedule_config: SequenceSchedule;
```

- [ ] **Step 2: Create database migration**

Find the next migration number by checking `supabase/migrations/`. Create the migration:

```sql
-- Add pipeline columns to sequences
ALTER TABLE sequences ADD COLUMN IF NOT EXISTS send_mode text NOT NULL DEFAULT 'approval';
ALTER TABLE sequences ADD COLUMN IF NOT EXISTS sender_id uuid REFERENCES sender_profiles(id);
ALTER TABLE sequences ADD COLUMN IF NOT EXISTS schedule_config jsonb NOT NULL DEFAULT '{}';

-- Migrate existing steps from string templates to ComposableTemplate format
-- This wraps existing string body_template/subject_template into { blocks: [{ type: 'text', content: '...' }] }
UPDATE sequences SET steps = (
  SELECT jsonb_agg(
    jsonb_set(
      jsonb_set(
        step,
        '{body_template}',
        CASE
          WHEN step->>'body_template' IS NOT NULL
          THEN jsonb_build_object('blocks', jsonb_build_array(jsonb_build_object('type', 'text', 'content', step->>'body_template')))
          ELSE '{"blocks": []}'::jsonb
        END
      ),
      '{subject_template}',
      CASE
        WHEN step->>'subject_template' IS NOT NULL
        THEN jsonb_build_object('blocks', jsonb_build_array(jsonb_build_object('type', 'text', 'content', step->>'subject_template')))
        ELSE 'null'::jsonb
      END
    ) - 'prompt_template_id'
  )
  FROM jsonb_array_elements(steps) AS step
)
WHERE steps IS NOT NULL AND jsonb_array_length(steps) > 0;
```

- [ ] **Step 3: Verify the app still compiles**

Run: `npx next build --no-lint 2>&1 | head -30`

The build will show type errors in existing sequence files since `SequenceStep` changed shape. That's expected — those files get rewritten in later tasks. Just confirm the types themselves are valid.

---

## Task 2: Extend React Query Infrastructure

**Files:**
- Modify: `lib/queries/query-keys.ts` (add sequences keys to existing factory)

**Note:** `lib/queries/query-provider.tsx`, `lib/queries/query-keys.ts`, and `@tanstack/react-query` already exist in the codebase. The provider is already mounted in the admin layout. This task only adds the sequences key namespace.

- [ ] **Step 1: Add sequences keys to existing query-keys.ts**

In `lib/queries/query-keys.ts`, add the `sequences` namespace to the existing `queryKeys` object (after `dashboard`):

```typescript
  sequences: {
    all: ["sequences"] as const,
    list: (filters?: Record<string, unknown>) => ["sequences", "list", filters] as const,
    detail: (id: string) => ["sequences", "detail", id] as const,
    messages: {
      all: (id: string) => ["sequences", "messages", id] as const,
      list: (id: string, filters?: Record<string, unknown>) => ["sequences", "messages", id, filters] as const,
    },
    stats: (id: string) => ["sequences", "stats", id] as const,
  },
```

Do NOT overwrite the existing keys (organizations, persons, enrichment, events, initiatives, savedLists, dashboard).

---

## Task 3: Template Renderer

**Files:**
- Create: `lib/template-renderer.ts`

This is a pure function module with no UI dependencies. It resolves `ComposableTemplate` → rendered string.

- [ ] **Step 1: Create the template renderer**

`lib/template-renderer.ts`:
```typescript
import { ComposableTemplate, TemplateBlock } from "@/lib/types/database";

export interface TemplateContext {
  person: Record<string, string | number | null>;
  org: Record<string, string | number | null>;
  event: Record<string, string | number | null>;
  sender: Record<string, string | null>;
}

/**
 * Resolves variable tokens like {person.first_name} in a string.
 * Unknown variables are left as-is.
 */
export function resolveVariables(text: string, ctx: TemplateContext): string {
  return text.replace(/\{(\w+)\.(\w+)\}/g, (match, entity, field) => {
    const group = ctx[entity as keyof TemplateContext];
    if (!group) return match;
    const value = group[field];
    return value != null ? String(value) : match;
  });
}

/**
 * Renders a ComposableTemplate to a string.
 * Text blocks get variable substitution.
 * AI blocks are replaced with preGenerated content if provided, otherwise marked as [AI_BLOCK_PENDING].
 */
export function renderTemplate(
  template: ComposableTemplate | null,
  ctx: TemplateContext,
  aiResults?: Map<number, string> // blockIndex → generated content
): string {
  if (!template || !template.blocks.length) return "";

  return template.blocks
    .map((block, i) => {
      if (block.type === "text") {
        return resolveVariables(block.content, ctx);
      }
      if (block.type === "ai") {
        const generated = aiResults?.get(i);
        if (generated) return generated;
        return "[AI_BLOCK_PENDING]";
      }
      return "";
    })
    .join("");
}

/**
 * Extracts all AI blocks from a template for batch generation.
 * Returns array of { index, prompt (with variables resolved) }.
 */
export function extractAiBlocks(
  template: ComposableTemplate | null,
  ctx: TemplateContext
): { index: number; prompt: string; max_tokens?: number; tone?: string }[] {
  if (!template) return [];
  return template.blocks
    .map((block, i) => {
      if (block.type !== "ai") return null;
      return {
        index: i,
        prompt: resolveVariables(block.prompt, ctx),
        max_tokens: block.max_tokens,
        tone: block.tone,
      };
    })
    .filter(Boolean) as { index: number; prompt: string; max_tokens?: number; tone?: string }[];
}

/**
 * Builds a TemplateContext from database records.
 */
export function buildContext(
  person: Record<string, unknown>,
  org: Record<string, unknown> | null,
  event: Record<string, unknown> | null,
  sender: Record<string, unknown> | null
): TemplateContext {
  const pick = (obj: Record<string, unknown> | null, ...keys: string[]) => {
    if (!obj) return {};
    const result: Record<string, string | number | null> = {};
    for (const k of keys) {
      const v = obj[k];
      result[k] = v == null ? null : typeof v === "number" ? v : String(v);
    }
    return result;
  };

  return {
    person: pick(
      person,
      "first_name", "full_name", "title", "seniority", "department",
      "email", "linkedin_url", "bio"
    ),
    org: pick(
      org,
      "name", "category", "icp_score", "icp_reason", "usp", "context", "website"
    ),
    event: pick(event, "name", "date_start", "location"),
    sender: pick(sender, "name", "email", "signature") as Record<string, string | null>,
  };
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit lib/template-renderer.ts 2>&1 | head -20`

---

## Task 4: SendGrid Library

**Files:**
- Create: `lib/sendgrid.ts`

- [ ] **Step 1: Create SendGrid wrapper**

`lib/sendgrid.ts`:
```typescript
interface SendEmailParams {
  to: string;
  from: { email: string; name: string };
  subject: string;
  html: string;
  replyTo?: string;
}

interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Send a single email via SendGrid v3 API.
 * Returns the x-message-id for webhook correlation.
 */
export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) {
    return { success: false, error: "SENDGRID_API_KEY not configured" };
  }

  try {
    const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: params.to }] }],
        from: { email: params.from.email, name: params.from.name },
        reply_to: params.replyTo ? { email: params.replyTo } : undefined,
        subject: params.subject,
        content: [{ type: "text/html", value: params.html }],
      }),
    });

    if (response.ok || response.status === 202) {
      const messageId = response.headers.get("x-message-id") || undefined;
      return { success: true, messageId };
    }

    const errorBody = await response.text();
    return { success: false, error: `SendGrid ${response.status}: ${errorBody}` };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

/**
 * Verify SendGrid webhook signature (Event Webhook v3).
 */
export function verifyWebhookSignature(
  publicKey: string,
  payload: string,
  signature: string,
  timestamp: string
): boolean {
  // SendGrid signed event webhook uses ECDSA
  // For MVP, we'll validate the timestamp is recent (within 5 min)
  // Full ECDSA verification requires the @sendgrid/eventwebhook package
  const now = Math.floor(Date.now() / 1000);
  const ts = parseInt(timestamp, 10);
  if (isNaN(ts) || Math.abs(now - ts) > 300) return false;
  // TODO: Add full ECDSA signature verification with @sendgrid/eventwebhook
  return true;
}
```

---

## Task 5: React Query Hooks

**Files:**
- Create: `lib/queries/use-sequences.ts`
- Create: `lib/queries/use-sequence-detail.ts`
- Create: `lib/queries/use-sequence-messages.ts`
- Create: `lib/queries/use-sequence-stats.ts`

**Depends on:** Tasks 1, 2

- [ ] **Step 1: Create `useSequences` hook**

`lib/queries/use-sequences.ts`:
```typescript
"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "./query-keys";
import type { Sequence } from "@/lib/types/database";

export interface SequenceFilters {
  search?: string;
  status?: string[];
  sendMode?: string;
  eventId?: string;
  initiativeId?: string;
  hasEnrollments?: boolean;
}

export interface SequenceWithStats extends Sequence {
  enrollment_count: number;
  active_enrollment_count: number;
  sent_count: number;
  opened_count: number;
  replied_count: number;
  next_send_at: string | null;
  event_name: string | null;
}

async function fetchSequences(filters: SequenceFilters): Promise<SequenceWithStats[]> {
  const supabase = createClient();

  // Fetch sequences
  let query = supabase.from("sequences").select("*").order("updated_at", { ascending: false });

  if (filters.status?.length) {
    query = query.in("status", filters.status);
  }
  if (filters.sendMode) {
    query = query.eq("send_mode", filters.sendMode);
  }
  if (filters.eventId) {
    query = query.eq("event_id", filters.eventId);
  }
  if (filters.initiativeId) {
    query = query.eq("initiative_id", filters.initiativeId);
  }

  const { data: sequences, error } = await query;
  if (error) throw error;
  if (!sequences?.length) return [];

  const ids = sequences.map((s) => s.id);

  // Parallel: enrollments + interactions + events
  const [enrollmentRes, interactionRes, eventRes] = await Promise.all([
    supabase
      .from("sequence_enrollments")
      .select("sequence_id, status")
      .in("sequence_id", ids),
    supabase
      .from("interactions")
      .select("sequence_id, status")
      .in("sequence_id", ids)
      .not("sequence_id", "is", null),
    supabase
      .from("events")
      .select("id, name")
      .in("id", sequences.map((s) => s.event_id).filter(Boolean) as string[]),
  ]);

  const eventMap = new Map((eventRes.data || []).map((e) => [e.id, e.name]));

  // Aggregate enrollments per sequence
  const enrollmentMap = new Map<string, { total: number; active: number }>();
  for (const e of enrollmentRes.data || []) {
    const current = enrollmentMap.get(e.sequence_id) || { total: 0, active: 0 };
    current.total++;
    if (e.status === "active") current.active++;
    enrollmentMap.set(e.sequence_id, current);
  }

  // Aggregate interactions per sequence
  const interactionMap = new Map<string, { sent: number; opened: number; replied: number }>();
  for (const i of interactionRes.data || []) {
    if (!i.sequence_id) continue;
    const current = interactionMap.get(i.sequence_id) || { sent: 0, opened: 0, replied: 0 };
    if (["sent", "delivered", "opened", "clicked", "replied"].includes(i.status)) current.sent++;
    if (["opened", "clicked", "replied"].includes(i.status)) current.opened++;
    if (i.status === "replied") current.replied++;
    interactionMap.set(i.sequence_id, current);
  }

  let result: SequenceWithStats[] = sequences.map((s) => ({
    ...s,
    enrollment_count: enrollmentMap.get(s.id)?.total || 0,
    active_enrollment_count: enrollmentMap.get(s.id)?.active || 0,
    sent_count: interactionMap.get(s.id)?.sent || 0,
    opened_count: interactionMap.get(s.id)?.opened || 0,
    replied_count: interactionMap.get(s.id)?.replied || 0,
    next_send_at: null, // computed in a future pass if needed
    event_name: s.event_id ? eventMap.get(s.event_id) || null : null,
  }));

  // Client-side search filter
  if (filters.search) {
    const q = filters.search.toLowerCase();
    result = result.filter((s) => s.name.toLowerCase().includes(q));
  }

  // Client-side enrollment filter
  if (filters.hasEnrollments === true) {
    result = result.filter((s) => s.enrollment_count > 0);
  } else if (filters.hasEnrollments === false) {
    result = result.filter((s) => s.enrollment_count === 0);
  }

  return result;
}

export function useSequences(filters: SequenceFilters = {}) {
  return useQuery({
    queryKey: queryKeys.sequences.list(filters),
    queryFn: () => fetchSequences(filters),
  });
}
```

- [ ] **Step 2: Create `useSequenceDetail` hook**

`lib/queries/use-sequence-detail.ts`:
```typescript
"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "./query-keys";
import type { Sequence, SequenceEnrollment } from "@/lib/types/database";

export interface SequenceDetail extends Sequence {
  enrollments: (SequenceEnrollment & {
    person: { id: string; full_name: string; email: string | null; title: string | null; photo_url: string | null };
    org_name: string | null;
  })[];
  event_name: string | null;
  initiative_name: string | null;
  sender_profile: { id: string; name: string; email: string | null } | null;
  delivery_stats: {
    sent: number;
    delivered: number;
    opened: number;
    clicked: number;
    replied: number;
    bounced: number;
    failed: number;
  };
  step_stats: Record<number, { sent: number; opened: number; replied: number }>;
}

async function fetchSequenceDetail(id: string): Promise<SequenceDetail> {
  const supabase = createClient();

  const [seqRes, enrollRes, interactionRes] = await Promise.all([
    supabase.from("sequences").select("*").eq("id", id).single(),
    supabase
      .from("sequence_enrollments")
      .select("*, persons(id, full_name, email, title, photo_url)")
      .eq("sequence_id", id)
      .order("enrolled_at", { ascending: false }),
    supabase
      .from("interactions")
      .select("status, sequence_step")
      .eq("sequence_id", id),
  ]);

  if (seqRes.error) throw seqRes.error;
  const seq = seqRes.data;

  // Resolve event, initiative, sender in parallel
  const [eventRes, initRes, senderRes] = await Promise.all([
    seq.event_id
      ? supabase.from("events").select("name").eq("id", seq.event_id).single()
      : Promise.resolve({ data: null }),
    seq.initiative_id
      ? supabase.from("initiatives").select("name").eq("id", seq.initiative_id).single()
      : Promise.resolve({ data: null }),
    seq.sender_id
      ? supabase.from("sender_profiles").select("id, name, email").eq("id", seq.sender_id).single()
      : Promise.resolve({ data: null }),
  ]);

  // Compute delivery stats
  const stats = { sent: 0, delivered: 0, opened: 0, clicked: 0, replied: 0, bounced: 0, failed: 0 };
  const stepStats: Record<number, { sent: number; opened: number; replied: number }> = {};

  for (const i of interactionRes.data || []) {
    if (["sent", "delivered", "opened", "clicked", "replied"].includes(i.status)) stats.sent++;
    if (["delivered", "opened", "clicked", "replied"].includes(i.status)) stats.delivered++;
    if (["opened", "clicked", "replied"].includes(i.status)) stats.opened++;
    if (["clicked", "replied"].includes(i.status)) stats.clicked++;
    if (i.status === "replied") stats.replied++;
    if (i.status === "bounced") stats.bounced++;
    if (i.status === "failed") stats.failed++;

    if (i.sequence_step != null) {
      const ss = stepStats[i.sequence_step] || { sent: 0, opened: 0, replied: 0 };
      if (["sent", "delivered", "opened", "clicked", "replied"].includes(i.status)) ss.sent++;
      if (["opened", "clicked", "replied"].includes(i.status)) ss.opened++;
      if (i.status === "replied") ss.replied++;
      stepStats[i.sequence_step] = ss;
    }
  }

  // Build enrollments with person + org
  const enrollments = (enrollRes.data || []).map((e: any) => ({
    ...e,
    person: e.persons || { id: e.person_id, full_name: "Unknown", email: null, title: null, photo_url: null },
    org_name: null, // Resolved lazily if needed
  }));

  return {
    ...seq,
    enrollments,
    event_name: eventRes.data?.name || null,
    initiative_name: initRes.data?.name || null,
    sender_profile: senderRes.data || null,
    delivery_stats: stats,
    step_stats: stepStats,
  };
}

export function useSequenceDetail(id: string) {
  return useQuery({
    queryKey: queryKeys.sequences.detail(id),
    queryFn: () => fetchSequenceDetail(id),
    enabled: !!id,
  });
}
```

- [ ] **Step 3: Create `useSequenceMessages` hook**

`lib/queries/use-sequence-messages.ts`:
```typescript
"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "./query-keys";

export interface MessageFilters {
  status?: string[];
  step?: number;
  search?: string;
  scheduledFrom?: string;
  scheduledTo?: string;
}

export interface SequenceMessage {
  id: string;
  person_id: string;
  person_name: string;
  person_title: string | null;
  person_org: string | null;
  sequence_step: number;
  subject: string | null;
  body: string | null;
  status: string;
  scheduled_at: string | null;
  occurred_at: string | null;
  detail: Record<string, unknown> | null;
}

async function fetchMessages(
  sequenceId: string,
  filters: MessageFilters
): Promise<SequenceMessage[]> {
  const supabase = createClient();

  let query = supabase
    .from("interactions")
    .select("*, persons(full_name, title)")
    .eq("sequence_id", sequenceId)
    .order("scheduled_at", { ascending: true, nullsFirst: false });

  if (filters.status?.length) {
    query = query.in("status", filters.status);
  }
  if (filters.step != null) {
    query = query.eq("sequence_step", filters.step);
  }
  if (filters.scheduledFrom) {
    query = query.gte("scheduled_at", filters.scheduledFrom);
  }
  if (filters.scheduledTo) {
    query = query.lte("scheduled_at", filters.scheduledTo);
  }

  const { data, error } = await query;
  if (error) throw error;

  let messages: SequenceMessage[] = (data || []).map((i: any) => ({
    id: i.id,
    person_id: i.person_id,
    person_name: i.persons?.full_name || "Unknown",
    person_title: i.persons?.title || null,
    person_org: null, // Could be resolved if needed
    sequence_step: i.sequence_step ?? 0,
    subject: i.subject,
    body: i.body,
    status: i.status,
    scheduled_at: i.scheduled_at,
    occurred_at: i.occurred_at,
    detail: i.detail,
  }));

  if (filters.search) {
    const q = filters.search.toLowerCase();
    messages = messages.filter(
      (m) =>
        m.person_name.toLowerCase().includes(q) ||
        m.subject?.toLowerCase().includes(q)
    );
  }

  return messages;
}

export function useSequenceMessages(sequenceId: string, filters: MessageFilters = {}) {
  return useQuery({
    queryKey: queryKeys.sequences.messages.list(sequenceId, filters),
    queryFn: () => fetchMessages(sequenceId, filters),
    enabled: !!sequenceId,
    refetchInterval: (query) => {
      const msgs = query.state.data ?? [];
      const hasPending = msgs.some(
        (m) => m.status === "sending" || m.status === "scheduled"
      );
      return hasPending ? 10_000 : false;
    },
  });
}
```

- [ ] **Step 4: Create `useSequenceStats` hook**

`lib/queries/use-sequence-stats.ts`:
```typescript
"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "./query-keys";

export interface SequenceStats {
  total: number;
  draft: number;
  scheduled: number;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  replied: number;
  bounced: number;
  failed: number;
}

async function fetchStats(sequenceId: string): Promise<SequenceStats> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("interactions")
    .select("status")
    .eq("sequence_id", sequenceId);

  if (error) throw error;

  const stats: SequenceStats = {
    total: 0, draft: 0, scheduled: 0, sent: 0, delivered: 0,
    opened: 0, clicked: 0, replied: 0, bounced: 0, failed: 0,
  };

  for (const i of data || []) {
    stats.total++;
    if (i.status in stats) {
      stats[i.status as keyof SequenceStats]++;
    }
  }

  return stats;
}

export function useSequenceStats(sequenceId: string) {
  return useQuery({
    queryKey: queryKeys.sequences.stats(sequenceId),
    queryFn: () => fetchStats(sequenceId),
    enabled: !!sequenceId,
  });
}
```

---

## Task 6: Variable Picker Component

**Files:**
- Create: `components/admin/variable-picker.tsx`

**Depends on:** Task 1 (types)

- [ ] **Step 1: Create the variable picker**

`components/admin/variable-picker.tsx` — Dropdown grouped by entity, triggered by `{` keystroke or button click. Inserts variable token at cursor position.

```typescript
"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const VARIABLE_GROUPS = {
  person: [
    "first_name", "full_name", "title", "seniority", "department",
    "email", "linkedin_url", "bio",
  ],
  org: ["name", "category", "icp_score", "icp_reason", "usp", "context", "website"],
  event: ["name", "date_start", "location"],
  sender: ["name", "email", "signature"],
} as const;

interface VariablePickerProps {
  onSelect: (variable: string) => void; // e.g. "{person.first_name}"
  trigger?: "button" | "inline"; // button = explicit click, inline = positioned dropdown
  position?: { top: number; left: number }; // for inline mode
  onClose?: () => void;
}

export function VariablePicker({ onSelect, trigger = "button", position, onClose }: VariablePickerProps) {
  const [open, setOpen] = useState(trigger === "inline");
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        onClose?.();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, onClose]);

  const filteredGroups = Object.entries(VARIABLE_GROUPS).map(([group, vars]) => ({
    group,
    vars: vars.filter((v) =>
      search ? `${group}.${v}`.toLowerCase().includes(search.toLowerCase()) : true
    ),
  })).filter((g) => g.vars.length > 0);

  const handleSelect = (group: string, variable: string) => {
    onSelect(`{${group}.${variable}}`);
    setOpen(false);
    setSearch("");
    onClose?.();
  };

  if (trigger === "button" && !open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs px-2 py-1 rounded glass hover:bg-white/[0.05] text-[var(--text-secondary)] flex items-center gap-1"
      >
        {"{}"} Insert Variable <ChevronDown className="w-3 h-3" />
      </button>
    );
  }

  return (
    <div
      ref={ref}
      className="absolute z-50 w-64 max-h-72 overflow-y-auto rounded-lg glass border border-white/[0.06] shadow-xl"
      style={position ? { top: position.top, left: position.left } : undefined}
    >
      <div className="p-2 border-b border-white/[0.06]">
        <input
          type="text"
          placeholder="Search variables..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-transparent text-sm text-white placeholder:text-[var(--text-muted)] outline-none"
          autoFocus
        />
      </div>
      {filteredGroups.map(({ group, vars }) => (
        <div key={group}>
          <div className="px-3 py-1.5 text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">
            {group}
          </div>
          {vars.map((v) => (
            <button
              key={`${group}.${v}`}
              onClick={() => handleSelect(group, v)}
              className="w-full px-3 py-1.5 text-sm text-left text-[var(--text-secondary)] hover:bg-white/[0.05] hover:text-white"
            >
              <span className="font-mono text-xs text-[var(--accent-orange)]">{`{${group}.${v}}`}</span>
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
```

---

## Task 7: AI Block Editor Component

**Files:**
- Create: `components/admin/ai-block-editor.tsx`

**Depends on:** Task 1 (types)

- [ ] **Step 1: Create the AI block editor**

`components/admin/ai-block-editor.tsx` — Config card for an AI generation block within the composable template.

```typescript
"use client";

import { Sparkles, Trash2 } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassInput } from "@/components/ui/glass-input";
import { VariablePicker } from "./variable-picker";
import type { TemplateBlock } from "@/lib/types/database";

interface AiBlockEditorProps {
  block: Extract<TemplateBlock, { type: "ai" }>;
  onChange: (block: Extract<TemplateBlock, { type: "ai" }>) => void;
  onDelete: () => void;
}

export function AiBlockEditor({ block, onChange, onDelete }: AiBlockEditorProps) {
  const insertVariable = (variable: string) => {
    onChange({ ...block, prompt: block.prompt + variable });
  };

  return (
    <GlassCard className="border border-[var(--accent-orange)]/20 relative">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="w-4 h-4 text-[var(--accent-orange)]" />
        <span className="text-sm font-medium text-[var(--accent-orange)]">AI Generate</span>
        <div className="flex-1" />
        <VariablePicker onSelect={insertVariable} />
        <button
          onClick={onDelete}
          className="p-1 rounded hover:bg-white/[0.05] text-[var(--text-muted)] hover:text-red-400"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="space-y-3">
        <div>
          <label className="text-xs text-[var(--text-muted)] mb-1 block">Prompt</label>
          <textarea
            value={block.prompt}
            onChange={(e) => onChange({ ...block, prompt: e.target.value })}
            rows={3}
            className="w-full bg-white/[0.03] rounded-lg px-3 py-2 text-sm text-white placeholder:text-[var(--text-muted)] outline-none border border-white/[0.06] focus:border-[var(--accent-orange)]/30 resize-y"
            placeholder="Write a 2-sentence personalized hook about {person.full_name}..."
          />
        </div>
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="text-xs text-[var(--text-muted)] mb-1 block">Max words</label>
            <GlassInput
              type="number"
              value={block.max_tokens || ""}
              onChange={(e) =>
                onChange({ ...block, max_tokens: e.target.value ? parseInt(e.target.value) : undefined })
              }
              placeholder="100"
            />
          </div>
          <div className="flex-1">
            <label className="text-xs text-[var(--text-muted)] mb-1 block">Tone override</label>
            <GlassInput
              value={block.tone || ""}
              onChange={(e) => onChange({ ...block, tone: e.target.value || undefined })}
              placeholder="casual, professional..."
            />
          </div>
        </div>
      </div>
    </GlassCard>
  );
}
```

---

## Task 8: Composable Template Editor

**Files:**
- Create: `components/admin/composable-template-editor.tsx`

**Depends on:** Tasks 6, 7

- [ ] **Step 1: Create the composable template editor**

`components/admin/composable-template-editor.tsx` — Block-based editor that combines text blocks with variable interpolation and AI blocks.

```typescript
"use client";

import { useRef, useState, useCallback } from "react";
import { Plus, Sparkles, Type } from "lucide-react";
import { VariablePicker } from "./variable-picker";
import { AiBlockEditor } from "./ai-block-editor";
import type { ComposableTemplate, TemplateBlock } from "@/lib/types/database";

interface ComposableTemplateEditorProps {
  value: ComposableTemplate | null;
  onChange: (template: ComposableTemplate) => void;
  placeholder?: string;
  singleLine?: boolean; // For subject fields — only text blocks, no AI
}

export function ComposableTemplateEditor({
  value,
  onChange,
  placeholder = "Type your message...",
  singleLine = false,
}: ComposableTemplateEditorProps) {
  const blocks = value?.blocks ?? [];
  const [showVariablePicker, setShowVariablePicker] = useState<number | null>(null);
  const textareaRefs = useRef<Map<number, HTMLTextAreaElement>>(new Map());

  // Stable keys for blocks — avoid index keys per perf spec.
  // useRef persists IDs across renders; new blocks get new IDs.
  const blockIdsRef = useRef<string[]>([]);
  if (blockIdsRef.current.length !== blocks.length) {
    blockIdsRef.current = blocks.map((_, i) => blockIdsRef.current[i] || crypto.randomUUID());
  }

  const updateBlock = useCallback(
    (index: number, block: TemplateBlock) => {
      const newBlocks = [...blocks];
      newBlocks[index] = block;
      onChange({ blocks: newBlocks });
    },
    [blocks, onChange]
  );

  const removeBlock = useCallback(
    (index: number) => {
      const newBlocks = blocks.filter((_, i) => i !== index);
      // If removing leaves empty, add a default text block
      onChange({ blocks: newBlocks.length ? newBlocks : [{ type: "text", content: "" }] });
    },
    [blocks, onChange]
  );

  const addBlock = useCallback(
    (type: "text" | "ai") => {
      const newBlock: TemplateBlock =
        type === "text"
          ? { type: "text", content: "" }
          : { type: "ai", prompt: "", max_tokens: 100 };
      onChange({ blocks: [...blocks, newBlock] });
    },
    [blocks, onChange]
  );

  const insertVariableAt = useCallback(
    (blockIndex: number, variable: string) => {
      const block = blocks[blockIndex];
      if (block.type !== "text") return;
      const textarea = textareaRefs.current.get(blockIndex);
      const pos = textarea?.selectionStart ?? block.content.length;
      const newContent = block.content.slice(0, pos) + variable + block.content.slice(pos);
      updateBlock(blockIndex, { ...block, content: newContent });
      setShowVariablePicker(null);
    },
    [blocks, updateBlock]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, blockIndex: number) => {
      if (e.key === "{" && !e.shiftKey) {
        // Show variable picker inline
        setShowVariablePicker(blockIndex);
      }
    },
    []
  );

  // Ensure at least one text block exists
  if (blocks.length === 0) {
    onChange({ blocks: [{ type: "text", content: "" }] });
    return null;
  }

  return (
    <div className="space-y-2 relative">
      {/* Use stable IDs as keys — never index keys per perf spec */}
      {blocks.map((block, i) => (
        <div key={blockIdsRef.current[i]} className="relative">
          {block.type === "text" ? (
            <div className="relative">
              {singleLine ? (
                <input
                  ref={(el) => {
                    if (el) textareaRefs.current.set(i, el as unknown as HTMLTextAreaElement);
                  }}
                  value={block.content}
                  onChange={(e) => updateBlock(i, { ...block, content: e.target.value })}
                  onKeyDown={(e) => handleKeyDown(e, i)}
                  placeholder={placeholder}
                  className="w-full bg-white/[0.03] rounded-lg px-3 py-2 text-sm text-white placeholder:text-[var(--text-muted)] outline-none border border-white/[0.06] focus:border-white/[0.12]"
                />
              ) : (
                <textarea
                  ref={(el) => {
                    if (el) textareaRefs.current.set(i, el);
                  }}
                  value={block.content}
                  onChange={(e) => updateBlock(i, { ...block, content: e.target.value })}
                  onKeyDown={(e) => handleKeyDown(e, i)}
                  placeholder={placeholder}
                  rows={4}
                  className="w-full bg-white/[0.03] rounded-lg px-3 py-2 text-sm text-white placeholder:text-[var(--text-muted)] outline-none border border-white/[0.06] focus:border-white/[0.12] resize-y"
                />
              )}
              <div className="absolute top-1 right-1">
                <VariablePicker onSelect={(v) => insertVariableAt(i, v)} />
              </div>
              {showVariablePicker === i && (
                <VariablePicker
                  trigger="inline"
                  position={{ top: 40, left: 0 }}
                  onSelect={(v) => insertVariableAt(i, v)}
                  onClose={() => setShowVariablePicker(null)}
                />
              )}
            </div>
          ) : (
            <AiBlockEditor
              block={block}
              onChange={(updated) => updateBlock(i, updated)}
              onDelete={() => removeBlock(i)}
            />
          )}
        </div>
      ))}

      {/* Add block controls */}
      <div className="flex gap-2">
        <button
          onClick={() => addBlock("text")}
          className="text-xs px-2 py-1 rounded glass hover:bg-white/[0.05] text-[var(--text-secondary)] flex items-center gap-1"
        >
          <Type className="w-3 h-3" /> Add Text
        </button>
        {!singleLine && (
          <button
            onClick={() => addBlock("ai")}
            className="text-xs px-2 py-1 rounded glass hover:bg-white/[0.05] text-[var(--accent-orange)] flex items-center gap-1"
          >
            <Sparkles className="w-3 h-3" /> Add AI Block
          </button>
        )}
      </div>
    </div>
  );
}
```

---

## Task 9: Step Editor Rewrite

**Files:**
- Modify: `components/admin/step-editor.tsx`

**Depends on:** Task 8

- [ ] **Step 1: Rewrite step-editor.tsx with composable templates**

Replace the current `step-editor.tsx` (219 LOC) with the enhanced version that uses `ComposableTemplateEditor` instead of plain textareas, adds per-step stats, and supports reordering.

The step editor receives `steps: SequenceStep[]` and `onSave: (steps: SequenceStep[]) => void`. Each step renders:
- Delay days input
- Action type dropdown
- Subject: `ComposableTemplateEditor` with `singleLine={true}`
- Body: `ComposableTemplateEditor`
- Per-step delivery stats (if `stepStats` prop provided)
- Delete button, reorder buttons

Read the current `components/admin/step-editor.tsx` first. Preserve the vertical timeline visual (numbered circles + connecting line). Replace `GlassInput` subject field → `ComposableTemplateEditor singleLine`. Replace `textarea` body field → `ComposableTemplateEditor`. Add optional `stepStats: Record<number, { sent: number; opened: number; replied: number }>` prop. Add `[+ Add Step]` button at bottom. Keep the Save button with "Saved!" feedback.

Key change: `SequenceStep.body_template` is now `ComposableTemplate` not `string`, and `subject_template` is `ComposableTemplate | null` not `string | null`. The initial empty step should have `body_template: { blocks: [{ type: 'text', content: '' }] }`.

---

## Task 10: Sequence Detail View

**Files:**
- Modify: `app/admin/sequences/[id]/page.tsx` (rewrite as minimal server shell)
- Create: `app/admin/sequences/[id]/sequence-detail-client.tsx`
- Create: `components/admin/schedule-config.tsx`
- Create: `components/admin/activity-log.tsx`
- Delete: `app/admin/sequences/[id]/sequence-controls.tsx` (functionality absorbed into detail client)

**Depends on:** Tasks 5, 9

- [ ] **Step 1: Create schedule configuration component**

`components/admin/schedule-config.tsx` — Schedule controls for timing mode, send window, and anchor date.

Read the spec Part 2, Section 2 and Part 6 for the exact UI. The component takes `value: SequenceSchedule` and `onChange`. Renders:
- Timing mode dropdown (relative / window / anchor)
- Conditional: send window controls (day checkboxes, hour inputs, timezone select) when mode is window or anchor
- Conditional: anchor date input + direction dropdown when mode is anchor
- Use `GlassSelect` for dropdowns, `GlassInput` for number/date inputs

- [ ] **Step 2: Create activity log component**

`components/admin/activity-log.tsx` — Compact chronological feed for the sidebar. Fetches recent interactions for the sequence ordered by `updated_at` desc, limit 20. Shows: timestamp + event description ("6 messages sent (Step 2)", "3 replies received", "Sequence activated"). Takes `sequenceId: string` prop, fetches its own data via a simple Supabase query.

- [ ] **Step 3: Create sequence detail client component**

`app/admin/sequences/[id]/sequence-detail-client.tsx` — Two-panel layout. Center: header strip + step editor + schedule config. Sidebar: enrollment summary + schedule overview + performance + activity log.

Uses `useSequenceDetail(id)` for data. Uses `useMutation` for updates (name, status, steps, schedule, send_mode, sender_id). Invalidates `queryKeys.sequences.detail(id)` on success.

Header strip: back link, inline-editable name, status dropdown, channel badge, send mode toggle, sender profile dropdown, primary action button. This absorbs the play/pause/stop functionality from the deleted `sequence-controls.tsx`.

Active sequence warning banner when status is "active" and user edits steps.

Sidebar includes: enrollment summary (from spec Section 1), schedule overview (Section 2), performance stats (Section 3), and activity log (Section 4).

Import `TwoPanelLayout` from `components/admin/two-panel-layout.tsx` (from admin UX overhaul). If it doesn't exist yet, create a minimal version inline.

- [ ] **Step 4: Extend enrollment-panel.tsx**

Update `app/admin/sequences/[id]/enrollment-panel.tsx` to show enrollment status breakdown (active/completed/paused/bounced counts) and schedule info per the spec sidebar Section 1. The panel is rendered inside the sidebar of the detail view.

- [ ] **Step 5: Rewrite server page as minimal shell**

`app/admin/sequences/[id]/page.tsx` — Server component that just renders the client component with the sequence ID from params:

```typescript
import { SequenceDetailClient } from "./sequence-detail-client";

export default async function SequenceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SequenceDetailClient sequenceId={id} />;
}
```

---

## Task 11: Sequences List View

**Files:**
- Modify: `app/admin/sequences/page.tsx` (rewrite as minimal shell)
- Rewrite: `app/admin/sequences/sequence-list-client.tsx`
- Create: `components/admin/sequence-row.tsx`
- Create: `components/admin/sequence-preview.tsx`

**Depends on:** Tasks 5, 1

- [ ] **Step 1: Create memoized sequence row component**

`components/admin/sequence-row.tsx` — `React.memo`'d table row for the sequences list. Renders all 10 columns from spec Part 1. Uses `Badge` for status/channel/mode. Uses `Link` for name → detail page. Checkbox for selection.

- [ ] **Step 2: Create sequence preview component**

`components/admin/sequence-preview.tsx` — `React.memo`'d sidebar preview card. Shows: name, badges, step timeline, enrollment snapshot, performance summary, "View Details →" link. Takes a `SequenceWithStats` prop.

- [ ] **Step 3: Rewrite sequence-list-client.tsx**

Replace the current 346-LOC component. New version uses:
- `useSequences(filters)` for data
- `TwoPanelLayout` for structure
- `SequenceRow` for table rows
- `SequencePreview` in sidebar
- Filter sidebar with search, filter groups, active filter chips, selection summary with bulk actions
- Create sequence modal (preserved from current, updated to include send_mode field)
- `useMutation` for create/delete/status-change with cache invalidation

Target: <300 LOC by delegating to extracted components.

- [ ] **Step 4: Rewrite server page as minimal shell**

```typescript
import { SequenceListClient } from "./sequence-list-client";

export default function SequencesPage() {
  return <SequenceListClient />;
}
```

---

## Task 12: Message Generation API

**Files:**
- Create: `app/api/sequences/generate/route.ts`

**Depends on:** Tasks 1, 3

- [ ] **Step 1: Create the generation route**

`POST /api/sequences/generate` — Finds due enrollments, renders templates, creates interaction records.

Logic:
1. Accept optional `{ sequenceId, step }` body params to scope generation
2. Query active enrollments in active sequences where current step hasn't been generated
3. For each enrollment:
   a. Check delay timing (relative, window, or anchor mode)
   b. If due: fetch person + primary org + event + sender data
   c. Build `TemplateContext` via `buildContext()`
   d. Extract AI blocks via `extractAiBlocks()` — if any, call Gemini for generation
   e. Render full template via `renderTemplate()` with AI results
   f. Create `interaction` record with rendered subject/body
   g. Set status: `scheduled` (auto mode) or `draft` (approval mode)
   h. Set `scheduled_at` based on next valid send window (for auto mode)
   i. Advance enrollment `current_step`; mark completed if last step
4. Return `{ generated: number, errors: string[] }`

For AI generation, call the existing Supabase edge function `generate-messages` or use a direct Gemini API call. Check how the existing `execute/route.ts` does it and follow that pattern.

Handle AI block failures: create interaction with `status: 'failed'` and `detail.error`.

---

## Task 13: Email Sending API

**Files:**
- Create: `app/api/sequences/send/route.ts`

**Depends on:** Tasks 1, 4

- [ ] **Step 1: Create the sending route**

`POST /api/sequences/send` — Cron-triggered job that sends scheduled emails via SendGrid.

Logic:
1. Query interactions where `status = 'scheduled'` AND `scheduled_at <= now()`
2. Limit to 50 per run (rate limiting)
3. For each interaction:
   a. Fetch the person's email and the sequence's sender profile
   b. Skip if person has no email (mark as failed)
   c. Check send window constraints if applicable (from sequence's schedule_config)
   d. Update status to `sending`
   e. Call `sendEmail()` from `lib/sendgrid.ts`
   f. On success: update status to `sent`, store `sendgrid_message_id` in detail
   g. On failure: increment `detail.retry_count`; if < 3, set status back to `scheduled` with backoff; if >= 3, set status to `failed`
4. Return `{ sent: number, failed: number, skipped: number }`

Add Vercel cron config in `vercel.json`:
```json
{
  "crons": [
    { "path": "/api/sequences/send", "schedule": "*/5 * * * *" }
  ]
}
```

---

## Task 14: SendGrid Webhook Handler

**Files:**
- Create: `app/api/webhooks/sendgrid/route.ts`

**Depends on:** Task 1

- [ ] **Step 1: Create the webhook route**

`POST /api/webhooks/sendgrid` — Receives SendGrid event webhook payloads.

Logic:
1. Parse JSON array of events from request body
2. For each event:
   a. Extract `sg_message_id` (SendGrid's message identifier)
   b. Look up interaction by `detail->>'sendgrid_message_id'`
   c. Map event type to interaction status:
      - `delivered` → `delivered`
      - `open` → `opened`
      - `click` → `clicked`
      - `bounce` / `dropped` → `bounced` (also update enrollment to bounced)
      - `spam_report` → `bounced`
   d. Only update if the new status is "higher" in the funnel (don't downgrade `replied` to `opened`)
   e. For bounces: update the enrollment status to `bounced`
3. Return 200 OK

Status priority order: draft < scheduled < sending < sent < delivered < opened < clicked < replied. Bounced/failed are terminal and always override.

**Note:** Webhook signature verification is timestamp-only for MVP (see `lib/sendgrid.ts`). Add `@sendgrid/eventwebhook` and implement full ECDSA verification before going to production. Add a `// WARNING: Timestamp-only verification — add ECDSA before production` comment in the webhook handler.

---

## Task 15: Message Queue View

**Files:**
- Create: `app/admin/sequences/[id]/messages/page.tsx`
- Create: `app/admin/sequences/[id]/messages/message-queue-client.tsx`
- Create: `components/admin/message-row.tsx`
- Create: `app/api/sequences/[id]/messages/route.ts`
- Create: `app/api/sequences/[id]/messages/bulk/route.ts`
- Create: `app/api/sequences/[id]/messages/[msgId]/route.ts`

**Depends on:** Tasks 5, 12

- [ ] **Step 1: Create message API routes**

`app/api/sequences/[id]/messages/route.ts` — GET: fetch messages for sequence (used by React Query hook as an alternative to direct Supabase if needed for server-side filtering).

`app/api/sequences/[id]/messages/[msgId]/route.ts` — PATCH: update single message (edit body, approve, reject, cancel, resend).

`app/api/sequences/[id]/messages/bulk/route.ts` — POST: bulk approve/reject/reschedule. Accepts `{ action: 'approve' | 'reject' | 'reschedule', messageIds: string[], scheduledAt?: string }`.

- [ ] **Step 2: Create memoized message row component**

`components/admin/message-row.tsx` — `React.memo`'d row with inline expansion. Shows: recipient (name + title), step, subject, status badge, scheduled date, sent date, engagement icons. Click expands to show full message with action buttons (Edit, Approve, Reject, Resend, Cancel).

- [ ] **Step 3: Create message queue client component**

`app/admin/sequences/[id]/messages/message-queue-client.tsx` — Two-panel layout. Center: header strip with status tabs + message table (virtualized). Sidebar: stats summary, filters, batch actions, generation controls.

Uses `useSequenceMessages(id, filters)` and `useSequenceStats(id)`. Uses `useMutation` for approve/reject/edit/bulk actions. Invalidates message and stats query keys on success.

- [ ] **Step 4: Create server page shell**

```typescript
import { MessageQueueClient } from "./message-queue-client";

export default async function MessagesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <MessageQueueClient sequenceId={id} />;
}
```

---

## Task 16: Server Actions & Preview

**Files:**
- Modify: `app/admin/sequences/actions.ts`
- Create: `app/api/sequences/[id]/preview/route.ts`
- Create: `components/admin/message-preview-modal.tsx`

**Depends on:** Tasks 1, 3, 5

- [ ] **Step 1: Extend server actions**

Update `app/admin/sequences/actions.ts` to add:
- `updateSequenceSendMode(id, sendMode)` — update send_mode column
- `updateSequenceSender(id, senderId)` — update sender_id column
- `updateSequenceSchedule(id, scheduleConfig)` — update schedule_config JSONB
- `updateSequenceName(id, name)` — update name inline

Keep existing actions (`createSequence`, `deleteSequence`, `updateSequenceStatus`, `enrollPersons`, `unenrollPerson`, `searchPersons`). Update `createSequence` to accept optional `send_mode` field.

- [ ] **Step 2: Create preview API route**

`app/api/sequences/[id]/preview/route.ts` — POST: renders a specific step for a specific person. Accepts `{ stepIndex: number, personId: string }`. Returns `{ subject: string, body: string }`.

Uses `buildContext()` + `renderTemplate()`. For AI blocks, calls Gemini in real-time (preview is on-demand, not batched). Use the same Gemini integration approach as Task 12 (the generate API) — check the existing `app/api/sequences/execute/route.ts` for the Supabase edge function `generate-messages` pattern and follow it.

- [ ] **Step 3: Create message preview modal**

`components/admin/message-preview-modal.tsx` — Modal that shows rendered message for a selected enrollment. Dropdown to pick which person to preview for. Calls the preview API on selection. Shows loading state while AI blocks generate. Displays rendered subject + body.

---

## Task 17: Integration & Polish

**Files:**
- Various existing files for wiring

- [ ] **Step 1: Verify all routes are accessible**

Navigate to each route in the browser and confirm no crash:
- `/admin/sequences` — list view loads
- `/admin/sequences/[id]` — detail view loads (use an existing sequence ID)
- `/admin/sequences/[id]/messages` — message queue loads (may be empty)

- [ ] **Step 2: Test the create → edit → activate flow**

1. Create a new sequence via the list view modal
2. Add steps with composable templates (mix text + variables)
3. Configure schedule (try each timing mode)
4. Set a sender profile
5. Enroll some persons
6. Preview a message
7. Activate the sequence
8. Verify active warning banner appears when editing

- [ ] **Step 3: Test the generation → approval → send flow**

1. With an active approval-mode sequence, call `POST /api/sequences/generate` manually
2. Verify draft interactions appear in the message queue
3. Approve a message, verify it moves to scheduled
4. Call `POST /api/sequences/send` manually
5. Verify the message status updates (sent, or failed if no SendGrid key)

- [ ] **Step 4: Verify webhook handling**

Send a test POST to `/api/webhooks/sendgrid` with a mock event payload:
```json
[{"sg_message_id": "test-id", "event": "delivered", "timestamp": 1234567890}]
```
Verify it returns 200 (won't match any interaction but shouldn't error).

- [ ] **Step 5: Verify responsive behavior**

Check that `TwoPanelLayout` handles the responsive breakpoints from the spec (Part 10):
- ≥1280px: full two-panel with sidebar visible
- 1024–1279px: narrower sidebar (280px)
- <1024px: sidebar collapses to slide-out drawer

If `TwoPanelLayout` already handles this (from admin UX overhaul), no changes needed. If not, add the responsive breakpoint logic and drawer toggle to the layout component.

- [ ] **Step 6: Final build check**

Run: `npx next build 2>&1 | tail -20`

Verify no type errors or build failures.
