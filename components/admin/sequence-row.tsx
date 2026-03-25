"use client";

import React from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import type { SequenceWithStats } from "@/lib/queries/use-sequences";

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
  onHover: (id: string | null) => void;
}

export const SequenceRow = React.memo(function SequenceRow({
  sequence,
  selected,
  onSelect,
  onHover,
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
    ? formatDistanceToNow(new Date(sequence.updated_at), { addSuffix: true })
    : "—";

  return (
    <tr
      className="border-b border-[var(--glass-border)] last:border-0 hover:bg-[var(--glass-bg-hover)] transition-all duration-200 cursor-pointer"
      onMouseEnter={() => onHover(sequence.id)}
      onMouseLeave={() => onHover(null)}
    >
      {/* Checkbox */}
      <td className="px-4 py-3 w-10">
        <input
          type="checkbox"
          checked={selected}
          onChange={(e) => onSelect(sequence.id, e.target.checked)}
          onClick={(e) => e.stopPropagation()}
          className="rounded border-[var(--glass-border)] bg-[var(--glass-bg)] accent-[var(--accent-orange)] cursor-pointer"
        />
      </td>

      {/* Name */}
      <td className="px-4 py-3">
        <Link
          href={`/admin/sequences/${sequence.id}`}
          className="text-white hover:text-[var(--accent-indigo)] transition-colors font-medium"
        >
          {sequence.name}
        </Link>
      </td>

      {/* Channel */}
      <td className="px-4 py-3">
        <Badge variant={channelVariant[sequence.channel] ?? "default"}>
          {sequence.channel}
        </Badge>
      </td>

      {/* Status */}
      <td className="px-4 py-3">
        <Badge variant={statusVariant[sequence.status] ?? "default"}>
          {sequence.status}
        </Badge>
      </td>

      {/* Steps */}
      <td className="px-4 py-3 text-[var(--text-secondary)]">{steps.length}</td>

      {/* Enrolled */}
      <td className="px-4 py-3 text-[var(--text-secondary)]">
        {sequence.enrollment_count > 0 ? (
          <>
            {sequence.enrollment_count}{" "}
            <span className="text-[var(--text-muted)] text-xs">
              ({sequence.active_enrollment_count} active)
            </span>
          </>
        ) : (
          <span className="text-[var(--text-muted)]">—</span>
        )}
      </td>

      {/* Delivery funnel */}
      <td className="px-4 py-3">
        {sequence.sent_count > 0 ? (
          <span className="text-xs text-[var(--text-muted)]">
            {sequence.sent_count} sent · {sequence.opened_count} opened ·{" "}
            {sequence.replied_count} replied
          </span>
        ) : (
          <span className="text-[var(--text-muted)] text-xs">No sends yet</span>
        )}
      </td>

      {/* Mode */}
      <td className="px-4 py-3">
        <Badge variant={sequence.send_mode === "auto" ? "sent" : "scheduled"}>
          {sequence.send_mode === "auto" ? "Auto" : "Approval"}
        </Badge>
      </td>

      {/* Event */}
      <td className="px-4 py-3">
        {sequence.event_name ? (
          <Badge variant="draft">{sequence.event_name}</Badge>
        ) : (
          <span className="text-[var(--text-muted)] text-xs">—</span>
        )}
      </td>

      {/* Updated */}
      <td className="px-4 py-3 text-[var(--text-muted)] text-xs whitespace-nowrap">
        {updatedAt}
      </td>
    </tr>
  );
});
