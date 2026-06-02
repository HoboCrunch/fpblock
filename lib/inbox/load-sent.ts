// lib/inbox/load-sent.ts — load one page of the inbox "Sent" view: merge
// SendGrid/outreach sends (interactions) with inbox sends + replies
// (inbound_emails), dedup, and group into threads.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  groupSentThreads,
  normalizeSubject,
} from "@/lib/inbox/group-sent-threads";
import {
  isReconciledFromInbox,
  normalizeInteractionToMessage,
  type SentInteractionRow,
} from "@/lib/inbox/sent-message";
import {
  counterpartyOf,
  type InboundEmailWithRelations,
  type Thread,
} from "@/lib/inbox/group-threads";

const SEND_STATUSES = [
  "sent",
  "delivered",
  "opened",
  "clicked",
  "replied",
  "bounced",
];

export interface LoadSentOptions {
  cursor?: string | null; // ISO timestamp; return sends strictly older than this
  limit?: number; // number of outbound anchors per page
  q?: string | null; // recipient/subject search
}

export interface SentPage {
  threads: Thread[];
  nextCursor: string | null;
}

export async function loadSentPage(
  supabase: SupabaseClient,
  opts: LoadSentOptions = {}
): Promise<SentPage> {
  const limit = opts.limit ?? 50;

  // 1) SendGrid/outreach sends from interactions (exclude inbox-reconciled dupes).
  let interactionsQuery = supabase
    .from("interactions")
    .select(
      "id, person_id, subject, body, occurred_at, status, detail, persons(id, full_name, email), sender_profiles(email, name)"
    )
    .eq("channel", "email")
    .in("status", SEND_STATUSES)
    .is("detail->>inbound_emails_id", null)
    .not("occurred_at", "is", null)
    .order("occurred_at", { ascending: false })
    .limit(limit);
  if (opts.cursor) interactionsQuery = interactionsQuery.lt("occurred_at", opts.cursor);
  if (opts.q) {
    interactionsQuery = interactionsQuery.ilike("subject", `%${opts.q}%`);
  }

  // 2) Inbox sends from inbound_emails (the composer/Fastmail sends, richer copy).
  let outboundQuery = supabase
    .from("inbound_emails")
    .select("*, person:persons(id, full_name, email)")
    .eq("direction", "outbound")
    .order("received_at", { ascending: false })
    .limit(limit);
  if (opts.cursor) outboundQuery = outboundQuery.lt("received_at", opts.cursor);
  if (opts.q) outboundQuery = outboundQuery.ilike("subject", `%${opts.q}%`);

  const [{ data: interRows, error: interErr }, { data: outRows, error: outErr }] =
    await Promise.all([interactionsQuery, outboundQuery]);
  if (interErr) throw new Error(`interactions query: ${interErr.message}`);
  if (outErr) throw new Error(`inbound_emails query: ${outErr.message}`);

  const sendMessages: InboundEmailWithRelations[] = [];
  for (const r of (interRows ?? []) as unknown as SentInteractionRow[]) {
    if (isReconciledFromInbox(r.detail)) continue; // belt-and-suspenders dedup
    sendMessages.push(normalizeInteractionToMessage(r));
  }
  for (const r of (outRows ?? []) as unknown as InboundEmailWithRelations[]) {
    sendMessages.push({ ...r, source: "inbox" });
  }

  // Dedup a send that appears in both sources (same person/subject within a
  // minute), preferring the inbox copy (richer body/threading). Then sort
  // newest-first and take this page's anchors.
  const byKey = new Map<string, InboundEmailWithRelations>();
  for (const m of sendMessages) {
    const party = m.person_id ?? counterpartyOf(m) ?? "?";
    const minute = m.received_at
      ? new Date(m.received_at).toISOString().slice(0, 16)
      : m.id;
    const key = `${party}|${normalizeSubject(m.subject)}|${minute}`;
    const existing = byKey.get(key);
    if (!existing || (m.source === "inbox" && existing.source !== "inbox")) {
      byKey.set(key, m);
    }
  }
  const dedupedSends = [...byKey.values()].sort(
    (a, b) =>
      new Date(b.received_at).getTime() - new Date(a.received_at).getTime()
  );
  const anchors = dedupedSends.slice(0, limit);
  const nextCursor =
    anchors.length === limit ? anchors[anchors.length - 1].received_at : null;

  // 3) Pull replies for the anchors, scoped to the (party, subject) threads on
  // THIS page — so a reply never orphans onto a page whose matching send is
  // absent (which would duplicate the reply and collide thread ids across pages).
  const anchorKey = (m: InboundEmailWithRelations) =>
    `${m.person_id ?? counterpartyOf(m) ?? "?"}|${normalizeSubject(m.subject)}`;
  const anchorKeys = new Set(anchors.map(anchorKey));
  const personIds = [
    ...new Set(
      anchors.map((m) => m.person_id).filter((id): id is string => Boolean(id))
    ),
  ];
  let replies: InboundEmailWithRelations[] = [];
  if (personIds.length > 0) {
    const { data: replyRows, error: replyErr } = await supabase
      .from("inbound_emails")
      .select("*, person:persons(id, full_name, email)")
      .eq("direction", "inbound")
      .in("person_id", personIds);
    if (replyErr) throw new Error(`replies query: ${replyErr.message}`);
    replies = (
      (replyRows ?? []) as unknown as InboundEmailWithRelations[]
    ).filter((r) => anchorKeys.has(anchorKey(r)));
  }

  const threads = groupSentThreads([...anchors, ...replies]);
  return { threads, nextCursor };
}
