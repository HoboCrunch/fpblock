import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const APOLLO_API_KEY = Deno.env.get("APOLLO_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { contact_id, contact_ids } = await req.json();
  const ids = contact_ids || [contact_id];

  const results = [];

  for (const id of ids) {
    // Log start
    const { data: log } = await supabase.from("job_log").insert({
      job_type: "enrich_contact",
      target_table: "contacts",
      target_id: id,
      status: "started",
    }).select().single();

    try {
      // Get contact + primary company
      const { data: contact } = await supabase
        .from("contacts")
        .select("*, contact_company(company:companies(name))")
        .eq("id", id)
        .single();

      if (!contact) throw new Error("Contact not found");

      const companyName = contact.contact_company?.[0]?.company?.name;

      // Apollo People Search
      const searchRes = await fetch("https://api.apollo.io/v1/people/match", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Api-Key": APOLLO_API_KEY,
        },
        body: JSON.stringify({
          first_name: contact.first_name,
          last_name: contact.last_name,
          organization_name: companyName,
        }),
      });

      const searchData = await searchRes.json();
      const person = searchData.person;

      if (!person) {
        await supabase.from("job_log").update({
          status: "completed",
          metadata: { message: "No Apollo match found" },
        }).eq("id", log!.id);
        results.push({ id, status: "no_match" });
        continue;
      }

      // Update contact — don't overwrite existing values
      const updates: Record<string, string> = {};
      if (!contact.email && person.email) updates.email = person.email;
      if (!contact.linkedin && person.linkedin_url) updates.linkedin = person.linkedin_url;
      if (!contact.twitter && person.twitter_url) updates.twitter = person.twitter_url;
      if (!contact.phone && person.phone_numbers?.[0]?.raw_number) updates.phone = person.phone_numbers[0].raw_number;
      if (!contact.apollo_id && person.id) updates.apollo_id = person.id;
      if (!contact.seniority && person.seniority) updates.seniority = person.seniority;
      if (!contact.department && person.departments?.[0]) updates.department = person.departments[0];

      if (Object.keys(updates).length > 0) {
        await supabase.from("contacts").update(updates).eq("id", id);
      }

      await supabase.from("job_log").update({
        status: "completed",
        metadata: { fields_updated: Object.keys(updates), apollo_id: person.id },
      }).eq("id", log!.id);

      results.push({ id, status: "enriched", fields: Object.keys(updates) });
    } catch (error) {
      await supabase.from("job_log").update({
        status: "failed",
        error: (error as Error).message,
      }).eq("id", log!.id);
      results.push({ id, status: "error", error: (error as Error).message });
    }

    // Rate limiting — 500ms between calls
    if (ids.length > 1) await new Promise((r) => setTimeout(r, 500));
  }

  return new Response(JSON.stringify({ results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
