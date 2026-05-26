import type { SequenceSchedule, SequenceStep } from "@/lib/types/database";

// ─── Send-window helpers ─────────────────────────────────────────────────────
// Shared by the generator (which pre-computes each step's scheduled_at) so the
// drip cadence is encoded in scheduled_at rather than in *when* a row is created.

type DayKey = "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat";

const WEEKDAY_SHORT_TO_KEY: Record<string, DayKey> = {
  Sun: "sun",
  Mon: "mon",
  Tue: "tue",
  Wed: "wed",
  Thu: "thu",
  Fri: "fri",
  Sat: "sat",
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Hour-of-day (0-23) for `date` as observed in `timeZone`. Uses
 * Intl.DateTimeFormat so DST transitions are handled correctly.
 */
function getZonedHour(date: Date, timeZone: string): number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    hour: "2-digit",
  });
  const n = parseInt(fmt.format(date), 10);
  if (Number.isNaN(n)) return 0;
  return n % 24;
}

/** Day-of-week key ('sun'..'sat') for `date` as observed in `timeZone`. */
function getZonedDayKey(date: Date, timeZone: string): DayKey {
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" });
  return WEEKDAY_SHORT_TO_KEY[fmt.format(date)] ?? "sun";
}

/**
 * Given a `from` instant, return the first instant >= `from` that falls inside
 * the configured send window. Falls back to `from` when no window is set.
 *
 * Walks forward in 30-minute steps for up to 7 days, checking each candidate
 * against the configured timezone.
 */
export function snapToSendWindow(
  from: Date,
  send_window: SequenceSchedule["send_window"]
): Date {
  if (!send_window) return from;

  const { days, start_hour, end_hour, timezone } = send_window;
  const allowedDays = new Set<DayKey>(days as DayKey[]);

  // Already inside a valid window → use as-is.
  if (
    allowedDays.has(getZonedDayKey(from, timezone)) &&
    getZonedHour(from, timezone) >= start_hour &&
    getZonedHour(from, timezone) < end_hour
  ) {
    return from;
  }

  const STEP_MS = 30 * 60 * 1000;
  const MAX_STEPS = (7 * 24 * 60) / 30; // 336 steps
  let cursor = new Date(Math.ceil(from.getTime() / STEP_MS) * STEP_MS);

  for (let i = 0; i < MAX_STEPS; i++) {
    const day = getZonedDayKey(cursor, timezone);
    const hour = getZonedHour(cursor, timezone);
    if (allowedDays.has(day) && hour >= start_hour && hour < end_hour) {
      return cursor;
    }
    cursor = new Date(cursor.getTime() + STEP_MS);
  }

  // No window found within 7 days — fall back to `from`.
  return from;
}

/**
 * Cumulative delay (in days) through `stepIndex` for relative/window timing.
 */
function cumulativeDelayDays(steps: SequenceStep[], stepIndex: number): number {
  return steps
    .slice(0, stepIndex + 1)
    .reduce((sum, s) => sum + (s.delay_days || 0), 0);
}

/**
 * Compute the planned send time for a single sequence step.
 *
 * The generator pre-creates a row for every step up front; the cadence lives
 * here, in scheduled_at, instead of being implied by generation timing. The
 * sender worker only dispatches rows whose scheduled_at <= now, so a future
 * planned time naturally holds a follow-up until it's due.
 *
 * - relative / window: enrolled_at + cumulative delay through this step.
 * - anchor: anchor_date ± this step's delay (direction-aware).
 * The due time is then clamped to >= now and snapped forward into the send
 * window (if one is configured).
 */
export function computeStepScheduledAt(params: {
  enrolledAt: Date;
  steps: SequenceStep[];
  stepIndex: number;
  schedule: SequenceSchedule;
  now?: Date;
}): string {
  const { enrolledAt, steps, stepIndex, schedule } = params;
  const now = params.now ?? new Date();

  let due: Date;
  if (schedule.timing_mode === "anchor" && schedule.anchor_date) {
    const anchor = new Date(schedule.anchor_date);
    const delayMs = (steps[stepIndex]?.delay_days || 0) * DAY_MS;
    due =
      schedule.anchor_direction === "before"
        ? new Date(anchor.getTime() - delayMs)
        : new Date(anchor.getTime() + delayMs);
  } else {
    const days = cumulativeDelayDays(steps, stepIndex);
    due = new Date(enrolledAt.getTime() + days * DAY_MS);
  }

  // Never schedule in the past, then respect the send window.
  const start = new Date(Math.max(due.getTime(), now.getTime()));
  return snapToSendWindow(start, schedule.send_window).toISOString();
}
