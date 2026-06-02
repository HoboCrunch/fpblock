# Inbox "Sent" Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Sent" tab to `/admin/inbox` showing a unified, threaded view of all outbound email — SendGrid/outreach sends (from `interactions`) and inbox replies (from `inbound_emails`) — with inbound replies threaded onto the send that prompted them.

**Architecture:** SendGrid sends are normalized **in memory** into the existing `InboundEmailWithRelations` shape so the existing thread panel renders them unchanged (no DB migration). A new lazy-loaded route `GET /api/inbox/sent` merges both sources (dedup: skip `interactions` rows already reconciled from the inbox), groups by `(person ?? counterparty, normalized subject)`, and returns `Thread[]` + a keyset cursor. The inbox client gets an `inbox | sent` view toggle that fetches this route on first open.

**Tech Stack:** Next.js (App Router, server components + client islands), Supabase (`@/lib/supabase/server` authenticated client), TypeScript, Vitest. Reuses `lib/inbox/group-threads.ts` types/helpers.

**Reference spec:** `docs/superpowers/specs/2026-06-02-inbox-sent-tab-design.md`

---

## File Structure

**Create:**
- `lib/inbox/group-sent-threads.ts` — `normalizeSubject()` + `groupSentThreads()` (pure).
- `lib/inbox/group-sent-threads.test.ts` — tests for the above.
- `lib/inbox/sent-message.ts` — `SentInteractionRow` type, `isReconciledFromInbox()`, `normalizeInteractionToMessage()` (pure).
- `lib/inbox/sent-message.test.ts` — tests for the above.
- `lib/inbox/load-sent.ts` — `loadSentPage()` server helper (DB queries + merge + group).
- `app/api/inbox/sent/route.ts` — thin `GET` handler.

**Modify:**
- `lib/inbox/group-threads.ts` — add optional `source` / `delivery_status` to `InboundEmailWithRelations`; extract reusable `assembleThread()` (DRY with new grouper).
- `app/admin/inbox/inbox-client.tsx` — `view` toggle, lazy fetch, render Sent threads, source badge + delivery-status chip.

---

## Task 1: Extend the message type and extract `assembleThread`

This is a refactor that keeps `groupIntoThreads` behavior identical while exposing a reusable thread-assembly helper and two optional Sent-only fields.

**Files:**
- Modify: `lib/inbox/group-threads.ts`
- Test: `lib/inbox/group-threads.test.ts` (existing — must still pass)

- [ ] **Step 1: Add optional Sent-view fields to `InboundEmailWithRelations`**

In `lib/inbox/group-threads.ts`, replace the `InboundEmailWithRelations` type (lines 17-20) with:

```typescript
export type InboundEmailWithRelations = InboundEmail & {
  person: { id: string; full_name: string; email: string | null } | null;
  organization?: OrgRef | null;
  // Set only for messages built for the Sent view. Optional so the inbox path
  // is unaffected. `source` distinguishes a SendGrid/outreach send from an
  // inbox/Fastmail send; `delivery_status` carries the raw interactions.status.
  source?: "sendgrid" | "inbox";
  delivery_status?: string | null;
};
```

- [ ] **Step 2: Extract `assembleThread` from `groupIntoThreads`**

In `lib/inbox/group-threads.ts`, replace the per-bucket loop body inside `groupIntoThreads` (lines 71-113, the `for (const [key, msgs] of buckets)` block through the `threads.push({...})`) with a call to a new exported helper. The function becomes:

