"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { useSequenceDetail } from "@/lib/queries/use-sequence-detail";
import { queryKeys } from "@/lib/queries/query-keys";
import {
  updateSequenceStatus,
  updateSequenceName,
  updateSequenceSendMode,
  updateSequenceSender,
  updateSequenceSchedule,
  updateSequenceSteps,
  enrollPersons,
  enrollFromList,
  unenrollPerson,
  unenrollFromList,
  searchPersons,
} from "../actions";
import { getLists } from "../../lists/actions";
import { StepEditor, validateSteps } from "@/components/admin/step-editor";
import { SequenceConfigCard } from "@/components/admin/sequence-config-card";
import { SequenceSettingsSheet } from "@/components/admin/sequence-settings-sheet";
import { ActivityLog } from "@/components/admin/activity-log";
import { TwoPanelLayout } from "@/components/admin/two-panel-layout";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassInput } from "@/components/ui/glass-input";
import { cn } from "@/lib/utils";
import { ArrowLeft, Play, Pause, Check, ChevronDown, Save, Loader2, X } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useQuery } from "@tanstack/react-query";
import type { SequenceSchedule, SenderProfile, SequenceStep } from "@/lib/types/database";

const STATUS_META: Record<string, { label: string; dot: string; bg: string }> = {
  draft: { label: "Draft", dot: "bg-yellow-400", bg: "text-yellow-300" },
  active: { label: "Active", dot: "bg-emerald-400", bg: "text-emerald-300" },
  paused: { label: "Paused", dot: "bg-orange-400", bg: "text-orange-300" },
  completed: { label: "Completed", dot: "bg-zinc-400", bg: "text-zinc-300" },
};

interface EnrollSearchResult {
  id: string;
  full_name: string;
  email: string | null;
}

interface EnrollList {
  id: string;
  name: string;
  description: string | null;
  person_list_items: { count: number }[];
}

type EnrollTab = "people" | "lists";

interface ListActionResult {
  listName: string;
  action: "enrolled" | "removed";
  count: number;
  skipped: number;
}

