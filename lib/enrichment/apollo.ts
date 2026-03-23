/**
 * Apollo Organization Enrichment Module
 *
 * Fetches structured firmographic data from Apollo's Organization Enrich API.
 * Auth uses X-Api-Key header (consistent with the rest of this codebase).
 */

export interface ApolloOrgResult {
  description: string | null;
  industry: string | null;
  employee_count: number | null;
  annual_revenue: string | null;
  founded_year: number | null;
  technologies: string[];
  funding_total: string | null;
  latest_funding_stage: string | null;
  linkedin_url: string | null;
  website: string | null;
  hq_location: string | null;
  raw: Record<string, unknown>;
}

const APOLLO_ORG_ENRICH_URL = "https://api.apollo.io/v1/organizations/enrich";

/**
 * Extract a bare domain from a URL string.
 * e.g. "https://www.example.com/about" -> "example.com"
 */
function extractDomain(url: string): string | null {
  try {
    const normalized = url.startsWith("http") ? url : `https://${url}`;
    return new URL(normalized).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/**
 * Format a revenue number into a human-readable string.
 */
function formatRevenue(raw: unknown): string | null {
  if (raw == null) return null;
  const num = typeof raw === "number" ? raw : Number(raw);
  if (Number.isNaN(num)) return String(raw);
  if (num >= 1_000_000_000) return `$${(num / 1_000_000_000).toFixed(1)}B`;
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `$${(num / 1_000).toFixed(0)}K`;
  return `$${num}`;
}

/**
 * Format a funding amount into a human-readable string.
 */
function formatFunding(raw: unknown): string | null {
  if (raw == null) return null;
  const num = typeof raw === "number" ? raw : Number(raw);
  if (Number.isNaN(num)) return String(raw);
  if (num >= 1_000_000_000) return `$${(num / 1_000_000_000).toFixed(1)}B`;
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `$${(num / 1_000).toFixed(0)}K`;
  return `$${num}`;
}

/**
 * Build an HQ location string from Apollo's address fields.
 */
function buildHqLocation(org: Record<string, unknown>): string | null {
  const parts: string[] = [];
  if (org.city && typeof org.city === "string") parts.push(org.city);
  if (org.state && typeof org.state === "string") parts.push(org.state);
  if (org.country && typeof org.country === "string") parts.push(org.country);
  return parts.length > 0 ? parts.join(", ") : null;
}

/**
 * Sleep for the given number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Enrich an organization via the Apollo Organization Enrich API.
 *
 * Prefers domain-based lookup (more precise) when a website is provided,
 * falls back to name-based lookup otherwise.
 *
 * Never throws -- returns null-filled results on error.
 */
export async function enrichFromApollo(
  orgName: string,
  website?: string | null,
): Promise<ApolloOrgResult> {
  const emptyResult: ApolloOrgResult = {
    description: null,
    industry: null,
    employee_count: null,
    annual_revenue: null,
    founded_year: null,
    technologies: [],
    funding_total: null,
    latest_funding_stage: null,
    linkedin_url: null,
    website: null,
    hq_location: null,
    raw: {},
  };

  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) {
    console.error("[apollo] APOLLO_API_KEY not configured");
    return emptyResult;
  }

  // Build query params -- prefer domain when available
  const params = new URLSearchParams();
  const domain = website ? extractDomain(website) : null;
  if (domain) {
    params.set("domain", domain);
  } else {
    params.set("name", orgName);
  }

  try {
    const res = await fetch(`${APOLLO_ORG_ENRICH_URL}?${params.toString()}`, {
      method: "GET",
      headers: {
        "X-Api-Key": apiKey,
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) {
      console.error(
        `[apollo] Organization enrich failed for "${orgName}": ${res.status} ${res.statusText}`,
      );
      return emptyResult;
    }

    const data = await res.json();
    const org = data.organization as Record<string, unknown> | undefined;

    if (!org) {
      console.warn(`[apollo] No organization match for "${orgName}"`);
      return emptyResult;
    }

    const result: ApolloOrgResult = {
      description: (org.short_description as string) || (org.description as string) || null,
      industry: (org.industry as string) || null,
      employee_count:
        typeof org.estimated_num_employees === "number"
          ? org.estimated_num_employees
          : null,
      annual_revenue: formatRevenue(
        org.annual_revenue ?? org.estimated_annual_revenue ?? null,
      ),
      founded_year:
        typeof org.founded_year === "number" ? org.founded_year : null,
      technologies: Array.isArray(org.current_technologies)
        ? (org.current_technologies as string[])
        : [],
      funding_total: formatFunding(org.total_funding ?? null),
      latest_funding_stage:
        (org.latest_funding_stage as string) ||
        (org.latest_funding_round_type as string) ||
        null,
      linkedin_url: (org.linkedin_url as string) || null,
      website: (org.website_url as string) || (org.primary_domain as string) || null,
      hq_location: buildHqLocation(org),
      raw: data as Record<string, unknown>,
    };

    return result;
  } catch (err) {
    console.error(`[apollo] Network error enriching "${orgName}":`, err);
    return emptyResult;
  } finally {
    // Rate limit: 500ms pause after every call (success or failure)
    await sleep(500);
  }
}
