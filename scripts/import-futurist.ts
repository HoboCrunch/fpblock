import { createClient } from "@supabase/supabase-js";
import { parse } from "csv-parse/sync";
import { readFileSync } from "fs";
import { config } from "dotenv";

config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_SUPABASE_SECRET_KEY!
);

const SOURCE_TAG = "futurist_import";

const EVENTS = {
  "2025 Florida": {
    name: "Futurist 2025",
    slug: "futurist-2025",
    location: "Miami, Florida",
    website: "https://futuristconference.com/florida",
    date_start: "2025-11-13",
    date_end: "2025-11-14",
  },
  "2026 Toronto": {
    name: "Futurist 2026",
    slug: "futurist-2026",
    location: "Toronto, Canada",
    website: "https://futuristconference.com",
    date_start: "2026-04-22",
    date_end: "2026-04-23",
  },
} as const;

const TIER_MAP: Record<string, string> = {
  Diamond: "diamond",
  Platinum: "platinum",
  Gold: "gold",
  Silver: "silver",
  Bronze: "bronze",
};

type SponsorRow = {
  "Company Name": string;
  "Sponsorship Tier": string;
  "Industry / Field": string;
  Website: string;
  Conference: string;
  "Logo URL": string;
  "Source Page": string;
};

type SpeakerRow = {
  Conference: string;
  Name: string;
  Title: string;
  "Company / Organization": string;
  "Presenting Virtually": string;
  "Photo URL": string;
  "Source Page": string;
};

function readCsv<T>(path: string): T[] {
  return parse(readFileSync(path, "utf-8"), {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    trim: true,
    relax_quotes: true,
    relax_column_count: true,
  });
}

function nz(s: string | undefined | null): string | null {
  if (!s) return null;
  const t = s.trim();
  return t === "" ? null : t;
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

async function resolveEvent(conference: keyof typeof EVENTS): Promise<string> {
  const ev = EVENTS[conference];
  const { data: existing } = await supabase
    .from("events")
    .select("id")
    .eq("slug", ev.slug)
    .maybeSingle();
  if (existing?.id) {
    console.log(`✓ Event '${ev.name}' already exists: ${existing.id}`);
    return existing.id;
  }
  const { data, error } = await supabase
    .from("events")
    .insert({
      name: ev.name,
      slug: ev.slug,
      event_type: "conference",
      location: ev.location,
      website: ev.website,
      date_start: ev.date_start,
      date_end: ev.date_end,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`Failed to create event '${ev.name}': ${error?.message}`);
  console.log(`+ Created event '${ev.name}': ${data.id}`);
  return data.id;
}

const orgCache = new Map<string, string>();

async function upsertOrganization(
  name: string,
  fields: {
    website?: string | null;
    category?: string | null;
    logo_url?: string | null;
  } = {}
): Promise<string> {
  const key = name.toLowerCase().trim();
  if (orgCache.has(key)) return orgCache.get(key)!;

  const { data: existing } = await supabase
    .from("organizations")
    .select("id, website, category, logo_url")
    .ilike("name", name.trim())
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    orgCache.set(key, existing.id);
    const update: Record<string, string | null> = {};
    if (!existing.website && fields.website) update.website = fields.website;
    if (!existing.category && fields.category) update.category = fields.category;
    if (!existing.logo_url && fields.logo_url) update.logo_url = fields.logo_url;
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
      category: fields.category ?? null,
      logo_url: fields.logo_url ?? null,
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
    photo_url?: string | null;
  }
): Promise<string> {
  const { data: existing } = await supabase
    .from("persons")
    .select("id, title, photo_url")
    .ilike("full_name", fullName.trim())
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    const update: Record<string, string | null> = {};
    if (!existing.title && fields.title) update.title = fields.title;
    if (!existing.photo_url && fields.photo_url) update.photo_url = fields.photo_url;
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
      photo_url: fields.photo_url ?? null,
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
  // ---------- Events ----------
  const eventIds: Record<string, string> = {};
  for (const key of Object.keys(EVENTS) as (keyof typeof EVENTS)[]) {
    eventIds[key] = await resolveEvent(key);
  }

  // ---------- Sponsors (2026 Toronto only) ----------
  const sponsors = readCsv<SponsorRow>("events/futurist_conference_sponsors.csv");
  console.log(`\nImporting ${sponsors.length} sponsors…`);
  let sponsorCount = 0;
  for (const row of sponsors) {
    const name = nz(row["Company Name"]);
    if (!name) continue;
    const conference = nz(row.Conference);
    const eventId = conference && conference in eventIds ? eventIds[conference] : null;
    if (!eventId) {
      console.log(`  ! skipping sponsor '${name}' — unknown conference '${conference}'`);
      continue;
    }
    const orgId = await upsertOrganization(name, {
      website: normalizeWebsite(nz(row.Website)),
      category: nz(row["Industry / Field"]),
      logo_url: nz(row["Logo URL"]),
    });
    const tier = TIER_MAP[(nz(row["Sponsorship Tier"]) ?? "").trim()] ?? nz(row["Sponsorship Tier"])?.toLowerCase() ?? null;
    await ensureOrgParticipation(eventId, orgId, "sponsor", tier);
    sponsorCount++;
    if (sponsorCount % 10 === 0) console.log(`  … sponsors ${sponsorCount}/${sponsors.length}`);
  }
  console.log(`✓ Sponsors done: ${sponsorCount}`);

  // ---------- Speakers ----------
  const speakers = readCsv<SpeakerRow>("events/futurist_conference_speakers.csv");
  console.log(`\nImporting ${speakers.length} speakers…`);
  let speakerCount = 0;
  let skipCount = 0;
  for (const row of speakers) {
    const fullName = nz(row.Name);
    if (!fullName) continue;
    const conference = nz(row.Conference);
    const eventId = conference && conference in eventIds ? eventIds[conference] : null;
    if (!eventId) {
      skipCount++;
      console.log(`  ! skipping speaker '${fullName}' — unknown conference '${conference}'`);
      continue;
    }

    const title = nz(row.Title);
    const companyName = nz(row["Company / Organization"]);
    const photoUrl = nz(row["Photo URL"]);

    const personId = await upsertPerson(fullName, {
      title,
      photo_url: photoUrl,
    });

    if (companyName) {
      const orgId = await upsertOrganization(companyName);
      await ensurePersonOrg(personId, orgId, title);
    }

    await ensurePersonParticipation(eventId, personId, title);

    speakerCount++;
    if (speakerCount % 25 === 0) console.log(`  … speakers ${speakerCount}/${speakers.length}`);
  }
  console.log(`✓ Speakers done: ${speakerCount} (skipped ${skipCount})`);

  // ---------- Summary ----------
  console.log(`\n=== Summary ===`);
  for (const [key, evId] of Object.entries(eventIds)) {
    const { count: orgPartCount } = await supabase
      .from("event_participations")
      .select("id", { count: "exact", head: true })
      .eq("event_id", evId)
      .not("organization_id", "is", null);
    const { count: personPartCount } = await supabase
      .from("event_participations")
      .select("id", { count: "exact", head: true })
      .eq("event_id", evId)
      .not("person_id", "is", null);
    console.log(`${key} (${EVENTS[key as keyof typeof EVENTS].name}, ${evId}): orgs=${orgPartCount} persons=${personPartCount}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
