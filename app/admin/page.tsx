import { createClient } from "@/lib/supabase/server";
import { ActivityFeed } from "@/components/admin/activity-feed";
import {
  PipelineFunnelCard,
  type PipelineStage,
} from "@/components/admin/dashboard/pipeline-funnel-card";
import { KpiTile } from "@/components/admin/dashboard/kpi-tile";
import {
  EventFocusBanner,
  type UpcomingEvent,
} from "@/components/admin/dashboard/event-focus-banner";
import { ActionQueue, type ActionQueueCounts } from "@/components/admin/dashboard/action-queue";
import {
  SequencePerformance,
  type SequenceRow,
} from "@/components/admin/dashboard/sequence-performance";
import { ActiveEvents } from "@/components/admin/dashboard/active-events";
import { IcpDistribution, type IcpBucket } from "@/components/admin/dashboard/icp-distribution";
import {
  EnrichmentCoverage,
  type EnrichmentCoverageData,
} from "@/components/admin/dashboard/enrichment-coverage";
import {
  Target,
  Reply,
  MessagesSquare,
  Award,
  Sparkles,
} from "lucide-react";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface ReachKpis {
  total_persons: number;
  persons_reached: number;
  persons_replied: number;
  total_sent: number;
  total_replied: number;
  sent_7d: number;
  sent_24h: number;
  replied_7d: number;
  qualified_count: number;
}

const STAGE_VISUAL: Record<string, { label: string; color: string; textColor: string; order: number }> = {
  not_contacted:  { label: "Not Contacted", color: "bg-white/15",         textColor: "text-white/60",         order: 0 },
  draft:          { label: "Draft",         color: "bg-yellow-500",       textColor: "text-yellow-400",       order: 1 },
  scheduled:      { label: "Scheduled",     color: "bg-sky-500",          textColor: "text-sky-400",          order: 2 },
  sent:           { label: "Sent",          color: "bg-[var(--accent-indigo)]", textColor: "text-[var(--accent-indigo)]", order: 3 },
  opened:         { label: "Opened",        color: "bg-teal-400",         textColor: "text-teal-300",         order: 4 },
  replied:        { label: "Replied",       color: "bg-emerald-500",      textColor: "text-emerald-400",      order: 5 },
  bounced_failed: { label: "Bounced/Fail",  color: "bg-rose-500",         textColor: "text-rose-400",         order: 6 },
};

function buildPipelineStages(
  rows: { stage: string; count: number }[] | null,
): PipelineStage[] {
  const counts = new Map<string, number>(
    (rows || []).map((r) => [r.stage, Number(r.count) || 0]),
  );
  return Object.entries(STAGE_VISUAL)
    .sort(([, a], [, b]) => a.order - b.order)
    .map(([slug, meta]) => ({
      slug,
      label: meta.label,
      color: meta.color,
      textColor: meta.textColor,
      count: counts.get(slug) ?? 0,
    }));
}

function pct(num: number, den: number, digits = 1): string {
  if (!den) return "—";
  return `${((num / den) * 100).toFixed(digits)}%`;
}

