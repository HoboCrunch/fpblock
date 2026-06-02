// lib/inbox/group-threads.ts — group inbound_emails rows into conversation threads
//
// Fastmail's JMAP `threadId` keys on normalized subject, so a bulk cold-outreach
// blast (identical subject to many recipients) collapses every reply into ONE
// Fastmail thread. For this CRM-style inbox a "conversation" is one external
// counterparty talking to one of our identities, so we sub-partition each
// Fastmail thread by the external counterparty's address. See group-threads.test.ts.

import type { InboundEmail } from "@/lib/types/database";

export type OrgRef = {
  id: string;
  name: string;
  icp_score: number | null;
};

export type InboundEmailWithRelations = InboundEmail & {
  person: { id: string; full_name: string; email: string | null } | null;
  organization?: OrgRef | null;
  // Set only for messages built for the Sent view. Optional so the inbox path
  // is unaffected. `source` distinguishes a SendGrid/outreach send from an
  // inbox/Fastmail send; `delivery_status` carries the raw interactions.status.
  source?: "sendgrid" | "inbox";
  delivery_status?: string | null;
};

export type Participant = {
  address: string;
  name: string | null;
};

export type Thread = {
  id: string;
  thread_id: string | null;
  subject: string | null;
  messages: InboundEmailWithRelations[];
  latest: InboundEmailWithRelations;
  first_inbound: InboundEmailWithRelations;
  participants: Participant[];
  message_count: number;
  inbound_count: number;
  outbound_count: number;
  is_unread: boolean;
  account_emails: string[];
  person_id: string | null;
  person: { id: string; full_name: string; email: string | null } | null;
  organization: OrgRef | null;
  latest_at: string;
};

/**
 * The "other party" of a message — whoever is not us. For inbound that's the
 * sender; for outbound it's the primary recipient. Lowercased for stable keying.
 */
export function counterpartyOf(m: InboundEmailWithRelations): string | null {
  const addr =
    m.direction === "inbound" ? m.from_address : m.to_address || m.from_address;
  return addr ? addr.toLowerCase() : null;
}

export function groupIntoThreads(emails: InboundEmailWithRelations[]): Thread[] {
  const buckets = new Map<string, InboundEmailWithRelations[]>();
  for (const e of emails) {
    const key = e.thread_id
      ? `${e.thread_id}::${counterpartyOf(e) ?? "?"}`
      : `solo:${e.id}`;
    const existing = buckets.get(key);
    if (existing) existing.push(e);
    else buckets.set(key, [e]);
  }

  const threads: Thread[] = [];
  for (const [key, msgs] of buckets) {
    threads.push(assembleThread(key, msgs));
  }
  threads.sort(
    (a, b) => new Date(b.latest_at).getTime() - new Date(a.latest_at).getTime()
  );
  return threads;
}

/**
 * Build a Thread from a bucket of messages that belong together. Shared by the
 * inbox grouper (keyed by Fastmail thread + counterparty) and the Sent grouper
 * (keyed by person + normalized subject).
 */
export function assembleThread(
  id: string,
  msgs: InboundEmailWithRelations[]
): Thread {
  msgs.sort(
    (a, b) =>
      new Date(a.received_at).getTime() - new Date(b.received_at).getTime()
  );
  const latest = msgs[msgs.length - 1];
  const firstInbound = msgs.find((m) => m.direction === "inbound") || latest;
  const subject =
    msgs.find((m) => m.subject)?.subject?.replace(/^(Re:\s*)+/i, "") || null;

  const inbound = msgs.filter((m) => m.direction === "inbound");
  const outbound = msgs.filter((m) => m.direction === "outbound");
  const isUnread = inbound.some((m) => !m.is_read);

  const correlatedSource =
    [...inbound].reverse().find((m) => m.person_id) ||
    msgs.find((m) => m.person_id) ||
    null;

  return {
    id,
    thread_id: latest.thread_id,
    subject,
    messages: msgs,
    latest,
    first_inbound: firstInbound,
    participants: collectParticipants(msgs),
    message_count: msgs.length,
    inbound_count: inbound.length,
    outbound_count: outbound.length,
    is_unread: isUnread,
    account_emails: [...new Set(msgs.map((m) => m.account_email))],
    person_id: correlatedSource?.person_id || null,
    person: correlatedSource?.person || null,
    organization: correlatedSource?.organization || null,
    latest_at: latest.received_at,
  };
}

export function collectParticipants(
  msgs: InboundEmailWithRelations[]
): Participant[] {
  const seen = new Map<string, Participant>();
  for (const m of msgs) {
    // For inbound, the "other party" is from_address. For outbound it's to_address.
    const addr =
      m.direction === "inbound" ? m.from_address : m.to_address || m.from_address;
    if (!addr) continue;
    const key = addr.toLowerCase();
    if (seen.has(key)) continue;
    seen.set(key, {
      address: addr,
      name: m.direction === "inbound" ? m.from_name : null,
    });
  }
  return [...seen.values()];
}
