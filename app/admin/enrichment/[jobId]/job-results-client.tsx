"use client";

import React, { useState, useMemo, useEffect, useCallback } from "react";
import { GlassCard } from "@/components/ui/glass-card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import {
  ChevronDown,
  ChevronRight,
  Search,
  ArrowUpDown,
  Building2,
  Users,
  UserPlus,
  DollarSign,
  TrendingUp,
  Briefcase,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Mail,
  Linkedin,
  Twitter,
  Phone,
  User,
  MapPin,
  ExternalLink,
  Loader2,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChildJobEntry {
  id: string;
  target_id: string | null;
  status: string;
  job_type: string;
  error: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface OrgDetail {
  id: string;
  name: string;
  description: string | null;
  context: string | null;
  usp: string | null;
  icp_score: number | null;
  icp_reason: string | null;
  website: string | null;
  category: string | null;
}

export interface OrgSignalEntry {
  id: string;
  organization_id: string;
  signal_type: string;
  description: string;
  date: string | null;
  source: string | null;
}

type SortKey = "name" | "icp" | "status";
type SortDir = "asc" | "desc";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function icpScoreColor(score: number | null): string {
  if (score == null) return "text-gray-400";
  if (score >= 90) return "text-green-400";
  if (score >= 75) return "text-yellow-400";
  if (score >= 50) return "text-orange-400";
  return "text-gray-400";
}

function icpScoreBg(score: number | null): string {
  if (score == null) return "bg-gray-500/10";
  if (score >= 90) return "bg-green-500/15";
  if (score >= 75) return "bg-yellow-500/15";
  if (score >= 50) return "bg-orange-500/15";
  return "bg-gray-500/10";
}

function icpScoreBorder(score: number | null): string {
  if (score == null) return "border-gray-500/20";
  if (score >= 90) return "border-green-500/25";
  if (score >= 75) return "border-yellow-500/25";
  if (score >= 50) return "border-orange-500/25";
  return "border-gray-500/20";
}

function icpScoreGlow(score: number | null): string {
  if (score == null) return "";
  if (score >= 90) return "shadow-[0_0_20px_rgba(34,197,94,0.15)]";
  if (score >= 75) return "shadow-[0_0_20px_rgba(234,179,8,0.12)]";
  if (score >= 50) return "shadow-[0_0_20px_rgba(249,115,22,0.1)]";
  return "";
}

function signalTypeBadgeVariant(signalType: string): string {
  const map: Record<string, string> = {
    news: "bg-blue-500/15 text-blue-400 border-blue-500/25",
    funding: "bg-green-500/15 text-green-400 border-green-500/25",
    partnership: "bg-purple-500/15 text-purple-400 border-purple-500/25",
    product_launch: "bg-orange-500/15 text-orange-400 border-orange-500/25",
    hiring: "bg-cyan-500/15 text-cyan-400 border-cyan-500/25",
    acquisition: "bg-pink-500/15 text-pink-400 border-pink-500/25",
    expansion: "bg-teal-500/15 text-teal-400 border-teal-500/25",
  };
  return map[signalType] || "bg-[var(--accent-indigo)]/10 text-[var(--accent-indigo)] border-[var(--accent-indigo)]/20";
}

function getOrgName(entry: ChildJobEntry): string {
  const meta = (entry.metadata ?? {}) as Record<string, unknown>;
  return (
    (meta.org_name as string) ??
    (meta.organization_name as string) ??
    entry.target_id?.slice(0, 8) ??
    "Unknown"
  );
}

function getOrgIcpScore(entry: ChildJobEntry, orgMap: Record<string, OrgDetail>): number | null {
  const meta = (entry.metadata ?? {}) as Record<string, unknown>;
  const fromMeta = meta.icp_score as number | undefined;
  if (fromMeta != null) return fromMeta;
  if (entry.target_id && orgMap[entry.target_id]) return orgMap[entry.target_id].icp_score;
  return null;
}

// ---------------------------------------------------------------------------
// Org Expanded Card
// ---------------------------------------------------------------------------

function OrgExpandedCard({
  entry,
  org,
  signals,
}: {
  entry: ChildJobEntry;
  org: OrgDetail | null;
  signals: OrgSignalEntry[];
}) {
  const meta = (entry.metadata ?? {}) as Record<string, unknown>;
  const icpScore = org?.icp_score ?? (meta.icp_score as number | null) ?? null;

  const peopleFinder = meta.people_finder as Record<string, number> | undefined;
  const pfFound = peopleFinder?.found ?? (meta.found as number) ?? (meta.people_found as number) ?? null;
  const pfCreated = peopleFinder?.created ?? (meta.people_created as number) ?? null;
  const pfMerged = peopleFinder?.merged ?? (meta.people_merged as number) ?? null;
  const hasPeopleFinder = pfFound != null && pfFound > 0;

  const description = org?.description ?? (meta.description as string) ?? null;
  const context = org?.context ?? (meta.context as string) ?? null;
  const usp = org?.usp ?? (meta.usp as string) ?? null;
  const icpReason = org?.icp_reason ?? (meta.icp_reason as string) ?? null;

  const firmographics = {
    industry: (meta.industry as string) ?? (meta.apollo_industry as string) ?? null,
    employees:
      (meta.employee_count as number) ??
      (meta.employees as number) ??
      (meta.estimated_num_employees as number) ??
      null,
    revenue:
      (meta.annual_revenue as string) ??
      (meta.revenue as string) ??
      (meta.annual_revenue_printed as string) ??
      null,
    funding:
      (meta.total_funding as string) ??
      (meta.funding as string) ??
      (meta.total_funding_printed as string) ??
      null,
    hq: (meta.headquarters as string) ?? (meta.hq as string) ?? (meta.city as string) ?? null,
  };
  const hasFirmographics = Object.values(firmographics).some(Boolean);
  const strengths = (meta.strengths as string[]) ?? null;
  const weaknesses = (meta.weaknesses as string[]) ?? null;

  const hasContent =
    description || context || usp || icpReason || hasFirmographics || strengths || weaknesses || signals.length > 0 || hasPeopleFinder;

  if (!hasContent && !entry.error) {
    return (
      <p className="text-xs text-[var(--text-muted)] italic py-2">
        No enrichment details available for this organization.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left column: 2/3 */}
        <div className="lg:col-span-2 space-y-4">
          {description && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1.5 font-medium">
                Description
              </div>
              <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{description}</p>
            </div>
          )}
          {context && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1.5 font-medium">
                Context / Strategic Fit
              </div>
              <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{context}</p>
            </div>
          )}
          {usp && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1.5 font-medium">
                Entry Angle (USP)
              </div>
              <p className="text-sm text-[var(--accent-orange)] leading-relaxed">{usp}</p>
            </div>
          )}
          {icpReason && (
            <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] px-4 py-3">
              <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1.5 font-medium">
                ICP Reason
              </div>
              <p className="text-sm text-[var(--text-secondary)] leading-relaxed italic">
                &ldquo;{icpReason}&rdquo;
              </p>
            </div>
          )}
        </div>

        {/* Right column: 1/3 */}
        <div className="space-y-4">
          {/* ICP Score large display */}
          <div
            className={cn(
              "rounded-xl border p-4 text-center",
              icpScoreBg(icpScore),
              icpScoreBorder(icpScore),
              icpScoreGlow(icpScore)
            )}
          >
            <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1">ICP Score</div>
            <div className={cn("text-4xl font-bold tabular-nums", icpScoreColor(icpScore))}>
              {icpScore ?? "--"}
            </div>
          </div>

          {/* Firmographics */}
          {hasFirmographics && (
            <div className="rounded-lg bg-white/[0.02] border border-white/[0.06] p-3 space-y-2.5">
              <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-medium">
                Firmographics
              </div>
              {firmographics.industry && (
                <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                  <Briefcase className="h-3.5 w-3.5 text-[var(--text-muted)] shrink-0" />
                  {firmographics.industry}
                </div>
              )}
              {firmographics.employees != null && (
                <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                  <Users className="h-3.5 w-3.5 text-[var(--text-muted)] shrink-0" />
                  {typeof firmographics.employees === "number"
                    ? firmographics.employees.toLocaleString()
                    : firmographics.employees}{" "}
                  employees
                </div>
              )}
              {firmographics.revenue && (
                <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                  <DollarSign className="h-3.5 w-3.5 text-[var(--text-muted)] shrink-0" />
                  {firmographics.revenue}
                </div>
              )}
              {firmographics.funding && (
                <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                  <TrendingUp className="h-3.5 w-3.5 text-[var(--text-muted)] shrink-0" />
                  {firmographics.funding} funding
                </div>
              )}
              {firmographics.hq && (
                <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                  <MapPin className="h-3.5 w-3.5 text-[var(--text-muted)] shrink-0" />
                  {firmographics.hq}
                </div>
              )}
            </div>
          )}

          {/* Category */}
          {org?.category && (
            <div className="rounded-lg bg-white/[0.02] border border-white/[0.06] p-3">
              <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1 font-medium">
                Category
              </div>
              <span className="text-xs text-[var(--text-secondary)]">{org.category}</span>
            </div>
          )}

          {/* People Finder */}
          {hasPeopleFinder && (
            <div className="rounded-lg bg-[var(--accent-orange)]/[0.03] border border-[var(--accent-orange)]/10 p-3 space-y-2">
              <div className="text-[10px] uppercase tracking-wider text-[var(--accent-orange)]/70 mb-1 font-medium flex items-center gap-1.5">
                <UserPlus className="h-3 w-3" /> People Found
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="text-lg font-bold text-white tabular-nums">{pfFound}</div>
                  <div className="text-[9px] text-[var(--text-muted)]">Found</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-green-400 tabular-nums">{pfCreated ?? 0}</div>
                  <div className="text-[9px] text-[var(--text-muted)]">New</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-[var(--accent-indigo)] tabular-nums">{pfMerged ?? 0}</div>
                  <div className="text-[9px] text-[var(--text-muted)]">Merged</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Strengths / Weaknesses side by side */}
      {(strengths || weaknesses) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {strengths && strengths.length > 0 && (
            <div className="rounded-lg bg-green-500/[0.03] border border-green-500/10 p-3">
              <div className="text-[10px] uppercase tracking-wider text-green-400/70 mb-2 font-medium flex items-center gap-1.5">
                <TrendingUp className="h-3 w-3" /> Strengths
              </div>
              <ul className="space-y-1">
                {strengths.map((s, i) => (
                  <li key={i} className="text-xs text-green-400/80 flex items-start gap-1.5">
                    <span className="text-green-400/50 mt-0.5 shrink-0">+</span>
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {weaknesses && weaknesses.length > 0 && (
            <div className="rounded-lg bg-red-500/[0.03] border border-red-500/10 p-3">
              <div className="text-[10px] uppercase tracking-wider text-red-400/70 mb-2 font-medium flex items-center gap-1.5">
                <AlertCircle className="h-3 w-3" /> Weaknesses
              </div>
              <ul className="space-y-1">
                {weaknesses.map((w, i) => (
                  <li key={i} className="text-xs text-red-400/80 flex items-start gap-1.5">
                    <span className="text-red-400/50 mt-0.5 shrink-0">-</span>
                    {w}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Signals timeline */}
      {signals.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-2 font-medium">
            Signals ({signals.length})
          </div>
          <div className="space-y-2 max-h-[200px] overflow-y-auto scrollbar-thin pr-1">
            {signals.map((sig) => (
              <div
                key={sig.id}
                className="flex items-start gap-2.5 text-xs rounded-lg bg-white/[0.02] border border-white/[0.04] px-3 py-2"
              >
                <span
                  className={cn(
                    "inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-medium border shrink-0 mt-0.5",
                    signalTypeBadgeVariant(sig.signal_type)
                  )}
                >
                  {sig.signal_type.replace(/_/g, " ")}
                </span>
                <span className="text-[var(--text-secondary)] flex-1 leading-relaxed">{sig.description}</span>
                {sig.date && (
                  <span className="text-[var(--text-muted)] shrink-0 text-[10px] tabular-nums">
                    {new Date(sig.date).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Error */}
      {entry.error && (
        <div className="p-3 rounded-lg bg-red-500/5 border border-red-500/15">
          <p className="text-xs text-red-400">{entry.error}</p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Org Result Row (collapsible)
// ---------------------------------------------------------------------------

function OrgResultRow({
  entry,
  org,
  signals,
  orgMap,
}: {
  entry: ChildJobEntry;
  org: OrgDetail | null;
  signals: OrgSignalEntry[];
  orgMap: Record<string, OrgDetail>;
}) {
  const [expanded, setExpanded] = useState(false);
  const meta = (entry.metadata ?? {}) as Record<string, unknown>;
  const orgName = org?.name ?? getOrgName(entry);
  const icpScore = getOrgIcpScore(entry, orgMap);
  const category = org?.category ?? (meta.category as string) ?? null;
  const stageCompleted = entry.job_type.replace("enrichment_", "");
  const signalsCount =
    (meta.signals_created as number) ?? (meta.signal_count as number) ?? signals.length;
  const pfData = meta.people_finder as Record<string, number> | undefined;
  const peopleFound = pfData?.found ?? (meta.found as number) ?? (meta.people_found as number) ?? 0;

  return (
    <div className="border-b border-white/[0.04] last:border-0">
      {/* Collapsed row */}
      <button
        onClick={() => setExpanded(!expanded)}
        className={cn(
          "w-full flex items-center gap-3 px-4 py-3 text-left transition-all duration-150",
          expanded ? "bg-white/[0.04]" : "hover:bg-white/[0.02]"
        )}
      >
        <span className="shrink-0">
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-[var(--accent-orange)]" />
          ) : (
            <ChevronRight className="h-4 w-4 text-[var(--text-muted)]" />
          )}
        </span>

        {/* Org name */}
        <span className="text-sm text-white truncate min-w-0 flex-1">
          {entry.target_id ? (
            <Link
              href={`/admin/organizations/${entry.target_id}`}
              className="hover:text-[var(--accent-orange)] transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              {orgName}
            </Link>
          ) : (
            orgName
          )}
        </span>

        {/* ICP badge */}
        <span
          className={cn(
            "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border shrink-0",
            icpScore != null
              ? cn(icpScoreBg(icpScore), icpScoreColor(icpScore), icpScoreBorder(icpScore))
              : "bg-gray-500/10 text-gray-400 border-gray-500/20"
          )}
        >
          {icpScore ?? "--"}
        </span>

        {/* Category */}
        {category && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.06] text-[var(--text-muted)] shrink-0 hidden sm:inline">
            {category}
          </span>
        )}

        {/* Signals count */}
        <span className="text-[10px] text-[var(--text-muted)] shrink-0 hidden sm:inline tabular-nums">
          {signalsCount} signal{signalsCount !== 1 ? "s" : ""}
        </span>

        {/* People found */}
        {peopleFound > 0 && (
          <span className="text-[10px] text-[var(--accent-orange)] shrink-0 hidden sm:inline tabular-nums flex items-center gap-1">
            <UserPlus className="h-3 w-3" />
            {peopleFound} people
          </span>
        )}

        {/* Stage */}
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--accent-indigo)]/10 text-[var(--accent-indigo)] border border-[var(--accent-indigo)]/20 shrink-0 capitalize hidden md:inline">
          {stageCompleted}
        </span>

        {/* Status icon */}
        <span className="shrink-0">
          {entry.status === "completed" ? (
            <CheckCircle2 className="h-4 w-4 text-green-400" />
          ) : entry.status === "failed" ? (
            <XCircle className="h-4 w-4 text-red-400" />
          ) : (
            <span className="h-4 w-4 rounded-full border-2 border-orange-400 border-t-transparent animate-spin inline-block" />
          )}
        </span>
      </button>

      {/* Expanded content */}
      <div
        className={cn(
          "overflow-hidden transition-all duration-300 ease-in-out",
          expanded ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0"
        )}
      >
        <div className="px-5 py-4 border-t border-white/[0.04] bg-white/[0.01]">
          <OrgExpandedCard entry={entry} org={org} signals={signals} />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Person Result Row
// ---------------------------------------------------------------------------

function PersonResultRow({ entry }: { entry: ChildJobEntry }) {
  const meta = (entry.metadata ?? {}) as Record<string, unknown>;
  const personName =
    (meta.full_name as string) ??
    (meta.contact_name as string) ??
    (meta.person_name as string) ??
    entry.target_id?.slice(0, 8) ??
    "Unknown";
  const emailFound = !!(meta.email_found ?? meta.email);
  const linkedinFound = !!(meta.linkedin_found ?? meta.linkedin_url);
  const twitterFound = !!(meta.twitter_found ?? meta.twitter_handle);
  const phoneFound = !!(meta.phone_found ?? meta.phone);

  return (
    <div className="flex items-center gap-4 px-4 py-3 border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] transition-all duration-150">
      <User className="h-4 w-4 text-[var(--text-muted)] shrink-0" />

      {/* Name */}
      <span className="text-sm text-white truncate min-w-0 flex-1">
        {entry.target_id ? (
          <Link
            href={`/admin/persons/${entry.target_id}`}
            className="hover:text-[var(--accent-orange)] transition-colors"
          >
            {personName}
          </Link>
        ) : (
          personName
        )}
      </span>

      {/* Fields found indicators */}
      <div className="flex items-center gap-3 text-xs shrink-0">
        <span className={cn("flex items-center gap-1", emailFound ? "text-green-400" : "text-[var(--text-muted)]")}>
          <Mail className="h-3.5 w-3.5" />
          {emailFound ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3 opacity-40" />}
        </span>
        <span className={cn("flex items-center gap-1", linkedinFound ? "text-green-400" : "text-[var(--text-muted)]")}>
          <Linkedin className="h-3.5 w-3.5" />
          {linkedinFound ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3 opacity-40" />}
        </span>
        <span className={cn("flex items-center gap-1", twitterFound ? "text-green-400" : "text-[var(--text-muted)]")}>
          <Twitter className="h-3.5 w-3.5" />
          {twitterFound ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3 opacity-40" />}
        </span>
        <span className={cn("flex items-center gap-1", phoneFound ? "text-green-400" : "text-[var(--text-muted)]")}>
          <Phone className="h-3.5 w-3.5" />
          {phoneFound ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3 opacity-40" />}
        </span>
      </div>

      {/* Status */}
      <Badge
        variant={entry.status === "completed" ? "sent" : entry.status === "failed" ? "failed" : "processing"}
        className="text-[10px] shrink-0"
      >
        {entry.status}
      </Badge>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Supabase helper
// ---------------------------------------------------------------------------

function useBrowserSupabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

// ---------------------------------------------------------------------------
// Live Job Banner (shows progress for processing jobs)
// ---------------------------------------------------------------------------

export function LiveJobBanner({
  jobId,
  jobCreatedAt,
  isOrgJob,
}: {
  jobId: string;
  jobCreatedAt: string;
  isOrgJob: boolean;
}) {
  const router = useRouter();
  const [progress, setProgress] = useState<{
    completed: number;
    total: number;
    latestName: string | null;
    latestStage: string | null;
  }>({ completed: 0, total: 0, latestName: null, latestStage: null });
  const [isDone, setIsDone] = useState(false);

  useEffect(() => {
    if (isDone) return;

    const supabase = useBrowserSupabase();
    const startTime = new Date(
      new Date(jobCreatedAt).getTime() - 5000
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

    const poll = async () => {
      // Check parent job status + metadata for expected total
      const { data: parentJob } = await supabase
        .from("job_log")
        .select("status, metadata")
        .eq("id", jobId)
        .single();

      if (
        parentJob?.status === "completed" ||
        parentJob?.status === "failed"
      ) {
        setIsDone(true);
        router.refresh();
        return;
      }

      const parentMeta = ((parentJob?.metadata ?? {}) as Record<string, unknown>);
      const expectedTotal =
        (parentMeta.org_count as number) ??
        (parentMeta.contacts_count as number) ??
        (parentMeta.person_count as number) ??
        ((parentMeta.organization_ids as string[])?.length) ??
        ((parentMeta.person_ids as string[])?.length) ??
        null;

      // Get child jobs
      const { data } = await supabase
        .from("job_log")
        .select("target_id, status, job_type, metadata")
        .eq("target_table", targetTable)
        .in("job_type", jobTypes)
        .gte("created_at", startTime)
        .neq("id", jobId)
        .order("created_at", { ascending: false })
        .limit(500);

      if (data && data.length > 0) {
        const byTarget = new Map<
          string,
          { status: string; stage: string | null }
        >();
        let latestName: string | null = null;
        let latestStage: string | null = null;

        for (const entry of data as {
          target_id: string | null;
          status: string;
          job_type: string;
          metadata: Record<string, unknown> | null;
        }[]) {
          if (!entry.target_id) continue;
          const existing = byTarget.get(entry.target_id);
          if (
            !existing ||
            (existing.status === "processing" &&
              entry.status !== "processing") ||
            !existing
          ) {
            const stage = entry.job_type.replace("enrichment_", "");
            byTarget.set(entry.target_id, { status: entry.status, stage });
          }
          if (!latestStage && entry.status === "processing") {
            const meta = (entry.metadata ?? {}) as Record<string, unknown>;
            latestName =
              (meta.org_name as string) ??
              (meta.full_name as string) ??
              (meta.contact_name as string) ??
              null;
            latestStage = (() => {
              switch (entry.job_type) {
                case "enrichment_apollo":
                  return "Firmographics";
                case "enrichment_perplexity":
                  return "Deep Research";
                case "enrichment_gemini":
                  return "ICP Scoring";
                case "enrichment_people_finder":
                  return "Finding People";
                case "enrichment_full":
                  return "Full Pipeline";
                default:
                  return entry.job_type.replace("enrichment_", "");
              }
            })();
          }
        }

        const completed = Array.from(byTarget.values()).filter(
          (v) => v.status === "completed" || v.status === "failed"
        ).length;
        setProgress({
          completed,
          total: expectedTotal ?? byTarget.size,
          latestName,
          latestStage,
        });
      }
    };

    poll();
    const interval = setInterval(poll, 2500);
    return () => clearInterval(interval);
  }, [jobId, jobCreatedAt, isOrgJob, isDone, router]);

  if (isDone) return null;

  const pct =
    progress.total > 0
      ? Math.round((progress.completed / progress.total) * 100)
      : 0;

  return (
    <div className="p-4 rounded-xl bg-[var(--accent-orange)]/[0.04] border border-[var(--accent-orange)]/15">
      <div className="flex items-center gap-3 mb-3">
        <span className="relative flex h-3 w-3 shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--accent-orange)] opacity-75" />
          <span className="relative inline-flex rounded-full h-3 w-3 bg-[var(--accent-orange)]" />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-white font-medium">Job in progress</p>
          <p className="text-xs text-[var(--text-muted)] mt-0.5 truncate">
            {progress.latestName && progress.latestStage
              ? `${progress.latestName}: ${progress.latestStage}`
              : progress.latestStage
                ? `Currently: ${progress.latestStage}`
                : "Processing..."}
            {progress.total > 0 &&
              ` — ${progress.completed} of ${progress.total} completed`}
          </p>
        </div>
        <span className="text-sm font-medium text-[var(--accent-orange)] tabular-nums shrink-0">
          {pct}%
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-white/[0.06] overflow-hidden">
        <div
          className="h-full rounded-full bg-[var(--accent-orange)] transition-all duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Client Component
// ---------------------------------------------------------------------------

export function JobResultsClient({
  isOrgJob,
  childEntries: initialEntries,
  orgMap,
  signalsMap,
  jobId,
  jobStatus,
  jobCreatedAt,
  unprocessedOrgs,
}: {
  isOrgJob: boolean;
  childEntries: ChildJobEntry[];
  orgMap: Record<string, OrgDetail>;
  signalsMap: Record<string, OrgSignalEntry[]>;
  jobId?: string;
  jobStatus?: string;
  jobCreatedAt?: string;
  unprocessedOrgs?: { id: string; name: string; enrichment_status: string; enrichment_stages: Record<string, unknown> }[];
}) {
  const [liveEntries, setLiveEntries] = useState<ChildJobEntry[]>([]);
  const isProcessing = jobStatus === "processing";

  // Poll for new entries when job is processing
  useEffect(() => {
    if (!isProcessing || !jobId || !jobCreatedAt) return;

    const supabase = useBrowserSupabase();
    const startTime = new Date(
      new Date(jobCreatedAt).getTime() - 5000
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

    const poll = async () => {
      const { data } = await supabase
        .from("job_log")
        .select(
          "id, target_id, status, job_type, error, metadata, created_at"
        )
        .eq("target_table", targetTable)
        .in("job_type", jobTypes)
        .gte("created_at", startTime)
        .neq("id", jobId)
        .order("created_at", { ascending: true })
        .limit(500);

      if (data) {
        const byTarget = new Map<string, ChildJobEntry>();
        for (const entry of data as ChildJobEntry[]) {
          if (!entry.target_id) continue;
          const existing = byTarget.get(entry.target_id);
          if (
            !existing ||
            (existing.status === "processing" &&
              entry.status !== "processing") ||
            new Date(entry.created_at) > new Date(existing.created_at)
          ) {
            byTarget.set(entry.target_id, entry);
          }
        }
        setLiveEntries(Array.from(byTarget.values()));
      }
    };

    poll();
    const interval = setInterval(poll, 3000);
    return () => clearInterval(interval);
  }, [isProcessing, jobId, jobCreatedAt, isOrgJob]);

  const childEntries = isProcessing && liveEntries.length > 0 ? liveEntries : initialEntries;

  const [searchQuery, setSearchQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("icp");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const handleSortToggle = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
  };

  const filteredAndSorted = useMemo(() => {
    let results = [...childEntries];

    // Filter by search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      results = results.filter((entry) => {
        const meta = (entry.metadata ?? {}) as Record<string, unknown>;
        const name = isOrgJob
          ? (getOrgName(entry)).toLowerCase()
          : (
              (meta.full_name as string) ??
              (meta.contact_name as string) ??
              (meta.person_name as string) ??
              ""
            ).toLowerCase();
        return name.includes(q);
      });
    }

    // Sort
    results.sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      switch (sortKey) {
        case "name": {
          const nameA = isOrgJob ? getOrgName(a) : ((a.metadata as any)?.full_name ?? "");
          const nameB = isOrgJob ? getOrgName(b) : ((b.metadata as any)?.full_name ?? "");
          return dir * nameA.localeCompare(nameB);
        }
        case "icp": {
          const scoreA = getOrgIcpScore(a, orgMap) ?? -1;
          const scoreB = getOrgIcpScore(b, orgMap) ?? -1;
          return dir * (scoreA - scoreB);
        }
        case "status": {
          const order: Record<string, number> = { completed: 0, failed: 1, processing: 2 };
          return dir * ((order[a.status] ?? 3) - (order[b.status] ?? 3));
        }
        default:
          return 0;
      }
    });

    return results;
  }, [childEntries, searchQuery, sortKey, sortDir, isOrgJob, orgMap]);

  return (
    <>
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-muted)]" />
          <input
            type="text"
            placeholder={`Search ${isOrgJob ? "organizations" : "persons"}...`}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm bg-white/[0.04] border border-white/[0.08] rounded-lg text-white placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-orange)]/40 transition-colors"
          />
        </div>

        {/* Sort buttons */}
        <div className="flex items-center gap-1">
          {(isOrgJob
            ? [
                { key: "name" as SortKey, label: "Name" },
                { key: "icp" as SortKey, label: "ICP Score" },
                { key: "status" as SortKey, label: "Status" },
              ]
            : [
                { key: "name" as SortKey, label: "Name" },
                { key: "status" as SortKey, label: "Status" },
              ]
          ).map((opt) => (
            <button
              key={opt.key}
              onClick={() => handleSortToggle(opt.key)}
              className={cn(
                "flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs transition-all duration-150",
                sortKey === opt.key
                  ? "bg-[var(--accent-orange)]/10 text-[var(--accent-orange)] border border-[var(--accent-orange)]/20"
                  : "text-[var(--text-muted)] hover:text-white border border-transparent"
              )}
            >
              <ArrowUpDown className="h-3 w-3" />
              {opt.label}
              {sortKey === opt.key && (
                <span className="text-[9px]">{sortDir === "asc" ? "\u2191" : "\u2193"}</span>
              )}
            </button>
          ))}
        </div>

        {/* Count */}
        <span className="text-xs text-[var(--text-muted)] ml-auto">
          {filteredAndSorted.length} of {childEntries.length} results
          {isOrgJob && unprocessedOrgs && unprocessedOrgs.length > 0 && (
            <span className="text-[var(--text-muted)]/60"> · {unprocessedOrgs.length} not processed</span>
          )}
        </span>
      </div>

      {/* Results list */}
      <GlassCard padding={false}>
        {filteredAndSorted.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-[var(--text-muted)] text-sm">
              {searchQuery ? "No results match your search." : "No enrichment results found."}
            </p>
          </div>
        ) : isOrgJob ? (
          <div className="divide-y divide-white/[0.04]">
            {filteredAndSorted.map((entry) => (
              <OrgResultRow
                key={entry.id}
                entry={entry}
                org={entry.target_id ? orgMap[entry.target_id] ?? null : null}
                signals={entry.target_id ? signalsMap[entry.target_id] ?? [] : []}
                orgMap={orgMap}
              />
            ))}
          </div>
        ) : (
          <div>
            {filteredAndSorted.map((entry) => (
              <PersonResultRow key={entry.id} entry={entry} />
            ))}
          </div>
        )}
      </GlassCard>
    </div>

    {/* Unprocessed organizations */}
    {isOrgJob && unprocessedOrgs && unprocessedOrgs.length > 0 && (
      <div className="mt-6">
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-sm font-medium text-[var(--text-muted)]">
            Not Processed ({unprocessedOrgs.length})
          </h3>
          <div className="flex-1 h-px bg-white/[0.06]" />
        </div>
        <div className="rounded-xl border border-white/[0.04] bg-white/[0.01] overflow-hidden">
          <div className="max-h-[300px] overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-[var(--glass-bg)] z-10">
                <tr className="border-b border-white/[0.06] text-left">
                  <th className="px-4 py-2 text-[var(--text-muted)] font-medium">Organization</th>
                  <th className="px-4 py-2 text-[var(--text-muted)] font-medium">Previous Status</th>
                  <th className="px-4 py-2 text-[var(--text-muted)] font-medium">Stages</th>
                </tr>
              </thead>
              <tbody>
                {unprocessedOrgs.map((org) => {
                  const stages = (org.enrichment_stages ?? {}) as Record<string, { status?: string; error?: string }>;
                  const stageEntries = Object.entries(stages).filter(([_, v]) => v && typeof v === 'object');

                  return (
                    <tr key={org.id} className="border-b border-white/[0.03] last:border-0">
                      <td className="px-4 py-2.5">
                        <Link
                          href={`/admin/organizations/${org.id}`}
                          className="text-[var(--text-muted)] hover:text-white transition-colors"
                        >
                          {org.name}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={cn(
                          "text-[10px] px-2 py-0.5 rounded-full border",
                          org.enrichment_status === 'none'
                            ? "bg-white/[0.04] text-[var(--text-muted)] border-white/[0.08]"
                            : org.enrichment_status === 'failed'
                              ? "bg-red-500/10 text-red-400 border-red-500/20"
                              : org.enrichment_status === 'partial'
                                ? "bg-orange-500/10 text-orange-400 border-orange-500/20"
                                : "bg-white/[0.04] text-[var(--text-muted)] border-white/[0.08]"
                        )}>
                          {org.enrichment_status === 'none' ? 'never attempted' : org.enrichment_status}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        {stageEntries.length > 0 ? (
                          <div className="flex items-center gap-1.5">
                            {stageEntries.map(([stageName, stageData]) => (
                              <span
                                key={stageName}
                                title={stageData.error ? `${stageName}: ${stageData.error}` : stageName}
                                className={cn(
                                  "text-[9px] px-1.5 py-0.5 rounded border",
                                  stageData.status === 'completed'
                                    ? "bg-green-500/10 text-green-400 border-green-500/20"
                                    : stageData.status === 'failed'
                                      ? "bg-red-500/10 text-red-400 border-red-500/20"
                                      : "bg-white/[0.04] text-[var(--text-muted)] border-white/[0.08]"
                                )}
                              >
                                {stageName.replace('_', ' ')}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-[var(--text-muted)]">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
