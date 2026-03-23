# Telegram Bot — Real-Time CRM Notifications & Control

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a long-running Telegram bot that provides real-time CRM notifications via Supabase Realtime and an inline-keyboard menu for querying/triggering actions from mobile.

**Architecture:** Standalone Node.js process in `bot/` directory. Two concurrent loops: Supabase Realtime subscriptions for DB change notifications, and Grammy bot for Telegram command/menu handling. Rate-limited message queue prevents Telegram API throttling. Batch tracker groups rapid job events into self-updating messages.

**Tech Stack:** Node.js 20, TypeScript, Grammy (Telegram bot framework), @supabase/supabase-js (Realtime + queries), tsx (dev runner)

**Spec:** `docs/superpowers/specs/2026-03-23-telegram-bot-design.md`

---

## File Structure

```
bot/
├── src/
│   ├── index.ts            # Entry point — starts bot + Realtime listener
│   ├── supabase.ts          # Supabase client singleton (service role)
│   ├── realtime.ts          # Supabase Realtime subscriptions + event routing
│   ├── notifications.ts     # Rate limiter queue, send/edit helpers, message formatting
│   ├── batch-tracker.ts     # In-memory job tracking, progress polling, message editing
│   ├── menus/
│   │   ├── main.ts          # Main menu keyboard + callback router
│   │   ├── dashboard.ts     # Dashboard stats query + render
│   │   ├── inbox.ts         # Recent replies list + sync trigger
│   │   ├── enrich.ts        # Enrichment target picker + trigger
│   │   ├── activity.ts      # Recent job_log query + render
│   │   └── settings.ts      # Mute/unmute state
│   └── types.ts             # Minimal types (subset from app's lib/types/database.ts)
├── tests/
│   ├── notifications.test.ts
│   ├── batch-tracker.test.ts
│   ├── realtime.test.ts
│   └── menus/
│       ├── dashboard.test.ts
│       └── settings.test.ts
├── package.json
├── tsconfig.json
└── Dockerfile
```

---

## Task 1: Project Scaffolding

**Files:**
- Create: `bot/package.json`
- Create: `bot/tsconfig.json`
- Create: `bot/Dockerfile`
- Create: `bot/src/types.ts`
- Create: `bot/src/supabase.ts`

- [ ] **Step 1: Create `bot/package.json`**

```json
{
  "name": "cannes-telegram-bot",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.99.2",
    "grammy": "^1.35.0"
  },
  "devDependencies": {
    "tsx": "^4.19.0",
    "typescript": "^5.8.0",
    "vitest": "^3.1.0",
    "@types/node": "^22.0.0"
  }
}
```

- [ ] **Step 2: Create `bot/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "resolveJsonModule": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 3: Create `bot/Dockerfile`**

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
RUN npx tsc
CMD ["node", "dist/index.js"]
```

- [ ] **Step 4: Create `bot/src/types.ts`**

Copy the subset of types needed from `lib/types/database.ts`. The bot needs: `InteractionStatus`, `InteractionChannel`, `Interaction`, `InboundEmail`, `JobLog`, `Person`, `Organization`. Copy these types verbatim — don't import from the app (the bot is a separate package with its own dependency tree).

```typescript
// bot/src/types.ts — Minimal types for the Telegram bot (subset of app types)

export type InteractionStatus = "draft" | "scheduled" | "sending" | "sent" | "delivered" | "opened" | "replied" | "bounced" | "failed";
export type InteractionChannel = "email" | "linkedin" | "twitter" | "telegram" | "in_person" | "phone";

export interface Person {
  id: string;
  full_name: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  title: string | null;
  created_at: string;
}

export interface Organization {
  id: string;
  name: string;
  icp_score: number | null;
  category: string | null;
  created_at: string;
}

export interface Interaction {
  id: string;
  person_id: string | null;
  organization_id: string | null;
  channel: InteractionChannel | null;
  status: InteractionStatus;
  subject: string | null;
  created_at: string;
  updated_at: string;
}

export interface InboundEmail {
  id: string;
  from_address: string;
  from_name: string | null;
  subject: string | null;
  body_preview: string | null;
  received_at: string;
  person_id: string | null;
  correlated_interaction_id: string | null;
  created_at: string;
}

export interface JobLog {
  id: string;
  job_type: string;
  target_table: string | null;
  target_id: string | null;
  status: string;
  error: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}
```

- [ ] **Step 5: Create `bot/src/supabase.ts`**

```typescript
// bot/src/supabase.ts — Supabase client singleton (service role for Realtime + queries)

import { createClient, SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (client) return client;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  client = createClient(url, key);
  return client;
}
```

- [ ] **Step 6: Install dependencies**

```bash
cd bot && npm install
```

- [ ] **Step 7: Verify TypeScript compiles**

```bash
cd bot && npx tsc --noEmit
```
Expected: No errors (only types.ts and supabase.ts exist, no imports that would fail).

- [ ] **Step 8: Commit**

```bash
git add bot/
git commit -m "feat(bot): scaffold Telegram bot project with types and Supabase client"
```

