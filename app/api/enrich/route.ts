import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const body = await request.json();

  const { contactIds, fields, source = "apollo", eventId } = body as {
    contactIds?: string[];
    fields: string[];
    source?: string;
    eventId?: string;
  };

  if (!fields || fields.length === 0) {
    return NextResponse.json(
      { error: "At least one field is required" },
      { status: 400 }
    );
  }

  // Create a job_log entry with status 'processing'
  const { data: job, error: jobError } = await supabase
    .from("job_log")
    .insert({
      job_type: "enrichment",
      target_table: "contacts",
      status: "processing",
      metadata: {
        source,
        fields,
        contact_ids: contactIds ?? null,
        event_id: eventId ?? null,
        contacts_processed: 0,
        emails_found: 0,
        linkedin_found: 0,
        twitter_found: 0,
        phone_found: 0,
      },
    })
    .select("id")
    .single();

  if (jobError || !job) {
    return NextResponse.json(
      { error: jobError?.message ?? "Failed to create job" },
      { status: 500 }
    );
  }

  // Resolve contacts to enrich
  let contactQuery = supabase.from("contacts").select("id, full_name, first_name, last_name, email, linkedin, twitter, phone, title, seniority, apollo_id, contact_company(company:companies(name, website))");

  if (contactIds && contactIds.length > 0) {
    contactQuery = contactQuery.in("id", contactIds);
  } else if (eventId) {
    const { data: eventContacts } = await supabase
      .from("contact_event")
      .select("contact_id")
      .eq("event_id", eventId);
    const ids = (eventContacts || []).map((ec: any) => ec.contact_id);
    if (ids.length > 0) contactQuery = contactQuery.in("id", ids);
  } else {
    contactQuery = contactQuery.is("apollo_id", null);
  }

  const { data: contacts } = await contactQuery.limit(100);

  if (!contacts || contacts.length === 0) {
    await supabase.from("job_log").update({ status: "completed", metadata: { source, fields, contacts_processed: 0, note: "No contacts to enrich" } }).eq("id", job.id);
    return NextResponse.json({ jobId: job.id, status: "completed", processed: 0 });
  }

  const APOLLO_API_KEY = process.env.APOLLO_API_KEY;
  if (!APOLLO_API_KEY) {
    await supabase.from("job_log").update({ status: "failed", error: "APOLLO_API_KEY not configured" }).eq("id", job.id);
    return NextResponse.json({ error: "APOLLO_API_KEY not configured" }, { status: 500 });
  }

  let contactsProcessed = 0, emailsFound = 0, linkedinFound = 0, twitterFound = 0;

  for (const contact of contacts) {
    try {
      const company = (contact as any).contact_company?.[0]?.company;
      const matchBody: Record<string, string> = {};
      if (contact.first_name) matchBody.first_name = contact.first_name;
      if (contact.last_name) matchBody.last_name = contact.last_name;
      if (!contact.first_name && !contact.last_name && contact.full_name) {
        const parts = contact.full_name.split(" ");
        matchBody.first_name = parts[0];
        matchBody.last_name = parts.slice(1).join(" ");
      }
      if (company?.name) matchBody.organization_name = company.name;
      if (company?.website) {
        try { matchBody.domain = new URL(company.website.startsWith("http") ? company.website : `https://${company.website}`).hostname.replace("www.", ""); } catch {}
      }
      if (contact.linkedin) matchBody.linkedin_url = contact.linkedin;

      const res = await fetch("https://api.apollo.io/v1/people/match", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Api-Key": APOLLO_API_KEY },
        body: JSON.stringify(matchBody),
      });
      if (!res.ok) continue;

      const data = await res.json();
      const person = data.person;
      if (!person) continue;

      const updates: Record<string, any> = { apollo_id: person.id };
      if (fields.includes("email") && person.email && !contact.email) { updates.email = person.email; emailsFound++; }
      if (fields.includes("linkedin") && person.linkedin_url && !contact.linkedin) { updates.linkedin = person.linkedin_url; linkedinFound++; }
      if (fields.includes("twitter") && person.twitter_url && !contact.twitter) { updates.twitter = person.twitter_url; twitterFound++; }
      if (fields.includes("phone") && person.phone_numbers?.[0]?.sanitized_number && !contact.phone) { updates.phone = person.phone_numbers[0].sanitized_number; }
      if (person.title && !contact.title) updates.title = person.title;
      if (person.seniority && !contact.seniority) updates.seniority = person.seniority;

      await supabase.from("contacts").update(updates).eq("id", contact.id);
      contactsProcessed++;
      await new Promise(r => setTimeout(r, 500)); // Rate limit
    } catch (err) {
      console.error(`Apollo error for ${contact.full_name}:`, err);
    }
  }

  await supabase.from("job_log").update({
    status: "completed",
    metadata: { source, fields, contacts_processed: contactsProcessed, emails_found: emailsFound, linkedin_found: linkedinFound, twitter_found: twitterFound },
  }).eq("id", job.id);

  return NextResponse.json({ jobId: job.id, status: "completed", contacts_processed: contactsProcessed, emails_found: emailsFound, linkedin_found: linkedinFound, twitter_found: twitterFound });
}
