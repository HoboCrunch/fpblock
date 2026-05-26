import type { InteractionStatus } from "@/lib/types/database";

export type Action =
  | "approve"
  | "approve_at"
  | "reject"
  | "reschedule"
  | "cancel"
  | "retry"
  | "edit"
  | "resend";

export interface BuildOpts {
  /** Caller-requested time (approve_at, reschedule, retry). */
  scheduledAt?: string;
  /** The row's current scheduled_at — lets `approve` preserve a planned drip time. */
  existingScheduledAt?: string | null;
  reason?: string;
  body?: string;
  subject?: string;
}

export type BuildResult =
  | { ok: true; payload: Record<string, unknown> }
  | { ok: false; error: string; code: number };

export const TERMINAL_STATUSES: readonly InteractionStatus[] = [
  "sent",
  "delivered",
  "opened",
  "clicked",
  "replied",
  "bounced",
];

/**
 * Map (action, currentStatus) → update payload, or an error.
 *
 * Server-side state machine for the message queue. Never resurrects a sent or
 * replied message, and keeps "reject" (an intentional human decision) distinct
 * from "failed"/"bounced" (delivery problems) by routing it to its own status.
 */
export function buildUpdate(
  action: Action,
  status: InteractionStatus,
  opts: BuildOpts = {}
): BuildResult {
  const { scheduledAt, existingScheduledAt, reason } = opts;

  switch (action) {
    case "approve": {
      if (status !== "draft") {
        return { ok: false, error: `Cannot approve from status "${status}"`, code: 409 };
      }
      // Preserve a future planned time (later steps keep their drip cadence);
      // otherwise honor a requested time, else send immediately.
      const planned = existingScheduledAt ? Date.parse(existingScheduledAt) : NaN;
      const at =
        !Number.isNaN(planned) && planned > Date.now()
          ? new Date(planned).toISOString()
          : scheduledAt ?? new Date().toISOString();
      return { ok: true, payload: { status: "scheduled", scheduled_at: at } };
    }
    case "approve_at": {
      if (status !== "draft") {
        return { ok: false, error: `Cannot approve from status "${status}"`, code: 409 };
      }
      if (!scheduledAt) {
        return { ok: false, error: "scheduled_at required", code: 400 };
      }
      const ts = Date.parse(scheduledAt);
      if (Number.isNaN(ts)) {
        return { ok: false, error: "Invalid scheduled_at", code: 400 };
      }
      if (ts <= Date.now() - 60_000) {
        return { ok: false, error: "scheduled_at must be in the future", code: 400 };
      }
      return {
        ok: true,
        payload: { status: "scheduled", scheduled_at: new Date(ts).toISOString() },
      };
    }
    case "reschedule": {
      if (status !== "scheduled" && status !== "draft" && status !== "failed") {
        return { ok: false, error: `Cannot reschedule from status "${status}"`, code: 409 };
      }
      if (!scheduledAt) {
        return { ok: false, error: "scheduled_at required", code: 400 };
      }
      const ts = Date.parse(scheduledAt);
      if (Number.isNaN(ts) || ts <= Date.now() - 60_000) {
        return { ok: false, error: "scheduled_at must be a valid future timestamp", code: 400 };
      }
      return {
        ok: true,
        payload: { status: "scheduled", scheduled_at: new Date(ts).toISOString() },
      };
    }
    case "cancel": {
      if (status !== "scheduled") {
        return { ok: false, error: `Cannot cancel from status "${status}"`, code: 409 };
      }
      return { ok: true, payload: { status: "draft", scheduled_at: null } };
    }
    case "reject": {
      if (status !== "draft" && status !== "scheduled") {
        return { ok: false, error: `Cannot reject from status "${status}"`, code: 409 };
      }
      return {
        ok: true,
        payload: {
          status: "rejected",
          scheduled_at: null,
          detail: { rejected: true, reason: reason ?? "rejected" },
        },
      };
    }
    case "retry":
    case "resend": {
      if (status !== "failed" && status !== "bounced") {
        return { ok: false, error: `Cannot retry from status "${status}"`, code: 409 };
      }
      const when = scheduledAt
        ? new Date(Date.parse(scheduledAt)).toISOString()
        : new Date(Date.now() + 5 * 60 * 1000).toISOString();
      return { ok: true, payload: { status: "scheduled", scheduled_at: when } };
    }
    case "edit": {
      if (TERMINAL_STATUSES.includes(status)) {
        return { ok: false, error: "Cannot edit a sent message", code: 409 };
      }
      const out: Record<string, unknown> = {};
      if (opts.body !== undefined) out.body = opts.body;
      if (opts.subject !== undefined) out.subject = opts.subject;
      if (Object.keys(out).length === 0) {
        return { ok: false, error: "No fields to update", code: 400 };
      }
      return { ok: true, payload: out };
    }
    default:
      return { ok: false, error: "Invalid action", code: 400 };
  }
}
