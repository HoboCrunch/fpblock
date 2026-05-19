# Script-Sends Backfill & Pipeline Sync — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the `interactions` table reflect every email actually sent by the script blasts (~4,039 sends, 1,880 persons), retroactively flip already-received replies to `replied`, and prevent future script/manual sends from desyncing again.

**Architecture:** Three sequential stages plus two forward-looking guards. Stage 1 is a one-shot backfill script reading three `consensus/*.jsonl` logs into `interactions`, dedup'd by SendGrid message-id. Stage 2 re-runs the inbox correlator over existing `inbound_emails` so replies can now find matching outbound interactions and flip them to `replied`. Stage 3 closes the leak by writing to the DB inline from `send-outreach.ts` and by extending the Sent-mailbox sync to reconcile manual sends. Two small dashboard/pipeline UI additions land in the same PR to surface the new ground truth.

**Tech Stack:** Next.js 16, Supabase (Postgres + RLS), TypeScript, Vitest, tsx, csv-parse, SendGrid HTTP API.

**Spec:** `docs/superpowers/specs/2026-05-19-script-sends-backfill-design.md`

---

## File Structure

**Migrations (new):**
- `supabase/migrations/030_interactions_message_id_index.sql` — partial unique index on `interactions.detail->>'sendgrid_message_id'` for idempotency.
- `supabase/migrations/031_active_conversations_rpc.sql` — `active_conversations_count(window_days int)` RPC for the dashboard tile.

**Scripts (new):**
- `scripts/backfill_script_sends.ts` — Stage 1. Reads 3 JSONL logs, resolves body from source CSVs, inserts `interactions` rows, idempotent. CLI flags: `--dry-run`, `--yes`, `--limit N`, `--only <log-basename>`.
- `scripts/recorrelate_inbound.ts` — Stage 2. Walks `inbound_emails` and re-runs correlator with notifications suppressed.

**Library (new):**
- `lib/script-sends/body-resolver.ts` — pure module: build `(person_id, subject) → body` index from one or more CSVs; resolve.
- `lib/script-sends/build-interaction.ts` — pure module: given a JSONL entry + resolved body + sender lookup, build the `interactions` insert payload.
- `lib/script-sends/source-csv-map.ts` — static mapping from log basename → list of source CSV paths.
- `lib/inbox/find-person-by-email.ts` — extracted exact-email + domain-match person lookup (currently inline in `inbox-correlator.ts`); reused by sent-folder reconciler.

**Library (modified):**
- `lib/inbox-correlator.ts` — refactor: extract `findPersonByEmail`; add `{ notify?: boolean }` option to `correlateAndNotify` (default `true` for back-compat).
- `lib/inbox-sync.ts` — Stage 3b: after inserting an outbound row from Sent folder, call new `reconcileOutboundToInteraction()` helper.
- `scripts/send-outreach.ts` — Stage 3a: after each successful `sendEmail`, insert an `interactions` row. Continue on DB error.

**API routes (new):**
- `app/api/inbox/recorrelate/route.ts` — admin POST that runs the same module Stage 2 uses (one-off trigger from UI/curl).

**App / UI (modified):**
- `app/admin/pipeline/page.tsx` — add `source` to `PipelineContact`, populate from best interaction's `detail->>'source'`.
- `components/admin/pipeline-view.tsx` — render small `source` chip next to status.
- `lib/types/pipeline.ts` — add `source: string | null` to `PipelineContact`.
- `lib/queries/use-dashboard-stats.ts` — call new `active_conversations_count` RPC; add `activeConversations` to returned shape.
- `app/admin/page.tsx` — render "Active conversations" tile.

**Tests (new):**
- `lib/script-sends/body-resolver.test.ts`
- `lib/script-sends/build-interaction.test.ts`
- `lib/inbox/find-person-by-email.test.ts`
- `lib/inbox-correlator.test.ts` — covers the `notify: false` option path.

---

## Task 1: Migration — `sendgrid_message_id` unique index

**Files:**
- Create: `supabase/migrations/030_interactions_message_id_index.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 030_interactions_message_id_index.sql
-- Enforce idempotency for backfill + inline script sends. SendGrid message-ids
-- are unique per request, so two rows sharing one indicate a duplicate insert.

CREATE UNIQUE INDEX IF NOT EXISTS uniq_interactions_sendgrid_message_id
  ON interactions ((detail->>'sendgrid_message_id'))
  WHERE detail->>'sendgrid_message_id' IS NOT NULL;
```

- [ ] **Step 2: Apply the migration locally**

Run: `supabase db push` (or whatever this project uses — check the README; if unclear, run `npx supabase migration up` and confirm success).
Expected: migration `030` applied without error.

- [ ] **Step 3: Verify the index exists**

Run via `psql` or Supabase SQL editor:
```sql
SELECT indexname FROM pg_indexes WHERE tablename = 'interactions' AND indexname = 'uniq_interactions_sendgrid_message_id';
```
Expected: one row returned.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/030_interactions_message_id_index.sql
git commit -m "feat(db): unique index on interactions.detail.sendgrid_message_id"
```

---

## Task 2: `source-csv-map.ts` — log → CSV mapping

**Files:**
- Create: `lib/script-sends/source-csv-map.ts`

- [ ] **Step 1: Create the module**

```ts
// lib/script-sends/source-csv-map.ts
// Maps each send-log JSONL basename to the candidate source CSV paths (relative
// to repo root) that contain the bodies the script actually sent. Resolution
// walks the array in order; first (person_id, subject) match wins.

export const SOURCE_CSV_MAP: Record<string, string[]> = {
  "send_log.jsonl": [
    "consensus/outreach_messages.csv",
    "consensus/outreach_messages_employees.csv",
  ],
  "miami_dinner_send_log.jsonl": [
    "email-napalm.csv",
    "email-napalm-q1q2.csv",
    "email-napalm-q3.csv",
    "email-napalm-q4-half.csv",
    "email-napalm-no-replies.csv",
  ],
  "miami_dinner_bump1_send_log.jsonl": [
    "email-napalm-bump1.csv",
    "email-napalm-bump1-q1q2.csv",
    "email-napalm-bump1-q3.csv",
  ],
};

export const LOG_PATHS: Record<string, string> = {
  "send_log.jsonl": "consensus/send_log.jsonl",
  "miami_dinner_send_log.jsonl": "consensus/miami_dinner_send_log.jsonl",
  "miami_dinner_bump1_send_log.jsonl": "consensus/miami_dinner_bump1_send_log.jsonl",
};
```

- [ ] **Step 2: Commit**

```bash
git add lib/script-sends/source-csv-map.ts
git commit -m "feat(backfill): map send-log files to their source CSVs"
```

---

## Task 3: `body-resolver.ts` — load + lookup CSV bodies

**Files:**
- Create: `lib/script-sends/body-resolver.ts`
- Test: `lib/script-sends/body-resolver.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// lib/script-sends/body-resolver.test.ts
import { describe, it, expect } from "vitest";
import { buildBodyIndex, resolveBody } from "./body-resolver";
import { writeFileSync, mkdtempSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

function writeCsv(rows: Array<Record<string, string>>): string {
  const dir = mkdtempSync(join(tmpdir(), "body-resolver-"));
  const file = join(dir, "rows.csv");
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push(headers.map((h) => `"${(r[h] ?? "").replace(/"/g, '""')}"`).join(","));
  }
  writeFileSync(file, lines.join("\n"));
  return file;
}

