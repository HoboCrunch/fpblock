import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const BRAVE_API_KEY = Deno.env.get("BRAVE_SEARCH_API_KEY")!;
const PERPLEXITY_API_KEY = Deno.env.get("PERPLEXITY_API_KEY")!;
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function braveSearch(query: string): Promise<string[]> {
  const res = await fetch(
    `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5`,
    { headers: { "X-Subscription-Token": BRAVE_API_KEY, Accept: "application/json" } }
  );
  const data = await res.json();
  return (data.web?.results || []).map((r: any) => `${r.title}: ${r.description}`);
}

async function perplexitySearch(query: string): Promise<string> {
  const res = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${PERPLEXITY_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "sonar",
      messages: [
        { role: "system", content: "You are a company research assistant. Return concise factual information about recent company news, partnerships, funding, and product launches." },
        { role: "user", content: query },
      ],
    }),
  });
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

async function geminiSynthesize(companyName: string, braveResults: string[], perplexityResult: string): Promise<{ context: string; signals: { type: string; description: string; date: string | null }[] }> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `Analyze this research about ${companyName} and produce:
1. A concise "context" paragraph (2-3 sentences) summarizing their current situation, recent news, and why they're relevant right now.
2. A JSON array of individual "signals" — each with "type" (one of: news, funding, partnership, product_launch, regulatory, hiring, award), "description" (one sentence), and "date" (ISO date string or null).

Research results:
${braveResults.join("\n")}

Deeper analysis:
${perplexityResult}

Respond in JSON format only:
{"context": "...", "signals": [{"type": "...", "description": "...", "date": "..."}]}`
          }]
        }],
        generationConfig: { responseMimeType: "application/json" },
      }),
    }
  );
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '{"context":"","signals":[]}';
  return JSON.parse(text);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { company_id, company_ids } = await req.json();
  const ids = company_ids || [company_id];
  const results = [];

  for (const id of ids) {
    const { data: log } = await supabase.from("job_log").insert({
      job_type: "enrich_company",
      target_table: "companies",
      target_id: id,
      status: "started",
    }).select().single();

    try {
      const { data: company } = await supabase
        .from("companies")
        .select("*")
        .eq("id", id)
        .single();

      if (!company) throw new Error("Company not found");

      const query = `${company.name} recent news 2025 2026`;
      const [braveResults, perplexityResult] = await Promise.all([
        braveSearch(query),
        perplexitySearch(`What are the most recent news, partnerships, funding events, and product launches for ${company.name}? Focus on 2025-2026.`),
      ]);

      const synthesis = await geminiSynthesize(company.name, braveResults, perplexityResult);

      // Update company context
      await supabase.from("companies").update({ context: synthesis.context }).eq("id", id);

      // Insert signals
      if (synthesis.signals.length > 0) {
        await supabase.from("company_signals").insert(
          synthesis.signals.map((s) => ({
            company_id: id,
            signal_type: s.type,
            description: s.description,
            date: s.date || null,
            source: "enrichment",
          }))
        );
      }

      await supabase.from("job_log").update({
        status: "completed",
        metadata: { signals_count: synthesis.signals.length },
      }).eq("id", log!.id);

      results.push({ id, status: "enriched", signals: synthesis.signals.length });
    } catch (error) {
      await supabase.from("job_log").update({
        status: "failed",
        error: (error as Error).message,
      }).eq("id", log!.id);
      results.push({ id, status: "error", error: (error as Error).message });
    }
  }

  return new Response(JSON.stringify({ results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
