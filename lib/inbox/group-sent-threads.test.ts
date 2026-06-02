import { describe, it, expect } from "vitest";
import { normalizeSubject, groupSentThreads } from "@/lib/inbox/group-sent-threads";
import type { InboundEmailWithRelations } from "@/lib/inbox/group-threads";

// Minimal message factory — only the fields the grouper reads.
function msg(
  over: Partial<InboundEmailWithRelations> & { id: string }
): InboundEmailWithRelations {
  return {
    account_email: "wes@gofpblock.com",
    message_id: `m:${over.id}`,
    thread_id: null,
    direction: "outbound",
    from_address: "wes@gofpblock.com",
    from_name: "Wes",
    to_address: "prospect@acme.com",
    subject: "Intro",
    body_preview: "hi",
    body_html: "<p>hi</p>",
    received_at: "2026-05-01T10:00:00.000Z",
    is_read: true,
    person_id: null,
    correlated_interaction_id: null,
    correlation_type: null,
    raw_headers: null,
    created_at: "2026-05-01T10:00:00.000Z",
    person: null,
    organization: null,
    ...over,
  };
}

describe("normalizeSubject", () => {
  it("lowercases and trims", () => {
    expect(normalizeSubject("  Quick Intro  ")).toBe("quick intro");
  });
  it("strips a leading Re:", () => {
    expect(normalizeSubject("Re: Quick Intro")).toBe("quick intro");
  });
  it("strips repeated Re:/Fwd:/Fw: prefixes", () => {
    expect(normalizeSubject("Re: Fwd: Re: Quick Intro")).toBe("quick intro");
    expect(normalizeSubject("FW: Quick Intro")).toBe("quick intro");
  });
  it("returns empty string for null", () => {
    expect(normalizeSubject(null)).toBe("");
  });
});

describe("groupSentThreads", () => {
  it("merges a send and its reply when person + subject match", () => {
    const send = msg({
      id: "send1",
      direction: "outbound",
      person_id: "p1",
      to_address: "p1@acme.com",
      subject: "Quick Intro",
      received_at: "2026-05-01T10:00:00.000Z",
    });
    const reply = msg({
      id: "reply1",
      direction: "inbound",
      person_id: "p1",
      from_address: "p1@acme.com",
      to_address: "wes@gofpblock.com",
      subject: "Re: Quick Intro",
      is_read: false,
      received_at: "2026-05-01T12:00:00.000Z",
    });
    const threads = groupSentThreads([send, reply]);
    expect(threads).toHaveLength(1);
    expect(threads[0].message_count).toBe(2);
    expect(threads[0].inbound_count).toBe(1);
    expect(threads[0].outbound_count).toBe(1);
    expect(threads[0].is_unread).toBe(true);
  });

  it("keeps different subjects as separate threads for the same person", () => {
    const a = msg({ id: "a", person_id: "p1", subject: "Intro" });
    const b = msg({ id: "b", person_id: "p1", subject: "Pricing" });
    expect(groupSentThreads([a, b])).toHaveLength(2);
  });

  it("never merges across different persons", () => {
    const a = msg({ id: "a", person_id: "p1", subject: "Intro" });
    const b = msg({ id: "b", person_id: "p2", subject: "Intro" });
    expect(groupSentThreads([a, b])).toHaveLength(2);
  });

  it("groups multiple sends to the same person + subject into one thread", () => {
    const a = msg({ id: "a", person_id: "p1", subject: "Intro", received_at: "2026-05-01T10:00:00.000Z" });
    const b = msg({ id: "b", person_id: "p1", subject: "Re: Intro", received_at: "2026-05-03T10:00:00.000Z" });
    const threads = groupSentThreads([a, b]);
    expect(threads).toHaveLength(1);
    expect(threads[0].message_count).toBe(2);
  });

  it("falls back to counterparty email when person_id is null", () => {
    const send = msg({ id: "s", person_id: null, to_address: "x@acme.com", subject: "Intro" });
    const reply = msg({
      id: "r",
      direction: "inbound",
      person_id: null,
      from_address: "x@acme.com",
      subject: "Re: Intro",
    });
    expect(groupSentThreads([send, reply])).toHaveLength(1);
  });

  it("sorts threads newest-first by latest message", () => {
    const old = msg({ id: "old", person_id: "p1", subject: "A", received_at: "2026-05-01T10:00:00.000Z" });
    const recent = msg({ id: "new", person_id: "p2", subject: "B", received_at: "2026-05-09T10:00:00.000Z" });
    const threads = groupSentThreads([old, recent]);
    expect(threads[0].id).toContain("p2");
  });
});
