import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function fillTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_, key) => {
    const parts = key.split(".");
    let val: any = vars;
    for (const p of parts) {
      val = val?.[p];
    }
    return val ?? "";
  });
}

async function callGemini(systemPrompt: string, userPrompt: string): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ parts: [{ text: userPrompt }] }],
      }),
    }
  );
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const body = await req.json();
  const {
    contact_ids,
    event_id,
    channels = ["linkedin", "email"],
    sequence_number = 1,
    prompt_template_id,
    sender_id,
    cta,
  } = body;

  // Load event config
  const { data: eventConfig } = await supabase
    .from("event_config")
    .select("*, sender:sender_profiles(*), prompt:prompt_templates(*)")
    .eq("event_id", event_id)
    .single();

  // Resolve overrides
  const effectiveSenderId = sender_id || eventConfig?.sender_id;
  const effectiveCta = cta || eventConfig?.cta_url || "";

  let sender = eventConfig?.sender;
  if (sender_id && sender_id !== eventConfig?.sender_id) {
    const { data } = await supabase.from("sender_profiles").select("*").eq("id", sender_id).single();
    sender = data;
  }

  const results = [];

  for (const contactId of contact_ids) {
    const { data: log } = await supabase.from("job_log").insert({
      job_type: "generate_messages",
      target_table: "contacts",
      target_id: contactId,
      status: "started",
    }).select().single();

    try {
      // Load contact with company context
      const { data: contact } = await supabase
        .from("contacts")
        .select("*, contact_company(*, company:companies(*))")
        .eq("id", contactId)
        .single();

      if (!contact) throw new Error("Contact not found");

      const primaryAff = contact.contact_company?.find((cc: any) => cc.is_primary) || contact.contact_company?.[0];
      const company = primaryAff?.company;

      // Load company signals for context
      let signalsContext = "";
      if (company) {
        const { data: signals } = await supabase
          .from("company_signals")
          .select("description")
          .eq("company_id", company.id)
          .order("date", { ascending: false })
          .limit(3);
        signalsContext = (signals || []).map((s: any) => s.description).join(". ");
      }

      // Load previous message if follow-up
      let previousMessage = "";
      if (sequence_number > 1) {
        const { data: prev } = await supabase
          .from("messages")
          .select("body")
          .eq("contact_id", contactId)
          .eq("sequence_number", sequence_number - 1)
          .neq("status", "superseded")
          .order("iteration", { ascending: false })
          .limit(1)
          .single();
        previousMessage = prev?.body || "";
      }

      const templateVars: Record<string, any> = {
        contact: {
          full_name: contact.full_name || "",
          title: contact.title || "",
          context: contact.context || "",
        },
        company: {
          name: company?.name || "",
          context: [company?.context, signalsContext].filter(Boolean).join(" "),
          description: company?.description || "",
          usp: company?.usp || "",
          icp_reason: company?.icp_reason || "",
        },
        sender: {
          name: sender?.name || "",
          tone_notes: sender?.tone_notes || "",
        },
        cta: effectiveCta,
        previous_message: previousMessage,
      };

      for (const channel of channels) {
        // Resolve prompt template for this channel
        let promptTemplate = eventConfig?.prompt;
        if (prompt_template_id) {
          const { data } = await supabase.from("prompt_templates").select("*").eq("id", prompt_template_id).single();
          if (data) promptTemplate = data;
        }
        // Try channel-specific template
        if (!prompt_template_id && channel !== promptTemplate?.channel) {
          const { data: channelTemplate } = await supabase
            .from("prompt_templates")
            .select("*")
            .eq("channel", channel)
            .limit(1)
            .single();
          if (channelTemplate) promptTemplate = channelTemplate;
        }

        if (!promptTemplate) throw new Error(`No prompt template found for channel ${channel}`);

        const systemPrompt = fillTemplate(promptTemplate.system_prompt, templateVars);
        const userPrompt = fillTemplate(promptTemplate.user_prompt_template, templateVars);

        const generated = await callGemini(systemPrompt, userPrompt);

        // Parse subject for email
        let subject: string | null = null;
        let messageBody = generated.trim();
        if (channel === "email" && messageBody.startsWith("Subject:")) {
          const lines = messageBody.split("\n");
          subject = lines[0].replace("Subject:", "").trim();
          messageBody = lines.slice(1).join("\n").trim();
        }

        // Check for existing message at this position — if so, supersede
        const { data: existing } = await supabase
          .from("messages")
          .select("id, iteration")
          .eq("contact_id", contactId)
          .eq("channel", channel)
          .eq("sequence_number", sequence_number)
          .neq("status", "superseded")
          .order("iteration", { ascending: false })
          .limit(1);

        let iteration = 1;
        if (existing && existing.length > 0) {
          iteration = existing[0].iteration + 1;
          await supabase
            .from("messages")
            .update({ status: "superseded" })
            .eq("id", existing[0].id);
        }

        await supabase.from("messages").insert({
          contact_id: contactId,
          company_id: company?.id || null,
          event_id,
          channel,
          sequence_number,
          iteration,
          subject,
          body: messageBody,
          status: "draft",
          sender_id: effectiveSenderId,
          cta: effectiveCta,
        });
      }

      await supabase.from("job_log").update({
        status: "completed",
        metadata: { channels, sequence_number },
      }).eq("id", log!.id);

      results.push({ id: contactId, status: "generated" });
    } catch (error) {
      await supabase.from("job_log").update({
        status: "failed",
        error: (error as Error).message,
      }).eq("id", log!.id);
      results.push({ id: contactId, status: "error", error: (error as Error).message });
    }
  }

  return new Response(JSON.stringify({ results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
