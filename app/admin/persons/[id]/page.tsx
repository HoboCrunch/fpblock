import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { GlassCard } from "@/components/ui/glass-card";
import { TwoPanelLayout } from "@/components/admin/two-panel-layout";
import { IdentityCard } from "@/components/admin/identity-card";
import { DataCompleteness } from "@/components/admin/data-completeness";
import { PersonCorrelationSummary } from "@/components/admin/person-correlation-summary";
import { InteractionsTimeline } from "@/components/admin/interactions-timeline";
import { SignalsTimeline } from "@/components/admin/signals-timeline";
import { PersonNotesEditor } from "./notes-editor";
import { AddToListDropdown } from "./add-to-list-dropdown";

function icpBadgeVariant(score: number | null) {
  if (score === null) return "default";
  if (score >= 90) return "replied";
  if (score >= 75) return "scheduled";
  return "default";
}

export default async function PersonDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  // ── Fetch person ───────────────────────────────────────────────────
  const { data: person } = await supabase
    .from("persons")
    .select("*")
    .eq("id", id)
    .single();

  if (!person) notFound();

  // ── Parallel data fetches ──────────────────────────────────────────
  const [
    { data: affiliations },
    { data: eventParticipations },
    { data: interactions },
    { data: enrollments },
    { data: lists },
  ] = await Promise.all([
    supabase
      .from("person_organization")
      .select("*, organization:organizations(*)")
      .eq("person_id", id),
    supabase
      .from("event_participations")
      .select("*, event:events(*)")
      .eq("person_id", id),
    supabase
      .from("interactions")
      .select("*, organization:organizations(id, name)")
      .eq("person_id", id)
      .order("occurred_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("initiative_enrollments")
      .select("*, initiative:initiatives(*, event:events(id, name))")
      .eq("person_id", id),
    supabase.from("lists").select("id, name").order("name"),
  ]);

  // ── Org-level event participations for correlation summary ─────────
  const orgIds = (affiliations || []).map((a: any) => a.organization?.id).filter(Boolean);
  let orgEventParticipations: any[] = [];
  if (orgIds.length > 0) {
    const { data } = await supabase
      .from("event_participations")
      .select("organization_id, event_id, role, sponsor_tier, event:events(id, name)")
      .in("organization_id", orgIds)
      .not("organization_id", "is", null);
    orgEventParticipations = data ?? [];
  }

  // ── Org signals for signals section ────────────────────────────────
  let orgSignals: any[] = [];
  if (orgIds.length > 0) {
    const { data } = await supabase
      .from("organization_signals")
      .select("*")
      .in("organization_id", orgIds)
      .order("date", { ascending: false, nullsFirst: false });
    orgSignals = data ?? [];
  }

  // ── Derived data ───────────────────────────────────────────────────
  const primaryAff =
    (affiliations || []).find((a: any) => a.is_primary) || (affiliations || [])[0];
  const primaryOrg = primaryAff?.organization;
  const icpScore = primaryOrg?.icp_score ?? null;

  // Correlation summary data
  const personEvents = (eventParticipations || []).map((ep: any) => {
    const evt = Array.isArray(ep.event) ? ep.event[0] : ep.event;
    return {
      event_id: evt?.id ?? "",
      event_name: evt?.name ?? "",
      role: ep.role ?? "",
      talk_title: ep.talk_title ?? null,
      track: ep.track ?? null,
    };
  });

  const personOrgs = (affiliations || []).map((aff: any) => ({
    org_id: aff.organization?.id ?? "",
    org_name: aff.organization?.name ?? "",
    role: aff.role ?? null,
    is_current: aff.is_current ?? false,
    title: person.title ?? null,
  }));

  const orgEventLinks = orgEventParticipations.map((ep: any) => {
    const evt = Array.isArray(ep.event) ? ep.event[0] : ep.event;
    const orgName =
      (affiliations || []).find(
        (a: any) => a.organization?.id === ep.organization_id
      )?.organization?.name ?? "";
    return {
      org_id: ep.organization_id,
      org_name: orgName,
      event_id: evt?.id ?? ep.event_id,
      event_name: evt?.name ?? "",
      tier: ep.sponsor_tier ?? null,
    };
  });

  // Data completeness fields
  const completenessFields = [
    { label: "Email", present: !!person.email },
    { label: "LinkedIn", present: !!person.linkedin_url },
    { label: "Twitter", present: !!person.twitter_handle },
    { label: "Telegram", present: !!person.telegram_handle },
    { label: "Phone", present: !!person.phone },
    { label: "Title", present: !!person.title },
    { label: "Bio", present: !!person.bio },
    { label: "Seniority", present: !!person.seniority },
    { label: "Department", present: !!person.department },
  ];

  // ── Sidebar ────────────────────────────────────────────────────────
  const sidebar = (
    <div className="space-y-4">
      {/* Identity Card */}
      <IdentityCard
        name={person.full_name}
        subtitle={person.title ?? undefined}
        secondaryLine={primaryOrg ? `at ${primaryOrg.name}` : undefined}
        imageUrl={person.photo_url ?? null}
        imageShape="circle"
        icpScore={icpScore}
        contacts={[
          { type: "email", value: person.email },
          { type: "linkedin", value: person.linkedin_url },
          { type: "twitter", value: person.twitter_handle },
          { type: "telegram", value: person.telegram_handle },
          { type: "phone", value: person.phone },
        ]}
        footer={
          <div className="flex items-center gap-3 text-xs">
            {person.source && <span>Source: {person.source}</span>}
            {person.seniority && <span>Seniority: {person.seniority}</span>}
          </div>
        }
      />

      {/* Data Completeness */}
      <DataCompleteness
        fields={completenessFields}
        enrichmentStatus={person.enrichment_status ?? undefined}
        lastEnrichedAt={
          person.last_enriched_at
            ? new Date(person.last_enriched_at).toLocaleDateString()
            : null
        }
      />

      {/* Quick Actions */}
      <GlassCard>
        <h3 className="text-sm font-medium text-white mb-3">Quick Actions</h3>
        <div className="space-y-2">
          <AddToListDropdown personId={id} lists={lists ?? []} />
          {primaryOrg && (
            <Link
              href={`/admin/organizations/${primaryOrg.id}`}
              className="flex items-center gap-2 px-3 py-2 rounded-lg glass hover:bg-white/[0.05] transition-colors text-sm text-[var(--text-secondary)]"
            >
              View Organization
            </Link>
          )}
          <Link
            href="/admin/enrichment"
            className="flex items-center gap-2 px-3 py-2 rounded-lg glass hover:bg-white/[0.05] transition-colors text-sm text-[var(--text-secondary)]"
          >
            Enrich
          </Link>
        </div>
      </GlassCard>

      {/* Outreach Brief */}
      {(icpScore != null || primaryOrg?.icp_reason || primaryOrg?.usp) && (
        <GlassCard>
          <h3 className="text-sm font-medium text-white mb-3">
            Outreach Brief
          </h3>
          <div className="space-y-2">
            {icpScore != null && (
              <div>
                <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">
                  ICP Score
                </div>
                <Badge variant={icpBadgeVariant(icpScore)} className="mt-0.5">
                  {icpScore}
                </Badge>
              </div>
            )}
            {primaryOrg?.icp_reason && (
              <div>
                <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">
                  ICP Reason
                </div>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                  {primaryOrg.icp_reason}
                </p>
              </div>
            )}
            {primaryOrg?.usp && (
              <div>
                <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">
                  Our Angle (USP)
                </div>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                  {primaryOrg.usp}
                </p>
              </div>
            )}
            {primaryOrg?.talking_points && (
              <div>
                <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">
                  Talking Points
                </div>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                  {typeof primaryOrg.talking_points === "string"
                    ? primaryOrg.talking_points
                    : JSON.stringify(primaryOrg.talking_points)}
                </p>
              </div>
            )}
          </div>
        </GlassCard>
      )}

      {/* Notes Editor */}
      <GlassCard>
        <h3 className="text-sm font-medium text-white mb-2">Notes</h3>
        <PersonNotesEditor personId={id} initialNotes={person.notes ?? ""} />
      </GlassCard>
    </div>
  );

  // ── Center Content ─────────────────────────────────────────────────
  return (
    <TwoPanelLayout title={person.full_name} sidebar={sidebar}>
      <div className="space-y-6">
        {/* Correlation Summary */}
        <PersonCorrelationSummary
          personEvents={personEvents}
          personOrgs={personOrgs}
          orgEventLinks={orgEventLinks}
        />

        {/* Bio */}
        {person.bio && (
          <GlassCard>
            <h2 className="text-sm font-medium text-[var(--text-muted)] uppercase tracking-wider mb-2">
              Bio
            </h2>
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
              {person.bio}
            </p>
          </GlassCard>
        )}

        {/* Events & Roles */}
        <div>
          <h2 className="text-lg font-medium font-[family-name:var(--font-heading)] mb-2">
            Events ({(eventParticipations || []).length})
          </h2>
          <GlassCard padding={false}>
            {(eventParticipations || []).length === 0 ? (
              <div className="px-5 py-8 text-center">
                <p className="text-sm text-[var(--text-muted)]">
                  No event participations.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[var(--text-muted)] border-b border-[var(--glass-border)]">
                      <th className="px-5 py-3 font-medium">Event</th>
                      <th className="px-5 py-3 font-medium">Role</th>
                      <th className="px-5 py-3 font-medium">Track</th>
                      <th className="px-5 py-3 font-medium">Talk</th>
                      <th className="px-5 py-3 font-medium">Sponsor Tier</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.04]">
                    {(eventParticipations || []).map((ep: any) => {
                      const evt = Array.isArray(ep.event)
                        ? ep.event[0]
                        : ep.event;
                      return (
                        <tr
                          key={ep.id}
                          className="hover:bg-white/[0.03] transition-all duration-200"
                        >
                          <td className="px-5 py-3">
                            <Link
                              href={`/admin/events/${evt?.id}`}
                              className="text-[var(--accent-indigo)] hover:underline"
                            >
                              {evt?.name ?? "Unknown"}
                            </Link>
                          </td>
                          <td className="px-5 py-3">
                            {ep.role ? (
                              <Badge>{ep.role}</Badge>
                            ) : (
                              <span className="text-[var(--text-muted)]">
                                &mdash;
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-3 text-[var(--text-muted)]">
                            {ep.track ?? "\u2014"}
                          </td>
                          <td className="px-5 py-3 text-[var(--text-secondary)] italic truncate max-w-[200px]">
                            {ep.talk_title ?? "\u2014"}
                          </td>
                          <td className="px-5 py-3">
                            {ep.sponsor_tier ? (
                              <Badge variant="glass-orange">
                                {ep.sponsor_tier}
                              </Badge>
                            ) : (
                              <span className="text-[var(--text-muted)]">
                                &mdash;
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </GlassCard>
        </div>

        {/* Organizations */}
        <div>
          <h2 className="text-lg font-medium font-[family-name:var(--font-heading)] mb-2">
            Organizations ({(affiliations || []).length})
          </h2>
          <GlassCard padding={false}>
            {(affiliations || []).length === 0 ? (
              <div className="px-5 py-8 text-center">
                <p className="text-sm text-[var(--text-muted)]">
                  No organizations linked.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[var(--text-muted)] border-b border-[var(--glass-border)]">
                      <th className="px-5 py-3 font-medium">Organization</th>
                      <th className="px-5 py-3 font-medium">Role</th>
                      <th className="px-5 py-3 font-medium">Status</th>
                      <th className="px-5 py-3 font-medium">ICP</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.04]">
                    {(affiliations || []).map((aff: any) => (
                      <tr
                        key={aff.id}
                        className="hover:bg-white/[0.03] transition-all duration-200"
                      >
                        <td className="px-5 py-3">
                          <Link
                            href={`/admin/organizations/${aff.organization?.id}`}
                            className="text-[var(--accent-indigo)] hover:underline font-medium"
                          >
                            {aff.organization?.name ?? "Unknown"}
                          </Link>
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            {aff.role && (
                              <Badge variant="glass-indigo">{aff.role}</Badge>
                            )}
                            {aff.role_type && <Badge>{aff.role_type}</Badge>}
                            {aff.is_primary && (
                              <Badge variant="glass-orange">primary</Badge>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-3">
                          {aff.is_current ? (
                            <Badge variant="approved">Current</Badge>
                          ) : (
                            <Badge variant="default">Former</Badge>
                          )}
                        </td>
                        <td className="px-5 py-3">
                          {aff.organization?.icp_score != null ? (
                            <Badge
                              variant={icpBadgeVariant(
                                aff.organization.icp_score
                              )}
                            >
                              {aff.organization.icp_score}
                            </Badge>
                          ) : (
                            <span className="text-[var(--text-muted)]">
                              &mdash;
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </GlassCard>
        </div>

        {/* Signals (from orgs) */}
        {orgSignals.length > 0 && (
          <div>
            <h2 className="text-lg font-medium font-[family-name:var(--font-heading)] mb-2">
              Signals ({orgSignals.length})
            </h2>
            <SignalsTimeline signals={orgSignals} />
          </div>
        )}

        {/* Initiative Enrollments */}
        {(enrollments || []).length > 0 && (
          <div>
            <h2 className="text-lg font-medium font-[family-name:var(--font-heading)] mb-2">
              Initiatives ({(enrollments || []).length})
            </h2>
            <div className="space-y-2">
              {(enrollments || []).map((enrollment: any) => (
                <GlassCard
                  key={enrollment.id}
                  className="flex items-center gap-3 !p-3"
                >
                  <Link
                    href={`/admin/initiatives/${enrollment.initiative.id}`}
                    className="text-[var(--accent-indigo)] hover:underline text-sm"
                  >
                    {enrollment.initiative.name}
                  </Link>
                  {enrollment.initiative.initiative_type && (
                    <Badge>{enrollment.initiative.initiative_type}</Badge>
                  )}
                  <Badge
                    variant={
                      enrollment.status === "active"
                        ? "approved"
                        : enrollment.status
                    }
                  >
                    {enrollment.status}
                  </Badge>
                  {enrollment.priority && (
                    <span className="text-[var(--text-muted)] text-sm">
                      Priority: {enrollment.priority}
                    </span>
                  )}
                  {enrollment.initiative.event?.name && (
                    <span className="text-[var(--text-muted)] text-sm">
                      ({enrollment.initiative.event.name})
                    </span>
                  )}
                </GlassCard>
              ))}
            </div>
          </div>
        )}

        {/* Interactions Timeline */}
        <div>
          <h2 className="text-lg font-medium font-[family-name:var(--font-heading)] mb-2">
            Interactions ({(interactions || []).length})
          </h2>
          <GlassCard padding={false} className="p-4">
            <InteractionsTimeline
              interactions={(interactions || []).map((ix: any) => ({
                ...ix,
                person: { id: person.id, full_name: person.full_name },
              }))}
              showFilters={true}
              showPersonLink={false}
              showOrgLink={true}
            />
          </GlassCard>
        </div>
      </div>
    </TwoPanelLayout>
  );
}
