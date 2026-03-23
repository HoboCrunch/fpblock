import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { GlassCard } from "@/components/ui/glass-card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import {
  ArrowLeft,
  Building2,
  Sparkles,
  Zap,
  Users,
  UserPlus,
  Mail,
  Linkedin,
  Twitter,
  Clock,
  BarChart3,
} from "lucide-react";
import type { JobLog, Organization, OrganizationSignal } from "@/lib/types/database";
import {
  JobResultsClient,
  type ChildJobEntry,
  type OrgDetail,
  type OrgSignalEntry,
} from "./job-results-client";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function statusVariant(status: string): string {
  switch (status) {
    case "completed":
      return "sent";
    case "failed":
      return "failed";
    case "processing":
      return "processing";
    default:
      return "default";
  }
}

// ---------------------------------------------------------------------------
// Stat Card
// ---------------------------------------------------------------------------

function StatCard({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  accent?: "orange" | "indigo" | "green" | "blue";
}) {
  const accentColors = {
    orange: "text-[var(--accent-orange)]",
    indigo: "text-[var(--accent-indigo)]",
    green: "text-green-400",
    blue: "text-blue-400",
  };
  const accentBg = {
    orange: "bg-[var(--accent-orange)]/10",
    indigo: "bg-[var(--accent-indigo)]/10",
    green: "bg-green-500/10",
    blue: "bg-blue-500/10",
  };
  const color = accent ? accentColors[accent] : "text-white";
  const bg = accent ? accentBg[accent] : "bg-white/[0.06]";

  return (
    <GlassCard className="flex items-center gap-4">
      <div className={`${bg} rounded-lg p-2.5`}>
        <Icon className={`h-5 w-5 ${color}`} />
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-medium">
          {label}
        </div>
        <div className={`text-xl font-bold tabular-nums ${color}`}>{value}</div>
      </div>
    </GlassCard>
  );
}

