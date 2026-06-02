import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadSentPage } from "@/lib/inbox/load-sent";

export const dynamic = "force-dynamic";

/**
 * GET /api/inbox/sent — one page of the threaded Sent view.
 * Query: cursor (ISO timestamp), limit (default 50), q (subject search).
 * Auth: the authenticated server client (same session gate as the inbox page).
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const cursor = url.searchParams.get("cursor");
  const limitParam = url.searchParams.get("limit");
  const q = url.searchParams.get("q");
  const limit = limitParam ? Math.min(parseInt(limitParam, 10) || 50, 200) : 50;

  try {
    const supabase = await createClient();
    const page = await loadSentPage(supabase, { cursor, limit, q });
    return NextResponse.json(page);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[inbox/sent] failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
