"use server";

import { createClient } from "@/lib/supabase/server";
import { partitionEventNames, normalizeEventName } from "@/lib/uploads/event-detect";

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

export async function listUnknownEvents(names: string[]): Promise<{
  known: Record<string, string>;
  unknown: string[];
}> {
  const supabase = await createClient();
  const trimmed = [
    ...new Set(names.map((n) => n.trim()).filter((n) => n.length > 0)),
  ];
  if (trimmed.length === 0) return { known: {}, unknown: [] };

  const { data: events } = await supabase
    .from("events")
    .select("id, name");

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
      .insert({
        name: d.name,
        date_start: d.date_start || null,
      })
      .select("id")
      .single();
    if (error || !data) {
      throw new Error(`Failed to create event "${d.name}": ${error?.message ?? "unknown"}`);
    }
    out[d.name] = (data as { id: string }).id;
  }
  return out;
}

async function insertUploadRow(
  filename: string,
  rowCount: number,
): Promise<string> {
  const supabase = await createClient();
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

async function finalizeUploadRow(
  uploadId: string,
  personsCreated: number,
  organizationsCreated: number,
  errors: string[],
): Promise<void> {
  const supabase = await createClient();
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

export async function importPersons(
  rows: PersonImportRow[],
  config: {
    duplicateHandling: DuplicateHandling;
    eventMap: Record<string, string | null>;
  },
  filename: string,
): Promise<ImportResult> {
  const supabase = await createClient();
  const uploadId = await insertUploadRow(filename, rows.length);

  let personsCreated = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      const email = row.email?.trim();
      const fullName =
        row.full_name?.trim() ||
        [row.first_name, row.last_name].filter(Boolean).join(" ").trim() ||
        null;

      if (!fullName && !email) {
        skipped++;
        continue;
      }

      // Resolve organization (link only — no firmographic writes here)
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

      // Dedupe person by email
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
        notes: row.context?.trim() || null,
      };

      let personId: string | null = null;

      if (existingPerson) {
        if (config.duplicateHandling === "skip") {
          skipped++;
          personId = existingPerson.id; // still link event/org below
        } else if (config.duplicateHandling === "update") {
          const update: Record<string, string | null> = {};
          for (const [k, v] of Object.entries(personFields)) {
            if (v !== null && v !== "Unknown") update[k] = v;
          }
          if (Object.keys(update).length > 0) {
            await supabase.from("persons").update(update).eq("id", existingPerson.id);
          }
          personId = existingPerson.id;
          skipped++;
        } else {
          // create_new
          const { data: created } = await supabase
            .from("persons")
            .insert({ ...personFields, source: "csv_import" })
            .select("id")
            .single();
          if (created) {
            personId = (created as { id: string }).id;
            personsCreated++;
          }
        }
      } else {
        const { data: created } = await supabase
          .from("persons")
          .insert({ ...personFields, source: "csv_import" })
          .select("id")
          .single();
        if (created) {
          personId = (created as { id: string }).id;
          personsCreated++;
        }
      }

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

      const eventName = row.event?.trim();
      if (personId && eventName) {
        const eventId = config.eventMap[eventName];
        if (eventId) {
          await supabase
            .from("event_participations")
            .insert({
              person_id: personId,
              event_id: eventId,
              role: "attendee",
            });
        }
      }
    } catch (err) {
      errors.push(`Row ${i + 1}: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  }

  await finalizeUploadRow(uploadId, personsCreated, 0, errors);
  return {
    success: true,
    uploadId,
    personsCreated,
    organizationsCreated: 0,
    skipped,
    errors,
  };
}

export async function importOrganizations(
  rows: OrganizationImportRow[],
  config: {
    duplicateHandling: DuplicateHandling;
    eventMap: Record<string, string | null>;
  },
  filename: string,
): Promise<ImportResult> {
  const supabase = await createClient();
  const uploadId = await insertUploadRow(filename, rows.length);

  let organizationsCreated = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      const name = row.name?.trim();
      if (!name) {
        skipped++;
        continue;
      }

      const orgFields = {
        name,
        website: row.website?.trim() || null,
        category: row.category?.trim() || null,
        linkedin_url: row.linkedin_url?.trim() || null,
        icp_score: row.icp_score ? parseInt(row.icp_score, 10) || null : null,
        icp_reason: row.icp_reason?.trim() || null,
        industry: row.industry?.trim() || null,
        employee_count: row.employee_count
          ? parseInt(row.employee_count, 10) || null
          : null,
        annual_revenue: row.annual_revenue
          ? parseInt(row.annual_revenue, 10) || null
          : null,
        founded_year: row.founded_year
          ? parseInt(row.founded_year, 10) || null
          : null,
        hq_location: row.hq_location?.trim() || null,
        funding_total: row.funding_total?.trim() || null,
        latest_funding_stage: row.latest_funding_stage?.trim() || null,
      };

      const { data: existing } = await supabase
        .from("organizations")
        .select("id")
        .ilike("name", name)
        .maybeSingle();

      let organizationId: string | null = null;

      if (existing) {
        if (config.duplicateHandling === "skip") {
          organizationId = (existing as { id: string }).id;
          skipped++;
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
          skipped++;
        } else {
          // create_new
          const { data: created } = await supabase
            .from("organizations")
            .insert(orgFields)
            .select("id")
            .single();
          if (created) {
            organizationId = (created as { id: string }).id;
            organizationsCreated++;
          }
        }
      } else {
        const { data: created } = await supabase
          .from("organizations")
          .insert(orgFields)
          .select("id")
          .single();
        if (created) {
          organizationId = (created as { id: string }).id;
          organizationsCreated++;
        }
      }

      const eventName = row.event?.trim();
      if (organizationId && eventName) {
        const eventId = config.eventMap[eventName];
        if (eventId) {
          await supabase
            .from("event_participations")
            .insert({
              organization_id: organizationId,
              event_id: eventId,
              role: "sponsor",
            });
        }
      }
    } catch (err) {
      errors.push(`Row ${i + 1}: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  }

  await finalizeUploadRow(uploadId, 0, organizationsCreated, errors);
  return {
    success: true,
    uploadId,
    personsCreated: 0,
    organizationsCreated,
    skipped,
    errors,
  };
}
