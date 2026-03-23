import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchEmails } from "@/lib/fastmail";
import { correlateAndNotify } from "@/lib/inbox-correlator";

const ACCOUNTS = ["jb@gofpblock.com", "wes@gofpblock.com"];

/**
 * GET /api/inbox
 * Fetch emails from both Fastmail accounts, correlate, store, and return.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const searchType = url.searchParams.get("type");
  const search = url.searchParams.get("search");

  // Person search for link-to-person modal
  if (searchType === "contacts" && search) {
    const supabase = await createClient();
    const { data: persons } = await supabase
      .from("persons")
      .select("id, full_name, email")
      .or(`full_name.ilike.%${search}%,email.ilike.%${search}%`)
      .limit(20);
    return NextResponse.json({ contacts: persons || [] });
  }

  // Original email sync logic continues below...
  const apiKey = process.env.FASTMAIL_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "FASTMAIL_API_KEY not configured" },
      { status: 500 }
    );
  }

  const supabase = await createClient();
  const allEmails: unknown[] = [];
  const errors: Record<string, string> = {};

  for (const account of ACCOUNTS) {
    try {
      // Get last sync state for this account
      const { data: syncState } = await supabase
        .from("inbox_sync_state")
        .select("last_email_id")
        .eq("account_email", account)
        .single();

      const sinceId = syncState?.last_email_id || undefined;

      // Fetch emails from Fastmail
      const emails = await fetchEmails(apiKey, account, sinceId);

      if (emails.length === 0) continue;

      // Upsert emails into inbound_emails (skip duplicates by message_id)
      for (const email of emails) {
        const { data: existing } = await supabase
          .from("inbound_emails")
          .select("id")
          .eq("message_id", email.message_id)
          .eq("account_email", account)
          .limit(1)
          .single();

        if (existing) {
          allEmails.push({ ...email, id: existing.id, already_stored: true });
          continue;
        }

        const { data: inserted, error: insertError } = await supabase
          .from("inbound_emails")
          .insert(email)
          .select()
          .single();

        if (insertError) {
          console.error(`[inbox] Insert error for ${email.message_id}:`, insertError);
          continue;
        }

        if (inserted) {
          // Run correlation + Telegram notification
          const correlation = await correlateAndNotify(supabase, inserted);
          allEmails.push({
            ...inserted,
            correlation,
          });
        }
      }

      // Update sync state
      const latestEmailId = emails[0]?.message_id;
      if (latestEmailId) {
        await supabase
          .from("inbox_sync_state")
          .upsert(
            {
              account_email: account,
              last_email_id: latestEmailId,
              last_sync_at: new Date().toISOString(),
              status: "connected",
              error_message: null,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "account_email" }
          );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors[account] = message;
      console.error(`[inbox] Sync error for ${account}:`, message);

      // Update sync state to error
      await supabase
        .from("inbox_sync_state")
        .upsert(
          {
            account_email: account,
            status: "error",
            error_message: message,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "account_email" }
        );
    }
  }

  return NextResponse.json({
    emails: allEmails,
    errors: Object.keys(errors).length > 0 ? errors : undefined,
    synced_at: new Date().toISOString(),
  });
}

/**
 * POST /api/inbox
 * Manual "Link to Person" action: associate an inbound email with a person.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();

  let body: { emailId: string; personId: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { emailId, personId } = body;
  if (!emailId || !personId) {
    return NextResponse.json(
      { error: "emailId and personId are required" },
      { status: 400 }
    );
  }

  // Verify person exists
  const { data: person, error: personError } = await supabase
    .from("persons")
    .select("id, full_name")
    .eq("id", personId)
    .single();

  if (personError || !person) {
    return NextResponse.json({ error: "Person not found" }, { status: 404 });
  }

  // Update the inbound email
  const { error: updateError } = await supabase
    .from("inbound_emails")
    .update({
      person_id: personId,
      correlation_type: "manual",
    })
    .eq("id", emailId);

  if (updateError) {
    return NextResponse.json(
      { error: "Failed to link email", details: updateError.message },
      { status: 500 }
    );
  }

  // Log the manual correlation
  await supabase.from("job_log").insert({
    job_type: "inbox_correlation",
    target_table: "inbound_emails",
    target_id: emailId,
    status: "matched",
    metadata: {
      person_id: personId,
      correlation_type: "manual",
    },
  });

  return NextResponse.json({ success: true, person });
}
