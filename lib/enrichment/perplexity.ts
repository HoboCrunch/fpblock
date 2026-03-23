export interface PerplexityOrgResult {
  description: string | null;
  products: string | null;
  strengths: string[];
  weaknesses: string[];
  recent_news: { headline: string; date: string | null; source: string | null }[];
  target_market: string | null;
  raw_response: string;
  discovered_website: string | null;
}

const PERPLEXITY_API_URL = "https://api.perplexity.ai/chat/completions";

function buildPrompt(
  orgName: string,
  website?: string | null,
  existingContext?: string | null
): string {
  const websiteLine = website ? ` (website: ${website})` : "";
  const contextLine = existingContext
    ? `\n\nExisting context on this company (build on this, do not repeat it):\n${existingContext}`
    : "";

  return `Research the company "${orgName}"${websiteLine}.

Provide a structured analysis:
0. Company website URL (the official domain, e.g. https://example.com)
1. What does this company do? (2-3 sentences)
2. Key products or services
3. Competitive strengths (bullet points)
4. Weaknesses or risks (bullet points)
5. Recent news or developments from 2025-2026
6. Target market / who they serve

If existing context is provided, build on it rather than repeating it.${contextLine}

IMPORTANT: Format your response with these exact section headers on their own lines:
## Website
## Description
## Products
## Strengths
## Weaknesses
## Recent News
## Target Market`;
}

function extractWebsiteFromText(text: string): string | null {
  if (!text) return null;
  // Try to find a URL pattern
  const urlMatch = text.match(/https?:\/\/[^\s,)}\]"']+/i);
  if (urlMatch) {
    try {
      const url = new URL(urlMatch[0]);
      return url.origin;
    } catch { /* fall through */ }
  }
  // Try to find a domain pattern like "example.com"
  const domainMatch = text.match(/\b([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}\b/i);
  if (domainMatch) {
    return `https://${domainMatch[0]}`;
  }
  return null;
}

function parseSection(text: string, header: string, nextHeader?: string): string {
  const headerPattern = new RegExp(
    `##\\s*${header}\\s*\\n([\\s\\S]*?)${
      nextHeader ? `(?=##\\s*${nextHeader})` : "$"
    }`,
    "i"
  );
  const match = text.match(headerPattern);
  return match ? match[1].trim() : "";
}

function parseBullets(section: string): string[] {
  if (!section) return [];
  return section
    .split("\n")
    .map((line) => line.replace(/^[-*]\s*/, "").trim())
    .filter((line) => line.length > 0);
}

function parseNewsItems(
  section: string
): { headline: string; date: string | null; source: string | null }[] {
  if (!section) return [];
  const lines = section
    .split("\n")
    .map((line) => line.replace(/^[-*]\s*/, "").trim())
    .filter((line) => line.length > 0);

  return lines.map((line) => {
    // Try to extract a date pattern like (2025-01-15) or (Jan 2025) etc.
    const dateMatch = line.match(
      /\((\d{4}[-/]\d{1,2}(?:[-/]\d{1,2})?|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+\d{4})\)/i
    );
    // Try to extract a source like [Source: TechCrunch] or (via TechCrunch)
    const sourceMatch = line.match(
      /(?:\[(?:Source|via):\s*([^\]]+)\]|\((?:Source|via):\s*([^)]+)\))/i
    );

    let headline = line;
    if (dateMatch) headline = headline.replace(dateMatch[0], "").trim();
    if (sourceMatch) headline = headline.replace(sourceMatch[0], "").trim();
    // Clean up trailing/leading punctuation artifacts
    headline = headline.replace(/^[–—-]\s*/, "").replace(/\s*[–—-]\s*$/, "");

    return {
      headline: headline || line,
      date: dateMatch ? dateMatch[1] : null,
      source: sourceMatch ? sourceMatch[1] || sourceMatch[2] || null : null,
    };
  });
}

function parseResponse(raw: string): Omit<PerplexityOrgResult, "raw_response"> {
  const sections = [
    "Website",
    "Description",
    "Products",
    "Strengths",
    "Weaknesses",
    "Recent News",
    "Target Market",
  ];

  const websiteSection = parseSection(raw, sections[0], sections[1]);
  const description = parseSection(raw, sections[1], sections[2]) || null;
  const products = parseSection(raw, sections[2], sections[3]) || null;
  const strengths = parseBullets(parseSection(raw, sections[3], sections[4]));
  const weaknesses = parseBullets(parseSection(raw, sections[4], sections[5]));
  const recentNewsRaw = parseSection(raw, sections[5], sections[6]);
  const recent_news = parseNewsItems(recentNewsRaw);
  const target_market = parseSection(raw, sections[6]) || null;

  const discovered_website = extractWebsiteFromText(websiteSection)
    ?? extractWebsiteFromText(description ?? "")
    ?? null;

  return { description, products, strengths, weaknesses, recent_news, target_market, discovered_website };
}

export async function enrichFromPerplexity(
  orgName: string,
  website?: string | null,
  existingContext?: string | null
): Promise<PerplexityOrgResult> {
  const emptyResult: PerplexityOrgResult = {
    description: null,
    products: null,
    strengths: [],
    weaknesses: [],
    recent_news: [],
    target_market: null,
    raw_response: "",
    discovered_website: null,
  };

  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) {
    console.error("[perplexity] PERPLEXITY_API_KEY is not set");
    return emptyResult;
  }

  try {
    const response = await fetch(PERPLEXITY_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "sonar",
        messages: [
          {
            role: "system",
            content:
              "You are a business research analyst. Provide structured, factual analysis of companies. Use the exact section headers requested.",
          },
          {
            role: "user",
            content: buildPrompt(orgName, website, existingContext),
          },
        ],
      }),
    });

    if (!response.ok) {
      console.error(
        `[perplexity] API returned ${response.status}: ${response.statusText}`
      );
      return emptyResult;
    }

    const data = await response.json();
    const raw: string = data?.choices?.[0]?.message?.content ?? "";

    if (!raw) {
      console.error("[perplexity] Empty response from API");
      return emptyResult;
    }

    const parsed = parseResponse(raw);
    return { ...parsed, raw_response: raw };
  } catch (err) {
    console.error("[perplexity] Request failed:", err);
    return emptyResult;
  }
}
