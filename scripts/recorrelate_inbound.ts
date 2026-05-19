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
