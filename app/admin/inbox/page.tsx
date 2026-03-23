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

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold font-[family-name:var(--font-heading)]">
        Inbox
      </h1>

      <InboxClient
        initialSyncStates={(syncStates as InboxSyncState[]) || []}
        initialEmails={(emails as InboundEmailWithRelations[]) || []}
      />
    </div>
  );
}

export type InboundEmailWithRelations = InboundEmail & {
  person: { id: string; full_name: string; email: string | null } | null;
  organization?: { id: string; name: string; icp_score: number | null } | null;
};
