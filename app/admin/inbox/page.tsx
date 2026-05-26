import { createClient } from "@/lib/supabase/server";
import type { InboxSyncState } from "@/lib/types/database";
import { InboxClient } from "./inbox-client";
import { groupIntoThreads } from "@/lib/inbox/group-threads";
import type {
  InboundEmailWithRelations,
  OrgRef,
} from "@/lib/inbox/group-threads";

// Re-exported so existing `import { … } from "./page"` consumers keep working.
export type {
  InboundEmailWithRelations,
  OrgRef,
  Participant,
  Thread,
} from "@/lib/inbox/group-threads";

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

  const orgMap: Record<string, OrgRef> = {};
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

