import { createClient } from "@/lib/supabase/server";
import { ActivityFeed } from "@/components/admin/activity-feed";
import { PipelineBar, type PipelineStage } from "@/components/admin/pipeline-bar";
import { StatCard } from "@/components/ui/stat-card";
import { GlassCard } from "@/components/ui/glass-card";
import { Users, Building2, MessageSquare, CheckCircle, Upload, Sparkles, FileText } from "lucide-react";
import Link from "next/link";

/** Status ordering for computing most advanced status per person. */
const STATUS_RANK: Record<string, number> = {
  failed: 0,
  bounced: 1,
  draft: 2,
  scheduled: 3,
  sending: 4,
  sent: 5,
  delivered: 6,
  opened: 7,
  replied: 8,
};

function statusToStage(status: string | null): string {
  if (!status) return "not_contacted";
  switch (status) {
    case "draft": return "draft";
    case "scheduled": return "scheduled";
    case "sending":
    case "sent":
    case "delivered": return "sent";
    case "opened": return "opened";
    case "replied": return "replied";
    case "bounced":
    case "failed": return "bounced_failed";
    default: return "not_contacted";
  }
}

export default async function DashboardPage() {
  const supabase = await createClient();

  const [
    { count: personCount },
    { count: orgCount },
    { data: interactionCounts },
    { data: recentLogs },
    { data: allPersons },
    { data: allInteractions },
  ] = await Promise.all([
    supabase.from("persons").select("*", { count: "exact", head: true }),
    supabase.from("organizations").select("*", { count: "exact", head: true }),
    supabase.rpc("interaction_status_counts"),
    supabase
      .from("job_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20),
    supabase.from("persons").select("id"),
    supabase.from("interactions").select("id, person_id, status"),
  ]);

  // Total interactions and replied count
  const statusCounts: Record<string, number> = {};
  if (interactionCounts) {
    for (const row of interactionCounts as { status: string; count: number }[]) {
      statusCounts[row.status] = Number(row.count);
    }
  }
  const totalInteractions = Object.values(statusCounts).reduce((s, v) => s + v, 0);
  const repliedCount = statusCounts["replied"] || 0;

  // Compute pipeline stages: for each person find most advanced interaction status
  const personIds = new Set((allPersons || []).map((p: { id: string }) => p.id));
  const interactionsByPerson = new Map<string, string[]>();
  if (allInteractions) {
    for (const interaction of allInteractions as { id: string; person_id: string; status: string }[]) {
      if (!interaction.person_id) continue;
      const existing = interactionsByPerson.get(interaction.person_id) || [];
      existing.push(interaction.status);
      interactionsByPerson.set(interaction.person_id, existing);
    }
  }

  const stageCounts: Record<string, number> = {
    not_contacted: 0,
    draft: 0,
    scheduled: 0,
    sent: 0,
    opened: 0,
    replied: 0,
    bounced_failed: 0,
  };

  for (const personId of personIds) {
    const statuses = interactionsByPerson.get(personId);
    if (!statuses || statuses.length === 0) {
      stageCounts.not_contacted++;
      continue;
    }
    let bestStatus: string | null = null;
    let bestRank = -1;
    for (const s of statuses) {
      const rank = STATUS_RANK[s] ?? -1;
      if (rank > bestRank) {
        bestRank = rank;
        bestStatus = s;
      }
    }
    const stage = statusToStage(bestStatus);
    stageCounts[stage] = (stageCounts[stage] || 0) + 1;
  }

  const pipelineStages: PipelineStage[] = [
    { label: "Not Contacted", count: stageCounts.not_contacted, color: "bg-gray-500", slug: "not_contacted" },
    { label: "Draft", count: stageCounts.draft, color: "bg-yellow-500", slug: "draft" },
    { label: "Scheduled", count: stageCounts.scheduled, color: "bg-blue-500", slug: "scheduled" },
    { label: "Sent", count: stageCounts.sent, color: "bg-green-500", slug: "sent" },
    { label: "Opened", count: stageCounts.opened, color: "bg-teal-400", slug: "opened" },
    { label: "Replied", count: stageCounts.replied, color: "bg-emerald-500", slug: "replied" },
    { label: "Bounced/Failed", count: stageCounts.bounced_failed, color: "bg-red-500", slug: "bounced_failed" },
  ];

  return (
    <div className="space-y-6">
      <h1 className="font-[family-name:var(--font-heading)] text-2xl font-semibold text-white">
        Dashboard
      </h1>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Persons"
          value={personCount || 0}
          icon={Users}
          accentColor="indigo"
        />
        <StatCard
          label="Organizations"
          value={orgCount || 0}
          icon={Building2}
          accentColor="indigo"
        />
        <StatCard
          label="Interactions"
          value={totalInteractions}
          icon={MessageSquare}
          accentColor="orange"
        />
        <StatCard
          label="Replied"
          value={repliedCount}
          icon={CheckCircle}
          accentColor="orange"
        />
      </div>

      {/* Pipeline funnel */}
      <PipelineBar stages={pipelineStages} />

      {/* Bottom 2-col grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Activity */}
        <GlassCard className="p-6">
          <h2 className="font-[family-name:var(--font-heading)] text-lg font-semibold text-white mb-4">
            Recent Activity
          </h2>
          <ActivityFeed logs={recentLogs || []} />
        </GlassCard>

        {/* Quick Actions */}
        <GlassCard className="p-6">
          <h2 className="font-[family-name:var(--font-heading)] text-lg font-semibold text-white mb-4">
            Quick Actions
          </h2>
          <div className="flex flex-col gap-3">
            <Link
              href="/admin/uploads"
              className="flex items-center gap-3 px-4 py-3 rounded-lg bg-white/[0.03] border border-white/[0.06] text-white/70 hover:bg-white/[0.06] hover:text-white hover:border-white/[0.12] transition-all duration-200"
            >
              <Upload className="w-5 h-5 text-[#f58327]" />
              <span className="text-sm font-medium">Upload CSV</span>
            </Link>
            <Link
              href="/admin/enrichment"
              className="flex items-center gap-3 px-4 py-3 rounded-lg bg-white/[0.03] border border-white/[0.06] text-white/70 hover:bg-white/[0.06] hover:text-white hover:border-white/[0.12] transition-all duration-200"
            >
              <Sparkles className="w-5 h-5 text-[#6e86ff]" />
              <span className="text-sm font-medium">Run Enrichment</span>
            </Link>
            <Link
              href="/admin/pipeline?stage=draft"
              className="flex items-center gap-3 px-4 py-3 rounded-lg bg-white/[0.03] border border-white/[0.06] text-white/70 hover:bg-white/[0.06] hover:text-white hover:border-white/[0.12] transition-all duration-200"
            >
              <FileText className="w-5 h-5 text-yellow-500" />
              <span className="text-sm font-medium">Review Drafts</span>
            </Link>
          </div>
        </GlassCard>
      </div>
    </div>
  );
}
