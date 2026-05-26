import { describe, it, expect } from "vitest";
import { computeStepScheduledAt } from "./schedule";
import type { SequenceSchedule, SequenceStep } from "@/lib/types/database";

function step(delay_days: number): SequenceStep {
  return {
    step_number: 1,
    delay_days,
    action_type: "follow_up",
    subject_template: null,
    body_template: { blocks: [] } as unknown as SequenceStep["body_template"],
  };
}

const DAY = 24 * 60 * 60 * 1000;

describe("computeStepScheduledAt", () => {
  it("relative mode, step 0, zero delay, enrolled in the past → now", () => {
    const now = new Date("2026-06-10T12:00:00.000Z");
    const enrolledAt = new Date(now.getTime() - 5 * DAY);
    const schedule: SequenceSchedule = { timing_mode: "relative" };
    const out = computeStepScheduledAt({
      enrolledAt,
      steps: [step(0)],
      stepIndex: 0,
      schedule,
      now,
    });
    expect(out).toBe(now.toISOString());
  });

  it("relative mode, later step accumulates delays from enrollment", () => {
    const now = new Date("2026-06-10T12:00:00.000Z");
    const enrolledAt = now;
    const schedule: SequenceSchedule = { timing_mode: "relative" };
    // delays [0, 3] → step 1 due 3 days after enrollment
    const out = computeStepScheduledAt({
      enrolledAt,
      steps: [step(0), step(3)],
      stepIndex: 1,
      schedule,
      now,
    });
    expect(out).toBe(new Date(now.getTime() + 3 * DAY).toISOString());
  });

  it("relative mode, cumulative across three steps", () => {
    const now = new Date("2026-06-10T12:00:00.000Z");
    const out = computeStepScheduledAt({
      enrolledAt: now,
      steps: [step(0), step(2), step(2)],
      stepIndex: 2,
      schedule: { timing_mode: "relative" },
      now,
    });
    expect(out).toBe(new Date(now.getTime() + 4 * DAY).toISOString());
  });

  it("anchor mode, direction before, subtracts the step delay from the anchor", () => {
    const now = new Date("2026-06-01T00:00:00.000Z");
    const anchor = new Date("2026-06-11T00:00:00.000Z"); // 10 days out
    const schedule: SequenceSchedule = {
      timing_mode: "anchor",
      anchor_date: anchor.toISOString(),
      anchor_direction: "before",
    };
    // step 1 delay 2 → anchor - 2d
    const out = computeStepScheduledAt({
      enrolledAt: now,
      steps: [step(0), step(2)],
      stepIndex: 1,
      schedule,
      now,
    });
    expect(out).toBe(new Date(anchor.getTime() - 2 * DAY).toISOString());
  });

  it("snaps a weekend due-date forward into the next weekday send window", () => {
    // 2026-06-06 is a Saturday.
    const now = new Date("2026-06-06T12:00:00.000Z");
    const schedule: SequenceSchedule = {
      timing_mode: "window",
      send_window: {
        days: ["mon", "tue", "wed", "thu", "fri"],
        start_hour: 9,
        end_hour: 17,
        timezone: "UTC",
      },
    };
    const out = computeStepScheduledAt({
      enrolledAt: now,
      steps: [step(0)],
      stepIndex: 0,
      schedule,
      now,
    });
    const d = new Date(out);
    // Must land on a weekday inside 09:00–17:00 UTC.
    const day = d.getUTCDay(); // 0 Sun … 6 Sat
    expect(day).toBeGreaterThanOrEqual(1);
    expect(day).toBeLessThanOrEqual(5);
    expect(d.getUTCHours()).toBeGreaterThanOrEqual(9);
    expect(d.getUTCHours()).toBeLessThan(17);
    // First valid slot after Saturday noon is Monday 09:00.
    expect(out).toBe("2026-06-08T09:00:00.000Z");
  });

  it("returns the due time unchanged when already inside the window", () => {
    // 2026-06-08 is a Monday, 10:00 UTC is inside 9–17.
    const now = new Date("2026-06-08T10:00:00.000Z");
    const schedule: SequenceSchedule = {
      timing_mode: "window",
      send_window: {
        days: ["mon", "tue", "wed", "thu", "fri"],
        start_hour: 9,
        end_hour: 17,
        timezone: "UTC",
      },
    };
    const out = computeStepScheduledAt({
      enrolledAt: now,
      steps: [step(0)],
      stepIndex: 0,
      schedule,
      now,
    });
    expect(out).toBe(now.toISOString());
  });
});
