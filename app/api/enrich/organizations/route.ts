import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { runBatchEnrichment } from "@/lib/enrichment/pipeline";

export const maxDuration = 300;

/**
 * POST /api/enrich/organizations
 *
 * Enriches organizations through the Apollo + Perplexity + Gemini pipeline.
 * Uses the service role client since this runs server-side without user session.
 */
export async function POST(request: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_SUPABASE_SECRET_KEY!
  );

  let body: {
    organizationIds?: string[];
    stages?: string[];
    eventId?: string;
    initiativeId?: string;
    icpBelow?: number;
    peopleFinderConfig?: {
      perCompany?: number;
      seniorities?: string[];
      departments?: string[];
    } | null;
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
    organizationIds,
    stages = ["full"],
    eventId,
    initiativeId,
    icpBelow,
    peopleFinderConfig,
  } = body;

  // -------------------------------------------------------------------------
  // Resolve organization IDs from the various input filters
  // -------------------------------------------------------------------------
  let orgIds: string[] = [];

  if (organizationIds && organizationIds.length > 0) {
    // Explicit IDs provided
    orgIds = organizationIds;
  } else if (eventId) {
    // All orgs participating in an event
    const { data: participations } = await supabase
      .from("event_participations")
      .select("organization_id")
      .eq("event_id", eventId)
      .not("organization_id", "is", null);

    orgIds = Array.from(
      new Set(
        (participations ?? [])
          .map((p: { organization_id: string | null }) => p.organization_id)
          .filter((id): id is string => id !== null)
      )
    );
  } else if (initiativeId) {
    // All orgs enrolled in an initiative
    const { data: enrollments } = await supabase
      .from("initiative_enrollments")
      .select("organization_id")
      .eq("initiative_id", initiativeId)
      .not("organization_id", "is", null);

    orgIds = Array.from(
      new Set(
        (enrollments ?? [])
          .map((e: { organization_id: string | null }) => e.organization_id)
          .filter((id): id is string => id !== null)
      )
    );
  } else if (icpBelow != null) {
    // Orgs with icp_score below threshold (or null)
    const { data: lowScoreOrgs } = await supabase
      .from("organizations")
      .select("id")
      .or(`icp_score.is.null,icp_score.lt.${icpBelow}`)
      .limit(200);

    orgIds = (lowScoreOrgs ?? []).map((o: { id: string }) => o.id);
  } else {
    // Default: all orgs with no icp_score
    const { data: unenriched } = await supabase
      .from("organizations")
      .select("id")
      .is("icp_score", null)
      .limit(200);

    orgIds = (unenriched ?? []).map((o: { id: string }) => o.id);
  }

  if (orgIds.length === 0) {
    return NextResponse.json({
      status: "completed",
      orgs_processed: 0,
      orgs_enriched: 0,
      orgs_failed: 0,
      signals_created: 0,
      message: "No organizations matched the given filters",
    });
  }

  // -------------------------------------------------------------------------
  // Create a parent job_log entry
  // -------------------------------------------------------------------------
  const { data: job, error: jobError } = await supabase
    .from("job_log")
    .insert({
      job_type: "enrichment_batch_organizations",
      target_table: "organizations",
      status: "processing",
      metadata: {
        stages,
        org_count: orgIds.length,
        event_id: eventId ?? null,
        initiative_id: initiativeId ?? null,
        icp_below: icpBelow ?? null,
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
  const validStages = stages.filter((s): s is "apollo" | "perplexity" | "gemini" | "full" | "people_finder" =>
    ["apollo", "perplexity", "gemini", "full", "people_finder"].includes(s)
  );

  try {
    const result = await runBatchEnrichment(supabase, orgIds, {
      stages: validStages.length > 0 ? validStages : ["full"],
      concurrency: 1, // Respect API rate limits
      peopleFinderConfig: peopleFinderConfig
        ? {
            perCompany: peopleFinderConfig.perCompany ?? 5,
            seniorities: peopleFinderConfig.seniorities ?? ["owner", "founder", "c_suite", "vp", "director"],
            departments: peopleFinderConfig.departments ?? [],
          }
        : null,
    });

    const totalSignals = result.results.reduce(
      (sum, r) => sum + r.signalsCreated,
      0
    );

    const totalPeopleFound = result.results.reduce((sum, r) => sum + (r.peopleFinder?.found ?? 0), 0);
    const totalPeopleCreated = result.results.reduce((sum, r) => sum + (r.peopleFinder?.created ?? 0), 0);
    const totalPeopleMerged = result.results.reduce((sum, r) => sum + (r.peopleFinder?.merged ?? 0), 0);

    // Update parent job
    await supabase
      .from("job_log")
      .update({
        status: "completed",
        metadata: {
          stages,
          org_count: orgIds.length,
          orgs_enriched: result.succeeded,
          orgs_failed: result.failed,
          signals_created: totalSignals,
          event_id: eventId ?? null,
          initiative_id: initiativeId ?? null,
          icp_below: icpBelow ?? null,
        },
      })
      .eq("id", job.id);

    return NextResponse.json({
      jobId: job.id,
      status: "completed",
      orgs_processed: result.total,
      orgs_enriched: result.succeeded,
      orgs_failed: result.failed,
      signals_created: totalSignals,
      people_found: totalPeopleFound,
      people_created: totalPeopleCreated,
      people_merged: totalPeopleMerged,
      results: result.results.map((r) => ({
        orgId: r.orgId,
        orgName: r.orgName,
        success: r.success,
        error: r.error ?? null,
        icp_score: r.gemini?.icp_score ?? null,
        signalsCreated: r.signalsCreated,
        peopleFinder: r.peopleFinder ?? null,
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
