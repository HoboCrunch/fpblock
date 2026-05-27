import { describe, it, expect } from "vitest";
import { buildUpdate } from "./message-transitions";

const FUTURE = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
const PAST = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

describe("buildUpdate", () => {
  describe("approve", () => {
    it("preserves a future planned scheduled_at (drip cadence for later steps)", () => {
      const r = buildUpdate("approve", "draft", {
        existingScheduledAt: FUTURE,
      });
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.payload.status).toBe("scheduled");
        expect(r.payload.scheduled_at).toBe(FUTURE);
      }
    });

    it("sends now when the planned time is already in the past", () => {
      const before = Date.now();
      const r = buildUpdate("approve", "draft", { existingScheduledAt: PAST });
      expect(r.ok).toBe(true);
      if (r.ok) {
        const at = Date.parse(r.payload.scheduled_at as string);
        expect(at).toBeGreaterThanOrEqual(before);
      }
    });

    it("sends now when there is no planned time", () => {
      const r = buildUpdate("approve", "draft", {});
      expect(r.ok).toBe(true);
      if (r.ok) expect(typeof r.payload.scheduled_at).toBe("string");
    });

    it("rejects approving a non-draft", () => {
      const r = buildUpdate("approve", "scheduled", {});
      expect(r.ok).toBe(false);
    });
  });

  describe("reject", () => {
    it("moves a draft to the dedicated 'rejected' status (not 'failed')", () => {
      const r = buildUpdate("reject", "draft", { reason: "off-target" });
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.payload.status).toBe("rejected");
        expect(r.payload.scheduled_at).toBeNull();
        expect(r.payload.detail).toMatchObject({ rejected: true, reason: "off-target" });
      }
    });

    it("can reject a scheduled message", () => {
      const r = buildUpdate("reject", "scheduled", {});
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.payload.status).toBe("rejected");
    });

    it("cannot reject a sent message", () => {
      const r = buildUpdate("reject", "sent", {});
      expect(r.ok).toBe(false);
    });
  });

  describe("retry", () => {
    it("requeues a failed message", () => {
      const r = buildUpdate("retry", "failed", {});
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.payload.status).toBe("scheduled");
    });

    it("does not retry a rejected message (rejection is intentional)", () => {
      const r = buildUpdate("retry", "rejected", {});
      expect(r.ok).toBe(false);
    });
  });

  describe("cancel", () => {
    it("returns a scheduled message to draft", () => {
      const r = buildUpdate("cancel", "scheduled", {});
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.payload.status).toBe("draft");
      }
    });

    // FIX B — cancel must preserve a future planned send time so a later
    // re-approve does not fire a drip step early. Previously cancel set
    // scheduled_at: null, and approve then fell through to "send now".
    it("preserves the future planned scheduled_at when cancelling", () => {
      const r = buildUpdate("cancel", "scheduled", {
        existingScheduledAt: FUTURE,
      });
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.payload.status).toBe("draft");
        expect(r.payload.scheduled_at).toBe(FUTURE);
      }
    });
  });

  // FIX B — full round-trip: cancel a future-scheduled drip step, then
  // re-approve. It must remain scheduled for the original future time, not
  // jump to "send immediately".
  describe("cancel → approve round-trip", () => {
    it("re-approving a cancelled future step keeps the original time (not now)", () => {
      const cancel = buildUpdate("cancel", "scheduled", {
        existingScheduledAt: FUTURE,
      });
      expect(cancel.ok).toBe(true);
      if (!cancel.ok) return;

      // The cancelled row is now a draft carrying the preserved scheduled_at.
      const preserved = cancel.payload.scheduled_at as string | null;
      const approve = buildUpdate("approve", "draft", {
        existingScheduledAt: preserved,
      });
      expect(approve.ok).toBe(true);
      if (approve.ok) {
        expect(approve.payload.status).toBe("scheduled");
        expect(approve.payload.scheduled_at).toBe(FUTURE);
      }
    });
  });
});
