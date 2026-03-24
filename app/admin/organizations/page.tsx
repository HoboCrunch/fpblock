import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/supabase/fetch-all";
import {
  OrganizationsTableClient,
  type OrgRow,
  type FilterOptions,
} from "./organizations-table-client";

export default async function OrganizationsListPage() {
  const supabase = await createClient();

  // ── Fetch all organizations ────────────────────────────────────────
  const { data: allOrgs } = await fetchAll(supabase, "organizations", "*", {
    order: { column: "name", ascending: true },
  });

  const orgIds = allOrgs.map((o: any) => o.id);

  // ── Helper: batched IN queries for large id sets ───────────────────
  async function fetchInBatches(
    table: string,
    select: string,
    ids: string[],
    extraFilters?: (q: any) => any,
  ) {
    if (ids.length === 0) return [] as any[];
    const CHUNK = 500;
    let results: any[] = [];
    for (let i = 0; i < ids.length; i += CHUNK) {
      const chunk = ids.slice(i, i + CHUNK);
      let q = supabase.from(table).select(select).in("organization_id", chunk);
      if (extraFilters) q = extraFilters(q);
      const { data } = await q;
      if (data) results = results.concat(data);
    }
    return results;
  }

  // ── Parallel data fetches ──────────────────────────────────────────
  const [
    personLinks,
    signals,
    eventParticipationsRaw,
    jobLogs,
    categoryData,
    signalTypeData,
    industryData,
  ] = await Promise.all([
    fetchInBatches(
      "person_organization",
      "organization_id, person_id, id, source, role, role_type",
      orgIds,
    ),
    fetchInBatches("organization_signals", "organization_id, id, date, signal_type", orgIds),
    fetchInBatches(
      "event_participations",
      "organization_id, event_id, role, sponsor_tier, event:events(id, name)",
      orgIds,
      (q: any) => q.not("organization_id", "is", null),
    ),
    // Job log metadata for firmographic fields
    fetchInBatches(
      "job_log",
      "target_id, metadata",
      orgIds.length > 0
        ? orgIds
        : [],
      (q: any) =>
        q
          .in("job_type", ["enrichment_full", "enrichment_apollo"])
          .eq("status", "completed")
          .eq("target_table", "organizations"),
    ).catch(() => [] as any[]),
    // Distinct filter values
    supabase
      .from("organizations")
      .select("category")
      .not("category", "is", null),
    supabase
      .from("organization_signals")
      .select("signal_type")
      .not("signal_type", "is", null),
    supabase
      .from("organizations")
      .select("industry")
      .not("industry", "is", null),
  ]);

  // ── Fetch persons for preview data ─────────────────────────────────
  // Build person IDs from personLinks to fetch names
  const personIds = [...new Set((personLinks as any[]).map((pl: any) => pl.person_id).filter(Boolean))];
  let personsMap = new Map<string, any>();
  if (personIds.length > 0) {
    const CHUNK = 500;
    for (let i = 0; i < personIds.length; i += CHUNK) {
      const chunk = personIds.slice(i, i + CHUNK);
      const { data: persons } = await supabase
        .from("persons")
        .select("id, full_name, title, seniority, enrichment_status")
        .in("id", chunk);
      if (persons) {
        for (const p of persons) personsMap.set(p.id, p);
      }
    }
  }

  // ── Build lookup maps ──────────────────────────────────────────────

  // Person counts per org — enriched = person has enrichment_status 'complete'
  const personCountMap = new Map<string, { total: number; enriched: number }>();
  for (const pl of personLinks as any[]) {
    const existing = personCountMap.get(pl.organization_id) ?? { total: 0, enriched: 0 };
    existing.total++;
    const person = personsMap.get(pl.person_id);
    if (person?.enrichment_status === "complete") existing.enriched++;
    personCountMap.set(pl.organization_id, existing);
  }

  // Signal counts & last date per org
  const signalCountMap = new Map<string, { count: number; lastDate: string | null }>();
  for (const sig of signals as any[]) {
    const existing = signalCountMap.get(sig.organization_id) ?? { count: 0, lastDate: null };
    existing.count++;
    if (sig.date && (!existing.lastDate || sig.date > existing.lastDate)) {
      existing.lastDate = sig.date;
    }
    signalCountMap.set(sig.organization_id, existing);
  }

  // Events per org
  const eventMap = new Map<string, any[]>();
  for (const ep of eventParticipationsRaw as any[]) {
    if (!ep.organization_id) continue;
    const existing = eventMap.get(ep.organization_id) ?? [];
    existing.push(ep);
    eventMap.set(ep.organization_id, existing);
  }

  // Job log metadata (latest per org) for firmographic fields
  const jobMetaMap = new Map<string, Record<string, unknown>>();
  for (const jl of (jobLogs ?? []) as any[]) {
    if (!jl.target_id || jobMetaMap.has(jl.target_id)) continue;
    jobMetaMap.set(jl.target_id, (jl.metadata ?? {}) as Record<string, unknown>);
  }

  // orgPeopleMap: org_id -> top 5 people (by seniority/name)
  const orgPeopleRaw = new Map<string, Array<{ full_name: string; title: string | null; seniority: string | null }>>();
  for (const pl of personLinks as any[]) {
    const person = personsMap.get(pl.person_id);
    if (!person) continue;
    const existing = orgPeopleRaw.get(pl.organization_id) ?? [];
    existing.push({
      full_name: person.full_name,
      title: person.title,
      seniority: person.seniority,
    });
    orgPeopleRaw.set(pl.organization_id, existing);
  }

  const orgPeopleMap: Record<string, Array<{ full_name: string; title: string | null; seniority: string | null }>> = {};
  for (const [orgId, people] of orgPeopleRaw) {
    orgPeopleMap[orgId] = people.slice(0, 5);
  }

  // ── Distinct filter values ─────────────────────────────────────────
  const categories = [
    ...new Set(
      ((categoryData as any)?.data || [])
        .map((c: any) => (typeof c.category === "string" ? c.category : null))
        .filter(Boolean)
    ),
  ].sort() as string[];

  const signalTypes = [
    ...new Set(
      ((signalTypeData as any)?.data || [])
        .map((s: any) => (typeof s.signal_type === "string" ? s.signal_type : null))
        .filter(Boolean)
    ),
  ].sort() as string[];

  const industries = [
    ...new Set(
      ((industryData as any)?.data || [])
        .map((i: any) => (typeof i.industry === "string" ? i.industry : null))
        .filter(Boolean)
    ),
  ].sort() as string[];

  // Distinct events from participations
  const eventSet = new Map<string, string>();
  for (const ep of eventParticipationsRaw as any[]) {
    const evt = Array.isArray(ep.event) ? ep.event[0] : ep.event;
    if (evt?.id && evt?.name && !eventSet.has(evt.id)) {
      eventSet.set(evt.id, evt.name);
    }
  }
  const events = [...eventSet.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));

  // Distinct sponsor tiers
  const sponsorTiers = [
    ...new Set(
      (eventParticipationsRaw as any[])
        .map((ep: any) => ep.sponsor_tier)
        .filter(Boolean)
    ),
  ].sort() as string[];

  // ── Build rows ─────────────────────────────────────────────────────
  const rows: OrgRow[] = allOrgs.map((org: any) => {
    const personCounts = personCountMap.get(org.id) ?? { total: 0, enriched: 0 };
    const signalData = signalCountMap.get(org.id) ?? { count: 0, lastDate: null };
    const orgEvents = eventMap.get(org.id) ?? [];
    const meta = jobMetaMap.get(org.id);
    const apolloResult = meta ? ((meta as any).result ?? meta) : null;

    return {
      id: org.id,
      name: org.name,
      logo_url: org.logo_url ?? null,
      category: org.category ?? null,
      description: org.description ?? null,
      website: org.website ?? null,
      linkedin_url: org.linkedin_url ?? null,
      icp_score: org.icp_score ?? null,
      icp_reason: org.icp_reason ?? null,
      usp: org.usp ?? null,
      enrichment_status: org.enrichment_status ?? null,
      enrichment_stages: org.enrichment_stages ?? null,
      person_count: personCounts.total,
      enriched_person_count: personCounts.enriched,
      signal_count: signalData.count,
      last_signal: signalData.lastDate,
      events: orgEvents.map((ep: any) => {
        const evt = Array.isArray(ep.event) ? ep.event[0] : ep.event;
        return {
          id: evt?.id ?? "",
          name: evt?.name ?? "",
          role: ep.role ?? "",
          tier: ep.sponsor_tier ?? null,
        };
      }),
      industry: org.industry ?? apolloResult?.industry ?? null,
      employee_count: org.employee_count ?? apolloResult?.employee_count ?? null,
    };
  });

  const filterOptions: FilterOptions = {
    categories,
    signalTypes,
    industries,
    events,
    sponsorTiers,
  };

  return (
    <OrganizationsTableClient
      rows={rows}
      filterOptions={filterOptions}
      orgPeopleMap={orgPeopleMap}
    />
  );
}
