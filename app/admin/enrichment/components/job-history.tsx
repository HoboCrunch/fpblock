"use client";

import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

export interface JobHistoryJob {
  id: string;
  job_type: string;
  status: string;
  created_at: string;
  metadata: Record<string, unknown> | null;
}

export interface JobHistoryProps {
  jobs: JobHistoryJob[];
  activeJobId: string | null;
  viewingJobId: string | null;
  onSelectJob: (jobId: string) => void;
}

// ---------- helpers ----------

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
    ", " +
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

function getEntityType(jobType: string): string {
  return jobType.toLowerCase().includes("person") ? "Persons" : "Organizations";
}

function getStagesLabel(metadata: Record<string, unknown> | null, jobType: string): string {
  if (metadata?.stages && Array.isArray(metadata.stages)) {
    const stages = metadata.stages as string[];
    const labels: string[] = [];

    if (stages.includes("full")) {
      labels.push("Full Pipeline");
    } else {
      if (stages.includes("apollo")) labels.push("Apollo");
      if (stages.includes("perplexity")) labels.push("Perplexity");
      if (stages.includes("gemini")) labels.push("Gemini");
    }
    if (stages.includes("people_finder")) labels.push("People Finder");

    if (labels.length > 0) return labels.join(" + ");
  }

  // Fallback to job_type
  if (jobType.toLowerCase().includes("person")) return "Person Enrichment";
  return jobType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function getResultBadge(
  status: string,
  metadata: Record<string, unknown> | null,
  isActive: boolean
): { text: string; className: string; isSpinner: boolean } {
  if (isActive || status === "processing" || status === "in_progress") {
    return { text: "", className: "text-[var(--accent-orange)]", isSpinner: true };
  }

  if (status === "failed" || status === "error") {
    return { text: "\u2717", className: "text-red-400", isSpinner: false };
  }

  // Completed / cancelled — extract counts
  let enriched: number | undefined;
  let total: number | undefined;

  if (metadata) {
    // Org jobs
    if (typeof metadata.orgs_enriched === "number") enriched = metadata.orgs_enriched as number;
    if (typeof metadata.org_count === "number") total = metadata.org_count as number;
    // Person jobs
    if (typeof metadata.contacts_processed === "number") {
      enriched = metadata.contacts_processed as number;
      total = enriched; // fallback
    }
    if (typeof metadata.total === "number") total = metadata.total as number;
    if (typeof metadata.enriched === "number") enriched = metadata.enriched as number;
  }

  if (enriched !== undefined && total !== undefined) {
    return {
      text: `\u2713 ${enriched}/${total}`,
      className: "text-emerald-400",
      isSpinner: false,
    };
  }

  if (status === "completed" || status === "complete") {
    return { text: "\u2713", className: "text-emerald-400", isSpinner: false };
  }

  if (status === "cancelled") {
    return { text: "cancelled", className: "text-[var(--text-muted)]", isSpinner: false };
  }

  return { text: status, className: "text-[var(--text-muted)]", isSpinner: false };
}

// ---------- component ----------

export function JobHistory({ jobs, activeJobId, viewingJobId, onSelectJob }: JobHistoryProps) {
  // Pin active job at top
  const sortedJobs = [...jobs].sort((a, b) => {
    if (a.id === activeJobId) return -1;
    if (b.id === activeJobId) return 1;
    return 0; // preserve original order (most recent first from API)
  });

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-xs text-[var(--text-muted)] uppercase tracking-wider font-medium">
          Job History
        </span>
      </div>

      {/* Scrollable list */}
      <div className="flex-1 overflow-y-auto">
        {sortedJobs.length === 0 && (
          <p className="text-xs text-[var(--text-muted)] px-3 py-4 text-center">
            No enrichment jobs yet
          </p>
        )}

        {sortedJobs.map((job) => {
          const isActive = job.id === activeJobId;
          const isViewing = job.id === viewingJobId;
          const badge = getResultBadge(job.status, job.metadata, isActive);

          return (
            <div
              key={job.id}
              onClick={() => onSelectJob(job.id)}
              className={cn(
                "px-3 py-2.5 cursor-pointer hover:bg-white/[0.04] transition-colors border-b border-white/[0.04]",
                isActive && "border-l-2 border-l-[var(--accent-orange)]",
                isViewing && "bg-white/[0.06]"
              )}
            >
              <div className="flex items-start justify-between gap-2">
                {/* Left content */}
                <div className="min-w-0 flex-1">
                  {/* Line 1: timestamp + entity type */}
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="text-white/80">{formatTimestamp(job.created_at)}</span>
                    <span className="text-[var(--text-muted)]">&middot;</span>
                    <span className="text-[var(--text-muted)]">{getEntityType(job.job_type)}</span>
                  </div>
                  {/* Line 2: stages */}
                  <div className="text-[10px] text-[var(--text-muted)] mt-0.5 truncate">
                    {getStagesLabel(job.metadata, job.job_type)}
                  </div>
                </div>

                {/* Right: result badge */}
                <div className={cn("text-xs font-medium shrink-0 mt-0.5", badge.className)}>
                  {badge.isSpinner ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    badge.text
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
