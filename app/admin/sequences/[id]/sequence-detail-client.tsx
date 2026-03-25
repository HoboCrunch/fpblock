"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { useSequenceDetail } from "@/lib/queries/use-sequence-detail";
import { queryKeys } from "@/lib/queries/query-keys";
import {
  updateSequenceSteps,
  updateSequenceStatus,
  updateSequenceName,
  updateSequenceSendMode,
  updateSequenceSender,
  updateSequenceSchedule,
  enrollPersons,
  unenrollPerson,
  searchPersons,
} from "../actions";
import { StepEditor } from "@/components/admin/step-editor";
import { ScheduleConfig } from "@/components/admin/schedule-config";
import { ActivityLog } from "@/components/admin/activity-log";
import { TwoPanelLayout } from "@/components/admin/two-panel-layout";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassSelect } from "@/components/ui/glass-select";
import { GlassInput } from "@/components/ui/glass-input";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Play, Pause, Check } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useQuery } from "@tanstack/react-query";
import type { SequenceSchedule, SenderProfile } from "@/lib/types/database";

const STATUS_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "completed", label: "Completed" },
];

const statusVariant: Record<string, string> = {
  draft: "draft",
  active: "sent",
  paused: "scheduled",
  completed: "replied",
};

interface EnrollSearchResult {
  id: string;
  full_name: string;
  email: string | null;
}

function useSenderProfiles() {
  const supabase = createClient();
  return useQuery({
    queryKey: ["sender_profiles"],
    queryFn: async () => {
      const { data } = await supabase
        .from("sender_profiles")
        .select("id, name, email")
        .order("name");
      return (data ?? []) as Pick<SenderProfile, "id" | "name" | "email">[];
    },
  });
}

interface Props {
  sequenceId: string;
}

