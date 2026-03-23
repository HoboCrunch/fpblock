"use server";

import { createClient } from "@/lib/supabase/server";

interface ImportConfig {
  eventId: string | null;
  importAs: "persons" | "organizations" | "both";
  duplicateHandling: "skip" | "update" | "create_new";
}

interface MappedRow {
  [field: string]: string;
}

interface ImportResult {
  success: boolean;
  uploadId?: string;
  personsCreated: number;
  organizationsCreated: number;
  skipped: number;
  errors: string[];
}

export async function importCsvData(
  rows: MappedRow[],
  config: ImportConfig,
  filename: string
): Promise<ImportResult> {
  const supabase = await createClient();
  let personsCreated = 0;
  let organizationsCreated = 0;
  let skipped = 0;
  const errors: string[] = [];

  // Create upload record
  const { data: upload, error: uploadError } = await supabase
    .from("uploads")
    .insert({
      filename,
      row_count: rows.length,
      event_id: config.eventId || null,
      status: "processing",
    })
    .select("id")
    .single();

  if (uploadError || !upload) {
    return {
      success: false,
      personsCreated: 0,
      organizationsCreated: 0,
      skipped: 0,
      errors: [uploadError?.message ?? "Failed to create upload record"],
    };
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      let organizationId: string | null = null;

      // Handle organization creation
      const orgName = row.company_name?.trim();
      if (
        orgName &&
        (config.importAs === "organizations" || config.importAs === "both")
      ) {
        // Check for existing organization
        const { data: existingOrg } = await supabase
          .from("organizations")
          .select("id")
          .eq("name", orgName)
          .single();

        if (existingOrg) {
          if (config.duplicateHandling === "skip") {
            organizationId = existingOrg.id;
          } else if (config.duplicateHandling === "update") {
            const orgUpdate: Record<string, string> = {};
            if (row.company_website) orgUpdate.website = row.company_website;
            if (row.company_category)
              orgUpdate.category = row.company_category;
            if (row.company_linkedin)
              orgUpdate.linkedin_url = row.company_linkedin;
            if (row.icp_score)
              (orgUpdate as Record<string, unknown>).icp_score = parseInt(row.icp_score) || null;
            if (row.icp_reason) orgUpdate.icp_reason = row.icp_reason;

            if (Object.keys(orgUpdate).length > 0) {
              await supabase
                .from("organizations")
                .update(orgUpdate)
                .eq("id", existingOrg.id);
            }
            organizationId = existingOrg.id;
          } else {
            // create_new
            const { data: newOrg } = await supabase
              .from("organizations")
              .insert({
                name: orgName,
                website: row.company_website || null,
                category: row.company_category || null,
                linkedin_url: row.company_linkedin || null,
                icp_score: row.icp_score ? parseInt(row.icp_score) : null,
                icp_reason: row.icp_reason || null,
              })
              .select("id")
              .single();
            if (newOrg) {
              organizationId = newOrg.id;
              organizationsCreated++;
            }
          }
        } else {
          const { data: newOrg } = await supabase
            .from("organizations")
            .insert({
              name: orgName,
              website: row.company_website || null,
              category: row.company_category || null,
              linkedin_url: row.company_linkedin || null,
              icp_score: row.icp_score ? parseInt(row.icp_score) : null,
              icp_reason: row.icp_reason || null,
            })
            .select("id")
            .single();
          if (newOrg) {
            organizationId = newOrg.id;
            organizationsCreated++;
          }
        }
      }

      // Handle person creation
      if (config.importAs === "persons" || config.importAs === "both") {
        const email = row.email?.trim();
        const fullName =
          row.full_name?.trim() ||
          [row.first_name, row.last_name].filter(Boolean).join(" ") ||
          null;

        if (!fullName && !email) {
          skipped++;
          continue;
        }

        // Check for existing person (by email)
        let existingPerson = null;
        if (email) {
          const { data } = await supabase
            .from("persons")
            .select("id")
            .eq("email", email)
            .single();
          existingPerson = data;
        }

        if (existingPerson) {
          if (config.duplicateHandling === "skip") {
            skipped++;
          } else if (config.duplicateHandling === "update") {
            const personUpdate: Record<string, string | null> = {};
            if (row.full_name) personUpdate.full_name = row.full_name;
            if (row.first_name) personUpdate.first_name = row.first_name;
            if (row.last_name) personUpdate.last_name = row.last_name;
            if (row.linkedin) personUpdate.linkedin_url = row.linkedin;
            if (row.twitter) personUpdate.twitter_handle = row.twitter;
            if (row.phone) personUpdate.phone = row.phone;
            if (row.title) personUpdate.title = row.title;
            if (row.seniority) personUpdate.seniority = row.seniority;
            if (row.department) personUpdate.department = row.department;
            if (row.context) personUpdate.notes = row.context;
            if (row.telegram) personUpdate.telegram_handle = row.telegram;

            if (Object.keys(personUpdate).length > 0) {
              await supabase
                .from("persons")
                .update(personUpdate)
                .eq("id", existingPerson.id);
            }

            // Link to organization if exists
            if (organizationId) {
              await supabase.from("person_organization").upsert(
                {
                  person_id: existingPerson.id,
                  organization_id: organizationId,
                  is_primary: true,
                  is_current: true,
                },
                { onConflict: "person_id,organization_id" }
              );
            }
            skipped++;
          } else {
            // create_new — fall through to create
            const { data: newPerson } = await supabase
              .from("persons")
              .insert({
                full_name: fullName || "Unknown",
                first_name: row.first_name || null,
                last_name: row.last_name || null,
                email: email || null,
                linkedin_url: row.linkedin || null,
                twitter_handle: row.twitter || null,
                phone: row.phone || null,
                title: row.title || null,
                seniority: row.seniority || null,
                department: row.department || null,
                notes: row.context || null,
                telegram_handle: row.telegram || null,
                source: "csv_import",
              })
              .select("id")
              .single();

            if (newPerson) {
              personsCreated++;
              if (organizationId) {
                await supabase.from("person_organization").insert({
                  person_id: newPerson.id,
                  organization_id: organizationId,
                  is_primary: true,
                  is_current: true,
                });
              }
              if (config.eventId) {
                await supabase.from("event_participations").insert({
                  person_id: newPerson.id,
                  event_id: config.eventId,
                  role: "attendee",
                });
              }
            }
          }
        } else {
          // New person
          const { data: newPerson } = await supabase
            .from("persons")
            .insert({
              full_name: fullName || "Unknown",
              first_name: row.first_name || null,
              last_name: row.last_name || null,
              email: email || null,
              linkedin_url: row.linkedin || null,
              twitter_handle: row.twitter || null,
              phone: row.phone || null,
              title: row.title || null,
              seniority: row.seniority || null,
              department: row.department || null,
              notes: row.context || null,
              telegram_handle: row.telegram || null,
              source: "csv_import",
            })
            .select("id")
            .single();

          if (newPerson) {
            personsCreated++;
            if (organizationId) {
              await supabase.from("person_organization").insert({
                person_id: newPerson.id,
                organization_id: organizationId,
                is_primary: true,
                is_current: true,
              });
            }
            if (config.eventId) {
              await supabase.from("event_participations").insert({
                person_id: newPerson.id,
                event_id: config.eventId,
                role: "attendee",
              });
            }
          }
        }
      }
    } catch (err) {
      errors.push(`Row ${i + 1}: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  }

  // Update upload record
  await supabase
    .from("uploads")
    .update({
      persons_created: personsCreated,
      organizations_created: organizationsCreated,
      status: errors.length > 0 && personsCreated === 0 ? "failed" : "completed",
      errors: errors.length > 0 ? { messages: errors } : null,
    })
    .eq("id", upload.id);

  return {
    success: true,
    uploadId: upload.id,
    personsCreated,
    organizationsCreated,
    skipped,
    errors,
  };
}
