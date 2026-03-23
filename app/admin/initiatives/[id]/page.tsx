import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { GlassCard } from "@/components/ui/glass-card";
import { Badge } from "@/components/ui/badge";
import { Tabs } from "@/components/ui/tabs";
import { InteractionsTimeline } from "@/components/admin/interactions-timeline";
import Link from "next/link";
import {
  Rocket,
  Users,
  Building2,
  GitBranch,
  MessageSquare,
} from "lucide-react";
import type {
  Initiative,
  Event,
  InitiativeEnrollment,
  Person,
  Organization,
  Interaction,
  Sequence,
  SequenceEnrollment,
} from "@/lib/types/database";

const typeVariant: Record<string, string> = {
  outreach: "glass-orange",
  sponsorship: "glass-indigo",
  partnership: "glass-indigo",
  event: "scheduled",
  research: "draft",
};

const statusVariant: Record<string, string> = {
  draft: "draft",
  active: "sent",
  paused: "scheduled",
  completed: "replied",
  archived: "default",
};

const enrollmentStatusVariant: Record<string, string> = {
  enrolled: "scheduled",
  contacted: "sent",
  responded: "replied",
  meeting_set: "opened",
  converted: "replied",
  rejected: "bounced",
  opted_out: "failed",
};

const priorityVariant: Record<string, string> = {
  high: "replied",
  medium: "scheduled",
  low: "default",
};

type EnrolledPerson = InitiativeEnrollment & {
  person: Pick<Person, "id" | "full_name" | "email" | "title"> | null;
};

type EnrolledOrg = InitiativeEnrollment & {
  organization: Pick<Organization, "id" | "name" | "category"> | null;
};

type SequenceWithCounts = Sequence & {
  enrollment_count: number;
};

