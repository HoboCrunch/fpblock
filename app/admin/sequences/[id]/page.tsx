import { createClient } from "@/lib/supabase/server";
import { GlassCard } from "@/components/ui/glass-card";
import { Badge } from "@/components/ui/badge";
import { StepEditor } from "@/components/admin/step-editor";
import { EnrollmentPanel } from "./enrollment-panel";
import { SequenceControls } from "./sequence-controls";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Sequence, SequenceEnrollment, Person } from "@/lib/types/database";

interface EnrollmentWithPerson extends SequenceEnrollment {
  persons: Pick<Person, "id" | "full_name" | "email"> | null;
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
    .select("*, persons(id, full_name, email)")
    .eq("sequence_id", id)
    .order("enrolled_at", { ascending: false });

  const enrollmentList = (enrollments ?? []) as EnrollmentWithPerson[];

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

  // Get initiative name if linked
  let initiativeName: string | null = null;
  if (seq.initiative_id) {
    const { data: initiative } = await supabase
      .from("initiatives")
      .select("name")
      .eq("id", seq.initiative_id)
      .single();
    initiativeName = initiative?.name ?? null;
  }

  const steps = Array.isArray(seq.steps) ? seq.steps : [];

  const channelVariant: Record<string, string> = {
    email: "glass-indigo",
    linkedin: "glass-indigo",
    twitter: "glass-orange",
    telegram: "glass-orange",
  };

  const statusVariant: Record<string, string> = {
    draft: "draft",
    active: "sent",
    paused: "scheduled",
    completed: "replied",
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
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold font-[family-name:var(--font-heading)] text-white">
              {seq.name}
            </h1>
            <Badge variant={statusVariant[seq.status] ?? "default"}>
              {seq.status}
            </Badge>
          </div>
          <div className="flex items-center gap-3 mt-1">
            <Badge variant={channelVariant[seq.channel] ?? "default"}>
              {seq.channel}
            </Badge>
            {eventName && (
              <span className="text-sm text-[var(--text-muted)]">
                {eventName}
              </span>
            )}
            {initiativeName && (
              <span className="text-sm text-[var(--text-muted)]">
                {initiativeName}
              </span>
            )}
            <span className="text-sm text-[var(--text-muted)]">
              {steps.length} step{steps.length !== 1 ? "s" : ""}
            </span>
          </div>
        </div>
        <SequenceControls sequenceId={seq.id} status={seq.status} />
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

        {/* Enrolled Persons Sidebar - 1/3 width */}
        <div>
          <EnrollmentPanel
            sequenceId={seq.id}
            enrollments={enrollmentList}
            totalSteps={steps.length}
          />
        </div>
      </div>
    </div>
  );
}
