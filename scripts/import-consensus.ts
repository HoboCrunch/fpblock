import { createClient } from "@supabase/supabase-js";
import { parse } from "csv-parse/sync";
import { readFileSync } from "fs";
import { config } from "dotenv";

config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_SUPABASE_SECRET_KEY!
);

const EVENT_NAME = "Consensus";
const EVENT_SLUG = "consensus";
const SOURCE_TAG = "consensus_import";

const TIER_MAP: Record<string, string> = {
  "5 Block": "platinum",
  "4 Block": "gold",
  "3 Block": "silver",
  "2 Block": "bronze",
  "1 Block": "copper",
};

type CompanyRow = {
  record_type: string;
  name: string;
  sponsor_tier: string;
  sponsor_tier_label: string;
  website: string;
  twitter: string;
  linkedin: string;
  profile_url: string;
};

type SpeakerRow = {
  record_type: string;
  name: string;
  title: string;
  company: string;
  title_secondary: string;
  company_secondary: string;
  is_virtual_speaker: string;
  twitter: string;
  linkedin: string;
  website: string;
  profile_url: string;
};

function readCsv<T>(path: string): T[] {
  return parse(readFileSync(path, "utf-8"), {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    trim: true,
  });
}

function nz(s: string | undefined | null): string | null {
  if (!s) return null;
  const t = s.trim();
  return t === "" ? null : t;
}

