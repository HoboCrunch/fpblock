import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function evaluateConditions(conditions: Record<string, any>, row: Record<string, any>): boolean {
  for (const [field, rule] of Object.entries(conditions)) {
    const value = row[field];
    if (typeof rule === "object" && rule !== null) {
      if ("gte" in rule && (value == null || value < rule.gte)) return false;
      if ("lte" in rule && (value == null || value > rule.lte)) return false;
      if ("eq" in rule && value !== rule.eq) return false;
      if ("neq" in rule && value === rule.neq) return false;
      if ("in" in rule && !rule.in.includes(value)) return false;
    } else {
      if (value !== rule) return false;
    }
  }
  return true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { table, event, id } = await req.json();

  // Load the changed row
  const { data: row } = await supabase.from(table).select("*").eq("id", id).single();
  if (!row) {
    return new Response(JSON.stringify({ message: "Row not found" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Find matching automation rules
  const { data: rules } = await supabase
    .from("automation_rules")
    .select("*")
    .eq("trigger_table", table)
    .eq("trigger_event", event)
    .eq("enabled", true);

  const triggered = [];

  for (const rule of rules || []) {
    // For contact_company triggers, we need to resolve the company for condition checks
    let evalRow = row;
    if (table === "contact_company" && rule.conditions && Object.keys(rule.conditions).some(k => k.startsWith("icp_"))) {
      const { data: company } = await supabase.from("companies").select("*").eq("id", row.company_id).single();
      evalRow = { ...row, ...company };
    }

    if (!evaluateConditions(rule.conditions, evalRow)) continue;

    await supabase.from("job_log").insert({
      job_type: "automation",
      target_table: table,
      target_id: id,
      status: "started",
      metadata: { rule_name: rule.name, action: rule.action },
    });

    // Invoke the appropriate edge function
    const functionName = rule.action.replace(/_/g, "-");
    const payload: Record<string, any> = { ...rule.action_params };

    if (rule.action === "enrich_contact") {
      payload.contact_id = table === "contacts" ? id : row.contact_id;
    } else if (rule.action === "enrich_company") {
      payload.company_id = table === "companies" ? id : row.company_id;
    } else if (rule.action === "generate_sequence") {
      payload.contact_ids = [table === "contacts" ? id : row.contact_id];
    }

    await fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    triggered.push({ rule: rule.name, action: rule.action });
  }

  return new Response(JSON.stringify({ triggered }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
