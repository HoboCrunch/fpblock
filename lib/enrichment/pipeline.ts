/**
 * Enrichment Pipeline Orchestrator
 *
 * Chains the three enrichment stages (Apollo, Perplexity, Gemini) and writes
 * results to Supabase. Supports individual stage runs, full pipeline runs,
 * and batch processing with concurrency control.
 */

import { SupabaseClient } from "@supabase/supabase-js";
import { enrichFromApollo, ApolloOrgResult } from "./apollo";
import { enrichFromPerplexity, PerplexityOrgResult } from "./perplexity";
import { synthesizeWithGemini, GeminiSynthesisResult } from "./gemini";
import type { Organization } from "@/lib/types/database";

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface EnrichmentResult {
  orgId: string;
  orgName: string;
  success: boolean;
  error?: string;
  apollo?: ApolloOrgResult | null;
  perplexity?: PerplexityOrgResult | null;
  gemini?: GeminiSynthesisResult | null;
  signalsCreated: number;
}

export interface BatchEnrichmentResult {
  total: number;
  succeeded: number;
  failed: number;
  results: EnrichmentResult[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function fetchOrg(
  supabase: SupabaseClient,
  orgId: string
): Promise<Organization | null> {
  const { data, error } = await supabase
    .from("organizations")
    .select("*")
    .eq("id", orgId)
    .single();

  if (error || !data) {
    console.error(`[pipeline] Failed to fetch org ${orgId}:`, error?.message);
    return null;
  }
  return data as Organization;
}

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
    console.error("[pipeline] Failed to create job_log:", error.message);
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
 * Fetch cached enrichment data from job_log for a given org and stage.
 */
async function getCachedJobData<T>(
  supabase: SupabaseClient,
  orgId: string,
  jobType: string
): Promise<T | null> {
  const { data } = await supabase
    .from("job_log")
    .select("metadata")
    .eq("target_id", orgId)
    .eq("job_type", jobType)
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  return (data?.metadata?.result as T) ?? null;
}

/**
 * Insert signals into organization_signals, deduplicating by description similarity.
 */
async function insertSignals(
  supabase: SupabaseClient,
  orgId: string,
  signals: GeminiSynthesisResult["signals"]
): Promise<number> {
  if (!signals || signals.length === 0) return 0;

  // Fetch existing signals for dedup
  const { data: existing } = await supabase
    .from("organization_signals")
    .select("description")
    .eq("organization_id", orgId);

  const existingDescriptions = new Set(
    (existing ?? []).map((s: { description: string }) =>
      s.description.toLowerCase().trim()
    )
  );

  const newSignals = signals.filter(
    (s) => !existingDescriptions.has(s.description.toLowerCase().trim())
  );

  if (newSignals.length === 0) return 0;

  const rows = newSignals.map((s) => ({
    organization_id: orgId,
    signal_type: s.signal_type,
    description: s.description,
    date: s.date || null,
    source: "enrichment",
  }));

  const { error } = await supabase
    .from("organization_signals")
    .insert(rows);

  if (error) {
    console.error("[pipeline] Failed to insert signals:", error.message);
    return 0;
  }

  return rows.length;
}

// ---------------------------------------------------------------------------
// Individual stage runners
// ---------------------------------------------------------------------------

/**
 * Run just Apollo enrichment for an org, save results to DB.
 */
export async function runApolloEnrichment(
  supabase: SupabaseClient,
  orgId: string
): Promise<{ success: boolean; data?: ApolloOrgResult }> {
  const org = await fetchOrg(supabase, orgId);
  if (!org) return { success: false };

  const jobId = await logJob(supabase, {
    job_type: "enrichment_apollo",
    target_table: "organizations",
    target_id: orgId,
    status: "processing",
    metadata: { org_name: org.name },
  });

  try {
    const result = await enrichFromApollo(org.name, org.website);

    // Update org fields that are currently missing
    const updates: Record<string, unknown> = {};
    if (result.description && !org.description)
      updates.description = result.description;
    if (result.website && !org.website) updates.website = result.website;
    if (result.linkedin_url && !org.linkedin_url)
      updates.linkedin_url = result.linkedin_url;

    if (Object.keys(updates).length > 0) {
      await supabase
        .from("organizations")
        .update(updates)
        .eq("id", orgId);
    }

    if (jobId) {
      await updateJob(supabase, jobId, {
        status: "completed",
        metadata: { org_name: org.name, result, fields_updated: Object.keys(updates) },
      });
    }

    return { success: true, data: result };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[pipeline] Apollo enrichment failed for ${org.name}:`, message);
    if (jobId) {
      await updateJob(supabase, jobId, { status: "failed", error: message });
    }
    return { success: false };
  }
}

/**
 * Run just Perplexity research for an org, save results to DB.
 */
export async function runPerplexityEnrichment(
  supabase: SupabaseClient,
  orgId: string
): Promise<{ success: boolean; data?: PerplexityOrgResult }> {
  const org = await fetchOrg(supabase, orgId);
  if (!org) return { success: false };

  const jobId = await logJob(supabase, {
    job_type: "enrichment_perplexity",
    target_table: "organizations",
    target_id: orgId,
    status: "processing",
    metadata: { org_name: org.name },
  });

  try {
    const result = await enrichFromPerplexity(
      org.name,
      org.website,
      org.context
    );

    // Don't update org fields directly -- that's Gemini's job.
    // Store the raw research in job_log metadata for later use.
    if (jobId) {
      await updateJob(supabase, jobId, {
        status: "completed",
        metadata: { org_name: org.name, result },
      });
    }

    return { success: true, data: result };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[pipeline] Perplexity enrichment failed for ${org.name}:`, message);
    if (jobId) {
      await updateJob(supabase, jobId, { status: "failed", error: message });
    }
    return { success: false };
  }
}

/**
 * Run just Gemini synthesis for an org.
 * Requires Apollo + Perplexity data already cached (or passed directly).
 */
export async function runGeminiSynthesis(
  supabase: SupabaseClient,
  orgId: string,
  apolloData?: ApolloOrgResult | null,
  perplexityData?: PerplexityOrgResult | null
): Promise<{ success: boolean; data?: GeminiSynthesisResult }> {
  const org = await fetchOrg(supabase, orgId);
  if (!org) return { success: false };

  // If data not passed directly, try to load from cached job_log entries
  const apollo =
    apolloData ?? (await getCachedJobData<ApolloOrgResult>(supabase, orgId, "enrichment_apollo"));
  const perplexity =
    perplexityData ??
    (await getCachedJobData<PerplexityOrgResult>(supabase, orgId, "enrichment_perplexity"));

  const jobId = await logJob(supabase, {
    job_type: "enrichment_gemini",
    target_table: "organizations",
    target_id: orgId,
    status: "processing",
    metadata: {
      org_name: org.name,
      has_apollo: !!apollo,
      has_perplexity: !!perplexity,
    },
  });

  try {
    const result = await synthesizeWithGemini(org.name, apollo, perplexity, {
      description: org.description,
      context: org.context,
      usp: org.usp,
      icp_score: org.icp_score,
    });

    // Update org fields: only update if currently null OR if Gemini produced a better result
    const updates: Record<string, unknown> = {};
    if (result.description && !org.description)
      updates.description = result.description;
    if (result.context) updates.context = result.context; // always update context
    if (result.usp && !org.usp) updates.usp = result.usp;
    if (result.icp_score != null) updates.icp_score = result.icp_score;
    if (result.icp_reason) updates.icp_reason = result.icp_reason;
    if (result.category && !org.category) updates.category = result.category;

    if (Object.keys(updates).length > 0) {
      await supabase
        .from("organizations")
        .update(updates)
        .eq("id", orgId);
    }

    // Insert signals
    const signalsCreated = await insertSignals(supabase, orgId, result.signals);

    if (jobId) {
      await updateJob(supabase, jobId, {
        status: "completed",
        metadata: {
          org_name: org.name,
          result,
          fields_updated: Object.keys(updates),
          signals_created: signalsCreated,
        },
      });
    }

    return { success: true, data: result };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[pipeline] Gemini synthesis failed for ${org.name}:`, message);
    if (jobId) {
      await updateJob(supabase, jobId, { status: "failed", error: message });
    }
    return { success: false };
  }
}

// ---------------------------------------------------------------------------
// Full pipeline
// ---------------------------------------------------------------------------

/**
 * Run the full enrichment pipeline: Apollo + Perplexity (parallel) -> Gemini -> save all.
 */
export async function runFullEnrichment(
  supabase: SupabaseClient,
  orgId: string
): Promise<EnrichmentResult> {
  const org = await fetchOrg(supabase, orgId);
  if (!org) {
    return {
      orgId,
      orgName: "unknown",
      success: false,
      error: "Organization not found",
      signalsCreated: 0,
    };
  }

  const jobId = await logJob(supabase, {
    job_type: "enrichment_full",
    target_table: "organizations",
    target_id: orgId,
    status: "processing",
    metadata: { org_name: org.name },
  });

  try {
    // Step 1: Run Apollo + Perplexity in parallel
    const [apolloResult, perplexityResult] = await Promise.all([
      enrichFromApollo(org.name, org.website),
      enrichFromPerplexity(org.name, org.website, org.context),
    ]);

    // Log individual stage results
    await Promise.all([
      logJob(supabase, {
        job_type: "enrichment_apollo",
        target_table: "organizations",
        target_id: orgId,
        status: "completed",
        metadata: { org_name: org.name, result: apolloResult },
      }),
      logJob(supabase, {
        job_type: "enrichment_perplexity",
        target_table: "organizations",
        target_id: orgId,
        status: "completed",
        metadata: { org_name: org.name, result: perplexityResult },
      }),
    ]);

    // Update org with Apollo basics (website, linkedin if missing)
    const apolloUpdates: Record<string, unknown> = {};
    if (apolloResult.website && !org.website)
      apolloUpdates.website = apolloResult.website;
    if (apolloResult.linkedin_url && !org.linkedin_url)
      apolloUpdates.linkedin_url = apolloResult.linkedin_url;
    if (apolloResult.description && !org.description)
      apolloUpdates.description = apolloResult.description;

    if (Object.keys(apolloUpdates).length > 0) {
      await supabase
        .from("organizations")
        .update(apolloUpdates)
        .eq("id", orgId);
    }

    // Step 2: Run Gemini synthesis with both results
    const geminiResult = await synthesizeWithGemini(
      org.name,
      apolloResult,
      perplexityResult,
      {
        description: org.description ?? apolloUpdates.description as string | undefined,
        context: org.context,
        usp: org.usp,
        icp_score: org.icp_score,
      }
    );

    // Step 3: Update org fields from Gemini synthesis
    const geminiUpdates: Record<string, unknown> = {};
    if (geminiResult.description && !org.description)
      geminiUpdates.description = geminiResult.description;
    if (geminiResult.context) geminiUpdates.context = geminiResult.context;
    if (geminiResult.usp && !org.usp) geminiUpdates.usp = geminiResult.usp;
    if (geminiResult.icp_score != null)
      geminiUpdates.icp_score = geminiResult.icp_score;
    if (geminiResult.icp_reason)
      geminiUpdates.icp_reason = geminiResult.icp_reason;
    if (geminiResult.category && !org.category)
      geminiUpdates.category = geminiResult.category;

    if (Object.keys(geminiUpdates).length > 0) {
      await supabase
        .from("organizations")
        .update(geminiUpdates)
        .eq("id", orgId);
    }

    // Step 4: Insert signals
    const signalsCreated = await insertSignals(
      supabase,
      orgId,
      geminiResult.signals
    );

    // Step 5: Log completion
    if (jobId) {
      await updateJob(supabase, jobId, {
        status: "completed",
        metadata: {
          org_name: org.name,
          apollo_fields_updated: Object.keys(apolloUpdates),
          gemini_fields_updated: Object.keys(geminiUpdates),
          signals_created: signalsCreated,
          icp_score: geminiResult.icp_score,
        },
      });
    }

    return {
      orgId,
      orgName: org.name,
      success: true,
      apollo: apolloResult,
      perplexity: perplexityResult,
      gemini: geminiResult,
      signalsCreated,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[pipeline] Full enrichment failed for ${org.name}:`, message);
    if (jobId) {
      await updateJob(supabase, jobId, { status: "failed", error: message });
    }
    return {
      orgId,
      orgName: org.name,
      success: false,
      error: message,
      signalsCreated: 0,
    };
  }
}

