import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { runBatchPersonEnrichment } from "@/lib/enrichment/person-pipeline";

export const maxDuration = 300;

/**
 * POST /api/enrich/persons
 *
 * Enriches persons through the person enrichment pipeline.
 * Uses the service role client since this runs server-side without user session.
 */
export async function POST(request: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_SUPABASE_SECRET_KEY!
  );

  let body: {
    personIds?: string[];
    eventId?: string;
    organizationId?: string;
    failedOnly?: boolean;
    sourceFilter?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const {
    personIds: inputPersonIds,
    eventId,
    organizationId,
    failedOnly,
    sourceFilter,
  } = body;

  // -------------------------------------------------------------------------
  // Resolve person IDs from the various input filters
  // -------------------------------------------------------------------------
  let personIds: string[] = [];

  if (inputPersonIds && inputPersonIds.length > 0) {
    // Explicit IDs provided
    personIds = inputPersonIds;
  } else if (eventId) {
    // All persons participating in an event
    const { data: participations } = await supabase
      .from("event_participations")
      .select("person_id")
      .eq("event_id", eventId)
      .not("person_id", "is", null);

    personIds = Array.from(
      new Set(
        (participations ?? [])
          .map((p: { person_id: string | null }) => p.person_id)
          .filter((id): id is string => id !== null)
      )
    );
  } else if (organizationId) {
    // All persons belonging to an organization
    const { data: memberships } = await supabase
      .from("person_organization")
      .select("person_id")
      .eq("organization_id", organizationId);

    personIds = Array.from(
      new Set(
        (memberships ?? [])
          .map((m: { person_id: string }) => m.person_id)
          .filter((id): id is string => id !== null)
      )
    );
  } else if (failedOnly) {
    // Persons that failed enrichment
    const { data: failedPersons } = await supabase
      .from("persons")
      .select("id")
      .eq("enrichment_status", "failed")
      .limit(200);

    personIds = (failedPersons ?? []).map((p: { id: string }) => p.id);
  } else if (sourceFilter) {
    // Persons from a specific source that haven't been enriched
    const { data: sourcePersons } = await supabase
      .from("persons")
      .select("id")
      .eq("source", sourceFilter)
      .or("enrichment_status.eq.none,apollo_id.is.null")
      .limit(200);

    personIds = (sourcePersons ?? []).map((p: { id: string }) => p.id);
  } else {
    // Default: all persons not yet enriched
    const { data: unenriched } = await supabase
      .from("persons")
      .select("id")
      .or("enrichment_status.eq.none,apollo_id.is.null")
      .limit(200);

    personIds = (unenriched ?? []).map((p: { id: string }) => p.id);
  }

  if (personIds.length === 0) {
    return NextResponse.json({
      status: "completed",
      persons_processed: 0,
      persons_enriched: 0,
      persons_failed: 0,
      orgs_created: 0,
      message: "No persons matched the given filters",
    });
  }

  // -------------------------------------------------------------------------
  // Create a parent job_log entry
  // -------------------------------------------------------------------------
  const { data: job, error: jobError } = await supabase
    .from("job_log")
    .insert({
      job_type: "enrichment_batch_persons",
      target_table: "persons",
      status: "processing",
      metadata: {
        person_count: personIds.length,
        person_ids: personIds.length <= 500 ? personIds : null,
        target_label: inputPersonIds ? `${personIds.length} selected` : eventId ? "from event" : organizationId ? "from organization" : failedOnly ? "retry failed" : sourceFilter ? `source: ${sourceFilter}` : "unenriched",
        event_id: eventId ?? null,
        organization_id: organizationId ?? null,
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

  // -------------------------------------------------------------------------
  // Run batch enrichment
  // -------------------------------------------------------------------------
  try {
    const result = await runBatchPersonEnrichment(supabase, personIds);

    const personsEnriched = result.results.filter((r) => r.success).length;
    const personsFailed = result.results.filter((r) => !r.success).length;
    const orgsCreated = result.results.filter((r) => r.orgCreated).length;

    // Update parent job
    await supabase
      .from("job_log")
      .update({
        status: "completed",
        metadata: {
          person_count: personIds.length,
          persons_enriched: personsEnriched,
          persons_failed: personsFailed,
          orgs_created: orgsCreated,
          duration_ms: result.durationMs,
          event_id: eventId ?? null,
          organization_id: organizationId ?? null,
        },
      })
      .eq("id", job.id);

    return NextResponse.json({
      jobId: job.id,
      status: "completed",
      persons_processed: personIds.length,
      persons_enriched: personsEnriched,
      persons_failed: personsFailed,
      orgs_created: orgsCreated,
      results: result.results.map((r) => ({
        personId: r.personId,
        personName: r.personName,
        success: r.success,
        error: r.error ?? null,
        fieldsUpdated: r.fieldsUpdated,
        orgLinked: r.orgLinked,
        orgCreated: r.orgCreated,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    await supabase
      .from("job_log")
      .update({
        status: "failed",
        error: message,
      })
      .eq("id", job.id);

    return NextResponse.json(
      { error: message, jobId: job.id },
      { status: 500 }
    );
  }
}
