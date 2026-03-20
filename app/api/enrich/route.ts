import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const body = await request.json();

  const { contactIds, fields, source = "apollo", eventId } = body as {
    contactIds?: string[];
    fields: string[];
    source?: string;
    eventId?: string;
  };

  if (!fields || fields.length === 0) {
    return NextResponse.json(
      { error: "At least one field is required" },
      { status: 400 }
    );
  }

  // Create a job_log entry with status 'processing'
  const { data: job, error: jobError } = await supabase
    .from("job_log")
    .insert({
      job_type: "enrichment",
      target_table: "contacts",
      status: "processing",
      metadata: {
        source,
        fields,
        contact_ids: contactIds ?? null,
        event_id: eventId ?? null,
        contacts_processed: 0,
        emails_found: 0,
        linkedin_found: 0,
        twitter_found: 0,
        phone_found: 0,
      },
    })
    .select("id")
    .single();

  if (jobError || !job) {
    return NextResponse.json(
      { error: jobError?.message ?? "Failed to create job" },
      { status: 500 }
    );
  }

  // TODO: Implement actual Apollo API integration here.
  // This should:
  // 1. Resolve which contacts to enrich based on contactIds, eventId, or "all unenriched"
  // 2. Call Apollo People Enrichment API for each contact
  // 3. Update contact records with enriched data
  // 4. Update the job_log entry with results (contacts_processed, emails_found, etc.)
  // 5. Set job status to 'completed' or 'failed'
  //
  // For now, we just create the job entry and return the ID.
  // The actual enrichment logic from scripts/apollo_enrich.py will be ported here.

  return NextResponse.json({ jobId: job.id, status: "processing" });
}
