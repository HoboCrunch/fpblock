import { describe, it, expect } from "vitest";
import { buildInteractionPayload, type SendLogEntry } from "./build-interaction";

const entry: SendLogEntry = {
  ts: "2026-05-01T10:00:00.000Z",
  person_id: "p1",
  full_name: "Alice",
  email: "alice@example.com",
  to_actual: "alice@example.com",
  sender: "wes@gofpblock.com",
  subject: "Hi Alice",
  status: "success",
  messageId: "msg-1",
  dry_run: false,
};

describe("buildInteractionPayload", () => {
  it("returns a row tagged with source=script_backfill and the message-id", () => {
    const row = buildInteractionPayload(entry, {
      sourceLog: "send_log.jsonl",
      sourceCsv: "consensus/outreach_messages.csv",
      body: "Body text",
      senderProfileId: "sp-1",
    });
    expect(row).toMatchObject({
      person_id: "p1",
      interaction_type: "cold_email",
      channel: "email",
      direction: "outbound",
      status: "sent",
      occurred_at: "2026-05-01T10:00:00.000Z",
      subject: "Hi Alice",
      body: "Body text",
      sender_profile_id: "sp-1",
      detail: {
        sendgrid_message_id: "msg-1",
        source: "script_backfill",
        source_log: "send_log.jsonl",
        source_csv: "consensus/outreach_messages.csv",
      },
    });
  });

  it("omits sender_profile_id when null and uses null body / source_csv when not supplied", () => {
    const row = buildInteractionPayload(entry, {
      sourceLog: "send_log.jsonl",
      sourceCsv: null,
      body: null,
      senderProfileId: null,
    });
    expect(row.body).toBeNull();
    expect(row.sender_profile_id).toBeNull();
    expect(row.detail).toMatchObject({ source_csv: null });
  });
});
