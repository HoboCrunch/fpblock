import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { processImportJob } from "@/lib/uploads/import-runner";

export const maxDuration = 300;

/**
 * GET /api/cron/process-jobs
 *
 * Vercel Cron (every 5 minutes): resume any csv_import jobs that are either
 * pending or stalled (processing but not updated in >5 minutes). Gated by
 * CRON_SECRET, matching app/api/cron/inbox-sync/route.ts convention.
 *
 * Processes at most 3 jobs per cron run to stay within the maxDuration budget.
 */

const MAX_JOBS_PER_RUN = 3;
const STALL_MINUTES = 5;

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 500 },
    );
  }

  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.NEXT_SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json(
      { error: "Supabase not configured" },
      { status: 500 },
    );
  }

  const supabase = createServiceClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  // Find pending jobs OR stalled processing jobs (updated_at older than threshold)
  const stallThreshold = new Date(
    Date.now() - STALL_MINUTES * 60 * 1000,
  ).toISOString();

  const { data: jobs, error: fetchError } = await supabase
    .from("job_log")
    .select("id, status, updated_at, label")
    .eq("job_type", "csv_import")
    .or(
      `status.eq.pending,and(status.eq.processing,updated_at.lt.${stallThreshold})`,
    )
    .order("created_at", { ascending: true })
    .limit(MAX_JOBS_PER_RUN);

  if (fetchError) {
    return NextResponse.json(
      { error: fetchError.message },
      { status: 500 },
    );
  }

  const candidates = (jobs ?? []) as Array<{
    id: string;
    status: string;
    updated_at: string;
    label: string | null;
  }>;

  if (candidates.length === 0) {
    return NextResponse.json({
      processed: 0,
      message: "No pending or stalled csv_import jobs",
    });
  }

  const results: Array<{ jobId: string; label: string | null; ok: boolean; error?: string }> = [];

  for (const job of candidates) {
    try {
      await processImportJob(supabase, job.id);
      results.push({ jobId: job.id, label: job.label, ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({ jobId: job.id, label: job.label, ok: false, error: message });
    }
  }

  return NextResponse.json({
    processed: results.length,
    results,
    ran_at: new Date().toISOString(),
  });
}
