"use client";

import { useMemo, useState } from "react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { useSequenceMessages, type SequenceMessage } from "@/lib/queries/use-sequence-messages";
import { useSequenceDetail } from "@/lib/queries/use-sequence-detail";
import { queryKeys } from "@/lib/queries/query-keys";
import { GlassCard } from "@/components/ui/glass-card";
import { Badge } from "@/components/ui/badge";
import { MessageRow } from "@/components/admin/message-row";
import { TwoPanelLayout } from "@/components/admin/two-panel-layout";
import { ToastViewport, toast } from "@/components/ui/toast";
import {
  ArrowLeft,
  Loader2,
  Calendar,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Info,
  X as XIcon,
} from "lucide-react";
import Link from "next/link";

const STATUS_TABS = [
  { label: "All", value: "" },
  { label: "Pending", value: "draft" },
  { label: "Queued", value: "scheduled,sending" },
  { label: "Sent", value: "sent,delivered,opened,clicked,replied" },
  { label: "Failed", value: "failed,bounced" },
  { label: "Rejected", value: "rejected" },
] as const;

type BulkAction = "approve" | "reject" | "reschedule" | "retry";

interface MessageQueueClientProps {
  sequenceId: string;
}

const TAB_EMPTY_COPY: Record<string, { title: string; hint: string }> = {
  "": {
    title: "No messages yet",
    hint: "Generate messages on the sequence detail page to populate the queue.",
  },
  draft: {
    title: "No drafts pending",
    hint: "Generate messages on the sequence detail page or wait for the next scheduled batch.",
  },
  "scheduled,sending": {
    title: "Nothing queued",
    hint: "Approve drafts to queue them for sending. In-flight sends also appear here.",
  },
  "sent,delivered,opened,clicked,replied": {
    title: "Nothing sent yet",
    hint: "Queued messages will appear here once delivered.",
  },
  "failed,bounced": {
    title: "No failures — clean run",
    hint: "Failed or bounced messages will surface here so you can retry.",
  },
  rejected: {
    title: "Nothing rejected",
    hint: "Drafts you reject land here, kept separate from delivery failures.",
  },
};

function toLocalInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function MessageQueueClient({ sequenceId }: MessageQueueClientProps) {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<string>("");
  const [search, setSearch] = useState("");
  const [stepFilter, setStepFilter] = useState<number | undefined>(undefined);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [bulkSchedulePicker, setBulkSchedulePicker] = useState<null | "approve" | "reschedule">(
    null
  );
  const [bulkScheduleAt, setBulkScheduleAt] = useState<string>(
    toLocalInputValue(new Date(Date.now() + 60 * 60 * 1000))
  );
  const [bulkRejectMode, setBulkRejectMode] = useState(false);
  const [bulkRejectReason, setBulkRejectReason] = useState("");

  const statusFilter = activeTab ? activeTab.split(",") : undefined;
  const filters = useMemo(
    () => ({
      status: statusFilter,
      step: stepFilter,
      search: search || undefined,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeTab, stepFilter, search]
  );

  const { data: messages = [], isLoading } = useSequenceMessages(sequenceId, filters);
  const { data: sequence } = useSequenceDetail(sequenceId);

  // Derive stats from the cached messages list. We pull the unfiltered list
  // (no filters applied) so stats reflect the whole sequence regardless of
  // which tab is active.
  const { data: allMessages = [] } = useSequenceMessages(sequenceId, {});
  const stats = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const m of allMessages) {
      counts[m.status] = (counts[m.status] ?? 0) + 1;
    }
    const sent = counts.sent ?? 0;
    const delivered = counts.delivered ?? 0;
    const opened = counts.opened ?? 0;
    const clicked = counts.clicked ?? 0;
    const replied = counts.replied ?? 0;
    const total = allMessages.length;
    const openRate =
      total > 0 ? Math.round(((opened + clicked + replied) / total) * 100) : 0;
    const replyRate = total > 0 ? Math.round((replied / total) * 100) : 0;
    // "Sent" counts every row that reached at least the sent state, matching
    // the Sent tab's filter (sent + delivered + opened + clicked + replied).
    const sentTotal = sent + delivered + opened + clicked + replied;
    return {
      total,
      draft: counts.draft ?? 0,
      scheduled: counts.scheduled ?? 0,
      sending: counts.sending ?? 0,
      sent,
      delivered,
      opened,
      clicked,
      replied,
      sentTotal,
      bounced: counts.bounced ?? 0,
      failed: counts.failed ?? 0,
      rejected: counts.rejected ?? 0,
      openRate,
      replyRate,
    };
  }, [allMessages]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: queryKeys.sequences.messages.all(sequenceId) });
    qc.invalidateQueries({ queryKey: queryKeys.sequences.stats(sequenceId) });
  };

  // Per-message PATCH ---------------------------------------------------------
  const messageMutation = useMutation({
    mutationFn: async ({
      msgId,
      action,
      data,
    }: {
      msgId: string;
      action: string;
      data?: Record<string, unknown>;
    }) => {
      const res = await fetch(`/api/sequences/${sequenceId}/messages/${msgId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...data }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Request failed (${res.status})`);
      }
      return { action, row: await res.json() };
    },
    onSuccess: ({ action }) => {
      const msg: Record<string, string> = {
        approve: "Message approved",
        approve_at: "Message scheduled",
        reschedule: "Message rescheduled",
        cancel: "Message moved back to drafts",
        reject: "Message rejected",
        retry: "Message requeued",
        resend: "Message requeued",
        edit: "Message updated",
      };
      toast.success(msg[action] ?? "Updated");
      invalidate();
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : "Action failed";
      toast.error(message);
    },
  });

  // Bulk POST -----------------------------------------------------------------
  const bulkMutation = useMutation({
    mutationFn: async ({
      action,
      scheduledAt,
      reason,
    }: {
      action: BulkAction;
      scheduledAt?: string;
      reason?: string;
    }) => {
      const ids = [...checkedIds];
      const res = await fetch(`/api/sequences/${sequenceId}/messages/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ids, scheduled_at: scheduledAt, reason }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error || `Request failed (${res.status})`);
      }
      return { action, ...(json as { succeeded: string[]; failed: { id: string; error: string }[] }) };
    },
    onSuccess: (result) => {
      const sCount = result.succeeded?.length ?? 0;
      const fCount = result.failed?.length ?? 0;
      const verb: Record<BulkAction, string> = {
        approve: "approved",
        reject: "rejected",
        reschedule: "rescheduled",
        retry: "requeued",
      };
      if (sCount > 0) {
        toast.success(
          `${sCount} message${sCount === 1 ? "" : "s"} ${verb[result.action]}` +
            (fCount > 0 ? ` (${fCount} skipped)` : "")
        );
      } else if (fCount > 0) {
        toast.error(`No eligible messages — ${fCount} skipped`);
      }
      setCheckedIds(new Set());
      setBulkSchedulePicker(null);
      setBulkRejectMode(false);
      setBulkRejectReason("");
      invalidate();
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : "Bulk action failed";
      toast.error(message);
    },
  });

  const toggleCheck = (id: string) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Compute selection composition to enable/disable bulk actions
  const selection = useMemo(() => {
    const map = new Map(messages.map((m) => [m.id, m]));
    const selected: SequenceMessage[] = [];
    for (const id of checkedIds) {
      const m = map.get(id);
      if (m) selected.push(m);
    }
    let drafts = 0;
    let scheduled = 0;
    let failed = 0;
    let terminal = 0;
    for (const m of selected) {
      if (m.status === "draft") drafts++;
      else if (m.status === "scheduled") scheduled++;
      else if (m.status === "failed" || m.status === "bounced") failed++;
      else terminal++;
    }
    return { selected, drafts, scheduled, failed, terminal };
  }, [checkedIds, messages]);

  const canBulkApprove = selection.drafts > 0;
  const canBulkReject = selection.drafts + selection.scheduled > 0;
  const canBulkReschedule = selection.drafts + selection.scheduled + selection.failed > 0;
  const canBulkRetry = selection.failed > 0;

  const sidebar = (
    <>
      {/* Stats — derived from cached messages list (no extra query) */}
      <GlassCard>
        <h3 className="text-sm font-semibold text-white mb-3">Stats</h3>
        <div className="space-y-2 text-sm">
          {[
            ["Total", stats.total],
            ["Pending", stats.draft],
            ["Queued", stats.scheduled],
            ["Sending", stats.sending],
            ["Sent", stats.sentTotal],
            ["Opened", `${stats.openRate}%`],
            ["Replied", `${stats.replyRate}%`],
            ["Bounced", stats.bounced],
            ["Failed", stats.failed],
            ["Rejected", stats.rejected],
          ].map(([label, value]) => (
            <div key={String(label)} className="flex justify-between">
              <span className="text-[var(--text-muted)]">{label}</span>
              <span className="text-white font-medium">{value}</span>
            </div>
          ))}
        </div>
      </GlassCard>

      {/* Filters */}
      <GlassCard>
        <h3 className="text-sm font-semibold text-white mb-3">Filters</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-[var(--text-muted)] mb-1">Search</label>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name or subject…"
              className="w-full bg-white/[0.06] border border-[var(--glass-border)] rounded-lg px-3 py-1.5 text-sm text-white placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-indigo)]/60"
            />
          </div>
          <div>
            <label className="block text-xs text-[var(--text-muted)] mb-1">Step</label>
            <select
              value={stepFilter ?? ""}
              onChange={(e) =>
                setStepFilter(e.target.value === "" ? undefined : Number(e.target.value))
              }
              className="w-full bg-white/[0.06] border border-[var(--glass-border)] rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-[var(--accent-indigo)]/60"
            >
              <option value="">All steps</option>
              {[0, 1, 2, 3, 4].map((s) => (
                <option key={s} value={s}>
                  Step {s + 1}
                </option>
              ))}
            </select>
          </div>
        </div>
      </GlassCard>
    </>
  );

  const emptyCopy = TAB_EMPTY_COPY[activeTab] ?? TAB_EMPTY_COPY[""];
  const showApprovalBanner = sequence?.send_mode === "approval";

  return (
    <TwoPanelLayout sidebar={sidebar}>
      <ToastViewport />

      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <Link
          href={`/admin/sequences/${sequenceId}`}
          className="text-[var(--text-muted)] hover:text-white transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-semibold font-[family-name:var(--font-heading)] text-white">
          Messages
        </h1>
      </div>

      {/* Approval-mode banner */}
      {showApprovalBanner && (
        <div className="mb-4 flex items-start gap-2 rounded-lg bg-[var(--accent-indigo)]/8 border border-[var(--accent-indigo)]/30 px-3 py-2.5">
          <Info className="h-4 w-4 text-[var(--accent-indigo)] mt-0.5 shrink-0" />
          <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
            <span className="font-medium text-white">This sequence requires approval before sending.</span>{" "}
            Drafts are queued here — review and approve to send.
          </p>
        </div>
      )}

      {/* Status tabs */}
      <div className="flex gap-1 mb-4 border-b border-[var(--glass-border)] pb-0">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setActiveTab(tab.value)}
            className={`px-3 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              activeTab === tab.value
                ? "text-white border-b-2 border-[var(--accent-indigo)]"
                : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Bulk action bar (sticky-feeling, appears when there's selection) */}
      {checkedIds.size > 0 && (
        <div className="mb-3 rounded-lg border border-[var(--accent-indigo)]/30 bg-[var(--accent-indigo)]/5 px-3 py-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="glass-indigo">{checkedIds.size} selected</Badge>
            <span className="text-xs text-[var(--text-muted)]">
              {selection.drafts} draft{selection.drafts === 1 ? "" : "s"} · {selection.scheduled} scheduled · {selection.failed} failed
            </span>

            <div className="flex-1" />

            <BulkButton
              icon={<CheckCircle2 className="h-3.5 w-3.5" />}
              label="Approve"
              tone="green"
              disabled={!canBulkApprove || bulkMutation.isPending}
              tooltip={canBulkApprove ? undefined : "Select drafts to approve"}
              onClick={() => bulkMutation.mutate({ action: "approve" })}
            />
            <BulkButton
              icon={<Calendar className="h-3.5 w-3.5" />}
              label="Reschedule"
              tone="indigo"
              disabled={!canBulkReschedule || bulkMutation.isPending}
              tooltip={canBulkReschedule ? undefined : "Select drafts, scheduled, or failed messages"}
              onClick={() => {
                setBulkSchedulePicker("reschedule");
                setBulkRejectMode(false);
              }}
            />
            <BulkButton
              icon={<RotateCcw className="h-3.5 w-3.5" />}
              label="Retry"
              tone="indigo"
              disabled={!canBulkRetry || bulkMutation.isPending}
              tooltip={canBulkRetry ? undefined : "Select failed messages to retry"}
              onClick={() => bulkMutation.mutate({ action: "retry" })}
            />
            <BulkButton
              icon={<XCircle className="h-3.5 w-3.5" />}
              label="Reject"
              tone="red"
              disabled={!canBulkReject || bulkMutation.isPending}
              tooltip={canBulkReject ? undefined : "Select drafts or scheduled messages to reject"}
              onClick={() => {
                setBulkRejectMode(true);
                setBulkSchedulePicker(null);
              }}
            />
            <button
              onClick={() => setCheckedIds(new Set())}
              className="text-xs text-[var(--text-muted)] hover:text-white transition-colors px-2 py-1"
              aria-label="Clear selection"
            >
              <XIcon className="h-3.5 w-3.5" />
            </button>
          </div>

          {bulkSchedulePicker && (
            <div className="mt-2.5 flex items-center gap-2">
              <Calendar className="h-4 w-4 text-[var(--text-muted)]" />
              <input
                type="datetime-local"
                value={bulkScheduleAt}
                onChange={(e) => setBulkScheduleAt(e.target.value)}
                className="bg-white/[0.06] border border-[var(--glass-border)] rounded-md px-2 py-1 text-xs text-white focus:outline-none focus:border-[var(--accent-indigo)]/60"
              />
              <button
                onClick={() => {
                  if (!bulkScheduleAt) return;
                  const iso = new Date(bulkScheduleAt).toISOString();
                  bulkMutation.mutate({ action: "reschedule", scheduledAt: iso });
                }}
                disabled={bulkMutation.isPending}
                className="px-3 py-1 rounded-md text-xs font-medium bg-[var(--accent-indigo)] text-white hover:bg-[var(--accent-indigo)]/80 transition-colors disabled:opacity-50"
              >
                Apply to {selection.drafts + selection.scheduled + selection.failed} message
                {selection.drafts + selection.scheduled + selection.failed === 1 ? "" : "s"}
              </button>
              <button
                onClick={() => setBulkSchedulePicker(null)}
                className="px-2 py-1 rounded-md text-xs text-[var(--text-muted)] hover:text-white transition-colors"
              >
                Cancel
              </button>
            </div>
          )}

          {bulkRejectMode && (
            <div className="mt-2.5 flex items-center gap-2">
              <input
                type="text"
                placeholder="Rejection reason (optional)"
                value={bulkRejectReason}
                onChange={(e) => setBulkRejectReason(e.target.value)}
                className="flex-1 bg-white/[0.06] border border-[var(--glass-border)] rounded-md px-2 py-1 text-xs text-white placeholder-[var(--text-muted)] focus:outline-none focus:border-red-500/60"
              />
              <button
                onClick={() =>
                  bulkMutation.mutate({
                    action: "reject",
                    reason: bulkRejectReason || "rejected",
                  })
                }
                disabled={bulkMutation.isPending}
                className="px-3 py-1 rounded-md text-xs font-medium bg-red-500/15 text-red-300 border border-red-500/30 hover:bg-red-500/25 transition-colors disabled:opacity-50"
              >
                Confirm reject
              </button>
              <button
                onClick={() => setBulkRejectMode(false)}
                className="px-2 py-1 rounded-md text-xs text-[var(--text-muted)] hover:text-white transition-colors"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      )}

      {/* Table */}
      <GlassCard padding={false}>
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-[var(--text-muted)]" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center px-6">
            <p className="text-[var(--text-secondary)] mb-1">{emptyCopy.title}</p>
            <p className="text-sm text-[var(--text-muted)] max-w-sm">{emptyCopy.hint}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm table-fixed">
              <colgroup>
                <col className="w-8" />     {/* Checkbox */}
                <col />                       {/* Recipient */}
                <col className="w-20" />     {/* Step */}
                <col />                       {/* Subject */}
                <col className="w-28" />     {/* Status */}
                <col className="w-32" />     {/* Scheduled */}
                <col className="w-32" />     {/* Sent */}
                <col className="w-24" />     {/* Engagement */}
                <col className="w-20" />     {/* Actions */}
              </colgroup>
              <thead>
                <tr className="border-b border-[var(--glass-border)] text-left">
                  <th className="px-4 py-3 w-8">
                    <input
                      type="checkbox"
                      checked={checkedIds.size === messages.length && messages.length > 0}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setCheckedIds(new Set(messages.map((m) => m.id)));
                        } else {
                          setCheckedIds(new Set());
                        }
                      }}
                      className="rounded"
                    />
                  </th>
                  {[
                    "Recipient",
                    "Step",
                    "Subject",
                    "Status",
                    "Scheduled",
                    "Sent",
                    "Engagement",
                    "",
                  ].map((col, i) => (
                    <th
                      key={`${col}-${i}`}
                      className="px-4 py-3 text-[var(--text-muted)] font-medium text-xs uppercase tracking-wide"
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {messages.map((msg) => (
                  <MessageRow
                    key={msg.id}
                    message={msg}
                    checked={checkedIds.has(msg.id)}
                    expanded={expandedId === msg.id}
                    onCheck={() => toggleCheck(msg.id)}
                    onToggle={() => setExpandedId(expandedId === msg.id ? null : msg.id)}
                    onAction={(action, data) =>
                      messageMutation.mutate({ msgId: msg.id, action, data })
                    }
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>
    </TwoPanelLayout>
  );
}

// ---------------------------------------------------------------------------
// Bulk action button — small wrapper that handles the disabled-with-tooltip
// state so the bulk bar reads cleanly.
function BulkButton({
  icon,
  label,
  tone,
  disabled,
  tooltip,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  tone: "green" | "red" | "indigo";
  disabled: boolean;
  tooltip?: string;
  onClick: () => void;
}) {
  const styles: Record<typeof tone, string> = {
    green:
      "bg-green-500/10 text-green-400 border-green-500/20 hover:bg-green-500/20",
    red: "bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20",
    indigo:
      "bg-[var(--accent-indigo)]/10 text-[var(--accent-indigo)] border-[var(--accent-indigo)]/20 hover:bg-[var(--accent-indigo)]/20",
  } as const;

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={tooltip}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${styles[tone]}`}
    >
      {icon}
      {label}
    </button>
  );
}
