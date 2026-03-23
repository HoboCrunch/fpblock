import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { fetchEmails } from "@/lib/fastmail";
import { correlateAndNotify } from "@/lib/inbox-correlator";

/**
 * POST /api/inbox/sync
 * Trigger sync for a specific account.
 * Body: { accountEmail: string }
 */
export async function POST(request: NextRequest) {
  const apiKey = process.env.FASTMAIL_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "FASTMAIL_API_KEY not configured" },
      { status: 500 }
    );
  }

  let body: { accountEmail: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { accountEmail } = body;
  if (!accountEmail) {
    return NextResponse.json(
      { error: "accountEmail is required" },
      { status: 400 }
    );
  }

  // Use service role client to bypass RLS (this is a server-side background sync)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.NEXT_SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }
  const supabase = createServiceClient(supabaseUrl, serviceKey);

  try {
    // Get last sync state
    const { data: syncState } = await supabase
      .from("inbox_sync_state")
      .select("last_email_id")
      .eq("account_email", accountEmail)
      .single();

    const sinceId = syncState?.last_email_id || undefined;

    // Fetch new emails
    const emails = await fetchEmails(apiKey, accountEmail, sinceId);

    let newCount = 0;
    let correlatedCount = 0;

    for (const email of emails) {
      // Skip duplicates
      const { data: existing } = await supabase
        .from("inbound_emails")
        .select("id")
        .eq("message_id", email.message_id)
        .eq("account_email", accountEmail)
        .limit(1)
        .maybeSingle();

      if (existing) continue;

      const { data: inserted, error: insertErr } = await supabase
        .from("inbound_emails")
        .insert(email)
        .select()
        .single();

      if (insertErr) {
        console.error(`[inbox-sync] insert error for ${email.subject}:`, insertErr.message);
        continue;
      }

      if (inserted) {
        newCount++;
        const result = await correlateAndNotify(supabase, inserted);
        if (result.person_id) correlatedCount++;
      }
    }

    // Update sync state
    const latestEmailId = emails[0]?.message_id;
    const unreadCount = emails.filter((e) => !e.is_read).length;

    await supabase
      .from("inbox_sync_state")
      .upsert(
        {
          account_email: accountEmail,
          last_email_id: latestEmailId || syncState?.last_email_id || null,
          last_sync_at: new Date().toISOString(),
          unread_count: unreadCount,
          status: "connected" as const,
          error_message: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "account_email" }
      );

    return NextResponse.json({
      success: true,
      account: accountEmail,
      new_emails: newCount,
      correlated: correlatedCount,
      synced_at: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    // Update sync state to error
    await supabase
      .from("inbox_sync_state")
      .upsert(
        {
          account_email: accountEmail,
          status: "error" as const,
          error_message: message,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "account_email" }
      );

    return NextResponse.json(
      { error: "Sync failed", details: message },
      { status: 500 }
    );
  }
}
