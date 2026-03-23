import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { GlassCard } from "@/components/ui/glass-card";
import { SignalsTimeline } from "@/components/admin/signals-timeline";
import Link from "next/link";
import { ExternalLink } from "lucide-react";

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
  ]);

  const persons = (personLinks || []).map((pl: any) => ({
    ...pl.person,
    role: pl.role,
    role_type: pl.role_type,
    is_current: pl.is_current,
    is_primary: pl.is_primary,
    link_source: pl.source,
  }));

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold font-[family-name:var(--font-heading)]">
          {org.name}
        </h1>
        <p className="text-[var(--text-muted)] text-sm mt-1">{org.category || "\u2014"}</p>
        {org.icp_score != null && (
          <Badge variant={org.icp_score >= 90 ? "replied" : "scheduled"} className="mt-2">
            ICP {org.icp_score}
          </Badge>
        )}
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
            (eventParticipations || []).map((ep: any) => (
              <GlassCard key={ep.id} className="flex items-center gap-3 !p-3">
                <Link href={`/admin/events/${ep.event?.id}`} className="text-[var(--accent-indigo)] hover:underline text-sm">
                  {ep.event?.name}
                </Link>
                {ep.role && <Badge>{ep.role}</Badge>}
                {ep.sponsor_tier && <Badge variant="glass-orange">{ep.sponsor_tier}</Badge>}
                {ep.event?.location && <span className="text-xs text-[var(--text-muted)]">{ep.event.location}</span>}
              </GlassCard>
            ))
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
