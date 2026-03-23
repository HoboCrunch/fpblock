# Organization People Finder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a people-finding stage to the organization enrichment pipeline that discovers contacts at companies via Apollo People Search, creates/merges person records with source tracking, and deduplicates against existing persons.

**Architecture:** New `lib/enrichment/apollo-people.ts` module calls Apollo's `/v1/mixed_people/search` endpoint with configurable filters (contacts per company, seniority, role categories). The pipeline orchestrator gains a `people_finder` stage that runs after the existing stages. Found persons are deduplicated against existing records via email/linkedin/apollo_id exact matching before insert. New persons get `source: 'org_enrichment'` and a `person_organization` link with `source: 'org_enrichment'`. Existing persons only gain new contact fields (COALESCE-style). Post-insert, `find_person_correlations` RPC is called to surface fuzzy matches for manual review.

**Tech Stack:** TypeScript, Apollo People Search API, Supabase (Postgres), Next.js API routes, React (admin UI)

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `lib/enrichment/apollo-people.ts` | Apollo People Search API client — search for people at an org by domain/name, return structured person results |
| Modify | `lib/enrichment/pipeline.ts` | Add `runPeopleFinderEnrichment()` stage runner + integrate into `runFullEnrichment()` and `runBatchEnrichment()` |
| Modify | `app/api/enrich/organizations/route.ts` | Accept new `peopleFinderConfig` param, pass to pipeline, include people-finder stats in response |
| Modify | `app/admin/enrichment/page.tsx` | Add People Finder toggle + config controls (contacts/company, seniority, departments) to the Organization Enrichment tab |
| Create | `supabase/migrations/018_people_finder.sql` | (Intentionally empty — no schema changes needed. `person_organization.source` and `persons.source` already exist.) |

---

### Task 1: Apollo People Search API Client

**Files:**
- Create: `lib/enrichment/apollo-people.ts`

This module calls Apollo's `/v1/mixed_people/search` endpoint to find people at a given organization. It returns structured person data ready for DB insertion.

- [ ] **Step 1: Create the Apollo People Search module**

