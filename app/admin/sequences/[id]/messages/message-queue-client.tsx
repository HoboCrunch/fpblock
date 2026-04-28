"use client";

import { useState } from "react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { useSequenceMessages } from "@/lib/queries/use-sequence-messages";
import { useSequenceStats } from "@/lib/queries/use-sequence-stats";
import { queryKeys } from "@/lib/queries/query-keys";
import { GlassCard } from "@/components/ui/glass-card";
import { Badge } from "@/components/ui/badge";
import { MessageRow } from "@/components/admin/message-row";
import { TwoPanelLayout } from "@/components/admin/two-panel-layout";
import { ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";

const STATUS_TABS = [
  { label: "All", value: "" },
  { label: "Pending", value: "draft" },
  { label: "Approved", value: "scheduled" },
  { label: "Sent", value: "sent,delivered,opened,clicked,replied" },
  { label: "Failed", value: "failed,bounced" },
];

interface MessageQueueClientProps {
  sequenceId: string;
}

export function MessageQueueClient({ sequenceId }: MessageQueueClientProps) {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState("");
  const [search, setSearch] = useState("");
  const [stepFilter, setStepFilter] = useState<number | undefined>(undefined);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());

  const statusFilter = activeTab ? activeTab.split(",") : undefined;
  const filters = {
    status: statusFilter,
    step: stepFilter,
    search: search || undefined,
  };

  const { data: messages = [], isLoading } = useSequenceMessages(sequenceId, filters);
  const { data: stats } = useSequenceStats(sequenceId);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: queryKeys.sequences.messages.all(sequenceId) });
    qc.invalidateQueries({ queryKey: queryKeys.sequences.stats(sequenceId) });
  };

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
      const res = await fetch(
        `/api/sequences/${sequenceId}/messages/${msgId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, ...data }),
        }
      );
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: invalidate,
  });

  const bulkMutation = useMutation({
    mutationFn: async ({
      action,
      scheduledAt,
    }: {
      action: "approve" | "reject" | "reschedule";
      scheduledAt?: string;
    }) => {
      const messageIds = [...checkedIds];
      const res = await fetch(`/api/sequences/${sequenceId}/messages/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, messageIds, scheduledAt }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      setCheckedIds(new Set());
      invalidate();
    },
  });

  const toggleCheck = (id: string) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const openRate =
    stats && stats.total > 0
      ? Math.round(((stats.opened + stats.clicked + stats.replied) / stats.total) * 100)
      : 0;
  const replyRate =
    stats && stats.total > 0
      ? Math.round((stats.replied / stats.total) * 100)
      : 0;

  const sidebar = (
    <>
      {/* Stats */}
      <GlassCard>
        <h3 className="text-sm font-semibold text-white mb-3">Stats</h3>
        <div className="space-y-2 text-sm">
          {[
            ["Total", stats?.total ?? 0],
            ["Draft / Pending", stats?.draft ?? 0],
            ["Scheduled", stats?.scheduled ?? 0],
            ["Sent", (stats?.sent ?? 0) + (stats?.delivered ?? 0)],
            ["Opened", `${openRate}%`],
            ["Replied", `${replyRate}%`],
            ["Bounced", stats?.bounced ?? 0],
            ["Failed", stats?.failed ?? 0],
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

      {/* Batch actions */}
      {checkedIds.size > 0 && (
        <GlassCard>
          <h3 className="text-sm font-semibold text-white mb-3">
            Batch Actions{" "}
            <Badge variant="glass-indigo" className="ml-1">
              {checkedIds.size}
            </Badge>
          </h3>
          <div className="space-y-2">
            <button
              onClick={() => bulkMutation.mutate({ action: "approve" })}
              disabled={bulkMutation.isPending}
              className="w-full py-1.5 rounded-lg text-xs font-medium bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500/20 transition-colors disabled:opacity-50"
            >
              Approve All
            </button>
            <button
              onClick={() => bulkMutation.mutate({ action: "reject" })}
              disabled={bulkMutation.isPending}
              className="w-full py-1.5 rounded-lg text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors disabled:opacity-50"
            >
              Reject All
            </button>
          </div>
        </GlassCard>
      )}
    </>
  );

  return (
    <TwoPanelLayout sidebar={sidebar}>
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

      {/* Table */}
      <GlassCard padding={false}>
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-[var(--text-muted)]" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-[var(--text-secondary)] mb-1">No messages</p>
            <p className="text-sm text-[var(--text-muted)]">
              Generate messages from the sequence detail page.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm table-fixed">
              <colgroup>
                <col className="w-8" />        {/* Checkbox */}
                <col />                          {/* Recipient */}
                <col className="w-20" />        {/* Step */}
                <col />                          {/* Subject */}
                <col className="w-28" />        {/* Status */}
                <col className="w-32" />        {/* Scheduled */}
                <col className="w-32" />        {/* Sent */}
                <col className="w-24" />        {/* Engagement */}
                <col className="w-10" />        {/* Expand */}
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
                  {["Recipient", "Step", "Subject", "Status", "Scheduled", "Sent", "Engagement", ""].map(
                    (col) => (
                      <th
                        key={col}
                        className="px-4 py-3 text-[var(--text-muted)] font-medium text-xs uppercase tracking-wide"
                      >
                        {col}
                      </th>
                    )
                  )}
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
                    onToggle={() =>
                      setExpandedId(expandedId === msg.id ? null : msg.id)
                    }
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