```typescript
export function groupIntoThreads(emails: InboundEmailWithRelations[]): Thread[] {
  const buckets = new Map<string, InboundEmailWithRelations[]>();
  for (const e of emails) {
    const key = e.thread_id
      ? `${e.thread_id}::${counterpartyOf(e) ?? "?"}`
      : `solo:${e.id}`;
    const existing = buckets.get(key);
    if (existing) existing.push(e);
    else buckets.set(key, [e]);
  }

  const threads: Thread[] = [];
  for (const [key, msgs] of buckets) {
    threads.push(assembleThread(key, msgs));
  }
  threads.sort(
    (a, b) => new Date(b.latest_at).getTime() - new Date(a.latest_at).getTime()
  );
  return threads;
}

/**
 * Build a Thread from a bucket of messages that belong together. Shared by the
 * inbox grouper (keyed by Fastmail thread + counterparty) and the Sent grouper
 * (keyed by person + normalized subject).
 */
export function assembleThread(
  id: string,
  msgs: InboundEmailWithRelations[]
): Thread {
  msgs.sort(
    (a, b) =>
      new Date(a.received_at).getTime() - new Date(b.received_at).getTime()
  );
  const latest = msgs[msgs.length - 1];
  const firstInbound = msgs.find((m) => m.direction === "inbound") || latest;
  const subject =
    msgs.find((m) => m.subject)?.subject?.replace(/^(Re:\s*)+/i, "") || null;

  const inbound = msgs.filter((m) => m.direction === "inbound");
  const outbound = msgs.filter((m) => m.direction === "outbound");
  const isUnread = inbound.some((m) => !m.is_read);

  const correlatedSource =
    [...inbound].reverse().find((m) => m.person_id) ||
    msgs.find((m) => m.person_id) ||
    null;

  return {
    id,
    thread_id: latest.thread_id,
    subject,
    messages: msgs,
    latest,
    first_inbound: firstInbound,
    participants: collectParticipants(msgs),
    message_count: msgs.length,
    inbound_count: inbound.length,
    outbound_count: outbound.length,
    is_unread: isUnread,
    account_emails: [...new Set(msgs.map((m) => m.account_email))],
    person_id: correlatedSource?.person_id || null,
    person: correlatedSource?.person || null,
    organization: correlatedSource?.organization || null,
    latest_at: latest.received_at,
  };
}
```

- [ ] **Step 3: Run the existing grouper tests to confirm no regression**

Run: `npx vitest run lib/inbox/group-threads.test.ts`
Expected: PASS (all existing tests green — the refactor is behavior-preserving).

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0, no errors.

---

## Task 2: `normalizeSubject` + `groupSentThreads` (pure)

**Files:**
- Create: `lib/inbox/group-sent-threads.ts`
- Test: `lib/inbox/group-sent-threads.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `lib/inbox/group-sent-threads.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { normalizeSubject, groupSentThreads } from "@/lib/inbox/group-sent-threads";
import type { InboundEmailWithRelations } from "@/lib/inbox/group-threads";

// Minimal message factory — only the fields the grouper reads.
function msg(
  over: Partial<InboundEmailWithRelations> & { id: string }
): InboundEmailWithRelations {
  return {
    id: over.id,
    account_email: "wes@gofpblock.com",
    message_id: `m:${over.id}`,
    thread_id: null,
    direction: "outbound",
    from_address: "wes@gofpblock.com",
    from_name: "Wes",
    to_address: "prospect@acme.com",
    subject: "Intro",
    body_preview: "hi",
    body_html: "<p>hi</p>",
    received_at: "2026-05-01T10:00:00.000Z",
    is_read: true,
    person_id: null,
    correlated_interaction_id: null,
    correlation_type: null,
    raw_headers: null,
    created_at: "2026-05-01T10:00:00.000Z",
    person: null,
    organization: null,
    ...over,
  };
}

describe("normalizeSubject", () => {
  it("lowercases and trims", () => {
    expect(normalizeSubject("  Quick Intro  ")).toBe("quick intro");
  });
  it("strips a leading Re:", () => {
    expect(normalizeSubject("Re: Quick Intro")).toBe("quick intro");
  });
  it("strips repeated Re:/Fwd:/Fw: prefixes", () => {
    expect(normalizeSubject("Re: Fwd: Re: Quick Intro")).toBe("quick intro");
    expect(normalizeSubject("FW: Quick Intro")).toBe("quick intro");
  });
  it("returns empty string for null", () => {
    expect(normalizeSubject(null)).toBe("");
  });
});