export function SequenceDetailClient({ sequenceId }: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useSequenceDetail(sequenceId);
  const { data: senderProfiles = [] } = useSenderProfiles();

  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [enrollSearch, setEnrollSearch] = useState("");
  const [enrollResults, setEnrollResults] = useState<EnrollSearchResult[]>([]);
  const [enrollModalOpen, setEnrollModalOpen] = useState(false);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: queryKeys.sequences.detail(sequenceId) });
  }

  const statusMutation = useMutation({
    mutationFn: (status: string) => updateSequenceStatus(sequenceId, status),
    onSuccess: invalidate,
  });

  const nameMutation = useMutation({
    mutationFn: (name: string) => updateSequenceName(sequenceId, name),
    onSuccess: invalidate,
  });

  const sendModeMutation = useMutation({
    mutationFn: (mode: "auto" | "approval") => updateSequenceSendMode(sequenceId, mode),
    onSuccess: invalidate,
  });

  const senderMutation = useMutation({
    mutationFn: (senderId: string | null) => updateSequenceSender(sequenceId, senderId),
    onSuccess: invalidate,
  });

  const scheduleMutation = useMutation({
    mutationFn: (config: SequenceSchedule) => updateSequenceSchedule(sequenceId, config),
    onSuccess: invalidate,
  });

  const enrollMutation = useMutation({
    mutationFn: (personIds: string[]) => enrollPersons(sequenceId, personIds),
    onSuccess: () => {
      setEnrollModalOpen(false);
      setEnrollSearch("");
      setEnrollResults([]);
      invalidate();
    },
  });

  const unenrollMutation = useMutation({
    mutationFn: unenrollPerson,
    onSuccess: invalidate,
  });

  async function handleEnrollSearch(q: string) {
    setEnrollSearch(q);
    if (q.length < 2) { setEnrollResults([]); return; }
    const results = await searchPersons(q);
    setEnrollResults(results as EnrollSearchResult[]);
  }

  function handleNameSave() {
    if (nameInput.trim() && nameInput.trim() !== data?.name) {
      nameMutation.mutate(nameInput.trim());
    }
    setEditingName(false);
  }

  function handlePrimaryAction() {
    if (!data) return;
    if (data.status === "draft") statusMutation.mutate("active");
    else if (data.status === "active") statusMutation.mutate("paused");
    else if (data.status === "paused") statusMutation.mutate("active");
  }

  const canActivate = data && data.steps.length >= 1 && data.enrollments.length >= 1 && !!data.sender_id;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-12 rounded-xl bg-white/[0.03] animate-pulse" />
        <div className="h-64 rounded-xl bg-white/[0.03] animate-pulse" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="text-[var(--text-muted)] p-8 text-center">
        Failed to load sequence.{" "}
        <button onClick={() => router.back()} className="underline">Go back</button>
      </div>
    );
  }

  const enrollmentCounts = data.enrollments.reduce(
    (acc, e) => { acc[e.status] = (acc[e.status] ?? 0) + 1; return acc; },
    {} as Record<string, number>
  );

  const hasSentMessages = data.delivery_stats.sent > 0;

  const primaryActionLabel =
    data.status === "draft" ? "Activate" :
    data.status === "active" ? "Pause" :
    data.status === "paused" ? "Resume" : null;

  const primaryActionIcon =
    data.status === "active" ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />;

  const senderOptions = [
    { value: "", label: "No sender" },
    ...senderProfiles.map((s) => ({ value: s.id, label: s.name + (s.email ? ` <${s.email}>` : "") })),
  ];

  const defaultSchedule: SequenceSchedule = { timing_mode: "relative" };

  // Sidebar content
  const sidebar = (
    <>
      {/* Enrollment Summary */}
      <GlassCard>
        <h3 className="text-sm font-semibold text-white mb-3">Enrollment</h3>
        <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
          {[
            ["Active", enrollmentCounts.active ?? 0],
            ["Completed", enrollmentCounts.completed ?? 0],
            ["Paused", enrollmentCounts.paused ?? 0],
            ["Bounced", enrollmentCounts.bounced ?? 0],
          ].map(([label, count]) => (
            <div key={label as string} className="flex justify-between">
              <span className="text-[var(--text-muted)]">{label}</span>
              <span className="text-white font-medium">{count}</span>
            </div>
          ))}
          <div className="col-span-2 border-t border-[var(--glass-border)] pt-2 flex justify-between">
            <span className="text-[var(--text-muted)]">Total</span>
            <span className="text-white font-medium">{data.enrollments.length}</span>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setEnrollModalOpen(true)}
            className="flex-1 text-xs px-3 py-2 rounded-lg bg-[var(--accent-orange)]/15 text-[var(--accent-orange)] border border-[var(--accent-orange)]/20 hover:bg-[var(--accent-orange)]/25 transition-colors"
          >
            Enroll Persons
          </button>
          <Link
            href={`/admin/sequences/${sequenceId}/messages`}
            className="flex-1 text-xs px-3 py-2 rounded-lg glass text-[var(--text-muted)] hover:text-white border border-[var(--glass-border)] transition-colors text-center"
          >
            View Messages →
          </Link>
        </div>
      </GlassCard>

      {/* Schedule Overview */}
      <GlassCard>
        <h3 className="text-sm font-semibold text-white mb-3">Schedule</h3>
        <div className="space-y-1.5 text-xs">
          <div className="flex justify-between">
            <span className="text-[var(--text-muted)]">Mode</span>
            <span className="text-white capitalize">{data.send_mode}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--text-muted)]">Timing</span>
            <span className="text-white capitalize">{data.schedule_config?.timing_mode ?? "relative"}</span>
          </div>
          {data.schedule_config?.send_window && (
            <>
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">Days</span>
                <span className="text-white uppercase">
                  {data.schedule_config.send_window.days.join(", ")}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">Hours</span>
                <span className="text-white">
                  {data.schedule_config.send_window.start_hour}:00–{data.schedule_config.send_window.end_hour}:00
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">TZ</span>
                <span className="text-white">{data.schedule_config.send_window.timezone}</span>
              </div>
            </>
          )}
        </div>
      </GlassCard>

      {/* Performance */}
      {hasSentMessages && (
        <GlassCard>
          <h3 className="text-sm font-semibold text-white mb-3">Performance</h3>
          <div className="space-y-1.5 text-xs">
            {([
              ["Sent", data.delivery_stats.sent, null],
              ["Delivered", data.delivery_stats.delivered, data.delivery_stats.sent],
              ["Opened", data.delivery_stats.opened, data.delivery_stats.sent],
              ["Clicked", data.delivery_stats.clicked, data.delivery_stats.sent],
              ["Replied", data.delivery_stats.replied, data.delivery_stats.sent],
              ["Bounced", data.delivery_stats.bounced, data.delivery_stats.sent],
            ] as [string, number, number | null][]).map(([label, count, base]) => (
              <div key={label} className="flex justify-between">
                <span className="text-[var(--text-muted)]">{label}</span>
                <span className="text-white">
                  {count}
                  {base ? ` (${Math.round((count / base) * 100)}%)` : ""}
                </span>
              </div>
            ))}
          </div>
        </GlassCard>
      )}

      {/* Activity Log */}
      <GlassCard>
        <h3 className="text-sm font-semibold text-white mb-3">Activity</h3>
        <ActivityLog sequenceId={sequenceId} />
      </GlassCard>
    </>
  );

  // Center panel header
  const header = (
    <div className="flex flex-wrap items-center gap-3 mb-6">
      <Link
        href="/admin/sequences"
        className="flex items-center gap-1 text-sm text-[var(--text-muted)] hover:text-white transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Sequences
      </Link>

      <span className="text-[var(--glass-border)]">/</span>

      {/* Inline-editable name */}
      {editingName ? (
        <input
          autoFocus
          className="text-xl font-semibold bg-transparent border-b border-[var(--accent-orange)]/50 text-white outline-none"
          value={nameInput}
          onChange={(e) => setNameInput(e.target.value)}
          onBlur={handleNameSave}
          onKeyDown={(e) => { if (e.key === "Enter") handleNameSave(); if (e.key === "Escape") setEditingName(false); }}
        />
      ) : (
        <button
          onClick={() => { setNameInput(data.name); setEditingName(true); }}
          className="text-xl font-semibold text-white hover:text-[var(--accent-orange)] transition-colors"
          title="Click to rename"
        >
          {data.name}
        </button>
      )}

      {/* Status select */}
      <div className="w-32">
        <GlassSelect
          options={STATUS_OPTIONS}
          value={data.status}
          onChange={(e) => statusMutation.mutate(e.target.value)}
        />
      </div>

      {/* Channel badge (read-only) */}
      <Badge variant="glass-indigo">{data.channel}</Badge>

      {/* Send mode toggle */}
      <div className="flex rounded-lg overflow-hidden border border-[var(--glass-border)]">
        {(["auto", "approval"] as const).map((mode) => (
          <button
            key={mode}
            onClick={() => sendModeMutation.mutate(mode)}
            className={`px-3 py-1.5 text-xs capitalize transition-colors ${
              data.send_mode === mode
                ? "bg-[var(--accent-orange)]/20 text-[var(--accent-orange)]"
                : "text-[var(--text-muted)] hover:text-white"
            }`}
          >
            {mode}
          </button>
        ))}
      </div>

      {/* Sender select */}
      <div className="w-48">
        <GlassSelect
          options={senderOptions}
          value={data.sender_id ?? ""}
          onChange={(e) => senderMutation.mutate(e.target.value || null)}
          placeholder="No sender"
        />
      </div>

      {/* Primary action */}
      {primaryActionLabel && (
        <button
          onClick={handlePrimaryAction}
          disabled={data.status === "draft" && !canActivate}
          title={data.status === "draft" && !canActivate ? "Need ≥1 step, ≥1 enrollment, and a sender" : undefined}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed ${
            data.status === "active"
              ? "bg-orange-500/15 text-orange-400 border border-orange-500/20 hover:bg-orange-500/25"
              : "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/25"
          }`}
        >
          {primaryActionIcon}
          {primaryActionLabel}
        </button>
      )}
    </div>
  );

  return (
    <>
      {/* Active warning banner */}
      {data.status === "active" && (
        <div className="mb-4 px-4 py-2.5 rounded-lg bg-orange-500/10 border border-orange-500/20 text-sm text-orange-300">
          This sequence is active. Changes apply to future messages only.
        </div>
      )}

      <TwoPanelLayout sidebar={sidebar}>
        {header}

        {/* Step editor */}
        <StepEditor
          sequenceId={sequenceId}
          initialSteps={data.steps}
          channel={data.channel}
          stepStats={data.step_stats}
        />

        {/* Schedule config */}
        <div className="mt-6">
          <ScheduleConfig
            value={data.schedule_config ?? defaultSchedule}
            onChange={(config) => scheduleMutation.mutate(config)}
          />
        </div>
      </TwoPanelLayout>

      {/* Enroll modal */}
      {enrollModalOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-40"
            onClick={() => setEnrollModalOpen(false)}
          />
          <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md p-6 rounded-2xl bg-[#0f0f13] border border-[var(--glass-border)]">
            <h2 className="text-lg font-semibold text-white mb-4">Enroll Persons</h2>
            <GlassInput
              placeholder="Search by name or email..."
              value={enrollSearch}
              onChange={(e) => handleEnrollSearch(e.target.value)}
              autoFocus
            />
            <div className="mt-3 max-h-60 overflow-y-auto space-y-1">
              {enrollResults.map((p) => {
                const already = data.enrollments.some((e) => e.person_id === p.id);
                return (
                  <div key={p.id} className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-white/[0.03]">
                    <div>
                      <p className="text-sm text-white">{p.full_name}</p>
                      {p.email && <p className="text-xs text-[var(--text-muted)]">{p.email}</p>}
                    </div>
                    {already ? (
                      <Check className="h-4 w-4 text-emerald-400" />
                    ) : (
                      <button
                        onClick={() => enrollMutation.mutate([p.id])}
                        className="text-xs px-3 py-1 rounded-lg bg-[var(--accent-orange)]/15 text-[var(--accent-orange)] border border-[var(--accent-orange)]/20 hover:bg-[var(--accent-orange)]/25"
                      >
                        Enroll
                      </button>
                    )}
                  </div>
                );
              })}
              {enrollSearch.length >= 2 && enrollResults.length === 0 && (
                <p className="text-xs text-[var(--text-muted)] px-3 py-2">No results found.</p>
              )}
              {enrollSearch.length < 2 && (
                <p className="text-xs text-[var(--text-muted)] px-3 py-2">Type to search...</p>
              )}
            </div>
            <div className="mt-4 flex justify-end">
              <button
                onClick={() => setEnrollModalOpen(false)}
                className="text-sm text-[var(--text-muted)] hover:text-white"
              >
                Close
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
