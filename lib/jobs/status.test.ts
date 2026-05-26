import { describe, it, expect } from "vitest";
import { deriveDisplayStatus, formatProgress, STALL_MS } from "./status";
import type { Job } from "./types";

// ─── helpers ────────────────────────────────────────────────────────────────

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    job_type: "enrichment_batch_organizations",
    target_table: null,
    target_id: null,
    parent_job_id: null,
    status: "processing",
    label: null,
    phase: null,
    progress_total: 0,
    progress_completed: 0,
    progress_failed: 0,
    error: null,
    metadata: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

// ─── deriveDisplayStatus ─────────────────────────────────────────────────────

describe("deriveDisplayStatus", () => {
  it("returns 'stalled' for a processing job past the default threshold", () => {
    const stalledAt = Date.now() - STALL_MS.default - 1000;
    const job = makeJob({ updated_at: new Date(stalledAt).toISOString() });
    expect(deriveDisplayStatus(job)).toBe("stalled");
  });

  it("returns 'processing' for a job within the default threshold", () => {
    const recentAt = Date.now() - STALL_MS.default + 60_000;
    const job = makeJob({ updated_at: new Date(recentAt).toISOString() });
    expect(deriveDisplayStatus(job)).toBe("processing");
  });

  it("uses csv_import threshold (5 min) instead of default (15 min)", () => {
    // 6 minutes ago — stale for csv_import but NOT stale for default
    const sixMinutesAgo = Date.now() - 6 * 60_000;
    const defaultJob = makeJob({
      job_type: "enrichment_batch_organizations",
      updated_at: new Date(sixMinutesAgo).toISOString(),
    });
    const csvJob = makeJob({
      job_type: "csv_import",
      updated_at: new Date(sixMinutesAgo).toISOString(),
    });
    expect(deriveDisplayStatus(defaultJob)).toBe("processing"); // within 15 min
    expect(deriveDisplayStatus(csvJob)).toBe("stalled");        // past 5 min
  });

  it("does not promote completed jobs to stalled", () => {
    const stalledAt = Date.now() - STALL_MS.default - 1000;
    const job = makeJob({
      status: "completed",
      updated_at: new Date(stalledAt).toISOString(),
    });
    expect(deriveDisplayStatus(job)).toBe("completed");
  });

  it("does not promote failed jobs to stalled", () => {
    const stalledAt = Date.now() - STALL_MS.default - 1000;
    const job = makeJob({
      status: "failed",
      updated_at: new Date(stalledAt).toISOString(),
    });
    expect(deriveDisplayStatus(job)).toBe("failed");
  });

  it("returns 'stalled' exactly at the boundary (now - updated_at === threshold + 1ms)", () => {
    const now = Date.now();
    const updatedAt = now - STALL_MS.default - 1;
    const job = makeJob({ updated_at: new Date(updatedAt).toISOString() });
    expect(deriveDisplayStatus(job, now)).toBe("stalled");
  });

  it("returns 'processing' exactly at the boundary (now - updated_at === threshold - 1ms)", () => {
    const now = Date.now();
    const updatedAt = now - STALL_MS.default + 1;
    const job = makeJob({ updated_at: new Date(updatedAt).toISOString() });
    expect(deriveDisplayStatus(job, now)).toBe("processing");
  });
});

// ─── formatProgress ──────────────────────────────────────────────────────────

describe("formatProgress", () => {
  it("returns relational columns when progress_total > 0", () => {
    const job = makeJob({
      progress_total: 100,
      progress_completed: 42,
      progress_failed: 3,
    });
    const result = formatProgress(job);
    expect(result).toEqual({ completed: 42, total: 100, failed: 3, text: "42/100" });
  });

  it("returns null when progress_total is 0 and no metadata", () => {
    const job = makeJob({ progress_total: 0, metadata: null });
    expect(formatProgress(job)).toBeNull();
  });

  // Legacy metadata fallback: org enrichment jobs
  it("falls back to orgs_enriched / org_count metadata keys", () => {
    const job = makeJob({
      metadata: { orgs_enriched: 30, org_count: 50, stages: ["apollo"] },
    });
    const result = formatProgress(job);
    expect(result).toEqual({ completed: 30, total: 50, failed: 0, text: "30/50" });
  });

  // Legacy metadata fallback: person enrichment jobs (enriched / total)
  it("falls back to enriched / total metadata keys", () => {
    const job = makeJob({
      job_type: "enrichment_batch_persons",
      metadata: { enriched: 15, total: 20 },
    });
    const result = formatProgress(job);
    expect(result).toEqual({ completed: 15, total: 20, failed: 0, text: "15/20" });
  });

  // Legacy metadata fallback: contacts_processed used as both completed and total
  it("falls back to contacts_processed as both completed and total when no other keys present", () => {
    const job = makeJob({
      job_type: "enrichment_batch_persons",
      metadata: { contacts_processed: 25 },
    });
    const result = formatProgress(job);
    expect(result).toEqual({ completed: 25, total: 25, failed: 0, text: "25/25" });
  });

  it("prefers enriched/total over contacts_processed when both present", () => {
    const job = makeJob({
      metadata: { enriched: 10, total: 20, contacts_processed: 99 },
    });
    const result = formatProgress(job);
    expect(result).toEqual({ completed: 10, total: 20, failed: 0, text: "10/20" });
  });

  it("returns null when metadata has no recognized count keys", () => {
    const job = makeJob({ metadata: { stages: ["apollo"], some_flag: true } });
    expect(formatProgress(job)).toBeNull();
  });

  it("relational columns take priority over metadata even when metadata is also present", () => {
    const job = makeJob({
      progress_total: 10,
      progress_completed: 5,
      progress_failed: 1,
      metadata: { orgs_enriched: 99, org_count: 999 },
    });
    const result = formatProgress(job);
    expect(result).toEqual({ completed: 5, total: 10, failed: 1, text: "5/10" });
  });
});
