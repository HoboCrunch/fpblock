import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { processImportJob } from "@/lib/uploads/import-runner";

export const maxDuration = 300;

/**
 * POST /api/uploads/process
 *
 * Processes a pending csv_import job. Called fire-and-forget by the upload
 * page immediately after the client uploads the JSON payload to Storage.
 * The cron route /api/cron/process-jobs resumes any jobs that stall.
 *
 * Body: { jobId: string }
 */
export async function POST(req: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.NEXT_SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json(
      { error: "Supabase not configured" },
      { status: 500 },
    );
  }

  let jobId: string;
  try {
    const body = await req.json();
    jobId = body?.jobId;
    if (!jobId || typeof jobId !== "string") {
      return NextResponse.json({ error: "jobId is required" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const supabase = createServiceClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  try {
    await processImportJob(supabase, jobId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
