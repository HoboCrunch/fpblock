"use client";

import { useState, useEffect, useCallback } from "react";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassSelect } from "@/components/ui/glass-select";
import { Badge } from "@/components/ui/badge";
import { Tabs } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  Sparkles,
  Play,
  Loader2,
  Building2,
  User,
  Search,
  Zap,
  Brain,
  FlaskConical,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import type { Event, Initiative, JobLog } from "@/lib/types/database";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type EnrichField = "email" | "linkedin" | "twitter" | "phone";
type OrgStage = "apollo" | "perplexity" | "gemini" | "full";
type OrgTarget =
  | "unenriched"
  | "icp_below"
  | "event"
  | "initiative"
  | "selected";

interface OrgEnrichResult {
  orgId: string;
  orgName: string;
  success: boolean;
  error: string | null;
  icp_score: number | null;
  signalsCreated: number;
}

interface OrgEnrichResponse {
  jobId?: string;
  status?: string;
  orgs_processed: number;
  orgs_enriched: number;
  orgs_failed: number;
  signals_created: number;
  results?: OrgEnrichResult[];
  error?: string;
  message?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function useSupabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

// ---------------------------------------------------------------------------
// Person Enrichment Tab
// ---------------------------------------------------------------------------

function PersonEnrichmentTab({
  preSelectedPersons,
  events,
  onJobComplete,
}: {
  preSelectedPersons: string[];
  events: Pick<Event, "id" | "name">[];
  onJobComplete: () => void;
}) {
  const [source] = useState("apollo");
  const [target, setTarget] = useState<string>(
    preSelectedPersons.length > 0 ? "selected" : "unenriched"
  );
  const [eventId, setEventId] = useState("");
  const [fields, setFields] = useState<EnrichField[]>(["email", "linkedin"]);
  const [isRunning, setIsRunning] = useState(false);
  const [lastResult, setLastResult] = useState<Record<string, unknown> | null>(
    null
  );

  function toggleField(field: EnrichField) {
    setFields((prev) =>
      prev.includes(field) ? prev.filter((f) => f !== field) : [...prev, field]
    );
  }

  async function handleRun() {
    if (fields.length === 0) return;
    setIsRunning(true);
    setLastResult(null);

    try {
      const body: Record<string, unknown> = { fields, source };

      if (target === "selected" && preSelectedPersons.length > 0) {
        body.personIds = preSelectedPersons;
      } else if (target === "event" && eventId) {
        body.eventId = eventId;
      }

      const res = await fetch("/api/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      setLastResult(data);
      onJobComplete();
    } catch {
      setLastResult({ error: "Network error" });
    } finally {
      setIsRunning(false);
    }
  }

  const fieldOptions: { key: EnrichField; label: string }[] = [
    { key: "email", label: "Email" },
    { key: "linkedin", label: "LinkedIn" },
    { key: "twitter", label: "Twitter" },
    { key: "phone", label: "Phone" },
  ];

  return (
    <GlassCard>
      <div className="flex items-center gap-2 mb-4">
        <User className="h-5 w-5 text-[var(--accent-orange)]" />
        <h2 className="text-lg font-semibold font-[family-name:var(--font-heading)] text-white">
          Person Enrichment
        </h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div>
          <label className="text-xs text-[var(--text-muted)] mb-1 block">
            Source
          </label>
          <GlassSelect
            options={[{ value: "apollo", label: "Apollo" }]}
            value={source}
            disabled
          />
        </div>
        <div>
          <label className="text-xs text-[var(--text-muted)] mb-1 block">
            Target
          </label>
          <GlassSelect
            options={[
              { value: "unenriched", label: "All unenriched persons" },
              {
                value: "selected",
                label: `Selected persons (${preSelectedPersons.length})`,
              },
              { value: "event", label: "Persons from event" },
            ]}
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          />
        </div>
        {target === "event" && (
          <div>
            <label className="text-xs text-[var(--text-muted)] mb-1 block">
              Event
            </label>
            <GlassSelect
              options={events.map((e) => ({
                value: e.id,
                label: e.name,
              }))}
              placeholder="Select event"
              value={eventId}
              onChange={(e) => setEventId(e.target.value)}
            />
          </div>
        )}
      </div>

      {/* Field checkboxes */}
      <div className="mb-6">
        <label className="text-xs text-[var(--text-muted)] mb-2 block">
          Fields to Enrich
        </label>
        <div className="flex flex-wrap gap-3">
          {fieldOptions.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => toggleField(key)}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-medium border transition-all duration-200",
                fields.includes(key)
                  ? "bg-[var(--accent-orange)]/15 text-[var(--accent-orange)] border-[var(--accent-orange)]/20"
                  : "bg-[var(--glass-bg)] text-[var(--text-muted)] border-[var(--glass-border)] hover:text-white"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Run button */}
      <button
        onClick={handleRun}
        disabled={isRunning || fields.length === 0}
        className={cn(
          "flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
          "bg-[var(--accent-orange)]/15 text-[var(--accent-orange)] border border-[var(--accent-orange)]/20",
          "hover:bg-[var(--accent-orange)]/25",
          (isRunning || fields.length === 0) && "opacity-50 cursor-not-allowed"
        )}
      >
        {isRunning ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Play className="h-4 w-4" />
        )}
        {isRunning ? "Running..." : "Run Enrichment"}
      </button>

      {lastResult && (
        <div className="mt-4 p-4 rounded-lg bg-white/[0.04] border border-white/[0.06]">
          {lastResult.error ? (
            <p className="text-sm text-red-400">
              {lastResult.error as string}
            </p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <div className="text-xs text-[var(--text-muted)]">
                  Persons Processed
                </div>
                <div className="text-lg font-semibold text-white">
                  {(lastResult.contacts_processed as number) ??
                    (lastResult.persons_processed as number) ??
                    0}
                </div>
              </div>
              <div>
                <div className="text-xs text-[var(--text-muted)]">
                  Emails Found
                </div>
                <div className="text-lg font-semibold text-[var(--accent-orange)]">
                  {(lastResult.emails_found as number) ?? 0}
                </div>
              </div>
              <div>
                <div className="text-xs text-[var(--text-muted)]">
                  LinkedIn Found
                </div>
                <div className="text-lg font-semibold text-[var(--accent-indigo)]">
                  {(lastResult.linkedin_found as number) ?? 0}
                </div>
              </div>
              <div>
                <div className="text-xs text-[var(--text-muted)]">
                  Twitter Found
                </div>
                <div className="text-lg font-semibold text-[var(--text-secondary)]">
                  {(lastResult.twitter_found as number) ?? 0}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </GlassCard>
  );
}

// ---------------------------------------------------------------------------
// Organization Enrichment Tab
// ---------------------------------------------------------------------------

const STAGE_OPTIONS: {
  key: OrgStage;
  label: string;
  description: string;
  icon: typeof Zap;
}[] = [
  {
    key: "full",
    label: "Full Pipeline",
    description: "All three stages",
    icon: Sparkles,
  },
  {
    key: "apollo",
    label: "Apollo",
    description: "Firmographics",
    icon: Search,
  },
  {
    key: "perplexity",
    label: "Perplexity",
    description: "Deep Research",
    icon: FlaskConical,
  },
  {
    key: "gemini",
    label: "Gemini",
    description: "Synthesis + ICP Score",
    icon: Brain,
  },
];

function OrganizationEnrichmentTab({
  preSelectedOrgs,
  events,
  initiatives,
  onJobComplete,
}: {
  preSelectedOrgs: string[];
  events: Pick<Event, "id" | "name">[];
  initiatives: Pick<Initiative, "id" | "name">[];
  onJobComplete: () => void;
}) {
  const [stages, setStages] = useState<OrgStage[]>(["full"]);
  const [target, setTarget] = useState<OrgTarget>(
    preSelectedOrgs.length > 0 ? "selected" : "unenriched"
  );
  const [eventId, setEventId] = useState("");
  const [initiativeId, setInitiativeId] = useState("");
  const [icpThreshold, setIcpThreshold] = useState(75);
  const [isRunning, setIsRunning] = useState(false);
  const [lastResult, setLastResult] = useState<OrgEnrichResponse | null>(null);

  function toggleStage(stage: OrgStage) {
    if (stage === "full") {
      setStages(["full"]);
      return;
    }
    // Deselect full when picking individual stages
    setStages((prev) => {
      const withoutFull = prev.filter((s) => s !== "full");
      if (withoutFull.includes(stage)) {
        const next = withoutFull.filter((s) => s !== stage);
        return next.length === 0 ? ["full"] : next;
      }
      return [...withoutFull, stage];
    });
  }

  async function handleRun() {
    setIsRunning(true);
    setLastResult(null);

    try {
      const body: Record<string, unknown> = {
        stages,
      };

      if (target === "selected" && preSelectedOrgs.length > 0) {
        body.organizationIds = preSelectedOrgs;
      } else if (target === "event" && eventId) {
        body.eventId = eventId;
      } else if (target === "initiative" && initiativeId) {
        body.initiativeId = initiativeId;
      } else if (target === "icp_below") {
        body.icpBelow = icpThreshold;
      }
      // "unenriched" — API handles it (default)

      const res = await fetch("/api/enrich/organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data: OrgEnrichResponse = await res.json();
      setLastResult(data);
      onJobComplete();
    } catch {
      setLastResult({
        error: "Network error",
        orgs_processed: 0,
        orgs_enriched: 0,
        orgs_failed: 0,
        signals_created: 0,
      });
    } finally {
      setIsRunning(false);
    }
  }

  const avgIcp =
    lastResult?.results && lastResult.results.length > 0
      ? Math.round(
          lastResult.results
            .filter((r) => r.icp_score != null)
            .reduce((sum, r) => sum + (r.icp_score ?? 0), 0) /
            (lastResult.results.filter((r) => r.icp_score != null).length || 1)
        )
      : null;

  return (
    <GlassCard>
      <div className="flex items-center gap-2 mb-4">
        <Building2 className="h-5 w-5 text-[var(--accent-orange)]" />
        <h2 className="text-lg font-semibold font-[family-name:var(--font-heading)] text-white">
          Organization Enrichment
        </h2>
      </div>

      {/* Stage Selector */}
      <div className="mb-6">
        <label className="text-xs text-[var(--text-muted)] mb-2 block">
          Pipeline Stages
        </label>
        <div className="flex flex-wrap gap-3">
          {STAGE_OPTIONS.map(({ key, label, description, icon: Icon }) => {
            const isActive =
              key === "full"
                ? stages.includes("full")
                : stages.includes(key) && !stages.includes("full");
            return (
              <button
                key={key}
                onClick={() => toggleStage(key)}
                className={cn(
                  "flex items-center gap-2.5 px-4 py-2.5 rounded-lg text-sm font-medium border transition-all duration-200",
                  isActive
                    ? "bg-[var(--accent-orange)]/15 text-[var(--accent-orange)] border-[var(--accent-orange)]/20"
                    : "bg-[var(--glass-bg)] text-[var(--text-muted)] border-[var(--glass-border)] hover:text-white"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <div className="text-left">
                  <div>{label}</div>
                  <div
                    className={cn(
                      "text-[10px] font-normal",
                      isActive
                        ? "text-[var(--accent-orange)]/70"
                        : "text-[var(--text-muted)]"
                    )}
                  >
                    {description}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Target Selector */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div>
          <label className="text-xs text-[var(--text-muted)] mb-1 block">
            Target
          </label>
          <GlassSelect
            options={[
              { value: "unenriched", label: "All unenriched (no ICP score)" },
              { value: "icp_below", label: "ICP below threshold" },
              { value: "event", label: "From event" },
              { value: "initiative", label: "From initiative" },
              {
                value: "selected",
                label: `Selected organizations (${preSelectedOrgs.length})`,
              },
            ]}
            value={target}
            onChange={(e) => setTarget(e.target.value as OrgTarget)}
          />
        </div>

        {target === "icp_below" && (
          <div>
            <label className="text-xs text-[var(--text-muted)] mb-1 block">
              ICP Threshold
            </label>
            <input
              type="number"
              min={0}
              max={100}
              value={icpThreshold}
              onChange={(e) => setIcpThreshold(Number(e.target.value))}
              className={cn(
                "w-full rounded-lg font-[family-name:var(--font-body)]",
                "bg-[var(--glass-bg)] border border-[var(--glass-border)]",
                "backdrop-blur-xl text-white",
                "px-3 py-2 text-sm transition-all duration-200",
                "focus:outline-none focus:ring-2 focus:ring-[var(--accent-orange)]/40 focus:border-[var(--accent-orange)]/50",
                "hover:bg-[var(--glass-bg-hover)] hover:border-[var(--glass-border-hover)]"
              )}
            />
          </div>
        )}

        {target === "event" && (
          <div>
            <label className="text-xs text-[var(--text-muted)] mb-1 block">
              Event
            </label>
            <GlassSelect
              options={events.map((e) => ({
                value: e.id,
                label: e.name,
              }))}
              placeholder="Select event"
              value={eventId}
              onChange={(e) => setEventId(e.target.value)}
            />
          </div>
        )}

        {target === "initiative" && (
          <div>
            <label className="text-xs text-[var(--text-muted)] mb-1 block">
              Initiative
            </label>
            <GlassSelect
              options={initiatives.map((i) => ({
                value: i.id,
                label: i.name,
              }))}
              placeholder="Select initiative"
              value={initiativeId}
              onChange={(e) => setInitiativeId(e.target.value)}
            />
          </div>
        )}
      </div>

      {/* Run button */}
      <button
        onClick={handleRun}
        disabled={isRunning}
        className={cn(
          "flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
          "bg-[var(--accent-orange)]/15 text-[var(--accent-orange)] border border-[var(--accent-orange)]/20",
          "hover:bg-[var(--accent-orange)]/25",
          isRunning && "opacity-50 cursor-not-allowed"
        )}
      >
        {isRunning ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Zap className="h-4 w-4" />
        )}
        {isRunning ? "Running Pipeline..." : "Run Pipeline"}
      </button>

      {/* Running state */}
      {isRunning && (
        <div className="mt-4 p-4 rounded-lg bg-white/[0.04] border border-white/[0.06]">
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-[var(--accent-orange)]" />
            <div>
              <p className="text-sm text-white font-medium">
                Processing organizations...
              </p>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                Running {stages.includes("full") ? "full pipeline" : stages.join(" + ")} enrichment. This may take a few minutes.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Results */}
      {lastResult && !isRunning && (
        <div className="mt-4 space-y-4">
          {lastResult.error && !lastResult.results ? (
            <div className="p-4 rounded-lg bg-red-500/5 border border-red-500/15">
              <p className="text-sm text-red-400">{lastResult.error}</p>
            </div>
          ) : (
            <>
              {/* Summary Stats */}
              <div className="p-4 rounded-lg bg-white/[0.04] border border-white/[0.06]">
                {lastResult.message ? (
                  <p className="text-sm text-[var(--text-muted)]">
                    {lastResult.message}
                  </p>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <div className="text-xs text-[var(--text-muted)]">
                        Orgs Processed
                      </div>
                      <div className="text-lg font-semibold text-white">
                        {lastResult.orgs_processed}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-[var(--text-muted)]">
                        Orgs Enriched
                      </div>
                      <div className="text-lg font-semibold text-[var(--accent-orange)]">
                        {lastResult.orgs_enriched}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-[var(--text-muted)]">
                        Signals Created
                      </div>
                      <div className="text-lg font-semibold text-[var(--accent-indigo)]">
                        {lastResult.signals_created}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-[var(--text-muted)]">
                        Avg ICP Score
                      </div>
                      <div className="text-lg font-semibold text-[var(--text-secondary)]">
                        {avgIcp ?? "-"}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Results mini-table */}
              {lastResult.results && lastResult.results.length > 0 && (
                <div className="rounded-lg bg-white/[0.02] border border-white/[0.06] overflow-hidden">
                  <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-[var(--glass-bg)]">
                        <tr className="border-b border-[var(--glass-border)] text-left">
                          <th className="px-4 py-2.5 text-[var(--text-muted)] font-medium text-xs">
                            Organization
                          </th>
                          <th className="px-4 py-2.5 text-[var(--text-muted)] font-medium text-xs">
                            ICP Score
                          </th>
                          <th className="px-4 py-2.5 text-[var(--text-muted)] font-medium text-xs">
                            Signals
                          </th>
                          <th className="px-4 py-2.5 text-[var(--text-muted)] font-medium text-xs">
                            Status
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {lastResult.results.map((r) => (
                          <tr
                            key={r.orgId}
                            className="border-b border-white/[0.04] last:border-0"
                          >
                            <td className="px-4 py-2.5 text-white text-xs">
                              {r.orgName}
                            </td>
                            <td className="px-4 py-2.5 text-xs">
                              {r.icp_score != null ? (
                                <span
                                  className={cn(
                                    "font-semibold",
                                    r.icp_score >= 75
                                      ? "text-[var(--accent-orange)]"
                                      : r.icp_score >= 50
                                        ? "text-yellow-400"
                                        : "text-[var(--text-muted)]"
                                  )}
                                >
                                  {r.icp_score}
                                </span>
                              ) : (
                                <span className="text-[var(--text-muted)]">
                                  -
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-[var(--text-secondary)] text-xs">
                              {r.signalsCreated}
                            </td>
                            <td className="px-4 py-2.5">
                              <Badge
                                variant={r.success ? "sent" : "failed"}
                                className="text-[10px]"
                              >
                                {r.success ? "enriched" : "failed"}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </GlassCard>
  );
}

// ---------------------------------------------------------------------------
// Job History Table (shared)
// ---------------------------------------------------------------------------

function JobHistoryTable({ jobs }: { jobs: JobLog[] }) {
  if (jobs.length === 0) {
    return (
      <GlassCard className="text-center py-8">
        <Sparkles className="h-8 w-8 text-[var(--text-muted)] mx-auto mb-2" />
        <p className="text-[var(--text-muted)]">No enrichment jobs yet</p>
      </GlassCard>
    );
  }

  return (
    <GlassCard padding={false}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--glass-border)] text-left">
              <th className="px-5 py-3 text-[var(--text-muted)] font-medium">
                Date
              </th>
              <th className="px-5 py-3 text-[var(--text-muted)] font-medium">
                Type
              </th>
              <th className="px-5 py-3 text-[var(--text-muted)] font-medium">
                Processed
              </th>
              <th className="px-5 py-3 text-[var(--text-muted)] font-medium">
                Results
              </th>
              <th className="px-5 py-3 text-[var(--text-muted)] font-medium">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => {
              const meta = (job.metadata ?? {}) as Record<string, unknown>;
              const isOrgJob = job.job_type.includes("organization");

              return (
                <tr
                  key={job.id}
                  className="border-b border-[var(--glass-border)] last:border-0 hover:bg-[var(--glass-bg-hover)] transition-all duration-200"
                >
                  <td className="px-5 py-4 text-[var(--text-secondary)]">
                    {new Date(job.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-5 py-4">
                    <Badge
                      variant={isOrgJob ? "glass-indigo" : "glass-orange"}
                      className="text-[10px]"
                    >
                      {isOrgJob ? "Organization" : "Person"}
                    </Badge>
                  </td>
                  <td className="px-5 py-4 text-[var(--text-secondary)]">
                    {isOrgJob
                      ? `${(meta.org_count as number) ?? (meta.orgs_enriched as number) ?? "-"} orgs`
                      : `${(meta.contacts_processed as number) ?? (meta.persons_processed as number) ?? "-"} persons`}
                  </td>
                  <td className="px-5 py-4 text-[var(--text-secondary)]">
                    {isOrgJob ? (
                      <span className="flex items-center gap-3 text-xs">
                        <span>
                          {(meta.orgs_enriched as number) ?? "-"} enriched
                        </span>
                        <span className="text-[var(--text-muted)]">|</span>
                        <span>
                          {(meta.signals_created as number) ?? "-"} signals
                        </span>
                      </span>
                    ) : (
                      <span className="flex items-center gap-3 text-xs">
                        <span>
                          {(meta.emails_found as number) ?? "-"} emails
                        </span>
                        <span className="text-[var(--text-muted)]">|</span>
                        <span>
                          {(meta.linkedin_found as number) ?? "-"} linkedin
                        </span>
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    <Badge
                      variant={
                        job.status === "completed"
                          ? "sent"
                          : job.status === "failed"
                            ? "failed"
                            : "processing"
                      }
                    >
                      {job.status}
                    </Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </GlassCard>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function EnrichmentPage() {
  const searchParams = useSearchParams();
  const preSelectedPersons = searchParams.get("persons")?.split(",") ?? [];
  const preSelectedOrgs =
    searchParams.get("organizations")?.split(",") ?? [];

  const [events, setEvents] = useState<Pick<Event, "id" | "name">[]>([]);
  const [initiatives, setInitiatives] = useState<
    Pick<Initiative, "id" | "name">[]
  >([]);
  const [jobs, setJobs] = useState<JobLog[]>([]);

  const loadJobs = useCallback(async () => {
    const supabase = useSupabase();
    const { data } = await supabase
      .from("job_log")
      .select("*")
      .in("job_type", [
        "enrichment",
        "enrichment_batch_organizations",
        "enrichment_full",
      ])
      .order("created_at", { ascending: false })
      .limit(50);
    if (data) setJobs(data as JobLog[]);
  }, []);

  useEffect(() => {
    const supabase = useSupabase();

    supabase
      .from("events")
      .select("id, name")
      .order("date_start", { ascending: false })
      .then(({ data }) => {
        if (data) setEvents(data as Pick<Event, "id" | "name">[]);
      });

    supabase
      .from("initiatives")
      .select("id, name")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (data) setInitiatives(data as Pick<Initiative, "id" | "name">[]);
      });

    loadJobs();
  }, [loadJobs]);

  const defaultTab = preSelectedOrgs.length > 0 ? "org" : "person";

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold font-[family-name:var(--font-heading)] text-white">
        Enrichment
      </h1>

      <Tabs
        defaultTab={defaultTab}
        tabs={[
          {
            id: "person",
            label: "Person Enrichment",
            content: (
              <PersonEnrichmentTab
                preSelectedPersons={preSelectedPersons}
                events={events}
                onJobComplete={loadJobs}
              />
            ),
          },
          {
            id: "org",
            label: "Organization Enrichment",
            content: (
              <OrganizationEnrichmentTab
                preSelectedOrgs={preSelectedOrgs}
                events={events}
                initiatives={initiatives}
                onJobComplete={loadJobs}
              />
            ),
          },
        ]}
      />

      {/* Job History */}
      <div>
        <h2 className="text-lg font-semibold font-[family-name:var(--font-heading)] text-white mb-3">
          Job History
        </h2>
        <JobHistoryTable jobs={jobs} />
      </div>
    </div>
  );
}
