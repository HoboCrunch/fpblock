import type { ApolloOrgResult } from "./apollo";
import type { PerplexityOrgResult } from "./perplexity";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GeminiSynthesisResult {
  description: string | null;
  context: string | null;
  usp: string | null;
  icp_score: number | null;
  icp_reason: string | null;
  category: string | null;
  signals: { signal_type: string; description: string; date: string | null }[];
}

// ---------------------------------------------------------------------------
// ICP criteria — embedded verbatim so every Gemini call scores consistently
// ---------------------------------------------------------------------------

const DEFAULT_ICP_CRITERIA = `
FP Block — 2026 ICP One-Pager (Clean)

What Defines Our ICP
We work with teams that need to move fast, but cannot afford to be wrong.
Our ICP is defined by decision pressure under permanence, not by industry, funding stage, or technology choice.

The Core ICP Test
A team is a real ICP when 4 of 5 are true:
1. Being wrong carries a clear financial, reputational, or legal cost
2. That cost is persistent or externally visible
3. They are already aware of this risk
4. Decisions accelerate once clarity appears
5. They value avoiding irreversible regret more than maximising short-term speed
If fewer than 4 are true -> do not advance.

One-Sentence ICP Profiles (2026)
- Regret-Aware Builders — Teams making irreversible system decisions where failure would create lasting financial, reputational, or legal damage.
- Systemically Exposed Operators — Teams running live, persistent systems where failures propagate directly to users and cannot be quietly reset.
- Regulated or Regulation-Bound Teams — Teams whose systems must withstand audits, enforcement, or legal challenge once deployed.
- Infrastructure Stewards — Teams responsible for long-lived systems where ownership, explainability, and failure accountability matter more than feature velocity.
- AI-Accelerated, Decision-Heavy Teams — Teams shipping quickly with AI where execution is cheap but architectural mistakes permanently lock in risk.

Cost of Being Wrong (At Least One Must Be Present)
Financial: Real money, assets, or revenue at risk; Expensive or impossible redesigns
Reputational: Public failure or trust erosion; Long or uncertain recovery timelines
Legal / Regulatory: Compliance scrutiny or audits; Personal or corporate liability
If none are clearly present -> not our ICP.

One-Sentence Firm Disqualifiers
- MVP-to-Get-Funded Teams — Building primarily to raise capital rather than live with consequences.
- Uniform-Speed Thinkers — Treating all decisions as equally reversible.
- "We'll Fix It Later" Teams — Assuming architectural regret can always be refactored away.
- No Downside Owner — No individual clearly accountable for failure.
- Internal-Only Consequences — Being wrong only causes internal rework.
- Evangelism-Required Prospects — Needing persuasion that correctness or trust matter.
- Tool-First Buyers — Optimising stacks instead of incentives, ownership, and failure modes.
- Judgment-Averse Buyers — Willing to pay for delivery but not thinking.
If any one is dominant -> pause.

Speed Doctrine
We value speed where failure is cheap and correctness where failure is expensive.
Fail fast on reversible decisions. Slow down only where mistakes persist.
`.trim();

const DEFAULT_FP_BLOCK_POSITIONING = `
FP Block is a full-stack engineering firm that builds and rescues mission-critical systems.
They use a proprietary framework (Kolme) to give clients the performance of a dedicated infrastructure with the flexibility of a multi-system world — architecting systems where failure is not an option.
FP Block provides a third path: application-specific infrastructure with isolation, control, and seamless interoperability — so teams own what they build without being cut off from the broader ecosystem.
`.trim();

const DEFAULT_LANGUAGE_RULES = `Lead with: permanence, ownership, irreversibility, incentives, trust boundaries.
AVOID using these words/phrases unless absolutely essential: blockchain, DeFi, Web3, on-chain, crypto, smart contracts, TVL, rollup, ZK.
If the problem sounds real without naming blockchain, describe it that way.`;

// ---------------------------------------------------------------------------
// Company context type
// ---------------------------------------------------------------------------

interface CompanyContext {
  company_name?: string;
  positioning?: string | null;
  icp_criteria?: string | null;
  language_rules?: string | null;
}

// ---------------------------------------------------------------------------
// Prompt construction
// ---------------------------------------------------------------------------

