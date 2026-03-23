#!/usr/bin/env npx tsx
/**
 * seed-crm.ts — Seed the CRM schema from fp-data-seed CSVs.
 *
 * Usage: npx tsx scripts/seed-crm.ts
 *
 * Reads 7 CSVs from fp-data-seed/ and inserts into the new CRM schema:
 *   1. Create events (EthCC 9, DC Blockchain Summit 2026)
 *   2. Import EthCC speakers → persons + orgs + event_participations
 *   3. Import EthCC sponsors → organizations + event_participations
 *   4. Import DC Blockchain speakers → persons + event_participations
 *   5. Import DC Blockchain sponsors → organizations + event_participations
 *   6. Import Genzio Sheet3 → orgs + persons + initiative + enrollments
 *   7. Import Genzio Exploration Leads (deduplicated against Sheet3)
 *   8. Import Genzio Intros Made → warm_intro interactions
 *   9. Run correlation pass
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import Papa from "papaparse";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.NEXT_SUPABASE_SECRET_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_SUPABASE_SECRET_KEY in .env.local");
  process.exit(1);
}

const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});

const BASE = path.resolve(__dirname, "../fp-data-seed");
const BATCH_SIZE = 50;

// ---------------------------------------------------------------------------
// Counters
// ---------------------------------------------------------------------------

const stats = {
  persons: 0,
  organizations: 0,
  person_organization: 0,
  event_participations: 0,
  initiatives: 0,
  initiative_enrollments: 0,
  interactions: 0,
  correlations_auto_merged: 0,
  correlations_pending: 0,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse a CSV file with papaparse. For Genzio files, auto-detect the header row. */
function parseCSV(
  filePath: string,
  opts?: { genzioFormat?: boolean }
): Record<string, string>[] {
  const raw = fs.readFileSync(filePath, "utf-8");

  if (opts?.genzioFormat) {
    // Genzio CSVs may have leading empty rows + leading empty column.
    // Find the first row with >2 non-empty fields to use as header.
    const lines = raw.split("\n");
    let headerIdx = 0;
    for (let i = 0; i < Math.min(lines.length, 20); i++) {
      const fields = lines[i].split(",");
      const nonEmpty = fields.filter((f) => f.trim().length > 0).length;
      if (nonEmpty > 2) {
        headerIdx = i;
        break;
      }
    }
    // Reconstruct CSV starting from header row
    const trimmed = lines.slice(headerIdx).join("\n");
    const result = Papa.parse<Record<string, string>>(trimmed, {
      header: true,
      skipEmptyLines: true,
    });
    // Drop columns with empty-string key (leading comma artifact)
    return result.data.map((row) => {
      const cleaned: Record<string, string> = {};
      for (const [k, v] of Object.entries(row)) {
        if (k.trim().length > 0) {
          cleaned[k] = v;
        }
      }
      return cleaned;
    });
  }

  const result = Papa.parse<Record<string, string>>(raw, {
    header: true,
    skipEmptyLines: true,
  });
  return result.data;
}

/** Split array into batches */
function batch<T>(arr: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    batches.push(arr.slice(i, i + size));
  }
  return batches;
}

/** Upsert rows in batches. Returns inserted/updated rows. */
async function batchUpsert<T extends Record<string, unknown>>(
  table: string,
  rows: T[],
  onConflict: string,
  opts?: { ignoreDuplicates?: boolean }
): Promise<T[]> {
  const all: T[] = [];
  for (const chunk of batch(rows, BATCH_SIZE)) {
    const { data, error } = await supabase
      .from(table)
      .upsert(chunk, { onConflict, ignoreDuplicates: opts?.ignoreDuplicates ?? false })
      .select();
    if (error) {
      console.error(`  Error upserting into ${table}:`, error.message);
      // Continue with other batches
    } else if (data) {
      all.push(...(data as T[]));
    }
  }
  return all;
}

/** Normalize a name to look up orgs/persons (lowercase, trimmed) */
function norm(s: string | undefined | null): string {
  return (s ?? "").trim().toLowerCase();
}

