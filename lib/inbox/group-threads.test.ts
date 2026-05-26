import { describe, it, expect } from "vitest";
import { groupIntoThreads, type InboundEmailWithRelations } from "./group-threads";

// Minimal message factory. Defaults model an inbound reply from a prospect to JB.
let seq = 0;
function msg(
  over: Partial<InboundEmailWithRelations> = {}
): InboundEmailWithRelations {
  seq += 1;
  return {
    id: `e${seq}`,
    account_email: "jb@gofpblock.com",
    message_id: `m${seq}`,
    thread_id: null,
    direction: "inbound",
    from_address: "prospect@example.com",
    from_name: "Prospect",
    to_address: "jb@gofpblock.com",
    subject: "Consensus Miami Dinner",
    body_preview: "hi",
    body_html: null,
    received_at: `2026-05-01T0${seq % 9}:00:00.000Z`,
    is_read: true,
    person_id: null,
    correlated_interaction_id: null,
    correlation_type: null,
    raw_headers: null,
    created_at: "2026-05-01T00:00:00.000Z",
    person: null,
    organization: null,
    ...over,
  };
}

describe("groupIntoThreads", () => {
  it("splits a subject-merged Fastmail thread into one thread per counterparty", () => {
    // Fastmail collapses a bulk cold-outreach blast (identical subject) into a
    // single threadId even though each reply is a distinct 1:1 conversation.
    const threads = groupIntoThreads([
      msg({ thread_id: "BLAST", from_address: "arthur@gcr.com" }),
      msg({ thread_id: "BLAST", from_address: "parker@fightapp.com" }),
      msg({ thread_id: "BLAST", from_address: "alex@trmlabs.com" }),
    ]);

    expect(threads).toHaveLength(3);
    // Each resulting thread has exactly one external counterparty.
    for (const t of threads) {
      const externalParties = new Set(
        t.messages.map((m) =>
          m.direction === "inbound" ? m.from_address : m.to_address
        )
      );
      expect(externalParties.size).toBe(1);
    }
  });

  it("keeps a genuine 1:1 exchange (our send + their reply) as a single thread", () => {
    const threads = groupIntoThreads([
      msg({
        thread_id: "T1",
        direction: "outbound",
        from_address: "jb@gofpblock.com",
        to_address: "arthur@gcr.com",
      }),
      msg({ thread_id: "T1", from_address: "arthur@gcr.com" }),
    ]);

    expect(threads).toHaveLength(1);
    expect(threads[0].message_count).toBe(2);
    expect(threads[0].inbound_count).toBe(1);
    expect(threads[0].outbound_count).toBe(1);
  });

  it("does not merge distinct counterparties even when one party also appears outbound", () => {
    // JB emails both Arthur and Parker under the same blast thread, and both reply.
    const threads = groupIntoThreads([
      msg({
        thread_id: "BLAST",
        direction: "outbound",
        from_address: "jb@gofpblock.com",
        to_address: "arthur@gcr.com",
      }),
      msg({ thread_id: "BLAST", from_address: "arthur@gcr.com" }),
      msg({
        thread_id: "BLAST",
        direction: "outbound",
        from_address: "jb@gofpblock.com",
        to_address: "parker@fightapp.com",
      }),
      msg({ thread_id: "BLAST", from_address: "parker@fightapp.com" }),
    ]);

    expect(threads).toHaveLength(2);
    for (const t of threads) {
      expect(t.message_count).toBe(2);
    }
  });

  it("treats rows without a thread_id as their own thread of one", () => {
    const threads = groupIntoThreads([
      msg({ thread_id: null, from_address: "a@x.com" }),
      msg({ thread_id: null, from_address: "b@x.com" }),
    ]);
    expect(threads).toHaveLength(2);
  });
});