describe("groupSentThreads", () => {
  it("merges a send and its reply when person + subject match", () => {
    const send = msg({
      id: "send1",
      direction: "outbound",
      person_id: "p1",
      to_address: "p1@acme.com",
      subject: "Quick Intro",
      received_at: "2026-05-01T10:00:00.000Z",
    });
    const reply = msg({
      id: "reply1",
      direction: "inbound",
      person_id: "p1",
      from_address: "p1@acme.com",
      to_address: "wes@gofpblock.com",
      subject: "Re: Quick Intro",
      is_read: false,
      received_at: "2026-05-01T12:00:00.000Z",
    });
    const threads = groupSentThreads([send, reply]);
    expect(threads).toHaveLength(1);
    expect(threads[0].message_count).toBe(2);
    expect(threads[0].inbound_count).toBe(1);
    expect(threads[0].outbound_count).toBe(1);
    expect(threads[0].is_unread).toBe(true);
  });

  it("keeps different subjects as separate threads for the same person", () => {
    const a = msg({ id: "a", person_id: "p1", subject: "Intro" });
    const b = msg({ id: "b", person_id: "p1", subject: "Pricing" });
    expect(groupSentThreads([a, b])).toHaveLength(2);
  });

  it("never merges across different persons", () => {
    const a = msg({ id: "a", person_id: "p1", subject: "Intro" });
    const b = msg({ id: "b", person_id: "p2", subject: "Intro" });
    expect(groupSentThreads([a, b])).toHaveLength(2);
  });

  it("groups multiple sends to the same person + subject into one thread", () => {
    const a = msg({ id: "a", person_id: "p1", subject: "Intro", received_at: "2026-05-01T10:00:00.000Z" });
    const b = msg({ id: "b", person_id: "p1", subject: "Re: Intro", received_at: "2026-05-03T10:00:00.000Z" });
    const threads = groupSentThreads([a, b]);
    expect(threads).toHaveLength(1);
    expect(threads[0].message_count).toBe(2);
  });

  it("falls back to counterparty email when person_id is null", () => {
    const send = msg({ id: "s", person_id: null, to_address: "x@acme.com", subject: "Intro" });
    const reply = msg({
      id: "r",
      direction: "inbound",
      person_id: null,
      from_address: "x@acme.com",
      subject: "Re: Intro",
    });
    expect(groupSentThreads([send, reply])).toHaveLength(1);
  });

  it("sorts threads newest-first by latest message", () => {
    const old = msg({ id: "old", person_id: "p1", subject: "A", received_at: "2026-05-01T10:00:00.000Z" });
    const recent = msg({ id: "new", person_id: "p2", subject: "B", received_at: "2026-05-09T10:00:00.000Z" });
    const threads = groupSentThreads([old, recent]);
    expect(threads[0].id).toContain("p2");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/inbox/group-sent-threads.test.ts`
Expected: FAIL with "normalizeSubject is not a function" / "groupSentThreads is not a function".

- [ ] **Step 3: Implement `lib/inbox/group-sent-threads.ts`**

```typescript
// lib/inbox/group-sent-threads.ts — group outbound messages (SendGrid sends +
// inbox sends) and their replies into threads for the inbox "Sent" view.
//
// Unlike the inbox grouper (which keys on Fastmail thread_id + counterparty),
// SendGrid sends have no thread_id, so we key on the correlated person (or the
// counterparty email when uncorrelated) plus the normalized subject. This lets a
// send and its reply land in one thread even across the two data sources.

import {
  assembleThread,
  counterpartyOf,
  type InboundEmailWithRelations,
  type Thread,
} from "@/lib/inbox/group-threads";

/** Lowercase, trim, and strip repeated Re:/Fwd:/Fw: prefixes for thread keying. */
export function normalizeSubject(subject: string | null): string {
  if (!subject) return "";
  return subject
    .replace(/^(\s*(re|fwd|fw)\s*:\s*)+/i, "")
    .trim()
    .toLowerCase();
}

export function groupSentThreads(
  messages: InboundEmailWithRelations[]
): Thread[] {
  const buckets = new Map<string, InboundEmailWithRelations[]>();
  for (const m of messages) {
    const party = m.person_id ?? counterpartyOf(m) ?? "?";
    const key = `${party}|${normalizeSubject(m.subject)}`;
    const existing = buckets.get(key);
    if (existing) existing.push(m);
    else buckets.set(key, [m]);
  }

  const threads: Thread[] = [];
  for (const [key, msgs] of buckets) {
    threads.push(assembleThread(key, msgs));
  }
  threads.sort(
    (a, b) => new Date(b.latest_at).getTime() - new Date(a.latest_at).getTime()
  );
  return threads;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/inbox/group-sent-threads.test.ts`
Expected: PASS (all cases green).

---

## Task 3: `normalizeInteractionToMessage` + dedup helper (pure)

**Files:**
- Create: `lib/inbox/sent-message.ts`
- Test: `lib/inbox/sent-message.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `lib/inbox/sent-message.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  isReconciledFromInbox,
  normalizeInteractionToMessage,
  type SentInteractionRow,
} from "@/lib/inbox/sent-message";

function row(over: Partial<SentInteractionRow> & { id: string }): SentInteractionRow {
  return {
    id: over.id,
    person_id: "p1",
    subject: "Quick Intro",
    body: "<p>Hello there, this is the body.</p>",
    occurred_at: "2026-05-04T09:00:00.000Z",
    status: "sent",
    detail: null,
    persons: { id: "p1", full_name: "Ada Lovelace", email: "ada@acme.com" },
    sender_profiles: { email: "wes@gofpblock.com", name: "Wes" },
    ...over,
  };
}

describe("isReconciledFromInbox", () => {
  it("is true when detail carries an inbound_emails_id", () => {
    expect(isReconciledFromInbox({ inbound_emails_id: "abc" })).toBe(true);
  });
  it("is false for a native SendGrid send", () => {
    expect(isReconciledFromInbox({ sendgrid_message_id: "sg1" })).toBe(false);
  });
  it("is false for null detail", () => {
    expect(isReconciledFromInbox(null)).toBe(false);
  });
});

describe("normalizeInteractionToMessage", () => {
  it("maps an interaction send into an outbound message", () => {
    const m = normalizeInteractionToMessage(row({ id: "i1" }));
    expect(m.id).toBe("i1");
    expect(m.message_id).toBe("interaction:i1");
    expect(m.direction).toBe("outbound");
    expect(m.to_address).toBe("ada@acme.com");
    expect(m.from_address).toBe("wes@gofpblock.com");
    expect(m.body_html).toBe("<p>Hello there, this is the body.</p>");
    expect(m.received_at).toBe("2026-05-04T09:00:00.000Z");
    expect(m.person?.id).toBe("p1");
    expect(m.source).toBe("sendgrid");
    expect(m.delivery_status).toBe("sent");
    expect(m.thread_id).toBeNull();
  });

  it("derives a plain-text preview from HTML body", () => {
    const m = normalizeInteractionToMessage(
      row({ id: "i2", body: "<p>Hi <b>Ada</b>,</p><p>quick note.</p>" })
    );
    expect(m.body_preview).toBe("Hi Ada, quick note.");
  });

  it("tolerates a missing sender profile and missing person email", () => {
    const m = normalizeInteractionToMessage(
      row({ id: "i3", sender_profiles: null, persons: { id: "p1", full_name: null, email: null } })
    );
    expect(m.from_address).toBe("");
    expect(m.to_address).toBeNull();
    expect(m.person?.full_name).toBe("");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/inbox/sent-message.test.ts`
Expected: FAIL with "normalizeInteractionToMessage is not a function".

- [ ] **Step 3: Implement `lib/inbox/sent-message.ts`**

```typescript
// lib/inbox/sent-message.ts — normalize an `interactions` email send into the
// InboundEmailWithRelations shape the inbox thread UI already renders, so the
// Sent view can show SendGrid/outreach sends alongside Fastmail sends + replies.

import type { InboundEmailWithRelations } from "@/lib/inbox/group-threads";

/** Shape of the `interactions` row selected by the Sent loader. */
export interface SentInteractionRow {
  id: string;
  person_id: string | null;
  subject: string | null;
  body: string | null;
  occurred_at: string | null;
  status: string;
  detail: Record<string, unknown> | null;
  persons: { id: string; full_name: string | null; email: string | null } | null;
  sender_profiles: { email: string; name: string | null } | null;
}

/**
 * True when this interaction was created by the outbound→interaction reconciler
 * from an `inbound_emails` row. Such rows are duplicates of an inbound_emails
 * send and must be excluded so the Sent view shows each message once.
 */
export function isReconciledFromInbox(
  detail: Record<string, unknown> | null
): boolean {
  return Boolean(detail && detail["inbound_emails_id"]);
}

function htmlToPreview(html: string | null): string {
  if (!html) return "";
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 140);
}

export function normalizeInteractionToMessage(
  row: SentInteractionRow
): InboundEmailWithRelations {
  const senderEmail = row.sender_profiles?.email ?? "";
  const timestamp = row.occurred_at ?? "";
  return {
    id: row.id,
    account_email: senderEmail,
    message_id: `interaction:${row.id}`,
    thread_id: null,
    direction: "outbound",
    from_address: senderEmail,
    from_name: row.sender_profiles?.name ?? null,
    to_address: row.persons?.email ?? null,
    subject: row.subject,
    body_preview: htmlToPreview(row.body),
    body_html: row.body,
    received_at: timestamp,
    is_read: true,
    person_id: row.person_id,
    correlated_interaction_id: row.id,
    correlation_type: null,
    raw_headers: null,
    created_at: timestamp,
    person: row.persons
      ? {
          id: row.persons.id,
          full_name: row.persons.full_name ?? "",
          email: row.persons.email,
        }
      : null,
    organization: null,
    source: "sendgrid",
    delivery_status: row.status,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/inbox/sent-message.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

---

## Task 4: `loadSentPage` server helper + `GET /api/inbox/sent`

This task hits the DB; it is verified by typecheck + a manual curl against the dev server (no unit test — the pure pieces it composes are already covered).

**Files:**
- Create: `lib/inbox/load-sent.ts`
- Create: `app/api/inbox/sent/route.ts`

- [ ] **Step 1: Implement `lib/inbox/load-sent.ts`**

```typescript
// lib/inbox/load-sent.ts — load one page of the inbox "Sent" view: merge
// SendGrid/outreach sends (interactions) with inbox sends + replies
// (inbound_emails), dedup, and group into threads.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  groupSentThreads,
} from "@/lib/inbox/group-sent-threads";
import {
  isReconciledFromInbox,
  normalizeInteractionToMessage,
  type SentInteractionRow,
} from "@/lib/inbox/sent-message";
import type {
  InboundEmailWithRelations,
  Thread,
} from "@/lib/inbox/group-threads";

const SEND_STATUSES = [
  "sent",
  "delivered",
  "opened",
  "clicked",
  "replied",
  "bounced",
];

export interface LoadSentOptions {
  cursor?: string | null; // ISO timestamp; return sends strictly older than this
  limit?: number; // number of outbound anchors per page
  q?: string | null; // recipient/subject search
}

export interface SentPage {
  threads: Thread[];
  nextCursor: string | null;
}

export async function loadSentPage(
  supabase: SupabaseClient,
  opts: LoadSentOptions = {}
): Promise<SentPage> {
  const limit = opts.limit ?? 50;

  // 1) SendGrid/outreach sends from interactions (exclude inbox-reconciled dupes).
  let interactionsQuery = supabase
    .from("interactions")
    .select(
      "id, person_id, subject, body, occurred_at, status, detail, persons(id, full_name, email), sender_profiles(email, name)"
    )
    .eq("channel", "email")
    .in("status", SEND_STATUSES)
    .is("detail->>inbound_emails_id", null)
    .order("occurred_at", { ascending: false })
    .limit(limit);
  if (opts.cursor) interactionsQuery = interactionsQuery.lt("occurred_at", opts.cursor);
  if (opts.q) {
    interactionsQuery = interactionsQuery.ilike("subject", `%${opts.q}%`);
  }

  // 2) Inbox sends from inbound_emails (the composer/Fastmail sends, richer copy).
  let outboundQuery = supabase
    .from("inbound_emails")
    .select("*, person:persons(id, full_name, email)")
    .eq("direction", "outbound")
    .order("received_at", { ascending: false })
    .limit(limit);
  if (opts.cursor) outboundQuery = outboundQuery.lt("received_at", opts.cursor);
  if (opts.q) outboundQuery = outboundQuery.ilike("subject", `%${opts.q}%`);

  const [{ data: interRows, error: interErr }, { data: outRows, error: outErr }] =
    await Promise.all([interactionsQuery, outboundQuery]);
  if (interErr) throw new Error(`interactions query: ${interErr.message}`);
  if (outErr) throw new Error(`inbound_emails query: ${outErr.message}`);

  const sendMessages: InboundEmailWithRelations[] = [];
  for (const r of (interRows ?? []) as unknown as SentInteractionRow[]) {
    if (isReconciledFromInbox(r.detail)) continue; // belt-and-suspenders dedup
    sendMessages.push(normalizeInteractionToMessage(r));
  }
  for (const r of (outRows ?? []) as unknown as InboundEmailWithRelations[]) {
    sendMessages.push({ ...r, source: "inbox" });
  }

  // Merge both send sources, newest first, and take this page's anchors.
  sendMessages.sort(
    (a, b) =>
      new Date(b.received_at).getTime() - new Date(a.received_at).getTime()
  );
  const anchors = sendMessages.slice(0, limit);
  const nextCursor =
    anchors.length === limit ? anchors[anchors.length - 1].received_at : null;

  // 3) Pull replies for the anchors' persons so they thread onto the sends.
  const personIds = [
    ...new Set(
      anchors.map((m) => m.person_id).filter((id): id is string => Boolean(id))
    ),
  ];
  let replies: InboundEmailWithRelations[] = [];
  if (personIds.length > 0) {
    const { data: replyRows, error: replyErr } = await supabase
      .from("inbound_emails")
      .select("*, person:persons(id, full_name, email)")
      .eq("direction", "inbound")
      .in("person_id", personIds);
    if (replyErr) throw new Error(`replies query: ${replyErr.message}`);
    replies = (replyRows ?? []) as unknown as InboundEmailWithRelations[];
  }

  const threads = groupSentThreads([...anchors, ...replies]);
  return { threads, nextCursor };
}
```

- [ ] **Step 2: Implement `app/api/inbox/sent/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadSentPage } from "@/lib/inbox/load-sent";

export const dynamic = "force-dynamic";

/**
 * GET /api/inbox/sent — one page of the threaded Sent view.
 * Query: cursor (ISO timestamp), limit (default 50), q (subject search).
 * Auth: the authenticated server client (same session gate as the inbox page).
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const cursor = url.searchParams.get("cursor");
  const limitParam = url.searchParams.get("limit");
  const q = url.searchParams.get("q");
  const limit = limitParam ? Math.min(parseInt(limitParam, 10) || 50, 200) : 50;

  try {
    const supabase = await createClient();
    const page = await loadSentPage(supabase, { cursor, limit, q });
    return NextResponse.json(page);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[inbox/sent] failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Manual smoke test against the dev server**

Run (in one shell): `npm run dev`
Then in another shell, while logged in is not required for this route only if it sits behind middleware — if the admin area requires a session, test via the browser instead. Otherwise:
Run: `curl -s 'http://localhost:3000/api/inbox/sent?limit=5' | head -c 800`
Expected: JSON `{"threads":[...],"nextCursor":...}` with up to 5 threads; no 500. If the admin area is session-gated, instead open `/admin/inbox` in the browser (Task 5) and confirm the Sent tab loads.

---

## Task 5: Sent tab in the inbox client

**Files:**
- Modify: `app/admin/inbox/inbox-client.tsx`

- [ ] **Step 1: Add view state and a Sent-data loader**

In `app/admin/inbox/inbox-client.tsx`, after the existing `correlationFilter` state (line 56-57), add:

```typescript
  const [view, setView] = useState<"inbox" | "sent">("inbox");
  const [sentThreads, setSentThreads] = useState<Thread[]>([]);
  const [sentCursor, setSentCursor] = useState<string | null>(null);
  const [sentLoading, setSentLoading] = useState(false);
  const [sentError, setSentError] = useState<string | null>(null);
  const [sentLoaded, setSentLoaded] = useState(false);

  const loadSent = useCallback(
    async (cursor: string | null) => {
      setSentLoading(true);
      setSentError(null);
      try {
        const qs = new URLSearchParams({ limit: "50" });
        if (cursor) qs.set("cursor", cursor);
        const res = await fetch(`/api/inbox/sent?${qs.toString()}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: { threads: Thread[]; nextCursor: string | null } =
          await res.json();
        setSentThreads((prev) => (cursor ? [...prev, ...data.threads] : data.threads));
        setSentCursor(data.nextCursor);
        setSentLoaded(true);
      } catch (err) {
        setSentError(err instanceof Error ? err.message : "Failed to load sent");
      } finally {
        setSentLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (view === "sent" && !sentLoaded && !sentLoading) {
      loadSent(null);
    }
  }, [view, sentLoaded, sentLoading, loadSent]);
```

- [ ] **Step 2: Make the rendered thread list source switch on `view`**

In `app/admin/inbox/inbox-client.tsx`, replace the `filtered` computation (lines 72-76) with:

```typescript
  const activeThreads = view === "sent" ? sentThreads : threads;

  const filtered = activeThreads.filter((t) => {
    if (correlationFilter === "correlated" && !t.person_id) return false;
    if (correlationFilter === "uncorrelated" && t.person_id) return false;
    return true;
  });

  const selectedThread = filtered.find((t) => t.id === selectedId) || null;
```

Then DELETE the now-duplicate `const selectedThread = threads.find(...)` line at line 66 (it is replaced by the line above, which reads from the active source).

- [ ] **Step 3: Add the Inbox/Sent view toggle above the correlation tabs**

In `app/admin/inbox/inbox-client.tsx`, immediately inside the sync row container — after the closing `</div>` of the sync row (line 215) and before the `<div className="grid ...">` (line 217) — insert:

```tsx
      {/* Inbox / Sent view toggle */}
      <div className="flex gap-1 border-b border-gray-800">
        {(
          [
            ["inbox", "Inbox"],
            ["sent", "Sent"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => {
              setSelectedId(null);
              setView(id);
            }}
            className={cn(
              "px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px",
              view === id
                ? "border-[#f58327] text-white"
                : "border-transparent text-gray-400 hover:text-white"
            )}
          >
            {label}
          </button>
        ))}
      </div>
```

- [ ] **Step 4: Show a loading/error/empty state and a "Load more" control for Sent**

In `app/admin/inbox/inbox-client.tsx`, inside the thread-list scroll container (the `<div className="space-y-1 overflow-y-auto ...">` at line 245), replace the existing empty-state block (lines 246-254) with:

```tsx
          {view === "sent" && sentError && (
            <GlassCard className="text-center py-6">
              <p className="text-red-400 text-sm">Failed to load sent: {sentError}</p>
              <button
                onClick={() => loadSent(null)}
                className="mt-2 px-3 py-1.5 text-xs rounded-lg bg-white/5 border border-white/10 text-white/70 hover:bg-white/10"
              >
                Retry
              </button>
            </GlassCard>
          )}

          {view === "sent" && sentLoading && sentThreads.length === 0 && (
            <div className="flex items-center justify-center py-12 text-white/40">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          )}

          {filtered.length === 0 && !(view === "sent" && (sentLoading || sentError)) && (
            <GlassCard className="text-center py-12">
              <Mail className="h-8 w-8 text-white/20 mx-auto mb-3" />
              <p className="text-white/40 text-sm">
                {view === "sent" ? "No sent emails" : "No conversations to show"}
              </p>
              <p className="text-white/25 text-xs mt-1">
                {view === "sent" ? "Sends will appear here" : "Try syncing or adjusting filters"}
              </p>
            </GlassCard>
          )}
```

Then, immediately after the `{filtered.map((thread) => ( ... ))}` block that renders `ThreadRow` (it ends around line 256+), add a "Load more" button for the Sent view:

```tsx
          {view === "sent" && sentCursor && (
            <button
              onClick={() => loadSent(sentCursor)}
              disabled={sentLoading}
              className="w-full mt-2 px-3 py-2 text-xs font-medium rounded-lg bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 disabled:opacity-50"
            >
              {sentLoading ? "Loading…" : "Load more"}
            </button>
          )}
```

- [ ] **Step 5: Add source badge + delivery-status chip in `MessageBlock`**

In `app/admin/inbox/inbox-client.tsx`, inside `MessageBlock`, replace the existing outbound "Sent" badge block (lines 683-687) with:

```tsx
            {isOutbound && (
              <span className="text-[10px] font-medium uppercase tracking-wide text-[#6e86ff]/70 shrink-0">
                {message.source === "sendgrid" ? "SendGrid" : "Sent"}
              </span>
            )}
            {message.delivery_status &&
              message.delivery_status !== "sent" && (
                <span className="text-[10px] font-medium uppercase tracking-wide text-emerald-400/70 shrink-0">
                  {message.delivery_status}
                </span>
              )}
```

- [ ] **Step 6: Typecheck and lint**

Run: `npx tsc --noEmit`
Expected: exit 0.

Run: `npm run lint`
Expected: no errors in `app/admin/inbox/inbox-client.tsx` or the new files.

- [ ] **Step 7: Manual verification in the browser**

Run: `npm run dev`, open `/admin/inbox`.
Verify:
1. An "Inbox / Sent" toggle appears above the All/Correlated/Uncorrelated tabs.
2. Clicking **Sent** loads sent threads (spinner → list).
3. SendGrid sends show a "SendGrid" badge; opened/clicked/bounced sends show a status chip.
4. A send with a known reply appears as one thread containing both messages.
5. "Load more" appends older sends and stops when exhausted.
6. Switching back to **Inbox** shows the original inbox unchanged.

---

## Task 6: Full test + typecheck sweep and commit

**Files:** none (verification + commit)

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: PASS (all suites, including the three new inbox test files and the existing `group-threads.test.ts`).

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

> NOTE: This repo's owner prefers a single commit at the end of the work, not per-task. If executing this plan task-by-task with intermediate commits, confirm with the owner first. The bundled commit should also include the earlier sequence-dispatcher fix if it has not yet been committed.

```bash
git add lib/inbox/group-threads.ts lib/inbox/group-sent-threads.ts \
  lib/inbox/group-sent-threads.test.ts lib/inbox/sent-message.ts \
  lib/inbox/sent-message.test.ts lib/inbox/load-sent.ts \
  app/api/inbox/sent/route.ts app/admin/inbox/inbox-client.tsx \
  docs/superpowers/specs/2026-06-02-inbox-sent-tab-design.md \
  docs/superpowers/plans/2026-06-02-inbox-sent-tab.md
git commit -m "feat(inbox): add threaded Sent tab merging SendGrid sends + inbox replies"
```

---

## Self-Review Notes

- **Spec coverage:** data model (Task 3) · route `/api/inbox/sent` (Task 4) · grouping/correlation (Task 2) · client tab + badges + load-more (Task 5) · dedup via `detail.inbound_emails_id` (Tasks 3, 4) · tests for all pure pieces (Tasks 2, 3) · error/empty states (Tasks 4, 5). All spec sections map to a task.
- **Pagination tradeoff** (spec "Out of scope"): `loadSentPage` merges two per-source pages and slices to `limit`; a thread spanning a page boundary may render as two partials. Accepted for MVP.
- **No DB migration**, consistent with the spec.
