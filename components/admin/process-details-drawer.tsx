"use client";

import React from "react";
import Link from "next/link";
import { ChevronUp, ChevronDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useProcessDetails } from "./process-details-provider";
import { deriveDisplayStatus, formatProgress, isActiveStatus } from "@/lib/jobs/status";
import { renderJobDetail } from "./job-renderers";
import type { Job, JobStatus } from "@/lib/jobs/types";

// ---------- helpers ----------

function relativeTime(iso: string): string {
  const diff = Date.now() - Date.parse(iso);
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function readableJobType(jobType: string): string {
  return jobType
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const STATUS_PILL_STYLES: Record<JobStatus, string> = {
  pending: "bg-white/[0.06] text-[var(--text-muted)]",
  processing: "bg-[var(--accent-orange)]/10 text-[var(--accent-orange)]",
  completed: "bg-emerald-500/10 text-emerald-400",
  failed: "bg-red-500/10 text-red-400",
  cancelled: "bg-white/[0.06] text-[var(--text-muted)]",
  stalled: "bg-amber-500/10 text-amber-400",
};

// ---------- sub-components ----------

interface StatusPillProps {
  status: JobStatus;
  isActive: boolean;
}

function StatusPill({ status, isActive }: StatusPillProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium shrink-0",
        STATUS_PILL_STYLES[status]
      )}
    >
      {isActive && status === "processing" && (
        <Loader2 className="h-2.5 w-2.5 animate-spin" />
      )}
      {status}
    </span>
  );
}

interface JobRowProps {
  job: Job;
  isExpanded: boolean;
  onToggle: () => void;
}

