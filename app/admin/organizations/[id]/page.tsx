import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { GlassCard } from "@/components/ui/glass-card";
import { TwoPanelLayout } from "@/components/admin/two-panel-layout";
import { IdentityCard } from "@/components/admin/identity-card";
import { DataCompleteness } from "@/components/admin/data-completeness";
import { OrgCorrelationSummary } from "@/components/admin/org-correlation-summary";
import { SignalsTimeline } from "@/components/admin/signals-timeline";
import { InteractionsTimeline } from "@/components/admin/interactions-timeline";
import { OrgStatusIcons } from "@/app/admin/enrichment/components/status-icons";
import { OrgDetailClient } from "./client";
import {
  Briefcase,
  Users,
  DollarSign,
  TrendingUp,
  MapPin,
  Calendar,
} from "lucide-react";

function icpBadgeVariant(score: number | null) {
  if (score === null) return "default";
  if (score >= 90) return "replied";
  if (score >= 75) return "scheduled";
  return "default";
}

function safe(v: unknown): string {
  if (v == null) return "\u2014";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export default async function OrganizationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  // ── Fetch org ──────────────────────────────────────────────────────
  const { data: org } = await supabase
    .from("organizations")
    .select("*")
    .eq("id", id)
    .single();

  if (!org) notFound();

  // ── Parallel data fetches ──────────────────────────────────────────
  const [
    { data: signals },
    { data: personLinks },
    { data: orgInteractions },
    { data: eventParticipations },
    { data: enrichmentJob },
  ] = await Promise.all([
    supabase
      .from("organization_signals")
      .select("*")
      .eq("organization_id", id)
      .order("date", { ascending: false, nullsFirst: false }),
    supabase
      .from("person_organization")
      .select("*, person:persons(*)")
      .eq("organization_id", id),
    supabase
      .from("interactions")
      .select("*, person:persons(id, full_name), organization:organizations(id, name)")
      .eq("organization_id", id)
      .order("occurred_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("event_participations")
      .select("*, event:events(*)")
      .eq("organization_id", id),
    supabase
      .from("job_log")
      .select("metadata")
      .eq("target_id", id)
      .eq("target_table", "organizations")
      .in("job_type", ["enrichment_full", "enrichment_apollo"])
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  // ── Person-event affiliations (propagation via enrichment) ─────────
  const { data: affRows } = await supabase
    .from("person_event_affiliations")
    .select("event_id, person_id")
    .eq("via_organization_id", id);

  const affEventIds = Array.from(
    new Set((affRows ?? []).map((r: any) => r.event_id))
  );
  const affPersonIds = Array.from(
    new Set((affRows ?? []).map((r: any) => r.person_id))
  );

  const affEvents =
    affEventIds.length > 0
      ? (await supabase
          .from("events")
          .select("id, name")
          .in("id", affEventIds)).data ?? []
      : [];

  const affPersonsPerEvent: Record<string, number> = {};
  for (const r of (affRows ?? []) as any[]) {
    affPersonsPerEvent[r.event_id] =
      (affPersonsPerEvent[r.event_id] ?? 0) + 1;
  }

  // ── Person-level event participations (for people roster Events col)
  const personIds = (personLinks || [])
    .map((pl: any) => pl.person?.id)
    .filter(Boolean);
  let personEventParticipations: any[] = [];
  if (personIds.length > 0) {
    const CHUNK = 500;
    for (let i = 0; i < personIds.length; i += CHUNK) {
      const chunk = personIds.slice(i, i + CHUNK);
      const { data } = await supabase
        .from("event_participations")
        .select("person_id, event_id, role, event:events(id, name)")
        .in("person_id", chunk);
      if (data) personEventParticipations = personEventParticipations.concat(data);
    }
  }

  // Person-level interactions (for combined interactions)
  let personInteractions: any[] = [];
  if (personIds.length > 0) {
    const CHUNK = 500;
    for (let i = 0; i < personIds.length; i += CHUNK) {
      const chunk = personIds.slice(i, i + CHUNK);
      const { data } = await supabase
        .from("interactions")
        .select("*, person:persons(id, full_name), organization:organizations(id, name)")
        .in("person_id", chunk)
        .neq("organization_id", id) // avoid duplicates with orgInteractions
        .order("occurred_at", { ascending: false, nullsFirst: false });
      if (data) personInteractions = personInteractions.concat(data);
    }
  }

  // ── Derived data ───────────────────────────────────────────────────

  // Persons list with link metadata
  const persons = (personLinks || []).map((pl: any) => ({
    ...pl.person,
    role: pl.role,
    role_type: pl.role_type,
    is_current: pl.is_current,
    is_primary: pl.is_primary,
    link_source: pl.source,
  }));

  const enrichedPersonCount = (personLinks || []).filter(
    (pl: any) => pl.source === "org_enrichment"
  ).length;

  // Firmographics from job metadata
  const enrichMeta = (enrichmentJob?.metadata ?? {}) as Record<string, unknown>;
  const apolloResult = (enrichMeta.result ?? enrichMeta) as Record<
    string,
    unknown
  >;
  const firmographics = {
    industry: (apolloResult.industry as string) ?? null,
    employee_count: (apolloResult.employee_count as number) ?? null,
    annual_revenue: (apolloResult.annual_revenue as string) ?? null,
    funding_total: (apolloResult.funding_total as string) ?? null,
    latest_funding_stage: (apolloResult.latest_funding_stage as string) ?? null,
    founded_year: (apolloResult.founded_year as number) ?? null,
    hq_location: (apolloResult.hq_location as string) ?? null,
    technologies: (apolloResult.technologies as string[]) ?? [],
  };
  const hasFirmographics = Object.entries(firmographics).some(([k, v]) =>
    k !== "technologies" ? v != null : (v as string[]).length > 0
  );

  // Correlation summary data
  const orgEvents = (eventParticipations || []).map((ep: any) => {
    const evt = Array.isArray(ep.event) ? ep.event[0] : ep.event;
    return {
      event_id: evt?.id ?? ep.event_id,
      event_name: evt?.name ?? "Unknown",
      tier: ep.sponsor_tier ?? null,
      role: ep.role ?? "",
    };
  });

  const peopleSpeaking = personEventParticipations
    .filter((ep: any) =>
      ["speaker", "panelist", "mc"].includes(ep.role)
    )
    .map((ep: any) => {
      const evt = Array.isArray(ep.event) ? ep.event[0] : ep.event;
      const person = persons.find((p: any) => p.id === ep.person_id);
      return {
        person_id: ep.person_id,
        person_name: person?.full_name ?? "Unknown",
        event_id: evt?.id ?? ep.event_id,
        event_name: evt?.name ?? "Unknown",
      };
    });

  const orgPeople = persons.map((p: any) => ({
    id: p.id,
    full_name: p.full_name,
    enrichment_status: p.enrichment_status ?? "",
  }));

  // Person events lookup: person_id -> list of event names
  const personEventsMap = new Map<string, string[]>();
  for (const ep of personEventParticipations) {
    const evt = Array.isArray(ep.event) ? ep.event[0] : ep.event;
    const existing = personEventsMap.get(ep.person_id) ?? [];
    if (evt?.name && !existing.includes(evt.name)) {
      existing.push(evt.name);
    }
    personEventsMap.set(ep.person_id, existing);
  }

  // Combine org + person interactions (deduped by id)
  const allInteractionsMap = new Map<string, any>();
  for (const ix of orgInteractions ?? []) {
    allInteractionsMap.set(ix.id, ix);
  }
  for (const ix of personInteractions) {
    if (!allInteractionsMap.has(ix.id)) {
      allInteractionsMap.set(ix.id, ix);
    }
  }
  const allInteractions = [...allInteractionsMap.values()].sort(
    (a, b) =>
      new Date(b.occurred_at ?? b.created_at).getTime() -
      new Date(a.occurred_at ?? a.created_at).getTime()
  );

  // Data completeness fields
  const completenessFields = [
    { label: "Description", present: !!org.description },
    { label: "Website", present: !!org.website },
    { label: "LinkedIn", present: !!org.linkedin_url },
    { label: "Logo", present: !!org.logo_url },
    { label: "ICP Score", present: org.icp_score != null },
    { label: "ICP Reason", present: !!org.icp_reason },
    { label: "USP", present: !!org.usp },
    { label: "Category", present: !!org.category },
    { label: "Industry", present: !!(org.industry || firmographics.industry) },
  ];

  // ── Sidebar ────────────────────────────────────────────────────────
  const sidebar = (
    <div className="space-y-4">
      {/* Identity Card */}
      <IdentityCard
        name={org.name}
        subtitle={typeof org.category === "string" ? org.category : undefined}
        imageUrl={org.logo_url ?? null}
        imageShape="square"
        icpScore={org.icp_score ?? null}
        contacts={[
          { type: "website", value: org.website },
          { type: "linkedin", value: org.linkedin_url },
        ]}
        stats={
          <div className="flex items-center gap-4 text-xs text-[var(--text-muted)]">
            <span>{persons.length} people</span>
            {enrichedPersonCount > 0 && (
              <span className="text-[var(--accent-orange)]">
                {enrichedPersonCount} enriched
              </span>
            )}
            <span>{(signals || []).length} signals</span>
          </div>
        }
      />

      {/* Data Completeness */}
      <DataCompleteness
        fields={completenessFields}
        enrichmentStatus={org.enrichment_status ?? undefined}
        lastEnrichedAt={
          org.last_enriched_at
            ? new Date(org.last_enriched_at).toLocaleDateString()
            : null
        }
        enrichmentStages={
          org.enrichment_stages ? (
            <OrgStatusIcons stages={org.enrichment_stages} />
          ) : undefined
        }
      />

      {/* Quick Actions */}
      <GlassCard>
        <h3 className="text-sm font-medium text-white mb-3">Quick Actions</h3>
        <div className="space-y-2">
          <Link
            href="/admin/enrichment"
            className="flex items-center gap-2 px-3 py-2 rounded-lg glass hover:bg-white/[0.05] transition-colors text-sm text-[var(--text-secondary)]"
          >
            Enrich Organization
          </Link>
          {org.website && (
            <a
              href={org.website}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-3 py-2 rounded-lg glass hover:bg-white/[0.05] transition-colors text-sm text-[var(--text-secondary)]"
            >
              Visit Website
            </a>
          )}
        </div>
      </GlassCard>

      {/* ICP Analysis */}
      {(org.icp_score != null || org.icp_reason || org.usp) && (
        <GlassCard>
          <h3 className="text-sm font-medium text-white mb-3">ICP Analysis</h3>
          <div className="space-y-2">
            {org.icp_score != null && (
              <div>
                <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">
                  Score
                </div>
                <Badge
                  variant={icpBadgeVariant(org.icp_score)}
                  className="mt-0.5"
                >
                  {org.icp_score}
                </Badge>
              </div>
            )}
            {org.icp_reason && (
              <div>
                <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">
                  Reason
                </div>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                  {safe(org.icp_reason)}
                </p>
              </div>
            )}
            {org.usp && (
              <div>
                <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">
                  Our Angle (USP)
                </div>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                  {safe(org.usp)}
                </p>
              </div>
            )}
          </div>
        </GlassCard>
      )}

      {/* Notes Editor */}
      <OrgDetailClient orgId={id} initialNotes={org.notes ?? ""} />
    </div>
  );

  // ── Center Content ─────────────────────────────────────────────────
  return (
    <TwoPanelLayout title={org.name} sidebar={sidebar}>
      <div className="space-y-6">
        {/* Correlation Summary */}
        <OrgCorrelationSummary
          orgEvents={orgEvents}
          people={orgPeople}
          peopleSpeaking={peopleSpeaking}
          signalCount={(signals || []).length}
          icpScore={org.icp_score ?? null}
        />

        {/* Description / Context */}
        {(org.description || org.context) && (
          <GlassCard>
            {org.description && (
              <div className="mb-3">
                <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-1">
                  Description
                </div>
                <p className="text-sm text-[var(--text-secondary)]">
                  {safe(org.description)}
                </p>
              </div>
            )}
            {org.context && (
              <div>
                <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-1">
                  Context
                </div>
                <p className="text-sm text-[var(--text-secondary)]">
                  {safe(org.context)}
                </p>
              </div>
            )}
          </GlassCard>
        )}

        {/* Event Presence */}
        <div>
          <h2 className="text-lg font-medium font-[family-name:var(--font-heading)] mb-2">
            Events ({(eventParticipations || []).length})
          </h2>
          <GlassCard padding={false}>
            {(eventParticipations || []).length === 0 ? (
              <div className="px-5 py-8 text-center">
                <p className="text-[var(--text-muted)] text-sm">
                  No event associations
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[var(--text-muted)] border-b border-[var(--glass-border)]">
                      <th className="px-5 py-3 font-medium">Event</th>
                      <th className="px-5 py-3 font-medium">Role</th>
                      <th className="px-5 py-3 font-medium">Sponsor Tier</th>
                      <th className="px-5 py-3 font-medium">Location</th>
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
                              {evt?.name ?? "Unknown event"}
                            </Link>
                          </td>
                          <td className="px-5 py-3">
                            {ep.role ? (
                              <Badge>{String(ep.role)}</Badge>
                            ) : (
                              <span className="text-[var(--text-muted)]">
                                &mdash;
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-3">
                            {ep.sponsor_tier ? (
                              <Badge variant="glass-orange">
                                {String(ep.sponsor_tier)}
                              </Badge>
                            ) : (
                              <span className="text-[var(--text-muted)]">
                                &mdash;
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-3 text-[var(--text-muted)]">
                            {evt?.location ? String(evt.location) : "\u2014"}
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

        {/* Event Propagation (via enrichment) */}
        <GlassCard className="p-4">
          <h3 className="text-sm font-semibold mb-2">
            Event propagation — {affPersonIds.length} persons across{" "}
            {affEventIds.length} events
          </h3>
          {affEvents.length === 0 ? (
            <p className="text-xs opacity-60">None yet.</p>
          ) : (
            <ul className="text-sm space-y-1">
              {affEvents.map((ev: any) => (
                <li key={ev.id} className="flex justify-between">
                  <Link
                    href={`/admin/events/${ev.id}`}
                    className="hover:underline"
                  >
                    {ev.name}
                  </Link>
                  <span className="opacity-70">
                    {affPersonsPerEvent[ev.id] ?? 0} persons
                  </span>
                </li>
              ))}
            </ul>
          )}
        </GlassCard>

        {/* People Roster */}
        <div>
          <h2 className="text-lg font-medium font-[family-name:var(--font-heading)] mb-2">
            People ({persons.length})
          </h2>
          <GlassCard padding={false}>
            {persons.length === 0 ? (
              <div className="px-5 py-12 text-center">
                <p className="text-[var(--text-muted)] text-sm">
                  No people associated with this organization
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[var(--text-muted)] border-b border-[var(--glass-border)]">
                      <th className="px-5 py-3 font-medium">Name</th>
                      <th className="px-5 py-3 font-medium">Title</th>
                      <th className="px-5 py-3 font-medium">Role</th>
                      <th className="px-5 py-3 font-medium">Email</th>
                      <th className="px-5 py-3 font-medium">LinkedIn</th>
                      <th className="px-5 py-3 font-medium">Events</th>
                      <th className="px-5 py-3 font-medium">Status</th>
                      <th className="px-5 py-3 font-medium">Source</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.04]">
                    {persons.map((person: any) => {
                      const personEvts =
                        personEventsMap.get(person.id) ?? [];
                      return (
                        <tr
                          key={person.id}
                          className="hover:bg-white/[0.03] transition-all duration-200"
                        >
                          <td className="px-5 py-3">
                            <Link
                              href={`/admin/persons/${person.id}`}
                              className="text-[var(--accent-indigo)] hover:underline font-medium"
                            >
                              {person.full_name}
                            </Link>
                          </td>
                          <td className="px-5 py-3 text-[var(--text-muted)]">
                            {safe(person.title)}
                          </td>
                          <td className="px-5 py-3">
                            {person.role ? (
                              <Badge variant="glass-indigo">
                                {safe(person.role)}
                              </Badge>
                            ) : (
                              <span className="text-[var(--text-muted)]">
                                &mdash;
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-3 text-[var(--text-muted)]">
                            {safe(person.email)}
                          </td>
                          <td className="px-5 py-3 text-[var(--text-muted)]">
                            {person.linkedin_url ? (
                              <a
                                href={person.linkedin_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[var(--accent-indigo)] hover:underline text-xs"
                              >
                                LinkedIn
                              </a>
                            ) : (
                              "\u2014"
                            )}
                          </td>
                          <td className="px-5 py-3">
                            <div className="flex flex-wrap gap-1">
                              {personEvts.slice(0, 2).map((name) => (
                                <Badge key={name} variant="default" className="text-[10px]">
                                  {name}
                                </Badge>
                              ))}
                              {personEvts.length > 2 && (
                                <span className="text-[10px] text-[var(--text-muted)]">
                                  +{personEvts.length - 2}
                                </span>
                              )}
                              {personEvts.length === 0 && (
                                <span className="text-[var(--text-muted)]">
                                  &mdash;
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-5 py-3">
                            {person.is_current ? (
                              <Badge variant="sent">Current</Badge>
                            ) : (
                              <Badge variant="default">Former</Badge>
                            )}
                          </td>
                          <td className="px-5 py-3">
                            {person.link_source === "org_enrichment" ? (
                              <Badge
                                variant="glass-orange"
                                className="text-[10px]"
                              >
                                Enriched
                              </Badge>
                            ) : person.link_source ? (
                              <span className="text-xs text-[var(--text-muted)]">
                                {safe(person.link_source)}
                              </span>
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

        {/* Firmographics */}
        {hasFirmographics && (
          <GlassCard>
            <h2 className="text-sm font-medium text-[var(--text-muted)] uppercase tracking-wider mb-3">
              Firmographics
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {firmographics.industry && (
                <div>
                  <div className="text-[10px] text-[var(--text-muted)] mb-0.5 flex items-center gap-1">
                    <Briefcase className="h-3 w-3" /> Industry
                  </div>
                  <div className="text-sm text-white">
                    {firmographics.industry}
                  </div>
                </div>
              )}
              {firmographics.employee_count != null && (
                <div>
                  <div className="text-[10px] text-[var(--text-muted)] mb-0.5 flex items-center gap-1">
                    <Users className="h-3 w-3" /> Employees
                  </div>
                  <div className="text-sm text-white">
                    {firmographics.employee_count.toLocaleString()}
                  </div>
                </div>
              )}
              {firmographics.annual_revenue && (
                <div>
                  <div className="text-[10px] text-[var(--text-muted)] mb-0.5 flex items-center gap-1">
                    <DollarSign className="h-3 w-3" /> Revenue
                  </div>
                  <div className="text-sm text-white">
                    {firmographics.annual_revenue}
                  </div>
                </div>
              )}
              {firmographics.funding_total && (
                <div>
                  <div className="text-[10px] text-[var(--text-muted)] mb-0.5 flex items-center gap-1">
                    <TrendingUp className="h-3 w-3" /> Funding
                  </div>
                  <div className="text-sm text-white">
                    {firmographics.funding_total}
                    {firmographics.latest_funding_stage
                      ? ` (${firmographics.latest_funding_stage})`
                      : ""}
                  </div>
                </div>
              )}
              {firmographics.hq_location && (
                <div>
                  <div className="text-[10px] text-[var(--text-muted)] mb-0.5 flex items-center gap-1">
                    <MapPin className="h-3 w-3" /> Headquarters
                  </div>
                  <div className="text-sm text-white">
                    {firmographics.hq_location}
                  </div>
                </div>
              )}
              {firmographics.founded_year && (
                <div>
                  <div className="text-[10px] text-[var(--text-muted)] mb-0.5 flex items-center gap-1">
                    <Calendar className="h-3 w-3" /> Founded
                  </div>
                  <div className="text-sm text-white">
                    {firmographics.founded_year}
                  </div>
                </div>
              )}
            </div>
            {firmographics.technologies.length > 0 && (
              <div className="mt-3 pt-3 border-t border-[var(--glass-border)]">
                <div className="text-[10px] text-[var(--text-muted)] mb-1.5">
                  Tech Stack
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {firmographics.technologies
                    .slice(0, 20)
                    .map((tech: unknown, i: number) => {
                      const label =
                        typeof tech === "string"
                          ? tech
                          : typeof tech === "object" &&
                            tech !== null &&
                            "name" in tech
                          ? String(
                              (tech as Record<string, unknown>).name
                            )
                          : String(tech);
                      return (
                        <span
                          key={`${i}-${label}`}
                          className="px-2 py-0.5 text-[10px] rounded-full bg-[var(--accent-indigo)]/10 text-[var(--accent-indigo)] border border-[var(--accent-indigo)]/20"
                        >
                          {label}
                        </span>
                      );
                    })}
                </div>
              </div>
            )}
          </GlassCard>
        )}

        {/* Signals Timeline */}
        <div>
          <h2 className="text-lg font-medium font-[family-name:var(--font-heading)] mb-2">
            Signals ({(signals || []).length})
          </h2>
          <SignalsTimeline signals={signals || []} />
        </div>

        {/* Interactions Timeline */}
        <div>
          <h2 className="text-lg font-medium font-[family-name:var(--font-heading)] mb-2">
            Interactions ({allInteractions.length})
          </h2>
          <GlassCard padding={false} className="p-4">
            <InteractionsTimeline
              interactions={allInteractions}
              showFilters={true}
              showPersonLink={true}
              showOrgLink={false}
            />
          </GlassCard>
        </div>
      </div>
    </TwoPanelLayout>
  );
}
