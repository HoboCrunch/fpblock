import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { getInboxIdentities, runInboxSync } from "@/lib/inbox-sync";

/**
 * POST /api/inbox/sync
 * Trigger a Fastmail inbox sync across every configured identity. Each
 * identity uses its own JMAP API token. Body is ignored.
 */
export async function POST(_request: NextRequest) {
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
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }
  const supabase = createServiceClient(supabaseUrl, serviceKey);

  const summary = await runInboxSync(supabase, identities);
  return NextResponse.json({
    success: true,
    ...summary,
    synced_at: new Date().toISOString(),
  });
}
