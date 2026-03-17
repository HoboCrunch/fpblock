import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SENDGRID_API_KEY = Deno.env.get("SENDGRID_API_KEY")!;
const HEYREACH_API_KEY = Deno.env.get("HEYREACH_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: log } = await supabase.from("job_log").insert({
    job_type: "sync_status",
    status: "started",
  }).select().single();

  try {
    let updatedCount = 0;

    // Sync SendGrid email statuses
    const { data: emailMessages } = await supabase
      .from("messages")
      .select("id, contact:contacts(email)")
      .eq("channel", "email")
      .in("status", ["sent"]);

    for (const msg of emailMessages || []) {
      const email = (msg as any).contact?.email;
      if (!email) continue;

      // SendGrid Activity API — check for events on this email
      const res = await fetch(
        `https://api.sendgrid.com/v3/messages?query=to_email="${email}"&limit=1`,
        { headers: { Authorization: `Bearer ${SENDGRID_API_KEY}` } }
      );

      if (res.ok) {
        const data = await res.json();
        const events = data.messages?.[0]?.events || [];
        const eventTypes = events.map((e: any) => e.event_name);

        let newStatus: string | null = null;
        if (eventTypes.includes("bounce") || eventTypes.includes("dropped")) {
          newStatus = "bounced";
        } else if (eventTypes.includes("open")) {
          newStatus = "opened";
        }

        if (newStatus) {
          await supabase.from("messages").update({ status: newStatus }).eq("id", msg.id);
          updatedCount++;
        }
      }

      await new Promise((r) => setTimeout(r, 200)); // Rate limit
    }

    // Sync HeyReach LinkedIn statuses
    const { data: linkedinMessages } = await supabase
      .from("messages")
      .select("id")
      .eq("channel", "linkedin")
      .in("status", ["sent"]);

    // TODO: Poll HeyReach API for message delivery/reply status

    await supabase.from("job_log").update({
      status: "completed",
      metadata: { updated_count: updatedCount, checked_email: emailMessages?.length || 0, checked_linkedin: linkedinMessages?.length || 0 },
    }).eq("id", log!.id);

    return new Response(JSON.stringify({ updated: updatedCount }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    await supabase.from("job_log").update({
      status: "failed",
      error: (error as Error).message,
    }).eq("id", log!.id);

    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
