"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, RotateCcw, AlertTriangle, Search } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassInput } from "@/components/ui/glass-input";
import { Badge } from "@/components/ui/badge";
import { TwoPanelLayout } from "@/components/admin/two-panel-layout";
import { ToastViewport, toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { retryFailedInteractions } from "./actions";

export interface FailureRow {
  id: string;
  status: string;
  personId: string | null;
  personName: string | null;
  personEmail: string | null;
  sequenceId: string | null;
  sequenceName: string | null;
  step: number | null;
  failedAt: string | null;
  lastError: string | null;
  lastStatusCode: number | null;
  retryCount: number;
  terminalReason: string | null;
}

interface FailuresClientProps {
  initialRows: FailureRow[];
}

function formatRelative(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

function statusVariant(status: string): string {
  if (status === "bounced") return "bounced";
  return "failed";
}

function terminalReasonLabel(reason: string | null): string | null {
  if (!reason) return null;
  if (reason === "permanent_4xx") return "Permanent (4xx)";
  if (reason === "retries_exhausted") return "Retries exhausted";
  return reason;
}

export function FailuresClient({ initialRows }: FailuresClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<"all" | "failed" | "bounced">(
    "all"
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return initialRows.filter((row) => {
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      if (!q) return true;
      const haystack = [
        row.personName,
        row.personEmail,
        row.sequenceName,
        row.lastError,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [initialRows, search, statusFilter]);

  const summary = useMemo(() => {
    let failed = 0;
    let bounced = 0;
    for (const r of initialRows) {
      if (r.status === "bounced") bounced++;
      else failed++;
    }
    return { total: initialRows.length, failed, bounced };
  }, [initialRows]);

  const allSelected =
    filtered.length > 0 && filtered.every((r) => selected.has(r.id));

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((r) => r.id)));
    }
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleRetry = (ids: string[]) => {
    if (ids.length === 0) return;
    startTransition(async () => {
      const result = await retryFailedInteractions(ids);
      if (result.succeeded.length > 0) {
        toast.success(
          `Requeued ${result.succeeded.length} message${result.succeeded.length === 1 ? "" : "s"}`
        );
      }
      if (result.failed.length > 0) {
        toast.error(
          `${result.failed.length} could not be requeued: ${result.failed[0].error}`
        );
      }
      setSelected((prev) => {
        const next = new Set(prev);
        for (const id of result.succeeded) next.delete(id);
        return next;
      });
      router.refresh();
    });
  };

  const sidebar = (
    <>
      <GlassCard>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-muted)]" />
          <GlassInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search person, sequence, error..."
            className="pl-9"
          />
        </div>
      </GlassCard>

      <GlassCard className="space-y-3">
        <p className="text-xs text-[var(--text-muted)] uppercase tracking-wide font-medium">
          Status
        </p>
        {(["all", "failed", "bounced"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={cn(
              "w-full text-left px-3 py-2 rounded-lg text-sm transition-colors",
              statusFilter === s
                ? "bg-white/10 text-white"
                : "text-[var(--text-secondary)] hover:bg-white/5"
            )}
          >
            <span className="capitalize">{s}</span>
            <span className="float-right text-xs text-[var(--text-muted)]">
              {s === "all"
                ? summary.total
                : s === "failed"
                  ? summary.failed
                  : summary.bounced}
            </span>
          </button>
        ))}
      </GlassCard>

      {selected.size > 0 && (
        <GlassCard className="space-y-3">
          <p className="text-sm text-white font-medium">{selected.size} selected</p>
          <button
            onClick={() => handleRetry([...selected])}
            disabled={isPending}
            className={cn(
              "w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
              "bg-[var(--accent-orange)] text-white hover:bg-[var(--accent-orange)]/90",
              "disabled:opacity-50 disabled:cursor-not-allowed"
            )}
          >
            <RotateCcw className="h-4 w-4" />
            Requeue selected
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="w-full px-3 py-1.5 rounded-lg text-xs text-[var(--text-secondary)] hover:text-white transition-colors"
          >
            Clear selection
          </button>
        </GlassCard>
      )}
    </>
  );

  return (
    <>
      <TwoPanelLayout
        title="Failed sends"
        actions={
          <Link
            href="/admin/sequences"
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-[var(--text-secondary)] hover:text-white hover:bg-white/[0.05] transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to sequences
          </Link>
        }
        sidebar={sidebar}
      >
        {filtered.length === 0 ? (
          <GlassCard className="flex flex-col items-center justify-center py-16 text-center">
            <AlertTriangle className="h-12 w-12 text-[var(--text-muted)] mb-4" />
            <p className="text-[var(--text-secondary)] mb-1">
              {initialRows.length === 0
                ? "No failed sends — clean slate."
                : "Nothing matches the current filters."}
            </p>
            <p className="text-sm text-[var(--text-muted)]">
              Failed and bounced sequence messages will appear here for triage and retry.
            </p>
          </GlassCard>
        ) : (
          <GlassCard padding={false}>
            <div className="px-4 py-3 border-b border-[var(--glass-border)] flex items-center gap-3">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                className="rounded border-[var(--glass-border)] bg-[var(--glass-bg)] accent-[var(--accent-orange)]"
              />
              <span className="text-xs text-[var(--text-muted)]">
                {filtered.length} row{filtered.length === 1 ? "" : "s"}
              </span>
            </div>
            <ul className="divide-y divide-[var(--glass-border)]">
              {filtered.map((row) => (
                <FailureRowItem
                  key={row.id}
                  row={row}
                  selected={selected.has(row.id)}
                  onToggle={() => toggleOne(row.id)}
                  onRetry={() => handleRetry([row.id])}
                  disabled={isPending}
                />
              ))}
            </ul>
          </GlassCard>
        )}
      </TwoPanelLayout>
      <ToastViewport />
    </>
  );
}

