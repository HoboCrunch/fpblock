import { describe, it, expect } from "vitest";
import {
  isReconciledFromInbox,
  normalizeInteractionToMessage,
  type SentInteractionRow,
} from "@/lib/inbox/sent-message";

function row(over: Partial<SentInteractionRow> & { id: string }): SentInteractionRow {
  return {
    person_id: "p1",
    subject: "Quick Intro",
    body: "<p>Hello there, this is the body.</p>",
    occurred_at: "2026-05-04T09:00:00.000Z",
    status: "sent",
    detail: null,
    persons: { id: "p1", full_name: "Ada Lovelace", email: "ada@acme.com" },
    sender_profiles: { email: "wes@gofpblock.com", name: "Wes" },
    ...over,
  };
}

describe("isReconciledFromInbox", () => {
  it("is true when detail carries an inbound_emails_id", () => {
    expect(isReconciledFromInbox({ inbound_emails_id: "abc" })).toBe(true);
  });
  it("is false for a native SendGrid send", () => {
    expect(isReconciledFromInbox({ sendgrid_message_id: "sg1" })).toBe(false);
  });
  it("is false for null detail", () => {
    expect(isReconciledFromInbox(null)).toBe(false);
  });
});

describe("normalizeInteractionToMessage", () => {
  it("maps an interaction send into an outbound message", () => {
    const m = normalizeInteractionToMessage(row({ id: "i1" }));
    expect(m.id).toBe("i1");
    expect(m.message_id).toBe("interaction:i1");
    expect(m.direction).toBe("outbound");
    expect(m.to_address).toBe("ada@acme.com");
    expect(m.from_address).toBe("wes@gofpblock.com");
    expect(m.body_html).toBe("<p>Hello there, this is the body.</p>");
    expect(m.received_at).toBe("2026-05-04T09:00:00.000Z");
    expect(m.person?.id).toBe("p1");
    expect(m.source).toBe("sendgrid");
    expect(m.delivery_status).toBe("sent");
    expect(m.thread_id).toBeNull();
  });

  it("derives a plain-text preview from HTML body", () => {
    const m = normalizeInteractionToMessage(
      row({ id: "i2", body: "<p>Hi <b>Ada</b>,</p><p>quick note.</p>" })
    );
    expect(m.body_preview).toBe("Hi Ada, quick note.");
  });

  it("tolerates a missing sender profile and missing person email", () => {
    const m = normalizeInteractionToMessage(
      row({ id: "i3", sender_profiles: null, persons: { id: "p1", full_name: null, email: null } })
    );
    expect(m.from_address).toBe("");
    expect(m.to_address).toBeNull();
    expect(m.person?.full_name).toBe("");
  });
});