```typescript
// lib/enrichment/apollo-people.ts

/**
 * Apollo People Search Module
 *
 * Searches for people at a given organization using Apollo's Mixed People Search API.
 * Returns structured person data for DB insertion/dedup.
 */

export interface PeopleFinderConfig {
  /** Max contacts to return per organization (1-25, default 5) */
  perCompany: number;
  /** Seniority filter — empty = all. Values: "owner","founder","c_suite","partner","vp","director","manager","senior","entry" */
  seniorities: string[];
  /** Department filter — empty = all. Values: "engineering","finance","sales","marketing","operations","executive","legal","human_resources","product" */
  departments: string[];
}

export const DEFAULT_PEOPLE_FINDER_CONFIG: PeopleFinderConfig = {
  perCompany: 5,
  seniorities: ["owner", "founder", "c_suite", "vp", "director"],
  departments: [],
};

export interface ApolloPersonResult {
  apollo_id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string;
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

const APOLLO_PEOPLE_SEARCH_URL = "https://api.apollo.io/v1/mixed_people/search";

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
 * Search for people at an organization using Apollo's Mixed People Search API.
 *
 * Never throws — returns empty results with error message on failure.
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

  // Build search body
  const body: Record<string, unknown> = {
    per_page: Math.min(Math.max(config.perCompany, 1), 25),
    page: 1,
  };

  // Organization filter — prefer domain, fall back to name
  const domain = website ? extractDomain(website) : null;
  if (domain) {
    body.organization_domains = [domain];
  } else {
    body.organization_names = [orgName];
  }

  // Seniority filter
  if (config.seniorities.length > 0) {
    body.person_seniorities = config.seniorities;
  }

  // Department filter
  if (config.departments.length > 0) {
    body.person_departments = config.departments;
  }

  try {
    const res = await fetch(APOLLO_PEOPLE_SEARCH_URL, {
      method: "POST",
      headers: {
        "X-Api-Key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(
        `[apollo-people] Search failed for "${orgName}": ${res.status} ${res.statusText}`,
        text
      );
      return { ...emptyResult, error: `Apollo API ${res.status}: ${res.statusText}` };
    }

    const data = await res.json();
    const rawPeople = (data.people ?? []) as Record<string, unknown>[];
    const totalAvailable =
      typeof data.pagination?.total_entries === "number"
        ? data.pagination.total_entries
        : rawPeople.length;

    const people: ApolloPersonResult[] = rawPeople.map((p) => ({
      apollo_id: String(p.id ?? ""),
      first_name: (p.first_name as string) || null,
      last_name: (p.last_name as string) || null,
      full_name: (p.name as string) || [p.first_name, p.last_name].filter(Boolean).join(" ") || "Unknown",
      email: (p.email as string) || null,
      linkedin_url: (p.linkedin_url as string) || null,
      twitter_url: (p.twitter_url as string) || null,
      phone:
        Array.isArray(p.phone_numbers) && p.phone_numbers.length > 0
          ? ((p.phone_numbers[0] as Record<string, unknown>)?.sanitized_number as string) || null
          : null,
      title: (p.title as string) || null,
      seniority: (p.seniority as string) || null,
      department: (p.departments?.[0] as string) ?? (p.department as string) ?? null,
      photo_url: (p.photo_url as string) || null,
    }));

    return {
      people,
      total_available: totalAvailable,
      error: null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[apollo-people] Network error searching "${orgName}":`, message);
    return { ...emptyResult, error: message };
  } finally {
    await sleep(500);
  }
}
```

- [ ] **Step 2: Verify the module compiles**

Run: `npx tsc --noEmit lib/enrichment/apollo-people.ts 2>&1 | head -20`
Expected: No errors (or only project-level errors unrelated to this file)

---

### Task 2: Pipeline Integration — People Finder Stage

**Files:**
- Modify: `lib/enrichment/pipeline.ts:1-603`

Add `runPeopleFinderEnrichment()` that: searches Apollo for people, deduplicates against existing persons by email/linkedin/apollo_id, creates new person records with `source: 'org_enrichment'`, links them via `person_organization`, and calls `find_person_correlations` to surface fuzzy matches. Integrate into `runFullEnrichment()` and batch runner.

- [ ] **Step 1: Add imports and types to pipeline.ts**

At the top of `lib/enrichment/pipeline.ts`, add the import after the existing imports (line 5):

```typescript
import {
  searchPeopleAtOrg,
  PeopleFinderConfig,
  DEFAULT_PEOPLE_FINDER_CONFIG,
  ApolloPersonResult,
  PeopleFinderResult,
} from "./apollo-people";
```

Update `EnrichmentResult` interface (around line 19) to add people finder stats:

```typescript
export interface EnrichmentResult {
  orgId: string;
  orgName: string;
  success: boolean;
  error?: string;
  apollo?: ApolloOrgResult | null;
  perplexity?: PerplexityOrgResult | null;
  gemini?: GeminiSynthesisResult | null;
  signalsCreated: number;
  peopleFinder?: {
    found: number;
    created: number;
    merged: number;
    correlationCandidates: number;
  } | null;
}
```

- [ ] **Step 2: Add the dedup-and-insert helper function**

Add this function after the `insertSignals` function (after line 167):

```typescript
/**
 * Dedup-aware person insertion from org enrichment.
 *
 * For each Apollo person result:
 * 1. Check for existing person by apollo_id, email, or linkedin_url (exact match)
 * 2. If found: COALESCE new fields onto existing person (don't overwrite)
 * 3. If not found: insert new person with source='org_enrichment'
 * 4. Ensure person_organization link exists with source='org_enrichment'
 * 5. Run find_person_correlations to surface fuzzy matches for review
 *
 * Returns { created, merged, correlationCandidates }
 */