---

## Task 2: Notifications Module (Rate Limiter + Formatters + Send/Edit)

**Files:**
- Create: `bot/src/notifications.ts`
- Create: `bot/tests/notifications.test.ts`

This is the core messaging layer. It handles:
1. Rate-limited FIFO queue (max 1 msg/sec to Telegram)
2. Send and edit helpers via Telegram Bot API
3. Message formatters for each notification type
4. Queue overflow collapse (>50 items → single summary)

- [ ] **Step 1: Write failing tests for message formatters**

```typescript
// bot/tests/notifications.test.ts
import { describe, it, expect } from "vitest";
import {
  formatReplyNotification,
  formatBounceNotification,
  formatInteractionReplied,
  formatBatchStart,
  formatBatchProgress,
  formatBatchComplete,
} from "../src/notifications.js";

describe("formatReplyNotification", () => {
  it("formats inbound email reply", () => {
    const result = formatReplyNotification(
      { full_name: "Alice Smith", id: "p1" },
      { name: "Acme Corp", icp_score: 85 },
      { subject: "Re: EthCC intro", body_preview: "Sounds great, let's chat!" }
    );
    expect(result).toContain("Alice Smith");
    expect(result).toContain("Acme Corp");
    expect(result).toContain("Re: EthCC intro");
    expect(result).toContain("Sounds great");
  });

  it("handles null org gracefully", () => {
    const result = formatReplyNotification(
      { full_name: "Bob", id: "p2" },
      null,
      { subject: null, body_preview: null }
    );
    expect(result).toContain("Bob");
    expect(result).toContain("Unknown");
  });
});

describe("formatBounceNotification", () => {
  it("formats bounce with contact and org", () => {
    const result = formatBounceNotification(
      { full_name: "Carol Lee", id: "p3" },
      { name: "DeFi Labs" },
      { from_address: "carol@defi.io", subject: "Re: Collab" }
    );
    expect(result).toContain("Carol Lee");
    expect(result).toContain("DeFi Labs");
    expect(result).toContain("Bounce");
  });
});

describe("formatBatchStart", () => {
  it("formats batch job start message", () => {
    const result = formatBatchStart("enrichment_full", 47);
    expect(result).toContain("47");
    expect(result).toContain("enrichment");
  });
});

describe("formatBatchProgress", () => {
  it("formats progress update", () => {
    const result = formatBatchProgress("enrichment_full", 23, 47);
    expect(result).toContain("23");
    expect(result).toContain("47");
  });
});

describe("formatBatchComplete", () => {
  it("formats completed job", () => {
    const result = formatBatchComplete("enrichment_full", 44, 3);
    expect(result).toContain("44");
    expect(result).toContain("3");
  });

  it("formats failed job", () => {
    const result = formatBatchComplete("enrichment_full", 0, 47, "API rate limit");
    expect(result).toContain("Failed");
    expect(result).toContain("API rate limit");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd bot && npx vitest run tests/notifications.test.ts
```
Expected: FAIL — functions not found.

- [ ] **Step 3: Write failing tests for RateLimiter**

Add to `bot/tests/notifications.test.ts`:

```typescript
import { RateLimiter } from "../src/notifications.js";

describe("RateLimiter", () => {
  it("processes items in FIFO order", async () => {
    const results: string[] = [];
    const limiter = new RateLimiter(async (msg) => {
      results.push(msg);
    }, 10); // 10ms interval for fast tests

    limiter.enqueue("a");
    limiter.enqueue("b");
    limiter.enqueue("c");

    // Wait for processing
    await new Promise((r) => setTimeout(r, 100));
    limiter.stop();

    expect(results).toEqual(["a", "b", "c"]);
  });

  it("collapses queue when exceeding 50 items", () => {
    const results: string[] = [];
    const limiter = new RateLimiter(async (msg) => {
      results.push(msg);
    }, 10);

    // Enqueue 55 items
    for (let i = 0; i < 55; i++) {
      limiter.enqueue(`item-${i}`);
    }

    // Queue should have been collapsed
    expect(limiter.queueSize).toBeLessThanOrEqual(1);
    limiter.stop();
  });
});
```

- [ ] **Step 4: Implement `bot/src/notifications.ts`**

```typescript
// bot/src/notifications.ts — Message formatting, send/edit, rate limiter queue

const BOT_TOKEN = () => process.env.TELEGRAM_BOT_TOKEN!;
const CHAT_ID = () => process.env.TELEGRAM_CHAT_ID!;
const TG_API = () => `https://api.telegram.org/bot${BOT_TOKEN()}`;

// ─── Telegram API helpers ───

