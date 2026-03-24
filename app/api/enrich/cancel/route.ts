import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/enrich/cancel
 *
 * Cancels a running enrichment job by setting its status to 'cancelled'.
 * The pipeline loops check for this status between iterations and stop early.
 */
export async function POST(request: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_SUPABASE_SECRET_KEY!
  );

  let body: { jobId?: string };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const { jobId } = body;

  if (!jobId) {
    return NextResponse.json(
      { error: "Missing required field: jobId" },
      { status: 400 }
    );
  }

  const { error } = await supabase
    .from("job_log")
    .update({ status: "cancelled" })
    .eq("id", jobId);

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
