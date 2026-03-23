import { describe, it, expect } from "vitest";
import {
  formatReplyNotification,
  formatBounceNotification,
  formatInteractionReplied,
  formatBatchStart,
  formatBatchProgress,
  formatBatchComplete,
  RateLimiter,
} from "../src/notifications.js";

describe("formatReplyNotification", () => {
  it("formats inbound email reply", () => {
    const result = formatReplyNotification(
      { full_name: "Alice Smith", id: "p1" },
      { name: "Acme Corp", icp_score: 85 },
      { subject: "Re: EthCC intro", body_preview: "Sounds great, let's chat!" }
    );
    expect(result).toContain("Alice Smith");
    expect(result).toContain("Acme Corp");
    expect(result).toContain("Re: EthCC intro");
    expect(result).toContain("Sounds great");
  });

  it("handles null org gracefully", () => {
    const result = formatReplyNotification(
      { full_name: "Bob", id: "p2" },
      null,
      { subject: null, body_preview: null }
    );
    expect(result).toContain("Bob");
    expect(result).toContain("Unknown");
  });
});

describe("formatBounceNotification", () => {
  it("formats bounce with contact and org", () => {
    const result = formatBounceNotification(
      { full_name: "Carol Lee", id: "p3" },
      { name: "DeFi Labs" },
      { from_address: "carol@defi.io", subject: "Re: Collab" }
    );
    expect(result).toContain("Carol Lee");
    expect(result).toContain("DeFi Labs");
    expect(result).toContain("Bounce");
  });
});

describe("formatBatchStart", () => {
  it("formats batch job start message", () => {
    const result = formatBatchStart("enrichment_full", 47);
    expect(result).toContain("47");
    expect(result).toContain("enrichment");
  });
});

describe("formatBatchProgress", () => {
  it("formats progress update", () => {
    const result = formatBatchProgress("enrichment_full", 23, 47);
    expect(result).toContain("23");
    expect(result).toContain("47");
  });
});

describe("formatBatchComplete", () => {
  it("formats completed job", () => {
    const result = formatBatchComplete("enrichment_full", 44, 3);
    expect(result).toContain("44");
    expect(result).toContain("3");
  });

  it("formats failed job", () => {
    const result = formatBatchComplete("enrichment_full", 0, 47, "API rate limit");
    expect(result).toContain("Failed");
    expect(result).toContain("API rate limit");
  });
});

describe("RateLimiter", () => {
  it("processes items in FIFO order", async () => {
    const results: string[] = [];
    const limiter = new RateLimiter(async (msg) => {
      results.push(msg);
    }, 10);

    limiter.enqueue("a");
    limiter.enqueue("b");
    limiter.enqueue("c");

    await new Promise((r) => setTimeout(r, 100));
    limiter.stop();

    expect(results).toEqual(["a", "b", "c"]);
  });

  it("collapses queue when exceeding 50 items", () => {
    const results: string[] = [];
    const limiter = new RateLimiter(async (msg) => {
      results.push(msg);
    }, 100_000);

    for (let i = 0; i < 55; i++) {
      limiter.enqueue(`item-${i}`);
    }

    expect(limiter.queueSize).toBeLessThanOrEqual(1);
    limiter.stop();
  });
});
