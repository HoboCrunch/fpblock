import type { SupabaseClient } from "@supabase/supabase-js";

export type EventPersonRelation = "direct" | "org_affiliated" | "either" | "both";

interface DirectRow { person_id: string | null }
interface AffRow { person_id: string; via_organization_id: string }

async function fetchDirect(supabase: SupabaseClient, eventId: string): Promise<string[]> {
  const { data } = await supabase
    .from("event_participations")
    .select("person_id")
    .eq("event_id", eventId)
    .not("person_id", "is", null);
  return Array.from(
    new Set(
      ((data as DirectRow[] | null) ?? [])
        .map((r) => r.person_id)
        .filter((id): id is string => id !== null)
    )
  );
}

async function fetchAffiliated(supabase: SupabaseClient, eventId: string): Promise<AffRow[]> {
  const { data } = await supabase
    .from("person_event_affiliations")
    .select("person_id, via_organization_id")
    .eq("event_id", eventId);
  return (data as AffRow[] | null) ?? [];
}

export async function getPersonIdsForEvent(
  supabase: SupabaseClient,
  eventId: string,
  relation: EventPersonRelation
): Promise<string[]> {
  if (relation === "direct") {
    return fetchDirect(supabase, eventId);
  }
  if (relation === "org_affiliated") {
    const aff = await fetchAffiliated(supabase, eventId);
    return Array.from(new Set(aff.map((a) => a.person_id)));
  }
  const [direct, aff] = await Promise.all([
    fetchDirect(supabase, eventId),
    fetchAffiliated(supabase, eventId),
  ]);
  const affIds = new Set(aff.map((a) => a.person_id));
  if (relation === "both") {
    return direct.filter((id) => affIds.has(id));
  }
  // either
  const out = new Set(direct);
  for (const id of affIds) out.add(id);
  return Array.from(out);
}

export async function getPersonRelationsForEvent(
  supabase: SupabaseClient,
  eventId: string
): Promise<Map<string, { direct: boolean; viaOrgIds: string[] }>> {
  const [direct, aff] = await Promise.all([
    fetchDirect(supabase, eventId),
    fetchAffiliated(supabase, eventId),
  ]);
  const map = new Map<string, { direct: boolean; viaOrgIds: string[] }>();
  for (const id of direct) {
    map.set(id, { direct: true, viaOrgIds: [] });
  }
  for (const row of aff) {
    const cur = map.get(row.person_id) ?? { direct: false, viaOrgIds: [] };
    if (!cur.viaOrgIds.includes(row.via_organization_id)) {
      cur.viaOrgIds.push(row.via_organization_id);
    }
    map.set(row.person_id, cur);
  }
  return map;
}