export async function sendMessage(text: string): Promise<number | null> {
  try {
    const res = await fetch(`${TG_API()}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: CHAT_ID(),
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
    const data = await res.json();
    if (!data.ok) {
      console.error("[tg] sendMessage failed:", data.description);
      return null;
    }
    return data.result.message_id;
  } catch (err) {
    console.error("[tg] sendMessage error:", err);
    return null;
  }
}

export async function editMessage(messageId: number, text: string): Promise<boolean> {
  try {
    const res = await fetch(`${TG_API()}/editMessageText`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: CHAT_ID(),
        message_id: messageId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
    const data = await res.json();
    if (!data.ok) {
      console.error("[tg] editMessage failed:", data.description);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[tg] editMessage error:", err);
    return false;
  }
}

// ─── Rate Limiter ───

export class RateLimiter {
  private queue: string[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private processor: (msg: string) => Promise<void>;

  constructor(processor: (msg: string) => Promise<void>, intervalMs = 1000) {
    this.processor = processor;
    this.timer = setInterval(() => this.flush(), intervalMs);
  }

  get queueSize(): number {
    return this.queue.length;
  }

  enqueue(message: string): void {
    this.queue.push(message);
    if (this.queue.length > 50) {
      const count = this.queue.length;
      this.queue = [`📋 ${count} notifications queued — showing summary:\n\nToo many events to display individually. Check the dashboard for details.`];
    }
  }

  private async flush(): Promise<void> {
    const msg = this.queue.shift();
    if (msg) {
      await this.processor(msg);
    }
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

// ─── Formatters ───

export function formatReplyNotification(
  contact: { full_name: string; id: string },
  org: { name: string; icp_score: number | null } | null,
  email: { subject: string | null; body_preview: string | null }
): string {
  const orgName = org?.name || "Unknown Company";
  const icp = org?.icp_score ?? "N/A";
  const preview = email.body_preview?.slice(0, 100) || "(no preview)";
  const subject = email.subject || "(no subject)";

  return [
    `📬 <b>Reply from ${contact.full_name}</b> (${orgName})`,
    `ICP: ${icp} | Channel: Email`,
    `Subject: ${subject}`,
    `Preview: ${preview}`,
  ].join("\n");
}

export function formatBounceNotification(
  contact: { full_name: string; id: string },
  org: { name: string } | null,
  email: { from_address: string; subject: string | null }
): string {
  const orgName = org?.name || "Unknown Company";

  return [
    `⚠️ <b>Bounce Detected:</b> ${contact.full_name} (${orgName})`,
    `From: ${email.from_address}`,
    `Subject: ${email.subject || "(no subject)"}`,
  ].join("\n");
}

export function formatInteractionReplied(
  contact: { full_name: string },
  org: { name: string } | null,
  channel: string | null
): string {
  const orgName = org?.name || "Unknown";
  return `💬 <b>${contact.full_name}</b> (${orgName}) replied via ${channel || "unknown"}`;
}

export function formatBatchStart(jobType: string, total: number): string {
  return `⏳ <b>${jobType}</b> — processing ${total} items...`;
}

export function formatBatchProgress(jobType: string, done: number, total: number): string {
  const pct = Math.round((done / total) * 100);
  const bar = "█".repeat(Math.floor(pct / 10)) + "░".repeat(10 - Math.floor(pct / 10));
  return `⏳ <b>${jobType}</b>\n${bar} ${done}/${total} (${pct}%)`;
}

export function formatBatchComplete(
  jobType: string,
  successes: number,
  failures: number,
  error?: string
): string {
  if (error) {
    return `❌ <b>${jobType} Failed</b>\nError: ${error}\nSuccesses: ${successes} | Failures: ${failures}`;
  }
  return `✅ <b>${jobType} Complete</b>\nSuccesses: ${successes} | Failures: ${failures}`;
}
```

- [ ] **Step 5: Run tests and verify they pass**

```bash
cd bot && npx vitest run tests/notifications.test.ts
```
Expected: All PASS.

- [ ] **Step 6: Commit**

```bash
git add bot/src/notifications.ts bot/tests/notifications.test.ts
git commit -m "feat(bot): add notifications module with rate limiter and formatters"
```

---

## Task 3: Batch Tracker

**Files:**
- Create: `bot/src/batch-tracker.ts`
- Create: `bot/tests/batch-tracker.test.ts`

Tracks active `job_log` entries, polls for progress, edits Telegram messages.

- [ ] **Step 1: Write failing tests**

```typescript
// bot/tests/batch-tracker.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BatchTracker } from "../src/batch-tracker.js";

describe("BatchTracker", () => {
  let tracker: BatchTracker;

  beforeEach(() => {
    tracker = new BatchTracker();
  });

  it("tracks a new job", () => {
    tracker.track("job-1", 123);
    expect(tracker.isTracking("job-1")).toBe(true);
    expect(tracker.getMessageId("job-1")).toBe(123);
  });

  it("removes completed jobs", () => {
    tracker.track("job-1", 123);
    tracker.complete("job-1");
    expect(tracker.isTracking("job-1")).toBe(false);
  });

  it("reports whether any jobs are active", () => {
    expect(tracker.hasActiveJobs()).toBe(false);
    tracker.track("job-1", 123);
    expect(tracker.hasActiveJobs()).toBe(true);
  });

  it("detects stale jobs (>10 minutes since last edit)", () => {
    tracker.track("job-1", 123);
    // Manually set lastEdit to 11 minutes ago
    tracker.setLastEdit("job-1", Date.now() - 11 * 60 * 1000);
    const stale = tracker.getStaleJobs();
    expect(stale).toContain("job-1");
  });

  it("returns active job IDs", () => {
    tracker.track("j1", 1);
    tracker.track("j2", 2);
    expect(tracker.getActiveJobIds()).toEqual(["j1", "j2"]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd bot && npx vitest run tests/batch-tracker.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Implement `bot/src/batch-tracker.ts`**

```typescript
// bot/src/batch-tracker.ts — In-memory job tracking for batch progress messages

interface TrackedJob {
  messageId: number;
  lastEdit: number;
}

const STALE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes

export class BatchTracker {
  private jobs = new Map<string, TrackedJob>();

  track(jobId: string, messageId: number): void {
    this.jobs.set(jobId, { messageId, lastEdit: Date.now() });
  }

  complete(jobId: string): void {
    this.jobs.delete(jobId);
  }

  isTracking(jobId: string): boolean {
    return this.jobs.has(jobId);
  }

  getMessageId(jobId: string): number | null {
    return this.jobs.get(jobId)?.messageId ?? null;
  }

  hasActiveJobs(): boolean {
    return this.jobs.size > 0;
  }

  getActiveJobIds(): string[] {
    return Array.from(this.jobs.keys());
  }

  touchLastEdit(jobId: string): void {
    const job = this.jobs.get(jobId);
    if (job) job.lastEdit = Date.now();
  }

  /** For testing — manually set lastEdit timestamp */
  setLastEdit(jobId: string, timestamp: number): void {
    const job = this.jobs.get(jobId);
    if (job) job.lastEdit = timestamp;
  }

  getStaleJobs(): string[] {
    const now = Date.now();
    const stale: string[] = [];
    for (const [id, job] of this.jobs) {
      if (now - job.lastEdit > STALE_THRESHOLD_MS) {
        stale.push(id);
      }
    }
    return stale;
  }

  cleanupStale(): string[] {
    const stale = this.getStaleJobs();
    for (const id of stale) this.jobs.delete(id);
    return stale;
  }
}
```

- [ ] **Step 4: Run tests and verify they pass**

```bash
cd bot && npx vitest run tests/batch-tracker.test.ts
```
Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add bot/src/batch-tracker.ts bot/tests/batch-tracker.test.ts
git commit -m "feat(bot): add batch tracker for job progress messages"
```

---

## Task 4: Mute State (Settings Foundation)

**Files:**
- Create: `bot/src/menus/settings.ts`
- Create: `bot/tests/menus/settings.test.ts`

Mute state is used by both notifications and menus, so build it first.

- [ ] **Step 1: Write failing tests**

```typescript
// bot/tests/menus/settings.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MuteState } from "../../src/menus/settings.js";

describe("MuteState", () => {
  let mute: MuteState;

  beforeEach(() => {
    mute = new MuteState();
  });

  it("starts unmuted", () => {
    expect(mute.isMuted()).toBe(false);
  });

  it("mutes for specified duration", () => {
    mute.muteFor(60); // 60 minutes
    expect(mute.isMuted()).toBe(true);
  });

  it("unmutes manually", () => {
    mute.muteFor(60);
    mute.unmute();
    expect(mute.isMuted()).toBe(false);
  });

  it("auto-unmutes after duration expires", () => {
    vi.useFakeTimers();
    mute.muteFor(1); // 1 minute
    expect(mute.isMuted()).toBe(true);
    vi.advanceTimersByTime(61 * 1000);
    expect(mute.isMuted()).toBe(false);
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd bot && npx vitest run tests/menus/settings.test.ts
```

- [ ] **Step 3: Implement `bot/src/menus/settings.ts`**

```typescript
// bot/src/menus/settings.ts — Mute/unmute state + settings menu

import { InlineKeyboard } from "grammy";

export class MuteState {
  private mutedUntil: number | null = null;

  isMuted(): boolean {
    if (this.mutedUntil === null) return false;
    if (Date.now() >= this.mutedUntil) {
      this.mutedUntil = null;
      return false;
    }
    return true;
  }

  muteFor(minutes: number): void {
    this.mutedUntil = Date.now() + minutes * 60 * 1000;
  }

  unmute(): void {
    this.mutedUntil = null;
  }

  remainingMinutes(): number {
    if (!this.mutedUntil) return 0;
    return Math.max(0, Math.ceil((this.mutedUntil - Date.now()) / 60_000));
  }
}

// Singleton — shared across menus and notification routing
export const muteState = new MuteState();

export function settingsText(): string {
  const status = muteState.isMuted()
    ? `🔇 Muted (${muteState.remainingMinutes()}m remaining)`
    : "🔊 Active";

  return `⚙️ <b>Settings</b>\n\nNotifications: ${status}`;
}

export function settingsKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("🔇 Mute 1h", "settings:mute:60")
    .text("🔇 Mute 4h", "settings:mute:240")
    .row()
    .text("🔊 Unmute", "settings:unmute")
    .text("← Back", "menu:main");
}
```

- [ ] **Step 4: Run tests and verify they pass**

```bash
cd bot && npx vitest run tests/menus/settings.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add bot/src/menus/settings.ts bot/tests/menus/settings.test.ts
git commit -m "feat(bot): add mute state and settings menu"
```

---

## Task 5: Menu System (Dashboard, Inbox, Enrich, Activity, Main)

**Files:**
- Create: `bot/src/menus/dashboard.ts`
- Create: `bot/src/menus/inbox.ts`
- Create: `bot/src/menus/enrich.ts`
- Create: `bot/src/menus/activity.ts`
- Create: `bot/src/menus/main.ts`

Each menu module exports: a text renderer function (queries Supabase, returns formatted string), a keyboard builder, and a callback handler. The main menu routes callbacks to the correct submenu.

- [ ] **Step 1: Create `bot/src/menus/dashboard.ts`**

```typescript
// bot/src/menus/dashboard.ts — Dashboard stats query + render

import { InlineKeyboard } from "grammy";
import { getSupabase } from "../supabase.js";

export async function dashboardText(): Promise<string> {
  const sb = getSupabase();

  const [persons, orgs, interactions, replied, pipeline, activeJobs] = await Promise.all([
    sb.from("persons").select("id", { count: "exact", head: true }),
    sb.from("organizations").select("id", { count: "exact", head: true }),
    sb.from("interactions").select("id", { count: "exact", head: true }),
    sb.from("interactions").select("id", { count: "exact", head: true }).eq("status", "replied"),
    sb.from("interactions").select("status"),
    sb.from("job_log").select("id, job_type, metadata", { count: "exact" }).eq("status", "processing"),
  ]);

  // Count pipeline statuses
  const statusCounts: Record<string, number> = {};
  for (const row of pipeline.data || []) {
    statusCounts[row.status] = (statusCounts[row.status] || 0) + 1;
  }

  const jobInfo = activeJobs.count
    ? `Active Jobs: ${activeJobs.count} (${(activeJobs.data || []).map((j) => j.job_type).join(", ")})`
    : "Active Jobs: None";

  return [
    "📊 <b>Dashboard</b>",
    "",
    `Persons: ${persons.count ?? 0}  |  Organizations: ${orgs.count ?? 0}`,
    `Interactions: ${interactions.count ?? 0}  |  Replied: ${replied.count ?? 0}`,
    "",
    "<b>Pipeline:</b>",
    `  Draft: ${statusCounts["draft"] || 0} | Scheduled: ${statusCounts["scheduled"] || 0} | Sent: ${statusCounts["sent"] || 0}`,
    `  Opened: ${statusCounts["opened"] || 0} | Replied: ${statusCounts["replied"] || 0} | Bounced: ${statusCounts["bounced"] || 0}`,
    "",
    jobInfo,
  ].join("\n");
}

export function dashboardKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("🔄 Refresh", "menu:dashboard")
    .text("← Back", "menu:main");
}
```

- [ ] **Step 2: Create `bot/src/menus/inbox.ts`**

```typescript
// bot/src/menus/inbox.ts — Recent replies + sync trigger

import { InlineKeyboard } from "grammy";
import { getSupabase } from "../supabase.js";

export async function inboxText(): Promise<string> {
  const sb = getSupabase();

  // Simple query — join person name directly
  const { data: emails } = await sb
    .from("inbound_emails")
    .select("id, from_name, subject, body_preview, received_at, person_id, persons ( full_name )")
    .not("person_id", "is", null)
    .order("received_at", { ascending: false })
    .limit(5);

  if (!emails || emails.length === 0) {
    return "📬 <b>Inbox</b>\n\nNo recent replies from pipeline contacts.";
  }

  const lines = emails.map((e: any, i: number) => {
    const name = e.persons?.full_name || e.from_name || "Unknown";
    const subject = e.subject || "(no subject)";
    const ago = timeAgo(e.received_at);
    return `${i + 1}. <b>${name}</b> — "${subject}" — ${ago}`;
  });

  return [`📬 <b>Inbox</b> (${emails.length} recent)`, "", ...lines].join("\n");
}

export function inboxKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("🔄 Sync Now", "inbox:sync")
    .text("← Back", "menu:main");
}

function timeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
```

- [ ] **Step 3: Create `bot/src/menus/enrich.ts`**

```typescript
// bot/src/menus/enrich.ts — Enrichment target picker + trigger

import { InlineKeyboard } from "grammy";
import { getSupabase } from "../supabase.js";

export function enrichText(): string {
  return "🔍 <b>Enrichment</b>\n\nSelect an action:";
}

export function enrichKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("▶️ Run Full Pipeline", "enrich:targets")
    .text("📊 Active Jobs", "menu:activity")
    .row()
    .text("← Back", "menu:main");
}

export function enrichTargetsText(): string {
  return "Select target:";
}

export function enrichTargetsKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("Unenriched Orgs", "enrich:run:unenriched")
    .text("ICP Below 50", "enrich:run:low_icp")
    .row()
    .text("← Back", "menu:enrich");
}

export async function triggerEnrichment(target: string): Promise<string> {
  const sb = getSupabase();

  let filter: Record<string, unknown> = {};
  if (target === "unenriched") {
    filter = { icp_score: null };
  } else if (target === "low_icp") {
    filter = { icp_below: 50 };
  }

  const { data, error } = await sb.functions.invoke("enrich-company", {
    body: { target, filter },
  });

  if (error) {
    return `❌ Failed to start enrichment: ${error.message}`;
  }

  return `✅ Enrichment pipeline started for "${target}" targets.`;
}
```

- [ ] **Step 4: Create `bot/src/menus/activity.ts`**

```typescript
// bot/src/menus/activity.ts — Recent job_log query + render

import { InlineKeyboard } from "grammy";
import { getSupabase } from "../supabase.js";

export async function activityText(): Promise<string> {
  const sb = getSupabase();

  const { data: jobs } = await sb
    .from("job_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(10);

  if (!jobs || jobs.length === 0) {
    return "📋 <b>Recent Activity</b>\n\nNo recent jobs.";
  }

  const lines = jobs.map((j) => {
    const icon = j.status === "completed" ? "✅" : j.status === "failed" ? "❌" : "⏳";
    const meta = j.metadata as Record<string, unknown> | null;
    const detail = meta
      ? Object.entries(meta)
          .filter(([k]) => typeof meta[k] === "number")
          .map(([k, v]) => `${v} ${k}`)
          .join(", ")
      : "";
    const ago = timeAgo(j.created_at);
    return `${icon} ${j.job_type}${detail ? ` — ${detail}` : ""} — ${ago}`;
  });

  return [`📋 <b>Recent Activity</b>`, "", ...lines].join("\n");
}

export function activityKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("🔄 Refresh", "menu:activity")
    .text("← Back", "menu:main");
}

function timeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
```

- [ ] **Step 5: Create `bot/src/menus/main.ts`**

This is the callback router. It handles `/start`, all `menu:*` callbacks, and delegates to action handlers.

```typescript
// bot/src/menus/main.ts — Main menu keyboard + callback router

import { Bot, InlineKeyboard, Context } from "grammy";
import { dashboardText, dashboardKeyboard } from "./dashboard.js";
import { inboxText, inboxKeyboard } from "./inbox.js";
import { enrichText, enrichKeyboard, enrichTargetsText, enrichTargetsKeyboard, triggerEnrichment } from "./enrich.js";
import { activityText, activityKeyboard } from "./activity.js";
import { settingsText, settingsKeyboard, muteState } from "./settings.js";

const CHAT_ID = () => process.env.TELEGRAM_CHAT_ID!;

function mainText(): string {
  return "🤖 <b>FP Block CRM Bot</b>\n\nSelect an option:";
}

function mainKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("📊 Dashboard", "menu:dashboard")
    .text("📬 Inbox", "menu:inbox")
    .text("🔍 Enrich", "menu:enrich")
    .row()
    .text("⚙️ Settings", "menu:settings")
    .text("📋 Recent Activity", "menu:activity");
}

export function registerMenuHandlers(bot: Bot): void {
  // /start command — send main menu as new message
  bot.command("start", async (ctx) => {
    if (String(ctx.chat.id) !== CHAT_ID()) return;
    await ctx.reply(mainText(), {
      parse_mode: "HTML",
      reply_markup: mainKeyboard(),
    });
  });

  // Callback query router — edit message in-place
  bot.on("callback_query:data", async (ctx) => {
    if (String(ctx.chat?.id) !== CHAT_ID()) return;

    const data = ctx.callbackQuery.data;
    await ctx.answerCallbackQuery();

    try {
      const { text, keyboard } = await routeCallback(data);
      await ctx.editMessageText(text, {
        parse_mode: "HTML",
        reply_markup: keyboard,
        disable_web_page_preview: true,
      });
    } catch (err) {
      console.error("[menu] Error handling callback:", data, err);
    }
  });
}

async function routeCallback(data: string): Promise<{ text: string; keyboard: InlineKeyboard }> {
  switch (data) {
    case "menu:main":
      return { text: mainText(), keyboard: mainKeyboard() };

    case "menu:dashboard":
      return { text: await dashboardText(), keyboard: dashboardKeyboard() };

    case "menu:inbox":
      return { text: await inboxText(), keyboard: inboxKeyboard() };

    case "menu:enrich":
      return { text: enrichText(), keyboard: enrichKeyboard() };

    case "enrich:targets":
      return { text: enrichTargetsText(), keyboard: enrichTargetsKeyboard() };

    case "menu:activity":
      return { text: await activityText(), keyboard: activityKeyboard() };

    case "menu:settings":
      return { text: settingsText(), keyboard: settingsKeyboard() };

    default:
      // Action handlers
      if (data.startsWith("settings:mute:")) {
        const mins = parseInt(data.split(":")[2], 10);
        muteState.muteFor(mins);
        return { text: settingsText(), keyboard: settingsKeyboard() };
      }
      if (data === "settings:unmute") {
        muteState.unmute();
        return { text: settingsText(), keyboard: settingsKeyboard() };
      }
      if (data.startsWith("enrich:run:")) {
        const target = data.split(":")[2];
        const result = await triggerEnrichment(target);
        return {
          text: `🔍 <b>Enrichment</b>\n\n${result}`,
          keyboard: new InlineKeyboard()
            .text("📊 View Jobs", "menu:activity")
            .text("← Back", "menu:enrich"),
        };
      }
      if (data === "inbox:sync") {
        // Trigger inbox sync via the Next.js API
        const appUrl = process.env.APP_URL || "http://localhost:3000";
        try {
          await fetch(`${appUrl}/api/inbox/sync`, { method: "POST" });
        } catch { /* best-effort */ }
        return {
          text: "📬 <b>Inbox</b>\n\n🔄 Sync triggered. Refreshing...",
          keyboard: inboxKeyboard(),
        };
      }

      return { text: mainText(), keyboard: mainKeyboard() };
  }
}
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
cd bot && npx tsc --noEmit
```
Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add bot/src/menus/
git commit -m "feat(bot): add menu system (dashboard, inbox, enrich, activity, main router)"
```

---

## Task 6: Supabase Realtime Subscriptions

**Files:**
- Create: `bot/src/realtime.ts`

Subscribes to Postgres changes via Supabase Realtime and routes events to notification/batch-tracker logic.

- [ ] **Step 1: Implement `bot/src/realtime.ts`**

```typescript
// bot/src/realtime.ts — Supabase Realtime subscriptions + event routing

import { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabase } from "./supabase.js";
import { BatchTracker } from "./batch-tracker.js";
import {
  sendMessage,
  editMessage,
  formatReplyNotification,
  formatBounceNotification,
  formatInteractionReplied,
  formatBatchStart,
  formatBatchProgress,
  formatBatchComplete,
  RateLimiter,
} from "./notifications.js";
import { muteState } from "./menus/settings.js";
import type { InboundEmail, Interaction, JobLog } from "./types.js";

const batchTracker = new BatchTracker();

const rateLimiter = new RateLimiter(async (msg) => {
  await sendMessage(msg);
});

// Poll loop for batch progress
let pollTimer: ReturnType<typeof setInterval> | null = null;

export function startRealtimeSubscriptions(): RealtimeChannel {
  const sb = getSupabase();

  const channel = sb
    .channel("crm-notifications")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "inbound_emails" },
      (payload) => handleInboundEmail(payload.new as InboundEmail)
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "interactions" },
      (payload) => handleInteractionUpdate(payload.new as Interaction)
    )
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "job_log" },
      (payload) => handleJobLogInsert(payload.new as JobLog)
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "job_log" },
      (payload) => handleJobLogUpdate(payload.new as JobLog)
    )
    .subscribe((status) => {
      console.log(`[realtime] Subscription status: ${status}`);
    });

  // Start batch progress polling
  pollTimer = setInterval(() => pollBatchProgress(), 5000);

  return channel;
}

