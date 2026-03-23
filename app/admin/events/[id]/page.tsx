import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { GlassCard } from "@/components/ui/glass-card";
import { Tabs } from "@/components/ui/tabs";
import Link from "next/link";
import { Calendar, ExternalLink, CheckCircle2 } from "lucide-react";
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
    .select("*");

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
      // Find primary org for this person
      const po = (personOrgs || []).find(
        (po: PersonOrganization) =>
          po.person_id === p.person_id && po.is_primary
      );
      let orgName: string | null = null;
      if (po) {
        // Find the org in sponsor participations or from person_org join
        const orgPart = (participations || []).find(
          (op: any) => op.organization_id === po.organization_id && op.organization
        );
        orgName = orgPart?.organization?.name || null;
      }
      // Fallback: look for any org link
      if (!orgName) {
        const anyPo = (personOrgs || []).find(
          (po: PersonOrganization) => po.person_id === p.person_id
        );
        if (anyPo) {
          const orgPart = (participations || []).find(
            (op: any) => op.organization_id === anyPo.organization_id && op.organization
          );
          orgName = orgPart?.organization?.name || null;
        }
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

  // Related contacts: persons from sponsoring orgs who are NOT directly in event_participations
  const sponsorOrgIds = new Set(
    sponsorParticipations.map((p: any) => p.organization_id).filter(Boolean)
  );
  const directPersonIds = new Set(
    (participations || []).map((p: any) => p.person_id).filter(Boolean)
  );

  // person_organization entries for sponsor orgs
  const sponsorPersonOrgs = (personOrgs || []).filter(
    (po: PersonOrganization) => sponsorOrgIds.has(po.organization_id) && !directPersonIds.has(po.person_id)
  );

  // We need person details — collect unique person_ids
  const relatedPersonIds = [...new Set(sponsorPersonOrgs.map((po) => po.person_id))];

  // Fetch related persons if any
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

  // Build the org name lookup from participations
  const orgNameMap: Record<string, string> = {};
  for (const p of participations || []) {
    if ((p as any).organization) {
      orgNameMap[(p as any).organization_id] = (p as any).organization.name;
    }
  }

  type RelatedContactRow = {
    person: Person;
    orgName: string | null;
    orgId: string;
  };

  const relatedContacts: RelatedContactRow[] = sponsorPersonOrgs
    .filter((po) => relatedPersonsMap[po.person_id])
    .map((po) => ({
      person: relatedPersonsMap[po.person_id],
      orgName: orgNameMap[po.organization_id] || null,
      orgId: po.organization_id,
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

            // ==================== RELATED CONTACTS ====================
            {
              id: "related",
              label: `Related (${relatedContacts.length})`,
              content: (
                <div className="p-3">
                  {relatedContacts.length === 0 ? (
                    <p className="text-[var(--text-muted)] text-sm py-4 text-center">
                      No related contacts found. Persons from sponsoring organizations who
                      are not directly participating will appear here.
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-[var(--text-muted)] border-b border-white/[0.06]">
                            <th className="pb-2 pr-4 font-medium">Name</th>
                            <th className="pb-2 pr-4 font-medium">Organization</th>
                            <th className="pb-2 pr-4 font-medium">Title</th>
                            <th className="pb-2 font-medium">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {relatedContacts.map((rc) => (
                            <tr
                              key={rc.person.id}
                              className="border-b border-white/[0.04] hover:bg-white/[0.02]"
                            >
                              <td className="py-2.5 pr-4">
                                <Link
                                  href={`/admin/persons/${rc.person.id}`}
                                  className="text-white hover:text-[var(--accent-orange)] transition-colors"
                                >
                                  {rc.person.full_name}
                                </Link>
                              </td>
                              <td className="py-2.5 pr-4">
                                {rc.orgName ? (
                                  <Link
                                    href={`/admin/organizations/${rc.orgId}`}
                                    className="text-[var(--text-secondary)] hover:text-white transition-colors"
                                  >
                                    {rc.orgName}
                                  </Link>
                                ) : (
                                  <span className="text-[var(--text-muted)]">
                                    {"\u2014"}
                                  </span>
                                )}
                              </td>
                              <td className="py-2.5 pr-4 text-[var(--text-muted)]">
                                {rc.person.title || "\u2014"}
                              </td>
                              <td className="py-2.5">
                                <button
                                  className="inline-flex items-center gap-1.5 text-xs text-[var(--accent-orange)] hover:text-[var(--accent-orange)]/80 transition-colors"
                                  title="Mark as confirmed participant"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  Mark as confirmed
                                </button>
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