async function insertPeopleFromOrg(
  supabase: SupabaseClient,
  orgId: string,
  orgName: string,
  people: ApolloPersonResult[]
): Promise<{ created: number; merged: number; correlationCandidates: number }> {
  let created = 0;
  let merged = 0;
  let correlationCandidates = 0;

  for (const person of people) {
    try {
      // Step 1: Try to find existing person by apollo_id, email, or linkedin
      let existingId: string | null = null;

      if (person.apollo_id) {
        const { data } = await supabase
          .from("persons")
          .select("id")
          .eq("apollo_id", person.apollo_id)
          .limit(1)
          .maybeSingle();
        if (data) existingId = data.id;
      }

      if (!existingId && person.email) {
        const { data } = await supabase
          .from("persons")
          .select("id")
          .ilike("email", person.email)
          .limit(1)
          .maybeSingle();
        if (data) existingId = data.id;
      }

      if (!existingId && person.linkedin_url) {
        const { data } = await supabase
          .from("persons")
          .select("id")
          .ilike("linkedin_url", person.linkedin_url)
          .limit(1)
          .maybeSingle();
        if (data) existingId = data.id;
      }

      if (existingId) {
        // Step 2: Merge — COALESCE new fields onto existing (don't overwrite)
        const { data: existing } = await supabase
          .from("persons")
          .select("email, linkedin_url, twitter_handle, phone, title, seniority, department, photo_url, apollo_id")
          .eq("id", existingId)
          .single();

        if (existing) {
          const updates: Record<string, unknown> = {};
          if (!existing.email && person.email) updates.email = person.email;
          if (!existing.linkedin_url && person.linkedin_url) updates.linkedin_url = person.linkedin_url;
          if (!existing.twitter_handle && person.twitter_url) updates.twitter_handle = person.twitter_url;
          if (!existing.phone && person.phone) updates.phone = person.phone;
          if (!existing.title && person.title) updates.title = person.title;
          if (!existing.seniority && person.seniority) updates.seniority = person.seniority;
          if (!existing.department && person.department) updates.department = person.department;
          if (!existing.photo_url && person.photo_url) updates.photo_url = person.photo_url;
          if (!existing.apollo_id && person.apollo_id) updates.apollo_id = person.apollo_id;

          if (Object.keys(updates).length > 0) {
            await supabase.from("persons").update(updates).eq("id", existingId);
          }
        }
        merged++;
      } else {
        // Step 3: Create new person
        const { data: newPerson, error: insertErr } = await supabase
          .from("persons")
          .insert({
            full_name: person.full_name,
            first_name: person.first_name,
            last_name: person.last_name,
            email: person.email,
            linkedin_url: person.linkedin_url,
            twitter_handle: person.twitter_url,
            phone: person.phone,
            title: person.title,
            seniority: person.seniority,
            department: person.department,
            photo_url: person.photo_url,
            apollo_id: person.apollo_id || null,
            source: "org_enrichment",
          })
          .select("id")
          .single();

        if (insertErr || !newPerson) {
          console.error(`[pipeline] Failed to insert person ${person.full_name}:`, insertErr?.message);
          continue;
        }
        existingId = newPerson.id;
        created++;

        // Step 5: Run fuzzy correlation check for the new person
        const { data: correlations } = await supabase.rpc("find_person_correlations", {
          p_person_id: newPerson.id,
        });

        if (correlations && correlations.length > 0) {
          // Insert correlation candidates for manual review
          const candidates = correlations
            .filter((c: { confidence: number }) => c.confidence >= 0.6)
            .map((c: { target_id: string; confidence: number; match_reasons: unknown }) => ({
              entity_type: "person",
              source_id: newPerson.id,
              target_id: c.target_id,
              confidence: c.confidence,
              match_reasons: c.match_reasons,
              status: "pending",
            }));

          if (candidates.length > 0) {
            await supabase.from("correlation_candidates").insert(candidates);
            correlationCandidates += candidates.length;
          }
        }
      }

      // Step 4: Ensure person_organization link exists
      if (existingId) {
        const { data: existingLink } = await supabase
          .from("person_organization")
          .select("id")
          .eq("person_id", existingId)
          .eq("organization_id", orgId)
          .maybeSingle();

        if (!existingLink) {
          await supabase.from("person_organization").insert({
            person_id: existingId,
            organization_id: orgId,
            role: person.title || null,
            role_type: person.seniority ? mapSeniorityToRoleType(person.seniority) : null,
            is_current: true,
            is_primary: false,
            source: "org_enrichment",
          });
        }
      }
    } catch (err) {
      console.error(`[pipeline] Error processing person ${person.full_name}:`, err);
    }
  }

  return { created, merged, correlationCandidates };
}