// ---------------------------------------------------------------------------
// Batch runner
// ---------------------------------------------------------------------------

/**
 * Run enrichment for multiple orgs with progress callback and concurrency control.
 */
export async function runBatchEnrichment(
  supabase: SupabaseClient,
  orgIds: string[],
  options?: {
    stages?: ("apollo" | "perplexity" | "gemini" | "full")[];
    onProgress?: (completed: number, total: number, orgName: string) => void;
    concurrency?: number;
  }
): Promise<BatchEnrichmentResult> {
  const stages = options?.stages ?? ["full"];
  const concurrency = options?.concurrency ?? 1;
  const total = orgIds.length;
  const results: EnrichmentResult[] = [];
  let completed = 0;

  // Process in batches of `concurrency`
  for (let i = 0; i < orgIds.length; i += concurrency) {
    const batch = orgIds.slice(i, i + concurrency);

    const batchResults = await Promise.all(
      batch.map(async (orgId) => {
        let result: EnrichmentResult;

        if (stages.includes("full")) {
          result = await runFullEnrichment(supabase, orgId);
        } else {
          // Run individual stages sequentially
          let apolloData: ApolloOrgResult | null = null;
          let perplexityData: PerplexityOrgResult | null = null;
          let geminiData: GeminiSynthesisResult | null = null;
          let signalsCreated = 0;
          let lastError: string | undefined;

          const org = await fetchOrg(supabase, orgId);
          const orgName = org?.name ?? "unknown";

          if (stages.includes("apollo")) {
            const res = await runApolloEnrichment(supabase, orgId);
            if (res.success) apolloData = res.data ?? null;
            else lastError = "Apollo enrichment failed";
          }

          if (stages.includes("perplexity")) {
            const res = await runPerplexityEnrichment(supabase, orgId);
            if (res.success) perplexityData = res.data ?? null;
            else lastError = "Perplexity enrichment failed";
          }

          if (stages.includes("gemini")) {
            const res = await runGeminiSynthesis(
              supabase,
              orgId,
              apolloData,
              perplexityData
            );
            if (res.success) {
              geminiData = res.data ?? null;
              signalsCreated = geminiData?.signals?.length ?? 0;
            } else {
              lastError = "Gemini synthesis failed";
            }
          }

          result = {
            orgId,
            orgName,
            success: !lastError,
            error: lastError,
            apollo: apolloData,
            perplexity: perplexityData,
            gemini: geminiData,
            signalsCreated,
          };
        }

        completed++;
        options?.onProgress?.(completed, total, result.orgName);

        return result;
      })
    );

    results.push(...batchResults);
  }

  return {
    total,
    succeeded: results.filter((r) => r.success).length,
    failed: results.filter((r) => !r.success).length,
    results,
  };
}
