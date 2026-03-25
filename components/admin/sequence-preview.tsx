"use client";

import React from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { GlassCard } from "@/components/ui/glass-card";
import { ArrowRight } from "lucide-react";
import type { SequenceWithStats } from "@/lib/queries/use-sequences";
import type { SequenceStep } from "@/lib/types/database";

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

function formatStepLabel(step: SequenceStep, index: number): string {
  const dayLabel = step.delay_days === 0 ? "Day 0" : `+${step.delay_days}d`;
  const actionLabels: Record<string, string> = {
    initial: "Initial",
    follow_up: "Follow-up",
    break_up: "Break-up",
  };
  const actionLabel = actionLabels[step.action_type] ?? step.action_type;
  return `${dayLabel}: ${actionLabel}`;
}

interface SequencePreviewProps {
  sequence: SequenceWithStats | null;
}

export const SequencePreview = React.memo(function SequencePreview({
  sequence,
}: SequencePreviewProps) {
  if (!sequence) return null;

  const steps = Array.isArray(sequence.steps) ? sequence.steps : [];
  const openRate =
    sequence.sent_count > 0
      ? Math.round((sequence.opened_count / sequence.sent_count) * 100)
      : 0;
  const replyRate =
    sequence.sent_count > 0
      ? Math.round((sequence.replied_count / sequence.sent_count) * 100)
      : 0;

  const completedCount =
    sequence.enrollment_count - sequence.active_enrollment_count;
  const bouncedCount = 0; // Not tracked in current stats

  return (
    <GlassCard className="space-y-4">
      {/* Header */}
      <div className="space-y-2">
        <p className="text-xs text-[var(--text-muted)] uppercase tracking-wide font-medium">
          Preview
        </p>
        <h3 className="text-white font-semibold leading-tight">{sequence.name}</h3>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant={statusVariant[sequence.status] ?? "default"}>
            {sequence.status}
          </Badge>
          <Badge variant={channelVariant[sequence.channel] ?? "default"}>
            {sequence.channel}
          </Badge>
        </div>
      </div>

      {/* Step timeline */}
      {steps.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-[var(--text-muted)] font-medium">Steps</p>
          <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
            {steps.map((step, i) => formatStepLabel(step, i)).join(" → ")}
          </p>
        </div>
      )}

      {/* Enrollment */}
      <div className="space-y-1">
        <p className="text-xs text-[var(--text-muted)] font-medium">Enrollment</p>
        <p className="text-xs text-[var(--text-secondary)]">
          {sequence.active_enrollment_count} active · {completedCount} completed
          {bouncedCount > 0 ? ` · ${bouncedCount} bounced` : ""}
        </p>
      </div>

      {/* Performance */}
      <div className="space-y-1">
        <p className="text-xs text-[var(--text-muted)] font-medium">Performance</p>
        <div className="flex items-center gap-4">
          <div>
            <p className="text-lg font-bold text-white">{openRate}%</p>
            <p className="text-xs text-[var(--text-muted)]">Open rate</p>
          </div>
          <div>
            <p className="text-lg font-bold text-white">{replyRate}%</p>
            <p className="text-xs text-[var(--text-muted)]">Reply rate</p>
          </div>
        </div>
      </div>

      {/* Link */}
      <Link
        href={`/admin/sequences/${sequence.id}`}
        className="flex items-center gap-1 text-xs text-[var(--accent-indigo)] hover:text-[var(--accent-indigo)]/80 transition-colors font-medium"
      >
        View Details
        <ArrowRight className="h-3 w-3" />
      </Link>
    </GlassCard>
  );
});
