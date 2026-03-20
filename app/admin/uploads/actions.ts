"use server";

import { createClient } from "@/lib/supabase/server";

interface ImportConfig {
  eventId: string | null;
  importAs: "contacts" | "companies" | "both";
  duplicateHandling: "skip" | "update" | "create_new";
}

interface MappedRow {
  [field: string]: string;
}

interface ImportResult {
  success: boolean;
  uploadId?: string;
  contactsCreated: number;
  companiesCreated: number;
  skipped: number;
  errors: string[];
}

export async function importCsvData(
  rows: MappedRow[],
  config: ImportConfig,
  filename: string
): Promise<ImportResult> {
  const supabase = await createClient();
  let contactsCreated = 0;
  let companiesCreated = 0;
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
      contactsCreated: 0,
      companiesCreated: 0,
      skipped: 0,
      errors: [uploadError?.message ?? "Failed to create upload record"],
    };
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      let companyId: string | null = null;

      // Handle company creation
      const companyName = row.company_name?.trim();
      if (
        companyName &&
        (config.importAs === "companies" || config.importAs === "both")
      ) {
        // Check for existing company
        const { data: existingCompany } = await supabase
          .from("companies")
          .select("id")
          .eq("name", companyName)
          .single();

        if (existingCompany) {
          if (config.duplicateHandling === "skip") {
            companyId = existingCompany.id;
          } else if (config.duplicateHandling === "update") {
            const companyUpdate: Record<string, string> = {};
            if (row.company_website) companyUpdate.website = row.company_website;
            if (row.company_category)
              companyUpdate.category = row.company_category;
            if (row.company_linkedin)
              companyUpdate.linkedin_url = row.company_linkedin;
            if (row.icp_score)
              (companyUpdate as Record<string, unknown>).icp_score = parseInt(row.icp_score) || null;
            if (row.icp_reason) companyUpdate.icp_reason = row.icp_reason;

            if (Object.keys(companyUpdate).length > 0) {
              await supabase
                .from("companies")
                .update(companyUpdate)
                .eq("id", existingCompany.id);
            }
            companyId = existingCompany.id;
          } else {
            // create_new
            const { data: newCompany } = await supabase
              .from("companies")
              .insert({
                name: companyName,
                website: row.company_website || null,
                category: row.company_category || null,
                linkedin_url: row.company_linkedin || null,
                icp_score: row.icp_score ? parseInt(row.icp_score) : null,
                icp_reason: row.icp_reason || null,
              })
              .select("id")
              .single();
            if (newCompany) {
              companyId = newCompany.id;
              companiesCreated++;
            }
          }
        } else {
          const { data: newCompany } = await supabase
            .from("companies")
            .insert({
              name: companyName,
              website: row.company_website || null,
              category: row.company_category || null,
              linkedin_url: row.company_linkedin || null,
              icp_score: row.icp_score ? parseInt(row.icp_score) : null,
              icp_reason: row.icp_reason || null,
            })
            .select("id")
            .single();
          if (newCompany) {
            companyId = newCompany.id;
            companiesCreated++;
          }
        }
      }

      // Handle contact creation
      if (config.importAs === "contacts" || config.importAs === "both") {
        const email = row.email?.trim();
        const fullName =
          row.full_name?.trim() ||
          [row.first_name, row.last_name].filter(Boolean).join(" ") ||
          null;

        if (!fullName && !email) {
          skipped++;
          continue;
        }

        // Check for existing contact (by email)
        let existingContact = null;
        if (email) {
          const { data } = await supabase
            .from("contacts")
            .select("id")
            .eq("email", email)
            .single();
          existingContact = data;
        }

        if (existingContact) {
          if (config.duplicateHandling === "skip") {
            skipped++;
          } else if (config.duplicateHandling === "update") {
            const contactUpdate: Record<string, string | null> = {};
            if (row.full_name) contactUpdate.full_name = row.full_name;
            if (row.first_name) contactUpdate.first_name = row.first_name;
            if (row.last_name) contactUpdate.last_name = row.last_name;
            if (row.linkedin) contactUpdate.linkedin = row.linkedin;
            if (row.twitter) contactUpdate.twitter = row.twitter;
            if (row.phone) contactUpdate.phone = row.phone;
            if (row.title) contactUpdate.title = row.title;
            if (row.seniority) contactUpdate.seniority = row.seniority;
            if (row.department) contactUpdate.department = row.department;
            if (row.context) contactUpdate.context = row.context;
            if (row.telegram) contactUpdate.telegram = row.telegram;

            if (Object.keys(contactUpdate).length > 0) {
              await supabase
                .from("contacts")
                .update(contactUpdate)
                .eq("id", existingContact.id);
            }

            // Link to company if exists
            if (companyId) {
              await supabase.from("contact_company").upsert(
                {
                  contact_id: existingContact.id,
                  company_id: companyId,
                  is_primary: true,
                },
                { onConflict: "contact_id,company_id" }
              );
            }
            skipped++;
          } else {
            // create_new — fall through to create
            const { data: newContact } = await supabase
              .from("contacts")
              .insert({
                full_name: fullName || "Unknown",
                first_name: row.first_name || null,
                last_name: row.last_name || null,
                email: email || null,
                linkedin: row.linkedin || null,
                twitter: row.twitter || null,
                phone: row.phone || null,
                title: row.title || null,
                seniority: row.seniority || null,
                department: row.department || null,
                context: row.context || null,
                telegram: row.telegram || null,
                source: "csv_import",
              })
              .select("id")
              .single();

            if (newContact) {
              contactsCreated++;
              if (companyId) {
                await supabase.from("contact_company").insert({
                  contact_id: newContact.id,
                  company_id: companyId,
                  is_primary: true,
                });
              }
              if (config.eventId) {
                await supabase.from("contact_events").insert({
                  contact_id: newContact.id,
                  event_id: config.eventId,
                });
              }
            }
          }
        } else {
          // New contact
          const { data: newContact } = await supabase
            .from("contacts")
            .insert({
              full_name: fullName || "Unknown",
              first_name: row.first_name || null,
              last_name: row.last_name || null,
              email: email || null,
              linkedin: row.linkedin || null,
              twitter: row.twitter || null,
              phone: row.phone || null,
              title: row.title || null,
              seniority: row.seniority || null,
              department: row.department || null,
              context: row.context || null,
              telegram: row.telegram || null,
              source: "csv_import",
            })
            .select("id")
            .single();

          if (newContact) {
            contactsCreated++;
            if (companyId) {
              await supabase.from("contact_company").insert({
                contact_id: newContact.id,
                company_id: companyId,
                is_primary: true,
              });
            }
            if (config.eventId) {
              await supabase.from("contact_events").insert({
                contact_id: newContact.id,
                event_id: config.eventId,
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
      contacts_created: contactsCreated,
      companies_created: companiesCreated,
      status: errors.length > 0 && contactsCreated === 0 ? "failed" : "completed",
      errors: errors.length > 0 ? { messages: errors } : null,
    })
    .eq("id", upload.id);

  return {
    success: true,
    uploadId: upload.id,
    contactsCreated,
    companiesCreated,
    skipped,
    errors,
  };
}