interface FailureRowItemProps {
  row: FailureRow;
  selected: boolean;
  onToggle: () => void;
  onRetry: () => void;
  disabled: boolean;
}

function FailureRowItem({
  row,
  selected,
  onToggle,
  onRetry,
  disabled,
}: FailureRowItemProps) {
  const personLabel = row.personName || row.personEmail || row.id.slice(0, 8);
  const terminalLabel = terminalReasonLabel(row.terminalReason);

  return (
    <li className="px-4 py-3 flex items-start gap-3 hover:bg-white/[0.02] transition-colors">
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggle}
        className="mt-1 rounded border-[var(--glass-border)] bg-[var(--glass-bg)] accent-[var(--accent-orange)]"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          {row.personId ? (
            <Link
              href={`/admin/persons/${row.personId}`}
              className="text-sm font-medium text-white hover:underline"
            >
              {personLabel}
            </Link>
          ) : (
            <span className="text-sm font-medium text-white">{personLabel}</span>
          )}
          {row.personEmail && row.personEmail !== personLabel && (
            <span className="text-xs text-[var(--text-muted)]">
              {row.personEmail}
            </span>
          )}
          <Badge variant={statusVariant(row.status)}>{row.status}</Badge>
          {row.lastStatusCode !== null && (
            <Badge variant="default">HTTP {row.lastStatusCode}</Badge>
          )}
          {terminalLabel && <Badge variant="default">{terminalLabel}</Badge>}
        </div>
        <div className="mt-1 text-xs text-[var(--text-muted)] flex items-center gap-3 flex-wrap">
          {row.sequenceId && row.sequenceName && (
            <Link
              href={`/admin/sequences/${row.sequenceId}/messages`}
              className="hover:text-white transition-colors"
            >
              {row.sequenceName}
              {row.step !== null && ` · step ${row.step}`}
            </Link>
          )}
          <span>{formatRelative(row.failedAt)}</span>
          {row.retryCount > 0 && <span>{row.retryCount} retries</span>}
        </div>
        {row.lastError && (
          <p className="mt-2 text-xs text-[var(--text-secondary)] font-mono break-all line-clamp-2">
            {row.lastError}
          </p>
        )}
      </div>
      <button
        onClick={onRetry}
        disabled={disabled}
        className={cn(
          "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
          "bg-white/5 text-white hover:bg-white/10",
          "disabled:opacity-50 disabled:cursor-not-allowed"
        )}
      >
        <RotateCcw className="h-3.5 w-3.5" />
        Requeue
      </button>
    </li>
  );
}