export function stopRealtime(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  rateLimiter.stop();
}

// ─── Event Handlers ───

async function handleInboundEmail(email: InboundEmail): Promise<void> {
  if (!email.person_id) return; // Only notify for correlated emails
  if (muteState.isMuted()) return;

  const sb = getSupabase();

  // Look up person + org
  const { data: person } = await sb
    .from("persons")
    .select("id, full_name")
    .eq("id", email.person_id)
    .single();

  if (!person) return;

  const { data: orgLink } = await sb
    .from("person_organizations")
    .select("organizations ( name, icp_score )")
    .eq("person_id", person.id)
    .eq("is_primary", true)
    .single();

  const org = (orgLink as any)?.organizations || null;

  const msg = formatReplyNotification(
    person,
    org,
    { subject: email.subject, body_preview: email.body_preview }
  );
  rateLimiter.enqueue(msg);
}

async function handleInteractionUpdate(interaction: Interaction): Promise<void> {
  if (muteState.isMuted()) return;

  // Suppress if batch job is active
  if (batchTracker.hasActiveJobs()) return;

  if (interaction.status === "bounced" || interaction.status === "replied") {
    const sb = getSupabase();

    let person: { full_name: string; id: string } | null = null;
    let org: { name: string } | null = null;

    if (interaction.person_id) {
      const { data } = await sb
        .from("persons")
        .select("id, full_name")
        .eq("id", interaction.person_id)
        .single();
      person = data;
    }

    if (interaction.organization_id) {
      const { data } = await sb
        .from("organizations")
        .select("name")
        .eq("id", interaction.organization_id)
        .single();
      org = data;
    }

    if (!person) return;

    const msg =
      interaction.status === "bounced"
        ? formatBounceNotification(person, org, {
            from_address: person.full_name,
            subject: interaction.subject,
          })
        : formatInteractionReplied(person, org, interaction.channel);

    rateLimiter.enqueue(msg);
  }
}

