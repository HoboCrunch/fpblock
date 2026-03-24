import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { PersonsTableClient } from "./persons-table-client";

export default async function PersonsListPage() {
  const supabase = await createClient();

  // ---------------------------------------------------------------------------
  // 1. Fetch all persons from the persons_with_icp view
  // ---------------------------------------------------------------------------
  const { data: allPersons } = await fetchAll(supabase, "persons_with_icp", "*", {
    order: { column: "full_name", ascending: true },
  });

  // Deduplicate (view may return duplicates if multiple primary org links)
  const seenIds = new Set<string>();
  const persons = allPersons.filter((p: any) => {
    if (seenIds.has(p.id)) return false;
    seenIds.add(p.id);
    return true;
  });

  const personIds = persons.map((p: any) => p.id);

  // ---------------------------------------------------------------------------
  // 2. Fetch event participations per person
  // ---------------------------------------------------------------------------
  const { data: personParticipations } = await fetchAll(
    supabase,
    "event_participations",
    "person_id, event_id, role, talk_title, track, events!inner(name)",
    {
      filters: (query: any) => query.not("person_id", "is", null),
    }
  );

  // Build lookup: person_id -> PersonEvent[]
  const personEventsMap: Record<string, any[]> = {};
  for (const ep of personParticipations) {
    if (!ep.person_id) continue;
    if (!personEventsMap[ep.person_id]) personEventsMap[ep.person_id] = [];
    personEventsMap[ep.person_id].push({
      event_id: ep.event_id,
      event_name: (ep as any).events?.name ?? "",
      role: ep.role ?? "",
      talk_title: ep.talk_title ?? null,
      track: ep.track ?? null,
    });
  }

  // ---------------------------------------------------------------------------
  // 3. Fetch person-organization links with org details
  // ---------------------------------------------------------------------------
  const { data: personOrgLinks } = await fetchAll(
    supabase,
    "person_organization",
    "person_id, organization_id, organizations!inner(id, name)",
    {}
  );

  // Build lookup: person_id -> org_id[]
  const personOrgMap: Record<string, { org_id: string; org_name: string }[]> = {};
  for (const link of personOrgLinks) {
    if (!link.person_id) continue;
    if (!personOrgMap[link.person_id]) personOrgMap[link.person_id] = [];
    personOrgMap[link.person_id].push({
      org_id: (link as any).organizations?.id ?? link.organization_id,
      org_name: (link as any).organizations?.name ?? "",
    });
  }

  // ---------------------------------------------------------------------------
  // 4. Fetch org-level event participations with sponsor_tier
  // ---------------------------------------------------------------------------
  const { data: orgParticipations } = await fetchAll(
    supabase,
    "event_participations",
    "organization_id, event_id, role, sponsor_tier, events!inner(name), organizations!inner(id, name)",
    {
      filters: (query: any) => query.not("organization_id", "is", null),
    }
  );

  // Build lookup: org_id -> OrgEvent[]
  const orgEventsMap: Record<string, any[]> = {};
  for (const op of orgParticipations) {
    if (!op.organization_id) continue;
    if (!orgEventsMap[op.organization_id]) orgEventsMap[op.organization_id] = [];
    orgEventsMap[op.organization_id].push({
      event_id: op.event_id,
      event_name: (op as any).events?.name ?? "",
      tier: op.sponsor_tier ?? null,
      role: op.role ?? "",
      org_name: (op as any).organizations?.name ?? "",
      org_id: (op as any).organizations?.id ?? op.organization_id,
    });
  }

  // ---------------------------------------------------------------------------
  // 5. Fetch interaction counts/dates per person
  // ---------------------------------------------------------------------------
  const { data: interactions } = await fetchAll(
    supabase,
    "interactions",
    "person_id, occurred_at, created_at",
    {
      filters: (query: any) => query.not("person_id", "is", null),
    }
  );

  const interactionStats: Record<string, { count: number; last_at: string | null }> = {};
  for (const ix of interactions) {
    if (!ix.person_id) continue;
    const ixDate = ix.occurred_at || ix.created_at;
    const existing = interactionStats[ix.person_id];
    if (!existing) {
      interactionStats[ix.person_id] = { count: 1, last_at: ixDate };
    } else {
      existing.count += 1;
      if (ixDate && (!existing.last_at || ixDate > existing.last_at)) {
        existing.last_at = ixDate;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 6. Fetch filter dropdown options
  // ---------------------------------------------------------------------------
  const { data: events } = await supabase
    .from("events")
    .select("id, name")
    .order("name");

  const { data: sourcesRaw } = await supabase
    .from("persons")
    .select("source")
    .not("source", "is", null);

  const sourceOptions = [
    ...new Set((sourcesRaw || []).map((s: any) => s.source).filter(Boolean)),
  ].sort() as string[];

  const { data: senioritiesRaw } = await supabase
    .from("persons")
    .select("seniority")
    .not("seniority", "is", null);

  const seniorityOptions = [
    ...new Set((senioritiesRaw || []).map((s: any) => s.seniority).filter(Boolean)),
  ].sort() as string[];

  const { data: departmentsRaw } = await supabase
    .from("persons")
    .select("department")
    .not("department", "is", null);

  const departmentOptions = [
    ...new Set((departmentsRaw || []).map((d: any) => d.department).filter(Boolean)),
  ].sort() as string[];

  // ---------------------------------------------------------------------------
  // 7. Assemble PersonRow[]
  // ---------------------------------------------------------------------------
  const rows = persons.map((person: any) => {
    const stats = interactionStats[person.id];
    const orgs = personOrgMap[person.id] || [];

    // Gather org events from all linked orgs
    const orgEvents: any[] = [];
    const seenOrgEvents = new Set<string>();
    for (const org of orgs) {
      for (const oe of orgEventsMap[org.org_id] || []) {
        const key = `${oe.org_id}-${oe.event_id}`;
        if (!seenOrgEvents.has(key)) {
          seenOrgEvents.add(key);
          orgEvents.push(oe);
        }
      }
    }

    return {
      id: person.id,
      full_name: person.full_name,
      title: person.title ?? null,
      primary_org_name: person.primary_org_name ?? null,
      seniority: person.seniority ?? null,
      department: person.department ?? null,
      icp_score: person.icp_score ?? null,
      email: person.email ?? null,
      linkedin_url: person.linkedin_url ?? null,
      twitter_handle: person.twitter_handle ?? null,
      telegram_handle: person.telegram_handle ?? null,
      phone: person.phone ?? null,
      photo_url: person.photo_url ?? null,
      bio: person.bio ?? null,
      source: person.source ?? null,
      enrichment_status: person.enrichment_status ?? "not_started",
      interaction_count: stats?.count ?? 0,
      last_interaction_at: stats?.last_at ?? null,
      personEvents: personEventsMap[person.id] || [],
      orgEvents,
    };
  });

  const eventOptions = (events || []).map((e: any) => ({ id: e.id, name: e.name }));

  return (
    <PersonsTableClient
      rows={rows}
      eventOptions={eventOptions}
      sourceOptions={sourceOptions}
      seniorityOptions={seniorityOptions}
      departmentOptions={departmentOptions}
    />
  );
}
