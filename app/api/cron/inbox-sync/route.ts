import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { getInboxIdentities, runInboxSync } from "@/lib/inbox-sync";

export const maxDuration = 60;

/**
 * GET /api/cron/inbox-sync
 * Vercel Cron: sync every configured Fastmail identity. Gated by CRON_SECRET.
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 500 }
    );
  }

  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const identities = getInboxIdentities();
  if (!identities.length) {
    return NextResponse.json(
      { error: "No Fastmail identities configured" },
      { status: 500 }
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.NEXT_SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json(
      { error: "Supabase not configured" },
      { status: 500 }
    );
  }
  const supabase = createServiceClient(supabaseUrl, serviceKey);

  const summary = await runInboxSync(supabase, identities);
  return NextResponse.json({
    success: true,
    ...summary,
    synced_at: new Date().toISOString(),
  });
}
