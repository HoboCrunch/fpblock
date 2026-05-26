"use client";

import React, { useMemo } from "react";
import { Loader2, Check, X, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Job } from "@/lib/jobs/types";
import { useJobChildren } from "@/lib/queries/use-job-children";
import { formatProgress } from "@/lib/jobs/status";
import { OrgStatusIcons } from "@/app/admin/enrichment/components/status-icons";
import type { OrgStatusIconsProps } from "@/app/admin/enrichment/components/status-icons";

interface EnrichmentRendererProps {
  job: Job;
}

/**
 * Routes an enrichment job to the right detail view. Person batches
 * (target_table === "persons") list one row per contact; everything else
 * uses the org-stage view. Each branch is its own component so hooks run
 * unconditionally (Rules of Hooks).
 */
export function EnrichmentRenderer({ job }: EnrichmentRendererProps) {
  if (job.target_table === "persons") {
    return <PersonBatchDetail job={job} />;
  }
  return <OrgBatchDetail job={job} />;
}

// ---------------------------------------------------------------------------
// Org batch detail — per-org stage icons
// ---------------------------------------------------------------------------

/**
 * Maps child job_log rows for a given org (target_id) into the `stages`
 * prop shape that OrgStatusIcons expects:
 *   stages: Record<stageKey, { status?: string; error?: string; [key: string]: unknown }>
 *
 * Child job_type values (from CHILD_JOB_TYPES):
 *   enrichment_full  → key: "full" (not rendered as stage icon — skip)
 *   enrichment_apollo → key: "apollo"
 *   enrichment_perplexity → key: "perplexity"
 *   enrichment_gemini → key: "gemini"
 *   enrichment_people_finder → key: "people_finder"
 */
function childJobTypeToStageKey(jobType: string): string | null {
  if (jobType === "enrichment_apollo") return "apollo";
  if (jobType === "enrichment_perplexity") return "perplexity";
  if (jobType === "enrichment_gemini") return "gemini";
  if (jobType === "enrichment_people_finder") return "people_finder";
  return null; // enrichment_full and unknowns are not stage icons
}

/** Build the stages map for one org from its child rows. */
function buildStagesForOrg(
  childRows: Job[]
): OrgStatusIconsProps["stages"] {
  const stages: NonNullable<OrgStatusIconsProps["stages"]> = {};
  for (const row of childRows) {
    const key = childJobTypeToStageKey(row.job_type);
    if (!key) continue;
    stages[key] = {
      status: row.status,
      error: row.error ?? undefined,
    };
  }
  return Object.keys(stages).length > 0 ? stages : null;
}

