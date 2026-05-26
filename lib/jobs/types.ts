export type JobStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled"
  | "stalled";

export interface Job {
  id: string;
  job_type: string;
  target_table: string | null;
  target_id: string | null;
  parent_job_id: string | null;
  status: JobStatus;
  label: string | null;
  phase: string | null;
  progress_total: number;
  progress_completed: number;
  progress_failed: number;
  error: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

// Per-stage rows written by the enrichment pipeline; excluded from the top-level feed.
export const CHILD_JOB_TYPES = [
  "enrichment_full",
  "enrichment_apollo",
  "enrichment_perplexity",
  "enrichment_gemini",
  "enrichment_people_finder",
  "enrichment_person_match",
] as const;
