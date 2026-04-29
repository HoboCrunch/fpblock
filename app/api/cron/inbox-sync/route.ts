import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { fetchEmails } from "@/lib/fastmail";
import { correlateAndNotify } from "@/lib/inbox-correlator";

export const maxDuration = 60;

const ACCOUNTS = ["jb@gofpblock.com", "wes@gofpblock.com"];

/**
 * GET /api/cron/inbox-sync
 * Vercel Cron: pulls new emails from each Fastmail account, correlates,
 * stores, and fires Telegram notifications. Gated by CRON_SECRET.
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

  const apiKey = process.env.FASTMAIL_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "FASTMAIL_API_KEY not configured" },
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

  const summary: Record<
    string,
    { new_emails: number; correlated: number; error?: string }
  > = {};

  for (const account of ACCOUNTS) {
    try {
      const { data: syncState } = await supabase
        .from("inbox_sync_state")
        .select("last_email_id")
        .eq("account_email", account)
        .single();

      const sinceId = syncState?.last_email_id || undefined;
      const emails = await fetchEmails(apiKey, account, sinceId);

      let newCount = 0;
      let correlatedCount = 0;

      for (const email of emails) {
        const { data: existing } = await supabase
          .from("inbound_emails")
          .select("id")
          .eq("message_id", email.message_id)
          .eq("account_email", account)
          .limit(1)
          .maybeSingle();

        if (existing) continue;

        const { data: inserted, error: insertErr } = await supabase
          .from("inbound_emails")
          .insert(email)
          .select()
          .single();

        if (insertErr) {
          console.error(
            `[cron/inbox-sync] insert error for ${email.subject}:`,
            insertErr.message
          );
          continue;
        }

        if (inserted) {
          newCount++;
          const result = await correlateAndNotify(supabase, inserted);
          if (result.person_id) correlatedCount++;
        }
      }

      const latestEmailId = emails[0]?.message_id;
      const unreadCount = emails.filter((e) => !e.is_read).length;

      await supabase.from("inbox_sync_state").upsert(
        {
          account_email: account,
          last_email_id: latestEmailId || syncState?.last_email_id || null,
          last_sync_at: new Date().toISOString(),
          unread_count: unreadCount,
          status: "connected" as const,
          error_message: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "account_email" }
      );

      summary[account] = {
        new_emails: newCount,
        correlated: correlatedCount,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[cron/inbox-sync] sync failed for ${account}:`, message);

      await supabase.from("inbox_sync_state").upsert(
        {
          account_email: account,
          status: "error" as const,
          error_message: message,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "account_email" }
      );

      summary[account] = { new_emails: 0, correlated: 0, error: message };
    }
  }

  return NextResponse.json({
    success: true,
    accounts: summary,
    synced_at: new Date().toISOString(),
  });
}
