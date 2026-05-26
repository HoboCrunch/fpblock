"use client";

import React from "react";
import { cn } from "@/lib/utils";
import type { Job } from "@/lib/jobs/types";
import { formatProgress, deriveDisplayStatus } from "@/lib/jobs/status";

interface CsvImportRendererProps {
  job: Job;
}

export function CsvImportRenderer({ job }: CsvImportRendererProps) {
  const progress = formatProgress(job);
  const displayStatus = deriveDisplayStatus(job);
  const meta = job.metadata as {
    filename?: string;
    mode?: string;
    recent_errors?: string[];
    processed_offset?: number;
  } | null;

  const recentErrors: string[] = meta?.recent_errors ?? [];

  const progressPct =
    progress && progress.total > 0
      ? Math.min(100, (progress.completed / progress.total) * 100)
      : 0;

  return (
    <div className="px-3 py-2 space-y-2">
      {/* Progress bar */}
      {progress && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-white/70">{progress.text} rows</span>
            {progress.failed > 0 && (
              <span className="text-red-400">{progress.failed} failed</span>
            )}
          </div>
          <div className="h-1.5 w-full rounded-full bg-white/[0.06] overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500",
                displayStatus === "failed"
                  ? "bg-red-500"
                  : displayStatus === "stalled"
                  ? "bg-amber-500"
                  : displayStatus === "completed"
                  ? "bg-emerald-500"
                  : "bg-[var(--accent-orange)]"
              )}
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <p className="text-[10px] text-[var(--text-muted)]">
            {Math.round(progressPct)}% complete
          </p>
        </div>
      )}

      {/* Phase */}
      {job.phase && (
        <p className="text-xs text-[var(--text-muted)]">
          Phase: <span className="text-white/70">{job.phase}</span>
        </p>
      )}

      {/* Mode */}
      {meta?.mode && (
        <p className="text-xs text-[var(--text-muted)]">
          Mode: <span className="text-white/70">{meta.mode}</span>
        </p>
      )}

      {/* Stalled note */}
      {displayStatus === "stalled" && (
        <p className="text-xs text-amber-400">Resuming automatically via cron…</p>
      )}

      {/* Recent errors */}
      {recentErrors.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">
            Recent errors
          </p>
          <div className="max-h-[80px] overflow-y-auto scrollbar-thin space-y-0.5">
            {recentErrors.map((err, i) => (
              <p key={i} className="text-[10px] text-red-400 break-words">
                {err}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Top-level error */}
      {job.error && (
        <p className="text-xs text-red-400 break-words">{job.error}</p>
      )}
    </div>
  );
}
