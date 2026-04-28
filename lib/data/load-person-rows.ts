import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAll } from "@/lib/supabase/fetch-all";
import type { PersonRow, PersonEvent, OrgEvent } from "@/app/admin/persons/person-table-row";

export type LoadPersonRowsResult = {
  rows: PersonRow[];
  eventOptions: { id: string; name: string }[];
  sourceOptions: string[];
  seniorityOptions: string[];
  departmentOptions: string[];
};

export async function loadPersonRows(supabase: SupabaseClient): Promise<LoadPersonRowsResult> {
  const { data: allPersons } = await fetchAll(supabase, "persons_with_icp", "*", {
    order: { column: "full_name", ascending: true },
  });

  const seenIds = new Set<string>();
  const persons = allPersons.filter((p: any) => {
    if (seenIds.has(p.id)) return false;
    seenIds.add(p.id);
    return true;
  });

  const { data: personParticipations } = await fetchAll(
    supabase,
    "event_participations",
    "person_id, event_id, role, talk_title, track, events!inner(name)",
    { filters: (q: any) => q.not("person_id", "is", null) },
  );
  const personEventsMap: Record<string, PersonEvent[]> = {};
  for (const ep of personParticipations) {
    if (!ep.person_id) continue;
    (personEventsMap[ep.person_id] ||= []).push({
      event_id: ep.event_id,
      event_name: (ep as any).events?.name ?? "",
      role: ep.role ?? "",
      talk_title: ep.talk_title ?? null,
      track: ep.track ?? null,
    });
  }

  const { data: personOrgLinks } = await fetchAll(
    supabase,
    "person_organization",
    "person_id, organization_id, organizations!inner(id, name)",
    {},
  );
  const personOrgMap: Record<string, { org_id: string; org_name: string }[]> = {};
  for (const link of personOrgLinks) {
    if (!link.person_id) continue;
    (personOrgMap[link.person_id] ||= []).push({
      org_id: (link as any).organizations?.id ?? link.organization_id,
      org_name: (link as any).organizations?.name ?? "",
    });
  }

  const { data: orgParticipations } = await fetchAll(
    supabase,
    "event_participations",
    "organization_id, event_id, role, sponsor_tier, events!inner(name), organizations!inner(id, name)",
    { filters: (q: any) => q.not("organization_id", "is", null) },
  );
  const orgEventsMap: Record<string, OrgEvent[]> = {};
  for (const op of orgParticipations) {
    if (!op.organization_id) continue;
    (orgEventsMap[op.organization_id] ||= []).push({
      event_id: op.event_id,
      event_name: (op as any).events?.name ?? "",
      tier: op.sponsor_tier ?? null,
      role: op.role ?? "",
      org_name: (op as any).organizations?.name ?? "",
      org_id: (op as any).organizations?.id ?? op.organization_id,
    });
  }

  const { data: interactions } = await fetchAll(
    supabase,
    "interactions",
    "person_id, occurred_at, created_at",
    { filters: (q: any) => q.not("person_id", "is", null) },
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
      if (ixDate && (!existing.last_at || ixDate > existing.last_at)) existing.last_at = ixDate;
    }
  }

  const { data: events } = await supabase.from("events").select("id, name").order("name");
  const { data: sourcesRaw } = await supabase.from("persons").select("source").not("source", "is", null);
  const { data: senioritiesRaw } = await supabase.from("persons").select("seniority").not("seniority", "is", null);
  const { data: departmentsRaw } = await supabase.from("persons").select("department").not("department", "is", null);

  const rows: PersonRow[] = persons.map((person: any) => {
    const stats = interactionStats[person.id];
    const orgs = personOrgMap[person.id] || [];
    const orgEvents: OrgEvent[] = [];
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

  return {
    rows,
    eventOptions: (events || []).map((e: any) => ({ id: e.id, name: e.name })),
    sourceOptions: [...new Set((sourcesRaw || []).map((s: any) => s.source).filter(Boolean))].sort() as string[],
    seniorityOptions: [...new Set((senioritiesRaw || []).map((s: any) => s.seniority).filter(Boolean))].sort() as string[],
    departmentOptions: [...new Set((departmentsRaw || []).map((d: any) => d.department).filter(Boolean))].sort() as string[],
  };
}
