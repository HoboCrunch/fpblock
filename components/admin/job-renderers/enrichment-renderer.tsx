"use client";

import React, { useMemo } from "react";
import { Loader2 } from "lucide-react";
import type { Job } from "@/lib/jobs/types";
import { useJobChildren } from "@/lib/queries/use-job-children";
import { formatProgress } from "@/lib/jobs/status";
import { OrgStatusIcons } from "@/app/admin/enrichment/components/status-icons";
import type { OrgStatusIconsProps } from "@/app/admin/enrichment/components/status-icons";

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

interface EnrichmentRendererProps {
  job: Job;
}

export function EnrichmentRenderer({ job }: EnrichmentRendererProps) {
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
