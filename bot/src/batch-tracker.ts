// bot/src/batch-tracker.ts — In-memory job tracking for batch progress messages

interface TrackedJob {
  messageId: number;
  lastEdit: number;
  total: number;          // total orgs/persons in batch
  lastCompleted: number;  // last known completed count (to avoid redundant edits)
  jobType: string;        // "enrichment_batch_organizations" or "enrichment"
  createdAt: string;      // job created_at timestamp for child job queries
  stages: string[];       // pipeline stages being run
}

const STALE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes

export class BatchTracker {
  private jobs = new Map<string, TrackedJob>();

  track(
    jobId: string,
    messageId: number,
    opts: { total: number; jobType: string; createdAt: string; stages: string[] }
  ): void {
    this.jobs.set(jobId, {
      messageId,
      lastEdit: Date.now(),
      lastCompleted: 0,
      ...opts,
    });
  }

  complete(jobId: string): void {
    this.jobs.delete(jobId);
  }

  isTracking(jobId: string): boolean {
    return this.jobs.has(jobId);
  }

  getMessageId(jobId: string): number | null {
    return this.jobs.get(jobId)?.messageId ?? null;
  }

  getJob(jobId: string): TrackedJob | undefined {
    return this.jobs.get(jobId);
  }

  hasActiveJobs(): boolean {
    return this.jobs.size > 0;
  }

  getActiveJobIds(): string[] {
    return Array.from(this.jobs.keys());
  }

  touchLastEdit(jobId: string): void {
    const job = this.jobs.get(jobId);
    if (job) job.lastEdit = Date.now();
  }

  setLastEdit(jobId: string, timestamp: number): void {
    const job = this.jobs.get(jobId);
    if (job) job.lastEdit = timestamp;
  }

  shouldUpdate(jobId: string, completed: number): boolean {
    const job = this.jobs.get(jobId);
    if (!job) return false;
    if (completed === job.lastCompleted) return false;
    if (Date.now() - job.lastEdit < 4000) return false; // throttle to 4s
    job.lastCompleted = completed;
    job.lastEdit = Date.now();
    return true;
  }

  getStaleJobs(): string[] {
    const now = Date.now();
    const stale: string[] = [];
    for (const [id, job] of this.jobs) {
      if (now - job.lastEdit > STALE_THRESHOLD_MS) {
        stale.push(id);
      }
    }
    return stale;
  }

  cleanupStale(): string[] {
    const stale = this.getStaleJobs();
    for (const id of stale) this.jobs.delete(id);
    return stale;
  }
}
