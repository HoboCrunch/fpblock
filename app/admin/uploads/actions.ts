"use server";

import { createClient as createServiceRoleClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { partitionEventNames, normalizeEventName } from "@/lib/uploads/event-detect";
import type { ParticipationRole, SponsorTier } from "@/lib/types/database";

// ---------------------------------------------------------------------------
// Types (re-exported so page.tsx and import-runner can share them)
// ---------------------------------------------------------------------------

export type DuplicateHandling = "skip" | "update" | "create_new";

export interface PersonImportRow {
  full_name?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  linkedin?: string;
  twitter?: string;
  telegram?: string;
  phone?: string;
  title?: string;
  seniority?: string;
  department?: string;
  photo_url?: string;
  organization_name?: string;
  event?: string;
  context?: string;
}

export interface OrganizationImportRow {
  name?: string;
  website?: string;
  category?: string;
  linkedin_url?: string;
  icp_score?: string;
  icp_reason?: string;
  industry?: string;
  employee_count?: string;
  annual_revenue?: string;
  founded_year?: string;
  hq_location?: string;
  funding_total?: string;
  latest_funding_stage?: string;
  logo_url?: string;
  event?: string;
}

export interface ImportResult {
  success: boolean;
  uploadId?: string;
  personsCreated: number;
  organizationsCreated: number;
  skipped: number;
  errors: string[];
}

export interface EventDecision {
  name: string; // original (un-normalized) name as seen in the row
  mode: "create" | "map" | "skip";
  eventId?: string; // for "map"
  date_start?: string; // for "create"
}

// ---------------------------------------------------------------------------
// Service-role client factory (mirrors enrich/cron routes)
// ---------------------------------------------------------------------------

function serviceClient() {
  return createServiceRoleClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false } },
  );
}

// ---------------------------------------------------------------------------
// Event-resolution helpers (unchanged)
// ---------------------------------------------------------------------------

export async function listUnknownEvents(names: string[]): Promise<{
  known: Record<string, string>;
  unknown: string[];
}> {
  const supabase = await createClient();
  const trimmed = [
    ...new Set(names.map((n) => n.trim()).filter((n) => n.length > 0)),
  ];
  if (trimmed.length === 0) return { known: {}, unknown: [] };

  const { data: events } = await supabase.from("events").select("id, name");

  const byNormalized = new Map<string, string>();
  for (const e of events ?? []) {
    byNormalized.set(normalizeEventName((e as { name: string }).name), (e as { id: string }).id);
  }

  return partitionEventNames(trimmed, byNormalized);
}

export async function findOrCreateEvents(
  decisions: EventDecision[],
): Promise<Record<string, string | null>> {
  const supabase = await createClient();
  const out: Record<string, string | null> = {};

  for (const d of decisions) {
    if (d.mode === "skip") {
      out[d.name] = null;
      continue;
    }
    if (d.mode === "map") {
      out[d.name] = d.eventId ?? null;
      continue;
    }
    // create
    const { data, error } = await supabase
      .from("events")
      .insert({ name: d.name, date_start: d.date_start || null })
      .select("id")
      .single();
    if (error || !data) {
      throw new Error(`Failed to create event "${d.name}": ${error?.message ?? "unknown"}`);
    }
    out[d.name] = (data as { id: string }).id;
  }
  return out;
}

// ---------------------------------------------------------------------------
// createImportJob — new async entry-point called from page.tsx
// ---------------------------------------------------------------------------

export interface CreateImportJobResult {
  jobId: string;
  path: string;
  token: string;
  signedUrl: string;
}

export async function createImportJob(params: {
  mode: "persons" | "organizations";
  filename: string;
  rowCount: number;
  config: {
    duplicateHandling: DuplicateHandling;
    eventMap: Record<string, string | null>;
    forcedEvent?: { id: string; role: ParticipationRole; sponsorTier?: SponsorTier | null } | null;
  };
}): Promise<CreateImportJobResult> {
  const { mode, filename, rowCount, config } = params;
  const supabase = serviceClient();

  // 1. Insert uploads row (status = 'processing') to get uploads_row_id
  const { data: uploadRow, error: uploadError } = await supabase
    .from("uploads")
    .insert({ filename, row_count: rowCount, status: "processing" })
    .select("id")
    .single();
  if (uploadError || !uploadRow) {
    throw new Error(`Failed to create upload record: ${uploadError?.message ?? "unknown"}`);
  }
  const uploadsRowId = (uploadRow as { id: string }).id;

  // 2. Insert job_log row — we need the id first, then can patch storage_path
  const { data: jobRow, error: jobError } = await supabase
    .from("job_log")
    .insert({
      job_type: "csv_import",
      target_table: mode === "persons" ? "persons" : "organizations",
      status: "pending",
      label: `Import ${filename}`,
      progress_total: rowCount,
      phase: "Queued",
      metadata: {
        mode,
        duplicateHandling: config.duplicateHandling,
        eventMap: config.eventMap,
        forcedEvent: config.forcedEvent ?? null,
        filename,
        // storage_path patched below with the real jobId
        storage_path: "",
        processed_offset: 0,
        recent_errors: [],
        uploads_row_id: uploadsRowId,
      },
    })
    .select("id")
    .single();

  if (jobError || !jobRow) {
    throw new Error(`Failed to create job record: ${jobError?.message ?? "unknown"}`);
  }
  const jobId = (jobRow as { id: string }).id;
  const storagePath = `${jobId}.json`;

  // 3. Patch storage_path now that we have the jobId
  await supabase
    .from("job_log")
    .update({
      metadata: {
        mode,
        duplicateHandling: config.duplicateHandling,
        eventMap: config.eventMap,
        forcedEvent: config.forcedEvent ?? null,
        filename,
        storage_path: storagePath,
        processed_offset: 0,
        recent_errors: [],
        uploads_row_id: uploadsRowId,
      },
    })
    .eq("id", jobId);

  // 4. Create a signed upload URL for the client to PUT the JSON payload
  const { data: signedData, error: signedError } = await supabase.storage
    .from("csv-imports")
    .createSignedUploadUrl(storagePath);

  if (signedError || !signedData) {
    throw new Error(`Failed to create signed upload URL: ${signedError?.message ?? "unknown"}`);
  }

  return {
    jobId,
    path: signedData.path,
    token: signedData.token,
    signedUrl: signedData.signedUrl,
  };
}
