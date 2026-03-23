"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassInput } from "@/components/ui/glass-input";
import { GlassSelect } from "@/components/ui/glass-select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  GitBranch,
  Plus,
  Play,
  Pause,
  Square,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import type { Sequence, Event } from "@/lib/types/database";
import {
  createSequence,
  deleteSequence,
  updateSequenceStatus,
} from "./actions";

interface SequenceWithCounts extends Sequence {
  enrollment_count: number;
  completed_count: number;
}

const CHANNEL_OPTIONS = [
  { value: "email", label: "Email" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "twitter", label: "Twitter" },
  { value: "telegram", label: "Telegram" },
];

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

export function SequenceListClient({
  sequences,
  events,
}: {
  sequences: SequenceWithCounts[];
  events: Event[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newName, setNewName] = useState("");
  const [newChannel, setNewChannel] = useState("email");
  const [newEventId, setNewEventId] = useState("");

  const eventOptions = [
    { value: "", label: "No event" },
    ...events.map((e) => ({ value: e.id, label: e.name })),
  ];

  async function handleCreate() {
    if (!newName.trim()) return;
    const result = await createSequence({
      name: newName.trim(),
      channel: newChannel,
      event_id: newEventId || null,
    });
    if (result.success) {
      setShowCreateModal(false);
      setNewName("");
      setNewChannel("email");
      setNewEventId("");
      startTransition(() => router.refresh());
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this sequence? This cannot be undone.")) return;
    const result = await deleteSequence(id);
    if (result.success) {
      startTransition(() => router.refresh());
    }
  }

  async function handleStatusChange(id: string, status: string) {
    const result = await updateSequenceStatus(id, status);
    if (result.success) {
      startTransition(() => router.refresh());
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold font-[family-name:var(--font-heading)] text-white">
          Sequences
        </h1>
        <button
          onClick={() => setShowCreateModal(true)}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200",
            "bg-[var(--accent-orange)] text-white hover:bg-[var(--accent-orange)]/90",
            "shadow-lg shadow-[var(--accent-orange)]/20"
          )}
        >
          <Plus className="h-4 w-4" />
          New Sequence
        </button>
      </div>

      {sequences.length === 0 ? (
        <GlassCard className="flex flex-col items-center justify-center py-16 text-center">
          <GitBranch className="h-12 w-12 text-[var(--text-muted)] mb-4" />
          <p className="text-[var(--text-secondary)] mb-1">
            No sequences yet
          </p>
          <p className="text-sm text-[var(--text-muted)]">
            Sequences let you automate multi-step outreach campaigns.
          </p>
        </GlassCard>
      ) : (
        <GlassCard padding={false}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--glass-border)] text-left">
                  <th className="px-5 py-3 text-[var(--text-muted)] font-medium">
                    Name
                  </th>
                  <th className="px-5 py-3 text-[var(--text-muted)] font-medium">
                    Channel
                  </th>
                  <th className="px-5 py-3 text-[var(--text-muted)] font-medium">
                    Status
                  </th>
                  <th className="px-5 py-3 text-[var(--text-muted)] font-medium">
                    Steps
                  </th>
                  <th className="px-5 py-3 text-[var(--text-muted)] font-medium">
                    Persons Enrolled
                  </th>
                  <th className="px-5 py-3 text-[var(--text-muted)] font-medium">
                    Completion Rate
                  </th>
                  <th className="px-5 py-3 text-[var(--text-muted)] font-medium">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {sequences.map((seq) => {
                  const steps = Array.isArray(seq.steps) ? seq.steps : [];
                  const completionRate =
                    seq.enrollment_count > 0
                      ? Math.round(
                          (seq.completed_count / seq.enrollment_count) * 100
                        )
                      : 0;

                  return (
                    <tr
                      key={seq.id}
                      className="border-b border-[var(--glass-border)] last:border-0 hover:bg-[var(--glass-bg-hover)] transition-all duration-200"
                    >
                      <td className="px-5 py-4">
                        <Link
                          href={`/admin/sequences/${seq.id}`}
                          className="text-white hover:text-[var(--accent-indigo)] transition-colors"
                        >
                          {seq.name}
                        </Link>
                      </td>
                      <td className="px-5 py-4">
                        <Badge
                          variant={channelVariant[seq.channel] ?? "default"}
                        >
                          {seq.channel}
                        </Badge>
                      </td>
                      <td className="px-5 py-4">
                        <Badge
                          variant={statusVariant[seq.status] ?? "default"}
                        >
                          {seq.status}
                        </Badge>
                      </td>
                      <td className="px-5 py-4 text-[var(--text-secondary)]">
                        {steps.length}
                      </td>
                      <td className="px-5 py-4 text-[var(--text-secondary)]">
                        {seq.enrollment_count}
                      </td>
                      <td className="px-5 py-4 text-[var(--text-secondary)]">
                        {completionRate}%
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-1">
                          {seq.status !== "active" &&
                            seq.status !== "completed" && (
                              <button
                                onClick={() =>
                                  handleStatusChange(seq.id, "active")
                                }
                                disabled={isPending}
                                className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-green-400 hover:bg-green-500/10 transition-all duration-200"
                                title="Start sequence"
                              >
                                <Play className="h-4 w-4" />
                              </button>
                            )}
                          {seq.status === "active" && (
                            <button
                              onClick={() =>
                                handleStatusChange(seq.id, "paused")
                              }
                              disabled={isPending}
                              className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-yellow-400 hover:bg-yellow-500/10 transition-all duration-200"
                              title="Pause sequence"
                            >
                              <Pause className="h-4 w-4" />
                            </button>
                          )}
                          {(seq.status === "active" ||
                            seq.status === "paused") && (
                            <button
                              onClick={() =>
                                handleStatusChange(seq.id, "completed")
                              }
                              disabled={isPending}
                              className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-red-400 hover:bg-red-500/10 transition-all duration-200"
                              title="Stop sequence"
                            >
                              <Square className="h-4 w-4" />
                            </button>
                          )}
                          <button
                            onClick={() => handleDelete(seq.id)}
                            disabled={isPending}
                            className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-red-400 hover:bg-red-500/10 transition-all duration-200"
                            title="Delete sequence"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </GlassCard>
      )}

      {/* Create Sequence Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowCreateModal(false)}
          />
          <div className="relative glass rounded-xl p-6 w-full max-w-md mx-4 shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold font-[family-name:var(--font-heading)] text-white">
                New Sequence
              </h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-[var(--text-muted)] hover:text-white transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-[var(--text-secondary)] mb-1.5">
                  Name
                </label>
                <GlassInput
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. EthCC LinkedIn Outreach"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm text-[var(--text-secondary)] mb-1.5">
                  Channel
                </label>
                <GlassSelect
                  options={CHANNEL_OPTIONS}
                  value={newChannel}
                  onChange={(e) => setNewChannel(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm text-[var(--text-secondary)] mb-1.5">
                  Event (optional)
                </label>
                <GlassSelect
                  options={eventOptions}
                  value={newEventId}
                  onChange={(e) => setNewEventId(e.target.value)}
                  placeholder="Select an event"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 mt-6">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 rounded-lg text-sm text-[var(--text-secondary)] hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={!newName.trim() || isPending}
                className={cn(
                  "px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200",
                  "bg-[var(--accent-orange)] text-white hover:bg-[var(--accent-orange)]/90",
                  "shadow-lg shadow-[var(--accent-orange)]/20",
                  "disabled:opacity-50 disabled:cursor-not-allowed"
                )}
              >
                Create Sequence
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
