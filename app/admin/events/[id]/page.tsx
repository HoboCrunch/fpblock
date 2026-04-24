import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { GlassCard } from "@/components/ui/glass-card";
import { Tabs } from "@/components/ui/tabs";
import Link from "next/link";
import { Calendar, ExternalLink } from "lucide-react";
import type {
  Event,
  EventParticipation,
  Person,
  Organization,
  PersonOrganization,
  Initiative,
  InitiativeEnrollment,
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

function statusBadge(status: string) {
  const colors: Record<string, string> = {
    active: "bg-green-500/15 text-green-400",
    draft: "bg-gray-500/15 text-gray-400",
    paused: "bg-yellow-500/15 text-yellow-400",
    completed: "bg-blue-500/15 text-blue-400",
    archived: "bg-gray-500/15 text-gray-500",
  };
  return (
    <span
      className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
        colors[status] || "bg-white/10 text-white/60"
      }`}
    >
      {status}
    </span>
  );
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

  // ---------- Participations with joins ----------
  const { data: participations } = await supabase
    .from("event_participations")
    .select(
      "*, person:persons(*), organization:organizations(*)"
    )
    .eq("event_id", id);

  // ---------- person_organization for org-person mapping ----------
  const { data: personOrgs } = await supabase
    .from("person_organization")
    .select("*, organization:organizations(id, name)");

  // ---------- Initiatives for this event ----------
  const { data: initiatives } = await supabase
    .from("initiatives")
    .select("*")
    .eq("event_id", id)
    .order("created_at", { ascending: false });

  // Enrollment counts per initiative
  const initIds = (initiatives || []).map((i: Initiative) => i.id);
  const { data: enrollments } = initIds.length
    ? await supabase
        .from("initiative_enrollments")
        .select("initiative_id")
        .in("initiative_id", initIds)
    : { data: [] as InitiativeEnrollment[] };

  const enrollCountByInit: Record<string, number> = {};
  for (const e of enrollments || []) {
    enrollCountByInit[e.initiative_id] = (enrollCountByInit[e.initiative_id] || 0) + 1;
  }

  // ---------- Derive datasets ----------

  type SpeakerRow = EventParticipation & { person: Person | null; orgName: string | null };
  type SponsorRow = EventParticipation & {
    organization: Organization | null;
    personCount: number;
  };

  // Speakers (+ panelists, MCs)
  const speakerRoles = new Set(["speaker", "panelist", "mc"]);
  const speakers: SpeakerRow[] = (participations || [])
    .filter((p: any) => speakerRoles.has(p.role) && p.person)
    .map((p: any) => {
      // Find primary org for this person (joined org name from person_organization query)
      const po = (personOrgs || []).find(
        (po: any) => po.person_id === p.person_id && po.is_primary
      );
      let orgName: string | null = po?.organization?.name || null;
      // Fallback: any org link for this person
      if (!orgName) {
        const anyPo = (personOrgs || []).find(
          (po: any) => po.person_id === p.person_id
        );
        orgName = anyPo?.organization?.name || null;
      }
      return { ...p, orgName };
    });

  // Sponsors (org-level participations with sponsor/partner/exhibitor role)
  const sponsorRoles = new Set(["sponsor", "partner", "exhibitor"]);
  const sponsorParticipations = (participations || []).filter(
    (p: any) => sponsorRoles.has(p.role) && p.organization
  );

  const sponsors: SponsorRow[] = sponsorParticipations.map((p: any) => {
    const personCount = (personOrgs || []).filter(
      (po: PersonOrganization) => po.organization_id === p.organization_id
    ).length;
    return { ...p, personCount };
  });

  // Sort sponsors by tier
  sponsors.sort(
    (a, b) =>
      (tierOrder[a.sponsor_tier || "community"] ?? 99) -
      (tierOrder[b.sponsor_tier || "community"] ?? 99)
  );

  // Org-affiliated contacts (via participating-org)
  const { data: affiliationRows } = await supabase
    .from("person_event_affiliations")
    .select("person_id, via_organization_id")
    .eq("event_id", id);

  // Dedup rule: if a person is already a direct participant, don't list them here
  const directPersonIds = new Set(
    (participations || [])
      .map((p: any) => p.person_id)
      .filter((pid: any): pid is string => Boolean(pid))
  );

  const affRows = (affiliationRows ?? []).filter(
    (r) => !directPersonIds.has(r.person_id)
  );

  // Group by person to aggregate via-orgs
  const byPerson = new Map<string, string[]>();
  for (const r of affRows) {
    const arr = byPerson.get(r.person_id) ?? [];
    arr.push(r.via_organization_id);
    byPerson.set(r.person_id, arr);
  }

  const relatedPersonIds = Array.from(byPerson.keys());

  let relatedPersonsMap: Record<string, Person> = {};
  if (relatedPersonIds.length > 0) {
    const { data: relatedPersons } = await supabase
      .from("persons")
      .select("*")
      .in("id", relatedPersonIds);
    for (const rp of relatedPersons || []) {
      relatedPersonsMap[rp.id] = rp as Person;
    }
  }

  // Resolve via-org names
  const viaOrgIds = Array.from(new Set(affRows.map((r) => r.via_organization_id)));
  const viaOrgs = viaOrgIds.length > 0
    ? (await supabase.from("organizations").select("id, name").in("id", viaOrgIds)).data ?? []
    : [];
  const orgNameById: Record<string, string> = Object.fromEntries(
    viaOrgs.map((o) => [o.id, o.name])
  );

  type RelatedContactRow = {
    person: Person;
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

  // Sort groups: scheduled first, unscheduled last
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
              ` \u00B7 ${formatDate((event as Event).date_start)}`}
            {(event as Event).date_end &&
              ` \u2014 ${formatDate((event as Event).date_end)}`}
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
                          <tr className="text-left text-[var(--text-muted)] border-b border-white/[0.06]">
                            <th className="pb-2 pr-4 font-medium">Name</th>
                            <th className="pb-2 pr-4 font-medium">Org</th>
                            <th className="pb-2 pr-4 font-medium">Talk</th>
                            <th className="pb-2 pr-4 font-medium">Track</th>
                            <th className="pb-2 font-medium">Time</th>
                          </tr>
                        </thead>
                        <tbody>
                          {speakers.map((s) => (
                            <tr
                              key={s.id}
                              className="border-b border-white/[0.04] hover:bg-white/[0.02]"
                            >
                              <td className="py-2.5 pr-4">
                                {s.person ? (
                                  <Link
                                    href={`/admin/persons/${s.person_id}`}
                                    className="text-white hover:text-[var(--accent-orange)] transition-colors"
                                  >
                                    {s.person.full_name}
                                  </Link>
                                ) : (
                                  <span className="text-[var(--text-muted)]">
                                    Unknown
                                  </span>
                                )}
                              </td>
                              <td className="py-2.5 pr-4 text-[var(--text-secondary)]">
                                {s.orgName || "\u2014"}
                              </td>
                              <td className="py-2.5 pr-4 text-[var(--text-secondary)]">
                                {s.talk_title || "\u2014"}
                              </td>
                              <td className="py-2.5 pr-4 text-[var(--text-muted)]">
                                {s.track || "\u2014"}
                              </td>
                              <td className="py-2.5 text-[var(--text-muted)]">
                                {s.time_slot || "\u2014"}
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
                          <tr className="text-left text-[var(--text-muted)] border-b border-white/[0.06]">
                            <th className="pb-2 pr-4 font-medium">Name</th>
                            <th className="pb-2 pr-4 font-medium">Tier</th>
                            <th className="pb-2 pr-4 font-medium">Category</th>
                            <th className="pb-2 font-medium">People</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sponsors.map((s) => (
                            <tr
                              key={s.id}
                              className="border-b border-white/[0.04] hover:bg-white/[0.02]"
                            >
                              <td className="py-2.5 pr-4">
                                {s.organization ? (
                                  <Link
                                    href={`/admin/organizations/${s.organization_id}`}
                                    className="text-white hover:text-[var(--accent-orange)] transition-colors"
                                  >
                                    {s.organization.name}
                                  </Link>
                                ) : (
                                  <span className="text-[var(--text-muted)]">
                                    Unknown
                                  </span>
                                )}
                              </td>
                              <td className="py-2.5 pr-4">
                                {tierBadge(s.sponsor_tier)}
                              </td>
                              <td className="py-2.5 pr-4 text-[var(--text-secondary)]">
                                {s.organization?.category || "\u2014"}
                              </td>
                              <td className="py-2.5 text-[var(--text-muted)]">
                                {s.personCount}
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
                          className="flex items-center justify-between py-2"
                        >
                          <Link
                            href={`/admin/persons/${row.person.id}`}
                            className="text-white hover:text-[var(--accent-orange)] transition-colors hover:underline"
                          >
                            {row.person.full_name}
                          </Link>
                          <div className="flex gap-1 flex-wrap justify-end">
                            {row.viaOrgs.map((o) => (
                              <Link
                                key={o.id}
                                href={`/admin/organizations/${o.id}`}
                                className="px-2 py-0.5 text-xs rounded bg-white/10 hover:bg-white/20"
                              >
                                via {o.name ?? "\u2014"}
                              </Link>
                            ))}
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
                              key={s.id}
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
                                  {s.person ? (
                                    <Link
                                      href={`/admin/persons/${s.person_id}`}
                                      className="hover:text-white transition-colors"
                                    >
                                      {s.person.full_name}
                                    </Link>
                                  ) : (
                                    "Unknown"
                                  )}
                                  {s.orgName && (
                                    <span className="text-[var(--text-muted)]">
                                      {" \u00B7 "}
                                      {s.orgName}
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

            // ==================== INITIATIVES ====================
            {
              id: "initiatives",
              label: `Initiatives (${(initiatives || []).length})`,
              content: (
                <div className="p-3">
                  {(initiatives || []).length === 0 ? (
                    <p className="text-[var(--text-muted)] text-sm py-4 text-center">
                      No initiatives for this event.
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-[var(--text-muted)] border-b border-white/[0.06]">
                            <th className="pb-2 pr-4 font-medium">Name</th>
                            <th className="pb-2 pr-4 font-medium">Type</th>
                            <th className="pb-2 pr-4 font-medium">Status</th>
                            <th className="pb-2 pr-4 font-medium">Owner</th>
                            <th className="pb-2 font-medium">Enrolled</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(initiatives || []).map((init: Initiative) => (
                            <tr
                              key={init.id}
                              className="border-b border-white/[0.04] hover:bg-white/[0.02]"
                            >
                              <td className="py-2.5 pr-4">
                                <Link
                                  href={`/admin/initiatives/${init.id}`}
                                  className="text-white hover:text-[var(--accent-orange)] transition-colors"
                                >
                                  {init.name}
                                </Link>
                              </td>
                              <td className="py-2.5 pr-4 text-[var(--text-secondary)]">
                                {init.initiative_type || "\u2014"}
                              </td>
                              <td className="py-2.5 pr-4">
                                {statusBadge(init.status)}
                              </td>
                              <td className="py-2.5 pr-4 text-[var(--text-muted)]">
                                {init.owner || "\u2014"}
                              </td>
                              <td className="py-2.5 text-[var(--text-muted)]">
                                {enrollCountByInit[init.id] || 0}
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
          ]}
        />
      </GlassCard>
    </div>
  );
}
