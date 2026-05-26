/**
 * lib/uploads/import-runner.ts
 *
 * Shared per-row import logic extracted from app/admin/uploads/actions.ts.
 * Provides processImportJob() which is called by the process route and the
 * cron resume sweep, both using a service-role Supabase client.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { DuplicateHandling, PersonImportRow, OrganizationImportRow } from "@/app/admin/uploads/actions";
import type { ParticipationRole, SponsorTier } from "@/lib/types/database";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AnySupabase = SupabaseClient;

export interface ImportConfig {
  mode: "persons" | "organizations";
  duplicateHandling: DuplicateHandling;
  /** original-name → event_id  (null means skip) */
  eventMap: Record<string, string | null>;
  /** new-event-list journey: force all rows to one event */
  forcedEvent?: { id: string; role: ParticipationRole; sponsorTier?: SponsorTier | null } | null;
}

// Shape stored in Storage (resolved rows + config)
interface ImportPayload {
  mode: "persons" | "organizations";
  rows: PersonImportRow[] | OrganizationImportRow[];
  config: ImportConfig;
}

// ---------------------------------------------------------------------------
// Uploads table helpers (mirrors the old insertUploadRow/finalizeUploadRow)
// ---------------------------------------------------------------------------

export async function insertUploadRow(
  supabase: AnySupabase,
  filename: string,
  rowCount: number,
): Promise<string> {
  const { data, error } = await supabase
    .from("uploads")
    .insert({ filename, row_count: rowCount, status: "processing" })
    .select("id")
    .single();
  if (error || !data) {
    throw new Error(`Failed to create upload record: ${error?.message ?? "unknown"}`);
  }
  return (data as { id: string }).id;
}

export async function finalizeUploadRow(
  supabase: AnySupabase,
  uploadId: string,
  personsCreated: number,
  organizationsCreated: number,
  errors: string[],
): Promise<void> {
  await supabase
    .from("uploads")
    .update({
      persons_created: personsCreated,
      organizations_created: organizationsCreated,
      status:
        errors.length > 0 && personsCreated + organizationsCreated === 0
          ? "failed"
          : "completed",
      errors: errors.length > 0 ? { messages: errors } : null,
    })
    .eq("id", uploadId);
}

// ---------------------------------------------------------------------------
// Participation helper
// ---------------------------------------------------------------------------

async function upsertParticipation(
  supabase: AnySupabase,
  fields: {
    event_id: string;
    person_id?: string;
    organization_id?: string;
    role: ParticipationRole | string;
    sponsor_tier?: SponsorTier | null;
  },
): Promise<void> {
  let query = supabase
    .from("event_participations")
    .select("id")
    .eq("event_id", fields.event_id)
    .eq("role", fields.role);

  if (fields.person_id) {
    query = query.eq("person_id", fields.person_id);
  }
  if (fields.organization_id) {
    query = query.eq("organization_id", fields.organization_id);
  }

  const { data: existing } = await query.maybeSingle();

  if (existing) {
    const update: Record<string, unknown> = {};
    if (fields.sponsor_tier !== undefined) {
      update.sponsor_tier = fields.sponsor_tier;
    }
    if (Object.keys(update).length > 0) {
      await supabase
        .from("event_participations")
        .update(update)
        .eq("id", (existing as { id: string }).id);
    }
    return;
  }

  const insertRow: Record<string, unknown> = {
    event_id: fields.event_id,
    role: fields.role,
  };
  if (fields.person_id) insertRow.person_id = fields.person_id;
  if (fields.organization_id) insertRow.organization_id = fields.organization_id;
  if (fields.sponsor_tier !== undefined) insertRow.sponsor_tier = fields.sponsor_tier;

  await supabase.from("event_participations").insert(insertRow);
}

// ---------------------------------------------------------------------------
// Single-row person import
// ---------------------------------------------------------------------------

interface PersonRowResult {
  personId: string | null;
  created: boolean;
  skipped: boolean;
}

