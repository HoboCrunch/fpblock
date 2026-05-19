import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { getInboxIdentities, runInboxSync } from "@/lib/inbox-sync";

/**
 * GET /api/inbox
 * - With `?type=persons&search=…`, returns a person search for the
 *   link-to-person modal.
 * - Without parameters, triggers a Fastmail inbox sync across every
 *   configured identity.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const searchType = url.searchParams.get("type");
  const search = url.searchParams.get("search");

  // Person search for link-to-person modal
  if (searchType === "persons" && search) {
    const supabase = await createClient();
    const { data: persons } = await supabase
      .from("persons")
      .select("id, full_name, email")
      .or(`full_name.ilike.%${search}%,email.ilike.%${search}%`)
      .limit(20);
    return NextResponse.json({ persons: persons || [] });
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

/**
 * POST /api/inbox
 * Manual "Link to Person" action: associate an inbound email with a person.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();

  let body: { emailId?: string; personId?: string; action?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { emailId, personId, action } = body;

  // Handle mark_read action
  if (action === "mark_read" && emailId) {
    const { error: readError } = await supabase
      .from("inbound_emails")
      .update({ is_read: true })
      .eq("id", emailId);

    if (readError) {
      return NextResponse.json(
        { error: "Failed to mark email as read", details: readError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  }

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