// ICP Average indicator
function IcpAverageCard({ avg }: { avg: number | null }) {
  const color =
    avg == null
      ? "text-gray-400"
      : avg >= 90
        ? "text-green-400"
        : avg >= 75
          ? "text-yellow-400"
          : avg >= 50
            ? "text-orange-400"
            : "text-gray-400";
  const bg =
    avg == null
      ? "bg-gray-500/10"
      : avg >= 90
        ? "bg-green-500/10"
        : avg >= 75
          ? "bg-yellow-500/10"
          : avg >= 50
            ? "bg-orange-500/10"
            : "bg-gray-500/10";

  return (
    <GlassCard className="flex items-center gap-4">
      <div className={`${bg} rounded-lg p-2.5`}>
        <BarChart3 className={`h-5 w-5 ${color}`} />
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-medium">
          Avg ICP Score
        </div>
        <div className={`text-xl font-bold tabular-nums ${color}`}>
          {avg != null ? avg.toFixed(0) : "--"}
        </div>
      </div>
    </GlassCard>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function EnrichmentJobPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = await params;
  const supabase = await createClient();

  // 1. Fetch the parent job
  const { data: job } = await supabase
    .from("job_log")
    .select("*")
    .eq("id", jobId)
    .single();

  if (!job) notFound();

  const typedJob = job as JobLog;
  const meta = (typedJob.metadata ?? {}) as Record<string, unknown>;
  const isOrgJob = typedJob.job_type.includes("organization");

  // 2. Fetch child job entries
  const { data: rawChildren } = await supabase
    .from("job_log")
    .select("id, target_id, status, job_type, error, metadata, created_at")
    .or(
      `metadata->>parent_job_id.eq.${jobId},metadata->>batch_job_id.eq.${jobId}`
    )
    .order("created_at", { ascending: true })
    .limit(500);

  let childEntries: ChildJobEntry[] = (rawChildren as ChildJobEntry[]) ?? [];

  // Fallback: time-window based lookup if no parent/batch linked children
  if (childEntries.length === 0) {
    const jobDate = new Date(typedJob.created_at);
    const startTime = new Date(jobDate.getTime() - 5000).toISOString();
    const endTime = new Date(
      jobDate.getTime() + 30 * 60 * 1000
    ).toISOString();
    const targetTable = isOrgJob ? "organizations" : "contacts";
    const jobTypes = isOrgJob
      ? [
          "enrichment_full",
          "enrichment_apollo",
          "enrichment_perplexity",
          "enrichment_gemini",
          "enrichment_people_finder",
        ]
      : ["enrichment", "enrichment_apollo"];
    const orgIds =
      (meta.organization_ids as string[]) ?? (meta.org_ids as string[]) ?? null;

    let fallbackQuery = supabase
      .from("job_log")
      .select("id, target_id, status, job_type, error, metadata, created_at")
      .eq("target_table", targetTable)
      .in("job_type", jobTypes)
      .gte("created_at", startTime)
      .lte("created_at", endTime)
      .neq("id", jobId)
      .order("created_at", { ascending: true })
      .limit(500);

    if (orgIds && orgIds.length > 0) {
      fallbackQuery = fallbackQuery.in("target_id", orgIds);
    }

    const fallback = await fallbackQuery;
    if (fallback.data) {
      // Deduplicate by target_id, keeping the latest completed entry
      const byTarget = new Map<string, ChildJobEntry>();
      for (const fbEntry of fallback.data as ChildJobEntry[]) {
        if (!fbEntry.target_id) continue;
        const existing = byTarget.get(fbEntry.target_id);
        if (
          !existing ||
          (existing.status === "processing" && fbEntry.status !== "processing") ||
          new Date(fbEntry.created_at) > new Date(existing.created_at)
        ) {
          byTarget.set(fbEntry.target_id, fbEntry);
        }
      }
      childEntries = Array.from(byTarget.values());
    }
  }

  // 3. For org enrichment: fetch org details and signals
  let orgMap: Record<string, OrgDetail> = {};
  let signalsMap: Record<string, OrgSignalEntry[]> = {};

  if (isOrgJob && childEntries.length > 0) {
    const targetIds = childEntries
      .map((e) => e.target_id)
      .filter(Boolean) as string[];

    if (targetIds.length > 0) {
      const [orgRes, sigRes] = await Promise.all([
        supabase
          .from("organizations")
          .select(
            "id, name, description, context, usp, icp_score, icp_reason, website, category"
          )
          .in("id", targetIds),
        supabase
          .from("organization_signals")
          .select("id, organization_id, signal_type, description, date, source")
          .in("organization_id", targetIds)
          .order("date", { ascending: false }),
      ]);

      if (orgRes.data) {
        for (const org of orgRes.data as OrgDetail[]) {
          orgMap[org.id] = org;
        }
      }
      if (sigRes.data) {
        for (const sig of sigRes.data as OrgSignalEntry[]) {
          if (!signalsMap[sig.organization_id]) {
            signalsMap[sig.organization_id] = [];
          }
          signalsMap[sig.organization_id].push(sig);
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Compute stats
  // ---------------------------------------------------------------------------

  const totalProcessed = childEntries.length;
  const successCount = childEntries.filter((e) => e.status === "completed").length;
  const failedCount = childEntries.filter((e) => e.status === "failed").length;

  // Org-specific stats
  const totalSignals = isOrgJob
    ? childEntries.reduce((sum, e) => {
        const m = (e.metadata ?? {}) as Record<string, unknown>;
        return (
          sum +
          ((m.signals_created as number) ??
            (m.signal_count as number) ??
            (e.target_id ? (signalsMap[e.target_id]?.length ?? 0) : 0))
        );
      }, 0)
    : 0;

  const icpScores = isOrgJob
    ? childEntries
        .map((e) => {
          const m = (e.metadata ?? {}) as Record<string, unknown>;
          const score =
            (m.icp_score as number | undefined) ??
            (e.target_id ? orgMap[e.target_id]?.icp_score : null) ??
            null;
          return score;
        })
        .filter((s): s is number => s != null)
    : [];
  const avgIcp =
    icpScores.length > 0
      ? icpScores.reduce((a, b) => a + b, 0) / icpScores.length
      : null;

  // Person-specific stats
  const personStats = !isOrgJob
    ? childEntries.reduce(
        (acc, e) => {
          const m = (e.metadata ?? {}) as Record<string, unknown>;
          if (m.email_found ?? m.email) acc.emails++;
          if (m.linkedin_found ?? m.linkedin_url) acc.linkedin++;
          if (m.twitter_found ?? m.twitter_handle) acc.twitter++;
          return acc;
        },
        { emails: 0, linkedin: 0, twitter: 0 }
      )
    : null;

  // People finder stats (org enrichment only)
  const peopleFinderStats = isOrgJob
    ? {
        found: (meta.people_found as number) ?? childEntries.reduce((sum, e) => {
          const m = (e.metadata ?? {}) as Record<string, unknown>;
          const pf = m.people_finder as Record<string, number> | undefined;
          return sum + (pf?.found ?? (m.found as number) ?? 0);
        }, 0),
        created: (meta.people_created as number) ?? childEntries.reduce((sum, e) => {
          const m = (e.metadata ?? {}) as Record<string, unknown>;
          const pf = m.people_finder as Record<string, number> | undefined;
          return sum + (pf?.created ?? (m.created as number) ?? 0);
        }, 0),
        merged: (meta.people_merged as number) ?? childEntries.reduce((sum, e) => {
          const m = (e.metadata ?? {}) as Record<string, unknown>;
          const pf = m.people_finder as Record<string, number> | undefined;
          return sum + (pf?.merged ?? (m.merged as number) ?? 0);
        }, 0),
      }
    : null;
  const hasPeopleFinderStats = peopleFinderStats && (peopleFinderStats.found > 0 || peopleFinderStats.created > 0);

  // Duration
  const duration = (() => {
    if (meta.duration_ms) {
      const ms = meta.duration_ms as number;
      if (ms < 1000) return `${ms}ms`;
      if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
      return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
    }
    if (meta.duration_seconds) {
      const s = meta.duration_seconds as number;
      if (s < 60) return `${s.toFixed(1)}s`;
      return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
    }
    // Estimate from first and last child entry
    if (childEntries.length >= 2) {
      const first = new Date(childEntries[0].created_at).getTime();
      const last = new Date(childEntries[childEntries.length - 1].created_at).getTime();
      const diff = last - first;
      if (diff > 0) {
        if (diff < 60000) return `~${(diff / 1000).toFixed(0)}s`;
        return `~${Math.floor(diff / 60000)}m ${Math.round((diff % 60000) / 1000)}s`;
      }
    }
    return null;
  })();

  // Job title
  const jobTitle = isOrgJob
    ? `Organization Enrichment`
    : `Person Enrichment`;
  const jobDate = formatDate(typedJob.created_at);
  const jobTime = formatTime(typedJob.created_at);

  // Use parent-level metadata counts as fallback for stat cards
  const orgsProcessedFromMeta =
    (meta.org_count as number) ??
    (meta.orgs_processed as number) ??
    totalProcessed;
  const orgsEnrichedFromMeta =
    (meta.orgs_enriched as number) ?? successCount;
  const signalsCreatedFromMeta =
    (meta.signals_created as number) ?? totalSignals;
  const personsProcessedFromMeta =
    (meta.contacts_processed as number) ??
    (meta.persons_processed as number) ??
    totalProcessed;
  const emailsFoundFromMeta =
    (meta.emails_found as number) ?? personStats?.emails ?? 0;
  const linkedinFoundFromMeta =
    (meta.linkedin_found as number) ?? personStats?.linkedin ?? 0;
  const twitterFoundFromMeta =
    (meta.twitter_found as number) ?? personStats?.twitter ?? 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link
          href="/admin/enrichment"
          className="inline-flex items-center gap-1.5 text-sm text-[var(--text-muted)] hover:text-white transition-colors mb-3"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Enrichment
        </Link>

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold font-[family-name:var(--font-heading)]">
              {jobTitle} &mdash; {jobDate}
            </h1>
            <p className="text-[var(--text-muted)] text-sm mt-1 flex items-center gap-2">
              <Clock className="h-3.5 w-3.5" />
              {jobTime}
              {duration && (
                <>
                  <span className="text-white/20">|</span>
                  <span>Duration: {duration}</span>
                </>
              )}
              {typedJob.error && (
                <>
                  <span className="text-white/20">|</span>
                  <span className="text-red-400">{typedJob.error}</span>
                </>
              )}
            </p>
          </div>

          <Badge variant={statusVariant(typedJob.status)} className="text-xs mt-1">
            {typedJob.status}
          </Badge>
        </div>
      </div>

      {/* Summary Stats */}
      {isOrgJob ? (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Orgs Processed"
              value={orgsProcessedFromMeta}
              icon={Building2}
              accent="indigo"
            />
            <StatCard
              label="Orgs Enriched"
              value={orgsEnrichedFromMeta}
              icon={Sparkles}
              accent="orange"
            />
            <StatCard
              label="Signals Created"
              value={signalsCreatedFromMeta}
              icon={Zap}
              accent="blue"
            />
            <IcpAverageCard avg={avgIcp} />
          </div>
          {hasPeopleFinderStats && (
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
              <StatCard
                label="People Found"
                value={peopleFinderStats!.found}
                icon={UserPlus}
                accent="orange"
              />
              <StatCard
                label="New Persons Created"
                value={peopleFinderStats!.created}
                icon={Users}
                accent="green"
              />
              <StatCard
                label="Merged with Existing"
                value={peopleFinderStats!.merged}
                icon={Users}
                accent="indigo"
              />
            </div>
          )}
        </>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Persons Processed"
            value={personsProcessedFromMeta}
            icon={Users}
            accent="indigo"
          />
          <StatCard
            label="Emails Found"
            value={emailsFoundFromMeta}
            icon={Mail}
            accent="orange"
          />
          <StatCard
            label="LinkedIn Found"
            value={linkedinFoundFromMeta}
            icon={Linkedin}
            accent="blue"
          />
          <StatCard
            label="Twitter Found"
            value={twitterFoundFromMeta}
            icon={Twitter}
            accent="green"
          />
        </div>
      )}

      {/* Results */}
      <div>
        <h2 className="text-lg font-semibold font-[family-name:var(--font-heading)] mb-4">
          Results
        </h2>
        <JobResultsClient
          isOrgJob={isOrgJob}
          childEntries={childEntries}
          orgMap={orgMap}
          signalsMap={signalsMap}
        />
      </div>
    </div>
  );
}