function buildPrompt(
  orgName: string,
  apollo: ApolloOrgResult | null,
  perplexity: PerplexityOrgResult | null,
  existingOrg?: {
    description?: string | null;
    context?: string | null;
    usp?: string | null;
    icp_score?: number | null;
  } | null,
  companyContext?: CompanyContext | null
): string {
  const sections: string[] = [];

  const companyName = companyContext?.company_name || "FP Block";
  const positioning = companyContext?.positioning || DEFAULT_FP_BLOCK_POSITIONING;
  const icpCriteria = companyContext?.icp_criteria || DEFAULT_ICP_CRITERIA;
  const languageRules = companyContext?.language_rules || DEFAULT_LANGUAGE_RULES;

  sections.push(`You are an ICP analyst for ${companyName}. Your job is to synthesize firmographic and research data about "${orgName}" into a structured profile with an ICP score.`);

  sections.push(`--- ${companyName.toUpperCase()} POSITIONING ---\n${positioning}`);

  sections.push(`--- ICP SCORING CRITERIA (follow exactly) ---\n${icpCriteria}`);

  if (apollo) {
    sections.push(`--- APOLLO FIRMOGRAPHIC DATA ---\n${JSON.stringify(apollo, null, 2)}`);
  }

  if (perplexity) {
    sections.push(`--- PERPLEXITY RESEARCH ---\n${JSON.stringify(perplexity, null, 2)}`);
  }

  if (existingOrg) {
    sections.push(`--- EXISTING ORG DATA (update/improve, do not regress quality) ---\n${JSON.stringify(existingOrg, null, 2)}`);
  }

  sections.push(`--- LANGUAGE RULES (critical) ---\n${languageRules}`);

  sections.push(`--- OUTPUT FORMAT ---
Return a single JSON object with these fields:
{
  "description": "2-3 sentences describing what this org does. Focus on their real-world function, not jargon.",
  "context": "Strategic context — why this org matters for ${companyName}, referencing specific ICP criteria they match (or fail to match).",
  "usp": "The angle or entry point for ${companyName} to approach them. What pain point or pressure makes ${companyName} relevant?",
  "icp_score": <integer 0-100, following the scoring criteria exactly>,
  "icp_reason": "1 sentence explaining the score, referencing ICP test criteria.",
  "category": "<one of: Custody, Protocol, Infrastructure, Exchange, VC, Government, L1/L2, Payments, Gaming, Identity, Analytics, Other>",
  "signals": [
    { "signal_type": "<e.g. funding, partnership, launch, regulatory, hiring>", "description": "...", "date": "<ISO date or null>" }
  ]
}

Scoring guide:
- 90-100: Matches 5/5 core ICP tests, clear cost-of-being-wrong, no disqualifiers.
- 75-89: Matches 4/5, clear cost-of-being-wrong, no dominant disqualifiers.
- 50-74: Matches 3/5 or has a soft disqualifier. Possible but not priority.
- 25-49: Matches 2/5 or has a dominant disqualifier.
- 0-24: Clearly outside ICP or multiple firm disqualifiers.

Return ONLY the JSON object. No markdown, no code fences, no commentary.`);

  return sections.join("\n\n");
}

// ---------------------------------------------------------------------------
// Gemini API call
// ---------------------------------------------------------------------------

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

export async function synthesizeWithGemini(
  orgName: string,
  apollo: ApolloOrgResult | null,
  perplexity: PerplexityOrgResult | null,
  existingOrg?: {
    description?: string | null;
    context?: string | null;
    usp?: string | null;
    icp_score?: number | null;
  } | null,
  companyContext?: CompanyContext | null
): Promise<GeminiSynthesisResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is not set");
  }

  const prompt = buildPrompt(orgName, apollo, perplexity, existingOrg, companyContext);

  const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "(unreadable)");
    throw new Error(
      `Gemini API error ${res.status}: ${body.slice(0, 500)}`
    );
  }

  const data = await res.json();

  // Extract text from Gemini's response structure
  const rawText: string | undefined =
    data?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!rawText) {
    console.error("Gemini returned no text content:", JSON.stringify(data).slice(0, 500));
    return emptyResult();
  }

  return parseGeminiResponse(rawText);
}

// ---------------------------------------------------------------------------
// Response parsing
// ---------------------------------------------------------------------------

function parseGeminiResponse(raw: string): GeminiSynthesisResult {
  try {
    // Strip markdown code fences if Gemini ignores responseMimeType
    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/, "")
      .trim();

    const parsed = JSON.parse(cleaned);

    return {
      description: typeof parsed.description === "string" ? parsed.description : null,
      context: typeof parsed.context === "string" ? parsed.context : null,
      usp: typeof parsed.usp === "string" ? parsed.usp : null,
      icp_score:
        typeof parsed.icp_score === "number" && Number.isInteger(parsed.icp_score)
          ? Math.max(0, Math.min(100, parsed.icp_score))
          : null,
      icp_reason: typeof parsed.icp_reason === "string" ? parsed.icp_reason : null,
      category: typeof parsed.category === "string" ? parsed.category : null,
      signals: Array.isArray(parsed.signals)
        ? parsed.signals
            .filter(
              (s: unknown): s is { signal_type: string; description: string; date?: string | null } =>
                typeof s === "object" &&
                s !== null &&
                typeof (s as Record<string, unknown>).signal_type === "string" &&
                typeof (s as Record<string, unknown>).description === "string"
            )
            .map((s: Record<string, unknown>) => ({
              signal_type: s.signal_type as string,
              description: s.description as string,
              date: typeof s.date === "string" ? s.date : null,
            }))
        : [],
    };
  } catch (err) {
    console.error(
      "Failed to parse Gemini response:",
      err instanceof Error ? err.message : err,
      "\nRaw:",
      raw.slice(0, 500)
    );
    return emptyResult();
  }
}

function emptyResult(): GeminiSynthesisResult {
  return {
    description: null,
    context: null,
    usp: null,
    icp_score: null,
    icp_reason: null,
    category: null,
    signals: [],
  };
}
