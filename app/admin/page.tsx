import { createClient } from "@/lib/supabase/server";
import { SummaryCards } from "@/components/admin/summary-cards";
import { ActivityFeed } from "@/components/admin/activity-feed";
import Link from "next/link";

export default async function DashboardPage() {
  const supabase = await createClient();

  const [
    { count: contactCount },
    { count: companyCount },
    { data: messageCounts },
    { data: recentLogs },
  ] = await Promise.all([
    supabase.from("contacts").select("*", { count: "exact", head: true }),
    supabase.from("companies").select("*", { count: "exact", head: true }),
    supabase.rpc("message_status_counts"),
    supabase
      .from("job_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  // Fallback if RPC not set up yet — count manually
  const statusCounts: Record<string, number> = {};
  if (messageCounts) {
    for (const row of messageCounts as { status: string; count: number }[]) {
      statusCounts[row.status] = row.count;
    }
  }

  const cards = [
    { label: "Contacts", value: contactCount || 0 },
    { label: "Companies", value: companyCount || 0 },
    { label: "Drafts", value: statusCounts["draft"] || 0, color: "text-yellow-400" },
    { label: "Scheduled", value: statusCounts["scheduled"] || 0, color: "text-blue-400" },
    { label: "Sent", value: statusCounts["sent"] || 0, color: "text-green-400" },
    { label: "Replied", value: statusCounts["replied"] || 0, color: "text-emerald-400" },
    { label: "Bounced", value: statusCounts["bounced"] || 0, color: "text-red-400" },
    { label: "Failed", value: statusCounts["failed"] || 0, color: "text-red-500" },
  ];

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">Dashboard</h1>

      <SummaryCards cards={cards} />

      <div className="flex gap-3">
        <Link
          href="/admin/queue"
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded text-sm font-medium transition-colors"
        >
          Review Drafts
        </Link>
      </div>

      <div>
        <h2 className="text-lg font-medium mb-3">Recent Activity</h2>
        <ActivityFeed logs={recentLogs || []} />
      </div>
    </div>
  );
}
