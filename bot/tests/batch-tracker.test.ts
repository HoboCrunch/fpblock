import { describe, it, expect, beforeEach } from "vitest";
import { BatchTracker } from "../src/batch-tracker.js";

describe("BatchTracker", () => {
  let tracker: BatchTracker;

  beforeEach(() => {
    tracker = new BatchTracker();
  });

  it("tracks a new job", () => {
    tracker.track("job-1", 123);
    expect(tracker.isTracking("job-1")).toBe(true);
    expect(tracker.getMessageId("job-1")).toBe(123);
  });

  it("removes completed jobs", () => {
    tracker.track("job-1", 123);
    tracker.complete("job-1");
    expect(tracker.isTracking("job-1")).toBe(false);
  });

  it("reports whether any jobs are active", () => {
    expect(tracker.hasActiveJobs()).toBe(false);
    tracker.track("job-1", 123);
    expect(tracker.hasActiveJobs()).toBe(true);
  });

  it("detects stale jobs (>10 minutes since last edit)", () => {
    tracker.track("job-1", 123);
    tracker.setLastEdit("job-1", Date.now() - 11 * 60 * 1000);
    const stale = tracker.getStaleJobs();
    expect(stale).toContain("job-1");
  });

  it("returns active job IDs", () => {
    tracker.track("j1", 1);
    tracker.track("j2", 2);
    expect(tracker.getActiveJobIds()).toEqual(["j1", "j2"]);
  });
});