/**
 * Map Apollo seniority values to our role_type enum.
 */
function mapSeniorityToRoleType(seniority: string): string {
  switch (seniority) {
    case "owner":
    case "founder":
      return "founder";
    case "c_suite":
    case "partner":
    case "vp":
    case "director":
      return "executive";
    case "manager":
    case "senior":
      return "employee";
    default:
      return "employee";
  }
}
```

- [ ] **Step 3: Add the runPeopleFinderEnrichment stage runner**

Add this after `runGeminiSynthesis` (after line 353):

```typescript
/**
 * Run People Finder enrichment for an org — searches Apollo for contacts,
 * deduplicates, inserts/merges persons, creates org links.
 */
export async function runPeopleFinderEnrichment(
  supabase: SupabaseClient,
  orgId: string,
  config: PeopleFinderConfig = DEFAULT_PEOPLE_FINDER_CONFIG
): Promise<{
  success: boolean;
  data?: PeopleFinderResult;
  stats?: { created: number; merged: number; correlationCandidates: number };
}> {
  const org = await fetchOrg(supabase, orgId);
  if (!org) return { success: false };

  const jobId = await logJob(supabase, {
    job_type: "enrichment_people_finder",
    target_table: "organizations",
    target_id: orgId,
    status: "processing",
    metadata: { org_name: org.name, config },
  });

  try {
    const result = await searchPeopleAtOrg(org.name, org.website, config);

    if (result.error) {
      if (jobId) {
        await updateJob(supabase, jobId, {
          status: "failed",
          error: result.error,
          metadata: { org_name: org.name },
        });
      }
      return { success: false };
    }

    // Dedup and insert people
    const stats = await insertPeopleFromOrg(supabase, orgId, org.name, result.people);

    if (jobId) {
      await updateJob(supabase, jobId, {
        status: "completed",
        metadata: {
          org_name: org.name,
          people_found: result.people.length,
          total_available: result.total_available,
          people_created: stats.created,
          people_merged: stats.merged,
          correlation_candidates: stats.correlationCandidates,
        },
      });
    }

    return { success: true, data: result, stats };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[pipeline] People finder failed for ${org.name}:`, message);
    if (jobId) {
      await updateJob(supabase, jobId, { status: "failed", error: message });
    }
    return { success: false };
  }
}
```

- [ ] **Step 4: Update runFullEnrichment to include people finder**

In the `runFullEnrichment` function, add a `peopleFinderConfig` parameter and run it after the Gemini stage. Update the function signature (line 362) and add Step 5 before the final log:

Change the function signature to:

```typescript
export async function runFullEnrichment(
  supabase: SupabaseClient,
  orgId: string,
  peopleFinderConfig?: PeopleFinderConfig | null
): Promise<EnrichmentResult> {
```

After the signal insertion block (after the `// Step 4: Insert signals` section around line 464), add:

```typescript
    // Step 5: Run People Finder if configured
    let peopleFinderStats: EnrichmentResult["peopleFinder"] = null;
    if (peopleFinderConfig) {
      const pfResult = await runPeopleFinderEnrichment(supabase, orgId, peopleFinderConfig);
      if (pfResult.success && pfResult.stats) {
        peopleFinderStats = {
          found: pfResult.data?.people.length ?? 0,
          ...pfResult.stats,
        };
      }
    }
```

Update the return value to include `peopleFinder: peopleFinderStats` and update the job metadata to include people finder stats:

```typescript
    // In the job completion metadata, add:
    people_found: peopleFinderStats?.found ?? 0,
    people_created: peopleFinderStats?.created ?? 0,
    people_merged: peopleFinderStats?.merged ?? 0,
```

And in the return object:

```typescript
    return {
      orgId,
      orgName: org.name,
      success: true,
      apollo: apolloResult,
      perplexity: perplexityResult,
      gemini: geminiResult,
      signalsCreated,
      peopleFinder: peopleFinderStats,
    };
```

Also update the error return to include `peopleFinder: null`.

- [ ] **Step 5: Update runBatchEnrichment to pass peopleFinderConfig**

Update the `runBatchEnrichment` options type (around line 515) to include:

```typescript
  options?: {
    stages?: ("apollo" | "perplexity" | "gemini" | "full" | "people_finder")[];
    onProgress?: (completed: number, total: number, orgName: string) => void;
    concurrency?: number;
    peopleFinderConfig?: PeopleFinderConfig | null;
  }
```

In the `stages.includes("full")` branch, pass the config:

```typescript
if (stages.includes("full")) {
  result = await runFullEnrichment(supabase, orgId, options?.peopleFinderConfig);
}
```

In the individual-stages branch, add people_finder support after gemini:

```typescript
if (stages.includes("people_finder")) {
  const pfRes = await runPeopleFinderEnrichment(
    supabase,
    orgId,
    options?.peopleFinderConfig ?? DEFAULT_PEOPLE_FINDER_CONFIG
  );
  if (pfRes.success && pfRes.stats) {
    result.peopleFinder = {
      found: pfRes.data?.people.length ?? 0,
      ...pfRes.stats,
    };
  } else {
    lastError = "People finder failed";
  }
}
```

- [ ] **Step 6: Verify pipeline.ts compiles**

Run: `npx tsc --noEmit lib/enrichment/pipeline.ts 2>&1 | head -20`
Expected: No errors

---

### Task 3: API Route — Accept People Finder Config

**Files:**
- Modify: `app/api/enrich/organizations/route.ts:1-206`

Add `peopleFinderConfig` to the request body and pass it through to the batch runner. Include people-finder stats in the response.

- [ ] **Step 1: Update the request body type and destructuring**

Update the body type (around line 17) to include:

```typescript
let body: {
  organizationIds?: string[];
  stages?: string[];
  eventId?: string;
  initiativeId?: string;
  icpBelow?: number;
  peopleFinderConfig?: {
    perCompany?: number;
    seniorities?: string[];
    departments?: string[];
  } | null;
};
```

Add to the destructuring (around line 34):

```typescript
const {
  organizationIds,
  stages = ["full"],
  eventId,
  initiativeId,
  icpBelow,
  peopleFinderConfig,
} = body;
```

- [ ] **Step 2: Pass peopleFinderConfig to runBatchEnrichment**

Update the `runBatchEnrichment` call (around line 146):

```typescript
const result = await runBatchEnrichment(supabase, orgIds, {
  stages: validStages.length > 0 ? validStages : ["full"],
  concurrency: 1,
  peopleFinderConfig: peopleFinderConfig
    ? {
        perCompany: peopleFinderConfig.perCompany ?? 5,
        seniorities: peopleFinderConfig.seniorities ?? ["owner", "founder", "c_suite", "vp", "director"],
        departments: peopleFinderConfig.departments ?? [],
      }
    : null,
});
```

- [ ] **Step 3: Include people-finder stats in the response**

Update the results mapping (around line 181) to include people finder data:

```typescript
results: result.results.map((r) => ({
  orgId: r.orgId,
  orgName: r.orgName,
  success: r.success,
  error: r.error ?? null,
  icp_score: r.gemini?.icp_score ?? null,
  signalsCreated: r.signalsCreated,
  peopleFinder: r.peopleFinder ?? null,
})),
```

Add aggregate stats to the response body:

```typescript
const totalPeopleFound = result.results.reduce(
  (sum, r) => sum + (r.peopleFinder?.found ?? 0), 0
);
const totalPeopleCreated = result.results.reduce(
  (sum, r) => sum + (r.peopleFinder?.created ?? 0), 0
);
const totalPeopleMerged = result.results.reduce(
  (sum, r) => sum + (r.peopleFinder?.merged ?? 0), 0
);
```

Include these in the JSON response:

```typescript
people_found: totalPeopleFound,
people_created: totalPeopleCreated,
people_merged: totalPeopleMerged,
```

Also update the `validStages` filter (line 141) to include `"people_finder"`:

```typescript
const validStages = stages.filter((s): s is "apollo" | "perplexity" | "gemini" | "full" | "people_finder" =>
  ["apollo", "perplexity", "gemini", "full", "people_finder"].includes(s)
);
```

- [ ] **Step 4: Verify route compiles**

Run: `npx tsc --noEmit app/api/enrich/organizations/route.ts 2>&1 | head -20`
Expected: No errors

---

### Task 4: Admin UI — People Finder Controls

**Files:**
- Modify: `app/admin/enrichment/page.tsx`

Add a "People Finder" toggle and configuration panel to the Organization Enrichment tab. The toggle enables/disables people finding as part of the pipeline. When enabled, shows controls for contacts per company, seniority filters, and department filters.

- [ ] **Step 1: Add People Finder types and constants**

Near the top of the file (after the existing type definitions around line 44), add:

```typescript
type OrgStage = "apollo" | "perplexity" | "gemini" | "full" | "people_finder";

// People Finder config
const SENIORITY_OPTIONS = [
  { value: "owner", label: "Owner" },
  { value: "founder", label: "Founder" },
  { value: "c_suite", label: "C-Suite" },
  { value: "partner", label: "Partner" },
  { value: "vp", label: "VP" },
  { value: "director", label: "Director" },
  { value: "manager", label: "Manager" },
  { value: "senior", label: "Senior" },
  { value: "entry", label: "Entry" },
];

const DEPARTMENT_OPTIONS = [
  { value: "executive", label: "Executive" },
  { value: "engineering", label: "Engineering" },
  { value: "sales", label: "Sales" },
  { value: "marketing", label: "Marketing" },
  { value: "finance", label: "Finance" },
  { value: "operations", label: "Operations" },
  { value: "product", label: "Product" },
  { value: "legal", label: "Legal" },
  { value: "human_resources", label: "HR" },
];
```

Also update `OrgEnrichResponse` (around line 62) to include people finder stats:

```typescript
interface OrgEnrichResponse {
  jobId?: string;
  status?: string;
  orgs_processed: number;
  orgs_enriched: number;
  orgs_failed: number;
  signals_created: number;
  people_found?: number;
  people_created?: number;
  people_merged?: number;
  results?: OrgEnrichResult[];
  error?: string;
  message?: string;
}
```

- [ ] **Step 2: Add People Finder as a stage option**

Update the `STAGE_OPTIONS` array (around line 1096) to add a new entry after the existing stages:

```typescript
const STAGE_OPTIONS: {
  key: OrgStage;
  label: string;
  description: string;
  icon: typeof Zap;
}[] = [
  {
    key: "full",
    label: "Full Pipeline",
    description: "All three stages",
    icon: Sparkles,
  },
  {
    key: "apollo",
    label: "Apollo",
    description: "Firmographics",
    icon: Search,
  },
  {
    key: "perplexity",
    label: "Perplexity",
    description: "Deep Research",
    icon: FlaskConical,
  },
  {
    key: "gemini",
    label: "Gemini",
    description: "Synthesis + ICP Score",
    icon: Brain,
  },
  {
    key: "people_finder",
    label: "People Finder",
    description: "Find contacts at org",
    icon: Users,
  },
];
```

- [ ] **Step 3: Add People Finder config state to OrganizationEnrichmentTab**

In the `OrganizationEnrichmentTab` component (around line 1139), add state variables after the existing state:

```typescript
// People Finder config
const [pfEnabled, setPfEnabled] = useState(false);
const [pfPerCompany, setPfPerCompany] = useState(5);
const [pfSeniorities, setPfSeniorities] = useState<string[]>(["owner", "founder", "c_suite", "vp", "director"]);
const [pfDepartments, setPfDepartments] = useState<string[]>([]);
```

Update the stage toggle logic (the `toggleStage` function around line 1343). When `people_finder` is selected alongside `full`, both should be active. The `people_finder` stage is additive — it doesn't conflict with `full`:

```typescript
function toggleStage(stage: OrgStage) {
  if (stage === "people_finder") {
    setPfEnabled((prev) => !prev);
    setStages((prev) => {
      if (prev.includes("people_finder")) {
        return prev.filter((s) => s !== "people_finder");
      }
      return [...prev, "people_finder"];
    });
    return;
  }
  if (stage === "full") {
    setStages((prev) => {
      const hasPf = prev.includes("people_finder");
      return hasPf ? ["full", "people_finder"] : ["full"];
    });
    return;
  }
  setStages((prev) => {
    const withoutFull = prev.filter((s) => s !== "full");
    if (withoutFull.includes(stage)) {
      const next = withoutFull.filter((s) => s !== stage);
      if (next.filter((s) => s !== "people_finder").length === 0) {
        return next.includes("people_finder") ? ["full", "people_finder"] : ["full"];
      }
      return next;
    }
    return [...withoutFull, stage];
  });
}
```

Also update the `isActive` check in the stage button rendering to handle `people_finder`:

```typescript
const isActive =
  key === "full"
    ? stages.includes("full")
    : key === "people_finder"
      ? stages.includes("people_finder")
      : stages.includes(key) && !stages.includes("full");
```

- [ ] **Step 4: Add People Finder config UI**

After the stage selector buttons (after the closing `</div>` of the stage flex wrapper, around line 1470), add the People Finder config panel that shows when people_finder is in stages:

```tsx
{/* People Finder Config */}
{stages.includes("people_finder") && (
  <div className="mt-4 p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
    <div className="flex items-center gap-2 mb-3">
      <Users className="h-4 w-4 text-[var(--accent-orange)]" />
      <span className="text-sm font-medium text-white">People Finder Settings</span>
    </div>

    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* Contacts per company */}
      <div>
        <label className="text-xs text-[var(--text-muted)] mb-1 block">
          Contacts per company
        </label>
        <input
          type="number"
          min={1}
          max={25}
          value={pfPerCompany}
          onChange={(e) => setPfPerCompany(Math.min(25, Math.max(1, Number(e.target.value))))}
          className={cn(
            "w-full rounded-lg font-[family-name:var(--font-body)]",
            "bg-[var(--glass-bg)] border border-[var(--glass-border)]",
            "backdrop-blur-xl text-white",
            "px-3 py-2 text-sm transition-all duration-200",
            "focus:outline-none focus:ring-2 focus:ring-[var(--accent-orange)]/40 focus:border-[var(--accent-orange)]/50",
            "hover:bg-[var(--glass-bg-hover)] hover:border-[var(--glass-border-hover)]"
          )}
        />
      </div>

      {/* Seniority filter */}
      <div>
        <label className="text-xs text-[var(--text-muted)] mb-1 block">
          Seniority levels
        </label>
        <div className="flex flex-wrap gap-1.5">
          {SENIORITY_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() =>
                setPfSeniorities((prev) =>
                  prev.includes(value) ? prev.filter((s) => s !== value) : [...prev, value]
                )
              }
              className={cn(
                "px-2 py-1 rounded-md text-[10px] font-medium border transition-all duration-150",
                pfSeniorities.includes(value)
                  ? "bg-[var(--accent-orange)]/15 text-[var(--accent-orange)] border-[var(--accent-orange)]/20"
                  : "bg-[var(--glass-bg)] text-[var(--text-muted)] border-[var(--glass-border)] hover:text-white"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Department filter */}
      <div>
        <label className="text-xs text-[var(--text-muted)] mb-1 block">
          Departments <span className="text-[var(--text-muted)]">(empty = all)</span>
        </label>
        <div className="flex flex-wrap gap-1.5">
          {DEPARTMENT_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() =>
                setPfDepartments((prev) =>
                  prev.includes(value) ? prev.filter((d) => d !== value) : [...prev, value]
                )
              }
              className={cn(
                "px-2 py-1 rounded-md text-[10px] font-medium border transition-all duration-150",
                pfDepartments.includes(value)
                  ? "bg-[var(--accent-indigo)]/15 text-[var(--accent-indigo)] border-[var(--accent-indigo)]/20"
                  : "bg-[var(--glass-bg)] text-[var(--text-muted)] border-[var(--glass-border)] hover:text-white"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 5: Update handleRun to send peopleFinderConfig**

In the `handleRun` function of `OrganizationEnrichmentTab` (around line 1366), update the body construction to include people finder config:

```typescript
const body: Record<string, unknown> = {
  stages,
};

// Add people finder config if enabled
if (stages.includes("people_finder")) {
  body.peopleFinderConfig = {
    perCompany: pfPerCompany,
    seniorities: pfSeniorities,
    departments: pfDepartments,
  };
}
```

- [ ] **Step 6: Update the results display to show people finder stats**

In the results summary section (around line 1624), add people finder stats after signals. Inside the grid that shows "Orgs Processed", "Orgs Enriched", "Signals Created", "Avg ICP Score", add conditional people finder stats:

After the grid (after the closing `</div>` of the 4-column grid), add:

```tsx
{/* People Finder Stats */}
{(lastResult.people_found ?? 0) > 0 && (
  <div className="grid grid-cols-3 gap-4 mt-3 pt-3 border-t border-white/[0.06]">
    <div>
      <div className="text-xs text-[var(--text-muted)]">People Found</div>
      <div className="text-lg font-semibold text-white">
        {lastResult.people_found}
      </div>
    </div>
    <div>
      <div className="text-xs text-[var(--text-muted)]">New Persons Created</div>
      <div className="text-lg font-semibold text-[var(--accent-orange)]">
        {lastResult.people_created}
      </div>
    </div>
    <div>
      <div className="text-xs text-[var(--text-muted)]">Merged with Existing</div>
      <div className="text-lg font-semibold text-[var(--accent-indigo)]">
        {lastResult.people_merged}
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 7: Verify the full app compiles**

Run: `npx next build 2>&1 | tail -30`
Expected: Build succeeds (or only pre-existing warnings)

---

### Task 5: Export New Types for Consumers

**Files:**
- Modify: `lib/enrichment/pipeline.ts` (already modified in Task 2)

Ensure `PeopleFinderConfig`, `DEFAULT_PEOPLE_FINDER_CONFIG`, and `runPeopleFinderEnrichment` are all exported so they're available to the API route and any future consumers.

- [ ] **Step 1: Verify exports**

The imports in Task 2 Step 1 already re-export the types from `apollo-people.ts`. Verify that `pipeline.ts` exports:

```typescript
export { PeopleFinderConfig, DEFAULT_PEOPLE_FINDER_CONFIG } from "./apollo-people";
```

Add this line after the existing imports if not already present.

- [ ] **Step 2: Final build verification**

Run: `npx next build 2>&1 | tail -30`
Expected: Build succeeds

---

## Implementation Notes

### Apollo People Search API Details
- **Endpoint:** `POST https://api.apollo.io/v1/mixed_people/search`
- **Auth:** `X-Api-Key` header (same as org enrich)
- **Key params:** `organization_domains`, `organization_names`, `person_seniorities`, `person_departments`, `per_page`, `page`
- **Rate limit:** 500ms between calls (same as org enrich)

### Deduplication Strategy
The dedup approach is intentionally conservative:
1. **Hard dedup (automatic):** Match by `apollo_id`, `email` (case-insensitive), or `linkedin_url` (case-insensitive). These are strong identifiers — if they match, it's the same person.
2. **Soft dedup (manual review):** After inserting a new person, call `find_person_correlations` which uses pg_trgm fuzzy name matching (threshold 0.6). These surface in `/admin/correlations` for manual merge/dismiss.
3. **Merge behavior:** Existing person state is preserved (COALESCE — only fill nulls). New contact handles from enrichment are added without overwriting.

### Source Tracking
- `persons.source = 'org_enrichment'` on newly created persons
- `person_organization.source = 'org_enrichment'` on the link to the enriched org
- This lets users filter/identify persons that came from org enrichment vs. CSV import, event scraping, etc.
