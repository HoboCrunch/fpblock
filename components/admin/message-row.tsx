"use client";

import React, { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Eye, Reply, Link2, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SequenceMessage } from "@/lib/queries/use-sequence-messages";

const STATUS_VARIANTS: Record<string, string> = {
  draft: "draft",
  scheduled: "glass-indigo",
  sending: "processing",
  sent: "sent",
  delivered: "sent",
  opened: "glass-indigo",
  clicked: "glass-indigo",
  replied: "replied",
  bounced: "bounced",
  failed: "failed",
};

function formatDateTime(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

interface MessageRowProps {
  message: SequenceMessage;
  expanded: boolean;
  onToggle: () => void;
  onAction: (action: string, data?: Record<string, unknown>) => void;
  checked?: boolean;
  onCheck?: () => void;
}

export const MessageRow = React.memo(function MessageRow({
  message,
  expanded,
  onToggle,
  onAction,
  checked,
  onCheck,
}: MessageRowProps) {
  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState(message.body ?? "");
  const [editSubject, setEditSubject] = useState(message.subject ?? "");

  const step = message.sequence_step;
  const stepLabel = step !== null ? `Step ${step + 1}` : "–";

  const subject = message.subject ?? "";
  const truncatedSubject =
    subject.length > 40 ? subject.slice(0, 40) + "…" : subject;

  const hasOpened =
    message.status === "opened" ||
    message.status === "clicked" ||
    message.status === "replied";
  const hasReplied = message.status === "replied";
  const hasClicked = message.status === "clicked";

  const canApprove = message.status === "draft";
  const canReject = message.status === "draft" || message.status === "scheduled";
  const canCancel = message.status === "scheduled";
  const canResend =
    message.status === "failed" ||
    message.status === "bounced" ||
    message.status === "sent";
  const canEdit =
    message.status === "draft" || message.status === "scheduled";

  function handleSaveEdit() {
    onAction("edit", { body: editBody, subject: editSubject });
    setEditing(false);
  }

  return (
    <>
      {/* Collapsed row */}
      <tr
        onClick={onToggle}
        className={cn(
          "border-b border-[var(--glass-border)] cursor-pointer transition-colors duration-150",
          expanded
            ? "bg-white/[0.04]"
            : "hover:bg-white/[0.025]"
        )}
      >
        {/* Checkbox */}
        {onCheck !== undefined && (
          <td className="px-4 py-3 w-8" onClick={(e) => e.stopPropagation()}>
            <input
              type="checkbox"
              checked={checked ?? false}
              onChange={onCheck}
              className="rounded mt-0.5"
            />
          </td>
        )}

        {/* Recipient */}
        <td className="px-4 py-3">
          <div className="font-medium text-white text-sm leading-tight">
            {message.person_name ?? "—"}
          </div>
          {message.person_title && (
            <div className="text-xs text-[var(--text-muted)] mt-0.5 leading-tight">
              {message.person_title}
            </div>
          )}
        </td>

        {/* Step */}
        <td className="px-4 py-3 text-sm text-[var(--text-secondary)] whitespace-nowrap">
          {stepLabel}
        </td>

        {/* Subject */}
        <td className="px-4 py-3 text-sm text-[var(--text-secondary)] max-w-[200px]">
          {truncatedSubject || <span className="italic text-[var(--text-muted)]">No subject</span>}
        </td>

        {/* Status */}
        <td className="px-4 py-3">
          <Badge variant={STATUS_VARIANTS[message.status] ?? "default"}>
            {message.status}
          </Badge>
        </td>

        {/* Scheduled */}
        <td className="px-4 py-3 text-sm text-[var(--text-secondary)] whitespace-nowrap">
          {message.scheduled_at
            ? formatDateTime(message.scheduled_at)
            : <span className="text-[var(--text-muted)] italic text-xs">Awaiting approval</span>}
        </td>

        {/* Sent */}
        <td className="px-4 py-3 text-sm text-[var(--text-secondary)] whitespace-nowrap">
          {message.occurred_at ? formatDateTime(message.occurred_at) : ""}
        </td>

        {/* Engagement */}
        <td className="px-4 py-3">
          <div className="flex items-center gap-1.5">
            <Eye
              className={cn("h-3.5 w-3.5", hasOpened ? "text-teal-400" : "text-[var(--text-muted)]/30")}
            />
            <Reply
              className={cn("h-3.5 w-3.5", hasReplied ? "text-emerald-400" : "text-[var(--text-muted)]/30")}
            />
            <Link2
              className={cn("h-3.5 w-3.5", hasClicked ? "text-[var(--accent-indigo)]" : "text-[var(--text-muted)]/30")}
            />
          </div>
        </td>

        {/* Expand toggle */}
        <td className="px-3 py-3 text-[var(--text-muted)]">
          {expanded ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </td>
      </tr>

      {/* Expanded detail row */}
      {expanded && (
        <tr className="border-b border-[var(--glass-border)] bg-white/[0.02]">
          <td colSpan={onCheck !== undefined ? 9 : 8} className="px-4 py-4">
            <div className="space-y-3">
              {editing ? (
                <div className="space-y-2">
                  <input
                    className="w-full bg-white/[0.06] border border-[var(--glass-border)] rounded-lg px-3 py-2 text-sm text-white placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-indigo)]/60"
                    value={editSubject}
                    onChange={(e) => setEditSubject(e.target.value)}
                    placeholder="Subject"
                  />
                  <textarea
                    className="w-full bg-white/[0.06] border border-[var(--glass-border)] rounded-lg px-3 py-2 text-sm text-white placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-indigo)]/60 resize-y min-h-[120px]"
                    value={editBody}
                    onChange={(e) => setEditBody(e.target.value)}
                    placeholder="Message body"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleSaveEdit(); }}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--accent-indigo)] text-white hover:bg-[var(--accent-indigo)]/80 transition-colors"
                    >
                      Save
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setEditing(false); }}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--text-secondary)] hover:text-white transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {message.subject && (
                    <p className="text-sm font-medium text-white">
                      {message.subject}
                    </p>
                  )}
                  {message.body ? (
                    <pre className="text-sm text-[var(--text-secondary)] whitespace-pre-wrap font-sans leading-relaxed max-h-48 overflow-y-auto">
                      {message.body}
                    </pre>
                  ) : (
                    <p className="text-sm italic text-[var(--text-muted)]">No body content</p>
                  )}
                </>
              )}

              {/* Action buttons */}
              {!editing && (
                <div className="flex flex-wrap gap-2 pt-1" onClick={(e) => e.stopPropagation()}>
                  {canEdit && (
                    <button
                      onClick={() => setEditing(true)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium glass hover:bg-white/[0.06] text-[var(--text-secondary)] hover:text-white transition-colors"
                    >
                      Edit
                    </button>
                  )}
                  {canApprove && (
                    <button
                      onClick={() => onAction("approve")}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500/20 transition-colors"
                    >
                      Approve
                    </button>
                  )}
                  {canReject && (
                    <button
                      onClick={() => onAction("reject")}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors"
                    >
                      Reject
                    </button>
                  )}
                  {canCancel && (
                    <button
                      onClick={() => onAction("cancel")}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium glass hover:bg-white/[0.06] text-[var(--text-secondary)] hover:text-white transition-colors"
                    >
                      Cancel
                    </button>
                  )}
                  {canResend && (
                    <button
                      onClick={() => onAction("resend")}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--accent-indigo)]/10 text-[var(--accent-indigo)] border border-[var(--accent-indigo)]/20 hover:bg-[var(--accent-indigo)]/20 transition-colors"
                    >
                      Resend
                    </button>
                  )}
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
});