export async function importPersonRow(
  supabase: AnySupabase,
  row: PersonImportRow,
  config: ImportConfig,
): Promise<PersonRowResult> {
  const email = row.email?.trim();
  const fullName =
    row.full_name?.trim() ||
    [row.first_name, row.last_name].filter(Boolean).join(" ").trim() ||
    null;

  if (!fullName && !email) {
    return { personId: null, created: false, skipped: true };
  }

  // Resolve org
  let organizationId: string | null = null;
  const orgName = row.organization_name?.trim();
  if (orgName) {
    const { data: existing } = await supabase
      .from("organizations")
      .select("id")
      .ilike("name", orgName)
      .maybeSingle();
    if (existing) {
      organizationId = (existing as { id: string }).id;
    } else {
      const { data: newOrg } = await supabase
        .from("organizations")
        .insert({ name: orgName })
        .select("id")
        .single();
      if (newOrg) organizationId = (newOrg as { id: string }).id;
    }
  }

  // Dedupe by email
  let existingPerson: { id: string } | null = null;
  if (email) {
    const { data } = await supabase
      .from("persons")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    existingPerson = data as { id: string } | null;
  }

  const personFields = {
    full_name: fullName ?? "Unknown",
    first_name: row.first_name?.trim() || null,
    last_name: row.last_name?.trim() || null,
    email: email || null,
    linkedin_url: row.linkedin?.trim() || null,
    twitter_handle: row.twitter?.trim() || null,
    telegram_handle: row.telegram?.trim() || null,
    phone: row.phone?.trim() || null,
    title: row.title?.trim() || null,
    seniority: row.seniority?.trim() || null,
    department: row.department?.trim() || null,
    photo_url: row.photo_url?.trim() || null,
    notes: row.context?.trim() || null,
  };

  let personId: string | null = null;
  let created = false;
  let skipped = false;

  if (existingPerson) {
    if (config.duplicateHandling === "skip") {
      skipped = true;
      personId = existingPerson.id;
    } else if (config.duplicateHandling === "update") {
      const update: Record<string, string | null> = {};
      for (const [k, v] of Object.entries(personFields)) {
        if (v !== null && v !== "Unknown") update[k] = v;
      }
      if (Object.keys(update).length > 0) {
        await supabase.from("persons").update(update).eq("id", existingPerson.id);
      }
      personId = existingPerson.id;
      skipped = true;
    } else {
      // create_new
      const { data: newPerson } = await supabase
        .from("persons")
        .insert({ ...personFields, source: "csv_import" })
        .select("id")
        .single();
      if (newPerson) {
        personId = (newPerson as { id: string }).id;
        created = true;
      }
    }
  } else {
    const { data: newPerson } = await supabase
      .from("persons")
      .insert({ ...personFields, source: "csv_import" })
      .select("id")
      .single();
    if (newPerson) {
      personId = (newPerson as { id: string }).id;
      created = true;
    }
  }

  // Link org
  if (personId && organizationId) {
    await supabase
      .from("person_organization")
      .upsert(
        {
          person_id: personId,
          organization_id: organizationId,
          is_primary: true,
          is_current: true,
          source: "csv_import",
        },
        { onConflict: "person_id,organization_id" },
      );
  }

  // Link event
  if (personId) {
    if (config.forcedEvent) {
      await upsertParticipation(supabase, {
        event_id: config.forcedEvent.id,
        person_id: personId,
        role: config.forcedEvent.role,
      });
    } else {
      const eventName = (row as PersonImportRow).event?.trim();
      if (eventName) {
        const eventId = config.eventMap[eventName];
        if (eventId) {
          await upsertParticipation(supabase, {
            event_id: eventId,
            person_id: personId,
            role: "attendee",
          });
        }
      }
    }
  }

  return { personId, created, skipped };
}

// ---------------------------------------------------------------------------
// Single-row org import
// ---------------------------------------------------------------------------

interface OrgRowResult {
  organizationId: string | null;
  created: boolean;
  skipped: boolean;
}

