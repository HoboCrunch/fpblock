/**
 * Comprehensive data import for FP Block CRM
 * Imports from all data sources with deduplication
 *
 * Sources:
 * 1. company_research.csv — ICP scores + USP for existing companies
 * 2. sponsors.csv — sponsor companies with tiers
 * 3. dcblockchain_2026_combined.csv — DC Blockchain speakers + sponsors
 * 4. jb-sheet.csv — JB's research (843 companies/contacts)
 * 5. eli-sheet.csv — Eli's research (685 companies/contacts)
 * 6. company_news_cache.json — company signals
 *
 * Usage: npx tsx scripts/import-all.ts
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { parse } from "csv-parse/sync";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── Stats ───────────────────────────────────────────────────────────
const stats = {
  contactsCreated: 0,
  contactsUpdated: 0,
  companiesCreated: 0,
  companiesUpdated: 0,
  signalsCreated: 0,
  eventsCreated: 0,
  linksCreated: 0,
  skipped: 0,
  errors: 0,
};

// ─── Caches (avoid repeated lookups) ─────────────────────────────────
const companyCache = new Map<string, string>(); // normalized name → id
const contactCache = new Map<string, string>(); // normalized name → id
const contactEmailCache = new Map<string, string>(); // email → id

async function authenticate() {
  const { error } = await supabase.auth.signInWithPassword({
    email: "admin@gofpblock.com",
    password: process.env.ADMIN_PASSWORD || "changeme",
  });
  if (error) {
    console.error("Auth failed:", error.message);
    process.exit(1);
  }
  console.log("Authenticated\n");
}

// ─── Warm caches from existing DB data ──────────────────────────────
async function warmCaches() {
  console.log("Warming caches from existing data...");

  // Fetch all contacts
  let allContacts: any[] = [];
  let offset = 0;
  while (true) {
    const { data } = await supabase
      .from("contacts")
      .select("id, full_name, email")
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;
    allContacts = allContacts.concat(data);
    offset += 1000;
  }

  for (const c of allContacts) {
    contactCache.set(normalize(c.full_name), c.id);
    if (c.email) contactEmailCache.set(c.email.toLowerCase(), c.id);
  }
  console.log(`  Contacts cached: ${contactCache.size}`);

  // Fetch all companies
  let allCompanies: any[] = [];
  offset = 0;
  while (true) {
    const { data } = await supabase
      .from("companies")
      .select("id, name")
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;
    allCompanies = allCompanies.concat(data);
    offset += 1000;
  }

  for (const c of allCompanies) {
    companyCache.set(normalize(c.name), c.id);
  }
  console.log(`  Companies cached: ${companyCache.size}\n`);
}

function normalize(s: string): string {
  return (s || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

// ─── Get or create company ──────────────────────────────────────────
async function getOrCreateCompany(
  name: string,
  extra?: {
    website?: string;
    category?: string;
    description?: string;
    icp_score?: number;
    icp_reason?: string;
    usp?: string;
    linkedin_url?: string;
  }
): Promise<string | null> {
  if (!name.trim()) return null;
  const key = normalize(name);
  if (companyCache.has(key)) return companyCache.get(key)!;

  const { data: existing } = await supabase
    .from("companies")
    .select("id")
    .ilike("name", name.trim())
    .limit(1)
    .single();

  if (existing) {
    companyCache.set(key, existing.id);
    return existing.id;
  }

  const { data: created, error } = await supabase
    .from("companies")
    .insert({
      name: name.trim(),
      website: extra?.website || null,
      category: extra?.category || null,
      description: extra?.description || null,
      icp_score: extra?.icp_score || null,
      icp_reason: extra?.icp_reason || null,
      usp: extra?.usp || null,
      linkedin_url: extra?.linkedin_url || null,
    })
    .select("id")
    .single();

  if (error || !created) {
    stats.errors++;
    return null;
  }

  companyCache.set(key, created.id);
  stats.companiesCreated++;
  return created.id;
}

// ─── Get or create contact ──────────────────────────────────────────
async function getOrCreateContact(data: {
  full_name: string;
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
  context?: string;
  source?: string;
}): Promise<string | null> {
  if (!data.full_name.trim()) return null;

  // Check by email first
  if (data.email) {
    const emailKey = data.email.toLowerCase();
    if (contactEmailCache.has(emailKey)) return contactEmailCache.get(emailKey)!;
  }

  // Check by name
  const nameKey = normalize(data.full_name);
  if (contactCache.has(nameKey)) {
    const existingId = contactCache.get(nameKey)!;
    // Update missing fields
    const updates: Record<string, any> = {};
    if (data.email) updates.email = data.email;
    if (data.linkedin) updates.linkedin = data.linkedin;
    if (data.twitter) updates.twitter = data.twitter;
    if (data.telegram) updates.telegram = data.telegram;
    if (data.phone) updates.phone = data.phone;
    if (data.title) updates.title = data.title;

    if (Object.keys(updates).length > 0) {
      // Only update if fields are currently null
      const { data: current } = await supabase
        .from("contacts")
        .select("email, linkedin, twitter, telegram, phone, title")
        .eq("id", existingId)
        .single();

      const filtered: Record<string, any> = {};
      for (const [k, v] of Object.entries(updates)) {
        if (current && !current[k as keyof typeof current]) filtered[k] = v;
      }
      if (Object.keys(filtered).length > 0) {
        await supabase.from("contacts").update(filtered).eq("id", existingId);
        stats.contactsUpdated++;
      }
    }

    if (data.email) contactEmailCache.set(data.email.toLowerCase(), existingId);
    return existingId;
  }

  // Create new
  const nameParts = data.full_name.trim().split(" ");
  const { data: created, error } = await supabase
    .from("contacts")
    .insert({
      full_name: data.full_name.trim(),
      first_name: data.first_name || nameParts[0] || null,
      last_name: data.last_name || nameParts.slice(1).join(" ") || null,
      email: data.email || null,
      linkedin: data.linkedin || null,
      twitter: data.twitter || null,
      telegram: data.telegram || null,
      phone: data.phone || null,
      title: data.title || null,
      seniority: data.seniority || null,
      department: data.department || null,
      context: data.context || null,
      source: data.source || null,
    })
    .select("id")
    .single();

  if (error || !created) {
    stats.errors++;
    return null;
  }

  contactCache.set(nameKey, created.id);
  if (data.email) contactEmailCache.set(data.email.toLowerCase(), created.id);
  stats.contactsCreated++;
  return created.id;
}

// ─── Link helpers ───────────────────────────────────────────────────
async function linkContactCompany(contactId: string, companyId: string, role?: string, roleType?: string, source?: string) {
  await supabase.from("contact_company").upsert({
    contact_id: contactId,
    company_id: companyId,
    role: role || null,
    role_type: roleType || null,
    is_primary: true,
    source: source || null,
  }, { onConflict: "contact_id,company_id" });
  stats.linksCreated++;
}

async function linkContactEvent(contactId: string, eventId: string, participationType?: string, track?: string, notes?: string) {
  await supabase.from("contact_event").upsert({
    contact_id: contactId,
    event_id: eventId,
    participation_type: participationType || null,
    track: track || null,
    notes: notes || null,
  }, { onConflict: "contact_id,event_id" });
  stats.linksCreated++;
}

async function linkCompanyEvent(companyId: string, eventId: string, relationshipType?: string, sponsorTier?: string) {
  await supabase.from("company_event").upsert({
    company_id: companyId,
    event_id: eventId,
    relationship_type: relationshipType || null,
    sponsor_tier: sponsorTier || null,
  }, { onConflict: "company_id,event_id" });
  stats.linksCreated++;
}

function readCsv(path: string): any[] {
  const content = readFileSync(path, "utf-8").replace(/^\uFEFF/, ""); // strip BOM
  return parse(content, { columns: true, skip_empty_lines: true, relax_column_count: true });
}

// ─── 1. Update companies with ICP scores + USP ─────────────────────
async function importCompanyResearch() {
  console.log("1. Importing company research (ICP + USP)...");
  const rows = readCsv("scraping/data/company_research.csv");
  let updated = 0;
  const scoredCompanies = new Set<string>(); // track which companies got scores

  for (const row of rows) {
    const name = (row.company || row.Company || "").trim();
    if (!name) continue;

    const key = normalize(name);
    let companyId = companyCache.get(key);

    if (!companyId) {
      // Try DB lookup (case-insensitive)
      const { data } = await supabase
        .from("companies")
        .select("id")
        .ilike("name", name)
        .limit(1)
        .single();
      if (data) {
        companyId = data.id;
        companyCache.set(key, companyId);
      }
    }

    if (companyId) {
      const score = parseInt(row.icp_score) || null;
      const usp = (row.usp || "").trim() || null;
      const reason = (row.icp_reason || "").trim() || null;

      const updateData: Record<string, any> = {};
      if (score) updateData.icp_score = score;
      if (usp) updateData.usp = usp;
      if (reason) updateData.icp_reason = reason;

      if (Object.keys(updateData).length > 0) {
        await supabase.from("companies").update(updateData).eq("id", companyId);
        updated++;
        scoredCompanies.add(key);
      }
    }
  }
  console.log(`  Updated ${updated} companies from company_research.csv`);

  // Also apply scores from enriched_speakers.csv for companies not already scored
  const speakerRows = readCsv("scraping/data/enriched_speakers.csv");
  let speakerUpdated = 0;
  for (const row of speakerRows) {
    const org = (row.Company || row.company || "").trim();
    if (!org) continue;
    const key = normalize(org);
    if (scoredCompanies.has(key)) continue; // already scored from company_research

    const companyId = companyCache.get(key);
    if (!companyId) continue;

    const score = parseInt(row.Score || row.icp_score || "") || null;
    if (score) {
      await supabase.from("companies").update({ icp_score: score }).eq("id", companyId);
      speakerUpdated++;
      scoredCompanies.add(key);
    }
  }
  console.log(`  Updated ${speakerUpdated} additional companies from enriched_speakers.csv\n`);
}

// ─── 2. Import sponsor companies ────────────────────────────────────
async function importSponsors() {
  console.log("2. Importing EthCC sponsors...");
  const rows = readCsv("scraping/data/sponsors.csv");
  const ethccId = "b0000000-0000-0000-0000-000000000001";

  for (const row of rows) {
    const name = (row.name || "").trim();
    if (!name) continue;

    const companyId = await getOrCreateCompany(name, {
      website: (row.website || "").trim() || undefined,
      description: (row.description || "").trim() || undefined,
    });

    if (companyId) {
      await linkCompanyEvent(companyId, ethccId, "sponsor", (row.tier || "").trim());
    }
  }
  console.log(`  Processed ${rows.length} sponsor entries\n`);
}

// ─── 3. Import DC Blockchain event ──────────────────────────────────
async function importDCBlockchain() {
  console.log("3. Importing DC Blockchain 2026...");
  const rows = readCsv("data/workshop/dcblockchain_2026_combined.csv");

  // Create the event
  const { data: existingEvent } = await supabase
    .from("events")
    .select("id")
    .ilike("name", "%DC Blockchain%")
    .limit(1)
    .single();

  let eventId: string;
  if (existingEvent) {
    eventId = existingEvent.id;
  } else {
    const { data: newEvent, error } = await supabase.from("events").insert({
      name: "DC Blockchain Summit 2026",
      location: "Washington, DC",
      date_start: "2026-05-15",
      date_end: "2026-05-16",
      website: "https://dcblockchainsummit.com",
    }).select("id").single();
    if (error || !newEvent) {
      console.error("  Failed to create DC Blockchain event:", error?.message);
      return;
    }
    eventId = newEvent.id;
    stats.eventsCreated++;
  }

  let speakers = 0, sponsors = 0;

  for (const row of rows) {
    const recordType = (row["Record Type"] || "").trim();
    const category = (row["Category/Tier"] || "").trim();
    const nameOrCompany = (row["Name/Company"] || "").trim();
    const title = (row["Title"] || "").trim();
    const org = (row["Organization"] || "").trim();

    if (!nameOrCompany) continue;

    if (recordType === "Speaker") {
      // Create contact
      const contactId = await getOrCreateContact({
        full_name: nameOrCompany,
        title,
        source: "dc_blockchain",
        context: `${category} — ${org}`,
      });

      if (contactId) {
        await linkContactEvent(contactId, eventId, "speaker", category);
        speakers++;

        // Link to org as company
        if (org) {
          const companyId = await getOrCreateCompany(org, { category });
          if (companyId) {
            await linkContactCompany(contactId, companyId, title, undefined, "dc_blockchain");
            await linkCompanyEvent(companyId, eventId, "speaker");
          }
        }
      }
    } else if (recordType === "Sponsor") {
      // Create company
      const companyId = await getOrCreateCompany(nameOrCompany);
      if (companyId) {
        await linkCompanyEvent(companyId, eventId, "sponsor", category);
        sponsors++;
      }
    }
  }
  console.log(`  Speakers: ${speakers}, Sponsors: ${sponsors}\n`);
}

// ─── Convert qualitative ICP Fit text to numeric score ──────────────
function icpFitToScore(fit: string): number | null {
  if (!fit) return null;
  const lower = fit.toLowerCase();
  if (lower.startsWith("strong")) return 85;
  if (lower.startsWith("moderate-to-strong") || lower.startsWith("moderate-strong")) return 78;
  if (lower.startsWith("moderate")) return 65;
  if (lower.startsWith("probable")) return 60;
  if (lower.startsWith("weak")) return 40;
  if (lower.startsWith("uncertain") || lower.startsWith("unclear") || lower.startsWith("unscoreable")) return null;
  if (lower.startsWith("disqualified")) return 10;
  return null;
}

// ─── 4. Import JB sheet ─────────────────────────────────────────────
async function importJBSheet() {
  console.log("4. Importing JB sheet (companies + contacts)...");
  const rows = readCsv("app/data/matrix/base/jb-sheet.csv");
  const ethccId = "b0000000-0000-0000-0000-000000000001";
  let imported = 0;
  let icpScored = 0;

  for (const row of rows) {
    const companyName = (row["Company Name"] || "").trim();
    const personName = (row["Decision-maker Name"] || "").trim();
    const personTitle = (row["Decision-maker Title"] || "").trim();
    const personEmail = (row["Decision-maker Email"] || "").trim();
    const personLinkedin = (row["Decision-maker LinkedIn URL"] || "").trim();
    const website = (row["Website"] || "").trim();
    const companyLinkedin = (row["Company LinkedIn URL"] || "").trim();
    const overview = (row["Company Overview"] || "").trim();
    const icpFit = (row["ICP Fit"] || "").trim();
    const signalType = (row["Signal Type"] || "").trim();
    const signalDetail = (row["Signal Detail"] || "").trim();
    const message = (row["First Touch Message"] || row["Adapted Message"] || "").trim();

    if (!companyName) continue;

    // Convert ICP Fit text to numeric score
    const icpScore = icpFitToScore(icpFit);

    // Create/get company
    const companyId = await getOrCreateCompany(companyName, {
      website: website || undefined,
      linkedin_url: companyLinkedin || undefined,
      description: overview || undefined,
      icp_score: icpScore || undefined,
      icp_reason: icpFit || undefined,
    });

    if (companyId) {
      // Update ICP score for existing companies that don't have one yet
      if (icpScore) {
        const { data: current } = await supabase
          .from("companies")
          .select("icp_score")
          .eq("id", companyId)
          .single();
        if (current && current.icp_score === null) {
          await supabase.from("companies").update({
            icp_score: icpScore,
            icp_reason: icpFit || null,
          }).eq("id", companyId);
          icpScored++;
          stats.companiesUpdated++;
        }
      }

      // Link to EthCC
      await linkCompanyEvent(companyId, ethccId, "target");

      // Create signal if available
      if (signalDetail && signalType) {
        await supabase.from("company_signals").insert({
          company_id: companyId,
          signal_type: signalType.toLowerCase().replace(/\s+/g, "_"),
          description: signalDetail.substring(0, 500),
          source: "jb_sheet",
        });
        stats.signalsCreated++;
      }
    }

    // Create/get contact
    if (personName) {
      const contactId = await getOrCreateContact({
        full_name: personName,
        email: personEmail || undefined,
        linkedin: personLinkedin || undefined,
        title: personTitle || undefined,
        source: "jb_sheet",
        context: icpFit ? `ICP: ${icpFit}` : undefined,
      });

      if (contactId && companyId) {
        await linkContactCompany(contactId, companyId, personTitle, undefined, "jb_sheet");
        await linkContactEvent(contactId, ethccId, "target");
        imported++;

        // Create message if exists
        if (message) {
          const channel = personLinkedin ? "linkedin" : personEmail ? "email" : null;
          if (channel) {
            await supabase.from("messages").insert({
              contact_id: contactId,
              company_id: companyId,
              event_id: ethccId,
              channel,
              sequence_number: 1,
              iteration: 1,
              body: message,
              status: "draft",
              sender_id: "a0000000-0000-0000-0000-000000000001", // JB
            });
          }
        }
      }
    }
  }
  console.log(`  Imported ${imported} contacts, scored ${icpScored} companies from JB sheet\n`);
}

// ─── 5. Import Eli sheet ────────────────────────────────────────────
async function importEliSheet() {
  console.log("5. Importing Eli sheet (companies + contacts)...");
  const rows = readCsv("app/data/matrix/base/eli-sheet.csv");
  const ethccId = "b0000000-0000-0000-0000-000000000001";
  let imported = 0;

  for (const row of rows) {
    const companyName = (row["Company Name"] || "").trim();
    const targetPerson = (row["Target Person (for contacting)"] || "").trim();
    const email = (row["Email"] || "").trim();
    const telegram = (row["Telegram"] || "").trim();
    const category = (row["Category / Sector"] || "").trim();
    const website = (row["Website / Product Link"] || "").trim();
    const whyFit = (row["Why This Is a Fit for FP Block"] || "").trim();
    const entryAngle = (row["Potential Entry Angle"] || "").trim();

    if (!companyName) continue;

    // Create/get company
    const companyId = await getOrCreateCompany(companyName, {
      website: website || undefined,
      category: category || undefined,
      description: whyFit || undefined,
    });

    if (companyId) {
      await linkCompanyEvent(companyId, ethccId, "target");
    }

    // Parse person name from "Name - Title" format
    if (targetPerson) {
      const parts = targetPerson.split(" - ");
      const personName = parts[0].trim();
      const personTitle = parts.length > 1 ? parts.slice(1).join(" - ").trim() : undefined;

      if (personName) {
        const contactId = await getOrCreateContact({
          full_name: personName,
          email: email || undefined,
          telegram: telegram || undefined,
          title: personTitle,
          source: "eli_sheet",
          context: entryAngle ? `Entry angle: ${entryAngle}` : undefined,
        });

        if (contactId && companyId) {
          await linkContactCompany(contactId, companyId, personTitle, undefined, "eli_sheet");
          await linkContactEvent(contactId, ethccId, "target");
          imported++;
        }
      }
    }
  }
  console.log(`  Imported ${imported} contacts from Eli sheet\n`);
}

// ─── 6. Import company signals from news cache ──────────────────────
async function importCompanySignals() {
  console.log("6. Importing company signals from news cache...");
  const raw = readFileSync("scraping/data/company_news_cache.json", "utf-8");
  const cache: Record<string, string> = JSON.parse(raw);
  let created = 0;

  for (const [companyName, description] of Object.entries(cache)) {
    if (!description || !companyName) continue;

    const key = normalize(companyName);
    const companyId = companyCache.get(key);
    if (!companyId) continue;

    // Check if signal already exists
    const { data: existing } = await supabase
      .from("company_signals")
      .select("id")
      .eq("company_id", companyId)
      .ilike("description", description.substring(0, 50) + "%")
      .limit(1)
      .single();

    if (existing) continue;

    const { error } = await supabase.from("company_signals").insert({
      company_id: companyId,
      signal_type: "news",
      description: description.substring(0, 1000),
      source: "company_news_cache",
    });

    if (!error) {
      created++;
      stats.signalsCreated++;
    }
  }
  console.log(`  Created ${created} new signals\n`);
}

// ─── Main ───────────────────────────────────────────────────────────
async function main() {
  await authenticate();
  await warmCaches();

  await importCompanyResearch();
  await importSponsors();
  await importDCBlockchain();
  await importJBSheet();
  await importEliSheet();
  await importCompanySignals();

  console.log("═══════════════════════════════════════");
  console.log("IMPORT COMPLETE");
  console.log("═══════════════════════════════════════");
  console.log(`  Contacts created:  ${stats.contactsCreated}`);
  console.log(`  Contacts updated:  ${stats.contactsUpdated}`);
  console.log(`  Companies created: ${stats.companiesCreated}`);
  console.log(`  Companies updated: ${stats.companiesUpdated}`);
  console.log(`  Signals created:   ${stats.signalsCreated}`);
  console.log(`  Events created:    ${stats.eventsCreated}`);
  console.log(`  Links created:     ${stats.linksCreated}`);
  console.log(`  Errors:            ${stats.errors}`);

  // Final table counts
  console.log("\nFinal table counts:");
  for (const table of ["contacts", "companies", "events", "messages", "contact_company", "contact_event", "company_event", "company_signals"]) {
    const { count } = await supabase.from(table).select("*", { count: "exact", head: true });
    console.log(`  ${table}: ${count}`);
  }
}

main().catch(console.error);
