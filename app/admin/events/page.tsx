import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { EventsTableClient } from "./events-table-client";

export default async function EventsListPage() {
  const supabase = await createClient();

  // ── Fetch all events ───────────────────────────────────────────────
  const { data: events } = await fetchAll(supabase, "events", "*", {
    order: { column: "date_start", ascending: false },
  });

  const eventIds = events.map((e: any) => e.id);

  // ── Fetch event_participations in batches ──────────────────────────
  let participations: any[] = [];
  if (eventIds.length > 0) {
    const CHUNK = 500;
    for (let i = 0; i < eventIds.length; i += CHUNK) {
      const chunk = eventIds.slice(i, i + CHUNK);
      const { data } = await supabase
        .from("event_participations")
        .select("event_id, role, person_id, organization_id, sponsor_tier")
        .in("event_id", chunk);
      if (data) participations = participations.concat(data);
    }
  }

  // ── Fetch org ICP scores ───────────────────────────────────────────
  const orgIds = [...new Set(participations.map((p: any) => p.organization_id).filter(Boolean))];
  const orgIcpMap = new Map<string, number>();
  const orgNameMap = new Map<string, string>();
  if (orgIds.length > 0) {
    const CHUNK = 500;
    for (let i = 0; i < orgIds.length; i += CHUNK) {
      const chunk = orgIds.slice(i, i + CHUNK);
      const { data: orgs } = await supabase
        .from("organizations")
        .select("id, name, icp_score")
        .in("id", chunk);
      if (orgs) {
        for (const org of orgs) {
          if (org.icp_score != null) orgIcpMap.set(org.id, org.icp_score);
          orgNameMap.set(org.id, org.name);
        }
      }
    }
  }

  // ── Fetch signal counts per org ────────────────────────────────────
  const orgSignalCountMap = new Map<string, number>();
  if (orgIds.length > 0) {
    const CHUNK = 500;
    for (let i = 0; i < orgIds.length; i += CHUNK) {
      const chunk = orgIds.slice(i, i + CHUNK);
      const { data: signals } = await supabase
        .from("organization_signals")
        .select("organization_id")
        .in("organization_id", chunk);
      if (signals) {
        for (const s of signals) {
          orgSignalCountMap.set(s.organization_id, (orgSignalCountMap.get(s.organization_id) ?? 0) + 1);
        }
      }
    }
  }

  // ── Fetch person enrichment_status for enriched pct ────────────────
  const personIds = [...new Set(participations.map((p: any) => p.person_id).filter(Boolean))];
  const personEnrichedSet = new Set<string>();
  if (personIds.length > 0) {
    const CHUNK = 500;
    for (let i = 0; i < personIds.length; i += CHUNK) {
      const chunk = personIds.slice(i, i + CHUNK);
      const { data: persons } = await supabase
        .from("persons")
        .select("id, enrichment_status")
        .in("id", chunk);
      if (persons) {
        for (const p of persons) {
          if (p.enrichment_status === "complete") personEnrichedSet.add(p.id);
        }
      }
    }
  }

  // ── Compute per-event stats ────────────────────────────────────────
  const eventRows = events.map((event: any) => {
    const eps = participations.filter((p: any) => p.event_id === event.id);

    let speakerCount = 0;
    let sponsorCount = 0;
    let contactCount = 0;
    const orgSet = new Set<string>();
    let icpSum = 0;
    let icpCount = 0;
    let totalSignals = 0;
    let enrichedContactCount = 0;

    for (const ep of eps) {
      const role = ep.role;
      if (role === "speaker" || role === "panelist" || role === "mc") speakerCount++;
      if (role === "sponsor" || role === "partner" || role === "exhibitor") sponsorCount++;
      if (ep.person_id) {
        contactCount++;
        if (personEnrichedSet.has(ep.person_id)) enrichedContactCount++;
      }
      if (ep.organization_id) {
        orgSet.add(ep.organization_id);
        const icp = orgIcpMap.get(ep.organization_id);
        if (icp != null) {
          icpSum += icp;
          icpCount++;
        }
        totalSignals += orgSignalCountMap.get(ep.organization_id) ?? 0;
      }
    }

    const enrichedContactPct = contactCount > 0
      ? Math.round((enrichedContactCount / contactCount) * 100)
      : 0;

    // Top sponsors: orgs with sponsor_tier, sorted by ICP
    const sponsorEps = eps.filter((ep: any) => ep.sponsor_tier && ep.organization_id);
    const seenSponsorOrgs = new Set<string>();
    const topSponsors: Array<{ name: string; tier: string | null; icp: number | null }> = [];
    for (const ep of sponsorEps) {
      if (seenSponsorOrgs.has(ep.organization_id)) continue;
      seenSponsorOrgs.add(ep.organization_id);
      topSponsors.push({
        name: orgNameMap.get(ep.organization_id) ?? "Unknown",
        tier: ep.sponsor_tier,
        icp: orgIcpMap.get(ep.organization_id) ?? null,
      });
    }
    topSponsors.sort((a, b) => (b.icp ?? 0) - (a.icp ?? 0));

    return {
      id: event.id,
      name: event.name,
      event_type: event.event_type ?? null,
      date_start: event.date_start ?? null,
      date_end: event.date_end ?? null,
      location: event.location ?? null,
      website: event.website ?? null,
      speaker_count: speakerCount,
      sponsor_count: sponsorCount,
      contact_count: contactCount,
      org_count: orgSet.size,
      enriched_contact_pct: enrichedContactPct,
      avg_icp: icpCount > 0 ? Math.round(icpSum / icpCount) : null,
      total_signals: totalSignals,
      top_sponsors: topSponsors.slice(0, 5),
    };
  });

  // ── Distinct filter values ─────────────────────────────────────────
  const eventTypes = [...new Set(
    events
      .map((e: any) => e.event_type)
      .filter(Boolean)
  )].sort() as string[];

  const locations = [...new Set(
    events
      .map((e: any) => e.location)
      .filter(Boolean)
  )].sort() as string[];

  return (
    <EventsTableClient
      events={eventRows}
      eventTypes={eventTypes}
      locations={locations}
    />
  );
}
