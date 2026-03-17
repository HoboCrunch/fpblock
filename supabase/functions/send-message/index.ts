import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SENDGRID_API_KEY = Deno.env.get("SENDGRID_API_KEY")!;
const HEYREACH_API_KEY = Deno.env.get("HEYREACH_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function sendEmail(to: string, from: string, subject: string, body: string, signature: string): Promise<void> {
  const htmlBody = body.replace(/\n/g, "<br>") + (signature ? `<br><br>${signature.replace(/\n/g, "<br>")}` : "");
  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SENDGRID_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: from },
      subject: subject || "Meeting at the conference?",
      content: [{ type: "text/html", value: htmlBody }],
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`SendGrid error: ${res.status} ${err}`);
  }
}

async function sendLinkedIn(accountId: string, linkedinUrl: string, message: string): Promise<void> {
  const res = await fetch("https://api.heyreach.io/api/v1/messages/send", {
    method: "POST",
    headers: {
      "X-API-KEY": HEYREACH_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      accountId,
      linkedinUrl,
      message,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`HeyReach error: ${res.status} ${err}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { message_id, message_ids, source } = await req.json();

  let ids = message_ids || (message_id ? [message_id] : []);

  // If called by CRON, fetch scheduled messages
  if (source === "cron" && ids.length === 0) {
    const { data: scheduled } = await supabase
      .from("messages")
      .select("id")
      .eq("status", "scheduled")
      .lte("scheduled_at", new Date().toISOString());
    ids = (scheduled || []).map((m: any) => m.id);
  }

  if (ids.length === 0) {
    return new Response(JSON.stringify({ results: [], message: "No messages to send" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Set processing status to prevent double-sends
  await supabase
    .from("messages")
    .update({ status: "processing" })
    .in("id", ids);

  const results = [];

  for (const id of ids) {
    const { data: log } = await supabase.from("job_log").insert({
      job_type: "send_message",
      target_table: "messages",
      target_id: id,
      status: "started",
    }).select().single();

    try {
      const { data: message } = await supabase
        .from("messages")
        .select("*, contact:contacts(*), sender:sender_profiles(*)")
        .eq("id", id)
        .single();

      if (!message) throw new Error("Message not found");

      // Resolve sender — message override or fall back to event_config
      let sender = message.sender;
      if (!sender && message.event_id) {
        const { data: ec } = await supabase
          .from("event_config")
          .select("sender:sender_profiles(*)")
          .eq("event_id", message.event_id)
          .single();
        sender = ec?.sender;
      }

      switch (message.channel) {
        case "email": {
          if (!message.contact?.email) throw new Error("Contact has no email");
          if (!sender?.email) throw new Error("No sender email configured");
          await sendEmail(
            message.contact.email,
            sender.email,
            message.subject || `${message.contact.first_name} — Coffee at the conference?`,
            message.body,
            sender.signature || ""
          );
          break;
        }
        case "linkedin": {
          if (!message.contact?.linkedin) throw new Error("Contact has no LinkedIn URL");
          if (!sender?.heyreach_account_id) throw new Error("No HeyReach account configured");
          await sendLinkedIn(sender.heyreach_account_id, message.contact.linkedin, message.body);
          break;
        }
        case "twitter": {
          // Manual send — just mark as approved
          await supabase.from("messages").update({ status: "approved" }).eq("id", id);
          await supabase.from("job_log").update({
            status: "completed",
            metadata: { note: "Twitter requires manual send" },
          }).eq("id", log!.id);
          results.push({ id, status: "approved", note: "manual send required" });
          continue;
        }
        default:
          throw new Error(`Unsupported channel: ${message.channel}`);
      }

      await supabase.from("messages").update({
        status: "sent",
        sent_at: new Date().toISOString(),
      }).eq("id", id);

      await supabase.from("job_log").update({ status: "completed" }).eq("id", log!.id);
      results.push({ id, status: "sent" });
    } catch (error) {
      await supabase.from("messages").update({ status: "failed" }).eq("id", id);
      await supabase.from("job_log").update({
        status: "failed",
        error: (error as Error).message,
      }).eq("id", log!.id);
      results.push({ id, status: "failed", error: (error as Error).message });
    }
  }

  return new Response(JSON.stringify({ results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