function normalizeTwitter(s: string | null): string | null {
  if (!s) return null;
  let t = s.trim();
  if (!t) return null;
  // strip URL prefix
  t = t.replace(/^https?:\/\/(www\.)?(x\.com|twitter\.com)\//i, "");
  t = t.replace(/\?.*$/, "").replace(/\/$/, "");
  t = t.replace(/^@/, "");
  if (t.includes("/") || t.includes(" ")) return null; // not a clean handle
  return t || null;
}

function normalizeLinkedin(s: string | null): string | null {
  if (!s) return null;
  let t = s.trim();
  if (!t) return null;
  if (!/^https?:\/\//i.test(t)) {
    if (/^linkedin\.com|^www\.linkedin\.com/i.test(t)) {
      t = "https://" + t;
    } else if (/^[a-z0-9-]+$/i.test(t)) {
      // looks like a handle
      t = `https://www.linkedin.com/in/${t}`;
    } else {
      return null; // unusable value
    }
  }
  return t;
}

function normalizeWebsite(s: string | null): string | null {
  if (!s) return null;
  let t = s.trim();
  if (!t) return null;
  if (!/^https?:\/\//i.test(t)) t = "https://" + t;
  return t;
}

function splitName(full: string): { first: string | null; last: string | null } {
  const parts = full
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(Dr\.|Mr\.|Ms\.|Mrs\.|Rep\.|Sen\.|Senator)\s+/i, "")
    .split(" ");
  if (parts.length === 0) return { first: null, last: null };
  if (parts.length === 1) return { first: parts[0], last: null };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

async function resolveEvent(): Promise<string> {
  const { data: existing } = await supabase
    .from("events")
    .select("id")
    .eq("slug", EVENT_SLUG)
    .maybeSingle();
  if (existing?.id) {
    console.log(`✓ Event '${EVENT_NAME}' already exists: ${existing.id}`);
    return existing.id;
  }
  const { data, error } = await supabase
    .from("events")
    .insert({
      name: EVENT_NAME,
      slug: EVENT_SLUG,
      event_type: "conference",
      website: "https://consensus.coindesk.com",
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`Failed to create event: ${error?.message}`);
  console.log(`+ Created event '${EVENT_NAME}': ${data.id}`);
  return data.id;
}

const orgCache = new Map<string, string>(); // lowercased name → id

async function upsertOrganization(
  name: string,
  fields: {
    website?: string | null;
    linkedin_url?: string | null;
    category?: string | null;
  } = {}
): Promise<string> {
  const key = name.toLowerCase().trim();
  if (orgCache.has(key)) return orgCache.get(key)!;

  const { data: existing } = await supabase
    .from("organizations")
    .select("id, website, linkedin_url, category")
    .ilike("name", name.trim())
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    orgCache.set(key, existing.id);
    const update: Record<string, string | null> = {};
    if (!existing.website && fields.website) update.website = fields.website;
    if (!existing.linkedin_url && fields.linkedin_url) update.linkedin_url = fields.linkedin_url;
    if (!existing.category && fields.category) update.category = fields.category;
    if (Object.keys(update).length > 0) {
      await supabase.from("organizations").update(update).eq("id", existing.id);
    }
    return existing.id;
  }

  const { data: created, error } = await supabase
    .from("organizations")
    .insert({
      name: name.trim(),
      website: fields.website ?? null,
      linkedin_url: fields.linkedin_url ?? null,
      category: fields.category ?? null,
    })
    .select("id")
    .single();
  if (error || !created) throw new Error(`Failed to insert org '${name}': ${error?.message}`);
  orgCache.set(key, created.id);
  return created.id;
}

async function ensureOrgParticipation(
  eventId: string,
  orgId: string,
  role: "sponsor" | "partner",
  tier: string | null
) {
  const { data: existing } = await supabase
    .from("event_participations")
    .select("id, sponsor_tier")
    .eq("event_id", eventId)
    .eq("organization_id", orgId)
    .eq("role", role)
    .maybeSingle();
  if (existing?.id) {
    if (tier && existing.sponsor_tier !== tier) {
      await supabase
        .from("event_participations")
        .update({ sponsor_tier: tier })
        .eq("id", existing.id);
    }
    return;
  }
  await supabase.from("event_participations").insert({
    event_id: eventId,
    organization_id: orgId,
    role,
    sponsor_tier: tier,
  });
}

async function upsertPerson(
  fullName: string,
  fields: {
    title?: string | null;
    linkedin_url?: string | null;
    twitter_handle?: string | null;
    website?: string | null;
  }
): Promise<string> {
  // Prefer LinkedIn match when available
  let existing:
    | { id: string; linkedin_url: string | null; twitter_handle: string | null; title: string | null }
    | null = null;

  if (fields.linkedin_url) {
    const { data } = await supabase
      .from("persons")
      .select("id, linkedin_url, twitter_handle, title")
      .eq("linkedin_url", fields.linkedin_url)
      .limit(1)
      .maybeSingle();
    existing = data ?? null;
  }
  if (!existing) {
    const { data } = await supabase
      .from("persons")
      .select("id, linkedin_url, twitter_handle, title")
      .ilike("full_name", fullName.trim())
      .limit(1)
      .maybeSingle();
    existing = data ?? null;
  }

  if (existing?.id) {
    const update: Record<string, string | null> = {};
    if (!existing.linkedin_url && fields.linkedin_url) update.linkedin_url = fields.linkedin_url;
    if (!existing.twitter_handle && fields.twitter_handle) update.twitter_handle = fields.twitter_handle;
    if (!existing.title && fields.title) update.title = fields.title;
    if (Object.keys(update).length > 0) {
      await supabase.from("persons").update(update).eq("id", existing.id);
    }
    return existing.id;
  }

  const { first, last } = splitName(fullName);
  const { data: created, error } = await supabase
    .from("persons")
    .insert({
      full_name: fullName.trim(),
      first_name: first,
      last_name: last,
      title: fields.title ?? null,
      linkedin_url: fields.linkedin_url ?? null,
      twitter_handle: fields.twitter_handle ?? null,
      source: SOURCE_TAG,
    })
    .select("id")
    .single();
  if (error || !created) throw new Error(`Failed to insert person '${fullName}': ${error?.message}`);
  return created.id;
}

async function ensurePersonOrg(personId: string, orgId: string, role: string | null) {
  const { data: existing } = await supabase
    .from("person_organization")
    .select("id, role")
    .eq("person_id", personId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (existing?.id) {
    if (role && !existing.role) {
      await supabase.from("person_organization").update({ role }).eq("id", existing.id);
    }
    return;
  }
  await supabase.from("person_organization").insert({
    person_id: personId,
    organization_id: orgId,
    role,
    is_primary: true,
    is_current: true,
    source: SOURCE_TAG,
  });
}

async function ensurePersonParticipation(
  eventId: string,
  personId: string,
  title: string | null
) {
  const { data: existing } = await supabase
    .from("event_participations")
    .select("id")
    .eq("event_id", eventId)
    .eq("person_id", personId)
    .eq("role", "speaker")
    .maybeSingle();
  if (existing?.id) return;
  await supabase.from("event_participations").insert({
    event_id: eventId,
    person_id: personId,
    role: "speaker",
    talk_title: title,
  });
}

async function main() {
  const eventId = await resolveEvent();

  // ---------- Companies ----------
  const companies = readCsv<CompanyRow>("consensus/companies_consensus.csv");
  console.log(`\nImporting ${companies.length} companies…`);
  let orgsNew = 0;
  let orgsExisting = 0;
  for (let i = 0; i < companies.length; i++) {
    const row = companies[i];
    const name = nz(row.name);
    if (!name) continue;
    const before = orgCache.size;
    const orgId = await upsertOrganization(name, {
      website: normalizeWebsite(nz(row.website)),
      linkedin_url: normalizeLinkedin(nz(row.linkedin)),
      category: row.record_type === "Community & Marketing Partner" ? "media_community" : null,
    });
    if (orgCache.size > before) orgsNew++; // rough: added this run
    else orgsExisting++;

    const isPartner = row.record_type === "Community & Marketing Partner";
    const role: "sponsor" | "partner" = isPartner ? "partner" : "sponsor";
    const tier = isPartner ? "community" : TIER_MAP[row.sponsor_tier?.trim()] ?? null;
    await ensureOrgParticipation(eventId, orgId, role, tier);

    if ((i + 1) % 25 === 0) console.log(`  … ${i + 1}/${companies.length}`);
  }
  console.log(`✓ Companies done. Newly created this run: ~${orgsNew}, matched existing: ~${orgsExisting}`);

  // ---------- Speakers ----------
  const speakers = readCsv<SpeakerRow>("consensus/speakers_consensus.csv");
  console.log(`\nImporting ${speakers.length} speakers…`);
  let personsProcessed = 0;
  for (let i = 0; i < speakers.length; i++) {
    const row = speakers[i];
    const fullName = nz(row.name);
    if (!fullName) continue;

    const linkedin = normalizeLinkedin(nz(row.linkedin));
    const twitter = normalizeTwitter(nz(row.twitter));
    const title = nz(row.title);
    const companyName = nz(row.company);

    const personId = await upsertPerson(fullName, {
      title,
      linkedin_url: linkedin,
      twitter_handle: twitter,
    });

    if (companyName) {
      const orgId = await upsertOrganization(companyName, {
        website: normalizeWebsite(nz(row.website)),
      });
      await ensurePersonOrg(personId, orgId, title);
    }

    // Secondary affiliation
    const secondaryCompany = nz(row.company_secondary);
    if (secondaryCompany) {
      const orgId2 = await upsertOrganization(secondaryCompany);
      await ensurePersonOrg(personId, orgId2, nz(row.title_secondary));
    }

    await ensurePersonParticipation(eventId, personId, title);

    personsProcessed++;
    if ((i + 1) % 25 === 0) console.log(`  … ${i + 1}/${speakers.length}`);
  }
  console.log(`✓ Speakers done. Processed: ${personsProcessed}`);

  // Summary counts from DB
  const { count: orgPartCount } = await supabase
    .from("event_participations")
    .select("id", { count: "exact", head: true })
    .eq("event_id", eventId)
    .not("organization_id", "is", null);
  const { count: personPartCount } = await supabase
    .from("event_participations")
    .select("id", { count: "exact", head: true })
    .eq("event_id", eventId)
    .not("person_id", "is", null);

  console.log(`\n=== Summary ===`);
  console.log(`Event: ${EVENT_NAME} (${eventId})`);
  console.log(`Org participations: ${orgPartCount}`);
  console.log(`Person participations: ${personPartCount}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
