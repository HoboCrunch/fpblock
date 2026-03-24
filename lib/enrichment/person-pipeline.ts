/**
 * Person Enrichment Pipeline
 *
 * Enriches individual persons via Apollo People Match, filling in missing
 * contact details (email, LinkedIn, Twitter, phone) and performing reverse
 * org linkage when the person has no known organization.
 */

import { SupabaseClient } from "@supabase/supabase-js";
import type { ApolloPersonResult } from "./apollo-people";
import { extractDomain } from "./apollo-people";
import { fetchWithRetry } from "./fetch-with-retry";
import type { Person } from "@/lib/types/database";

const APOLLO_PEOPLE_MATCH_URL = "https://api.apollo.io/v1/people/match";

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface PersonEnrichmentResult {
  personId: string;
  personName: string;
  success: boolean;
  error?: string;
  fieldsUpdated: string[];
  orgLinked: boolean;
  orgCreated: boolean;
  orgId?: string;
}

export interface BatchPersonEnrichmentResult {
  total: number;
  succeeded: number;
  failed: number;
  results: PersonEnrichmentResult[];
  durationMs: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Map Apollo seniority to a role_type value.
 */
function mapSeniorityToRoleType(seniority: string | null | undefined): string {
  if (!seniority) return "employee";
  const s = seniority.toLowerCase();
  if (s === "owner" || s === "founder") return "founder";
  if (s === "c_suite" || s === "partner" || s === "vp" || s === "director") return "executive";
  return "employee";
}

/**
 * Convert a Twitter handle (or bare handle) to a full URL.
 */
function twitterHandleToUrl(handle: string | null): string | null {
  if (!handle) return null;
  if (handle.startsWith("http")) return handle;
  return `https://twitter.com/${handle.replace(/^@/, "")}`;
}

/**
 * Extract a Twitter handle from a URL. Returns null if input is null.
 */
function twitterUrlToHandle(url: string | null): string | null {
  if (!url) return null;
  try {
    const cleaned = url
      .replace(/^https?:\/\/(www\.)?(twitter\.com|x\.com)\//, "")
      .replace(/\/.*$/, "")
      .replace(/\?.*$/, "");
    return cleaned || null;
  } catch {
    return null;
  }
}

/**
 * Convert a DB Person to an ApolloPersonResult for input to match APIs.
 */
function dbPersonToApolloInput(person: Person): ApolloPersonResult {
  return {
    apollo_id: person.apollo_id ?? "",
    full_name: person.full_name,
    first_name: person.first_name,
    last_name: person.last_name,
    email: person.email,
    linkedin_url: person.linkedin_url,
    twitter_url: twitterHandleToUrl(person.twitter_handle),
    phone: person.phone,
    title: person.title,
    seniority: person.seniority,
    department: person.department,
    photo_url: person.photo_url,
  };
}

// ---------------------------------------------------------------------------
// Job log helpers (mirrors pipeline.ts)
// ---------------------------------------------------------------------------

async function logJob(
  supabase: SupabaseClient,
  opts: {
    job_type: string;
    target_table: string;
    target_id: string;
    status: string;
    error?: string | null;
    metadata?: Record<string, unknown> | null;
  }
): Promise<string | null> {
  const { data, error } = await supabase
    .from("job_log")
    .insert({
      job_type: opts.job_type,
      target_table: opts.target_table,
      target_id: opts.target_id,
      status: opts.status,
      error: opts.error ?? null,
      metadata: opts.metadata ?? null,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[person-pipeline] Failed to create job_log:", error.message);
    return null;
  }
  return data?.id ?? null;
}

async function updateJob(
  supabase: SupabaseClient,
  jobId: string,
  updates: { status: string; error?: string | null; metadata?: Record<string, unknown> | null }
) {
  await supabase
    .from("job_log")
    .update(updates)
    .eq("id", jobId);
}

/**
 * Mark any "processing" jobs older than the given threshold as failed.
 */
async function cleanupStaleJobs(supabase: SupabaseClient, staleCutoffMinutes: number = 15) {
  const cutoff = new Date(Date.now() - staleCutoffMinutes * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("job_log")
    .update({
      status: "failed",
      error: "Marked as failed: job was still processing after " + staleCutoffMinutes + " minutes (likely server timeout)",
    })
    .eq("status", "processing")
    .lt("created_at", cutoff)
    .select("id, job_type, target_id");

  if (data && data.length > 0) {
    console.log(`[person-pipeline] Cleaned up ${data.length} stale processing jobs`);
  }
  if (error) {
    console.error("[person-pipeline] Failed to cleanup stale jobs:", error.message);
  }
}

// ---------------------------------------------------------------------------
// Main: single person enrichment
// ---------------------------------------------------------------------------

/**
 * Enrich a single person via Apollo People Match. Fills in missing contact
 * details and performs reverse org linkage if the person has no organization.
 */
export async function runPersonEnrichment(
  supabase: SupabaseClient,
  personId: string
): Promise<PersonEnrichmentResult> {
  const failResult = (error: string): PersonEnrichmentResult => ({
    personId,
    personName: "unknown",
    success: false,
    error,
    fieldsUpdated: [],
    orgLinked: false,
    orgCreated: false,
  });

  try {
    // -----------------------------------------------------------------------
    // Step 1: Fetch person + org context
    // -----------------------------------------------------------------------
    const { data: person, error: personError } = await supabase
      .from("persons")
      .select("*")
      .eq("id", personId)
      .single();

    if (personError || !person) {
      console.error(`[person-pipeline] Person ${personId} not found:`, personError?.message);
      return failResult("Person not found");
    }

    const typedPerson = person as Person;
    const personName = typedPerson.full_name;

    console.log(`[person-pipeline] Starting enrichment for "${personName}" (${personId})`);

    // Mark as in_progress
    await supabase
      .from("persons")
      .update({ enrichment_status: "in_progress" })
      .eq("id", personId);

    // Fetch primary org context
    let orgName: string | null = null;
    let orgWebsite: string | null = null;

    const { data: personOrgs } = await supabase
      .from("person_organization")
      .select("organization_id")
      .eq("person_id", personId)
      .order("is_primary", { ascending: false })
      .limit(1);

    if (personOrgs && personOrgs.length > 0) {
      const { data: org } = await supabase
        .from("organizations")
        .select("name, website")
        .eq("id", personOrgs[0].organization_id)
        .single();

      if (org) {
        orgName = org.name;
        orgWebsite = org.website;
      }
    }

    const domain = orgWebsite ? extractDomain(orgWebsite) : null;

    // -----------------------------------------------------------------------
    // Step 2: Check identifiers
    // -----------------------------------------------------------------------
    if (!typedPerson.linkedin_url && !typedPerson.apollo_id && !orgName) {
      console.log(`[person-pipeline] "${personName}": insufficient identifiers for match`);

      await supabase
        .from("persons")
        .update({ enrichment_status: "failed" })
        .eq("id", personId);

      await logJob(supabase, {
        job_type: "enrichment_person_match",
        target_table: "persons",
        target_id: personId,
        status: "failed",
        error: "Insufficient identifiers for match",
        metadata: { person_name: personName },
      });

      return {
        personId,
        personName,
        success: false,
        error: "Insufficient identifiers for match",
        fieldsUpdated: [],
        orgLinked: false,
        orgCreated: false,
      };
    }

    // -----------------------------------------------------------------------
    // Step 3: Apollo People Match (direct call for raw response access)
    // -----------------------------------------------------------------------
    const apiKey = process.env.APOLLO_API_KEY;
    if (!apiKey) {
      await supabase
        .from("persons")
        .update({ enrichment_status: "failed" })
        .eq("id", personId);

      return {
        personId,
        personName,
        success: false,
        error: "APOLLO_API_KEY not configured",
        fieldsUpdated: [],
        orgLinked: false,
        orgCreated: false,
      };
    }

    const apolloInput = dbPersonToApolloInput(typedPerson);

    // Build match request body
    const body: Record<string, unknown> = {};
    if (apolloInput.first_name) body.first_name = apolloInput.first_name;
    if (apolloInput.last_name) body.last_name = apolloInput.last_name;
    if (!apolloInput.first_name && !apolloInput.last_name && apolloInput.full_name) {
      const parts = apolloInput.full_name.split(" ");
      body.first_name = parts[0];
      body.last_name = parts.slice(1).join(" ");
    }
    if (orgName) body.organization_name = orgName;
    if (domain) body.domain = domain;
    if (apolloInput.linkedin_url) body.linkedin_url = apolloInput.linkedin_url;
    if (apolloInput.apollo_id) body.id = apolloInput.apollo_id;

    let match: Record<string, unknown> | null = null;

    try {
      const res = await fetchWithRetry(
        APOLLO_PEOPLE_MATCH_URL,
        {
          method: "POST",
          headers: {
            "X-Api-Key": apiKey,
            "Content-Type": "application/json",
            "Cache-Control": "no-cache",
          },
          body: JSON.stringify(body),
        },
        {
          timeoutMs: 20_000,
          maxRetries: 2,
          context: `person-match:${personName}`,
        },
      );

      if (res.ok) {
        const data = await res.json();
        match = (data.person as Record<string, unknown>) ?? null;
      } else {
        const text = await res.text().catch(() => "");
        console.error(
          `[person-pipeline] Apollo match failed for "${personName}": ${res.status} ${res.statusText}`,
          text.slice(0, 200)
        );
      }
    } catch (err) {
      console.error(
        `[person-pipeline] Apollo match network error for "${personName}":`,
        err instanceof Error ? err.message : String(err)
      );
    } finally {
      await sleep(500);
    }

    if (!match) {
      console.log(`[person-pipeline] "${personName}": no Apollo match found`);

      await supabase
        .from("persons")
        .update({
          enrichment_status: "complete",
          last_enriched_at: new Date().toISOString(),
        })
        .eq("id", personId);

      await logJob(supabase, {
        job_type: "enrichment_person_match",
        target_table: "persons",
        target_id: personId,
        status: "completed",
        metadata: {
          person_name: personName,
          fields_updated: [],
          org_linked: false,
          org_created: false,
          note: "No Apollo match found",
        },
      });

      return {
        personId,
        personName,
        success: true,
        fieldsUpdated: [],
        orgLinked: false,
        orgCreated: false,
      };
    }

    // -----------------------------------------------------------------------
    // Step 4: COALESCE update — only fill null fields
    // -----------------------------------------------------------------------
    const fieldsUpdated: string[] = [];
    const updateObj: Record<string, unknown> = {};

    // email
    if (!typedPerson.email && typeof match.email === "string") {
      updateObj.email = match.email;
      fieldsUpdated.push("email");
    }

    // linkedin_url
    if (!typedPerson.linkedin_url && typeof match.linkedin_url === "string") {
      updateObj.linkedin_url = match.linkedin_url;
      fieldsUpdated.push("linkedin_url");
    }

    // twitter_handle (mapped from twitter_url)
    if (!typedPerson.twitter_handle && typeof match.twitter_url === "string") {
      const handle = twitterUrlToHandle(match.twitter_url as string);
      if (handle) {
        updateObj.twitter_handle = handle;
        fieldsUpdated.push("twitter_handle");
      }
    }

    // phone
    if (!typedPerson.phone) {
      let phone: string | null = null;
      if (
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
      if (phone) {
        updateObj.phone = phone;
        fieldsUpdated.push("phone");
      }
    }

    // title
    if (!typedPerson.title && typeof match.title === "string") {
      updateObj.title = match.title;
      fieldsUpdated.push("title");
    }

    // seniority
    if (!typedPerson.seniority && typeof match.seniority === "string") {
      updateObj.seniority = match.seniority;
      fieldsUpdated.push("seniority");
    }

    // department
    if (!typedPerson.department) {
      let department: string | null = null;
      if (Array.isArray(match.departments) && match.departments.length > 0) {
        department = typeof match.departments[0] === "string" ? match.departments[0] : null;
      } else if (typeof match.department === "string") {
        department = match.department;
      }
      if (department) {
        updateObj.department = department;
        fieldsUpdated.push("department");
      }
    }

    // photo_url
    if (!typedPerson.photo_url && typeof match.photo_url === "string") {
      updateObj.photo_url = match.photo_url;
      fieldsUpdated.push("photo_url");
    }

    // apollo_id
    if (!typedPerson.apollo_id && typeof match.id === "string") {
      updateObj.apollo_id = match.id;
      fieldsUpdated.push("apollo_id");
    }

    // Apply updates if any
    if (Object.keys(updateObj).length > 0) {
      await supabase
        .from("persons")
        .update(updateObj)
        .eq("id", personId);

      console.log(
        `[person-pipeline] "${personName}": updated fields: ${fieldsUpdated.join(", ")}`
      );
    }

    // -----------------------------------------------------------------------
    // Step 5: Reverse org linkage
    // -----------------------------------------------------------------------
    let orgLinked = false;
    let orgCreated = false;
    let linkedOrgId: string | undefined;

    // Only attempt if person has zero org links
    const { data: existingOrgs } = await supabase
      .from("person_organization")
      .select("id")
      .eq("person_id", personId)
      .limit(1);

    const hasNoOrg = !existingOrgs || existingOrgs.length === 0;

    if (hasNoOrg && match.organization) {
      const matchOrg = match.organization as Record<string, unknown>;
      const matchOrgName = typeof matchOrg.name === "string" ? matchOrg.name : null;
      const matchOrgDomain = typeof matchOrg.primary_domain === "string" ? matchOrg.primary_domain : null;

      if (matchOrgName) {
        console.log(
          `[person-pipeline] "${personName}": attempting reverse org linkage to "${matchOrgName}"`
        );

        let foundOrgId: string | null = null;

        // Search by domain first (use ilike on website to push filtering to DB)
        if (matchOrgDomain) {
          const { data: domainOrgs } = await supabase
            .from("organizations")
            .select("id")
            .or(`website.ilike.%${matchOrgDomain}%,website.ilike.%${matchOrgDomain}/%`)
            .limit(1);

          if (domainOrgs && domainOrgs.length > 0) {
            foundOrgId = domainOrgs[0].id;
          }
        }

        // Fallback: search by name (case-insensitive)
        if (!foundOrgId) {
          const { data: nameOrgs } = await supabase
            .from("organizations")
            .select("id")
            .ilike("name", matchOrgName)
            .limit(1);

          if (nameOrgs && nameOrgs.length > 0) {
            foundOrgId = nameOrgs[0].id;
          }
        }

        // If not found, create a stub org
        if (!foundOrgId) {
          const website = matchOrgDomain ? `https://${matchOrgDomain}` : null;
          const { data: newOrg, error: orgInsertError } = await supabase
            .from("organizations")
            .insert({
              name: matchOrgName,
              website,
              enrichment_status: "none",
            })
            .select("id")
            .single();

          if (orgInsertError || !newOrg) {
            console.error(
              `[person-pipeline] Failed to create stub org "${matchOrgName}":`,
              orgInsertError?.message
            );
          } else {
            foundOrgId = newOrg.id;
            orgCreated = true;
            console.log(
              `[person-pipeline] Created stub org "${matchOrgName}" (${foundOrgId})`
            );
          }
        }

        // Create person_organization link
        if (foundOrgId) {
          const personTitle = updateObj.title
            ? (updateObj.title as string)
            : typedPerson.title;
          const personSeniority = updateObj.seniority
            ? (updateObj.seniority as string)
            : typedPerson.seniority;

          const { error: linkError } = await supabase
            .from("person_organization")
            .insert({
              person_id: personId,
              organization_id: foundOrgId,
              source: "direct_enrichment",
              role: personTitle ?? null,
              role_type: mapSeniorityToRoleType(personSeniority),
              is_primary: true,
              is_current: true,
            });

          if (linkError) {
            console.error(
              `[person-pipeline] Failed to link "${personName}" to org ${foundOrgId}:`,
              linkError.message
            );
          } else {
            orgLinked = true;
            linkedOrgId = foundOrgId;
            console.log(
              `[person-pipeline] "${personName}": linked to org ${foundOrgId}`
            );
          }
        }
      }
    }

    // -----------------------------------------------------------------------
    // Step 6: Update person status
    // -----------------------------------------------------------------------
    await supabase
      .from("persons")
      .update({
        enrichment_status: "complete",
        last_enriched_at: new Date().toISOString(),
      })
      .eq("id", personId);

    // -----------------------------------------------------------------------
    // Step 7: Job logging
    // -----------------------------------------------------------------------
    await logJob(supabase, {
      job_type: "enrichment_person_match",
      target_table: "persons",
      target_id: personId,
      status: "completed",
      metadata: {
        person_name: personName,
        fields_updated: fieldsUpdated,
        org_linked: orgLinked,
        org_created: orgCreated,
        org_id: linkedOrgId ?? null,
      },
    });

    console.log(
      `[person-pipeline] "${personName}": enrichment complete — ${fieldsUpdated.length} fields updated, org_linked=${orgLinked}`
    );

    return {
      personId,
      personName,
      success: true,
      fieldsUpdated,
      orgLinked,
      orgCreated,
      orgId: linkedOrgId,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[person-pipeline] Unhandled error enriching person ${personId}:`, message);

    // Best-effort: mark as failed
    try {
      await supabase
        .from("persons")
        .update({ enrichment_status: "failed" })
        .eq("id", personId);

      await logJob(supabase, {
        job_type: "enrichment_person_match",
        target_table: "persons",
        target_id: personId,
        status: "failed",
        error: message,
        metadata: { person_id: personId },
      });
    } catch { /* ignore cleanup errors */ }

    return {
      personId,
      personName: "unknown",
      success: false,
      error: message,
      fieldsUpdated: [],
      orgLinked: false,
      orgCreated: false,
    };
  }
}

// ---------------------------------------------------------------------------
// Batch runner
// ---------------------------------------------------------------------------

/**
 * Run enrichment for multiple persons with progress callback.
 * Processes sequentially (concurrency 1) to respect API rate limits.
 */
export async function runBatchPersonEnrichment(
  supabase: SupabaseClient,
  personIds: string[],
  options?: {
    onProgress?: (completed: number, total: number, personName: string) => void;
  }
): Promise<BatchPersonEnrichmentResult> {
  const total = personIds.length;
  const results: PersonEnrichmentResult[] = [];
  let completed = 0;
  const batchStartTime = Date.now();

  // Validate API key upfront
  if (!process.env.APOLLO_API_KEY) {
    console.error("[person-pipeline] APOLLO_API_KEY not configured — aborting batch");
    return {
      total,
      succeeded: 0,
      failed: total,
      results: personIds.map((id) => ({
        personId: id,
        personName: "unknown",
        success: false,
        error: "APOLLO_API_KEY not configured",
        fieldsUpdated: [],
        orgLinked: false,
        orgCreated: false,
      })),
      durationMs: Date.now() - batchStartTime,
    };
  }

  // Clean up any orphaned processing jobs before starting
  await cleanupStaleJobs(supabase);

  // Process persons sequentially (parent job is created by the API route)
  for (const personId of personIds) {
    try {
      const result = await runPersonEnrichment(supabase, personId);
      results.push(result);

      completed++;
      options?.onProgress?.(completed, total, result.personName);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[person-pipeline] Unhandled batch error for person ${personId}:`, message);

      results.push({
        personId,
        personName: "unknown",
        success: false,
        error: message,
        fieldsUpdated: [],
        orgLinked: false,
        orgCreated: false,
      });

      completed++;
      options?.onProgress?.(completed, total, "unknown");
    }
  }

  const durationMs = Date.now() - batchStartTime;

  const succeeded = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  console.log(
    `[person-pipeline] Batch complete: ${succeeded}/${total} succeeded, ${failed} failed (${durationMs}ms)`
  );

  return {
    total,
    succeeded,
    failed,
    results,
    durationMs,
  };
}
