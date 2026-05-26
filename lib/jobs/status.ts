import type { Job, JobStatus } from "./types";

// Milliseconds before a processing job is considered stalled.
export const STALL_MS: Record<string, number> & { default: number; csv_import: number } = {
  default: 15 * 60_000,
  csv_import: 5 * 60_000,
};

/** Returns true for statuses that mean the job is still in flight. */
export function isActiveStatus(s: JobStatus): boolean {
  return s === "pending" || s === "processing" || s === "stalled";
}

/**
 * Derives the display status for a job, promoting 'processing' to 'stalled'
 * when the job has not written progress within its stall threshold.
 */
export function deriveDisplayStatus(job: Job, now = Date.now()): JobStatus {
  if (job.status === "processing") {
    const threshold =
      job.job_type in STALL_MS
        ? STALL_MS[job.job_type]
        : STALL_MS.default;
    const lastSeen = Date.parse(job.updated_at);
    if (now - lastSeen > threshold) {
      return "stalled";
    }
  }
  return job.status;
}

/**
 * Derives a human-readable progress summary for a job.
 *
 * Resolution order:
 *   1. Relational columns  — progress_completed / progress_total / progress_failed
 *   2. Legacy metadata     — mirrors the key names used by getResultBadge() in
 *                            app/admin/enrichment/components/job-history.tsx:
 *                              • orgs_enriched / org_count       (org enrichment)
 *                              • enriched / total                (person enrichment)
 *                              • contacts_processed              (person batch, total fallback)
 * Returns null when no count information is available at all.
 */
export function formatProgress(
  job: Job
): { completed: number; total: number; failed: number; text: string } | null {
  // 1. Prefer first-class relational columns.
  if (job.progress_total > 0) {
    const { progress_completed: completed, progress_total: total, progress_failed: failed } = job;
    return { completed, total, failed, text: `${completed}/${total}` };
  }

  // 2. Fall back to legacy metadata keys.
  const m = job.metadata;
  if (m) {
    let completed: number | undefined;
    let total: number | undefined;

    // Org enrichment jobs
    if (typeof m.orgs_enriched === "number") completed = m.orgs_enriched as number;
    if (typeof m.org_count === "number") total = m.org_count as number;

    // Person enrichment jobs
    if (typeof m.enriched === "number") completed = m.enriched as number;
    if (typeof m.total === "number") total = m.total as number;

    // contacts_processed: used both as completed count and total fallback
    if (typeof m.contacts_processed === "number") {
      const cp = m.contacts_processed as number;
      if (completed === undefined) completed = cp;
      if (total === undefined) total = cp;
    }

    if (completed !== undefined && total !== undefined) {
      return { completed, total, failed: 0, text: `${completed}/${total}` };
    }
  }

  return null;
}
