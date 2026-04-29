"use client";

import React, { useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Eye,
  Reply,
  Link2,
  ChevronDown,
  ChevronUp,
  Calendar,
  CheckCircle2,
  RotateCcw,
  AlertTriangle,
} from "lucide-react";
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

/**
 * Convert an ISO timestamp to a value usable by <input type="datetime-local">.
 * datetime-local expects local time without timezone, e.g. "2026-04-28T14:30".
 */
function toLocalInputValue(iso: string | null): string {
  const d = iso ? new Date(iso) : new Date(Date.now() + 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
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

  // Inline pickers
  const [scheduleMode, setScheduleMode] = useState<null | "approve" | "reschedule">(null);
  const [scheduleAt, setScheduleAt] = useState<string>("");
  const [rejectMode, setRejectMode] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const step = message.sequence_step;
  const stepLabel = step !== null ? `Step ${step + 1}` : "–";

  const subject = message.subject ?? "";

  const hasOpened =
    message.status === "opened" ||
    message.status === "clicked" ||
    message.status === "replied";
  const hasReplied = message.status === "replied";
  const hasClicked = message.status === "clicked";

  // Action eligibility — mirrors server validation
  const isDraft = message.status === "draft";
  const isScheduled = message.status === "scheduled";
  const isFailed = message.status === "failed" || message.status === "bounced";
  const canEdit = isDraft || isScheduled;

  const detail = (message.detail as Record<string, unknown> | null) ?? null;
  const errorText =
    typeof detail?.error === "string"
      ? (detail.error as string)
      : typeof detail?.reason === "string"
      ? (detail.reason as string)
      : null;

  function handleSaveEdit() {
    onAction("edit", { body: editBody, subject: editSubject });
    setEditing(false);
  }

  function openSchedulePicker(mode: "approve" | "reschedule") {
    setScheduleMode(mode);
    setScheduleAt(toLocalInputValue(message.scheduled_at));
    setRejectMode(false);
  }

  function submitSchedule() {
    if (!scheduleAt) return;
    // Convert local datetime-local string → ISO (in user's tz)
    const iso = new Date(scheduleAt).toISOString();
    if (scheduleMode === "approve") {
      onAction("approve_at", { scheduled_at: iso });
    } else {
      onAction("reschedule", { scheduled_at: iso });
    }
    setScheduleMode(null);
  }

  function submitReject() {
    onAction("reject", { reason: rejectReason || "rejected" });
    setRejectMode(false);
    setRejectReason("");
  }

  return (
    <>
      {/* Collapsed row */}
      <tr
        onClick={onToggle}
        className={cn(
          "border-b border-[var(--glass-border)] cursor-pointer transition-colors duration-150",
          expanded ? "bg-white/[0.04]" : "hover:bg-white/[0.025]"
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
        <td className="px-4 py-3 overflow-hidden">
          <div className="font-medium text-white text-sm leading-tight truncate">
            {message.person_name ?? "—"}
          </div>
          {message.person_title && (
            <div className="text-xs text-[var(--text-muted)] mt-0.5 leading-tight truncate">
              {message.person_title}
            </div>
          )}
        </td>

        {/* Step */}
        <td className="px-4 py-3 text-sm text-[var(--text-secondary)] whitespace-nowrap">
          {stepLabel}
        </td>

        {/* Subject */}
        <td
          className="px-4 py-3 text-sm text-[var(--text-secondary)] overflow-hidden text-ellipsis whitespace-nowrap"
          title={subject || undefined}
        >
          {subject || <span className="italic text-[var(--text-muted)]">No subject</span>}
        </td>

        {/* Status */}
        <td className="px-4 py-3">
          <Badge variant={STATUS_VARIANTS[message.status] ?? "default"}>
            {message.status}
          </Badge>
        </td>

        {/* Scheduled */}
        <td className="px-4 py-3 text-sm text-[var(--text-secondary)] whitespace-nowrap">
          {message.scheduled_at ? (
            formatDateTime(message.scheduled_at)
          ) : (
            <span className="text-[var(--text-muted)] italic text-xs">Awaiting approval</span>
          )}
        </td>

        {/* Sent */}
        <td className="px-4 py-3 text-sm text-[var(--text-secondary)] whitespace-nowrap">
          {message.occurred_at ? formatDateTime(message.occurred_at) : ""}
        </td>

        {/* Engagement */}
        <td className="px-4 py-3">
          <div className="flex items-center gap-1.5">
            <Eye
              className={cn(
                "h-3.5 w-3.5",
                hasOpened ? "text-teal-400" : "text-[var(--text-muted)]/30"
              )}
            />
            <Reply
              className={cn(
                "h-3.5 w-3.5",
                hasReplied ? "text-emerald-400" : "text-[var(--text-muted)]/30"
              )}
            />
            <Link2
              className={cn(
                "h-3.5 w-3.5",
                hasClicked ? "text-[var(--accent-indigo)]" : "text-[var(--text-muted)]/30"
              )}
            />
          </div>
        </td>

        {/* Quick approve / retry inline */}
        <td className="px-2 py-3" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-1">
            {isDraft && (
              <button
                onClick={() => onAction("approve")}
                title="Approve & schedule now"
                className="p-1 rounded text-green-400 hover:bg-green-500/15 transition-colors"
                aria-label="Approve"
              >
                <CheckCircle2 className="h-4 w-4" />
              </button>
            )}
            {isFailed && (
              <button
                onClick={() => onAction("retry")}
                title="Retry"
                className="p-1 rounded text-[var(--accent-indigo)] hover:bg-[var(--accent-indigo)]/15 transition-colors"
                aria-label="Retry"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
            )}
            <button
              onClick={onToggle}
              className="p-1 text-[var(--text-muted)] hover:text-white transition-colors"
              aria-label="Expand"
            >
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          </div>
        </td>
      </tr>

      {/* Expanded detail row */}
      {expanded && (
        <tr className="border-b border-[var(--glass-border)] bg-white/[0.02]">
          <td colSpan={onCheck !== undefined ? 9 : 8} className="px-4 py-4">
            <div className="space-y-3">
              {/* Failure detail banner */}
              {isFailed && errorText && (
                <div className="flex items-start gap-2 rounded-lg bg-red-500/10 border border-red-500/30 p-2.5">
                  <AlertTriangle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
                  <p className="text-xs text-red-300 leading-relaxed">{errorText}</p>
                </div>
              )}

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
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSaveEdit();
                      }}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--accent-indigo)] text-white hover:bg-[var(--accent-indigo)]/80 transition-colors"
                    >
                      Save
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditing(false);
                      }}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--text-secondary)] hover:text-white transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {message.subject && (
                    <p className="text-sm font-medium text-white">{message.subject}</p>
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

              {/* Inline schedule picker */}
              {scheduleMode && (
                <div
                  className="flex items-center gap-2 rounded-lg bg-white/[0.04] border border-[var(--glass-border)] p-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Calendar className="h-4 w-4 text-[var(--text-muted)]" />
                  <input
                    type="datetime-local"
                    value={scheduleAt}
                    onChange={(e) => setScheduleAt(e.target.value)}
                    className="bg-white/[0.06] border border-[var(--glass-border)] rounded-md px-2 py-1 text-xs text-white focus:outline-none focus:border-[var(--accent-indigo)]/60"
                  />
                  <button
                    onClick={submitSchedule}
                    className="px-2.5 py-1 rounded-md text-xs font-medium bg-[var(--accent-indigo)] text-white hover:bg-[var(--accent-indigo)]/80 transition-colors"
                  >
                    {scheduleMode === "approve" ? "Approve & schedule" : "Reschedule"}
                  </button>
                  <button
                    onClick={() => setScheduleMode(null)}
                    className="px-2 py-1 rounded-md text-xs text-[var(--text-muted)] hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              )}

              {/* Inline reject reason */}
              {rejectMode && (
                <div
                  className="flex items-center gap-2 rounded-lg bg-white/[0.04] border border-[var(--glass-border)] p-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="text"
                    placeholder="Reason (optional)"
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    className="flex-1 bg-white/[0.06] border border-[var(--glass-border)] rounded-md px-2 py-1 text-xs text-white placeholder-[var(--text-muted)] focus:outline-none focus:border-red-500/60"
                  />
                  <button
                    onClick={submitReject}
                    className="px-2.5 py-1 rounded-md text-xs font-medium bg-red-500/15 text-red-300 border border-red-500/30 hover:bg-red-500/25 transition-colors"
                  >
                    Confirm reject
                  </button>
                  <button
                    onClick={() => setRejectMode(false)}
                    className="px-2 py-1 rounded-md text-xs text-[var(--text-muted)] hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              )}

              {/* Action buttons */}
              {!editing && !scheduleMode && !rejectMode && (
                <div
                  className="flex flex-wrap gap-2 pt-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  {canEdit && (
                    <button
                      onClick={() => setEditing(true)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium glass hover:bg-white/[0.06] text-[var(--text-secondary)] hover:text-white transition-colors"
                    >
                      Edit
                    </button>
                  )}
                  {isDraft && (
                    <>
                      <button
                        onClick={() => onAction("approve")}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500/20 transition-colors"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => openSchedulePicker("approve")}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-green-500/5 text-green-300 border border-green-500/20 hover:bg-green-500/15 transition-colors inline-flex items-center gap-1"
                      >
                        <Calendar className="h-3 w-3" />
                        Approve & schedule
                      </button>
                    </>
                  )}
                  {(isDraft || isScheduled) && (
                    <button
                      onClick={() => setRejectMode(true)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors"
                    >
                      Reject
                    </button>
                  )}
                  {isScheduled && (
                    <>
                      <button
                        onClick={() => openSchedulePicker("reschedule")}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium glass hover:bg-white/[0.06] text-[var(--text-secondary)] hover:text-white transition-colors inline-flex items-center gap-1"
                      >
                        <Calendar className="h-3 w-3" />
                        Reschedule
                      </button>
                      <button
                        onClick={() => onAction("cancel")}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium glass hover:bg-white/[0.06] text-[var(--text-secondary)] hover:text-white transition-colors"
                      >
                        Cancel
                      </button>
                    </>
                  )}
                  {isFailed && (
                    <button
                      onClick={() => onAction("retry")}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--accent-indigo)]/10 text-[var(--accent-indigo)] border border-[var(--accent-indigo)]/20 hover:bg-[var(--accent-indigo)]/20 transition-colors inline-flex items-center gap-1"
                    >
                      <RotateCcw className="h-3 w-3" />
                      Retry
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