const JobRow = React.memo(function JobRow({ job, isExpanded, onToggle }: JobRowProps) {
  const displayStatus = deriveDisplayStatus(job);
  const active = isActiveStatus(displayStatus);
  const progress = formatProgress(job);
  const label = job.label ?? readableJobType(job.job_type);
  const isEnrichmentStalled = displayStatus === "stalled" && job.job_type.startsWith("enrichment");

  return (
    <div
      className={cn(
        "border-b border-white/[0.04] last:border-b-0",
        active && "border-l-2 border-l-[var(--accent-orange)]"
      )}
    >
      {/* Row header — clickable to expand */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full text-left px-3 py-2.5 hover:bg-white/[0.03] transition-colors"
      >
        <div className="flex items-start justify-between gap-2">
          {/* Left */}
          <div className="min-w-0 flex-1 space-y-0.5">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs text-white/80 truncate">{label}</span>
              {progress && (
                <span className="text-[10px] text-[var(--text-muted)] shrink-0">
                  {progress.text}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-[var(--text-muted)]">
              {job.phase && (
                <>
                  <span className="truncate">{job.phase}</span>
                  <span>&middot;</span>
                </>
              )}
              <span>{relativeTime(job.updated_at)}</span>
            </div>
          </div>

          {/* Right: status + expand chevron */}
          <div className="flex items-center gap-1.5 shrink-0">
            <StatusPill status={displayStatus} isActive={active} />
            {isExpanded ? (
              <ChevronDown className="h-3 w-3 text-[var(--text-muted)]" />
            ) : (
              <ChevronUp className="h-3 w-3 text-[var(--text-muted)]" />
            )}
          </div>
        </div>
      </button>

      {/* Expanded detail */}
      {isExpanded && (
        <div className="pb-2">
          {renderJobDetail(job)}
          {/* Stalled affordances */}
          {displayStatus === "stalled" && (
            <div className="px-3 pt-1">
              {isEnrichmentStalled ? (
                <Link
                  href={`/admin/enrichment?retry=${job.id}`}
                  className="text-[10px] text-amber-400 hover:text-amber-300 underline underline-offset-2 transition-colors"
                >
                  Retry enrichment
                </Link>
              ) : (
                <span className="text-[10px] text-amber-400">
                  Resuming automatically…
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
});

// ---------- collapsed pill summary ----------

interface CollapsedSummaryProps {
  jobs: Job[];
}

function CollapsedSummary({ jobs }: CollapsedSummaryProps) {
  // Find the most recent active job
  const activeJob = jobs.find((j) => isActiveStatus(deriveDisplayStatus(j)));
  const progress = activeJob ? formatProgress(activeJob) : null;

  const activeCount = jobs.filter((j) =>
    isActiveStatus(deriveDisplayStatus(j))
  ).length;

  return (
    <span className="text-xs text-[var(--text-muted)] truncate">
      {activeCount > 0 ? (
        <>
          <span className="text-[var(--accent-orange)]">{activeCount} active</span>
          {progress && (
            <span className="ml-1.5">&middot; {progress.text}</span>
          )}
        </>
      ) : (
        <>
          {jobs.length} job{jobs.length !== 1 ? "s" : ""}
        </>
      )}
    </span>
  );
}

// ---------- main drawer ----------

export const ProcessDetailsDrawer = React.memo(function ProcessDetailsDrawer() {
  const { open, setOpen, jobs, expandedJobId, setExpandedJobId } =
    useProcessDetails();

  const handleToggle = React.useCallback(() => setOpen((v) => !v), [setOpen]);

  const handleRowToggle = React.useCallback(
    (jobId: string) => {
      setExpandedJobId((prev) => (prev === jobId ? null : jobId));
    },
    [setExpandedJobId]
  );

  // Sort: active jobs first (by display status), then by created_at desc.
  // deriveDisplayStatus defaults to Date.now() internally; the drawer re-renders
  // on each 4s poll, so freshness is preserved without an impure call here.
  const sortedJobs = React.useMemo(() => {
    return [...jobs].sort((a, b) => {
      const aActive = isActiveStatus(deriveDisplayStatus(a));
      const bActive = isActiveStatus(deriveDisplayStatus(b));
      if (aActive && !bActive) return -1;
      if (!aActive && bActive) return 1;
      return 0; // already newest-first from useJobs()
    });
  }, [jobs]);

  if (jobs.length === 0 && !open) return null;

  return (
    <div
      className={cn(
        "hidden lg:flex fixed bottom-0 right-6 z-30 flex-col",
        "bg-[#0f0f13] border border-white/[0.06] border-b-0 rounded-t-lg shadow-2xl",
        "transition-all duration-300 ease-out",
        open ? "h-[44vh] w-[440px]" : "h-8 w-[220px]"
      )}
    >
      {/* Toggle header */}
      <button
        type="button"
        onClick={handleToggle}
        className="flex items-center justify-between px-3 h-8 shrink-0 text-xs text-[var(--text-muted)] hover:text-white transition-colors"
      >
        <span className="font-medium text-white/70 mr-2 shrink-0">
          Process Details
        </span>
        {!open && <CollapsedSummary jobs={sortedJobs} />}
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 ml-auto shrink-0" />
        ) : (
          <ChevronUp className="h-3.5 w-3.5 ml-1 shrink-0" />
        )}
      </button>

      {/* Expanded content */}
      {open && (
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
          {/* Sub-header */}
          <div className="px-3 py-1.5 border-b border-white/[0.04] shrink-0">
            <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-medium">
              {sortedJobs.length} job{sortedJobs.length !== 1 ? "s" : ""}
            </span>
          </div>

          {/* Job list */}
          <div className="flex-1 overflow-y-auto scrollbar-thin">
            {sortedJobs.length === 0 && (
              <p className="text-xs text-[var(--text-muted)] px-3 py-6 text-center">
                No recent jobs
              </p>
            )}
            {sortedJobs.map((job) => (
              <JobRow
                key={job.id}
                job={job}
                isExpanded={expandedJobId === job.id}
                onToggle={() => handleRowToggle(job.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
});

ProcessDetailsDrawer.displayName = "ProcessDetailsDrawer";
