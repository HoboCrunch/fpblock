import { createClient } from "@/lib/supabase/server";
import { GlassCard } from "@/components/ui/glass-card";
import { Badge } from "@/components/ui/badge";
import { StepEditor } from "@/components/admin/step-editor";
import { GitBranch, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Sequence, SequenceEnrollment, Contact } from "@/lib/types/database";

interface EnrollmentWithContact extends SequenceEnrollment {
  contacts: Pick<Contact, "id" | "full_name" | "email"> | null;
}

export default async function SequenceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: sequence } = await supabase
    .from("sequences")
    .select("*")
    .eq("id", id)
    .single();

  if (!sequence) {
    notFound();
  }

  const seq = sequence as Sequence;

  const { data: enrollments } = await supabase
    .from("sequence_enrollments")
    .select("*, contacts(id, full_name, email)")
    .eq("sequence_id", id)
    .order("enrolled_at", { ascending: false });

  const enrollmentList = (enrollments ?? []) as EnrollmentWithContact[];

  // Get event name if linked
  let eventName: string | null = null;
  if (seq.event_id) {
    const { data: event } = await supabase
      .from("events")
      .select("name")
      .eq("id", seq.event_id)
      .single();
    eventName = event?.name ?? null;
  }

  const steps = Array.isArray(seq.steps) ? seq.steps : [];

  const channelVariant: Record<string, string> = {
    email: "glass-indigo",
    linkedin: "glass-indigo",
    twitter: "glass-orange",
    telegram: "glass-orange",
  };

  const statusVariant: Record<string, string> = {
    active: "sent",
    paused: "draft",
    completed: "replied",
    bounced: "bounced",
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/admin/sequences"
          className="text-[var(--text-muted)] hover:text-white transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold font-[family-name:var(--font-heading)] text-white">
            {seq.name}
          </h1>
          <div className="flex items-center gap-3 mt-1">
            <Badge variant={channelVariant[seq.channel] ?? "default"}>
              {seq.channel}
            </Badge>
            {eventName && (
              <span className="text-sm text-[var(--text-muted)]">
                {eventName}
              </span>
            )}
            <span className="text-sm text-[var(--text-muted)]">
              {steps.length} step{steps.length !== 1 ? "s" : ""}
            </span>
          </div>
        </div>
      </div>

      {/* Main content: steps + sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Step Editor - 2/3 width */}
        <div className="lg:col-span-2">
          <StepEditor
            sequenceId={seq.id}
            initialSteps={steps}
            channel={seq.channel}
          />
        </div>

        {/* Enrolled Contacts Sidebar - 1/3 width */}
        <div>
          <GlassCard>
            <h2 className="text-lg font-semibold font-[family-name:var(--font-heading)] text-white mb-4">
              Enrolled Contacts
              <span className="text-sm font-normal text-[var(--text-muted)] ml-2">
                ({enrollmentList.length})
              </span>
            </h2>

            {enrollmentList.length === 0 ? (
              <div className="text-center py-8">
                <GitBranch className="h-8 w-8 text-[var(--text-muted)] mx-auto mb-2" />
                <p className="text-sm text-[var(--text-muted)]">
                  No contacts enrolled yet
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {enrollmentList.map((enrollment) => (
                  <div
                    key={enrollment.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-[var(--glass-bg)] border border-[var(--glass-border)] hover:bg-[var(--glass-bg-hover)] transition-all duration-200"
                  >
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/admin/contacts/${enrollment.contact_id}`}
                        className="text-sm text-white hover:text-[var(--accent-indigo)] transition-colors truncate block"
                      >
                        {enrollment.contacts?.full_name ?? "Unknown"}
                      </Link>
                      {enrollment.contacts?.email && (
                        <p className="text-xs text-[var(--text-muted)] truncate">
                          {enrollment.contacts.email}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 ml-3 shrink-0">
                      <span className="text-xs text-[var(--text-muted)]">
                        Step {enrollment.current_step}/{steps.length}
                      </span>
                      <Badge
                        variant={
                          statusVariant[enrollment.status] ?? "default"
                        }
                      >
                        {enrollment.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </GlassCard>
        </div>
      </div>
    </div>
  );
}