function useLists(enabled: boolean) {
  return useQuery({
    queryKey: ["person_lists"],
    enabled,
    queryFn: async () => {
      const { data } = await getLists();
      return (data ?? []) as EnrollList[];
    },
  });
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
  const [enrollTab, setEnrollTab] = useState<EnrollTab>("people");
  const [listResult, setListResult] = useState<ListActionResult | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);

  // Step editing state lives here (lifted from StepEditor) so the Save button
  // can sit in the page header next to the Activate/Pause action. `steps` is
  // null until the first local edit; render derives from data.steps until then
  // (see effectiveSteps below), so a post-save refetch never clobbers edits.
  const [steps, setSteps] = useState<SequenceStep[] | null>(null);
  const [stepsSaved, setStepsSaved] = useState(false);
  const [stepsSaveError, setStepsSaveError] = useState<string | null>(null);
  const [savingSteps, startSaveTransition] = useTransition();

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

  const { data: lists = [], isLoading: listsLoading } = useLists(enrollModalOpen);

  const enrollMutation = useMutation({
    mutationFn: (personIds: string[]) => enrollPersons(sequenceId, personIds),
    onSuccess: () => {
      setEnrollModalOpen(false);
      setEnrollSearch("");
      setEnrollResults([]);
      invalidate();
    },
  });

  const enrollListMutation = useMutation({
    mutationFn: (list: EnrollList) => enrollFromList(sequenceId, list.id),
    onSuccess: (res, list) => {
      if (res.success) {
        const requested = res.requested ?? list.person_list_items?.[0]?.count ?? 0;
        setListResult({
          listName: list.name,
          action: "enrolled",
          count: res.enrolled,
          skipped: Math.max(0, requested - res.enrolled),
        });
        invalidate();
      }
    },
  });

  const unenrollListMutation = useMutation({
    mutationFn: (list: EnrollList) => unenrollFromList(sequenceId, list.id),
    onSuccess: (res, list) => {
      if (res.success) {
        setListResult({
          listName: list.name,
          action: "removed",
          count: res.removed,
          skipped: 0,
        });
        invalidate();
      }
    },
  });

  const unenrollMutation = useMutation({
    mutationFn: (enrollmentId: string) => unenrollPerson(enrollmentId),
    onSuccess: invalidate,
  });

  function closeEnrollModal() {
    setEnrollModalOpen(false);
    setEnrollSearch("");
    setEnrollResults([]);
    setListResult(null);
  }

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

  const canActivate =
    data && data.steps.length >= 1 && data.enrollments.length >= 1 && !!data.sender_id;

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

  // Editable steps (falls back to the loaded value until the init effect runs).
  const effectiveSteps = steps ?? data.steps;
  const stepValidation = validateSteps(effectiveSteps);
  const stepsBlocked = stepValidation.errorCount > 0;

  function handleStepsChange(next: SequenceStep[]) {
    setSteps(next);
    setStepsSaved(false);
    setStepsSaveError(null);
  }

  function handleSaveSteps() {
    if (stepsBlocked) return;
    // Re-normalize step_number defensively (the editor controls ordering).
    const normalized = effectiveSteps.map((s, i) => ({ ...s, step_number: i + 1 }));
    startSaveTransition(async () => {
      const result = await updateSequenceSteps(sequenceId, normalized);
      if (result.success) {
        setSteps(normalized);
        setStepsSaved(true);
        setStepsSaveError(null);
        setTimeout(() => setStepsSaved(false), 2000);
        invalidate();
      } else {
        setStepsSaveError(result.error ?? "Save failed");
      }
    });
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

  const defaultSchedule: SequenceSchedule = { timing_mode: "relative" };
  const scheduleConfig = data.schedule_config ?? defaultSchedule;
  const statusMeta = STATUS_META[data.status] ?? STATUS_META.draft;

  // Sidebar — runtime data + configuration entry point
  const sidebar = (
    <>
      <SequenceConfigCard
        sendMode={data.send_mode}
        senderId={data.sender_id}
        senderProfiles={senderProfiles}
        scheduleConfig={scheduleConfig}
        onSendModeChange={(m) => sendModeMutation.mutate(m)}
        onOpenAdvanced={() => setSettingsOpen(true)}
      />

      {/* Enrollment */}
      <GlassCard padding={false}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--glass-border)]">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-indigo)]" />
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/85">
              Enrollment
            </h3>
          </div>
          <span className="text-[11px] text-white/80 tabular-nums">
            {data.enrollments.length}
          </span>
        </div>
        <div className="px-4 py-3 grid grid-cols-2 gap-y-1.5 text-[11px]">
          {[
            ["Active", enrollmentCounts.active ?? 0],
            ["Completed", enrollmentCounts.completed ?? 0],
            ["Paused", enrollmentCounts.paused ?? 0],
            ["Bounced", enrollmentCounts.bounced ?? 0],
          ].map(([label, count]) => (
            <div key={label as string} className="flex justify-between pr-3">
              <span className="text-[var(--text-muted)]">{label}</span>
              <span className="text-white font-medium tabular-nums">{count}</span>
            </div>
          ))}
        </div>
        <div className="flex gap-2 px-4 pb-3">
          <button
            onClick={() => setEnrollModalOpen(true)}
            className="flex-1 text-[11px] px-3 py-1.5 rounded-md bg-[var(--accent-orange)]/15 text-[var(--accent-orange)] border border-[var(--accent-orange)]/20 hover:bg-[var(--accent-orange)]/25 transition-colors"
          >
            Enroll
          </button>
          <Link
            href={`/admin/sequences/${sequenceId}/messages`}
            className="flex-1 text-[11px] px-3 py-1.5 rounded-md text-[var(--text-muted)] hover:text-white border border-[var(--glass-border)] hover:border-[var(--glass-border-hover)] transition-colors text-center"
          >
            Messages →
          </Link>
        </div>
      </GlassCard>

      {/* Performance */}
      {hasSentMessages && (
        <GlassCard padding={false}>
          <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--glass-border)]">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/85">
              Performance
            </h3>
          </div>
          <div className="px-4 py-3 space-y-1.5 text-[11px]">
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
                <span className="text-white tabular-nums">
                  {count}
                  {base ? (
                    <span className="text-[var(--text-muted)] ml-1">
                      {Math.round((count / base) * 100)}%
                    </span>
                  ) : ""}
                </span>
              </div>
            ))}
          </div>
        </GlassCard>
      )}

      {/* Activity */}
      <GlassCard padding={false}>
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--glass-border)]">
          <span className="h-1.5 w-1.5 rounded-full bg-white/40" />
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/85">
            Activity
          </h3>
        </div>
        <div className="px-4 py-3">
          <ActivityLog sequenceId={sequenceId} />
        </div>
      </GlassCard>
    </>
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
        {/* HEADER */}
        <header className="mb-7">
          <Link
            href="/admin/sequences"
            className="inline-flex items-center gap-1 text-[11px] uppercase tracking-[0.18em] text-[var(--text-muted)] hover:text-white transition-colors mb-3"
          >
            <ArrowLeft className="h-3 w-3" />
            All sequences
          </Link>

          <div className="flex items-end justify-between gap-4 flex-wrap">
            <div className="min-w-0 flex-1">
              {editingName ? (
                <input
                  autoFocus
                  className="text-3xl font-semibold tracking-tight bg-transparent border-b border-[var(--accent-orange)]/50 text-white outline-none w-full font-[family-name:var(--font-heading)]"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  onBlur={handleNameSave}
                  onKeyDown={(e) => { if (e.key === "Enter") handleNameSave(); if (e.key === "Escape") setEditingName(false); }}
                />
              ) : (
                <button
                  onClick={() => { setNameInput(data.name); setEditingName(true); }}
                  className="text-3xl font-semibold tracking-tight text-white hover:text-[var(--accent-orange)] transition-colors text-left font-[family-name:var(--font-heading)] truncate max-w-full"
                  title="Click to rename"
                >
                  {data.name}
                </button>
              )}

              <div className="flex items-center gap-3 mt-2 text-[11px] text-[var(--text-muted)]">
                {/* Status pill with dropdown */}
                <div className="relative">
                  <button
                    onClick={() => setStatusMenuOpen((v) => !v)}
                    onBlur={() => setTimeout(() => setStatusMenuOpen(false), 150)}
                    className={cn(
                      "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg)]/60 hover:bg-[var(--glass-bg-hover)] transition-colors",
                      statusMeta.bg
                    )}
                  >
                    <span className={cn("h-1.5 w-1.5 rounded-full", statusMeta.dot)} />
                    <span className="font-medium tracking-wide">{statusMeta.label}</span>
                    <ChevronDown className="h-3 w-3 opacity-70" />
                  </button>
                  {statusMenuOpen && (
                    <div className="absolute left-0 top-full mt-1 z-30 min-w-[140px] rounded-md bg-[#15151a] border border-[var(--glass-border-hover)] shadow-2xl py-1">
                      {Object.entries(STATUS_META).map(([value, meta]) => (
                        <button
                          key={value}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            statusMutation.mutate(value);
                            setStatusMenuOpen(false);
                          }}
                          className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-white hover:bg-white/5 transition-colors"
                        >
                          <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
                          {meta.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <span className="opacity-50">·</span>
                <span>{data.steps.length} step{data.steps.length === 1 ? "" : "s"}</span>
                <span className="opacity-50">·</span>
                <span>{data.enrollments.length} enrolled</span>
                {!data.sender_id && (
                  <>
                    <span className="opacity-50">·</span>
                    <button
                      onClick={() => setSettingsOpen(true)}
                      className="text-amber-400 hover:underline"
                    >
                      Set sender
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={handleSaveSteps}
                disabled={savingSteps || stepsBlocked}
                title={stepsBlocked ? "Fix step errors before saving" : undefined}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed",
                  stepsSaved
                    ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20"
                    : "bg-[var(--accent-orange)]/15 text-[var(--accent-orange)] border border-[var(--accent-orange)]/20 hover:bg-[var(--accent-orange)]/25"
                )}
              >
                {savingSteps ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {savingSteps ? "Saving..." : stepsSaved ? "Saved!" : "Save"}
              </button>

              {primaryActionLabel && (
                <button
                  onClick={handlePrimaryAction}
                  disabled={data.status === "draft" && !canActivate}
                  title={data.status === "draft" && !canActivate ? "Need ≥1 step, ≥1 enrollment, and a sender" : undefined}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed",
                    data.status === "active"
                      ? "bg-orange-500/15 text-orange-400 border border-orange-500/20 hover:bg-orange-500/25"
                      : "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/25"
                  )}
                >
                  {primaryActionIcon}
                  {primaryActionLabel}
                </button>
              )}
            </div>
          </div>
        </header>

        {/* STEP EDITOR — the hero of this page */}
        <StepEditor
          sequenceId={sequenceId}
          steps={effectiveSteps}
          onStepsChange={handleStepsChange}
          validation={stepValidation}
          saveError={stepsSaveError}
          channel={data.channel}
          stepStats={data.step_stats}
        />
      </TwoPanelLayout>

      {/* Settings slide-over */}
      <SequenceSettingsSheet
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        sendMode={data.send_mode}
        senderId={data.sender_id}
        senderProfiles={senderProfiles}
        scheduleConfig={scheduleConfig}
        onSendModeChange={(m) => sendModeMutation.mutate(m)}
        onSenderChange={(id) => senderMutation.mutate(id)}
        onScheduleChange={(c) => scheduleMutation.mutate(c)}
      />

      {/* Enroll modal */}
      {enrollModalOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-40"
            onClick={closeEnrollModal}
          />
          <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md p-6 rounded-2xl bg-[#0f0f13] border border-[var(--glass-border)]">
            <h2 className="text-lg font-semibold text-white mb-4">Enroll</h2>

            {/* Source toggle: individual people vs. a saved list */}
            <div className="flex p-0.5 mb-4 rounded-lg bg-white/[0.04] border border-[var(--glass-border)]">
              {([
                ["people", "People"],
                ["lists", "Lists"],
              ] as [EnrollTab, string][]).map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => setEnrollTab(value)}
                  className={cn(
                    "flex-1 text-xs font-medium py-1.5 rounded-md transition-colors",
                    enrollTab === value
                      ? "bg-[var(--accent-orange)]/15 text-[var(--accent-orange)]"
                      : "text-[var(--text-muted)] hover:text-white"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            {enrollTab === "people" ? (
              <>
                <GlassInput
                  placeholder="Search by name or email..."
                  value={enrollSearch}
                  onChange={(e) => handleEnrollSearch(e.target.value)}
                  autoFocus
                />
                {enrollSearch.length >= 2 ? (
                  /* Search → add flow */
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
                    {enrollResults.length === 0 && (
                      <p className="text-xs text-[var(--text-muted)] px-3 py-2">No results found.</p>
                    )}
                  </div>
                ) : (
                  /* Default → currently enrolled, with remove */
                  <>
                    <p className="mt-3 mb-1 px-1 text-[11px] uppercase tracking-[0.14em] text-[var(--text-muted)]">
                      Enrolled · {data.enrollments.length}
                    </p>
                    <div className="max-h-60 overflow-y-auto space-y-1">
                      {data.enrollments.length === 0 ? (
                        <p className="text-xs text-[var(--text-muted)] px-3 py-2">
                          No one enrolled yet. Search above to add people.
                        </p>
                      ) : (
                        data.enrollments.map((e) => {
                          const removing =
                            unenrollMutation.isPending &&
                            unenrollMutation.variables === e.id;
                          return (
                            <div key={e.id} className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg hover:bg-white/[0.03] group">
                              <div className="min-w-0">
                                <p className="text-sm text-white truncate">
                                  {e.person?.full_name ?? "Unknown person"}
                                </p>
                                {e.person?.email && (
                                  <p className="text-xs text-[var(--text-muted)] truncate">{e.person.email}</p>
                                )}
                              </div>
                              <button
                                onClick={() => unenrollMutation.mutate(e.id)}
                                disabled={removing}
                                title="Remove from sequence"
                                className="shrink-0 inline-flex items-center justify-center h-6 w-6 rounded-md text-[var(--text-muted)] hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                {removing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                              </button>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </>
                )}
              </>
            ) : (
              <>
                {listResult && (
                  <div
                    className={cn(
                      "mb-3 px-3 py-2 rounded-lg border text-xs",
                      listResult.action === "enrolled"
                        ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300"
                        : "bg-white/[0.04] border-[var(--glass-border)] text-white/80"
                    )}
                  >
                    {listResult.action === "enrolled" ? "Enrolled" : "Removed"}{" "}
                    <span className="font-semibold tabular-nums">{listResult.count}</span> from{" "}
                    <span className="font-medium">{listResult.listName}</span>
                    {listResult.action === "enrolled" && listResult.skipped > 0 && (
                      <span className="text-emerald-300/70">
                        {" · "}{listResult.skipped} skipped (bounced / already enrolled)
                      </span>
                    )}
                  </div>
                )}
                <div className="max-h-60 overflow-y-auto space-y-1">
                  {listsLoading ? (
                    <div className="flex items-center gap-2 px-3 py-4 text-xs text-[var(--text-muted)]">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading lists...
                    </div>
                  ) : lists.length === 0 ? (
                    <p className="text-xs text-[var(--text-muted)] px-3 py-2">
                      No lists yet.{" "}
                      <Link href="/admin/lists" className="text-[var(--accent-orange)] hover:underline">
                        Create one →
                      </Link>
                    </p>
                  ) : (
                    lists.map((list) => {
                      const count = list.person_list_items?.[0]?.count ?? 0;
                      const enrolling =
                        enrollListMutation.isPending &&
                        enrollListMutation.variables?.id === list.id;
                      const removing =
                        unenrollListMutation.isPending &&
                        unenrollListMutation.variables?.id === list.id;
                      const busy = enrolling || removing;
                      return (
                        <div key={list.id} className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg hover:bg-white/[0.03]">
                          <div className="min-w-0">
                            <p className="text-sm text-white truncate">{list.name}</p>
                            <p className="text-xs text-[var(--text-muted)]">
                              {count} member{count === 1 ? "" : "s"}
                              {list.description ? ` · ${list.description}` : ""}
                            </p>
                          </div>
                          <div className="shrink-0 flex items-center gap-1.5">
                            <button
                              onClick={() => enrollListMutation.mutate(list)}
                              disabled={busy || count === 0}
                              className="inline-flex items-center gap-1.5 text-xs px-3 py-1 rounded-lg bg-[var(--accent-orange)]/15 text-[var(--accent-orange)] border border-[var(--accent-orange)]/20 hover:bg-[var(--accent-orange)]/25 disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              {enrolling && <Loader2 className="h-3 w-3 animate-spin" />}
                              {enrolling ? "Enrolling..." : "Enroll"}
                            </button>
                            <button
                              onClick={() => unenrollListMutation.mutate(list)}
                              disabled={busy || count === 0}
                              title="Remove this list's members from the sequence"
                              className="inline-flex items-center gap-1.5 text-xs px-3 py-1 rounded-lg text-[var(--text-muted)] border border-[var(--glass-border)] hover:text-red-400 hover:border-red-500/30 hover:bg-red-500/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              {removing && <Loader2 className="h-3 w-3 animate-spin" />}
                              {removing ? "Removing..." : "Remove"}
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </>
            )}

            <div className="mt-4 flex justify-end">
              <button
                onClick={closeEnrollModal}
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
