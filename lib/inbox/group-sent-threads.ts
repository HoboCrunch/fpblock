// lib/inbox/group-sent-threads.ts — group outbound messages (SendGrid sends +
// inbox sends) and their replies into threads for the inbox "Sent" view.
//
// Unlike the inbox grouper (which keys on Fastmail thread_id + counterparty),
// SendGrid sends have no thread_id, so we key on the correlated person (or the
// counterparty email when uncorrelated) plus the normalized subject. This lets a
// send and its reply land in one thread even across the two data sources.

import {
  assembleThread,
  counterpartyOf,
  type InboundEmailWithRelations,
  type Thread,
} from "@/lib/inbox/group-threads";

/** Lowercase, trim, and strip repeated Re:/Fwd:/Fw: prefixes for thread keying. */
export function normalizeSubject(subject: string | null): string {
  if (!subject) return "";
  return subject
    .replace(/^(\s*(re|fwd|fw)\s*:\s*)+/i, "")
    .trim()
    .toLowerCase();
}

export function groupSentThreads(
  messages: InboundEmailWithRelations[]
): Thread[] {
  const buckets = new Map<string, InboundEmailWithRelations[]>();
  for (const m of messages) {
    const party = m.person_id ?? counterpartyOf(m) ?? "?";
    const key = `${party}|${normalizeSubject(m.subject)}`;
    const existing = buckets.get(key);
    if (existing) existing.push(m);
    else buckets.set(key, [m]);
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
