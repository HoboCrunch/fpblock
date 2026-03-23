/**
 * Apollo People Search Module
 *
 * Two-step process:
 * 1. Search for people at an org via /api/v1/mixed_people/api_search
 *    (returns names, titles, seniority — but NOT emails/phones)
 * 2. Enrich each found person via /v1/people/match to get contact details
 *
 * Auth uses X-Api-Key header (consistent with apollo.ts).
 */

const APOLLO_PEOPLE_SEARCH_URL =
  "https://api.apollo.io/api/v1/mixed_people/api_search";
const APOLLO_PEOPLE_MATCH_URL = "https://api.apollo.io/v1/people/match";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface PeopleFinderConfig {
  /** Max contacts to return per org (1–25). Default: 5 */
  perCompany: number;
  /** Seniority filters. Valid values: owner, founder, c_suite, partner, vp,
   *  director, manager, senior, entry */
  seniorities: string[];
  /** Department filters — applied client-side (API doesn't support this).
   *  Valid values: engineering, finance, sales, marketing, operations,
   *  executive, legal, human_resources, product */
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

function extractDomain(url: string): string | null {
  try {
    const normalized = url.startsWith("http") ? url : `https://${url}`;
    return new URL(normalized).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Map a raw Apollo person search result to ApolloPersonResult.
 * Search results have limited fields — email/phone come from the enrich step.
 */
function mapSearchResult(p: Record<string, unknown>): ApolloPersonResult {
  const first = typeof p.first_name === "string" ? p.first_name : null;
  const last = typeof p.last_name === "string" ? p.last_name : null;

  let fullName: string;
  if (typeof p.name === "string" && p.name.trim().length > 0) {
    fullName = p.name.trim();
  } else {
    fullName = [first, last].filter(Boolean).join(" ") || "Unknown";
  }

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
    phone: null, // Search doesn't return phone
    title: typeof p.title === "string" ? p.title : null,
    seniority: typeof p.seniority === "string" ? p.seniority : null,
    department,
    photo_url: typeof p.photo_url === "string" ? p.photo_url : null,
  };
}

// ---------------------------------------------------------------------------
// Step 1: Search for people at an organization
// ---------------------------------------------------------------------------

/**
 * Execute a people search request against Apollo's api_search endpoint.
 * Uses q_organization_domains_list for domain-based or q_keywords for name-based.
 */
async function doSearch(
  apiKey: string,
  orgName: string,
  config: PeopleFinderConfig,
  orgFilter: Record<string, unknown>
): Promise<PeopleFinderResult> {
  const emptyResult: PeopleFinderResult = {
    people: [],
    total_available: 0,
    error: null,
  };

  // Request more than needed if we're filtering departments client-side
  const requestCount =
    config.departments.length > 0
      ? Math.min(config.perCompany * 3, 25)
      : Math.min(Math.max(1, config.perCompany), 25);

  const body: Record<string, unknown> = {
    per_page: requestCount,
    page: 1,
    ...orgFilter,
  };

  if (config.seniorities.length > 0) {
    body.person_seniorities = config.seniorities;
  }

  try {
    const res = await fetch(APOLLO_PEOPLE_SEARCH_URL, {
      method: "POST",
      headers: {
        "X-Api-Key": apiKey,
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const msg = `People search failed for "${orgName}": ${res.status} ${res.statusText}`;
      console.error(`[apollo-people] ${msg}`, text.slice(0, 200));
      return { ...emptyResult, error: msg };
    }

    const data = await res.json();
    const rawPeople = Array.isArray(data.people) ? data.people : [];
    const totalAvailable =
      typeof data.pagination?.total_entries === "number"
        ? data.pagination.total_entries
        : rawPeople.length;

    let people = (rawPeople as Record<string, unknown>[]).map(mapSearchResult);

    // Client-side department filter (API doesn't support person_departments)
    if (config.departments.length > 0) {
      const deptSet = new Set(config.departments.map((d) => d.toLowerCase()));
      people = people.filter((p) => {
        if (!p.department) return true; // Include people with unknown department
        return deptSet.has(p.department.toLowerCase());
      });
    }

    // Trim to requested count
    people = people.slice(0, config.perCompany);

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
// Step 2: Enrich a person to get email/phone via /v1/people/match
// ---------------------------------------------------------------------------

/**
 * Enrich a single person via Apollo People Match to get email, phone, etc.
 * Returns updated person with contact details filled in.
 */
async function enrichPerson(
  apiKey: string,
  person: ApolloPersonResult,
  orgName: string,
  domain: string | null
): Promise<ApolloPersonResult> {
  const body: Record<string, unknown> = {};

  if (person.first_name) body.first_name = person.first_name;
  if (person.last_name) body.last_name = person.last_name;
  if (!person.first_name && !person.last_name && person.full_name) {
    const parts = person.full_name.split(" ");
    body.first_name = parts[0];
    body.last_name = parts.slice(1).join(" ");
  }
  if (orgName) body.organization_name = orgName;
  if (domain) body.domain = domain;
  if (person.linkedin_url) body.linkedin_url = person.linkedin_url;
  if (person.apollo_id) body.id = person.apollo_id;

  try {
    const res = await fetch(APOLLO_PEOPLE_MATCH_URL, {
      method: "POST",
      headers: {
        "X-Api-Key": apiKey,
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) return person; // Keep what we have

    const data = await res.json();
    const match = data.person as Record<string, unknown> | undefined;
    if (!match) return person;

    // Merge enriched fields onto the search result (don't overwrite existing)
    let phone: string | null = person.phone;
    if (
      !phone &&
      Array.isArray(match.phone_numbers) &&
      match.phone_numbers.length > 0
    ) {
      const ph = match.phone_numbers[0] as Record<string, unknown>;
      phone =
        typeof ph.sanitized_number === "string"
          ? ph.sanitized_number
          : typeof ph.raw_number === "string"
            ? ph.raw_number
            : null;
    }

    return {
      ...person,
      apollo_id:
        person.apollo_id || (typeof match.id === "string" ? match.id : person.apollo_id),
      email:
        person.email || (typeof match.email === "string" ? match.email : null),
      linkedin_url:
        person.linkedin_url ||
        (typeof match.linkedin_url === "string" ? match.linkedin_url : null),
      twitter_url:
        person.twitter_url ||
        (typeof match.twitter_url === "string" ? match.twitter_url : null),
      phone,
      title:
        person.title || (typeof match.title === "string" ? match.title : null),
      seniority:
        person.seniority ||
        (typeof match.seniority === "string" ? match.seniority : null),
      photo_url:
        person.photo_url ||
        (typeof match.photo_url === "string" ? match.photo_url : null),
    };
  } catch {
    return person; // Keep what we have on error
  } finally {
    await sleep(500);
  }
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Search for people at a given organization using Apollo's People Search API,
 * then enrich each found person via People Match to get contact details.
 *
 * Tries domain-based search first when a parseable domain is available. If that
 * returns 0 results, falls back to keyword search by org name.
 *
 * Never throws — returns an empty result with a populated `error` field on failure.
 */
export async function searchPeopleAtOrg(
  orgName: string,
  website: string | null | undefined,
  config: PeopleFinderConfig = DEFAULT_PEOPLE_FINDER_CONFIG
): Promise<PeopleFinderResult> {
  const emptyResult: PeopleFinderResult = {
    people: [],
    total_available: 0,
    error: null,
  };

  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) {
    console.error("[apollo-people] APOLLO_API_KEY not configured");
    return { ...emptyResult, error: "APOLLO_API_KEY not configured" };
  }

  const domain = website ? extractDomain(website) : null;

  // Step 1: Search for people
  let searchResult: PeopleFinderResult = emptyResult;

  // Try domain-based search first if available
  if (domain) {
    searchResult = await doSearch(apiKey, orgName, config, {
      q_organization_domains_list: [domain],
    });

    if (searchResult.people.length === 0 && !searchResult.error) {
      console.log(
        `[apollo-people] Domain search for "${orgName}" (${domain}) returned 0 results, trying keyword search`
      );
    }
  }

  // Keyword search fallback (or primary if no domain)
  if (searchResult.people.length === 0) {
    searchResult = await doSearch(apiKey, orgName, config, {
      q_keywords: orgName,
    });
  }

  if (searchResult.people.length === 0) {
    return searchResult; // No people found after all strategies
  }

  // Step 2: Enrich each person to get email/phone
  console.log(
    `[apollo-people] Found ${searchResult.people.length} people at "${orgName}", enriching for contact details...`
  );

  const enrichedPeople: ApolloPersonResult[] = [];
  for (const person of searchResult.people) {
    const enriched = await enrichPerson(apiKey, person, orgName, domain);
    enrichedPeople.push(enriched);
  }

  return {
    people: enrichedPeople,
    total_available: searchResult.total_available,
    error: null,
  };
}
