"use client";

import React from "react";
import { cn } from "@/lib/utils";
import type { Job } from "@/lib/jobs/types";
import { formatProgress, deriveDisplayStatus } from "@/lib/jobs/status";

interface DefaultRendererProps {
  job: Job;
}

export function DefaultRenderer({ job }: DefaultRendererProps) {
  const progress = formatProgress(job);
  const displayStatus = deriveDisplayStatus(job);

  return (
    <div className="px-3 py-2 space-y-2">
      {progress && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
            <span>{progress.text}</span>
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
              style={{
                width:
                  progress.total > 0
                    ? `${Math.min(100, (progress.completed / progress.total) * 100)}%`
                    : "0%",
              }}
            />
          </div>
        </div>
      )}

      {job.phase && (
        <p className="text-xs text-[var(--text-muted)]">
          Phase: <span className="text-white/70">{job.phase}</span>
        </p>
      )}

      {job.error && (
        <p className="text-xs text-red-400 break-words">{job.error}</p>
      )}

      {!progress && !job.phase && (
        <p className="text-xs text-[var(--text-muted)] italic">No progress data</p>
      )}
    </div>
  );
}
