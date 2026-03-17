import { createClient } from "@/lib/supabase/server";
import { Tabs } from "@/components/ui/tabs";
import { MessageTable } from "@/components/admin/message-table";

export default async function QueuePage() {
  const supabase = await createClient();

  const [
    { data: drafts },
    { data: scheduled },
    { data: recentSent },
    { data: failed },
  ] = await Promise.all([
    supabase
      .from("messages")
      .select("*, contact:contacts(id, full_name), company:companies(id, name)")
      .eq("status", "draft")
      .order("created_at", { ascending: false }),
    supabase
      .from("messages")
      .select("*, contact:contacts(id, full_name), company:companies(id, name)")
      .eq("status", "scheduled")
      .order("scheduled_at", { ascending: true }),
    supabase
      .from("messages")
      .select("*, contact:contacts(id, full_name), company:companies(id, name)")
      .in("status", ["sent", "opened", "replied", "bounced"])
      .order("sent_at", { ascending: false })
      .limit(100),
    supabase
      .from("messages")
      .select("*, contact:contacts(id, full_name), company:companies(id, name)")
      .eq("status", "failed")
      .order("created_at", { ascending: false }),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Message Queue</h1>

      <Tabs
        tabs={[
          {
            id: "drafts",
            label: `Drafts (${drafts?.length || 0})`,
            content: <MessageTable messages={drafts || []} />,
          },
          {
            id: "scheduled",
            label: `Scheduled (${scheduled?.length || 0})`,
            content: <MessageTable messages={scheduled || []} />,
          },
          {
            id: "sent",
            label: `Recently Sent (${recentSent?.length || 0})`,
            content: <MessageTable messages={recentSent || []} />,
          },
          {
            id: "failed",
            label: `Failed (${failed?.length || 0})`,
            content: <MessageTable messages={failed || []} />,
          },
        ]}
      />
    </div>
  );
}
