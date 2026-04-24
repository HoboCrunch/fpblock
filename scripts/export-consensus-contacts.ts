import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { writeFileSync } from "fs";

config({ path: ".env.local" });

const EVENT_ID = "a830978d-07e5-49a2-9e9b-11575eaf996a";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_SUPABASE_SECRET_KEY!
);

type Row = Record<string, string | number | boolean | null>;

function csvEscape(v: string | number | boolean | null | undefined): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(headers: string[], rows: Row[]): string {
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => csvEscape(row[h])).join(","));
  }
  return lines.join("\n") + "\n";
}

async function pageAll<T>(query: () => any, pageSize = 1000): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await query().range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

async function main() {
  // ---- 1. Direct event participants (speakers) ----
  const { data: speakerParts } = await supabase
    .from("event_participations")
    .select("person_id, role, talk_title")
    .eq("event_id", EVENT_ID)
    .not("person_id", "is", null);

  const speakerMap = new Map<string, { role: string; talk: string | null }>();
  (speakerParts ?? []).forEach((p: any) => {
    if (p.person_id) speakerMap.set(p.person_id, { role: p.role, talk: p.talk_title });
  });

  // ---- 2. Event organizations (sponsors + partners) ----
  const { data: orgParts } = await supabase
    .from("event_participations")
    .select("organization_id, role, sponsor_tier")
    .eq("event_id", EVENT_ID)
    .not("organization_id", "is", null);

  const consensusOrgIds = new Set<string>();
  const orgRoleMap = new Map<string, { role: string; tier: string | null }>();
  (orgParts ?? []).forEach((p: any) => {
    if (p.organization_id) {
      consensusOrgIds.add(p.organization_id);
      orgRoleMap.set(p.organization_id, { role: p.role, tier: p.sponsor_tier });
    }
  });
  console.log(`Consensus orgs: ${consensusOrgIds.size}`);

  // ---- 3. Persons linked to those orgs (discovered via people_finder + existing) ----
  const orgIdList = Array.from(consensusOrgIds);
  const personOrgLinks: any[] = [];
  // Supabase `in` is limited by URL length — keep chunks small
  for (let i = 0; i < orgIdList.length; i += 50) {
    const chunk = orgIdList.slice(i, i + 50);
    const { data } = await supabase
      .from("person_organization")
      .select("person_id, organization_id, role, role_type, is_primary, is_current, source")
      .in("organization_id", chunk);
    if (data) personOrgLinks.push(...data);
  }

  // Build person → primary link. Prefer: explicit speaker participation → is_primary=true → any link
  const personPrimaryLink = new Map<string, any>();
  personOrgLinks.forEach((l) => {
    const existing = personPrimaryLink.get(l.person_id);
    if (!existing) personPrimaryLink.set(l.person_id, l);
    else if (!existing.is_primary && l.is_primary) personPrimaryLink.set(l.person_id, l);
  });

  // Union of person IDs: speakers + linked
  const personIds = new Set<string>([...speakerMap.keys(), ...personPrimaryLink.keys()]);
  console.log(`Total consensus-related persons: ${personIds.size}`);
  console.log(`  · Speakers (direct participation): ${speakerMap.size}`);
  console.log(`  · Linked via sponsor/partner orgs (not speakers): ${personIds.size - speakerMap.size}`);

  // ---- 4. Fetch person rows ----
  const personList = Array.from(personIds);
  const personRows: any[] = [];
  for (let i = 0; i < personList.length; i += 50) {
    const chunk = personList.slice(i, i + 50);
    const { data } = await supabase
      .from("persons")
      .select("id, full_name, first_name, last_name, email, linkedin_url, twitter_handle, telegram_handle, phone, title, seniority, department, bio, photo_url, source, apollo_id, enrichment_status, last_enriched_at, created_at, updated_at")
      .in("id", chunk);
    if (data) personRows.push(...data);
  }

  // ---- 5. Fetch all relevant org rows (consensus orgs + any primary orgs outside that set) ----
  const allOrgIdsNeeded = new Set<string>(consensusOrgIds);
  personPrimaryLink.forEach((l) => allOrgIdsNeeded.add(l.organization_id));
  const orgRows: any[] = [];
  const orgIdArr = Array.from(allOrgIdsNeeded);
  for (let i = 0; i < orgIdArr.length; i += 50) {
    const chunk = orgIdArr.slice(i, i + 50);
    const { data } = await supabase
      .from("organizations")
      .select("id, name, website, linkedin_url, category, description, industry, employee_count, annual_revenue, founded_year, hq_location, funding_total, latest_funding_stage, icp_score, icp_reason, usp, logo_url, enrichment_status, last_enriched_at")
      .in("id", chunk);
    if (data) orgRows.push(...data);
  }
  const orgById = new Map<string, any>();
  orgRows.forEach((o) => orgById.set(o.id, o));

  // ---- 6. For speakers without a person_organization link, look at event_participations org context
  // Actually, most speakers already have a person_organization link if they had a `company` in the CSV.
  // Speakers with no org link just won't have org columns populated.

  // ---- 7. Build CSV rows ----
  const rows: Row[] = personRows.map((p) => {
    const isSpeaker = speakerMap.has(p.id);
    const speakerInfo = speakerMap.get(p.id);
    const link = personPrimaryLink.get(p.id);
    const org = link ? orgById.get(link.organization_id) : null;
    const orgEventRole = org ? orgRoleMap.get(org.id) : null;

    return {
      // person
      person_id: p.id,
      full_name: p.full_name,
      first_name: p.first_name,
      last_name: p.last_name,
      email: p.email,
      linkedin_url: p.linkedin_url,
      twitter_handle: p.twitter_handle,
      telegram_handle: p.telegram_handle,
      phone: p.phone,
      title: p.title,
      seniority: p.seniority,
      department: p.department,
      bio: p.bio,
      photo_url: p.photo_url,
      apollo_id: p.apollo_id,
      person_source: p.source,
      person_enrichment_status: p.enrichment_status,
      person_last_enriched_at: p.last_enriched_at,
      // consensus relationship
      consensus_role: isSpeaker ? "speaker" : orgEventRole?.role ?? "employee_of_participant",
      consensus_direct_participant: isSpeaker ? "true" : "false",
      consensus_talk_title: speakerInfo?.talk ?? null,
      consensus_sponsor_tier: orgEventRole?.tier ?? null,
      person_org_link_source: link?.source ?? null,
      // org
      org_id: org?.id ?? null,
      org_name: org?.name ?? null,
      org_website: org?.website ?? null,
      org_linkedin_url: org?.linkedin_url ?? null,
      org_category: org?.category ?? null,
      org_industry: org?.industry ?? null,
      org_description: org?.description ?? null,
      org_employee_count: org?.employee_count ?? null,
      org_annual_revenue: org?.annual_revenue ?? null,
      org_founded_year: org?.founded_year ?? null,
      org_hq_location: org?.hq_location ?? null,
      org_funding_total: org?.funding_total ?? null,
      org_latest_funding_stage: org?.latest_funding_stage ?? null,
      org_icp_score: org?.icp_score ?? null,
      org_icp_reason: org?.icp_reason ?? null,
      org_usp: org?.usp ?? null,
      org_enrichment_status: org?.enrichment_status ?? null,
      org_last_enriched_at: org?.last_enriched_at ?? null,
    };
  });

  const headers = [
    "person_id",
    "full_name",
    "first_name",
    "last_name",
    "email",
    "linkedin_url",
    "twitter_handle",
    "telegram_handle",
    "phone",
    "title",
    "seniority",
    "department",
    "bio",
    "photo_url",
    "apollo_id",
    "person_source",
    "person_enrichment_status",
    "person_last_enriched_at",
    "consensus_role",
    "consensus_direct_participant",
    "consensus_talk_title",
    "consensus_sponsor_tier",
    "person_org_link_source",
    "org_id",
    "org_name",
    "org_website",
    "org_linkedin_url",
    "org_category",
    "org_industry",
    "org_description",
    "org_employee_count",
    "org_annual_revenue",
    "org_founded_year",
    "org_hq_location",
    "org_funding_total",
    "org_latest_funding_stage",
    "org_icp_score",
    "org_icp_reason",
    "org_usp",
    "org_enrichment_status",
    "org_last_enriched_at",
  ];

  // Sort: speakers first (by icp desc), then employees (by icp desc)
  rows.sort((a, b) => {
    const speakerA = a.consensus_direct_participant === "true" ? 0 : 1;
    const speakerB = b.consensus_direct_participant === "true" ? 0 : 1;
    if (speakerA !== speakerB) return speakerA - speakerB;
    const icpA = (a.org_icp_score as number | null) ?? -1;
    const icpB = (b.org_icp_score as number | null) ?? -1;
    return icpB - icpA;
  });

  const csv = toCsv(headers, rows);
  const outPath = "consensus/consensus_contacts_enriched.csv";
  writeFileSync(outPath, csv, "utf8");
  console.log(`\n✓ Wrote ${rows.length} rows → ${outPath}`);

  // Summary breakdown
  const withEmail = rows.filter((r) => r.email).length;
  const withLinkedIn = rows.filter((r) => r.linkedin_url).length;
  const withOrg = rows.filter((r) => r.org_id).length;
  const withIcp = rows.filter((r) => r.org_icp_score != null).length;
  const speakerCount = rows.filter((r) => r.consensus_direct_participant === "true").length;
  const icp75Plus = rows.filter((r) => (r.org_icp_score as number | null) != null && (r.org_icp_score as number) >= 75).length;
  console.log(`\n=== Coverage ===`);
  console.log(`  Speakers:               ${speakerCount}`);
  console.log(`  Employees of sponsors:  ${rows.length - speakerCount}`);
  console.log(`  With email:             ${withEmail}`);
  console.log(`  With LinkedIn URL:      ${withLinkedIn}`);
  console.log(`  With org link:          ${withOrg}`);
  console.log(`  With org ICP score:     ${withIcp}`);
  console.log(`  Org ICP ≥ 75:           ${icp75Plus}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
