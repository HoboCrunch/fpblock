import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import {
  ExternalLink,
  Mail,
  Linkedin,
  Twitter,
  Send,
  Phone,
} from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { Tabs } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { OrgStatusIcons } from "@/app/admin/enrichment/components/status-icons";
import { CreateListButton } from "@/components/admin/create-list-button";
import type {
  Event,
  Organization,
  SponsorTier,
} from "@/lib/types/database";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const tierOrder: Record<string, number> = {
  presented_by: 0,
  platinum: 1,
  diamond: 2,
  emerald: 3,
  gold: 4,
  silver: 5,
  bronze: 6,
  copper: 7,
  community: 8,
};

function tierBadge(tier: SponsorTier | null) {
  if (!tier) return null;
  const colors: Record<string, string> = {
    presented_by: "bg-yellow-400/20 text-yellow-300",
    platinum: "bg-slate-300/20 text-slate-200",
    diamond: "bg-cyan-400/20 text-cyan-300",
    emerald: "bg-emerald-400/20 text-emerald-300",
    gold: "bg-amber-400/20 text-amber-300",
    silver: "bg-gray-400/20 text-gray-300",
    bronze: "bg-orange-600/20 text-orange-400",
    copper: "bg-orange-800/20 text-orange-500",
    community: "bg-purple-400/20 text-purple-300",
  };
  return (
    <span
      className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
        colors[tier] || "bg-white/10 text-white/60"
      }`}
    >
      {tier.replace("_", " ")}
    </span>
  );
}

function icpBadgeVariant(score: number | null) {
  if (score === null) return "default";
  if (score >= 90) return "replied";
  if (score >= 75) return "scheduled";
  return "default";
}

function seniorityBadgeVariant(s: string | null) {
  if (!s) return "default";
  const lower = s.toLowerCase();
  if (lower.includes("c-level") || lower.includes("founder") || lower.includes("ceo") || lower.includes("cto") || lower.includes("cfo")) return "c-level";
  if (lower.includes("vp") || lower.includes("vice president")) return "vp";
  if (lower.includes("director")) return "director";
  return "default";
}

function getInitials(name: string) {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function EventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  // ---------- Event ----------
  const { data: event } = await supabase
    .from("events")
    .select("*")
    .eq("id", id)
    .single();

  if (!event) notFound();

  // ---------- Participations (this event only) ----------
  const { data: participations } = await supabase
    .from("event_participations")
    .select("*, organization:organizations(*)")
    .eq("event_id", id);

  const speakerRoles = new Set(["speaker", "panelist", "mc"]);
  const sponsorRoles = new Set(["sponsor", "partner", "exhibitor"]);
  // Person roles that aren't speaker-like: imported attendee/organizer/media
  // rows land here so every imported participation is rendered somewhere.
  const attendeeRoles = new Set(["attendee", "organizer", "media"]);

  const speakerPersonIds = Array.from(
    new Set(
      (participations || [])
        .filter((p: any) => speakerRoles.has(p.role) && p.person_id)
        .map((p: any) => p.person_id as string)
    )
  );

  const attendeePersonIds = Array.from(
    new Set(
      (participations || [])
        .filter((p: any) => attendeeRoles.has(p.role) && p.person_id)
        .map((p: any) => p.person_id as string)
    )
  );

  const sponsorOrgIds = Array.from(
    new Set(
      (participations || [])
        .filter((p: any) => sponsorRoles.has(p.role) && p.organization_id)
        .map((p: any) => p.organization_id as string)
    )
  );

  // Person IDs we need person/org details for (speakers + attendee-like rows).
  const personDetailIds = Array.from(
    new Set([...speakerPersonIds, ...attendeePersonIds])
  );

  // ---------- Speakers: enrich from persons_with_icp view (icp_score + primary_org_name) ----------
  const speakerPersonsMap = new Map<string, any>();
  if (personDetailIds.length > 0) {
    const { data: speakerPersons } = await supabase
      .from("persons_with_icp")
      .select("*")
      .in("id", personDetailIds);
    for (const p of speakerPersons || []) {
      speakerPersonsMap.set(p.id, p);
    }
  }

  // ---------- Speakers' primary org (filtered to relevant person_ids — fixes 1000-row truncation bug) ----------
  const speakerOrgMap = new Map<string, { id: string; name: string }>();
  if (personDetailIds.length > 0) {
    const { data: speakerOrgLinks } = await supabase
      .from("person_organization")
      .select("person_id, is_primary, organization:organizations(id, name)")
      .in("person_id", personDetailIds);
    // Prefer is_primary, fall back to any
    for (const link of speakerOrgLinks || []) {
      const org = Array.isArray((link as any).organization)
        ? (link as any).organization[0]
        : (link as any).organization;
      if (!org) continue;
      const existing = speakerOrgMap.get((link as any).person_id);
      if (!existing || (link as any).is_primary) {
        speakerOrgMap.set((link as any).person_id, { id: org.id, name: org.name });
      }
    }
  }

  // ---------- Sponsors: enrich with signal_count + total events count ----------
  const sponsorSignalMap = new Map<string, number>();
  const sponsorTotalEventsMap = new Map<string, number>();

  if (sponsorOrgIds.length > 0) {
    const [signalsRes, allOrgEventsRes] = await Promise.all([
      supabase
        .from("organization_signals")
        .select("organization_id")
        .in("organization_id", sponsorOrgIds),
      supabase
        .from("event_participations")
        .select("organization_id, event_id")
        .in("organization_id", sponsorOrgIds)
        .not("organization_id", "is", null),
    ]);

    for (const sig of signalsRes.data || []) {
      sponsorSignalMap.set(
        (sig as any).organization_id,
        (sponsorSignalMap.get((sig as any).organization_id) ?? 0) + 1
      );
    }

    const distinctEventsByOrg = new Map<string, Set<string>>();
    for (const ep of allOrgEventsRes.data || []) {
      const orgId = (ep as any).organization_id;
      const evId = (ep as any).event_id;
      if (!orgId || !evId) continue;
      if (!distinctEventsByOrg.has(orgId)) distinctEventsByOrg.set(orgId, new Set());
      distinctEventsByOrg.get(orgId)!.add(evId);
    }
    for (const [orgId, set] of distinctEventsByOrg) {
      sponsorTotalEventsMap.set(orgId, set.size);
    }
  }

  // ---------- Person counts per sponsor org (total + enriched-from-org) ----------
  const sponsorPersonCountMap = new Map<string, number>();
  const sponsorEnrichedPersonCountMap = new Map<string, number>();
  if (sponsorOrgIds.length > 0) {
    const { data: sponsorPersonLinks } = await supabase
      .from("person_organization")
      .select("organization_id, source")
      .in("organization_id", sponsorOrgIds);
    for (const link of sponsorPersonLinks || []) {
      const orgId = (link as any).organization_id;
      sponsorPersonCountMap.set(orgId, (sponsorPersonCountMap.get(orgId) ?? 0) + 1);
      if ((link as any).source === "org_enrichment") {
        sponsorEnrichedPersonCountMap.set(
          orgId,
          (sponsorEnrichedPersonCountMap.get(orgId) ?? 0) + 1
        );
      }
    }
  }

  // ---------- Derive datasets ----------

  type SpeakerRow = {
    participationId: string;
    person_id: string;
    role: string | null;
    talk_title: string | null;
    track: string | null;
    time_slot: string | null;
    room: string | null;
    full_name: string;
    title: string | null;
    photo_url: string | null;
    seniority: string | null;
    icp_score: number | null;
    email: string | null;
    linkedin_url: string | null;
    twitter_handle: string | null;
    telegram_handle: string | null;
    phone: string | null;
    org: { id: string; name: string } | null;
  };

  type SponsorRow = {
    participationId: string;
    organization_id: string;
    sponsor_tier: SponsorTier | null;
    role: string | null;
    name: string;
    logo_url: string | null;
    category: string | null;
    icp_score: number | null;
    description: string | null;
    enrichment_stages: Organization["enrichment_stages"] | null;
    enriched_person_count: number;
    signal_count: number;
    total_events: number;
    person_count: number;
  };

  const speakers: SpeakerRow[] = (participations || [])
    .filter((p: any) => speakerRoles.has(p.role) && p.person_id)
    .map((p: any) => {
      const person = speakerPersonsMap.get(p.person_id);
      const org = speakerOrgMap.get(p.person_id) ?? null;
      return {
        participationId: p.id,
        person_id: p.person_id,
        role: p.role ?? null,
        talk_title: p.talk_title ?? null,
        track: p.track ?? null,
        time_slot: p.time_slot ?? null,
        room: p.room ?? null,
        full_name: person?.full_name ?? "Unknown",
        title: person?.title ?? null,
        photo_url: person?.photo_url ?? null,
        seniority: person?.seniority ?? null,
        icp_score: person?.icp_score ?? null,
        email: person?.email ?? null,
        linkedin_url: person?.linkedin_url ?? null,
        twitter_handle: person?.twitter_handle ?? null,
        telegram_handle: person?.telegram_handle ?? null,
        phone: person?.phone ?? null,
        org: person?.primary_org_name
          ? { id: org?.id ?? "", name: person.primary_org_name }
          : org,
      };
    });

  // ---------- Attendees / Other (attendee · organizer · media person rows) ----------
  const attendees: SpeakerRow[] = (participations || [])
    .filter((p: any) => attendeeRoles.has(p.role) && p.person_id)
    .map((p: any) => {
      const person = speakerPersonsMap.get(p.person_id);
      const org = speakerOrgMap.get(p.person_id) ?? null;
      return {
        participationId: p.id,
        person_id: p.person_id,
        role: p.role ?? null,
        talk_title: p.talk_title ?? null,
        track: p.track ?? null,
        time_slot: p.time_slot ?? null,
        room: p.room ?? null,
        full_name: person?.full_name ?? "Unknown",
        title: person?.title ?? null,
        photo_url: person?.photo_url ?? null,
        seniority: person?.seniority ?? null,
        icp_score: person?.icp_score ?? null,
        email: person?.email ?? null,
        linkedin_url: person?.linkedin_url ?? null,
        twitter_handle: person?.twitter_handle ?? null,
        telegram_handle: person?.telegram_handle ?? null,
        phone: person?.phone ?? null,
        org: person?.primary_org_name
          ? { id: org?.id ?? "", name: person.primary_org_name }
          : org,
      };
    });

  const sponsors: SponsorRow[] = (participations || [])
    .filter((p: any) => sponsorRoles.has(p.role) && p.organization_id)
    .map((p: any) => {
      const org: Organization | null = p.organization ?? null;
      return {
        participationId: p.id,
        organization_id: p.organization_id,
        sponsor_tier: p.sponsor_tier ?? null,
        role: p.role ?? null,
        name: org?.name ?? "Unknown",
        logo_url: org?.logo_url ?? null,
        category: org?.category ?? null,
        icp_score: org?.icp_score ?? null,
        description: org?.description ?? null,
        enrichment_stages: org?.enrichment_stages ?? null,
        enriched_person_count: sponsorEnrichedPersonCountMap.get(p.organization_id) ?? 0,
        signal_count: sponsorSignalMap.get(p.organization_id) ?? 0,
        total_events: sponsorTotalEventsMap.get(p.organization_id) ?? 0,
        person_count: sponsorPersonCountMap.get(p.organization_id) ?? 0,
      };
    });

  sponsors.sort(
    (a, b) =>
      (tierOrder[a.sponsor_tier || "community"] ?? 99) -
      (tierOrder[b.sponsor_tier || "community"] ?? 99)
  );

  // ---------- Org-affiliated contacts ----------
  const { data: affiliationRows } = await supabase
    .from("person_event_affiliations")
    .select("person_id, via_organization_id")
    .eq("event_id", id);

  const directPersonIds = new Set(
    (participations || [])
      .map((p: any) => p.person_id)
      .filter((pid: any): pid is string => Boolean(pid))
  );

  const affRows = (affiliationRows ?? []).filter(
    (r) => !directPersonIds.has(r.person_id)
  );

  const byPerson = new Map<string, string[]>();
  for (const r of affRows) {
    const arr = byPerson.get(r.person_id) ?? [];
    arr.push(r.via_organization_id);
    byPerson.set(r.person_id, arr);
  }

  const relatedPersonIds = Array.from(byPerson.keys());

  const relatedPersonsMap: Record<string, any> = {};
  if (relatedPersonIds.length > 0) {
    const { data: relatedPersons } = await supabase
      .from("persons_with_icp")
      .select("*")
      .in("id", relatedPersonIds);
    for (const rp of relatedPersons || []) {
      relatedPersonsMap[rp.id] = rp;
    }
  }

  const viaOrgIds = Array.from(new Set(affRows.map((r) => r.via_organization_id)));
  const viaOrgs = viaOrgIds.length > 0
    ? (await supabase.from("organizations").select("id, name").in("id", viaOrgIds)).data ?? []
    : [];
  const orgNameById: Record<string, string> = Object.fromEntries(
    viaOrgs.map((o) => [o.id, o.name])
  );

  type RelatedContactRow = {
    person: any;
    viaOrgs: { id: string; name: string | null }[];
  };

  const relatedContactRows: RelatedContactRow[] = relatedPersonIds
    .filter((pid) => relatedPersonsMap[pid])
    .map((pid) => ({
      person: relatedPersonsMap[pid]!,
      viaOrgs: (byPerson.get(pid) ?? []).map((orgId) => ({
        id: orgId,
        name: orgNameById[orgId] ?? null,
      })),
    }));

  // Schedule: group speakers by track (fallback to time_slot)
  const scheduleGroups: Record<string, SpeakerRow[]> = {};
  for (const s of speakers) {
    const groupKey = s.track || s.time_slot || "Unscheduled";
    if (!scheduleGroups[groupKey]) scheduleGroups[groupKey] = [];
    scheduleGroups[groupKey].push(s);
  }

  const sortedGroupKeys = Object.keys(scheduleGroups).sort((a, b) => {
    if (a === "Unscheduled") return 1;
    if (b === "Unscheduled") return -1;
    return a.localeCompare(b);
  });

  // ---------- Formatters ----------

  function formatDate(dateStr: string | null) {
    if (!dateStr) return null;
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  // ---------- Render ----------

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold font-[family-name:var(--font-heading)]">
          {(event as Event).name}
        </h1>
        <div className="flex items-center gap-3 mt-1">
          <p className="text-[var(--text-muted)] text-sm">
            {(event as Event).location}
            {(event as Event).date_start &&
              ` · ${formatDate((event as Event).date_start)}`}
            {(event as Event).date_end &&
              ` — ${formatDate((event as Event).date_end)}`}
          </p>
          {(event as Event).event_type && (
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-[var(--accent-orange)]/15 text-[var(--accent-orange)]">
              {(event as Event).event_type}
            </span>
          )}
          {(event as Event).website && (
            <a
              href={(event as Event).website!}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--text-muted)] hover:text-white transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          )}
        </div>
      </div>

      {/* Tabs */}
      <GlassCard padding={false} className="p-2">
        <Tabs
          tabs={[
            // ==================== SPEAKERS ====================
            {
              id: "speakers",
              label: `Speakers (${speakers.length})`,
              action: (
                <CreateListButton
                  personIds={speakerPersonIds}
                  defaultName={`${(event as Event).name} – Speakers`}
                />
              ),
              content: (
                <div className="p-3">
                  {speakers.length === 0 ? (
                    <p className="text-[var(--text-muted)] text-sm py-4 text-center">
                      No speakers registered.
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-[var(--text-muted)] border-b border-white/[0.06] text-[11px] uppercase tracking-wider">
                            <th className="pb-2 pr-3 font-medium">Name</th>
                            <th className="pb-2 pr-3 font-medium">Org</th>
                            <th className="pb-2 pr-3 font-medium">ICP</th>
                            <th className="pb-2 pr-3 font-medium">Channels</th>
                            <th className="pb-2 pr-3 font-medium">Role</th>
                            <th className="pb-2 pr-3 font-medium">Talk</th>
                            <th className="pb-2 pr-3 font-medium">Track</th>
                            <th className="pb-2 font-medium">Time</th>
                          </tr>
                        </thead>
                        <tbody>
                          {speakers.map((s) => (
                            <tr
                              key={s.participationId}
                              className="border-b border-white/[0.04] hover:bg-white/[0.02]"
                            >
                              {/* Name + photo + title */}
                              <td className="py-2 pr-3">
                                <Link
                                  href={`/admin/persons/${s.person_id}`}
                                  className="flex items-center gap-2 min-w-0 group"
                                >
                                  {s.photo_url ? (
                                    <Image
                                      src={s.photo_url}
                                      alt=""
                                      width={28}
                                      height={28}
                                      className="w-7 h-7 rounded-full object-cover flex-shrink-0"
                                      unoptimized
                                    />
                                  ) : (
                                    <div className="w-7 h-7 rounded-full bg-white/[0.06] flex items-center justify-center text-[10px] font-medium text-[var(--text-muted)] flex-shrink-0">
                                      {getInitials(s.full_name)}
                                    </div>
                                  )}
                                  <div className="min-w-0 leading-tight">
                                    <div className="text-xs font-medium text-white truncate group-hover:text-[var(--accent-orange)] transition-colors">
                                      {s.full_name}
                                    </div>
                                    {s.title && (
                                      <div className="text-[10px] text-[var(--text-muted)] truncate max-w-[200px]">
                                        {s.title}
                                      </div>
                                    )}
                                  </div>
                                </Link>
                              </td>
                              {/* Org */}
                              <td className="py-2 pr-3">
                                {s.org ? (
                                  s.org.id ? (
                                    <Link
                                      href={`/admin/organizations/${s.org.id}`}
                                      className="text-xs text-[var(--text-secondary)] hover:text-[var(--accent-orange)] transition-colors truncate block max-w-[160px]"
                                    >
                                      {s.org.name}
                                    </Link>
                                  ) : (
                                    <span className="text-xs text-[var(--text-secondary)] truncate block max-w-[160px]">
                                      {s.org.name}
                                    </span>
                                  )
                                ) : (
                                  <span className="text-[var(--text-muted)] text-xs">&mdash;</span>
                                )}
                                {s.seniority && (
                                  <Badge
                                    variant={seniorityBadgeVariant(s.seniority)}
                                    className="text-[9px] px-1 py-0 mt-0.5"
                                  >
                                    {s.seniority}
                                  </Badge>
                                )}
                              </td>
                              {/* ICP */}
                              <td className="py-2 pr-3">
                                {s.icp_score !== null ? (
                                  <Badge
                                    variant={icpBadgeVariant(s.icp_score)}
                                    className="text-[10px] px-1.5 py-0"
                                  >
                                    {s.icp_score}
                                  </Badge>
                                ) : (
                                  <span className="text-[var(--text-muted)] text-xs">&mdash;</span>
                                )}
                              </td>
                              {/* Channels */}
                              <td className="py-2 pr-3">
                                <div className="flex items-center gap-0.5">
                                  <Mail
                                    className={`w-3 h-3 ${s.email ? "text-[var(--text-secondary)]" : "text-white/[0.1]"}`}
                                  />
                                  <Linkedin
                                    className={`w-3 h-3 ${s.linkedin_url ? "text-[var(--text-secondary)]" : "text-white/[0.1]"}`}
                                  />
                                  <Twitter
                                    className={`w-3 h-3 ${s.twitter_handle ? "text-[var(--text-secondary)]" : "text-white/[0.1]"}`}
                                  />
                                  <Send
                                    className={`w-3 h-3 ${s.telegram_handle ? "text-[var(--text-secondary)]" : "text-white/[0.1]"}`}
                                  />
                                  <Phone
                                    className={`w-3 h-3 ${s.phone ? "text-[var(--text-secondary)]" : "text-white/[0.1]"}`}
                                  />
                                </div>
                              </td>
                              {/* Role */}
                              <td className="py-2 pr-3 text-[var(--text-muted)] text-xs capitalize">
                                {s.role || "—"}
                              </td>
                              {/* Talk */}
                              <td className="py-2 pr-3 text-[var(--text-secondary)] text-xs">
                                <span className="truncate block max-w-[220px]" title={s.talk_title || ""}>
                                  {s.talk_title || "—"}
                                </span>
                              </td>
                              {/* Track */}
                              <td className="py-2 pr-3 text-[var(--text-muted)] text-xs">
                                {s.track || "—"}
                              </td>
                              {/* Time */}
                              <td className="py-2 text-[var(--text-muted)] text-xs">
                                {s.time_slot || "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ),
            },

            // ==================== SPONSORS ====================
            {
              id: "sponsors",
              label: `Sponsors (${sponsors.length})`,
              content: (
                <div className="p-3">
                  {sponsors.length === 0 ? (
                    <p className="text-[var(--text-muted)] text-sm py-4 text-center">
                      No sponsors registered.
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-[var(--text-muted)] border-b border-white/[0.06] text-[11px] uppercase tracking-wider">
                            <th className="pb-2 pr-3 font-medium">Name</th>
                            <th className="pb-2 pr-3 font-medium">Tier</th>
                            <th className="pb-2 pr-3 font-medium">ICP</th>
                            <th className="pb-2 pr-3 font-medium">People</th>
                            <th className="pb-2 pr-3 font-medium">Signals</th>
                            <th className="pb-2 pr-3 font-medium">Total Events</th>
                            <th className="pb-2 font-medium">Enrichment</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sponsors.map((s) => (
                            <tr
                              key={s.participationId}
                              className="border-b border-white/[0.04] hover:bg-white/[0.02]"
                            >
                              {/* Name + logo + category */}
                              <td className="py-2 pr-3">
                                <Link
                                  href={`/admin/organizations/${s.organization_id}`}
                                  className="flex items-center gap-2 min-w-0 group"
                                >
                                  {s.logo_url ? (
                                    <Image
                                      src={s.logo_url}
                                      alt=""
                                      width={24}
                                      height={24}
                                      className="w-6 h-6 rounded object-cover flex-shrink-0"
                                      unoptimized
                                    />
                                  ) : (
                                    <div className="w-6 h-6 rounded bg-white/[0.06] flex items-center justify-center text-[10px] font-medium text-[var(--text-muted)] flex-shrink-0">
                                      {s.name.charAt(0).toUpperCase()}
                                    </div>
                                  )}
                                  <div className="min-w-0 leading-tight">
                                    <div className="text-xs font-medium text-white truncate group-hover:text-[var(--accent-orange)] transition-colors">
                                      {s.name}
                                    </div>
                                    {s.category && (
                                      <div className="text-[10px] text-[var(--text-muted)] truncate max-w-[180px]">
                                        {s.category}
                                      </div>
                                    )}
                                  </div>
                                </Link>
                              </td>
                              {/* Tier */}
                              <td className="py-2 pr-3">{tierBadge(s.sponsor_tier)}</td>
                              {/* ICP */}
                              <td className="py-2 pr-3">
                                {s.icp_score !== null ? (
                                  <Badge
                                    variant={icpBadgeVariant(s.icp_score)}
                                    className="text-[10px] px-1.5 py-0"
                                  >
                                    {s.icp_score}
                                  </Badge>
                                ) : (
                                  <span className="text-[var(--text-muted)] text-xs">&mdash;</span>
                                )}
                              </td>
                              {/* People */}
                              <td className="py-2 pr-3 text-xs">
                                {s.person_count > 0 ? (
                                  <span className="text-[var(--text-secondary)]">
                                    {s.person_count}
                                  </span>
                                ) : (
                                  <span className="text-[var(--text-muted)]">&mdash;</span>
                                )}
                              </td>
                              {/* Signals */}
                              <td className="py-2 pr-3 text-xs">
                                {s.signal_count > 0 ? (
                                  <span className="text-[var(--text-secondary)]">
                                    {s.signal_count}
                                  </span>
                                ) : (
                                  <span className="text-[var(--text-muted)]">&mdash;</span>
                                )}
                              </td>
                              {/* Total Events */}
                              <td className="py-2 pr-3 text-xs">
                                {s.total_events > 0 ? (
                                  <span className="text-[var(--text-secondary)]">
                                    {s.total_events}
                                  </span>
                                ) : (
                                  <span className="text-[var(--text-muted)]">&mdash;</span>
                                )}
                              </td>
                              {/* Enrichment */}
                              <td className="py-2">
                                <OrgStatusIcons
                                  stages={s.enrichment_stages}
                                  orgData={{
                                    icp_score: s.icp_score,
                                    description: s.description,
                                    enriched_person_count: s.enriched_person_count,
                                  }}
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ),
            },

            // ==================== ATTENDEES / OTHER ====================
            {
              id: "attendees",
              label: `Attendees / Other (${attendees.length})`,
              action: (
                <CreateListButton
                  personIds={attendeePersonIds}
                  defaultName={`${(event as Event).name} – Attendees`}
                />
              ),
              content: (
                <div className="p-3">
                  {attendees.length === 0 ? (
                    <p className="text-[var(--text-muted)] text-sm py-4 text-center">
                      No attendees, organizers, or media contacts registered.
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-[var(--text-muted)] border-b border-white/[0.06] text-[11px] uppercase tracking-wider">
                            <th className="pb-2 pr-3 font-medium">Name</th>
                            <th className="pb-2 pr-3 font-medium">Org</th>
                            <th className="pb-2 pr-3 font-medium">ICP</th>
                            <th className="pb-2 pr-3 font-medium">Channels</th>
                            <th className="pb-2 font-medium">Role</th>
                          </tr>
                        </thead>
                        <tbody>
                          {attendees.map((s) => (
                            <tr
                              key={s.participationId}
                              className="border-b border-white/[0.04] hover:bg-white/[0.02]"
                            >
                              {/* Name + photo + title */}
                              <td className="py-2 pr-3">
                                <Link
                                  href={`/admin/persons/${s.person_id}`}
                                  className="flex items-center gap-2 min-w-0 group"
                                >
                                  {s.photo_url ? (
                                    <Image
                                      src={s.photo_url}
                                      alt=""
                                      width={28}
                                      height={28}
                                      className="w-7 h-7 rounded-full object-cover flex-shrink-0"
                                      unoptimized
                                    />
                                  ) : (
                                    <div className="w-7 h-7 rounded-full bg-white/[0.06] flex items-center justify-center text-[10px] font-medium text-[var(--text-muted)] flex-shrink-0">
                                      {getInitials(s.full_name)}
                                    </div>
                                  )}
                                  <div className="min-w-0 leading-tight">
                                    <div className="text-xs font-medium text-white truncate group-hover:text-[var(--accent-orange)] transition-colors">
                                      {s.full_name}
                                    </div>
                                    {s.title && (
                                      <div className="text-[10px] text-[var(--text-muted)] truncate max-w-[200px]">
                                        {s.title}
                                      </div>
                                    )}
                                  </div>
                                </Link>
                              </td>
                              {/* Org */}
                              <td className="py-2 pr-3">
                                {s.org ? (
                                  s.org.id ? (
                                    <Link
                                      href={`/admin/organizations/${s.org.id}`}
                                      className="text-xs text-[var(--text-secondary)] hover:text-[var(--accent-orange)] transition-colors truncate block max-w-[160px]"
                                    >
                                      {s.org.name}
                                    </Link>
                                  ) : (
                                    <span className="text-xs text-[var(--text-secondary)] truncate block max-w-[160px]">
                                      {s.org.name}
                                    </span>
                                  )
                                ) : (
                                  <span className="text-[var(--text-muted)] text-xs">&mdash;</span>
                                )}
                                {s.seniority && (
                                  <Badge
                                    variant={seniorityBadgeVariant(s.seniority)}
                                    className="text-[9px] px-1 py-0 mt-0.5"
                                  >
                                    {s.seniority}
                                  </Badge>
                                )}
                              </td>
                              {/* ICP */}
                              <td className="py-2 pr-3">
                                {s.icp_score !== null ? (
                                  <Badge
                                    variant={icpBadgeVariant(s.icp_score)}
                                    className="text-[10px] px-1.5 py-0"
                                  >
                                    {s.icp_score}
                                  </Badge>
                                ) : (
                                  <span className="text-[var(--text-muted)] text-xs">&mdash;</span>
                                )}
                              </td>
                              {/* Channels */}
                              <td className="py-2 pr-3">
                                <div className="flex items-center gap-0.5">
                                  <Mail
                                    className={`w-3 h-3 ${s.email ? "text-[var(--text-secondary)]" : "text-white/[0.1]"}`}
                                  />
                                  <Linkedin
                                    className={`w-3 h-3 ${s.linkedin_url ? "text-[var(--text-secondary)]" : "text-white/[0.1]"}`}
                                  />
                                  <Twitter
                                    className={`w-3 h-3 ${s.twitter_handle ? "text-[var(--text-secondary)]" : "text-white/[0.1]"}`}
                                  />
                                  <Send
                                    className={`w-3 h-3 ${s.telegram_handle ? "text-[var(--text-secondary)]" : "text-white/[0.1]"}`}
                                  />
                                  <Phone
                                    className={`w-3 h-3 ${s.phone ? "text-[var(--text-secondary)]" : "text-white/[0.1]"}`}
                                  />
                                </div>
                              </td>
                              {/* Role */}
                              <td className="py-2 text-[var(--text-muted)] text-xs capitalize">
                                {s.role || "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ),
            },

            // ==================== ORG-AFFILIATED CONTACTS ====================
            {
              id: "related",
              label: `Org-affiliated (${relatedContactRows.length})`,
              action: (
                <CreateListButton
                  personIds={relatedContactRows.map((r) => r.person.id)}
                  defaultName={`${(event as Event).name} – Org-affiliated`}
                />
              ),
              content: (
                <div className="p-3">
                  {relatedContactRows.length === 0 ? (
                    <p className="text-[var(--text-muted)] text-sm py-4 text-center">
                      No org-affiliated contacts found. Persons linked to a participating
                      organization (but not directly participating themselves) will appear
                      here.
                    </p>
                  ) : (
                    <div className="divide-y divide-white/[0.04]">
                      {relatedContactRows.map((row) => (
                        <div
                          key={row.person.id}
                          className="flex items-center justify-between py-2 gap-3"
                        >
                          <Link
                            href={`/admin/persons/${row.person.id}`}
                            className="flex items-center gap-2 min-w-0 group flex-1"
                          >
                            {row.person.photo_url ? (
                              <Image
                                src={row.person.photo_url}
                                alt=""
                                width={24}
                                height={24}
                                className="w-6 h-6 rounded-full object-cover flex-shrink-0"
                                unoptimized
                              />
                            ) : (
                              <div className="w-6 h-6 rounded-full bg-white/[0.06] flex items-center justify-center text-[10px] font-medium text-[var(--text-muted)] flex-shrink-0">
                                {getInitials(row.person.full_name)}
                              </div>
                            )}
                            <div className="min-w-0 leading-tight">
                              <div className="text-xs text-white truncate group-hover:text-[var(--accent-orange)] transition-colors">
                                {row.person.full_name}
                              </div>
                              {row.person.title && (
                                <div className="text-[10px] text-[var(--text-muted)] truncate">
                                  {row.person.title}
                                </div>
                              )}
                            </div>
                          </Link>
                          <div className="flex items-center gap-2">
                            {row.person.icp_score !== null && row.person.icp_score !== undefined && (
                              <Badge
                                variant={icpBadgeVariant(row.person.icp_score)}
                                className="text-[10px] px-1.5 py-0"
                              >
                                {row.person.icp_score}
                              </Badge>
                            )}
                            <div className="flex items-center gap-0.5">
                              <Mail
                                className={`w-3 h-3 ${row.person.email ? "text-[var(--text-secondary)]" : "text-white/[0.1]"}`}
                              />
                              <Linkedin
                                className={`w-3 h-3 ${row.person.linkedin_url ? "text-[var(--text-secondary)]" : "text-white/[0.1]"}`}
                              />
                              <Twitter
                                className={`w-3 h-3 ${row.person.twitter_handle ? "text-[var(--text-secondary)]" : "text-white/[0.1]"}`}
                              />
                              <Send
                                className={`w-3 h-3 ${row.person.telegram_handle ? "text-[var(--text-secondary)]" : "text-white/[0.1]"}`}
                              />
                              <Phone
                                className={`w-3 h-3 ${row.person.phone ? "text-[var(--text-secondary)]" : "text-white/[0.1]"}`}
                              />
                            </div>
                            <div className="flex gap-1 flex-wrap justify-end">
                              {row.viaOrgs.map((o) => (
                                <Link
                                  key={o.id}
                                  href={`/admin/organizations/${o.id}`}
                                  className="px-2 py-0.5 text-xs rounded bg-white/10 hover:bg-white/20"
                                >
                                  via {o.name ?? "—"}
                                </Link>
                              ))}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ),
            },

            // ==================== SCHEDULE ====================
            {
              id: "schedule",
              label: "Schedule",
              content: (
                <div className="p-3 space-y-6">
                  {sortedGroupKeys.length === 0 ? (
                    <p className="text-[var(--text-muted)] text-sm py-4 text-center">
                      No schedule data available.
                    </p>
                  ) : (
                    sortedGroupKeys.map((groupKey) => (
                      <div key={groupKey}>
                        <h3 className="text-sm font-semibold text-[var(--text-secondary)] mb-2 uppercase tracking-wider">
                          {groupKey}
                        </h3>
                        <div className="space-y-1">
                          {scheduleGroups[groupKey].map((s) => (
                            <div
                              key={s.participationId}
                              className="flex items-center gap-4 py-2 px-3 rounded-lg hover:bg-white/[0.02] border border-transparent hover:border-white/[0.04]"
                            >
                              {s.time_slot && (
                                <span className="text-xs text-[var(--accent-orange)] font-mono w-20 flex-shrink-0">
                                  {s.time_slot}
                                </span>
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-white truncate">
                                  {s.talk_title || "Untitled"}
                                </p>
                                <p className="text-xs text-[var(--text-muted)]">
                                  <Link
                                    href={`/admin/persons/${s.person_id}`}
                                    className="hover:text-white transition-colors"
                                  >
                                    {s.full_name}
                                  </Link>
                                  {s.org?.name && (
                                    <span className="text-[var(--text-muted)]">
                                      {" · "}
                                      {s.org.name}
                                    </span>
                                  )}
                                </p>
                              </div>
                              {s.room && (
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.06] text-[var(--text-muted)] flex-shrink-0">
                                  {s.room}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              ),
            },

          ]}
        />
      </GlassCard>
    </div>
  );
}
