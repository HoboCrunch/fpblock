/**
 * Apollo People Search Module
 *
 * Searches for people at a given organization using Apollo's
 * /v1/mixed_people/search endpoint.
 * Auth uses X-Api-Key header (consistent with apollo.ts).
 */

const APOLLO_PEOPLE_SEARCH_URL = "https://api.apollo.io/v1/mixed_people/search";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface PeopleFinderConfig {
  /** Max contacts to return per org (1–25). Default: 5 */
  perCompany: number;
  /** Seniority filters. Valid values: owner, founder, c_suite, partner, vp,
   *  director, manager, senior, entry */
  seniorities: string[];
  /** Department filters. Valid values: engineering, finance, sales, marketing,
   *  operations, executive, legal, human_resources, product */
  departments: string[];
}

export const DEFAULT_PEOPLE_FINDER_CONFIG: PeopleFinderConfig = {
  perCompany: 5,
  seniorities: ["owner", "founder", "c_suite", "vp", "director"],
  departments: [],
};

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface ApolloPersonResult {
  apollo_id: string;
  full_name: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  linkedin_url: string | null;
  twitter_url: string | null;
  phone: string | null;
  title: string | null;
  seniority: string | null;
  department: string | null;
  photo_url: string | null;
}

export interface PeopleFinderResult {
  people: ApolloPersonResult[];
  total_available: number;
  error: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Strip protocol and www. prefix to produce a bare domain.
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
 * Sleep for the given number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Map a raw Apollo person object to ApolloPersonResult.
 */
function mapPerson(p: Record<string, unknown>): ApolloPersonResult {
  const first = typeof p.first_name === "string" ? p.first_name : null;
  const last = typeof p.last_name === "string" ? p.last_name : null;

  // Prefer Apollo's own name field; fall back to first + last concatenation
  let fullName: string;
  if (typeof p.name === "string" && p.name.trim().length > 0) {
    fullName = p.name.trim();
  } else {
    fullName = [first, last].filter(Boolean).join(" ");
  }

  // Apollo returns phone numbers as an array of objects with a `sanitized_number` field
  let phone: string | null = null;
  if (Array.isArray(p.phone_numbers) && p.phone_numbers.length > 0) {
    const first_phone = p.phone_numbers[0] as Record<string, unknown>;
    phone =
      typeof first_phone.sanitized_number === "string"
        ? first_phone.sanitized_number
        : typeof first_phone.raw_number === "string"
          ? first_phone.raw_number
          : null;
  }

  // Apollo returns departments as an array; take the first entry
  let department: string | null = null;
  if (Array.isArray(p.departments) && p.departments.length > 0) {
    department = typeof p.departments[0] === "string" ? p.departments[0] : null;
  } else if (typeof p.department === "string") {
    department = p.department;
  }

  return {
    apollo_id: typeof p.id === "string" ? p.id : String(p.id ?? ""),
    full_name: fullName,
    first_name: first,
    last_name: last,
    email: typeof p.email === "string" ? p.email : null,
    linkedin_url: typeof p.linkedin_url === "string" ? p.linkedin_url : null,
    twitter_url: typeof p.twitter_url === "string" ? p.twitter_url : null,
    phone,
    title: typeof p.title === "string" ? p.title : null,
    seniority: typeof p.seniority === "string" ? p.seniority : null,
    department,
    photo_url: typeof p.photo_url === "string" ? p.photo_url : null,
  };
}

// ---------------------------------------------------------------------------
// Private API helper
// ---------------------------------------------------------------------------

/**
 * Execute a single people search request with the given org filter.
 * Handles rate limiting (500ms sleep) after every call.
 * Never throws — returns an empty result with a populated `error` field on failure.
 */
async function doSearch(
  apiKey: string,
  orgName: string,
  config: PeopleFinderConfig,
  orgFilter: Record<string, unknown>,
): Promise<PeopleFinderResult> {
  const emptyResult: PeopleFinderResult = { people: [], total_available: 0, error: null };

  const body: Record<string, unknown> = {
    per_page: Math.min(Math.max(1, config.perCompany), 25),
    ...orgFilter,
  };

  if (config.seniorities.length > 0) {
    body.person_seniorities = config.seniorities;
  }
  if (config.departments.length > 0) {
    body.person_departments = config.departments;
  }

  try {
    const res = await fetch(APOLLO_PEOPLE_SEARCH_URL, {
      method: "POST",
      headers: { "X-Api-Key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const msg = `People search failed for "${orgName}": ${res.status} ${res.statusText}`;
      console.error(`[apollo-people] ${msg}`);
      return { ...emptyResult, error: msg };
    }

    const data = await res.json();
    const rawPeople = Array.isArray(data.people) ? data.people : [];
    const totalAvailable =
      typeof data.pagination?.total_entries === "number"
        ? data.pagination.total_entries
        : rawPeople.length;

    const people = (rawPeople as Record<string, unknown>[]).map(mapPerson);
    return { people, total_available: totalAvailable, error: null };
  } catch (err) {
    const msg = `Network error searching people at "${orgName}": ${String(err)}`;
    console.error(`[apollo-people] ${msg}`);
    return { ...emptyResult, error: msg };
  } finally {
    await sleep(500);
  }
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Search for people at a given organization using Apollo's People Search API.
 *
 * Tries domain-based search first when a parseable domain is available. If that
 * returns 0 results, falls back to name-based search. If no domain is available,
 * goes straight to name-based search.
 *
 * Never throws — returns an empty result with a populated `error` field on failure.
 */
export async function searchPeopleAtOrg(
  orgName: string,
  website: string | null | undefined,
  config: PeopleFinderConfig = DEFAULT_PEOPLE_FINDER_CONFIG,
): Promise<PeopleFinderResult> {
  const emptyResult: PeopleFinderResult = { people: [], total_available: 0, error: null };

  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) {
    console.error("[apollo-people] APOLLO_API_KEY not configured");
    return { ...emptyResult, error: "APOLLO_API_KEY not configured" };
  }

  const domain = website ? extractDomain(website) : null;

  // Try domain-based search first if available
  if (domain) {
    const result = await doSearch(apiKey, orgName, config, { organization_domains: [domain] });
    if (result.people.length > 0) return result;

    // Domain search returned 0 results — fall back to name-based
    console.log(
      `[apollo-people] Domain search for "${orgName}" (${domain}) returned 0 results, trying name-based`,
    );
  }

  // Name-based search (primary if no domain, fallback if domain returned nothing)
  const result = await doSearch(apiKey, orgName, config, { organization_names: [orgName] });
  return result;
}