export async function importOrgRow(
  supabase: AnySupabase,
  row: OrganizationImportRow,
  config: ImportConfig,
): Promise<OrgRowResult> {
  const name = row.name?.trim();
  if (!name) {
    return { organizationId: null, created: false, skipped: true };
  }

  const orgFields = {
    name,
    website: row.website?.trim() || null,
    category: row.category?.trim() || null,
    linkedin_url: row.linkedin_url?.trim() || null,
    icp_score: row.icp_score ? parseInt(row.icp_score, 10) || null : null,
    icp_reason: row.icp_reason?.trim() || null,
    industry: row.industry?.trim() || null,
    employee_count: row.employee_count ? parseInt(row.employee_count, 10) || null : null,
    annual_revenue: row.annual_revenue ? parseInt(row.annual_revenue, 10) || null : null,
    founded_year: row.founded_year ? parseInt(row.founded_year, 10) || null : null,
    hq_location: row.hq_location?.trim() || null,
    funding_total: row.funding_total?.trim() || null,
    latest_funding_stage: row.latest_funding_stage?.trim() || null,
    logo_url: row.logo_url?.trim() || null,
  };

  const { data: existing } = await supabase
    .from("organizations")
    .select("id")
    .ilike("name", name)
    .maybeSingle();

  let organizationId: string | null = null;
  let created = false;
  let skipped = false;

  if (existing) {
    if (config.duplicateHandling === "skip") {
      organizationId = (existing as { id: string }).id;
      skipped = true;
    } else if (config.duplicateHandling === "update") {
      const update: Record<string, string | number | null> = {};
      for (const [k, v] of Object.entries(orgFields)) {
        if (v !== null && k !== "name") update[k] = v;
      }
      if (Object.keys(update).length > 0) {
        await supabase
          .from("organizations")
          .update(update)
          .eq("id", (existing as { id: string }).id);
      }
      organizationId = (existing as { id: string }).id;
      skipped = true;
    } else {
      // create_new
      const { data: newOrg } = await supabase
        .from("organizations")
        .insert(orgFields)
        .select("id")
        .single();
      if (newOrg) {
        organizationId = (newOrg as { id: string }).id;
        created = true;
      }
    }
  } else {
    const { data: newOrg } = await supabase
      .from("organizations")
      .insert(orgFields)
      .select("id")
      .single();
    if (newOrg) {
      organizationId = (newOrg as { id: string }).id;
      created = true;
    }
  }

  // Link event
  if (organizationId) {
    if (config.forcedEvent) {
      await upsertParticipation(supabase, {
        event_id: config.forcedEvent.id,
        organization_id: organizationId,
        role: config.forcedEvent.role,
        sponsor_tier: config.forcedEvent.sponsorTier ?? null,
      });
    } else {
      const eventName = (row as OrganizationImportRow).event?.trim();
      if (eventName) {
        const eventId = config.eventMap[eventName];
        if (eventId) {
          await upsertParticipation(supabase, {
            event_id: eventId,
            organization_id: organizationId,
            role: "sponsor",
          });
        }
      }
    }
  }

  return { organizationId, created, skipped };
}

// ---------------------------------------------------------------------------
// Metadata shape stored in job_log.metadata for csv_import jobs
// ---------------------------------------------------------------------------

interface CsvImportMetadata {
  mode: "persons" | "organizations";
  duplicateHandling: DuplicateHandling;
  eventMap: Record<string, string | null>;
  forcedEvent?: { id: string; role: ParticipationRole; sponsorTier?: SponsorTier | null } | null;
  filename: string;
  storage_path: string;
  processed_offset: number;
  recent_errors: string[];
  uploads_row_id: string | null;
}

// ---------------------------------------------------------------------------
// Helpers to read / patch job_log metadata without clobbering other keys
// ---------------------------------------------------------------------------

async function getJobRow(
  supabase: AnySupabase,
  jobId: string,
): Promise<{ status: string; progress_total: number; metadata: CsvImportMetadata } | null> {
  const { data } = await supabase
    .from("job_log")
    .select("status, progress_total, metadata")
    .eq("id", jobId)
    .single();
  return data as { status: string; progress_total: number; metadata: CsvImportMetadata } | null;
}

async function patchJobProgress(
  supabase: AnySupabase,
  jobId: string,
  patch: {
    progress_completed?: number;
    progress_failed?: number;
    status?: string;
    phase?: string;
    error?: string;
  },
  metaPatch?: Partial<CsvImportMetadata>,
): Promise<void> {
  // Read current metadata first to merge, avoiding a blind overwrite
  if (metaPatch) {
    const { data: current } = await supabase
      .from("job_log")
      .select("metadata")
      .eq("id", jobId)
      .single();
    const merged = { ...(current?.metadata ?? {}), ...metaPatch };
    const update: Record<string, unknown> = { ...patch, metadata: merged };
    await supabase.from("job_log").update(update).eq("id", jobId);
  } else {
    await supabase.from("job_log").update(patch).eq("id", jobId);
  }
}

// ---------------------------------------------------------------------------
// Main orchestrator
// ---------------------------------------------------------------------------

