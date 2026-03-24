/**
 * Apollo Organization Enrichment Module
 *
 * Fetches structured firmographic data from Apollo's Organization Enrich API.
 * Auth uses X-Api-Key header (consistent with the rest of this codebase).
 */

import { fetchWithRetry } from "./fetch-with-retry";

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
 * Map a raw Apollo organization object to ApolloOrgResult.
 */
function mapOrg(org: Record<string, unknown>, data: Record<string, unknown>): ApolloOrgResult {
  return {
    description: (org.short_description as string) || (org.description as string) || null,
    industry: (org.industry as string) || null,
    employee_count:
      typeof org.estimated_num_employees === "number" ? org.estimated_num_employees : null,
    annual_revenue: formatRevenue(org.annual_revenue ?? org.estimated_annual_revenue ?? null),
    founded_year: typeof org.founded_year === "number" ? org.founded_year : null,
    technologies: Array.isArray(org.current_technologies)
      ? (org.current_technologies as string[])
      : [],
    funding_total: formatFunding(org.total_funding ?? null),
    latest_funding_stage:
      (org.latest_funding_stage as string) || (org.latest_funding_round_type as string) || null,
    linkedin_url: (org.linkedin_url as string) || null,
    website: (org.website_url as string) || (org.primary_domain as string) || null,
    hq_location: buildHqLocation(org),
    raw: data as Record<string, unknown>,
  };
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
 * Tries domain-based lookup first (more precise) when a website is provided.
 * If the domain lookup fails (non-200 response) or returns no org match, falls
 * back to name-based lookup. If no domain is available, goes straight to
 * name-based lookup.
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

  // Build strategies — prefer domain when available
  const strategies: URLSearchParams[] = [];
  const domain = website ? extractDomain(website) : null;

  if (domain) {
    const domainParams = new URLSearchParams();
    domainParams.set("domain", domain);
    strategies.push(domainParams);
  }

  // Always add name-based as fallback (or primary if no domain)
  const nameParams = new URLSearchParams();
  nameParams.set("name", orgName);
  strategies.push(nameParams);

  try {
    for (const params of strategies) {
      const res = await fetchWithRetry(
        `${APOLLO_ORG_ENRICH_URL}?${params.toString()}`,
        {
          method: "GET",
          headers: {
            "X-Api-Key": apiKey,
            "Content-Type": "application/json",
          },
        },
        {
          timeoutMs: 30_000,
          maxRetries: 3,
          context: `apollo:${orgName}`,
        },
      );

      if (!res.ok) {
        console.error(
          `[apollo] Organization enrich failed for "${orgName}" (${params.toString()}): ${res.status} ${res.statusText}`,
        );
        await sleep(500);
        continue; // Try next strategy
      }

      const data = await res.json();
      const org = data.organization as Record<string, unknown> | undefined;

      if (!org) {
        console.warn(`[apollo] No organization match for "${orgName}" (${params.toString()})`);
        await sleep(500);
        continue; // Try next strategy
      }

      // Found a match — map and return
      await sleep(500);
      return mapOrg(org, data as Record<string, unknown>);
    }

    // All strategies exhausted
    console.warn(`[apollo] No match found for "${orgName}" after all strategies`);
    return emptyResult;
  } catch (err) {
    console.error(`[apollo] Network error enriching "${orgName}":`, err);
    return emptyResult;
  }
}