export default async function InitiativeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  // Fetch initiative with event
  const { data: initiative } = await supabase
    .from("initiatives")
    .select("*, event:events(id, name, slug)")
    .eq("id", id)
    .single();

  if (!initiative) notFound();

  // Fetch enrollments with person data
  const { data: personEnrollments } = await supabase
    .from("initiative_enrollments")
    .select("*, person:persons(id, full_name, email, title)")
    .eq("initiative_id", id)
    .not("person_id", "is", null);

  // Fetch enrollments with organization data
  const { data: orgEnrollments } = await supabase
    .from("initiative_enrollments")
    .select("*, organization:organizations(id, name, category)")
    .eq("initiative_id", id)
    .not("organization_id", "is", null);

  // Fetch interactions scoped to this initiative
  const { data: interactions } = await supabase
    .from("interactions")
    .select("*, person:persons(id, full_name), organization:organizations(id, name)")
    .eq("initiative_id", id)
    .order("occurred_at", { ascending: false, nullsFirst: false });

  // Fetch sequences linked to this initiative
  const { data: sequences } = await supabase
    .from("sequences")
    .select("*")
    .eq("initiative_id", id)
    .order("created_at", { ascending: false });

  // Fetch enrollment counts for each sequence
  const sequenceIds = (sequences ?? []).map((s: any) => s.id);
  const { data: seqEnrollments } = sequenceIds.length > 0
    ? await supabase
        .from("sequence_enrollments")
        .select("sequence_id")
        .in("sequence_id", sequenceIds)
    : { data: [] };

  const seqEnrollmentMap = new Map<string, number>();
  (seqEnrollments ?? []).forEach((e: { sequence_id: string }) => {
    seqEnrollmentMap.set(e.sequence_id, (seqEnrollmentMap.get(e.sequence_id) ?? 0) + 1);
  });

  const sequencesWithCounts: SequenceWithCounts[] = (
    (sequences as Sequence[]) ?? []
  ).map((s) => ({
    ...s,
    enrollment_count: seqEnrollmentMap.get(s.id) ?? 0,
  }));

  const enrolledPersons = (personEnrollments ?? []) as EnrolledPerson[];
  const enrolledOrgs = (orgEnrollments ?? []) as EnrolledOrg[];
  const initiativeInteractions = (interactions ?? []) as (Interaction & {
    person?: { id: string; full_name: string } | null;
    organization?: { id: string; name: string } | null;
  })[];

  const typedInitiative = initiative as Initiative & {
    event: Pick<Event, "id" | "name" | "slug"> | null;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <Rocket className="w-6 h-6 text-[var(--accent-orange)]" />
          <h1 className="text-2xl font-semibold font-[family-name:var(--font-heading)] text-white">
            {typedInitiative.name}
          </h1>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {typedInitiative.initiative_type && (
            <Badge variant={typeVariant[typedInitiative.initiative_type] ?? "default"}>
              {typedInitiative.initiative_type}
            </Badge>
          )}
          <Badge variant={statusVariant[typedInitiative.status] ?? "default"}>
            {typedInitiative.status}
          </Badge>
          {typedInitiative.owner && (
            <span className="text-sm text-[var(--text-secondary)]">
              Owner: {typedInitiative.owner}
            </span>
          )}
          {typedInitiative.event && (
            <span className="text-sm text-[var(--text-muted)]">
              Event:{" "}
              <Link
                href={`/admin/events/${typedInitiative.event.id}`}
                className="text-[var(--accent-indigo)] hover:underline"
              >
                {typedInitiative.event.name}
              </Link>
            </span>
          )}
        </div>

        {typedInitiative.notes && (
          <p className="text-sm text-[var(--text-muted)] mt-2">
            {typedInitiative.notes}
          </p>
        )}
      </div>

      {/* Tabs */}
      <GlassCard padding={false} className="p-2">
        <Tabs
          tabs={[
            {
              id: "persons",
              label: `Enrolled Persons (${enrolledPersons.length})`,
              content: (
                <div className="p-3">
                  {enrolledPersons.length === 0 ? (
                    <div className="text-center py-8">
                      <Users className="w-10 h-10 text-[var(--text-muted)] mx-auto mb-3" />
                      <p className="text-[var(--text-muted)]">No persons enrolled.</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-[var(--text-muted)] border-b border-[var(--glass-border)]">
                            <th className="px-5 py-3 font-medium">Name</th>
                            <th className="px-5 py-3 font-medium">Title</th>
                            <th className="px-5 py-3 font-medium">Email</th>
                            <th className="px-5 py-3 font-medium">Priority</th>
                            <th className="px-5 py-3 font-medium">Status</th>
                            <th className="px-5 py-3 font-medium">Enrolled</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/[0.04]">
                          {enrolledPersons.map((ep) => (
                            <tr key={ep.id} className="hover:bg-white/[0.03] transition-all duration-200">
                              <td className="px-5 py-3">
                                {ep.person ? (
                                  <Link
                                    href={`/admin/persons/${ep.person.id}`}
                                    className="text-[var(--accent-indigo)] hover:underline font-medium"
                                  >
                                    {ep.person.full_name}
                                  </Link>
                                ) : (
                                  <span className="text-[var(--text-muted)]">&mdash;</span>
                                )}
                              </td>
                              <td className="px-5 py-3 text-[var(--text-muted)]">
                                {ep.person?.title || "\u2014"}
                              </td>
                              <td className="px-5 py-3 text-[var(--text-muted)]">
                                {ep.person?.email || "\u2014"}
                              </td>
                              <td className="px-5 py-3">
                                {ep.priority ? (
                                  <Badge variant={priorityVariant[ep.priority] ?? "default"}>
                                    {ep.priority}
                                  </Badge>
                                ) : (
                                  <span className="text-[var(--text-muted)]">&mdash;</span>
                                )}
                              </td>
                              <td className="px-5 py-3">
                                <Badge variant={enrollmentStatusVariant[ep.status] ?? "default"}>
                                  {ep.status}
                                </Badge>
                              </td>
                              <td className="px-5 py-3 text-[var(--text-muted)]">
                                {new Date(ep.enrolled_at).toLocaleDateString()}
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
            {
              id: "organizations",
              label: `Enrolled Orgs (${enrolledOrgs.length})`,
              content: (
                <div className="p-3">
                  {enrolledOrgs.length === 0 ? (
                    <div className="text-center py-8">
                      <Building2 className="w-10 h-10 text-[var(--text-muted)] mx-auto mb-3" />
                      <p className="text-[var(--text-muted)]">No organizations enrolled.</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-[var(--text-muted)] border-b border-[var(--glass-border)]">
                            <th className="px-5 py-3 font-medium">Organization</th>
                            <th className="px-5 py-3 font-medium">Category</th>
                            <th className="px-5 py-3 font-medium">Priority</th>
                            <th className="px-5 py-3 font-medium">Status</th>
                            <th className="px-5 py-3 font-medium">Enrolled</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/[0.04]">
                          {enrolledOrgs.map((eo) => (
                            <tr key={eo.id} className="hover:bg-white/[0.03] transition-all duration-200">
                              <td className="px-5 py-3">
                                {eo.organization ? (
                                  <Link
                                    href={`/admin/organizations/${eo.organization.id}`}
                                    className="text-[var(--accent-indigo)] hover:underline font-medium"
                                  >
                                    {eo.organization.name}
                                  </Link>
                                ) : (
                                  <span className="text-[var(--text-muted)]">&mdash;</span>
                                )}
                              </td>
                              <td className="px-5 py-3 text-[var(--text-muted)]">
                                {eo.organization?.category || "\u2014"}
                              </td>
                              <td className="px-5 py-3">
                                {eo.priority ? (
                                  <Badge variant={priorityVariant[eo.priority] ?? "default"}>
                                    {eo.priority}
                                  </Badge>
                                ) : (
                                  <span className="text-[var(--text-muted)]">&mdash;</span>
                                )}
                              </td>
                              <td className="px-5 py-3">
                                <Badge variant={enrollmentStatusVariant[eo.status] ?? "default"}>
                                  {eo.status}
                                </Badge>
                              </td>
                              <td className="px-5 py-3 text-[var(--text-muted)]">
                                {new Date(eo.enrolled_at).toLocaleDateString()}
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
            {
              id: "sequences",
              label: `Sequences (${sequencesWithCounts.length})`,
              content: (
                <div className="p-3">
                  {sequencesWithCounts.length === 0 ? (
                    <div className="text-center py-8">
                      <GitBranch className="w-10 h-10 text-[var(--text-muted)] mx-auto mb-3" />
                      <p className="text-[var(--text-muted)]">No sequences linked to this initiative.</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-[var(--text-muted)] border-b border-[var(--glass-border)]">
                            <th className="px-5 py-3 font-medium">Name</th>
                            <th className="px-5 py-3 font-medium">Channel</th>
                            <th className="px-5 py-3 font-medium">Status</th>
                            <th className="px-5 py-3 font-medium">Steps</th>
                            <th className="px-5 py-3 font-medium">Enrollments</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/[0.04]">
                          {sequencesWithCounts.map((seq) => {
                            const steps = Array.isArray(seq.steps) ? seq.steps : [];
                            return (
                              <tr key={seq.id} className="hover:bg-white/[0.03] transition-all duration-200">
                                <td className="px-5 py-3">
                                  <Link
                                    href={`/admin/sequences/${seq.id}`}
                                    className="text-[var(--accent-indigo)] hover:underline font-medium"
                                  >
                                    {seq.name}
                                  </Link>
                                </td>
                                <td className="px-5 py-3">
                                  <Badge variant={seq.channel === "email" || seq.channel === "linkedin" ? "glass-indigo" : "glass-orange"}>
                                    {seq.channel}
                                  </Badge>
                                </td>
                                <td className="px-5 py-3">
                                  <Badge
                                    variant={
                                      seq.status === "active"
                                        ? "sent"
                                        : seq.status === "paused"
                                          ? "scheduled"
                                          : seq.status === "completed"
                                            ? "replied"
                                            : "draft"
                                    }
                                  >
                                    {seq.status}
                                  </Badge>
                                </td>
                                <td className="px-5 py-3 text-[var(--text-muted)]">
                                  {steps.length}
                                </td>
                                <td className="px-5 py-3 text-[var(--text-muted)]">
                                  {seq.enrollment_count}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ),
            },
            {
              id: "interactions",
              label: `Interactions (${initiativeInteractions.length})`,
              content: (
                <div className="p-3">
                  <InteractionsTimeline
                    interactions={initiativeInteractions}
                    showPersonLink
                    showOrgLink
                  />
                </div>
              ),
            },
          ]}
        />
      </GlassCard>
    </div>
  );
}