const PROGRESS_BATCH = 50;
const MAX_RECENT_ERRORS = 20;

export async function processImportJob(
  supabase: AnySupabase,
  jobId: string,
): Promise<void> {
  // 1. Load job row; bail if already done
  const job = await getJobRow(supabase, jobId);
  if (!job) throw new Error(`Job ${jobId} not found`);
  if (job.status === "completed") return;

  const meta = job.metadata;

  // Set status → processing
  await patchJobProgress(supabase, jobId, {
    status: "processing",
    phase: "Importing rows",
  });

  // 2. Download resolved rows from Storage
  let payload: ImportPayload;
  try {
    const { data: blob, error: dlError } = await supabase.storage
      .from("csv-imports")
      .download(meta.storage_path);
    if (dlError || !blob) {
      throw new Error(dlError?.message ?? "Storage download returned nothing");
    }
    const text = await blob.text();
    payload = JSON.parse(text) as ImportPayload;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await patchJobProgress(supabase, jobId, {
      status: "failed",
      phase: "Failed",
      error: `Storage error: ${msg}`,
    });
    return;
  }

  const { rows, config } = payload;
  const startOffset = meta.processed_offset ?? 0;

  let personsCreated = 0;
  let organizationsCreated = 0;
  let batchCompleted = 0;
  let batchFailed = 0;
  const recentErrors: string[] = [...(meta.recent_errors ?? [])];

  // Ensure legacy uploads row exists
  let uploadsRowId = meta.uploads_row_id ?? null;
  if (!uploadsRowId) {
    try {
      uploadsRowId = await insertUploadRow(supabase, meta.filename, job.progress_total);
      await patchJobProgress(supabase, jobId, {}, { uploads_row_id: uploadsRowId });
    } catch {
      // Non-fatal — proceed without legacy row
    }
  }

  // 3. Loop rows from offset
  try {
    for (let i = startOffset; i < rows.length; i++) {
      const row = rows[i];
      try {
        if (config.mode === "persons") {
          const result = await importPersonRow(supabase, row as PersonImportRow, config);
          if (result.created) personsCreated++;
          batchCompleted++;
        } else {
          const result = await importOrgRow(supabase, row as OrganizationImportRow, config);
          if (result.created) organizationsCreated++;
          batchCompleted++;
        }
      } catch (err) {
        const msg = `Row ${i + 1}: ${err instanceof Error ? err.message : "Unknown error"}`;
        batchFailed++;
        if (recentErrors.length < MAX_RECENT_ERRORS) {
          recentErrors.push(msg);
        }
      }

      // Write progress every PROGRESS_BATCH rows
      if ((i - startOffset + 1) % PROGRESS_BATCH === 0) {
        await patchJobProgress(
          supabase,
          jobId,
          {
            progress_completed: batchCompleted,
            progress_failed: batchFailed,
          },
          {
            processed_offset: i + 1,
            recent_errors: recentErrors.slice(-MAX_RECENT_ERRORS),
          },
        );
      }
    }

    // Final progress write
    await patchJobProgress(
      supabase,
      jobId,
      {
        status: "completed",
        phase: "Done",
        progress_completed: batchCompleted,
        progress_failed: batchFailed,
      },
      {
        processed_offset: rows.length,
        recent_errors: recentErrors.slice(-MAX_RECENT_ERRORS),
      },
    );

    // Finalize legacy uploads row
    if (uploadsRowId) {
      const allErrors = recentErrors.slice(-MAX_RECENT_ERRORS);
      await finalizeUploadRow(
        supabase,
        uploadsRowId,
        personsCreated,
        organizationsCreated,
        allErrors,
      );
    }
  } catch (err) {
    // Fatal (non-row) error
    const msg = err instanceof Error ? err.message : String(err);
    await patchJobProgress(
      supabase,
      jobId,
      {
        status: "failed",
        phase: "Failed",
        error: msg,
        progress_completed: batchCompleted,
        progress_failed: batchFailed,
      },
      {
        processed_offset: startOffset + batchCompleted + batchFailed,
        recent_errors: recentErrors.slice(-MAX_RECENT_ERRORS),
      },
    );

    if (uploadsRowId) {
      await finalizeUploadRow(supabase, uploadsRowId, personsCreated, organizationsCreated, [
        ...recentErrors,
        `Fatal: ${msg}`,
      ]);
    }
  }
}