describe("buildBodyIndex + resolveBody", () => {
  it("indexes by (person_id, subject) and resolves a match", () => {
    const csv = writeCsv([
      { person_id: "p1", subject: "Hi Alice", body: "Body for Alice" },
      { person_id: "p2", subject: "Hi Bob", body: "Body for Bob" },
    ]);
    const index = buildBodyIndex([csv]);
    expect(resolveBody(index, "p1", "Hi Alice")).toBe("Body for Alice");
    expect(resolveBody(index, "p2", "Hi Bob")).toBe("Body for Bob");
  });

  it("returns null on miss", () => {
    const csv = writeCsv([{ person_id: "p1", subject: "Hi", body: "x" }]);
    const index = buildBodyIndex([csv]);
    expect(resolveBody(index, "p1", "Different")).toBeNull();
    expect(resolveBody(index, "p2", "Hi")).toBeNull();
  });

  it("merges multiple CSVs; first-match-wins on key collision", () => {
    const a = writeCsv([{ person_id: "p1", subject: "S", body: "from-a" }]);
    const b = writeCsv([{ person_id: "p1", subject: "S", body: "from-b" }]);
    const index = buildBodyIndex([a, b]);
    expect(resolveBody(index, "p1", "S")).toBe("from-a");
  });

  it("skips CSVs missing person_id/subject/body columns without throwing", () => {
    const csv = writeCsv([{ other: "x" }]);
    const index = buildBodyIndex([csv]);
    expect(resolveBody(index, "p1", "S")).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/script-sends/body-resolver.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the module**

```ts
// lib/script-sends/body-resolver.ts
import { readFileSync, existsSync } from "fs";
import { parse } from "csv-parse/sync";

/**
 * Index keyed by `${person_id}::${subject}` → body. First-match-wins across CSVs
 * because the script's source-of-truth is whatever was rendered to the recipient
 * first, and the napalm CSVs sometimes contain stale "regenerated" variants.
 */
export type BodyIndex = Map<string, string>;

function keyFor(personId: string, subject: string): string {
  return `${personId}::${subject}`;
}

export function buildBodyIndex(csvPaths: string[]): BodyIndex {
  const index: BodyIndex = new Map();
  for (const path of csvPaths) {
    if (!existsSync(path)) continue;
    let rows: Array<Record<string, string>>;
    try {
      rows = parse(readFileSync(path, "utf-8"), {
        columns: true,
        skip_empty_lines: true,
        bom: true,
      });
    } catch {
      continue;
    }
    for (const r of rows) {
      const pid = r.person_id;
      const subj = r.subject;
      const body = r.body;
      if (!pid || !subj || body == null) continue;
      const k = keyFor(pid, subj);
      if (!index.has(k)) index.set(k, body);
    }
  }
  return index;
}

export function resolveBody(
  index: BodyIndex,
  personId: string,
  subject: string
): string | null {
  return index.get(keyFor(personId, subject)) ?? null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/script-sends/body-resolver.test.ts`
Expected: 4 PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/script-sends/body-resolver.ts lib/script-sends/body-resolver.test.ts
git commit -m "feat(backfill): CSV body resolver indexed by (person_id, subject)"
```

---

## Task 4: `build-interaction.ts` — JSONL entry → interactions payload

**Files:**
- Create: `lib/script-sends/build-interaction.ts`
- Test: `lib/script-sends/build-interaction.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// lib/script-sends/build-interaction.test.ts
import { describe, it, expect } from "vitest";
import { buildInteractionPayload, type SendLogEntry } from "./build-interaction";

const entry: SendLogEntry = {
  ts: "2026-05-01T10:00:00.000Z",
  person_id: "p1",
  full_name: "Alice",
  email: "alice@example.com",
  to_actual: "alice@example.com",
  sender: "wes@gofpblock.com",
  subject: "Hi Alice",
  status: "success",
  messageId: "msg-1",
  dry_run: false,
};

describe("buildInteractionPayload", () => {
  it("returns a row tagged with source=script_backfill and the message-id", () => {
    const row = buildInteractionPayload(entry, {
      sourceLog: "send_log.jsonl",
      sourceCsv: "consensus/outreach_messages.csv",
      body: "Body text",
      senderProfileId: "sp-1",
    });
    expect(row).toMatchObject({
      person_id: "p1",
      interaction_type: "cold_email",
      channel: "email",
      direction: "outbound",
      status: "sent",
      occurred_at: "2026-05-01T10:00:00.000Z",
      subject: "Hi Alice",
      body: "Body text",
      sender_profile_id: "sp-1",
      detail: {
        sendgrid_message_id: "msg-1",
        source: "script_backfill",
        source_log: "send_log.jsonl",
        source_csv: "consensus/outreach_messages.csv",
      },
    });
  });

  it("omits sender_profile_id when null and uses null body / source_csv when not supplied", () => {
    const row = buildInteractionPayload(entry, {
      sourceLog: "send_log.jsonl",
      sourceCsv: null,
      body: null,
      senderProfileId: null,
    });
    expect(row.body).toBeNull();
    expect(row.sender_profile_id).toBeNull();
    expect(row.detail).toMatchObject({ source_csv: null });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/script-sends/build-interaction.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the module**

```ts
// lib/script-sends/build-interaction.ts
export interface SendLogEntry {
  ts: string;
  person_id: string;
  full_name: string;
  email: string;
  to_actual: string;
  sender: string;
  subject: string;
  status: "success" | "failure";
  messageId?: string;
  error?: string;
  dry_run?: boolean;
}

export interface BuildOptions {
  sourceLog: string;
  sourceCsv: string | null;
  body: string | null;
  senderProfileId: string | null;
  source?: "script_backfill" | "script_send";
}

export interface InteractionInsert {
  person_id: string;
  interaction_type: "cold_email";
  channel: "email";
  direction: "outbound";
  status: "sent";
  occurred_at: string;
  subject: string;
  body: string | null;
  sender_profile_id: string | null;
  detail: {
    sendgrid_message_id: string | null;
    source: "script_backfill" | "script_send";
    source_log: string;
    source_csv: string | null;
  };
}

export function buildInteractionPayload(
  entry: SendLogEntry,
  opts: BuildOptions
): InteractionInsert {
  return {
    person_id: entry.person_id,
    interaction_type: "cold_email",
    channel: "email",
    direction: "outbound",
    status: "sent",
    occurred_at: entry.ts,
    subject: entry.subject,
    body: opts.body,
    sender_profile_id: opts.senderProfileId,
    detail: {
      sendgrid_message_id: entry.messageId ?? null,
      source: opts.source ?? "script_backfill",
      source_log: opts.sourceLog,
      source_csv: opts.sourceCsv,
    },
  };
}

/**
 * The skip-rules used both by the backfill and by any future
 * re-validation pass over the send log. Keep these in sync with the
 * existing exclusion logic in scripts/send-outreach.ts.
 */
export function isBackfillable(entry: SendLogEntry): boolean {
  if (entry.status !== "success") return false;
  if (entry.dry_run) return false;
  // Test-redirect: --test-to overrode the real recipient.
  if (entry.to_actual && entry.email && entry.to_actual !== entry.email) {
    return false;
  }
  if (!entry.person_id || !entry.subject || !entry.messageId) return false;
  return true;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/script-sends/build-interaction.test.ts`
Expected: 2 PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/script-sends/build-interaction.ts lib/script-sends/build-interaction.test.ts
git commit -m "feat(backfill): build interactions payload from send-log entries"
```

---

## Task 5: `scripts/backfill_script_sends.ts` — Stage 1 backfill runner

**Files:**
- Create: `scripts/backfill_script_sends.ts`

- [ ] **Step 1: Implement the script**

```ts
#!/usr/bin/env npx tsx
/**
 * backfill_script_sends.ts — Stage 1 of script-sends backfill.
 *
 * Reads consensus/*.jsonl send logs and inserts one `interactions` row per
 * live send (status='success', dry_run=false, to_actual==email). Idempotent
 * via the unique index on detail->>'sendgrid_message_id' (migration 030).
 *
 * Usage:
 *   npx tsx scripts/backfill_script_sends.ts --dry-run
 *   npx tsx scripts/backfill_script_sends.ts --yes
 *   npx tsx scripts/backfill_script_sends.ts --yes --only miami_dinner_send_log.jsonl
 *   npx tsx scripts/backfill_script_sends.ts --yes --limit 100
 */

import { readFileSync, existsSync } from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import {
  buildInteractionPayload,
  isBackfillable,
  type SendLogEntry,
} from "../lib/script-sends/build-interaction";
import { buildBodyIndex, resolveBody } from "../lib/script-sends/body-resolver";
import { SOURCE_CSV_MAP, LOG_PATHS } from "../lib/script-sends/source-csv-map";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.NEXT_SUPABASE_SECRET_KEY!;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_SUPABASE_SECRET_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

const DRY_RUN = process.argv.includes("--dry-run");
const LIMIT = process.argv.includes("--limit")
  ? parseInt(process.argv[process.argv.indexOf("--limit") + 1], 10)
  : Infinity;
const ONLY = process.argv.includes("--only")
  ? process.argv[process.argv.indexOf("--only") + 1]
  : null;
const YES = process.argv.includes("--yes");

if (!DRY_RUN && !YES) {
  console.log("❌ Refusing to write without --yes flag. Re-run with --yes or --dry-run.");
  process.exit(1);
}

interface RunStats {
  attempted: number;
  inserted: number;
  skipped_existing: number;
  skipped_unbackfillable: number;
  body_missing: number;
  sender_profile_missing: number;
  person_missing: number;
  error: number;
}

async function loadSenderProfileIds(): Promise<Record<string, string | null>> {
  const { data, error } = await supabase
    .from("sender_profiles")
    .select("id, email");
  if (error) {
    console.error("Failed to load sender_profiles:", error.message);
    return {};
  }
  const map: Record<string, string | null> = {};
  for (const sp of data ?? []) {
    if (sp.email) map[sp.email.toLowerCase()] = sp.id;
  }
  return map;
}

async function existingMessageIds(): Promise<Set<string>> {
  // Pull the set of already-backfilled message-ids in one shot so the per-row
  // pre-check is a constant-time lookup.
  const set = new Set<string>();
  let offset = 0;
  const BATCH = 1000;
  while (true) {
    const { data, error } = await supabase
      .from("interactions")
      .select("detail")
      .not("detail->sendgrid_message_id", "is", null)
      .range(offset, offset + BATCH - 1);
    if (error) {
      console.error("Failed to load existing message-ids:", error.message);
      break;
    }
    if (!data || data.length === 0) break;
    for (const row of data) {
      const id = (row.detail as { sendgrid_message_id?: string } | null)
        ?.sendgrid_message_id;
      if (id) set.add(id);
    }
    if (data.length < BATCH) break;
    offset += BATCH;
  }
  return set;
}

async function personExists(personId: string): Promise<boolean> {
  const { data } = await supabase
    .from("persons")
    .select("id")
    .eq("id", personId)
    .maybeSingle();
  return !!data;
}

async function processLog(
  logBasename: string,
  bodyIndex: ReturnType<typeof buildBodyIndex>,
  senderMap: Record<string, string | null>,
  existingIds: Set<string>,
  remainingBudget: { value: number }
): Promise<RunStats> {
  const stats: RunStats = {
    attempted: 0,
    inserted: 0,
    skipped_existing: 0,
    skipped_unbackfillable: 0,
    body_missing: 0,
    sender_profile_missing: 0,
    person_missing: 0,
    error: 0,
  };

  const logPath = LOG_PATHS[logBasename];
  if (!existsSync(logPath)) {
    console.warn(`  ⚠️  ${logBasename}: file not found at ${logPath}, skipping`);
    return stats;
  }

  const lines = readFileSync(logPath, "utf-8").trim().split("\n").filter(Boolean);

  for (const line of lines) {
    if (remainingBudget.value <= 0) break;
    let entry: SendLogEntry;
    try {
      entry = JSON.parse(line);
    } catch {
      stats.error++;
      continue;
    }
    stats.attempted++;
    if (!isBackfillable(entry)) {
      stats.skipped_unbackfillable++;
      continue;
    }
    if (existingIds.has(entry.messageId!)) {
      stats.skipped_existing++;
      continue;
    }
    const body = resolveBody(bodyIndex, entry.person_id, entry.subject);
    if (body == null) stats.body_missing++;

    const sourceCsv = (() => {
      for (const c of SOURCE_CSV_MAP[logBasename] ?? []) {
        if (resolveBody(bodyIndex, entry.person_id, entry.subject) != null) return c;
      }
      return null;
    })();

    const senderProfileId = senderMap[entry.sender.toLowerCase()] ?? null;
    if (senderProfileId == null) stats.sender_profile_missing++;

    if (!(await personExists(entry.person_id))) {
      stats.person_missing++;
      // Still insert with person_id (FK is ON DELETE SET NULL — Postgres
      // will reject a non-existent FK at insert time, so we set null explicitly).
      // Adjust the payload below.
    }

    const payload = buildInteractionPayload(entry, {
      sourceLog: logBasename,
      sourceCsv,
      body,
      senderProfileId,
    });
    if (stats.person_missing > 0 && payload.person_id === entry.person_id) {
      // Only blank person_id if THIS entry's person is missing.
      // (Re-check rather than relying on shared counter.)
      const exists = await personExists(entry.person_id);
      if (!exists) (payload as { person_id: string | null }).person_id = null;
    }

    if (DRY_RUN) {
      stats.inserted++;
      continue;
    }

    const { error } = await supabase.from("interactions").insert(payload);
    if (error) {
      // Idempotency conflict (unique index 030) → count as skipped.
      if (error.code === "23505") {
        stats.skipped_existing++;
        existingIds.add(entry.messageId!);
      } else {
        stats.error++;
        console.error(
          `  ✗ ${entry.full_name} <${entry.email}> [${entry.messageId}]: ${error.message}`
        );
      }
      continue;
    }
    stats.inserted++;
    existingIds.add(entry.messageId!);
    remainingBudget.value--;
  }
  return stats;
}

async function main() {
  console.log(`Dry run:        ${DRY_RUN ? "YES" : "NO — LIVE INSERTS"}`);
  console.log(`Limit:          ${LIMIT === Infinity ? "none" : LIMIT}`);
  console.log(`Only log:       ${ONLY ?? "(all 3)"}`);
  console.log();

  const senderMap = await loadSenderProfileIds();
  console.log(`Loaded ${Object.keys(senderMap).length} sender profiles.`);

  const existingIds = await existingMessageIds();
  console.log(`Loaded ${existingIds.size} existing sendgrid_message_ids from interactions.`);

  const logsToProcess = ONLY
    ? [ONLY]
    : Object.keys(LOG_PATHS);

  const remainingBudget = { value: LIMIT };
  const totals: RunStats = {
    attempted: 0,
    inserted: 0,
    skipped_existing: 0,
    skipped_unbackfillable: 0,
    body_missing: 0,
    sender_profile_missing: 0,
    person_missing: 0,
    error: 0,
  };

  for (const logBasename of logsToProcess) {
    console.log(`\n→ ${logBasename}`);
    const csvPaths = (SOURCE_CSV_MAP[logBasename] ?? []).map((p) =>
      path.resolve(__dirname, "..", p)
    );
    const bodyIndex = buildBodyIndex(csvPaths);
    console.log(`  Body index: ${bodyIndex.size} entries from ${csvPaths.length} CSV(s)`);

    const stats = await processLog(
      logBasename,
      bodyIndex,
      senderMap,
      existingIds,
      remainingBudget
    );
    console.log(`  attempted=${stats.attempted} inserted=${stats.inserted} skipped_existing=${stats.skipped_existing} skipped_unbackfillable=${stats.skipped_unbackfillable} body_missing=${stats.body_missing} sender_profile_missing=${stats.sender_profile_missing} person_missing=${stats.person_missing} error=${stats.error}`);

    for (const k of Object.keys(stats) as (keyof RunStats)[]) {
      totals[k] += stats[k];
    }
  }

  console.log(`\n=== Totals ===`);
  console.log(totals);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Dry-run against real data**

Run: `npx tsx scripts/backfill_script_sends.ts --dry-run`
Expected: Output shows `inserted ≈ 4039` total across the 3 logs, `skipped_unbackfillable ≈ 12 + 311 failures`, `body_missing` small (<50), `sender_profile_missing` should be 0 (jb + wes both in DB), `error = 0`. **Stop and inspect** — do not proceed unless the totals look right.

- [ ] **Step 3: Live run (small first)**

Run: `npx tsx scripts/backfill_script_sends.ts --yes --limit 50 --only send_log.jsonl`
Expected: `inserted = 50`. Then verify in Postgres:
```sql
SELECT COUNT(*) FROM interactions WHERE detail->>'source' = 'script_backfill';
```
Should return 50.

- [ ] **Step 4: Full live run**

Run: `npx tsx scripts/backfill_script_sends.ts --yes`
Expected: Total `inserted ≈ 4039` (minus the 50 already done). Re-run once with no flags to confirm idempotency: second run should report `inserted = 0`, `skipped_existing ≈ 4039`.

- [ ] **Step 5: Spot-check rows**

Run via SQL:
```sql
SELECT person_id, subject, occurred_at, detail->>'source_log', detail->>'sendgrid_message_id'
FROM interactions
WHERE detail->>'source' = 'script_backfill'
ORDER BY random()
LIMIT 10;
```
Expected: Each row matches a real send-log entry. Pick 2-3, grep the message-id in the JSONL — should find one match each.

- [ ] **Step 6: Commit**

```bash
git add scripts/backfill_script_sends.ts
git commit -m "feat(backfill): script to backfill interactions from send logs"
```

---

## Task 6: Extract `findPersonByEmail` from inbox-correlator

**Files:**
- Create: `lib/inbox/find-person-by-email.ts`
- Test: `lib/inbox/find-person-by-email.test.ts`
- Modify: `lib/inbox-correlator.ts`

- [ ] **Step 1: Write the failing test**

```ts
// lib/inbox/find-person-by-email.test.ts
import { describe, it, expect, vi } from "vitest";
import { findPersonByEmail } from "./find-person-by-email";

function mockSupabase(overrides: {
  exactMatch?: { id: string; full_name: string } | null;
  orgs?: Array<{ id: string; name: string; website: string; icp_score: number | null }>;
  personOrg?: { person_id: string } | null;
  person?: { id: string; full_name: string } | null;
}) {
  // Each call to .from() returns a builder whose terminal .single()/.maybeSingle()
  // returns the canned data based on the table being queried.
  const builders: Record<string, unknown> = {
    persons: {
      data: overrides.exactMatch ?? overrides.person ?? null,
    },
    organizations: { data: overrides.orgs ?? [] },
    person_organizations: { data: overrides.personOrg ?? null },
  };
  const from = vi.fn((table: string) => {
    const builder: Record<string, unknown> = {
      select: () => builder,
      ilike: () => builder,
      eq: () => builder,
      limit: () => builder,
      not: () => builder,
      single: async () => ({ data: (builders[table] as { data: unknown }).data }),
      maybeSingle: async () => ({ data: (builders[table] as { data: unknown }).data }),
    };
    return builder;
  });
  return { from } as unknown as Parameters<typeof findPersonByEmail>[0];
}

describe("findPersonByEmail", () => {
  it("returns person on exact email match", async () => {
    const supa = mockSupabase({ exactMatch: { id: "p1", full_name: "Alice" } });
    const result = await findPersonByEmail(supa, "alice@example.com");
    expect(result).toEqual({
      person_id: "p1",
      match_type: "exact_email",
      person: { id: "p1", full_name: "Alice" },
      organization: null,
    });
  });

  it("returns none when no match found anywhere", async () => {
    const supa = mockSupabase({ exactMatch: null, orgs: [] });
    const result = await findPersonByEmail(supa, "nobody@example.com");
    expect(result.match_type).toBe("none");
    expect(result.person_id).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/inbox/find-person-by-email.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the extraction**

```ts
// lib/inbox/find-person-by-email.ts
import type { SupabaseClient } from "@supabase/supabase-js";

export interface PersonMatch {
  person_id: string | null;
  match_type: "exact_email" | "domain_match" | "none";
  person: { id: string; full_name: string } | null;
  organization: { id: string; name: string; icp_score: number | null } | null;
}

function extractDomain(email: string): string | null {
  const parts = email.split("@");
  if (parts.length !== 2) return null;
  return parts[1].toLowerCase();
}

function normalizeDomain(url: string): string {
  try {
    const hostname = new URL(url.startsWith("http") ? url : `https://${url}`).hostname;
    return hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return url.replace(/^(https?:\/\/)?(www\.)?/, "").split("/")[0].toLowerCase();
  }
}

export async function findPersonByEmail(
  supabase: SupabaseClient,
  address: string
): Promise<PersonMatch> {
  const lower = address.toLowerCase();

  const { data: exact } = await supabase
    .from("persons")
    .select("id, full_name")
    .ilike("email", lower)
    .limit(1)
    .maybeSingle();
  if (exact) {
    return {
      person_id: exact.id,
      match_type: "exact_email",
      person: { id: exact.id, full_name: exact.full_name },
      organization: null,
    };
  }

  const domain = extractDomain(lower);
  if (!domain) {
    return { person_id: null, match_type: "none", person: null, organization: null };
  }

  const { data: orgs } = await supabase
    .from("organizations")
    .select("id, name, website, icp_score")
    .not("website", "is", null);
  const matched = (orgs ?? []).find(
    (o) => o.website && normalizeDomain(o.website) === domain
  );
  if (!matched) {
    return { person_id: null, match_type: "none", person: null, organization: null };
  }

  const { data: po } = await supabase
    .from("person_organizations")
    .select("person_id")
    .eq("organization_id", matched.id)
    .limit(1)
    .maybeSingle();
  if (!po) {
    return {
      person_id: null,
      match_type: "domain_match",
      person: null,
      organization: { id: matched.id, name: matched.name, icp_score: matched.icp_score },
    };
  }

  const { data: person } = await supabase
    .from("persons")
    .select("id, full_name")
    .eq("id", po.person_id)
    .maybeSingle();
  if (!person) {
    return {
      person_id: null,
      match_type: "domain_match",
      person: null,
      organization: { id: matched.id, name: matched.name, icp_score: matched.icp_score },
    };
  }

  return {
    person_id: person.id,
    match_type: "domain_match",
    person: { id: person.id, full_name: person.full_name },
    organization: { id: matched.id, name: matched.name, icp_score: matched.icp_score },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/inbox/find-person-by-email.test.ts`
Expected: 2 PASS.

- [ ] **Step 5: Refactor `lib/inbox-correlator.ts` to use it**

Replace the inline `extractDomain`, `normalizeDomain`, and Sections 1+2 of `correlateEmail` (lines 50–143 in the current file) with a single `findPersonByEmail` call:

```ts
// lib/inbox-correlator.ts (excerpt — replaces the body of correlateEmail)
import { findPersonByEmail } from "@/lib/inbox/find-person-by-email";

export async function correlateEmail(
  supabase: SupabaseClient,
  inboundEmail: Pick<
    InboundEmail,
    "id" | "from_address" | "from_name" | "subject" | "body_preview" | "received_at"
  >
): Promise<CorrelationResult> {
  const match = await findPersonByEmail(supabase, inboundEmail.from_address);

  if (match.match_type === "none") {
    await logCorrelation(supabase, inboundEmail.id, null, "none", null);
    return {
      person_id: null,
      correlation_type: "none",
      correlated_interaction_id: null,
    };
  }

  if (!match.person) {
    // Domain match but no person linked
    await logCorrelation(supabase, inboundEmail.id, null, "domain_match", null, {
      organization_id: match.organization?.id,
      organization_name: match.organization?.name,
    });
    return {
      person_id: null,
      correlation_type: "domain_match",
      correlated_interaction_id: null,
      organization: match.organization,
    };
  }

  return processCorrelation(
    supabase,
    inboundEmail,
    match.person,
    match.match_type as "exact_email" | "domain_match",
    match.organization
  );
}
```

Delete the now-unused `extractDomain` and `normalizeDomain` from this file (they live in `find-person-by-email.ts` now).

- [ ] **Step 6: Run all tests to verify no regressions**

Run: `npm test`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/inbox/find-person-by-email.ts lib/inbox/find-person-by-email.test.ts lib/inbox-correlator.ts
git commit -m "refactor(inbox): extract findPersonByEmail for reuse"
```

---

## Task 7: Add `notify` flag to `correlateAndNotify`

**Files:**
- Modify: `lib/inbox-correlator.ts`

- [ ] **Step 1: Add the option**

Replace the existing `correlateAndNotify` (around lines 261–283 in the current file) with:

```ts
export interface CorrelateOptions {
  notify?: boolean; // default true
}

export async function correlateAndNotify(
  supabase: SupabaseClient,
  inboundEmail: Pick<
    InboundEmail,
    "id" | "from_address" | "from_name" | "subject" | "body_preview" | "received_at"
  >,
  opts: CorrelateOptions = {}
): Promise<CorrelationResult> {
  const result = await correlateEmail(supabase, inboundEmail);

  const shouldNotify = opts.notify !== false;
  if (shouldNotify && result.person_id && result.person) {
    const message = formatReplyNotification(
      result.person,
      result.organization || null,
      {
        subject: inboundEmail.subject || null,
        body_preview: inboundEmail.body_preview || null,
      }
    );
    await sendTelegramNotification(message);
  }

  return result;
}
```

- [ ] **Step 2: Write a test**

Add to a new `lib/inbox-correlator.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import * as correlator from "./inbox-correlator";
import * as telegram from "./telegram";

describe("correlateAndNotify { notify: false }", () => {
  it("suppresses telegram even on successful match", async () => {
    const spy = vi.spyOn(telegram, "sendTelegramNotification").mockResolvedValue(undefined as never);
    vi.spyOn(correlator, "correlateEmail").mockResolvedValue({
      person_id: "p1",
      correlation_type: "exact_email",
      correlated_interaction_id: "i1",
      person: { id: "p1", full_name: "Alice" },
      organization: null,
    });

    await correlator.correlateAndNotify(
      {} as never,
      {
        id: "e1",
        from_address: "alice@example.com",
        from_name: null,
        subject: "Hi",
        body_preview: "Hi",
        received_at: new Date().toISOString(),
      },
      { notify: false }
    );

    expect(spy).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run the test**

Run: `npx vitest run lib/inbox-correlator.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add lib/inbox-correlator.ts lib/inbox-correlator.test.ts
git commit -m "feat(inbox): correlateAndNotify accepts { notify: false }"
```

---

## Task 8: `scripts/recorrelate_inbound.ts` — Stage 2

**Files:**
- Create: `scripts/recorrelate_inbound.ts`

- [ ] **Step 1: Implement the script**

```ts
#!/usr/bin/env npx tsx
/**
 * recorrelate_inbound.ts — Stage 2 of script-sends backfill.
 *
 * Walks every inbound email row and re-runs the correlator. With Stage 1
 * complete, replies from script-blast recipients will now find a matching
 * outbound interaction and flip it to 'replied'. Telegram notifications
 * are suppressed because these messages have already been acknowledged.
 *
 * Usage: npx tsx scripts/recorrelate_inbound.ts [--limit N]
 */
import path from "path";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { correlateAndNotify } from "../lib/inbox-correlator";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_SUPABASE_SECRET_KEY!,
  { auth: { persistSession: false } }
);

const LIMIT = process.argv.includes("--limit")
  ? parseInt(process.argv[process.argv.indexOf("--limit") + 1], 10)
  : Infinity;

async function main() {
  let offset = 0;
  const BATCH = 500;
  let processed = 0;
  let newlyMatched = 0;
  let flipped = 0;
  let stillUnmatched = 0;

  while (processed < LIMIT) {
    const { data, error } = await supabase
      .from("inbound_emails")
      .select("id, from_address, from_name, subject, body_preview, received_at, person_id, correlation_type")
      .eq("direction", "inbound")
      .order("received_at", { ascending: true })
      .range(offset, offset + BATCH - 1);
    if (error) {
      console.error("Fetch error:", error.message);
      process.exit(1);
    }
    if (!data || data.length === 0) break;

    for (const email of data) {
      if (processed >= LIMIT) break;
      const hadMatch = !!email.person_id;

      const result = await correlateAndNotify(
        supabase,
        {
          id: email.id,
          from_address: email.from_address,
          from_name: email.from_name,
          subject: email.subject,
          body_preview: email.body_preview,
          received_at: email.received_at,
        },
        { notify: false }
      );

      if (!hadMatch && result.person_id) newlyMatched++;
      if (result.correlated_interaction_id) flipped++;
      if (!result.person_id) stillUnmatched++;
      processed++;
      if (processed % 100 === 0) {
        console.log(`  … processed=${processed} newlyMatched=${newlyMatched} flipped=${flipped} stillUnmatched=${stillUnmatched}`);
      }
    }

    if (data.length < BATCH) break;
    offset += BATCH;
  }

  console.log(`\n=== Done ===`);
  console.log({ processed, newlyMatched, flipped, stillUnmatched });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Verify Stage 1 has been run first**

Run via SQL:
```sql
SELECT COUNT(*) FROM interactions WHERE detail->>'source' = 'script_backfill';
```
Expected: ~4039. If 0, **do not** run Stage 2 yet.

- [ ] **Step 3: Live run**

Run: `npx tsx scripts/recorrelate_inbound.ts`
Expected: `processed = <count of inbound>`, `newlyMatched > 0`, `flipped` ≥ a meaningful number (depends on how many of the 1,880 recipients replied).

- [ ] **Step 4: Verify the flips**

Run via SQL:
```sql
SELECT COUNT(*) FROM interactions
WHERE detail->>'source' = 'script_backfill' AND status = 'replied';
```
Spot-check 5 of these against the inbound_emails table — each should have a matching inbound row.

- [ ] **Step 5: Commit**

```bash
git add scripts/recorrelate_inbound.ts
git commit -m "feat(backfill): retroactive inbound re-correlation script"
```

---

## Task 9: `app/api/inbox/recorrelate/route.ts` — admin trigger

**Files:**
- Create: `app/api/inbox/recorrelate/route.ts`

- [ ] **Step 1: Implement the route**

```ts
// app/api/inbox/recorrelate/route.ts
// Admin-only POST that re-runs the correlator over all inbound emails.
// Same behavior as scripts/recorrelate_inbound.ts but callable from the UI.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { correlateAndNotify } from "@/lib/inbox-correlator";

export const maxDuration = 300;

export async function POST() {
  const supabase = await createClient();

  let offset = 0;
  const BATCH = 500;
  let processed = 0;
  let flipped = 0;

  while (true) {
    const { data, error } = await supabase
      .from("inbound_emails")
      .select("id, from_address, from_name, subject, body_preview, received_at, person_id")
      .eq("direction", "inbound")
      .order("received_at", { ascending: true })
      .range(offset, offset + BATCH - 1);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data || data.length === 0) break;

    for (const email of data) {
      const result = await correlateAndNotify(supabase, email, { notify: false });
      processed++;
      if (result.correlated_interaction_id) flipped++;
    }
    if (data.length < BATCH) break;
    offset += BATCH;
  }

  return NextResponse.json({ processed, flipped });
}
```

- [ ] **Step 2: Smoke-test the route**

Run dev server: `npm run dev`
Then: `curl -X POST http://localhost:3000/api/inbox/recorrelate`
Expected: `{"processed":N,"flipped":M}` within 5 minutes.

- [ ] **Step 3: Commit**

```bash
git add app/api/inbox/recorrelate/route.ts
git commit -m "feat(api): POST /api/inbox/recorrelate for ad-hoc replay"
```

---

## Task 10: Stage 3a — `send-outreach.ts` inline DB write

**Files:**
- Modify: `scripts/send-outreach.ts`

- [ ] **Step 1: Add Supabase client + interaction insert after success**

At the top of `scripts/send-outreach.ts`, add:

```ts
import { createClient } from "@supabase/supabase-js";
import { buildInteractionPayload } from "../lib/script-sends/build-interaction";
import path from "path";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_SUPABASE_SECRET_KEY;
const supabase = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } })
  : null;
if (!supabase) {
  console.warn("⚠️  Supabase env vars missing — sends will not be recorded in DB.");
}

// Cache sender_profile_id by sender email.
let senderProfileCache: Record<string, string | null> | null = null;
async function getSenderProfileId(senderEmail: string): Promise<string | null> {
  if (!supabase) return null;
  if (senderProfileCache) return senderProfileCache[senderEmail.toLowerCase()] ?? null;
  const { data } = await supabase.from("sender_profiles").select("id, email");
  senderProfileCache = {};
  for (const sp of data ?? []) {
    if (sp.email) senderProfileCache[sp.email.toLowerCase()] = sp.id;
  }
  return senderProfileCache[senderEmail.toLowerCase()] ?? null;
}
```

In the loop, immediately after the existing `if (result.success) { successes++; ... }` block, insert:

```ts
    // Mirror the send into interactions (Stage 3a). Test-redirects and dry-runs
    // are skipped — same exclusion as backfill.
    const recordable =
      result.success && !DRY_RUN && (!TEST_TO || to === r.email);
    if (recordable && supabase) {
      const senderProfileId = await getSenderProfileId(r.sender_email);
      const payload = buildInteractionPayload(
        {
          ts: logEntry.ts,
          person_id: r.person_id,
          full_name: r.full_name,
          email: r.email,
          to_actual: to,
          sender: r.sender_email,
          subject: r.subject,
          status: "success",
          messageId: result.messageId,
          dry_run: false,
        },
        {
          sourceLog: path.basename(SEND_LOG),
          sourceCsv: path.basename(CSV_PATH),
          body: r.body,
          senderProfileId,
          source: "script_send",
        }
      );
      const { error: insertErr } = await supabase.from("interactions").insert(payload);
      if (insertErr && insertErr.code !== "23505") {
        console.warn(
          `  ⚠ DB record failed for ${r.full_name}: ${insertErr.message}`
        );
      }
    }
```

- [ ] **Step 2: Test with a small live send**

If a safe test recipient is available, run:
```
npx tsx scripts/send-outreach.ts --csv <test.csv> --log /tmp/test_send.jsonl --limit 1 --yes
```
Then verify:
```sql
SELECT person_id, subject, detail->>'source' FROM interactions
WHERE detail->>'sendgrid_message_id' = '<the messageId from the log>';
```
Expected: row exists with `source = 'script_send'`.

- [ ] **Step 3: Confirm test-redirect path still inserts nothing**

Run: `npx tsx scripts/send-outreach.ts --csv <test.csv> --log /tmp/test2.jsonl --limit 1 --test-to evan@opsprocket.com`
Then verify no new row appeared.

- [ ] **Step 4: Commit**

```bash
git add scripts/send-outreach.ts
git commit -m "feat(outreach): write interactions row inline on successful send"
```

---

## Task 11: Stage 3b — Sent-mailbox reconciler

**Files:**
- Modify: `lib/inbox-sync.ts`

- [ ] **Step 1: Add the reconciler helper inline in inbox-sync.ts**

At the bottom of `lib/inbox-sync.ts`, add:

```ts
import { findPersonByEmail } from "@/lib/inbox/find-person-by-email";

const SUBJECT_PREFIX_RE = /^(re:|fwd:|fw:)\s*/i;
function stripPrefixes(subj: string | null): string {
  if (!subj) return "";
  let s = subj;
  // Strip recursively (`Re: Re: Fwd: …`).
  while (SUBJECT_PREFIX_RE.test(s)) s = s.replace(SUBJECT_PREFIX_RE, "");
  return s.trim();
}

/**
 * For each outbound row newly ingested from the Sent folder, find the
 * recipient person and (if not already covered by a recent interactions row)
 * insert a new one. Dedup window: ±2 minutes on occurred_at + same normalized
 * subject. Catches manual sends from Fastmail/Gmail.
 */
async function reconcileOutboundToInteraction(
  supabase: SupabaseClient,
  outbound: {
    id: string;
    to_address: string | null;
    subject: string | null;
    received_at: string;
    account_email: string;
  }
): Promise<void> {
  if (!outbound.to_address) return;
  const match = await findPersonByEmail(supabase, outbound.to_address);
  if (!match.person_id) return;

  const occurredAt = new Date(outbound.received_at);
  const windowMs = 2 * 60 * 1000;
  const start = new Date(occurredAt.getTime() - windowMs).toISOString();
  const end = new Date(occurredAt.getTime() + windowMs).toISOString();
  const normSubj = stripPrefixes(outbound.subject);

  const { data: existing } = await supabase
    .from("interactions")
    .select("id, subject")
    .eq("person_id", match.person_id)
    .eq("direction", "outbound")
    .eq("channel", "email")
    .gte("occurred_at", start)
    .lte("occurred_at", end);

  const dedup = (existing ?? []).some(
    (r) => stripPrefixes(r.subject) === normSubj
  );
  if (dedup) return;

  const { data: senderProfile } = await supabase
    .from("sender_profiles")
    .select("id")
    .ilike("email", outbound.account_email)
    .maybeSingle();

  await supabase.from("interactions").insert({
    person_id: match.person_id,
    interaction_type: "cold_email",
    channel: "email",
    direction: "outbound",
    status: "sent",
    occurred_at: outbound.received_at,
    subject: outbound.subject,
    body: null,
    sender_profile_id: senderProfile?.id ?? null,
    detail: {
      source: "sent_folder_reconciler",
      inbound_emails_id: outbound.id,
    },
  });
}
```

- [ ] **Step 2: Wire it into the sync loop**

The current `syncIdentity` in `lib/inbox-sync.ts` only ingests inbound mail (`fetchEmails`). Add a parallel sent-mail pass after the inbound loop:

```ts
  // ─── Sent-mailbox sync (Stage 3b reconciler) ───────────────────────────────
  const { data: sentState } = await supabase
    .from("inbox_sync_state")
    .select("last_sent_email_id")
    .eq("account_email", identity)
    .maybeSingle();

  const sinceSentId: string | undefined = sentState?.last_sent_email_id || undefined;
  const sentLimit = sinceSentId ? 50 : 500;
  const sentEmails = await fetchSentEmails(apiKey, identity, sinceSentId, sentLimit);

  let outboundCount = 0;
  for (const email of sentEmails) {
    const { data: existing } = await supabase
      .from("inbound_emails")
      .select("id")
      .eq("message_id", email.message_id)
      .limit(1)
      .maybeSingle();
    if (existing) continue;

    const { data: inserted, error: outErr } = await supabase
      .from("inbound_emails")
      .insert(email)
      .select()
      .single();
    if (outErr) {
      console.error(`[inbox-sync] ${identity} sent insert error:`, outErr.message);
      continue;
    }
    if (inserted) {
      outboundCount++;
      await reconcileOutboundToInteraction(supabase, {
        id: inserted.id,
        to_address: inserted.to_address ?? null,
        subject: inserted.subject ?? null,
        received_at: inserted.received_at,
        account_email: identity,
      });
    }
  }

  const newSentCursor = sentEmails[0]?.message_id || sinceSentId || null;

  // Update the inbox_sync_state row's last_sent_email_id (merge into the existing upsert below).
```

Then update the final `upsert` so it also writes `last_sent_email_id: newSentCursor`, and update the `IdentitySyncResult` return to set `new_outbound: outboundCount`.

- [ ] **Step 3: Manual smoke-test**

Send an email manually from Fastmail web (as `wes@gofpblock.com`) to a known person in the DB. Then trigger the inbox sync (POST to `/api/cron/inbox-sync` or whatever path it lives at — confirm by `grep -r "inbox-sync" app/api`). Verify:
```sql
SELECT id, person_id, subject, detail->>'source' FROM interactions
WHERE detail->>'source' = 'sent_folder_reconciler'
ORDER BY created_at DESC LIMIT 1;
```
Expected: one row matching your test send.

- [ ] **Step 4: Commit**

```bash
git add lib/inbox-sync.ts
git commit -m "feat(inbox): reconcile Sent-folder mail into interactions"
```

---

## Task 12: Migration — `active_conversations_count` RPC

**Files:**
- Create: `supabase/migrations/031_active_conversations_rpc.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 031_active_conversations_rpc.sql
-- Count distinct persons with recent two-way email activity.

CREATE OR REPLACE FUNCTION active_conversations_count(window_days int DEFAULT 14)
RETURNS bigint AS $$
  SELECT COUNT(DISTINCT outbound.person_id)
  FROM interactions outbound
  JOIN inbound_emails inbound ON inbound.person_id = outbound.person_id
  WHERE outbound.direction = 'outbound'
    AND outbound.channel = 'email'
    AND outbound.status IN ('sent','delivered','opened','replied')
    AND outbound.occurred_at >= NOW() - (window_days * 2 || ' days')::interval
    AND inbound.direction = 'inbound'
    AND inbound.received_at >= NOW() - (window_days || ' days')::interval;
$$ LANGUAGE sql STABLE;

GRANT EXECUTE ON FUNCTION active_conversations_count(int) TO service_role, authenticated;
```

- [ ] **Step 2: Apply the migration**

Run: `npx supabase migration up` (or equivalent).
Expected: success.

- [ ] **Step 3: Smoke-test the RPC**

```sql
SELECT active_conversations_count(14);
```
Expected: a non-negative integer.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/031_active_conversations_rpc.sql
git commit -m "feat(db): active_conversations_count RPC"
```

---

## Task 13: Dashboard — Active Conversations tile

**Files:**
- Modify: `lib/queries/use-dashboard-stats.ts`
- Modify: `app/admin/page.tsx`

- [ ] **Step 1: Extend `use-dashboard-stats.ts`**

Update the `DashboardStats` interface and the `queryFn` to call the new RPC:

```ts
export interface DashboardStats {
  organizations: number;
  persons: number;
  totalInteractions: number;
  repliedCount: number;
  statusCounts: Record<string, number>;
  activeConversations: number;
}
```

In the `Promise.all` call, add a fourth entry:
```ts
supabase.rpc("active_conversations_count", { window_days: 14 }),
```

Destructure and assign:
```ts
const { data: activeCount, error: activeErr } = ...;
if (activeErr) throw activeErr;
// then in the returned object:
activeConversations: Number(activeCount ?? 0),
```

- [ ] **Step 2: Render the tile in `app/admin/page.tsx`**

Find the existing stats grid (search for `useDashboardStats` and follow). Add a new tile mirroring the others:

```tsx
<StatCard
  label="Active conversations"
  value={stats.activeConversations}
  hint="Persons with 2-way email activity in the last 14 days"
/>
```

If there's no `StatCard` component, mirror the markup of the `repliedCount` tile.

- [ ] **Step 3: Manual smoke-test**

Run dev server. Open `/admin`. Tile should render with a numeric value.

- [ ] **Step 4: Commit**

```bash
git add lib/queries/use-dashboard-stats.ts app/admin/page.tsx
git commit -m "feat(dashboard): active-conversations tile"
```

---

## Task 14: Pipeline view — `source` chip

**Files:**
- Modify: `lib/types/pipeline.ts`
- Modify: `app/admin/pipeline/page.tsx`
- Modify: `components/admin/pipeline-view.tsx`

- [ ] **Step 1: Add `source` to `PipelineContact`**

In `lib/types/pipeline.ts`, add to the `PipelineContact` interface:
```ts
source: "script_backfill" | "script_send" | "sent_folder_reconciler" | "sequence" | "manual" | null;
```

- [ ] **Step 2: Populate `source` in `app/admin/pipeline/page.tsx`**

Update the interactions select to include `detail`:
```ts
const allInteractions = await fetchAllRows(
  "interactions",
  "id, person_id, status, channel, event_id, created_at, sequence_id, detail"
);
```

Inside the per-person loop, after picking `bestStatus`, also track the best interaction's source:

```ts
let bestSource: PipelineContact["source"] = null;
for (const interaction of interactions) {
  const rank = STATUS_RANK[interaction.status] ?? -1;
  if (rank > bestRank) {
    bestRank = rank;
    bestStatus = interaction.status;
    bestChannel = interaction.channel;
    bestEventId = interaction.event_id;
    const detailSource = (interaction.detail as { source?: string } | null)?.source ?? null;
    if (detailSource === "script_backfill" || detailSource === "script_send" || detailSource === "sent_folder_reconciler" || detailSource === "sequence" || detailSource === "manual") {
      bestSource = detailSource;
    } else if (interaction.sequence_id) {
      bestSource = "sequence";
    } else {
      bestSource = null;
    }
  }
  // ...rest unchanged
}
```

Add `source: bestSource` to the pushed `PipelineContact`.

- [ ] **Step 3: Render the chip in `pipeline-view.tsx`**

Find where each contact row renders status (`pipeline_stage`). Add a small chip next to it:

```tsx
{contact.source && (
  <span className="ml-2 inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-slate-600">
    {contact.source === "script_backfill" || contact.source === "script_send"
      ? "script"
      : contact.source === "sent_folder_reconciler"
        ? "manual"
        : contact.source}
  </span>
)}
```

Collapse `script_backfill` and `script_send` into the same `script` label since users don't care which path got it into the DB.

- [ ] **Step 4: Manual smoke-test**

Run dev server. Open `/admin/pipeline`. Verify a row known to be a script-blast recipient shows the `script` chip, and a row known to be from a sequence shows `sequence` (or nothing if the sequence rows don't have `detail.source` — that's fine for now).

- [ ] **Step 5: Commit**

```bash
git add lib/types/pipeline.ts app/admin/pipeline/page.tsx components/admin/pipeline-view.tsx
git commit -m "feat(pipeline): source chip per contact"
```

---

## Task 15: Documentation sync

**Files:**
- Modify: `docs/backend/sequences-messaging.md`
- Modify: `docs/admin-panel.md`

- [ ] **Step 1: Document the new sources of interactions rows**

In `docs/backend/sequences-messaging.md`, add a section:

```markdown
## Interaction sources (`detail.source`)

Every outbound `interactions` row carries a `detail.source` indicating how it
got there:

- `sequence` — created by the approval pipeline (`app/api/sequences/send`).
- `script_send` — created inline by `scripts/send-outreach.ts` on successful SendGrid send.
- `script_backfill` — created by `scripts/backfill_script_sends.ts` from the
  three historical `consensus/*.jsonl` logs.
- `sent_folder_reconciler` — created by `lib/inbox-sync.ts` when an outbound
  email shows up in the Fastmail Sent mailbox without a matching DB row
  (catches manual sends from the Fastmail web UI).

Idempotency: `interactions ((detail->>'sendgrid_message_id'))` is a partial
unique index. Anything routed through SendGrid populates this and cannot be
double-inserted. Sent-folder reconciler rows have no message-id (they came
from JMAP) and are deduplicated by ±2-min + normalized subject.
```

- [ ] **Step 2: Document the new dashboard tile + pipeline chip**

In `docs/admin-panel.md`, add to the dashboard section: "Active conversations" tile description. In the pipeline section: "source chip" description.

- [ ] **Step 3: Commit**

```bash
git add docs/
git commit -m "docs: sync messaging + admin panel for backfill changes"
```

---

## Task 16: Final verification

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all PASS.

- [ ] **Step 2: Run the linter**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 3: Verify dashboard counts are sane**

Open `/admin`. Compare `sent` and `replied` counts against a manual SQL query:
```sql
SELECT status, COUNT(*) FROM interactions GROUP BY status ORDER BY count DESC;
```
The dashboard should match.

- [ ] **Step 4: Verify pipeline buckets shifted appropriately**

Open `/admin/pipeline`. Spot-check 5 persons known to have received a script blast: they should now show status `sent` or higher (not `not_contacted`). Spot-check 2 persons known to have replied to a script blast: should show `replied`.

- [ ] **Step 5: Done — no commit, this is verification only.**

---

## Self-Review Notes

Cross-checked against `docs/superpowers/specs/2026-05-19-script-sends-backfill-design.md`:
- Stage 1 covered by Tasks 2–5
- Stage 2 covered by Tasks 6–9 (refactor + script + API endpoint)
- Stage 3a covered by Task 10
- Stage 3b covered by Task 11
- Stage 3c (migration 030) covered by Task 1
- Pipeline source chip covered by Task 14
- Active conversations tile (with `active_conversations_count` RPC migration 031) covered by Tasks 12–13
- Docs covered by Task 15
- Final verification gates covered by Task 16

Type/name consistency check:
- `buildInteractionPayload` signature matches across Tasks 4, 5, 10.
- `findPersonByEmail` exported from `lib/inbox/find-person-by-email.ts` and consumed in Tasks 6, 11.
- `interactions.detail.source` enum is consistent everywhere (`script_backfill`, `script_send`, `sent_folder_reconciler`, plus `sequence`/`manual` allowed on pipeline display).
- `SOURCE_CSV_MAP` keys match `LOG_PATHS` keys in Task 2 and are referenced by basename in Task 5.
