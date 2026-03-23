import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { GlassCard } from "@/components/ui/glass-card";
import { InteractionsTimeline } from "@/components/admin/interactions-timeline";
import Link from "next/link";

function icpBadgeVariant(score: number | null) {
  if (score === null) return "default";
  if (score >= 90) return "replied";
  if (score >= 75) return "scheduled";
  return "default";
}

export default async function PersonDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: person } = await supabase
    .from("persons")
    .select("*")
    .eq("id", id)
    .single();

  if (!person) notFound();

  const [
    { data: affiliations },
    { data: eventParticipations },
    { data: interactions },
    { data: enrollments },
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
  ]);

  const primaryAff = affiliations?.find((a: any) => a.is_primary) || affiliations?.[0];
  const primaryOrg = primaryAff?.organization;

  // Get ICP score from primary org
  const icpScore = primaryOrg?.icp_score ?? null;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold font-[family-name:var(--font-heading)]">
          {person.full_name}
        </h1>
        <p className="text-[var(--text-muted)] text-sm mt-1">
          {person.title}{primaryOrg ? ` at ${primaryOrg.name}` : ""}
        </p>
        {icpScore != null && (
          <Badge variant={icpBadgeVariant(icpScore)} className="mt-2">
            ICP {icpScore}
          </Badge>
        )}
      </div>

      {/* Contact info */}
      <GlassCard>
        <div className="grid grid-cols-2 gap-4">
          {[
            ["Email", person.email],
            ["LinkedIn", person.linkedin_url],
            ["Twitter", person.twitter_handle],
            ["Telegram", person.telegram_handle],
            ["Phone", person.phone],
            ["Source", person.source],
            ["Seniority", person.seniority],
            ["Department", person.department],
          ].map(([label, value]) => (
            <div key={label as string}>
              <div className="text-xs text-[var(--text-muted)]">{label}</div>
              <div className="text-sm text-[var(--text-secondary)] mt-0.5">
                {(value as string) || "\u2014"}
              </div>
            </div>
          ))}
        </div>
      </GlassCard>

      {/* Bio */}
      {person.bio && (
        <div>
          <h2 className="text-lg font-medium font-[family-name:var(--font-heading)] mb-2">
            Bio
          </h2>
          <GlassCard>
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{person.bio}</p>
          </GlassCard>
        </div>
      )}

      {/* Notes */}
      {person.notes && (
        <div>
          <h2 className="text-lg font-medium font-[family-name:var(--font-heading)] mb-2">
            Notes
          </h2>
          <GlassCard>
            <p className="text-sm text-[var(--text-secondary)]">{person.notes}</p>
          </GlassCard>
        </div>
      )}

      {/* Organizations */}
      <div>
        <h2 className="text-lg font-medium font-[family-name:var(--font-heading)] mb-2">
          Organizations
        </h2>
        <div className="space-y-2">
          {(affiliations || []).length === 0 && (
            <GlassCard>
              <p className="text-sm text-[var(--text-muted)]">No organizations linked.</p>
            </GlassCard>
          )}
          {(affiliations || []).map((aff: any) => (
            <GlassCard key={aff.id} className="flex items-center gap-3 !p-3">
              <Link
                href={`/admin/organizations/${aff.organization.id}`}
                className="text-[var(--accent-indigo)] hover:underline text-sm"
              >
                {aff.organization.name}
              </Link>
              <span className="text-[var(--text-muted)] text-sm">{aff.role || "\u2014"}</span>
              {aff.role_type && <Badge>{aff.role_type}</Badge>}
              {aff.is_current && <Badge variant="approved">current</Badge>}
              {aff.is_primary && <Badge variant="glass-orange">primary</Badge>}
            </GlassCard>
          ))}
        </div>
      </div>

      {/* Events */}
      <div>
        <h2 className="text-lg font-medium font-[family-name:var(--font-heading)] mb-2">
          Events
        </h2>
        <div className="space-y-2">
          {(eventParticipations || []).length === 0 && (
            <GlassCard>
              <p className="text-sm text-[var(--text-muted)]">No event participations.</p>
            </GlassCard>
          )}
          {(eventParticipations || []).map((ep: any) => (
            <GlassCard key={ep.id} className="flex items-center gap-3 !p-3">
              <Link
                href={`/admin/events/${ep.event.id}`}
                className="text-[var(--accent-indigo)] hover:underline text-sm"
              >
                {ep.event.name}
              </Link>
              {ep.role && <Badge>{ep.role}</Badge>}
              {ep.track && <span className="text-[var(--text-muted)] text-sm">{ep.track}</span>}
              {ep.talk_title && (
                <span className="text-[var(--text-secondary)] text-sm italic truncate">
                  {ep.talk_title}
                </span>
              )}
              {ep.sponsor_tier && <Badge variant="glass-orange">{ep.sponsor_tier}</Badge>}
            </GlassCard>
          ))}
        </div>
      </div>

      {/* Initiatives */}
      <div>
        <h2 className="text-lg font-medium font-[family-name:var(--font-heading)] mb-2">
          Initiatives
        </h2>
        <div className="space-y-2">
          {(enrollments || []).length === 0 && (
            <GlassCard>
              <p className="text-sm text-[var(--text-muted)]">No initiative enrollments.</p>
            </GlassCard>
          )}
          {(enrollments || []).map((enrollment: any) => (
            <GlassCard key={enrollment.id} className="flex items-center gap-3 !p-3">
              <Link
                href={`/admin/initiatives/${enrollment.initiative.id}`}
                className="text-[var(--accent-indigo)] hover:underline text-sm"
              >
                {enrollment.initiative.name}
              </Link>
              {enrollment.initiative.initiative_type && (
                <Badge>{enrollment.initiative.initiative_type}</Badge>
              )}
              <Badge variant={enrollment.status === "active" ? "approved" : enrollment.status}>
                {enrollment.status}
              </Badge>
              {enrollment.priority && (
                <span className="text-[var(--text-muted)] text-sm">Priority: {enrollment.priority}</span>
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

      {/* Interactions Timeline */}
      <div>
        <h2 className="text-lg font-medium font-[family-name:var(--font-heading)] mb-2">
          Interactions
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
  );
}
