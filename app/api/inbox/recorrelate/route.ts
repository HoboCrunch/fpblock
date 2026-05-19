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