/** Clean a URL — trim whitespace */
function cleanUrl(s: string | undefined | null): string | null {
  const trimmed = (s ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Extract twitter handle from URL or raw handle */
function extractTwitter(s: string | undefined | null): string | null {
  const v = (s ?? "").trim();
  if (!v) return null;
  // Could be a full URL like https://x.com/handle or x.com/handle
  const match = v.match(/(?:x\.com|twitter\.com)\/([^\/\s?]+)/i);
  if (match) return `@${match[1].replace(/^@/, "")}`;
  if (v.startsWith("@")) return v;
  return null;
}

/** Extract linkedin URL — normalize to full URL */
function extractLinkedin(s: string | undefined | null): string | null {
  const v = (s ?? "").trim();
  if (!v) return null;
  if (v.includes("linkedin.com")) {
    return v.startsWith("http") ? v : `https://${v}`;
  }
  return null;
}

/** Split a "Name - Title" string into name and role parts */
function parseTargetPerson(s: string | undefined | null): { name: string; role: string | null } | null {
  const v = (s ?? "").trim();
  if (!v) return null;
  const dashIdx = v.lastIndexOf(" - ");
  if (dashIdx > 0) {
    return { name: v.slice(0, dashIdx).trim(), role: v.slice(dashIdx + 3).trim() };
  }
  return { name: v, role: null };
}

/** Split a full name into first/last */
function splitName(fullName: string): { first: string | null; last: string | null } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 0) return { first: null, last: null };
  if (parts.length === 1) return { first: parts[0], last: null };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

/** Map tier string to the sponsor_tier enum value */
function normalizeTier(tier: string): string | null {
  const t = tier.trim().toLowerCase().replace(/\s+/g, "_");
  const map: Record<string, string> = {
    presented_by: "presented_by",
    platinum: "platinum",
    diamond: "diamond",
    emerald: "emerald",
    gold: "gold",
    silver: "silver",
    bronze: "bronze",
    copper: "copper",
    community_partners: "community",
    community: "community",
  };
  return map[t] ?? t;
}

/** Check if a row is entirely empty/whitespace */
function isEmptyRow(row: Record<string, string>): boolean {
  return Object.values(row).every((v) => (v ?? "").trim() === "");
}

// ---------------------------------------------------------------------------
// In-memory lookup caches (name → id)
// ---------------------------------------------------------------------------

const orgCache = new Map<string, string>(); // norm(name) → org id
const personCache = new Map<string, string>(); // norm(name) → person id

// ---------------------------------------------------------------------------
// Main import functions
// ---------------------------------------------------------------------------

async function createEvents() {
  console.log("\n=== Creating Events ===");

  const events = [
    {
      name: "EthCC 9",
      slug: "ethcc-9",
      location: "Cannes, France",
      date_start: "2026-06-30",
      date_end: "2026-07-02",
      website: "https://ethcc.io",
      event_type: "conference",
    },
    {
      name: "DC Blockchain Summit 2026",
      slug: "dc-blockchain-2026",
      location: "Washington, DC",
      date_start: "2026-05-19",
      date_end: "2026-05-21",
      website: "https://dcblockchainsummit.com",
      event_type: "conference",
    },
  ];

  const { data, error } = await supabase
    .from("events_new")
    .upsert(events, { onConflict: "slug" })
    .select();

  if (error) {
    console.error("Error creating events:", error.message);
    return {};
  }

  const eventMap: Record<string, string> = {};
  for (const e of data ?? []) {
    eventMap[e.slug] = e.id;
    console.log(`  Created event: ${e.name} (${e.id})`);
  }
  return eventMap;
}

async function importEthCCSpeakers(eventId: string) {
  console.log("\n=== Importing EthCC Speakers ===");
  const rows = parseCSV(path.join(BASE, "EthCC/ethcc9_speakers.csv"));
  console.log(`  Parsed ${rows.length} rows`);

  // Build persons and orgs
  const personRows: Record<string, unknown>[] = [];
  const orgRows: Record<string, unknown>[] = [];
  const linkRows: { personName: string; orgName: string; track: string | null; talkTitle: string | null; twitter: string | null; linkedin: string | null; photoUrl: string | null }[] = [];

  for (const row of rows) {
    if (isEmptyRow(row)) continue;
    const displayName = (row.displayName ?? "").trim();
    if (!displayName) continue;

    const orgName = (row.organization ?? "").trim();
    const { first, last } = splitName(displayName);
    const twitter = extractTwitter(row.twitter);
    const linkedin = extractLinkedin(row.linkedin);

    personRows.push({
      full_name: displayName,
      first_name: first,
      last_name: last,
      twitter_handle: twitter,
      linkedin_url: linkedin,
      photo_url: cleanUrl(row.pfp),
      source: "ethcc-9-speakers",
    });

    if (orgName) {
      orgRows.push({
        name: orgName,
      });
    }

    linkRows.push({
      personName: displayName,
      orgName,
      track: (row.trackSlug ?? "").trim() || null,
      talkTitle: null,
      twitter,
      linkedin,
      photoUrl: cleanUrl(row.pfp),
    });
  }

  // Deduplicate orgs by name
  const uniqueOrgs = new Map<string, Record<string, unknown>>();
  for (const o of orgRows) {
    const key = norm(o.name as string);
    if (!uniqueOrgs.has(key)) uniqueOrgs.set(key, o);
  }

  // Upsert orgs
  const orgArray = Array.from(uniqueOrgs.values());
  if (orgArray.length > 0) {
    const inserted = await batchUpsert("organizations", orgArray, "name");
    for (const o of inserted) {
      orgCache.set(norm((o as any).name), (o as any).id);
    }
    stats.organizations += inserted.length;
    console.log(`  Upserted ${inserted.length} organizations`);
  }

  // Upsert persons (use full_name + source as de-dup strategy)
  // Since there's no unique constraint on full_name, insert and track
  const insertedPersons: any[] = [];
  for (const chunk of batch(personRows, BATCH_SIZE)) {
    const { data, error } = await supabase.from("persons").insert(chunk).select();
    if (error) {
      console.error("  Error inserting persons:", error.message);
    } else if (data) {
      insertedPersons.push(...data);
    }
  }
  for (const p of insertedPersons) {
    personCache.set(norm(p.full_name), p.id);
  }
  stats.persons += insertedPersons.length;
  console.log(`  Inserted ${insertedPersons.length} persons`);

  // Create person_organization links
  const poRows: Record<string, unknown>[] = [];
  for (const link of linkRows) {
    const personId = personCache.get(norm(link.personName));
    const orgId = link.orgName ? orgCache.get(norm(link.orgName)) : null;
    if (personId && orgId) {
      poRows.push({
        person_id: personId,
        organization_id: orgId,
        is_current: true,
        is_primary: true,
        source: "ethcc-9-speakers",
      });
    }
  }
  if (poRows.length > 0) {
    const inserted = await batchUpsert("person_organization", poRows, "person_id,organization_id", { ignoreDuplicates: true });
    stats.person_organization += inserted.length;
    console.log(`  Created ${inserted.length} person-org links`);
  }

  // Create event_participations for speakers
  const epRows: Record<string, unknown>[] = [];
  for (const link of linkRows) {
    const personId = personCache.get(norm(link.personName));
    if (personId) {
      epRows.push({
        event_id: eventId,
        person_id: personId,
        role: "speaker",
        track: link.track,
        confirmed: true,
      });
    }
  }
  if (epRows.length > 0) {
    const inserted = await batchUpsert("event_participations", epRows, "event_id,person_id,role", { ignoreDuplicates: true });
    stats.event_participations += inserted.length;
    console.log(`  Created ${inserted.length} event participations`);
  }
}

async function importEthCCSponsors(eventId: string) {
  console.log("\n=== Importing EthCC Sponsors ===");
  const rows = parseCSV(path.join(BASE, "EthCC/ethcc9_sponsors.csv"));

  // Filter to EthCC[9] edition only
  const filtered = rows.filter((r) => {
    const edition = (r.edition ?? "").trim();
    return edition === "EthCC[9]";
  });
  console.log(`  Parsed ${rows.length} rows, ${filtered.length} are EthCC[9]`);

  const orgRows: Record<string, unknown>[] = [];
  const epRows: { orgName: string; tier: string }[] = [];

  for (const row of filtered) {
    if (isEmptyRow(row)) continue;
    const name = (row.name ?? "").trim();
    if (!name) continue;

    orgRows.push({
      name,
      website: cleanUrl(row.website),
      logo_url: cleanUrl(row.logo_url),
      description: (row.description ?? "").trim() || null,
    });

    epRows.push({
      orgName: name,
      tier: row.tier ?? "",
    });
  }

  // Deduplicate
  const uniqueOrgs = new Map<string, Record<string, unknown>>();
  for (const o of orgRows) {
    const key = norm(o.name as string);
    if (!uniqueOrgs.has(key)) uniqueOrgs.set(key, o);
  }

  const orgArray = Array.from(uniqueOrgs.values());
  if (orgArray.length > 0) {
    const inserted = await batchUpsert("organizations", orgArray, "name");
    for (const o of inserted) {
      orgCache.set(norm((o as any).name), (o as any).id);
    }
    stats.organizations += inserted.length;
    console.log(`  Upserted ${inserted.length} organizations`);
  }

  // Event participations for sponsors
  const participations: Record<string, unknown>[] = [];
  for (const ep of epRows) {
    const orgId = orgCache.get(norm(ep.orgName));
    if (orgId) {
      participations.push({
        event_id: eventId,
        organization_id: orgId,
        role: "sponsor",
        sponsor_tier: normalizeTier(ep.tier),
        confirmed: true,
      });
    }
  }
  if (participations.length > 0) {
    const inserted = await batchUpsert("event_participations", participations, "event_id,organization_id,role", { ignoreDuplicates: true });
    stats.event_participations += inserted.length;
    console.log(`  Created ${inserted.length} sponsor participations`);
  }
}

async function importDCSpeakers(eventId: string) {
  console.log("\n=== Importing DC Blockchain Speakers ===");
  const rows = parseCSV(path.join(BASE, "DC-blockchain/dcbs2026_speakers.csv"));
  console.log(`  Parsed ${rows.length} rows`);

  const personRows: Record<string, unknown>[] = [];
  const linkRows: { personName: string; orgName: string | null; category: string | null }[] = [];

  for (const row of rows) {
    if (isEmptyRow(row)) continue;
    const name = (row.name ?? "").trim();
    if (!name) continue;

    // Parse org from title field — split on comma, take last part
    const title = (row.title ?? "").trim();
    let orgName: string | null = null;
    let personTitle: string | null = title || null;

    if (title.includes(",")) {
      const parts = title.split(",");
      orgName = parts[parts.length - 1].trim();
      personTitle = parts.slice(0, -1).join(",").trim();
    }

    const { first, last } = splitName(name);

    personRows.push({
      full_name: name,
      first_name: first,
      last_name: last,
      title: personTitle,
      photo_url: cleanUrl(row.photoUrl),
      source: "dc-blockchain-2026-speakers",
    });

    linkRows.push({
      personName: name,
      orgName,
      category: (row.category ?? "").trim() || null,
    });
  }

  // Collect unique orgs
  const uniqueOrgs = new Map<string, Record<string, unknown>>();
  for (const link of linkRows) {
    if (link.orgName && !uniqueOrgs.has(norm(link.orgName))) {
      uniqueOrgs.set(norm(link.orgName), {
        name: link.orgName,
        category: link.category,
      });
    }
  }

  const orgArray = Array.from(uniqueOrgs.values());
  if (orgArray.length > 0) {
    const inserted = await batchUpsert("organizations", orgArray, "name");
    for (const o of inserted) {
      orgCache.set(norm((o as any).name), (o as any).id);
    }
    stats.organizations += inserted.length;
    console.log(`  Upserted ${inserted.length} organizations`);
  }

  // Insert persons
  const insertedPersons: any[] = [];
  for (const chunk of batch(personRows, BATCH_SIZE)) {
    const { data, error } = await supabase.from("persons").insert(chunk).select();
    if (error) {
      console.error("  Error inserting persons:", error.message);
    } else if (data) {
      insertedPersons.push(...data);
    }
  }
  for (const p of insertedPersons) {
    personCache.set(norm(p.full_name), p.id);
  }
  stats.persons += insertedPersons.length;
  console.log(`  Inserted ${insertedPersons.length} persons`);

  // Person-org links
  const poRows: Record<string, unknown>[] = [];
  for (const link of linkRows) {
    const personId = personCache.get(norm(link.personName));
    const orgId = link.orgName ? orgCache.get(norm(link.orgName)) : null;
    if (personId && orgId) {
      poRows.push({
        person_id: personId,
        organization_id: orgId,
        is_current: true,
        is_primary: true,
        source: "dc-blockchain-2026-speakers",
      });
    }
  }
  if (poRows.length > 0) {
    const inserted = await batchUpsert("person_organization", poRows, "person_id,organization_id", { ignoreDuplicates: true });
    stats.person_organization += inserted.length;
    console.log(`  Created ${inserted.length} person-org links`);
  }

  // Event participations
  const epRows: Record<string, unknown>[] = [];
  for (const link of linkRows) {
    const personId = personCache.get(norm(link.personName));
    if (personId) {
      epRows.push({
        event_id: eventId,
        person_id: personId,
        role: "speaker",
        confirmed: true,
      });
    }
  }
  if (epRows.length > 0) {
    const inserted = await batchUpsert("event_participations", epRows, "event_id,person_id,role", { ignoreDuplicates: true });
    stats.event_participations += inserted.length;
    console.log(`  Created ${inserted.length} event participations`);
  }
}

async function importDCSponsors(eventId: string) {
  console.log("\n=== Importing DC Blockchain Sponsors ===");
  const rows = parseCSV(path.join(BASE, "DC-blockchain/dcbs2026_sponsors.csv"));
  console.log(`  Parsed ${rows.length} rows`);

  const orgRows: Record<string, unknown>[] = [];
  const epRows: { orgName: string; tier: string }[] = [];

  for (const row of rows) {
    if (isEmptyRow(row)) continue;
    const name = (row.name ?? "").trim();
    if (!name) continue;

    orgRows.push({
      name,
      website: cleanUrl(row.website),
      logo_url: cleanUrl(row.logoUrl),
    });

    epRows.push({
      orgName: name,
      tier: row.tier ?? "",
    });
  }

  // Deduplicate
  const uniqueOrgs = new Map<string, Record<string, unknown>>();
  for (const o of orgRows) {
    const key = norm(o.name as string);
    if (!uniqueOrgs.has(key)) uniqueOrgs.set(key, o);
  }

  const orgArray = Array.from(uniqueOrgs.values());
  if (orgArray.length > 0) {
    const inserted = await batchUpsert("organizations", orgArray, "name");
    for (const o of inserted) {
      orgCache.set(norm((o as any).name), (o as any).id);
    }
    stats.organizations += inserted.length;
    console.log(`  Upserted ${inserted.length} organizations`);
  }

  // Event participations
  const participations: Record<string, unknown>[] = [];
  for (const ep of epRows) {
    const orgId = orgCache.get(norm(ep.orgName));
    if (orgId) {
      participations.push({
        event_id: eventId,
        organization_id: orgId,
        role: "sponsor",
        sponsor_tier: normalizeTier(ep.tier),
        confirmed: true,
      });
    }
  }
  if (participations.length > 0) {
    const inserted = await batchUpsert("event_participations", participations, "event_id,organization_id,role", { ignoreDuplicates: true });
    stats.event_participations += inserted.length;
    console.log(`  Created ${inserted.length} sponsor participations`);
  }
}

async function importGenzioSheet3(initiativeId: string): Promise<Set<string>> {
  console.log("\n=== Importing Genzio Sheet3 ===");
  // Sheet3 does NOT have leading empty rows (header is line 1)
  const rows = parseCSV(path.join(BASE, "Genzio/FP Block Leads - Sheet3.csv"));
  console.log(`  Parsed ${rows.length} rows`);

  const importedCompanies = new Set<string>();

  const orgRows: Record<string, unknown>[] = [];
  const personLinks: {
    orgName: string;
    personName: string | null;
    personRole: string | null;
    email: string | null;
    telegram: string | null;
    priority: string | null;
  }[] = [];

  for (const row of rows) {
    if (isEmptyRow(row)) continue;
    const companyName = (row["Company Name"] ?? "").trim();
    if (!companyName) continue;

    importedCompanies.add(norm(companyName));

    orgRows.push({
      name: companyName,
      website: cleanUrl(row["Website / Product Link"]),
      category: (row["Category / Sector"] ?? "").trim() || null,
      context: (row["Why This Is a Fit for FP Block"] ?? "").trim() || null,
      usp: (row["Potential Entry Angle"] ?? "").trim() || null,
    });

    const targetPerson = parseTargetPerson(row["Target Person (for contacting)"]);
    const email = (row["Email"] ?? "").trim() || null;
    const telegram = (row["Telegram"] ?? "").trim() || null;

    personLinks.push({
      orgName: companyName,
      personName: targetPerson?.name ?? null,
      personRole: targetPerson?.role ?? null,
      email,
      telegram,
      priority: (row["Priority"] ?? "").trim() || null,
    });
  }

  // Deduplicate orgs
  const uniqueOrgs = new Map<string, Record<string, unknown>>();
  for (const o of orgRows) {
    const key = norm(o.name as string);
    if (!uniqueOrgs.has(key)) uniqueOrgs.set(key, o);
  }

  const orgArray = Array.from(uniqueOrgs.values());
  if (orgArray.length > 0) {
    const inserted = await batchUpsert("organizations", orgArray, "name");
    for (const o of inserted) {
      orgCache.set(norm((o as any).name), (o as any).id);
    }
    stats.organizations += inserted.length;
    console.log(`  Upserted ${inserted.length} organizations`);
  }

  // Create persons for each row that has a target person
  const personRows: Record<string, unknown>[] = [];
  const personMeta: { personName: string; orgName: string; role: string | null; priority: string | null }[] = [];
  for (const link of personLinks) {
    if (!link.personName) continue;
    const { first, last } = splitName(link.personName);
    personRows.push({
      full_name: link.personName,
      first_name: first,
      last_name: last,
      email: link.email,
      telegram_handle: link.telegram,
      source: "genzio-sheet3",
    });
    personMeta.push({
      personName: link.personName,
      orgName: link.orgName,
      role: link.personRole,
      priority: link.priority,
    });
  }

  const insertedPersons: any[] = [];
  for (const chunk of batch(personRows, BATCH_SIZE)) {
    const { data, error } = await supabase.from("persons").insert(chunk).select();
    if (error) {
      console.error("  Error inserting persons:", error.message);
    } else if (data) {
      insertedPersons.push(...data);
    }
  }
  // Map inserted persons back to their metadata by index
  for (let i = 0; i < insertedPersons.length; i++) {
    personCache.set(norm(insertedPersons[i].full_name), insertedPersons[i].id);
  }
  stats.persons += insertedPersons.length;
  console.log(`  Inserted ${insertedPersons.length} persons`);

  // Person-org links
  const poRows: Record<string, unknown>[] = [];
  for (const meta of personMeta) {
    const personId = personCache.get(norm(meta.personName));
    const orgId = orgCache.get(norm(meta.orgName));
    if (personId && orgId) {
      poRows.push({
        person_id: personId,
        organization_id: orgId,
        role: meta.role,
        is_current: true,
        is_primary: true,
        source: "genzio-sheet3",
      });
    }
  }
  if (poRows.length > 0) {
    const inserted = await batchUpsert("person_organization", poRows, "person_id,organization_id", { ignoreDuplicates: true });
    stats.person_organization += inserted.length;
    console.log(`  Created ${inserted.length} person-org links`);
  }

  // Initiative enrollments — enroll each org
  const enrollRows: Record<string, unknown>[] = [];
  for (const meta of personMeta) {
    const orgId = orgCache.get(norm(meta.orgName));
    if (orgId) {
      enrollRows.push({
        initiative_id: initiativeId,
        organization_id: orgId,
        status: "active",
        priority: meta.priority?.toLowerCase() || "low",
      });
    }
  }

  // Deduplicate by org id
  const seenOrgs = new Set<string>();
  const dedupedEnrollRows = enrollRows.filter((r) => {
    const orgId = r.organization_id as string;
    if (seenOrgs.has(orgId)) return false;
    seenOrgs.add(orgId);
    return true;
  });

  if (dedupedEnrollRows.length > 0) {
    const inserted = await batchUpsert("initiative_enrollments", dedupedEnrollRows, "initiative_id,organization_id", { ignoreDuplicates: true });
    stats.initiative_enrollments += inserted.length;
    console.log(`  Created ${inserted.length} initiative enrollments`);
  }

  return importedCompanies;
}

async function importGenzioExplorationLeads(
  initiativeId: string,
  importedFromSheet3: Set<string>
) {
  console.log("\n=== Importing Genzio Exploration Leads (deduplicated) ===");
  const rows = parseCSV(
    path.join(BASE, "Genzio/FP Block Leads - Exploration Leads.csv"),
    { genzioFormat: true }
  );
  console.log(`  Parsed ${rows.length} rows from Exploration Leads`);

  // Filter out rows already imported from Sheet3
  const newRows = rows.filter((row) => {
    const companyName = (row["Company Name"] ?? "").trim();
    return companyName && !importedFromSheet3.has(norm(companyName));
  });
  console.log(`  ${newRows.length} new rows after deduplication against Sheet3`);

  if (newRows.length === 0) {
    console.log("  No new rows to import from Exploration Leads.");
    return;
  }

  const orgRows: Record<string, unknown>[] = [];
  const personLinks: {
    orgName: string;
    personName: string | null;
    personRole: string | null;
    email: string | null;
    telegram: string | null;
    priority: string | null;
  }[] = [];

  for (const row of newRows) {
    if (isEmptyRow(row)) continue;
    const companyName = (row["Company Name"] ?? "").trim();
    if (!companyName) continue;

    orgRows.push({
      name: companyName,
      website: cleanUrl(row["Website / Product Link"]),
      category: (row["Category / Sector"] ?? "").trim() || null,
      context: (row["Why This Is a Fit for FP Block"] ?? "").trim() || null,
      usp: (row["Potential Entry Angle"] ?? "").trim() || null,
    });

    const targetPerson = parseTargetPerson(row["Target Person (for contacting)"]);
    personLinks.push({
      orgName: companyName,
      personName: targetPerson?.name ?? null,
      personRole: targetPerson?.role ?? null,
      email: (row["Email"] ?? "").trim() || null,
      telegram: (row["Telegram"] ?? "").trim() || null,
      priority: (row["Priority"] ?? "").trim() || null,
    });
  }

  // Deduplicate orgs
  const uniqueOrgs = new Map<string, Record<string, unknown>>();
  for (const o of orgRows) {
    const key = norm(o.name as string);
    if (!uniqueOrgs.has(key)) uniqueOrgs.set(key, o);
  }

  const orgArray = Array.from(uniqueOrgs.values());
  if (orgArray.length > 0) {
    const inserted = await batchUpsert("organizations", orgArray, "name");
    for (const o of inserted) {
      orgCache.set(norm((o as any).name), (o as any).id);
    }
    stats.organizations += inserted.length;
    console.log(`  Upserted ${inserted.length} organizations`);
  }

  // Create persons
  const personRows: Record<string, unknown>[] = [];
  const personMeta: { personName: string; orgName: string; role: string | null; priority: string | null }[] = [];
  for (const link of personLinks) {
    if (!link.personName) continue;
    const { first, last } = splitName(link.personName);
    personRows.push({
      full_name: link.personName,
      first_name: first,
      last_name: last,
      email: link.email,
      telegram_handle: link.telegram,
      source: "genzio-exploration-leads",
    });
    personMeta.push({
      personName: link.personName,
      orgName: link.orgName,
      role: link.personRole,
      priority: link.priority,
    });
  }

  const insertedPersons: any[] = [];
  for (const chunk of batch(personRows, BATCH_SIZE)) {
    const { data, error } = await supabase.from("persons").insert(chunk).select();
    if (error) {
      console.error("  Error inserting persons:", error.message);
    } else if (data) {
      insertedPersons.push(...data);
    }
  }
  for (const p of insertedPersons) {
    personCache.set(norm(p.full_name), p.id);
  }
  stats.persons += insertedPersons.length;
  console.log(`  Inserted ${insertedPersons.length} persons`);

  // Person-org links
  const poRows: Record<string, unknown>[] = [];
  for (const meta of personMeta) {
    const personId = personCache.get(norm(meta.personName));
    const orgId = orgCache.get(norm(meta.orgName));
    if (personId && orgId) {
      poRows.push({
        person_id: personId,
        organization_id: orgId,
        role: meta.role,
        is_current: true,
        is_primary: true,
        source: "genzio-exploration-leads",
      });
    }
  }
  if (poRows.length > 0) {
    const inserted = await batchUpsert("person_organization", poRows, "person_id,organization_id", { ignoreDuplicates: true });
    stats.person_organization += inserted.length;
    console.log(`  Created ${inserted.length} person-org links`);
  }

  // Initiative enrollments
  const enrollRows: Record<string, unknown>[] = [];
  const seenOrgs = new Set<string>();
  for (const meta of personMeta) {
    const orgId = orgCache.get(norm(meta.orgName));
    if (orgId && !seenOrgs.has(orgId)) {
      seenOrgs.add(orgId);
      enrollRows.push({
        initiative_id: initiativeId,
        organization_id: orgId,
        status: "active",
        priority: meta.priority?.toLowerCase() || "low",
      });
    }
  }
  if (enrollRows.length > 0) {
    const inserted = await batchUpsert("initiative_enrollments", enrollRows, "initiative_id,organization_id", { ignoreDuplicates: true });
    stats.initiative_enrollments += inserted.length;
    console.log(`  Created ${inserted.length} initiative enrollments`);
  }
}

async function importGenzioIntrosMade() {
  console.log("\n=== Importing Genzio Intros Made ===");
  const rows = parseCSV(
    path.join(BASE, "Genzio/FP Block Leads - Intros Made.csv"),
    { genzioFormat: true }
  );
  console.log(`  Parsed ${rows.length} rows`);

  let created = 0;
  for (const row of rows) {
    if (isEmptyRow(row)) continue;
    const companyName = (row["Company Name"] ?? "").trim();
    if (!companyName) continue;

    const introducer = (row["Introducer (Genzio Contact)"] ?? "").trim() || null;
    const orgId = orgCache.get(norm(companyName));

    if (!orgId) {
      // Create the org if it doesn't exist yet
      const { data, error } = await supabase
        .from("organizations")
        .upsert({ name: companyName }, { onConflict: "name" })
        .select()
        .single();
      if (error) {
        console.error(`  Error creating org for intro: ${companyName}`, error.message);
        continue;
      }
      orgCache.set(norm(companyName), data.id);
    }

    const finalOrgId = orgCache.get(norm(companyName));

    // Create a warm_intro interaction
    const { error } = await supabase.from("interactions").insert({
      organization_id: finalOrgId,
      interaction_type: "warm_intro",
      direction: "outbound",
      status: "sent",
      detail: { introducer },
      occurred_at: new Date().toISOString(),
    });

    if (error) {
      console.error(`  Error creating interaction for ${companyName}:`, error.message);
    } else {
      created++;
    }
  }

  stats.interactions += created;
  console.log(`  Created ${created} warm_intro interactions`);
}

async function runCorrelationPass() {
  console.log("\n=== Running Correlation Pass ===");

  // Get all persons
  const { data: persons, error: pErr } = await supabase
    .from("persons")
    .select("id")
    .order("created_at");

  if (pErr || !persons) {
    console.error("  Error fetching persons for correlation:", pErr?.message);
    return;
  }

  console.log(`  Checking ${persons.length} persons for correlations...`);
  let personProgress = 0;
  for (const person of persons) {
    try {
      const { data, error } = await supabase.rpc("find_person_correlations", {
        p_person_id: person.id,
      });

      if (error) {
        // RPC may not exist yet — log and skip
        if (personProgress === 0) {
          console.warn(`  Warning: find_person_correlations RPC failed: ${error.message}`);
          console.warn("  Skipping person correlation pass (RPC may not be deployed yet).");
        }
        break;
      }

      if (data && Array.isArray(data)) {
        for (const candidate of data) {
          if (candidate.confidence >= 0.95) {
            // Auto-merge
            const { error: mergeErr } = await supabase.rpc("merge_persons", {
              p_keep_id: person.id,
              p_merge_id: candidate.target_id,
            });
            if (!mergeErr) stats.correlations_auto_merged++;
          } else if (candidate.confidence >= 0.6) {
            // Insert as pending candidate
            const { error: insertErr } = await supabase
              .from("correlation_candidates")
              .insert({
                entity_type: "person",
                source_id: person.id,
                target_id: candidate.target_id,
                confidence: candidate.confidence,
                match_reasons: candidate.match_reasons,
                status: "pending",
              });
            if (!insertErr) stats.correlations_pending++;
          }
        }
      }
    } catch (e) {
      // Swallow — RPC not available
      if (personProgress === 0) {
        console.warn("  Correlation RPC not available, skipping.");
      }
      break;
    }

    personProgress++;
    if (personProgress % 50 === 0) {
      console.log(`  Processed ${personProgress}/${persons.length} persons`);
    }
  }

  // Get all orgs
  const { data: orgs, error: oErr } = await supabase
    .from("organizations")
    .select("id")
    .order("created_at");

  if (oErr || !orgs) {
    console.error("  Error fetching orgs for correlation:", oErr?.message);
    return;
  }

  console.log(`  Checking ${orgs.length} organizations for correlations...`);
  let orgProgress = 0;
  for (const org of orgs) {
    try {
      const { data, error } = await supabase.rpc("find_org_correlations", {
        p_org_id: org.id,
      });

      if (error) {
        if (orgProgress === 0) {
          console.warn(`  Warning: find_org_correlations RPC failed: ${error.message}`);
          console.warn("  Skipping org correlation pass (RPC may not be deployed yet).");
        }
        break;
      }

      if (data && Array.isArray(data)) {
        for (const candidate of data) {
          if (candidate.confidence >= 0.95) {
            const { error: mergeErr } = await supabase.rpc("merge_organizations", {
              p_keep_id: org.id,
              p_merge_id: candidate.target_id,
            });
            if (!mergeErr) stats.correlations_auto_merged++;
          } else if (candidate.confidence >= 0.6) {
            const { error: insertErr } = await supabase
              .from("correlation_candidates")
              .insert({
                entity_type: "organization",
                source_id: org.id,
                target_id: candidate.target_id,
                confidence: candidate.confidence,
                match_reasons: candidate.match_reasons,
                status: "pending",
              });
            if (!insertErr) stats.correlations_pending++;
          }
        }
      }
    } catch (e) {
      if (orgProgress === 0) {
        console.warn("  Correlation RPC not available, skipping.");
      }
      break;
    }

    orgProgress++;
    if (orgProgress % 50 === 0) {
      console.log(`  Processed ${orgProgress}/${orgs.length} organizations`);
    }
  }

  console.log(`  Auto-merged: ${stats.correlations_auto_merged}, Pending review: ${stats.correlations_pending}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("=== CRM Data Seeding Script ===");
  console.log(`Supabase URL: ${SUPABASE_URL}`);
  console.log(`Base path: ${BASE}`);

  // 1. Create events
  const eventMap = await createEvents();
  const ethccId = eventMap["ethcc-9"];
  const dcId = eventMap["dc-blockchain-2026"];

  if (!ethccId || !dcId) {
    console.error("Failed to create events. Aborting.");
    process.exit(1);
  }

  // 2. Import EthCC speakers
  await importEthCCSpeakers(ethccId);

  // 3. Import EthCC sponsors
  await importEthCCSponsors(ethccId);

  // 4. Import DC Blockchain speakers
  await importDCSpeakers(dcId);

  // 5. Import DC Blockchain sponsors
  await importDCSponsors(dcId);

  // 6. Create "FP Block Partnerships" initiative
  console.log("\n=== Creating Initiative ===");
  const { data: initiative, error: initErr } = await supabase
    .from("initiatives")
    .upsert(
      {
        name: "FP Block Partnerships",
        initiative_type: "outreach",
        status: "active",
        owner: "Genzio",
        notes: "Imported from Genzio FP Block Leads spreadsheet",
      },
      { onConflict: "name" }
    )
    .select()
    .single();

  if (initErr || !initiative) {
    console.error("Error creating initiative:", initErr?.message);
    // Try without onConflict since there may not be a unique constraint
    const { data: initFallback, error: initErr2 } = await supabase
      .from("initiatives")
      .insert({
        name: "FP Block Partnerships",
        initiative_type: "outreach",
        status: "active",
        owner: "Genzio",
        notes: "Imported from Genzio FP Block Leads spreadsheet",
      })
      .select()
      .single();

    if (initErr2 || !initFallback) {
      console.error("Failed to create initiative:", initErr2?.message);
      process.exit(1);
    }

    stats.initiatives++;
    console.log(`  Created initiative: ${initFallback.name} (${initFallback.id})`);

    // 7. Import Genzio Sheet3
    const importedCompanies = await importGenzioSheet3(initFallback.id);

    // 8. Import Genzio Exploration Leads (deduplicated)
    await importGenzioExplorationLeads(initFallback.id, importedCompanies);

    // 9. Import Genzio Intros Made
    await importGenzioIntrosMade();

    // 10. Correlation pass
    await runCorrelationPass();
  } else {
    stats.initiatives++;
    console.log(`  Created initiative: ${initiative.name} (${initiative.id})`);

    // 7. Import Genzio Sheet3
    const importedCompanies = await importGenzioSheet3(initiative.id);

    // 8. Import Genzio Exploration Leads (deduplicated)
    await importGenzioExplorationLeads(initiative.id, importedCompanies);

    // 9. Import Genzio Intros Made
    await importGenzioIntrosMade();

    // 10. Correlation pass
    await runCorrelationPass();
  }

  // Final summary
  console.log("\n=== Seeding Complete ===");
  console.log(`  Persons:                 ${stats.persons}`);
  console.log(`  Organizations:           ${stats.organizations}`);
  console.log(`  Person-Org links:        ${stats.person_organization}`);
  console.log(`  Event participations:    ${stats.event_participations}`);
  console.log(`  Initiatives:             ${stats.initiatives}`);
  console.log(`  Initiative enrollments:  ${stats.initiative_enrollments}`);
  console.log(`  Interactions:            ${stats.interactions}`);
  console.log(`  Correlations merged:     ${stats.correlations_auto_merged}`);
  console.log(`  Correlations pending:    ${stats.correlations_pending}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