async function handleJobLogInsert(job: JobLog): Promise<void> {
  if (job.status !== "processing") return;

  const meta = job.metadata || {};
  const total = (meta.total as number) || 0;

  const msg = formatBatchStart(job.job_type, total);
  const messageId = await sendMessage(msg);

  if (messageId) {
    batchTracker.track(job.id, messageId);
  }
}

async function handleJobLogUpdate(job: JobLog): Promise<void> {
  if (!batchTracker.isTracking(job.id)) return;

  const messageId = batchTracker.getMessageId(job.id);
  if (!messageId) return;

  if (job.status === "completed" || job.status === "failed") {
    const meta = (job.metadata || {}) as Record<string, number>;
    const msg = formatBatchComplete(
      job.job_type,
      meta.successes || 0,
      meta.failures || 0,
      job.status === "failed" ? (job.error || "Unknown error") : undefined
    );
    await editMessage(messageId, msg);
    batchTracker.complete(job.id);
    return;
  }

  // Progress update — handled by poll loop
}

async function pollBatchProgress(): Promise<void> {
  // Capture stale job message IDs before cleanup deletes them
  const staleIds = batchTracker.getStaleJobs();
  const staleMessages = staleIds.map((id) => ({ id, msgId: batchTracker.getMessageId(id) }));
  batchTracker.cleanupStale();
  for (const { msgId } of staleMessages) {
    if (msgId) {
      await editMessage(msgId, "⚠️ Job tracking timed out (no updates for 10 minutes)");
    }
  }

  if (!batchTracker.hasActiveJobs()) return;

  const sb = getSupabase();
  for (const jobId of batchTracker.getActiveJobIds()) {
    const { data: job } = await sb
      .from("job_log")
      .select("*")
      .eq("id", jobId)
      .single();

    if (!job) continue;

    const meta = (job.metadata || {}) as Record<string, number>;
    const done = meta.completed || meta.successes || 0;
    const total = meta.total || 0;
    if (total === 0) continue;

    const messageId = batchTracker.getMessageId(jobId);
    if (!messageId) continue;

    const msg = formatBatchProgress(job.job_type, done, total);
    const edited = await editMessage(messageId, msg);
    if (edited) batchTracker.touchLastEdit(jobId);
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd bot && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add bot/src/realtime.ts
git commit -m "feat(bot): add Supabase Realtime subscriptions and event routing"
```

---

## Task 7: Entry Point + Final Wiring

**Files:**
- Create: `bot/src/index.ts`

Starts Grammy bot and Realtime subscriptions concurrently. Handles graceful shutdown.

- [ ] **Step 1: Implement `bot/src/index.ts`**

```typescript
// bot/src/index.ts — Entry point: starts Grammy bot + Supabase Realtime

import { Bot } from "grammy";
import { registerMenuHandlers } from "./menus/main.js";
import { startRealtimeSubscriptions, stopRealtime } from "./realtime.js";

async function main() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("Missing TELEGRAM_BOT_TOKEN");

  console.log("[bot] Starting FP Block CRM Bot...");

  // Initialize Grammy bot
  const bot = new Bot(token);
  registerMenuHandlers(bot);

  // Start Supabase Realtime subscriptions
  const channel = startRealtimeSubscriptions();
  console.log("[bot] Realtime subscriptions active");

  // Graceful shutdown
  const shutdown = async () => {
    console.log("[bot] Shutting down...");
    stopRealtime();
    await bot.stop();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Heartbeat logging
  setInterval(() => {
    console.log(`[bot] heartbeat — ${new Date().toISOString()}`);
  }, 60_000);

  // Start long-polling
  await bot.start({
    onStart: () => console.log("[bot] Grammy polling started"),
  });
}

main().catch((err) => {
  console.error("[bot] Fatal error:", err);
  process.exit(1);
});
```

- [ ] **Step 2: Verify full TypeScript compilation**

```bash
cd bot && npx tsc --noEmit
```
Expected: No errors.

- [ ] **Step 3: Run all tests**

```bash
cd bot && npx vitest run
```
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add bot/src/index.ts
git commit -m "feat(bot): add entry point wiring Grammy + Realtime"
```

---

## Task 8: Verify Full Build + Integration Smoke Test

- [ ] **Step 1: Full TypeScript build (emit JS)**

```bash
cd bot && npx tsc
```
Expected: `dist/` directory created with compiled JS.

- [ ] **Step 2: Verify dist structure**

```bash
ls -R bot/dist/
```
Expected: All `.js` files matching `src/` structure.

- [ ] **Step 3: Docker build test**

```bash
cd bot && docker build -t cannes-bot-test .
```
Expected: Build succeeds.

- [ ] **Step 4: Run all tests one final time**

```bash
cd bot && npx vitest run
```
Expected: All PASS.

- [ ] **Step 5: Final commit with all remaining files**

```bash
git add bot/
git commit -m "feat(bot): complete Telegram bot — real-time CRM notifications and menu system"
```
