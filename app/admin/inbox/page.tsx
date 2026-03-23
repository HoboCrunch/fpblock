import { createClient } from "@/lib/supabase/server";
import type { InboundEmail, InboxSyncState } from "@/lib/types/database";
import { InboxClient } from "./inbox-client";

export default async function InboxPage() {
  const supabase = await createClient();

  const [{ data: syncStates }, { data: emails }] = await Promise.all([
    supabase
      .from("inbox_sync_state")
      .select("*")
      .order("account_email", { ascending: true }),
    supabase
      .from("inbound_emails")
      .select(
        "*, person:persons(id, full_name, email)"
      )
      .order("received_at", { ascending: false })
      .limit(200),
  ]);

  // Collect person_ids from emails that have a linked person
  const personIds = (emails || [])
    .map((e: { person_id: string | null }) => e.person_id)
    .filter((id): id is string => id !== null);

  // Fetch primary organization for each linked person
  let orgMap: Record<string, { id: string; name: string; icp_score: number | null }> = {};

  if (personIds.length > 0) {
    const uniquePersonIds = [...new Set(personIds)];
    const { data: personOrgs } = await supabase
      .from("person_organization")
      .select("person_id, organization:organizations(id, name, icp_score)")
      .in("person_id", uniquePersonIds)
      .eq("is_primary", true);

    if (personOrgs) {
      for (const po of personOrgs) {
        const org = po.organization as unknown as { id: string; name: string; icp_score: number | null } | null;
        if (org && po.person_id) {
          orgMap[po.person_id] = org;
        }
      }
    }
  }

  // Attach organization data to each email
  const emailsWithOrgs = (emails || []).map((email: InboundEmailWithRelations) => ({
    ...email,
    organization: email.person_id ? orgMap[email.person_id] || null : null,
  }));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold font-[family-name:var(--font-heading)]">
        Inbox
      </h1>

      <InboxClient
        initialSyncStates={(syncStates as InboxSyncState[]) || []}
        initialEmails={emailsWithOrgs as InboundEmailWithRelations[]}
      />
    </div>
  );
}

export type InboundEmailWithRelations = InboundEmail & {
  person: { id: string; full_name: string; email: string | null } | null;
  organization?: { id: string; name: string; icp_score: number | null } | null;
};