export default async function DashboardPage() {
  const supabase = await createClient();

  const [
    pipelineRes,
    kpisRes,
    actionsRes,
    activeConvRes,
    sequencesRes,
    eventsRes,
    icpRes,
    enrichmentRes,
    recentLogsRes,
  ] = await Promise.all([
    supabase.rpc("pipeline_funnel_counts"),
    supabase.rpc("reach_kpis"),
    supabase.rpc("action_queue_counts"),
    supabase.rpc("active_conversations_count", { window_days: 14 }),
    supabase.rpc("sequence_performance_summary"),
    supabase.rpc("upcoming_events_summary", { p_limit: 6 }),
    supabase.rpc("icp_score_distribution"),
    supabase.rpc("enrichment_coverage"),
    supabase
      .from("job_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const pipelineStages = buildPipelineStages(
    pipelineRes.data as { stage: string; count: number }[] | null,
  );
  const kpis: ReachKpis = (kpisRes.data as ReachKpis) || {
    total_persons: 0,
    persons_reached: 0,
    persons_replied: 0,
    total_sent: 0,
    total_replied: 0,
    sent_7d: 0,
    sent_24h: 0,
    replied_7d: 0,
    qualified_count: 0,
  };
  const actionCounts: ActionQueueCounts = (actionsRes.data as ActionQueueCounts) || {
    drafts_pending: 0,
    scheduled_today: 0,
    failures: 0,
    unread_inbox: 0,
    replies_24h: 0,
    pending_correlations: 0,
  };
  const activeConversations = Number(activeConvRes.data ?? 0);
  const sequences = (sequencesRes.data as SequenceRow[]) || [];
  const events = (eventsRes.data as UpcomingEvent[]) || [];
  const icpBuckets = (icpRes.data as IcpBucket[]) || [];
  const enrichmentData = (enrichmentRes.data as EnrichmentCoverageData) || {
    persons: { total: 0, complete: 0, in_progress: 0, failed: 0, none: 0 },
    organizations: { total: 0, complete: 0, partial: 0, in_progress: 0, failed: 0, none: 0 },
  };

  const reachPct = pct(kpis.persons_reached, kpis.total_persons, 0);
  const replyRate = pct(kpis.total_replied, kpis.total_sent, 1);
  const qualifiedPct = pct(kpis.qualified_count, kpis.total_persons, 0);
  const personEnriched =
    (enrichmentData.persons.complete || 0) +
    (enrichmentData.persons.partial || 0);
  const enrichPct = pct(personEnriched, enrichmentData.persons.total, 0);

  const focusEvent = events[0] || null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex items-baseline justify-between gap-4">
        <div>
          <h1 className="font-[family-name:var(--font-heading)] text-2xl font-semibold text-white">
            Dashboard
          </h1>
          <p className="text-sm text-white/40 mt-0.5">
            Outreach health, at a glance.
          </p>
        </div>
        <p className="text-xs text-white/30 tabular-nums">
          {new Date().toLocaleString("en-US", {
            weekday: "short",
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })}
        </p>
      </header>

      {/* Event focus banner */}
      <EventFocusBanner event={focusEvent} />

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <KpiTile
          label="Reach"
          value={reachPct}
          icon={Target}
          accent="orange"
          hint={
            kpis.sent_24h > 0
              ? `${kpis.sent_24h.toLocaleString()} sent today`
              : kpis.sent_7d > 0
                ? `${kpis.sent_7d.toLocaleString()} this week`
                : "No sends this week"
          }
          hintAccent={kpis.sent_24h > 0 ? "orange" : "neutral"}
        />
        <KpiTile
          label="Reply rate"
          value={replyRate}
          icon={Reply}
          accent="emerald"
          hint={
            kpis.replied_7d > 0
              ? `${kpis.replied_7d.toLocaleString()} replies (7d)`
              : `${kpis.total_replied.toLocaleString()} total replies`
          }
          hintAccent={kpis.replied_7d > 0 ? "emerald" : "neutral"}
        />
        <KpiTile
          label="Active conversations"
          value={activeConversations.toLocaleString()}
          icon={MessagesSquare}
          accent="indigo"
          hint="Two-way email (14d)"
        />
        <KpiTile
          label="ICP qualified"
          value={kpis.qualified_count.toLocaleString()}
          icon={Award}
          accent="orange"
          hint={`${qualifiedPct} of pool`}
        />
        <KpiTile
          label="Enrichment"
          value={enrichPct}
          icon={Sparkles}
          accent="indigo"
          hint={`${personEnriched.toLocaleString()} of ${enrichmentData.persons.total.toLocaleString()} persons`}
        />
      </div>

      {/* Pipeline funnel + Action queue */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8">
          <PipelineFunnelCard stages={pipelineStages} />
        </div>
        <div className="lg:col-span-4">
          <ActionQueue counts={actionCounts} />
        </div>
      </div>

      {/* Sequences + Events */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SequencePerformance sequences={sequences} />
        <ActiveEvents events={events} />
      </div>

      {/* Recent activity + ICP + Enrichment */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className="glass rounded-xl p-6 lg:col-span-6 flex flex-col">
          <header className="flex items-baseline justify-between mb-4">
            <h2 className="font-[family-name:var(--font-heading)] text-lg font-semibold text-white">
              Recent activity
            </h2>
            <span className="text-xs text-white/40">
              Last {(recentLogsRes.data || []).length} jobs
            </span>
          </header>
          <ActivityFeed logs={recentLogsRes.data || []} />
        </section>
        <div className="lg:col-span-3">
          <IcpDistribution buckets={icpBuckets} />
        </div>
        <div className="lg:col-span-3">
          <EnrichmentCoverage data={enrichmentData} />
        </div>
      </div>
    </div>
  );
}
