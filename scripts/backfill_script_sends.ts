#!/usr/bin/env npx tsx
/**
 * backfill_script_sends.ts — Stage 1 of script-sends backfill.
 *
 * Reads consensus/*.jsonl send logs and inserts one `interactions` row per
 * live send (status='success', dry_run=false, to_actual==email). Idempotent
 * via the unique index on detail->>'sendgrid_message_id' (migration 031).
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
import {
  buildBodyIndex,
  resolveBody,
  type BodyIndex,
} from "../lib/script-sends/body-resolver";
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

  // Build per-CSV indexes once so the per-row provenance lookup is O(1)
  // rather than re-reading and re-parsing each candidate CSV per row.
  const perCsvIndexes: Array<{ basename: string; index: BodyIndex }> = (
    SOURCE_CSV_MAP[logBasename] ?? []
  ).map((c) => ({
    basename: c,
    index: buildBodyIndex([path.resolve(__dirname, "..", c)]),
  }));

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

    // Determine which CSV (if any) the body came from. Walk the pre-built
    // per-CSV indexes — first match wins for provenance.
    let sourceCsv: string | null = null;
    if (body != null) {
      for (const { basename, index } of perCsvIndexes) {
        if (resolveBody(index, entry.person_id, entry.subject) != null) {
          sourceCsv = basename;
          break;
        }
      }
    }

    const senderProfileId = senderMap[entry.sender.toLowerCase()] ?? null;
    if (senderProfileId == null) stats.sender_profile_missing++;

    const hasPerson = await personExists(entry.person_id);
    if (!hasPerson) stats.person_missing++;

    const payload = buildInteractionPayload(entry, {
      sourceLog: logBasename,
      sourceCsv,
      body,
      senderProfileId,
    });
    if (!hasPerson) {
      (payload as { person_id: string | null }).person_id = null;
    }

    if (DRY_RUN) {
      stats.inserted++;
      continue;
    }

    const { error } = await supabase.from("interactions").insert(payload);
    if (error) {
      // Idempotency conflict (unique index) → count as skipped.
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

  const logsToProcess = ONLY ? [ONLY] : Object.keys(LOG_PATHS);

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
