// lib/inbox/sent-message.ts — normalize an `interactions` email send into the
// InboundEmailWithRelations shape the inbox thread UI already renders, so the
// Sent view can show SendGrid/outreach sends alongside Fastmail sends + replies.

import type { InboundEmailWithRelations } from "@/lib/inbox/group-threads";

/** Shape of the `interactions` row selected by the Sent loader. */
export interface SentInteractionRow {
  id: string;
  person_id: string | null;
  subject: string | null;
  body: string | null;
  occurred_at: string | null;
  status: string;
  detail: Record<string, unknown> | null;
  persons: { id: string; full_name: string | null; email: string | null } | null;
  sender_profiles: { email: string; name: string | null } | null;
}

/**
 * True when this interaction was created by the outbound→interaction reconciler
 * from an `inbound_emails` row. Such rows are duplicates of an inbound_emails
 * send and must be excluded so the Sent view shows each message once.
 */
export function isReconciledFromInbox(
  detail: Record<string, unknown> | null
): boolean {
  return Boolean(detail && detail["inbound_emails_id"]);
}

function htmlToPreview(html: string | null): string {
  if (!html) return "";
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+([,.:;!?])/g, "$1")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 140);
}

export function normalizeInteractionToMessage(
  row: SentInteractionRow
): InboundEmailWithRelations {
  const senderEmail = row.sender_profiles?.email ?? "";
  const timestamp = row.occurred_at ?? "";
  return {
    id: row.id,
    account_email: senderEmail,
    message_id: `interaction:${row.id}`,
    thread_id: null,
    direction: "outbound",
    from_address: senderEmail,
    from_name: row.sender_profiles?.name ?? null,
    to_address: row.persons?.email ?? null,
    subject: row.subject,
    body_preview: htmlToPreview(row.body),
    body_html: row.body,
    received_at: timestamp,
    is_read: true,
    person_id: row.person_id,
    correlated_interaction_id: row.id,
    correlation_type: null,
    raw_headers: null,
    created_at: timestamp,
    person: row.persons
      ? {
          id: row.persons.id,
          full_name: row.persons.full_name ?? "",
          email: row.persons.email,
        }
      : null,
    organization: null,
    source: "sendgrid",
    delivery_status: row.status,
  };
}
