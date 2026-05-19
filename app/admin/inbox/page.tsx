import { createClient } from "@/lib/supabase/server";
import type { InboundEmail, InboxSyncState } from "@/lib/types/database";
import { InboxClient } from "./inbox-client";

export default async function InboxPage() {
  const supabase = await createClient();

  const [{ data: syncStates }, { data: rawEmails }] = await Promise.all([
    supabase
      .from("inbox_sync_state")
      .select("*")
      .order("account_email", { ascending: true }),
    supabase
      .from("inbound_emails")
      .select("*, person:persons(id, full_name, email)")
      .order("received_at", { ascending: false })
      .limit(800),
  ]);

  const emails = (rawEmails || []) as InboundEmailWithRelations[];

  // Attach primary organization to each linked person.
  const personIds = emails
    .map((e) => e.person_id)
    .filter((id): id is string => id !== null);

  let orgMap: Record<string, OrgRef> = {};
  if (personIds.length > 0) {
    const uniquePersonIds = [...new Set(personIds)];
    const { data: personOrgs } = await supabase
      .from("person_organization")
      .select("person_id, organization:organizations(id, name, icp_score)")
      .in("person_id", uniquePersonIds)
      .eq("is_primary", true);

    if (personOrgs) {
      for (const po of personOrgs) {
        const org = po.organization as unknown as OrgRef | null;
        if (org && po.person_id) orgMap[po.person_id] = org;
      }
    }
  }

  const emailsWithOrgs: InboundEmailWithRelations[] = emails.map((email) => ({
    ...email,
    organization: email.person_id ? orgMap[email.person_id] || null : null,
  }));

  // Group rows into threads. Rows without thread_id are their own thread of one
  // (keeps the UI working before the backfill runs).
  const threads = groupIntoThreads(emailsWithOrgs);

  const { data: personEmails } = await supabase
    .from("persons")
    .select("email")
    .not("email", "is", null);
  const knownEmails = new Set(
    (personEmails || [])
      .map((p: { email: string | null }) => p.email?.toLowerCase())
      .filter(Boolean)
  );

  return (
    <div className="space-y-6">
      <InboxClient
        initialSyncStates={(syncStates as InboxSyncState[]) || []}
        initialThreads={threads}
        knownPersonEmails={[...knownEmails] as string[]}
      />
    </div>
  );
}

function groupIntoThreads(emails: InboundEmailWithRelations[]): Thread[] {
  const buckets = new Map<string, InboundEmailWithRelations[]>();
  for (const e of emails) {
    const key = e.thread_id || `solo:${e.id}`;
    const existing = buckets.get(key);
    if (existing) existing.push(e);
    else buckets.set(key, [e]);
  }

  const threads: Thread[] = [];
  for (const [key, msgs] of buckets) {
    msgs.sort((a, b) =>
      new Date(a.received_at).getTime() - new Date(b.received_at).getTime()
    );
    const latest = msgs[msgs.length - 1];
    const firstInbound = msgs.find((m) => m.direction === "inbound") || latest;
    const subject =
      msgs.find((m) => m.subject)?.subject?.replace(/^(Re:\s*)+/i, "") || null;

    const inbound = msgs.filter((m) => m.direction === "inbound");
    const outbound = msgs.filter((m) => m.direction === "outbound");

    // Thread is "unread" if any inbound message is unread.
    const isUnread = inbound.some((m) => !m.is_read);

    // Pick the primary correlated person/org: prefer the latest inbound's
    // person, falling back to any message that has one.
    const correlatedSource =
      [...inbound].reverse().find((m) => m.person_id) ||
      msgs.find((m) => m.person_id) ||
      null;

    threads.push({
      id: key,
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
    });
  }
  threads.sort((a, b) =>
    new Date(b.latest_at).getTime() - new Date(a.latest_at).getTime()
  );
  return threads;
}

function collectParticipants(msgs: InboundEmailWithRelations[]): Participant[] {
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

export type OrgRef = {
  id: string;
  name: string;
  icp_score: number | null;
};

export type InboundEmailWithRelations = InboundEmail & {
  person: { id: string; full_name: string; email: string | null } | null;
  organization?: OrgRef | null;
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
