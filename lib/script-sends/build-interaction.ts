export interface SendLogEntry {
  ts: string;
  person_id: string;
  full_name: string;
  email: string;
  to_actual: string;
  sender: string;
  subject: string;
  status: "success" | "failure";
  messageId?: string;
  error?: string;
  dry_run?: boolean;
}

export interface BuildOptions {
  sourceLog: string;
  sourceCsv: string | null;
  body: string | null;
  senderProfileId: string | null;
  source?: "script_backfill" | "script_send";
}

export interface InteractionInsert {
  person_id: string;
  interaction_type: "cold_email";
  channel: "email";
  direction: "outbound";
  status: "sent";
  occurred_at: string;
  subject: string;
  body: string | null;
  sender_profile_id: string | null;
  detail: {
    sendgrid_message_id: string | null;
    source: "script_backfill" | "script_send";
    source_log: string;
    source_csv: string | null;
  };
}

export function buildInteractionPayload(
  entry: SendLogEntry,
  opts: BuildOptions
): InteractionInsert {
  return {
    person_id: entry.person_id,
    interaction_type: "cold_email",
    channel: "email",
    direction: "outbound",
    status: "sent",
    occurred_at: entry.ts,
    subject: entry.subject,
    body: opts.body,
    sender_profile_id: opts.senderProfileId,
    detail: {
      sendgrid_message_id: entry.messageId ?? null,
      source: opts.source ?? "script_backfill",
      source_log: opts.sourceLog,
      source_csv: opts.sourceCsv,
    },
  };
}

/**
 * The skip-rules used both by the backfill and by any future
 * re-validation pass over the send log. Keep these in sync with the
 * existing exclusion logic in scripts/send-outreach.ts.
 */
export function isBackfillable(entry: SendLogEntry): boolean {
  if (entry.status !== "success") return false;
  if (entry.dry_run) return false;
  // Test-redirect: --test-to overrode the real recipient.
  if (entry.to_actual && entry.email && entry.to_actual !== entry.email) {
    return false;
  }
  if (!entry.person_id || !entry.subject || !entry.messageId) return false;
  return true;
}
