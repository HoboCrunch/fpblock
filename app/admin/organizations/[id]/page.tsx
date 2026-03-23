import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { GlassCard } from "@/components/ui/glass-card";
import { SignalsTimeline } from "@/components/admin/signals-timeline";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  ExternalLink,
  Building2,
  Users,
  Briefcase,
  DollarSign,
  TrendingUp,
  MapPin,
  Globe,
  Linkedin as LinkedinIcon,
  Calendar,
  Sparkles,
  UserPlus,
} from "lucide-react";

export default async function OrganizationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: org } = await supabase
    .from("organizations")
    .select("*")
    .eq("id", id)
    .single();

  if (!org) notFound();

  const [
    { data: signals },
    { data: personLinks },
    { data: interactions },
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
      .select("*")
      .eq("organization_id", id)
      .order("occurred_at", { ascending: false, nullsFirst: false }),
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

  const persons = (personLinks || []).map((pl: any) => ({
    ...pl.person,
    role: pl.role,
    role_type: pl.role_type,
    is_current: pl.is_current,
    is_primary: pl.is_primary,
    link_source: pl.source,
  }));

  const enrichedPersonCount = (personLinks || []).filter((pl: any) => pl.source === "org_enrichment").length;

  const enrichMeta = (enrichmentJob?.metadata ?? {}) as Record<string, unknown>;
  const apolloResult = (enrichMeta.result ?? enrichMeta) as Record<string, unknown>;
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
    k !== 'technologies' ? v != null : (v as string[]).length > 0
  );

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold font-[family-name:var(--font-heading)]">
          {org.name}
        </h1>
        <p className="text-[var(--text-muted)] text-sm mt-1">{typeof org.category === "string" ? org.category : "\u2014"}</p>

        {/* Stats row */}
        <div className="flex items-center gap-4 mt-3 flex-wrap">
          {org.icp_score != null && (
            <div className={cn(
              "px-3 py-1.5 rounded-lg border text-sm font-bold tabular-nums",
              org.icp_score >= 90 ? "bg-green-500/15 text-green-400 border-green-500/25" :
              org.icp_score >= 75 ? "bg-yellow-500/15 text-yellow-400 border-yellow-500/25" :
              org.icp_score >= 50 ? "bg-orange-500/15 text-orange-400 border-orange-500/25" :
              "bg-gray-500/10 text-gray-400 border-gray-500/20"
            )}>
              ICP {org.icp_score}
            </div>
          )}
          {org.category && (
            <Badge variant="glass-indigo">{org.category}</Badge>
          )}
          <span className="text-xs text-[var(--text-muted)] flex items-center gap-1">
            <Users className="h-3 w-3" /> {persons.length} people
            {enrichedPersonCount > 0 && (
              <span className="text-[var(--accent-orange)]">({enrichedPersonCount} enriched)</span>
            )}
          </span>
          {(signals || []).length > 0 && (
            <span className="text-xs text-[var(--text-muted)] flex items-center gap-1">
              <Sparkles className="h-3 w-3" /> {(signals || []).length} signals
            </span>
          )}
        </div>
      </div>

      {/* Organization info */}
      <GlassCard className="space-y-3">
        {org.description && (
          <div>
            <div className="text-xs text-[var(--text-muted)]">Description</div>
            <p className="text-sm text-[var(--text-secondary)] mt-0.5">{org.description}</p>
          </div>
        )}
        {org.context && (
          <div>
            <div className="text-xs text-[var(--text-muted)]">Context</div>
            <p className="text-sm text-[var(--text-secondary)] mt-0.5">{org.context}</p>
          </div>
        )}
        {org.usp && (
          <div>
            <div className="text-xs text-[var(--text-muted)]">Our Angle (USP)</div>
            <p className="text-sm text-[var(--text-secondary)] mt-0.5">{org.usp}</p>
          </div>
        )}
        {org.icp_reason && (
          <div>
            <div className="text-xs text-[var(--text-muted)]">ICP Reason</div>
            <p className="text-sm text-[var(--text-secondary)] mt-0.5">{org.icp_reason}</p>
          </div>
        )}
        {(org.website || org.linkedin_url) && (
          <div className="flex items-center gap-4 pt-2 border-t border-[var(--glass-border)]">
            {org.website && (
              <a
                href={org.website}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-[var(--accent-indigo)] hover:underline"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Website
              </a>
            )}
            {org.linkedin_url && (
              <a
                href={org.linkedin_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-[var(--accent-indigo)] hover:underline"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                LinkedIn
              </a>
            )}
          </div>
        )}
      </GlassCard>

      {/* Firmographics */}
      {hasFirmographics && (
        <GlassCard>
          <h2 className="text-sm font-medium text-[var(--text-muted)] uppercase tracking-wider mb-3">Firmographics</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {firmographics.industry && (
              <div>
                <div className="text-[10px] text-[var(--text-muted)] mb-0.5 flex items-center gap-1"><Briefcase className="h-3 w-3" /> Industry</div>
                <div className="text-sm text-white">{firmographics.industry}</div>
              </div>
            )}
            {firmographics.employee_count != null && (
              <div>
                <div className="text-[10px] text-[var(--text-muted)] mb-0.5 flex items-center gap-1"><Users className="h-3 w-3" /> Employees</div>
                <div className="text-sm text-white">{firmographics.employee_count.toLocaleString()}</div>
              </div>
            )}
            {firmographics.annual_revenue && (
              <div>
                <div className="text-[10px] text-[var(--text-muted)] mb-0.5 flex items-center gap-1"><DollarSign className="h-3 w-3" /> Revenue</div>
                <div className="text-sm text-white">{firmographics.annual_revenue}</div>
              </div>
            )}
            {firmographics.funding_total && (
              <div>
                <div className="text-[10px] text-[var(--text-muted)] mb-0.5 flex items-center gap-1"><TrendingUp className="h-3 w-3" /> Funding</div>
                <div className="text-sm text-white">{firmographics.funding_total}{firmographics.latest_funding_stage ? ` (${firmographics.latest_funding_stage})` : ''}</div>
              </div>
            )}
            {firmographics.hq_location && (
              <div>
                <div className="text-[10px] text-[var(--text-muted)] mb-0.5 flex items-center gap-1"><MapPin className="h-3 w-3" /> Headquarters</div>
                <div className="text-sm text-white">{firmographics.hq_location}</div>
              </div>
            )}
            {firmographics.founded_year && (
              <div>
                <div className="text-[10px] text-[var(--text-muted)] mb-0.5 flex items-center gap-1"><Calendar className="h-3 w-3" /> Founded</div>
                <div className="text-sm text-white">{firmographics.founded_year}</div>
              </div>
            )}
          </div>
          {firmographics.technologies.length > 0 && (
            <div className="mt-3 pt-3 border-t border-[var(--glass-border)]">
              <div className="text-[10px] text-[var(--text-muted)] mb-1.5">Tech Stack</div>
              <div className="flex flex-wrap gap-1.5">
                {firmographics.technologies.slice(0, 20).map((tech: string, i: number) => (
                  <span key={`${i}-${tech}`} className="px-2 py-0.5 text-[10px] rounded-full bg-[var(--accent-indigo)]/10 text-[var(--accent-indigo)] border border-[var(--accent-indigo)]/20">{tech}</span>
                ))}
              </div>
            </div>
          )}
        </GlassCard>
      )}

      {/* Signals */}
      <div>
        <h2 className="text-lg font-medium font-[family-name:var(--font-heading)] mb-2">
          Signals
        </h2>
        <SignalsTimeline signals={signals || []} />
      </div>

      {/* Events */}
      <div>
        <h2 className="text-lg font-medium font-[family-name:var(--font-heading)] mb-2">
          Events ({(eventParticipations || []).length})
        </h2>
        <div className="space-y-2">
          {(eventParticipations || []).length === 0 ? (
            <GlassCard className="text-center py-6">
              <p className="text-[var(--text-muted)] text-sm">No event associations</p>
            </GlassCard>
          ) : (
            (eventParticipations || []).map((ep: any) => {
              const evt = Array.isArray(ep.event) ? ep.event[0] : ep.event;
              return (
                <GlassCard key={ep.id} className="flex items-center gap-3 !p-3">
                  <Link href={`/admin/events/${evt?.id}`} className="text-[var(--accent-indigo)] hover:underline text-sm">
                    {evt?.name ?? "Unknown event"}
                  </Link>
                  {ep.role && <Badge>{String(ep.role)}</Badge>}
                  {ep.sponsor_tier && <Badge variant="glass-orange">{String(ep.sponsor_tier)}</Badge>}
                  {evt?.location && <span className="text-xs text-[var(--text-muted)]">{String(evt.location)}</span>}
                </GlassCard>
              );
            })
          )}
        </div>
      </div>

      {/* People Roster */}
      <div>
        <h2 className="text-lg font-medium font-[family-name:var(--font-heading)] mb-2">
          People ({persons.length})
        </h2>
        <GlassCard padding={false}>
          {persons.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <p className="text-[var(--text-muted)] text-sm">No people associated with this organization</p>
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
                    <th className="px-5 py-3 font-medium">Phone</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                    <th className="px-5 py-3 font-medium">Source</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {persons.map((person: any) => (
                    <tr key={person.id} className="hover:bg-white/[0.03] transition-all duration-200">
                      <td className="px-5 py-3">
                        <Link href={`/admin/persons/${person.id}`} className="text-[var(--accent-indigo)] hover:underline font-medium">
                          {person.full_name}
                        </Link>
                      </td>
                      <td className="px-5 py-3 text-[var(--text-muted)]">{person.title || "\u2014"}</td>
                      <td className="px-5 py-3">
                        {person.role && <Badge variant="glass-indigo">{person.role}</Badge>}
                        {!person.role && <span className="text-[var(--text-muted)]">&mdash;</span>}
                      </td>
                      <td className="px-5 py-3 text-[var(--text-muted)]">{person.email || "\u2014"}</td>
                      <td className="px-5 py-3 text-[var(--text-muted)]">
                        {person.linkedin_url ? (
                          <a href={person.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-[var(--accent-indigo)] hover:underline text-xs truncate max-w-[120px] inline-block">
                            LinkedIn
                          </a>
                        ) : "\u2014"}
                      </td>
                      <td className="px-5 py-3 text-[var(--text-muted)]">{person.phone || "\u2014"}</td>
                      <td className="px-5 py-3">
                        {person.is_current ? (
                          <Badge variant="sent">Current</Badge>
                        ) : (
                          <Badge variant="default">Former</Badge>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        {person.link_source === "org_enrichment" ? (
                          <Badge variant="glass-orange" className="text-[10px]">Enriched</Badge>
                        ) : person.link_source ? (
                          <span className="text-xs text-[var(--text-muted)]">{person.link_source}</span>
                        ) : (
                          <span className="text-[var(--text-muted)]">&mdash;</span>
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

      {/* Interactions */}
      <div>
        <h2 className="text-lg font-medium font-[family-name:var(--font-heading)] mb-2">
          Interactions ({(interactions || []).length})
        </h2>
        {(interactions || []).length === 0 ? (
          <GlassCard className="text-center py-6">
            <p className="text-[var(--text-muted)] text-sm">No interactions yet</p>
          </GlassCard>
        ) : (
          <div className="space-y-3">
            {(interactions || []).map((ix: any) => (
              <div
                key={ix.id}
                className="flex items-start gap-3 glass rounded-xl p-3 hover:bg-white/[0.03] transition-all duration-200"
              >
                <Badge variant={ix.status === "replied" ? "replied" : ix.status === "sent" ? "sent" : ix.status === "draft" ? "draft" : "default"}>
                  {ix.interaction_type}
                </Badge>
                <div className="flex-1 min-w-0">
                  {ix.subject && (
                    <p className="text-sm font-medium text-[var(--text-secondary)] truncate">{ix.subject}</p>
                  )}
                  {ix.body && (
                    <p className="text-sm text-[var(--text-muted)] line-clamp-2 mt-0.5">{ix.body}</p>
                  )}
                  <div className="flex items-center gap-2 mt-1">
                    {ix.channel && <span className="text-xs text-[var(--text-muted)]">{ix.channel}</span>}
                    {ix.direction && <span className="text-xs text-[var(--text-muted)]">{ix.direction}</span>}
                    {ix.occurred_at && (
                      <span className="text-xs text-[var(--text-muted)]">
                        {new Date(ix.occurred_at).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
                <Badge variant={ix.status}>{ix.status}</Badge>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