function OrgBatchDetail({ job }: { job: Job }) {
  const { data: children = [], isLoading } = useJobChildren(job.id);
  const progress = formatProgress(job);

  /** Group child rows by target_id (org id). */
  const orgGroups = useMemo(() => {
    const map = new Map<string, { orgId: string; rows: Job[] }>();
    for (const child of children) {
      const orgId = child.target_id ?? "__unknown__";
      if (!map.has(orgId)) {
        map.set(orgId, { orgId, rows: [] });
      }
      map.get(orgId)!.rows.push(child);
    }
    // Return sorted: active orgs (any child processing) first
    return Array.from(map.values()).sort((a, b) => {
      const aActive = a.rows.some((r) => r.status === "processing");
      const bActive = b.rows.some((r) => r.status === "processing");
      if (aActive && !bActive) return -1;
      if (!aActive && bActive) return 1;
      return 0;
    });
  }, [children]);

  /** Find the currently active stage key across all children. */
  const activeStageKey = useMemo(() => {
    for (const child of children) {
      if (child.status === "processing") {
        return childJobTypeToStageKey(child.job_type) ?? undefined;
      }
    }
    return undefined;
  }, [children]);

  return (
    <div className="px-3 py-2 space-y-2">
      {/* Overall progress summary */}
      {progress && (
        <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
          <span>
            {progress.text} orgs
            {progress.failed > 0 && (
              <span className="text-red-400 ml-1.5">{progress.failed} failed</span>
            )}
          </span>
          {isLoading && (
            <Loader2 className="h-3 w-3 animate-spin text-[var(--accent-orange)]" />
          )}
        </div>
      )}

      {/* Per-org rows */}
      {orgGroups.length > 0 ? (
        <div className="space-y-0.5 max-h-[160px] overflow-y-auto scrollbar-thin">
          {orgGroups.map(({ orgId, rows }) => {
            const stages = buildStagesForOrg(rows);
            if (!stages) return null;

            const activeStageForOrg = rows.find((r) => r.status === "processing")
              ? activeStageKey
              : undefined;

            // Derive a short label from rows
            const orgLabel =
              rows[0]?.label
                ? rows[0].label
                : orgId === "__unknown__"
                ? "Unknown org"
                : orgId.slice(0, 8) + "…";

            return (
              <div
                key={orgId}
                className="flex items-center justify-between gap-2 py-0.5"
              >
                <span
                  className="text-[10px] text-[var(--text-muted)] truncate min-w-0"
                  title={orgLabel}
                >
                  {orgLabel}
                </span>
                <OrgStatusIcons
                  stages={stages}
                  mode="live"
                  activeStage={activeStageForOrg}
                />
              </div>
            );
          })}
        </div>
      ) : isLoading ? (
        <p className="text-xs text-[var(--text-muted)] italic flex items-center gap-1.5">
          <Loader2 className="h-3 w-3 animate-spin" /> Loading stages…
        </p>
      ) : (
        <p className="text-xs text-[var(--text-muted)] italic">No stage details</p>
      )}

      {job.error && (
        <p className="text-xs text-red-400 break-words">{job.error}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Person batch detail — one row per contact with its match outcome
// ---------------------------------------------------------------------------

function PersonBatchDetail({ job }: { job: Job }) {
  const { data: children = [], isLoading } = useJobChildren(job.id);
  const progress = formatProgress(job);

  // Newest-completed first so live runs show the latest activity at the top.
  const rows = useMemo(
    () => [...children].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)),
    [children]
  );

  return (
    <div className="px-3 py-2 space-y-2">
      {/* Overall progress summary */}
      {progress && (
        <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
          <span>
            {progress.text} contacts
            {progress.failed > 0 && (
              <span className="text-red-400 ml-1.5">{progress.failed} failed</span>
            )}
          </span>
          {isLoading && (
            <Loader2 className="h-3 w-3 animate-spin text-[var(--accent-orange)]" />
          )}
        </div>
      )}

      {/* Per-contact rows */}
      {rows.length > 0 ? (
        <div className="space-y-0.5 max-h-[160px] overflow-y-auto scrollbar-thin">
          {rows.map((child) => (
            <PersonRow key={child.id} child={child} />
          ))}
        </div>
      ) : isLoading ? (
        <p className="text-xs text-[var(--text-muted)] italic flex items-center gap-1.5">
          <Loader2 className="h-3 w-3 animate-spin" /> Loading contacts…
        </p>
      ) : (
        <p className="text-xs text-[var(--text-muted)] italic">No contact details yet</p>
      )}

      {job.error && (
        <p className="text-xs text-red-400 break-words">{job.error}</p>
      )}
    </div>
  );
}

function PersonRow({ child }: { child: Job }) {
  const m = child.metadata ?? {};
  const name =
    (typeof m.person_name === "string" && m.person_name) ||
    (child.target_id ? child.target_id.slice(0, 8) + "…" : "Unknown");
  const fields = Array.isArray(m.fields_updated) ? (m.fields_updated as string[]) : [];
  const orgLinked = m.org_linked === true;
  const failed = child.status === "failed";
  const processing = child.status === "processing";

  // Right-hand summary describing the match outcome.
  let summary: string;
  let summaryClass = "text-[var(--text-muted)]";
  if (failed) {
    summary = child.error ?? "failed";
    summaryClass = "text-red-400";
  } else if (fields.length > 0) {
    summary = fields.join(", ");
  } else {
    summary = "no new data";
  }

  return (
    <div className="flex items-center justify-between gap-2 py-0.5">
      <span className="flex items-center gap-1.5 min-w-0">
        {processing ? (
          <Loader2 className="h-3 w-3 shrink-0 animate-spin text-[var(--accent-orange)]" />
        ) : failed ? (
          <X className="h-3 w-3 shrink-0 text-red-400" />
        ) : (
          <Check className="h-3 w-3 shrink-0 text-emerald-400" />
        )}
        <span className="text-[10px] text-white/80 truncate min-w-0" title={name}>
          {name}
        </span>
        {orgLinked && (
          <Building2
            className="h-2.5 w-2.5 shrink-0 text-[var(--text-muted)]"
            aria-label="linked to org"
          />
        )}
      </span>
      <span
        className={cn("text-[10px] truncate min-w-0 max-w-[55%] text-right", summaryClass)}
        title={summary}
      >
        {summary}
      </span>
    </div>
  );
}
