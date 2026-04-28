"use client";

import React from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { TextCell, NumericCell, PillCell, DateCell } from "@/components/ui/data-cell";
import type { SequenceWithStats } from "@/lib/queries/use-sequences";

function formatDistanceToNow(date: Date): string {
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  const absSeconds = Math.abs(seconds);
  const suffix = seconds >= 0 ? "ago" : "from now";

  const units: Array<[number, string]> = [
    [60, "second"],
    [60, "minute"],
    [24, "hour"],
    [30, "day"],
    [12, "month"],
    [Number.POSITIVE_INFINITY, "year"],
  ];

  let value = absSeconds;
  let label = "second";
  for (const [divisor, unit] of units) {
    label = unit;
    if (value < divisor) break;
    value = Math.floor(value / divisor);
  }

  const rounded = Math.max(1, Math.round(value));
  return `${rounded} ${label}${rounded === 1 ? "" : "s"} ${suffix}`;
}

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

interface SequenceRowProps {
  sequence: SequenceWithStats;
  selected: boolean;
  onSelect: (id: string, checked: boolean) => void;
}

export const SequenceRow = React.memo(function SequenceRow({
  sequence,
  selected,
  onSelect,
}: SequenceRowProps) {
  const steps = Array.isArray(sequence.steps) ? sequence.steps : [];
  const completionRate =
    sequence.enrollment_count > 0
      ? Math.round(
          ((sequence.enrollment_count - sequence.active_enrollment_count) /
            sequence.enrollment_count) *
            100
        )
      : 0;

  const openRate =
    sequence.sent_count > 0
      ? Math.round((sequence.opened_count / sequence.sent_count) * 100)
      : 0;

  const updatedAt = sequence.updated_at
    ? formatDistanceToNow(new Date(sequence.updated_at))
    : "—";

  return (
    <>
      {/* 1. Checkbox */}
      <div className="px-2 py-1 flex items-center">
        <input
          type="checkbox"
          checked={selected}
          onChange={(e) => onSelect(sequence.id, e.target.checked)}
          onClick={(e) => e.stopPropagation()}
          className="rounded border-[var(--glass-border)] bg-[var(--glass-bg)] accent-[var(--accent-orange)]"
        />
      </div>

      {/* 2. Name */}
      <TextCell>
        <Link
          href={`/admin/sequences/${sequence.id}`}
          className="text-white font-medium hover:text-[var(--accent-indigo)]"
        >
          {sequence.name}
        </Link>
      </TextCell>

      {/* 3. Channel */}
      <PillCell>
        <Badge variant={channelVariant[sequence.channel] ?? "default"}>{sequence.channel}</Badge>
      </PillCell>

      {/* 4. Status */}
      <PillCell>
        <Badge variant={statusVariant[sequence.status] ?? "default"}>{sequence.status}</Badge>
      </PillCell>

      {/* 5. Steps */}
      <NumericCell>{steps.length}</NumericCell>

      {/* 6. Enrolled */}
      <TextCell>
        {sequence.enrollment_count > 0 ? (
          <>
            {sequence.enrollment_count}{" "}
            <span className="text-[var(--text-muted)]">({sequence.active_enrollment_count} active)</span>
          </>
        ) : (
          <span className="text-[var(--text-muted)]">—</span>
        )}
      </TextCell>

      {/* 7. Delivery (compressed) */}
      <TextCell title={`${sequence.sent_count} sent · ${sequence.opened_count} opened · ${sequence.replied_count} replied`}>
        {sequence.sent_count > 0
          ? `${sequence.sent_count} · ${sequence.opened_count}o · ${sequence.replied_count}r`
          : "No sends"}
      </TextCell>

      {/* 8. Mode */}
      <PillCell>
        <Badge variant={sequence.send_mode === "auto" ? "sent" : "scheduled"}>
          {sequence.send_mode === "auto" ? "Auto" : "Approval"}
        </Badge>
      </PillCell>

      {/* 9. Event */}
      <PillCell title={sequence.event_name ?? undefined}>
        {sequence.event_name ? (
          <Badge variant="draft" className="max-w-full">{sequence.event_name}</Badge>
        ) : (
          <span className="text-[var(--text-muted)]">—</span>
        )}
      </PillCell>

      {/* 10. Updated */}
      <DateCell>{updatedAt}</DateCell>
    </>
  );
});
