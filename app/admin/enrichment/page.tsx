"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
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
  CheckCircle2,
  Mail,
  Linkedin,
  Twitter,
  Phone,
  Globe,
  ChevronDown,
  ChevronRight,
  ArrowRight,
  AlertCircle,
  TrendingUp,
  Users,
  DollarSign,
  Briefcase,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { createBrowserClient } from "@supabase/ssr";
import type { Event, Initiative, JobLog, Organization, Person } from "@/lib/types/database";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type EnrichField = "email" | "linkedin" | "twitter" | "phone";
type OrgStage = "apollo" | "perplexity" | "gemini" | "full" | "people_finder";
const SENIORITY_OPTIONS = [
  { value: "owner", label: "Owner" },
  { value: "founder", label: "Founder" },
  { value: "c_suite", label: "C-Suite" },
  { value: "partner", label: "Partner" },
  { value: "vp", label: "VP" },
  { value: "director", label: "Director" },
  { value: "manager", label: "Manager" },
  { value: "senior", label: "Senior" },
  { value: "entry", label: "Entry" },
];

const DEPARTMENT_OPTIONS = [
  { value: "executive", label: "Executive" },
  { value: "engineering", label: "Engineering" },
  { value: "sales", label: "Sales" },
  { value: "marketing", label: "Marketing" },
  { value: "finance", label: "Finance" },
  { value: "operations", label: "Operations" },
  { value: "product", label: "Product" },
  { value: "legal", label: "Legal" },
  { value: "human_resources", label: "HR" },
];

type OrgTarget =
  | "unenriched"
  | "icp_below"
  | "event"
  | "initiative"
  | "selected"
  | "pick";

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
  people_found?: number;
  people_created?: number;
  people_merged?: number;
}

interface PreviewPerson {
  id: string;
  full_name: string;
  email: string | null;
  linkedin_url: string | null;
  twitter_handle: string | null;
  phone: string | null;
  primary_org?: string | null;
}

interface PreviewOrg {
  id: string;
  name: string;
  icp_score: number | null;
  category: string | null;
  website: string | null;
}

interface ProgressEntry {
  id: string;
  target_id: string | null;
  org_name: string | null;
  status: string;
  icp_score: number | null;
  job_type: string;
  created_at: string;
  error: string | null;
  stage: string | null;  // NEW: current pipeline stage
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
// Preview List Component (shared)
// ---------------------------------------------------------------------------

function PreviewPersonList({ persons, isLoading, totalCount }: { persons: PreviewPerson[]; isLoading: boolean; totalCount?: number }) {
  if (isLoading) {
    return (
      <div className="mt-4 p-4 rounded-lg bg-white/[0.02] border border-white/[0.06]">
        <div className="flex items-center gap-2 text-[var(--text-muted)] text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading preview...
        </div>
      </div>
    );
  }

  if (persons.length === 0) return null;

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-[var(--text-muted)]">Preview</span>
        <span className="text-xs font-medium text-[var(--accent-orange)]">
          {(totalCount ?? persons.length)} person{(totalCount ?? persons.length) !== 1 ? "s" : ""} will be enriched{(totalCount ?? 0) > persons.length ? ` (showing ${persons.length})` : ""}
        </span>
      </div>
      <div className="rounded-lg bg-white/[0.02] border border-white/[0.06] overflow-hidden">
        <div className="max-h-[300px] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-[var(--glass-bg)] z-10">
              <tr className="border-b border-[var(--glass-border)] text-left">
                <th className="px-3 py-2 text-[var(--text-muted)] font-medium">Name</th>
                <th className="px-3 py-2 text-[var(--text-muted)] font-medium">Organization</th>
                <th className="px-3 py-2 text-[var(--text-muted)] font-medium text-center">
                  <Mail className="h-3 w-3 inline" />
                </th>
                <th className="px-3 py-2 text-[var(--text-muted)] font-medium text-center">
                  <Linkedin className="h-3 w-3 inline" />
                </th>
                <th className="px-3 py-2 text-[var(--text-muted)] font-medium text-center">
                  <Twitter className="h-3 w-3 inline" />
                </th>
                <th className="px-3 py-2 text-[var(--text-muted)] font-medium text-center">
                  <Phone className="h-3 w-3 inline" />
                </th>
              </tr>
            </thead>
            <tbody>
              {persons.map((p) => (
                <tr key={p.id} className="border-b border-white/[0.03] last:border-0 hover:bg-white/[0.02]">
                  <td className="px-3 py-1.5 text-white truncate max-w-[180px]">{p.full_name}</td>
                  <td className="px-3 py-1.5 text-[var(--text-muted)] truncate max-w-[140px]">
                    {p.primary_org ?? "\u2014"}
                  </td>
                  <td className="px-3 py-1.5 text-center">
                    {p.email ? (
                      <CheckCircle2 className="h-3 w-3 text-green-400 inline" />
                    ) : (
                      <span className="text-[var(--text-muted)]">\u2014</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-center">
                    {p.linkedin_url ? (
                      <CheckCircle2 className="h-3 w-3 text-green-400 inline" />
                    ) : (
                      <span className="text-[var(--text-muted)]">\u2014</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-center">
                    {p.twitter_handle ? (
                      <CheckCircle2 className="h-3 w-3 text-green-400 inline" />
                    ) : (
                      <span className="text-[var(--text-muted)]">\u2014</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-center">
                    {p.phone ? (
                      <CheckCircle2 className="h-3 w-3 text-green-400 inline" />
                    ) : (
                      <span className="text-[var(--text-muted)]">\u2014</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function PreviewOrgList({ orgs, isLoading, totalCount }: { orgs: PreviewOrg[]; isLoading: boolean; totalCount?: number }) {
  if (isLoading) {
    return (
      <div className="mt-4 p-4 rounded-lg bg-white/[0.02] border border-white/[0.06]">
        <div className="flex items-center gap-2 text-[var(--text-muted)] text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading preview...
        </div>
      </div>
    );
  }

  if (orgs.length === 0) return null;

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-[var(--text-muted)]">Preview</span>
        <span className="text-xs font-medium text-[var(--accent-orange)]">
          {(totalCount ?? orgs.length)} organization{(totalCount ?? orgs.length) !== 1 ? "s" : ""} will be enriched{(totalCount ?? 0) > orgs.length ? ` (showing ${orgs.length})` : ""}
        </span>
      </div>
      <div className="rounded-lg bg-white/[0.02] border border-white/[0.06] overflow-hidden">
        <div className="max-h-[300px] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-[var(--glass-bg)] z-10">
              <tr className="border-b border-[var(--glass-border)] text-left">
                <th className="px-3 py-2 text-[var(--text-muted)] font-medium">Name</th>
                <th className="px-3 py-2 text-[var(--text-muted)] font-medium">ICP Score</th>
                <th className="px-3 py-2 text-[var(--text-muted)] font-medium">Category</th>
                <th className="px-3 py-2 text-[var(--text-muted)] font-medium">Website</th>
              </tr>
            </thead>
            <tbody>
              {orgs.map((o) => (
                <tr key={o.id} className="border-b border-white/[0.03] last:border-0 hover:bg-white/[0.02]">
                  <td className="px-3 py-1.5 text-white truncate max-w-[200px]">{o.name}</td>
                  <td className="px-3 py-1.5">
                    {o.icp_score != null ? (
                      <span
                        className={cn(
                          "font-semibold",
                          o.icp_score >= 75
                            ? "text-[var(--accent-orange)]"
                            : o.icp_score >= 50
                              ? "text-yellow-400"
                              : "text-[var(--text-muted)]"
                        )}
                      >
                        {o.icp_score}
                      </span>
                    ) : (
                      <span className="text-[var(--text-muted)]">\u2014</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-[var(--text-muted)] truncate max-w-[120px]">
                    {o.category ?? "\u2014"}
                  </td>
                  <td className="px-3 py-1.5 text-[var(--text-muted)] truncate max-w-[160px]">
                    {o.website ? (
                      <span className="flex items-center gap-1">
                        <Globe className="h-3 w-3 shrink-0" />
                        {o.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
                      </span>
                    ) : (
                      "\u2014"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Progress Bar + Live Status Component
// ---------------------------------------------------------------------------

function ProgressBar({ completed, total }: { completed: number; total: number }) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-[var(--text-muted)]">
          {completed} / {total} processed
        </span>
        <span className="text-xs font-medium text-[var(--accent-orange)]">{pct}%</span>
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

function LiveStatusList({
  entries,
  entityType,
}: {
  entries: ProgressEntry[];
  entityType: "organization" | "person";
}) {
  if (entries.length === 0) return null;

  return (
    <div className="mt-3 rounded-lg bg-white/[0.02] border border-white/[0.06] overflow-hidden">
      <div className="max-h-[240px] overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-[var(--glass-bg)] z-10">
            <tr className="border-b border-[var(--glass-border)] text-left">
              <th className="px-3 py-2 text-[var(--text-muted)] font-medium">
                {entityType === "organization" ? "Organization" : "Person"}
              </th>
              <th className="px-3 py-2 text-[var(--text-muted)] font-medium">Stage</th>
              {entityType === "organization" && (
                <th className="px-3 py-2 text-[var(--text-muted)] font-medium">ICP</th>
              )}
              <th className="px-3 py-2 text-[var(--text-muted)] font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, idx) => (
              <tr
                key={entry.id}
                className={cn(
                  "border-b border-white/[0.03] last:border-0",
                  idx === 0 && "animate-[fadeIn_0.3s_ease-in-out]"
                )}
              >
                <td className="px-3 py-1.5 text-white truncate max-w-[200px]">
                  {entry.org_name ?? entry.target_id?.slice(0, 8) ?? "\u2014"}
                </td>
                <td className="px-3 py-1.5 text-[var(--text-muted)]">
                  {entry.stage || entry.job_type.replace("enrichment_", "")}
                </td>
                {entityType === "organization" && (
                  <td className="px-3 py-1.5">
                    {entry.icp_score != null ? (
                      <span
                        className={cn(
                          "font-semibold",
                          entry.icp_score >= 75
                            ? "text-[var(--accent-orange)]"
                            : entry.icp_score >= 50
                              ? "text-yellow-400"
                              : "text-[var(--text-muted)]"
                        )}
                      >
                        {entry.icp_score}
                      </span>
                    ) : (
                      <span className="text-[var(--text-muted)]">\u2014</span>
                    )}
                  </td>
                )}
                <td className="px-3 py-1.5">
                  <Badge
                    variant={
                      entry.status === "completed"
                        ? "sent"
                        : entry.status === "failed"
                          ? "failed"
                          : "processing"
                    }
                    className="text-[10px]"
                  >
                    {entry.status}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pick-from-list Panel: Persons
// ---------------------------------------------------------------------------

function PickPersonPanel({
  selectedIds,
  onSelectionChange,
}: {
  selectedIds: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
}) {
  const [search, setSearch] = useState("");
  const [allPersons, setAllPersons] = useState<
    { id: string; full_name: string; email: string | null; primary_org: string | null }[]
  >([]);
  const [loading, setLoading] = useState(true);

  // Load persons once
  useEffect(() => {
    (async () => {
      setLoading(true);
      const supabase = useSupabase();
      // Fetch up to 2000 from the view; search is done client-side
      const { data } = await supabase
        .from("persons_with_icp")
        .select("id, full_name, email, primary_org_name")
        .order("full_name")
        .limit(2000);

      if (data) {
        setAllPersons(
          (data as { id: string; full_name: string; email: string | null; primary_org_name: string | null }[]).map((p) => ({
            id: p.id,
            full_name: p.full_name,
            email: p.email,
            primary_org: p.primary_org_name,
          }))
        );
      }
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return allPersons;
    const q = search.toLowerCase();
    return allPersons.filter(
      (p) =>
        p.full_name.toLowerCase().includes(q) ||
        (p.email && p.email.toLowerCase().includes(q))
    );
  }, [allPersons, search]);

  const toggleOne = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectionChange(next);
  };

  const selectAllVisible = () => {
    const next = new Set(selectedIds);
    for (const p of filtered) next.add(p.id);
    onSelectionChange(next);
  };

  const deselectAllVisible = () => {
    const visibleIds = new Set(filtered.map((p) => p.id));
    const next = new Set(selectedIds);
    for (const id of visibleIds) next.delete(id);
    onSelectionChange(next);
  };

  if (loading) {
    return (
      <div className="mt-3 p-4 rounded-lg bg-white/[0.02] border border-white/[0.06]">
        <div className="flex items-center gap-2 text-[var(--text-muted)] text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading persons...
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-xl glass p-4">
      {/* Search + actions */}
      <div className="flex items-center gap-3 mb-3">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-muted)]" />
          <input
            type="text"
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={cn(
              "w-full rounded-lg pl-8 pr-3 py-1.5 text-xs",
              "bg-[var(--glass-bg)] border border-[var(--glass-border)]",
              "text-white placeholder:text-[var(--text-muted)]",
              "focus:outline-none focus:ring-2 focus:ring-[var(--accent-orange)]/40 focus:border-[var(--accent-orange)]/50"
            )}
          />
        </div>
        <button
          onClick={selectAllVisible}
          className="text-[10px] font-medium text-[var(--accent-orange)] hover:text-[var(--accent-orange)]/80 whitespace-nowrap"
        >
          Select all
        </button>
        <button
          onClick={deselectAllVisible}
          className="text-[10px] font-medium text-[var(--text-muted)] hover:text-white whitespace-nowrap"
        >
          Deselect all
        </button>
      </div>

      {/* Selection count */}
      <div className="text-xs text-[var(--text-muted)] mb-2">
        <span className="text-[var(--accent-orange)] font-medium">{selectedIds.size}</span>
        {" "}of {allPersons.length} selected
      </div>

      {/* Scrollable list */}
      <div className="max-h-[400px] overflow-y-auto rounded-lg bg-white/[0.02] border border-white/[0.06]">
        {filtered.length === 0 ? (
          <div className="p-4 text-xs text-[var(--text-muted)] text-center">No persons found</div>
        ) : (
          filtered.map((p) => (
            <label
              key={p.id}
              className="flex items-center gap-3 px-3 py-1.5 hover:bg-white/[0.04] cursor-pointer transition-colors duration-100 border-b border-white/[0.03] last:border-0"
            >
              <input
                type="checkbox"
                checked={selectedIds.has(p.id)}
                onChange={() => toggleOne(p.id)}
                className="accent-[var(--accent-orange)] h-3.5 w-3.5 shrink-0"
              />
              <span className="text-xs text-white truncate min-w-[140px] max-w-[200px]">{p.full_name}</span>
              <span className="text-xs text-[var(--text-muted)] truncate max-w-[160px]">{p.primary_org ?? ""}</span>
              <span className="text-xs text-[var(--text-muted)] truncate max-w-[180px] ml-auto">{p.email ?? ""}</span>
            </label>
          ))
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pick-from-list Panel: Organizations
// ---------------------------------------------------------------------------

function PickOrgPanel({
  selectedIds,
  onSelectionChange,
}: {
  selectedIds: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
}) {
  const [search, setSearch] = useState("");
  const [allOrgs, setAllOrgs] = useState<PreviewOrg[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const supabase = useSupabase();
      const { data } = await supabase
        .from("organizations")
        .select("id, name, icp_score, category, website")
        .order("name")
        .limit(2000);

      if (data) setAllOrgs(data as PreviewOrg[]);
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return allOrgs;
    const q = search.toLowerCase();
    return allOrgs.filter((o) => o.name.toLowerCase().includes(q));
  }, [allOrgs, search]);

  const toggleOne = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectionChange(next);
  };

  const selectAllVisible = () => {
    const next = new Set(selectedIds);
    for (const o of filtered) next.add(o.id);
    onSelectionChange(next);
  };

  const deselectAllVisible = () => {
    const visibleIds = new Set(filtered.map((o) => o.id));
    const next = new Set(selectedIds);
    for (const id of visibleIds) next.delete(id);
    onSelectionChange(next);
  };

  if (loading) {
    return (
      <div className="mt-3 p-4 rounded-lg bg-white/[0.02] border border-white/[0.06]">
        <div className="flex items-center gap-2 text-[var(--text-muted)] text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading organizations...
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-xl glass p-4">
      {/* Search + actions */}
      <div className="flex items-center gap-3 mb-3">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-muted)]" />
          <input
            type="text"
            placeholder="Search by name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={cn(
              "w-full rounded-lg pl-8 pr-3 py-1.5 text-xs",
              "bg-[var(--glass-bg)] border border-[var(--glass-border)]",
              "text-white placeholder:text-[var(--text-muted)]",
              "focus:outline-none focus:ring-2 focus:ring-[var(--accent-orange)]/40 focus:border-[var(--accent-orange)]/50"
            )}
          />
        </div>
        <button
          onClick={selectAllVisible}
          className="text-[10px] font-medium text-[var(--accent-orange)] hover:text-[var(--accent-orange)]/80 whitespace-nowrap"
        >
          Select all
        </button>
        <button
          onClick={deselectAllVisible}
          className="text-[10px] font-medium text-[var(--text-muted)] hover:text-white whitespace-nowrap"
        >
          Deselect all
        </button>
      </div>

      {/* Selection count */}
      <div className="text-xs text-[var(--text-muted)] mb-2">
        <span className="text-[var(--accent-orange)] font-medium">{selectedIds.size}</span>
        {" "}of {allOrgs.length} selected
      </div>

      {/* Scrollable list */}
      <div className="max-h-[400px] overflow-y-auto rounded-lg bg-white/[0.02] border border-white/[0.06]">
        {filtered.length === 0 ? (
          <div className="p-4 text-xs text-[var(--text-muted)] text-center">No organizations found</div>
        ) : (
          filtered.map((o) => (
            <label
              key={o.id}
              className="flex items-center gap-3 px-3 py-1.5 hover:bg-white/[0.04] cursor-pointer transition-colors duration-100 border-b border-white/[0.03] last:border-0"
            >
              <input
                type="checkbox"
                checked={selectedIds.has(o.id)}
                onChange={() => toggleOne(o.id)}
                className="accent-[var(--accent-orange)] h-3.5 w-3.5 shrink-0"
              />
              <span className="text-xs text-white truncate min-w-[140px] max-w-[200px]">{o.name}</span>
              {o.icp_score != null && (
                <Badge
                  variant={o.icp_score >= 75 ? "glass-orange" : o.icp_score >= 50 ? "draft" : "default"}
                  className="text-[10px] shrink-0"
                >
                  {o.icp_score}
                </Badge>
              )}
              <span className="text-xs text-[var(--text-muted)] truncate max-w-[100px]">{o.category ?? ""}</span>
              <span className="text-xs text-[var(--text-muted)] truncate max-w-[160px] ml-auto">
                {o.website ? o.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "") : ""}
              </span>
            </label>
          ))
        )}
      </div>
    </div>
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
  const [pickedPersonIds, setPickedPersonIds] = useState<Set<string>>(new Set());
  const [isRunning, setIsRunning] = useState(false);
  const [lastResult, setLastResult] = useState<Record<string, unknown> | null>(
    null
  );

  // Preview state
  const [previewPersons, setPreviewPersons] = useState<PreviewPerson[]>([]);
  const [previewPersonCount, setPreviewPersonCount] = useState(0);
  const [previewLoading, setPreviewLoading] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Real-time progress state
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [progressEntries, setProgressEntries] = useState<ProgressEntry[]>([]);
  const [jobStartTime, setJobStartTime] = useState<string | null>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch preview whenever target/eventId changes
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      // "pick" target uses its own panel instead of the preview list
      if (target === "pick") {
        setPreviewPersons([]);
        setPreviewPersonCount(0);
        setPreviewLoading(false);
        return;
      }

      setPreviewLoading(true);
      const supabase = useSupabase();

      try {
        let query = supabase
          .from("persons")
          .select("id, full_name, email, linkedin_url, twitter_handle, phone", { count: "exact" });

        if (target === "selected" && preSelectedPersons.length > 0) {
          query = query.in("id", preSelectedPersons);
        } else if (target === "event" && eventId) {
          // Get person IDs from event participations
          const { data: participations } = await supabase
            .from("event_participations")
            .select("person_id")
            .eq("event_id", eventId)
            .not("person_id", "is", null);

          const personIds = (participations ?? [])
            .map((p: { person_id: string | null }) => p.person_id)
            .filter((id): id is string => id !== null);

          if (personIds.length === 0) {
            setPreviewPersons([]);
            setPreviewPersonCount(0);
            setPreviewLoading(false);
            return;
          }
          query = query.in("id", personIds);
        } else {
          // unenriched: persons without apollo_id
          query = query.is("apollo_id", null);
        }

        const { data, count } = await query.limit(200);
        setPreviewPersonCount(count ?? data?.length ?? 0);

        if (data) {
          // Fetch primary org names for the preview
          const personIds = data.map((p: Pick<Person, "id">) => p.id);
          const { data: orgLinks } = personIds.length > 0
            ? await supabase
                .from("person_organizations")
                .select("person_id, organization:organizations(name)")
                .in("person_id", personIds)
                .eq("is_primary", true)
            : { data: [] };

          const orgMap = new Map<string, string>();
          for (const link of orgLinks ?? []) {
            const l = link as unknown as { person_id: string; organization: { name: string } | null };
            const orgName = l.organization?.name;
            if (orgName) orgMap.set(l.person_id, orgName);
          }

          setPreviewPersons(
            (data as Pick<Person, "id" | "full_name" | "email" | "linkedin_url" | "twitter_handle" | "phone">[]).map((p) => ({
              id: p.id,
              full_name: p.full_name,
              email: p.email,
              linkedin_url: p.linkedin_url,
              twitter_handle: p.twitter_handle,
              phone: p.phone,
              primary_org: orgMap.get(p.id) ?? null,
            }))
          );
        }
      } catch {
        setPreviewPersons([]);
      } finally {
        setPreviewLoading(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [target, eventId, preSelectedPersons]);

  // Poll for progress while running
  useEffect(() => {
    if (!isRunning || !activeJobId) {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }

    const supabase = useSupabase();

    const poll = async () => {
      const { data } = await supabase
        .from("job_log")
        .select("id, target_id, status, job_type, metadata, created_at, error")
        .eq("target_table", "contacts")
        .gte("created_at", jobStartTime!)
        .neq("id", activeJobId)
        .order("created_at", { ascending: false })
        .limit(100);

      if (data) {
        setProgressEntries(
          (data as unknown as JobLog[]).map((j) => {
            const meta = (j.metadata ?? {}) as Record<string, unknown>;
            return {
              id: j.id,
              target_id: j.target_id,
              org_name: (meta.full_name as string) ?? (meta.contact_name as string) ?? null,
              status: j.status,
              icp_score: null,
              job_type: j.job_type,
              created_at: j.created_at,
              error: j.error,
              stage: null,
            };
          })
        );
      }
    };

    pollRef.current = setInterval(poll, 2000);
    poll(); // immediate first poll

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [isRunning, activeJobId, jobStartTime]);

  function toggleField(field: EnrichField) {
    setFields((prev) =>
      prev.includes(field) ? prev.filter((f) => f !== field) : [...prev, field]
    );
  }

  async function handleRun() {
    if (fields.length === 0) return;
    setIsRunning(true);
    setLastResult(null);
    setProgressEntries([]);
    setJobStartTime(new Date().toISOString());

    try {
      const body: Record<string, unknown> = { fields, source };

      if (target === "selected" && preSelectedPersons.length > 0) {
        body.personIds = preSelectedPersons;
      } else if (target === "pick" && pickedPersonIds.size > 0) {
        body.personIds = Array.from(pickedPersonIds);
      } else if (target === "event" && eventId) {
        body.eventId = eventId;
      }

      const res = await fetch("/api/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (data.jobId) setActiveJobId(data.jobId);
      setLastResult(data);
      onJobComplete();
    } catch {
      setLastResult({ error: "Network error" });
    } finally {
      setIsRunning(false);
      setActiveJobId(null);
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
              { value: "pick", label: "Select from list" },
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

      {/* Pick-from-list panel */}
      {target === "pick" && (
        <PickPersonPanel selectedIds={pickedPersonIds} onSelectionChange={setPickedPersonIds} />
      )}

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

      {/* Preview List */}
      {!isRunning && !lastResult && (
        <PreviewPersonList persons={previewPersons} isLoading={previewLoading} totalCount={previewPersonCount} />
      )}

      {/* Run button */}
      <div className="mt-4">
        <button
          onClick={handleRun}
          disabled={isRunning || fields.length === 0 || (target === "pick" && pickedPersonIds.size === 0)}
          className={cn(
            "flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
            "bg-[var(--accent-orange)]/15 text-[var(--accent-orange)] border border-[var(--accent-orange)]/20",
            "hover:bg-[var(--accent-orange)]/25",
            (isRunning || fields.length === 0 || (target === "pick" && pickedPersonIds.size === 0)) && "opacity-50 cursor-not-allowed"
          )}
        >
          {isRunning ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Play className="h-4 w-4" />
          )}
          {isRunning ? "Running..." : "Run Enrichment"}
        </button>
      </div>

      {/* Running state with real-time progress */}
      {isRunning && (
        <div className="mt-4 space-y-3">
          <div className="p-4 rounded-lg bg-white/[0.04] border border-white/[0.06]">
            <div className="flex items-center gap-3 mb-3">
              <Loader2 className="h-5 w-5 animate-spin text-[var(--accent-orange)]" />
              <div>
                <p className="text-sm text-white font-medium">
                  Processing persons...
                </p>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  Running Apollo enrichment for {fields.join(", ")} fields.
                </p>
              </div>
            </div>
            <ProgressBar
              completed={progressEntries.filter((e) => e.status === "completed" || e.status === "failed").length}
              total={previewPersons.length || 1}
            />
          </div>
          <LiveStatusList entries={progressEntries} entityType="person" />
        </div>
      )}

      {lastResult && !isRunning && (
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
  {
    key: "people_finder",
    label: "People Finder",
    description: "Find contacts at org",
    icon: Users,
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
  const [pickedOrgIds, setPickedOrgIds] = useState<Set<string>>(new Set());
  const [pfPerCompany, setPfPerCompany] = useState(5);
  const [pfSeniorities, setPfSeniorities] = useState<string[]>(["owner", "founder", "c_suite", "vp", "director"]);
  const [pfDepartments, setPfDepartments] = useState<string[]>([]);

  // Preview state
  const [previewOrgs, setPreviewOrgs] = useState<PreviewOrg[]>([]);
  const [previewOrgCount, setPreviewOrgCount] = useState(0);
  const [previewLoading, setPreviewLoading] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Real-time progress state
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [progressEntries, setProgressEntries] = useState<ProgressEntry[]>([]);
  const [jobStartTime, setJobStartTime] = useState<string | null>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch preview whenever target/eventId/initiativeId/icpThreshold changes
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      // "pick" target uses its own panel instead of the preview list
      if (target === "pick") {
        setPreviewOrgs([]);
        setPreviewOrgCount(0);
        setPreviewLoading(false);
        return;
      }

      setPreviewLoading(true);
      const supabase = useSupabase();

      try {
        // Helper to set preview with count
        const setResult = (data: PreviewOrg[] | null, count: number | null) => {
          setPreviewOrgs((data as PreviewOrg[]) ?? []);
          setPreviewOrgCount(count ?? data?.length ?? 0);
        };

        if (target === "selected" && preSelectedOrgs.length > 0) {
          const { data, count } = await supabase
            .from("organizations")
            .select("id, name, icp_score, category, website", { count: "exact" })
            .in("id", preSelectedOrgs);

          setResult(data as PreviewOrg[], count);
        } else if (target === "event" && eventId) {
          const { data: participations } = await supabase
            .from("event_participations")
            .select("organization_id")
            .eq("event_id", eventId)
            .not("organization_id", "is", null);

          const orgIds = Array.from(
            new Set(
              (participations ?? [])
                .map((p: { organization_id: string | null }) => p.organization_id)
                .filter((id): id is string => id !== null)
            )
          );

          if (orgIds.length === 0) {
            setPreviewOrgs([]);
            setPreviewOrgCount(0);
            setPreviewLoading(false);
            return;
          }

          const { data, count } = await supabase
            .from("organizations")
            .select("id, name, icp_score, category, website", { count: "exact" })
            .in("id", orgIds)
            .limit(200);

          setResult(data as PreviewOrg[], count);
        } else if (target === "initiative" && initiativeId) {
          const { data: enrollments } = await supabase
            .from("initiative_enrollments")
            .select("organization_id")
            .eq("initiative_id", initiativeId)
            .not("organization_id", "is", null);

          const orgIds = Array.from(
            new Set(
              (enrollments ?? [])
                .map((e: { organization_id: string | null }) => e.organization_id)
                .filter((id): id is string => id !== null)
            )
          );

          if (orgIds.length === 0) {
            setPreviewOrgs([]);
            setPreviewOrgCount(0);
            setPreviewLoading(false);
            return;
          }

          const { data, count } = await supabase
            .from("organizations")
            .select("id, name, icp_score, category, website", { count: "exact" })
            .in("id", orgIds)
            .limit(200);

          setResult(data as PreviewOrg[], count);
        } else if (target === "icp_below") {
          const { data, count } = await supabase
            .from("organizations")
            .select("id, name, icp_score, category, website", { count: "exact" })
            .or(`icp_score.is.null,icp_score.lt.${icpThreshold}`)
            .limit(200);

          setResult(data as PreviewOrg[], count);
        } else {
          // unenriched
          const { data, count } = await supabase
            .from("organizations")
            .select("id, name, icp_score, category, website", { count: "exact" })
            .is("icp_score", null)
            .limit(200);

          setResult(data as PreviewOrg[], count);
        }
      } catch {
        setPreviewOrgs([]);
        setPreviewOrgCount(0);
      } finally {
        setPreviewLoading(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [target, eventId, initiativeId, icpThreshold, preSelectedOrgs]);

  // Poll for progress while running
  useEffect(() => {
    if (!isRunning || !jobStartTime) {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }

    const supabase = useSupabase();

    const poll = async () => {
      // Query individual org enrichment job_log entries created after job start
      const { data } = await supabase
        .from("job_log")
        .select("id, target_id, status, job_type, metadata, created_at, error")
        .eq("target_table", "organizations")
        .in("job_type", ["enrichment_full", "enrichment_apollo", "enrichment_perplexity", "enrichment_gemini", "enrichment_people_finder"])
        .gte("created_at", jobStartTime)
        .order("created_at", { ascending: false })
        .limit(500);

      if (data) {
        // Deduplicate by target_id: keep the latest entry per org
        const byOrg = new Map<string, ProgressEntry>();
        for (const j of data as unknown as JobLog[]) {
          if (!j.target_id) continue;
          const meta = (j.metadata ?? {}) as Record<string, unknown>;
          const existing = byOrg.get(j.target_id);
          // Prefer completed/failed over processing, prefer later entries
          if (
            !existing ||
            (existing.status === "processing" && j.status !== "processing") ||
            new Date(j.created_at) > new Date(existing.created_at)
          ) {
            const stageLabel = (() => {
              switch (j.job_type) {
                case "enrichment_apollo": return "Firmographics";
                case "enrichment_perplexity": return "Researching";
                case "enrichment_gemini": return "ICP Scoring";
                case "enrichment_people_finder": return "Finding People";
                case "enrichment_full":
                  return j.status === "completed" ? "Complete" : "Running Pipeline";
                default: return null;
              }
            })();
            byOrg.set(j.target_id, {
              id: j.id,
              target_id: j.target_id,
              org_name: (meta.org_name as string) ?? null,
              status: j.status,
              icp_score: (meta.icp_score as number) ?? null,
              job_type: j.job_type,
              created_at: j.created_at,
              error: j.error,
              stage: stageLabel,
            });
          }
        }

        // Sort newest first
        const entries = Array.from(byOrg.values()).sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        setProgressEntries(entries);
      }
    };

    pollRef.current = setInterval(poll, 2000);
    poll(); // immediate first poll

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [isRunning, jobStartTime]);

  function toggleStage(stage: OrgStage) {
    if (stage === "people_finder") {
      setStages((prev) =>
        prev.includes("people_finder")
          ? prev.filter((s) => s !== "people_finder")
          : [...prev, "people_finder"]
      );
      return;
    }
    if (stage === "full") {
      setStages((prev) => {
        const hasPf = prev.includes("people_finder");
        return hasPf ? ["full", "people_finder"] : ["full"];
      });
      return;
    }
    setStages((prev) => {
      const withoutFull = prev.filter((s) => s !== "full");
      if (withoutFull.includes(stage)) {
        const next = withoutFull.filter((s) => s !== stage);
        const nonPf = next.filter((s) => s !== "people_finder");
        if (nonPf.length === 0) {
          return next.includes("people_finder") ? ["full", "people_finder"] : ["full"];
        }
        return next;
      }
      return [...withoutFull, stage];
    });
  }

  async function handleRun() {
    setIsRunning(true);
    setLastResult(null);
    setProgressEntries([]);
    setJobStartTime(new Date().toISOString());

    try {
      const body: Record<string, unknown> = {
        stages,
      };

      if (stages.includes("people_finder")) {
        body.peopleFinderConfig = {
          perCompany: pfPerCompany,
          seniorities: pfSeniorities,
          departments: pfDepartments,
        };
      }

      if (target === "selected" && preSelectedOrgs.length > 0) {
        body.organizationIds = preSelectedOrgs;
      } else if (target === "pick" && pickedOrgIds.size > 0) {
        body.organizationIds = Array.from(pickedOrgIds);
      } else if (target === "event" && eventId) {
        body.eventId = eventId;
      } else if (target === "initiative" && initiativeId) {
        body.initiativeId = initiativeId;
      } else if (target === "icp_below") {
        body.icpBelow = icpThreshold;
      }
      // "unenriched" -- API handles it (default)

      const res = await fetch("/api/enrich/organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data: OrgEnrichResponse = await res.json();
      if (data.jobId) setActiveJobId(data.jobId);
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
      setActiveJobId(null);
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

  const completedCount = progressEntries.filter(
    (e) => e.status === "completed" || e.status === "failed"
  ).length;

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
                : key === "people_finder"
                  ? stages.includes("people_finder")
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
        {stages.includes("people_finder") && (
          <div className="mt-4 p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
            <div className="flex items-center gap-2 mb-3">
              <Users className="h-4 w-4 text-[var(--accent-orange)]" />
              <span className="text-sm font-medium text-white">People Finder Settings</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-xs text-[var(--text-muted)] mb-1 block">Contacts per company</label>
                <input
                  type="number"
                  min={1}
                  max={25}
                  value={pfPerCompany}
                  onChange={(e) => setPfPerCompany(Math.min(25, Math.max(1, Number(e.target.value))))}
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
              <div>
                <label className="text-xs text-[var(--text-muted)] mb-1 block">Seniority levels</label>
                <div className="flex flex-wrap gap-1.5">
                  {SENIORITY_OPTIONS.map(({ value, label }) => (
                    <button
                      key={value}
                      onClick={() =>
                        setPfSeniorities((prev) =>
                          prev.includes(value) ? prev.filter((s) => s !== value) : [...prev, value]
                        )
                      }
                      className={cn(
                        "px-2 py-1 rounded-md text-[10px] font-medium border transition-all duration-150",
                        pfSeniorities.includes(value)
                          ? "bg-[var(--accent-orange)]/15 text-[var(--accent-orange)] border-[var(--accent-orange)]/20"
                          : "bg-[var(--glass-bg)] text-[var(--text-muted)] border-[var(--glass-border)] hover:text-white"
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-[var(--text-muted)] mb-1 block">
                  Departments <span className="text-[var(--text-muted)]">(empty = all)</span>
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {DEPARTMENT_OPTIONS.map(({ value, label }) => (
                    <button
                      key={value}
                      onClick={() =>
                        setPfDepartments((prev) =>
                          prev.includes(value) ? prev.filter((d) => d !== value) : [...prev, value]
                        )
                      }
                      className={cn(
                        "px-2 py-1 rounded-md text-[10px] font-medium border transition-all duration-150",
                        pfDepartments.includes(value)
                          ? "bg-[var(--accent-indigo)]/15 text-[var(--accent-indigo)] border-[var(--accent-indigo)]/20"
                          : "bg-[var(--glass-bg)] text-[var(--text-muted)] border-[var(--glass-border)] hover:text-white"
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
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
              { value: "pick", label: "Select from list" },
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

      {/* Pick-from-list panel */}
      {target === "pick" && (
        <PickOrgPanel selectedIds={pickedOrgIds} onSelectionChange={setPickedOrgIds} />
      )}

      {/* Preview List */}
      {!isRunning && !lastResult && (
        <PreviewOrgList orgs={previewOrgs} isLoading={previewLoading} totalCount={previewOrgCount} />
      )}

      {/* Run button */}
      <div className="mt-4">
        <button
          onClick={handleRun}
          disabled={isRunning || (target === "pick" && pickedOrgIds.size === 0)}
          className={cn(
            "flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
            "bg-[var(--accent-orange)]/15 text-[var(--accent-orange)] border border-[var(--accent-orange)]/20",
            "hover:bg-[var(--accent-orange)]/25",
            (isRunning || (target === "pick" && pickedOrgIds.size === 0)) && "opacity-50 cursor-not-allowed"
          )}
        >
          {isRunning ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Zap className="h-4 w-4" />
          )}
          {isRunning ? "Running Pipeline..." : "Run Pipeline"}
        </button>
      </div>

      {/* Running state with real-time progress */}
      {isRunning && (
        <div className="mt-4 space-y-3">
          <div className="p-4 rounded-lg bg-white/[0.04] border border-white/[0.06]">
            <div className="flex items-center gap-3 mb-3">
              <Loader2 className="h-5 w-5 animate-spin text-[var(--accent-orange)]" />
              <div>
                <p className="text-sm text-white font-medium">
                  Processing {target === "pick" ? pickedOrgIds.size : previewOrgCount || previewOrgs.length} organizations...
                </p>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  {(() => {
                    const latestProcessing = progressEntries.find(e => e.status === "processing");
                    if (latestProcessing?.stage) {
                      return `${latestProcessing.org_name ?? "..."}: ${latestProcessing.stage}`;
                    }
                    return `Running ${stages.includes("full") ? "full pipeline" : stages.join(" + ")} enrichment.`;
                  })()}
                </p>
              </div>
            </div>
            <ProgressBar
              completed={completedCount}
              total={
                target === "pick"
                  ? pickedOrgIds.size || 1
                  : previewOrgCount || previewOrgs.length || 1
              }
            />
          </div>
          <LiveStatusList entries={progressEntries} entityType="organization" />
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
                  <>
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
                    {(lastResult.people_found ?? 0) > 0 && (
                      <div className="grid grid-cols-3 gap-4 mt-3 pt-3 border-t border-white/[0.06]">
                        <div>
                          <div className="text-xs text-[var(--text-muted)]">People Found</div>
                          <div className="text-lg font-semibold text-white">{lastResult.people_found}</div>
                        </div>
                        <div>
                          <div className="text-xs text-[var(--text-muted)]">New Persons Created</div>
                          <div className="text-lg font-semibold text-[var(--accent-orange)]">{lastResult.people_created}</div>
                        </div>
                        <div>
                          <div className="text-xs text-[var(--text-muted)]">Merged with Existing</div>
                          <div className="text-lg font-semibold text-[var(--accent-indigo)]">{lastResult.people_merged}</div>
                        </div>
                      </div>
                    )}
                  </>
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
// ICP Score Badge helper
// ---------------------------------------------------------------------------

function IcpScoreBadge({ score }: { score: number | null }) {
  if (score == null) return <span className="text-[var(--text-muted)]">{"\u2014"}</span>;
  const variant =
    score >= 90
      ? "bg-green-500/15 text-green-400 border-green-500/25"
      : score >= 75
        ? "bg-yellow-500/15 text-yellow-400 border-yellow-500/25"
        : score >= 50
          ? "bg-orange-500/15 text-orange-400 border-orange-500/25"
          : "bg-gray-500/15 text-gray-400 border-gray-500/25";
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border", variant)}>
      {score}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Child Job Result Types
// ---------------------------------------------------------------------------

interface ChildJobEntry {
  id: string;
  target_id: string | null;
  status: string;
  job_type: string;
  error: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

interface OrgDetail {
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

interface OrgSignalEntry {
  id: string;
  signal_type: string;
  description: string;
  date: string | null;
  source: string | null;
}

// ---------------------------------------------------------------------------
// Org Child Row (expandable detail for one org within a job)
// ---------------------------------------------------------------------------

function OrgChildRow({ entry, isLast }: { entry: ChildJobEntry; isLast: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [orgDetail, setOrgDetail] = useState<OrgDetail | null>(null);
  const [signals, setSignals] = useState<OrgSignalEntry[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const meta = (entry.metadata ?? {}) as Record<string, unknown>;
  const orgName = (meta.org_name as string) ?? (meta.organization_name as string) ?? entry.target_id?.slice(0, 8) ?? "Unknown";
  const icpScore = (meta.icp_score as number) ?? null;
  const stageCompleted = entry.job_type.replace("enrichment_", "");
  const signalsCount = (meta.signals_created as number) ?? (meta.signal_count as number) ?? 0;

  async function loadDetail() {
    if (!entry.target_id || orgDetail) return;
    setLoadingDetail(true);
    try {
      const supabase = useSupabase();
      const [orgRes, sigRes] = await Promise.all([
        supabase
          .from("organizations")
          .select("id, name, description, context, usp, icp_score, icp_reason, website, category")
          .eq("id", entry.target_id)
          .single(),
        supabase
          .from("organization_signals")
          .select("id, signal_type, description, date, source")
          .eq("organization_id", entry.target_id)
          .order("date", { ascending: false })
          .limit(20),
      ]);
      if (orgRes.data) setOrgDetail(orgRes.data as OrgDetail);
      if (sigRes.data) setSignals(sigRes.data as OrgSignalEntry[]);
    } catch {
      // silently fail
    } finally {
      setLoadingDetail(false);
    }
  }

  function handleToggle() {
    const next = !expanded;
    setExpanded(next);
    if (next) loadDetail();
  }

  const firmographics = {
    industry: (meta.industry as string) ?? (meta.apollo_industry as string) ?? null,
    employees: (meta.employee_count as number) ?? (meta.employees as number) ?? (meta.estimated_num_employees as number) ?? null,
    revenue: (meta.annual_revenue as string) ?? (meta.revenue as string) ?? (meta.annual_revenue_printed as string) ?? null,
    funding: (meta.total_funding as string) ?? (meta.funding as string) ?? (meta.total_funding_printed as string) ?? null,
  };
  const hasFirmographics = Object.values(firmographics).some(Boolean);
  const strengths = (meta.strengths as string[]) ?? null;
  const weaknesses = (meta.weaknesses as string[]) ?? null;

  return (
    <>
      <tr
        onClick={handleToggle}
        className={cn(
          "border-b border-white/[0.03] cursor-pointer transition-all duration-150",
          expanded ? "bg-white/[0.04]" : "hover:bg-white/[0.02]",
          isLast && !expanded && "border-0"
        )}
      >
        <td className="pl-6 pr-2 py-2 w-6">
          {expanded ? <ChevronDown className="h-3.5 w-3.5 text-[var(--text-muted)]" /> : <ChevronRight className="h-3.5 w-3.5 text-[var(--text-muted)]" />}
        </td>
        <td className="px-3 py-2 text-white text-xs truncate max-w-[200px]">{orgName}</td>
        <td className="px-3 py-2"><IcpScoreBadge score={icpScore} /></td>
        <td className="px-3 py-2 text-[var(--text-muted)] text-xs capitalize">{stageCompleted}</td>
        <td className="px-3 py-2 text-[var(--text-secondary)] text-xs">{signalsCount}</td>
        <td className="px-3 py-2">
          <Badge variant={entry.status === "completed" ? "sent" : entry.status === "failed" ? "failed" : "processing"} className="text-[10px]">{entry.status}</Badge>
        </td>
      </tr>
      {expanded && (
        <tr className={cn("border-b border-white/[0.03]", isLast && "border-0")}>
          <td colSpan={6} className="px-6 py-4">
            {loadingDetail && !orgDetail ? (
              <div className="flex items-center gap-2 text-[var(--text-muted)] text-xs py-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading details...
              </div>
            ) : (
              <div className="space-y-3">
                {(orgDetail?.description || (meta.description as string)) && (
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1">Description</div>
                    <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{orgDetail?.description ?? (meta.description as string)}</p>
                  </div>
                )}
                {(orgDetail?.context || (meta.context as string)) && (
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1">Context</div>
                    <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{orgDetail?.context ?? (meta.context as string)}</p>
                  </div>
                )}
                {(orgDetail?.usp || (meta.usp as string)) && (
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1">Entry Angle (USP)</div>
                    <p className="text-xs text-[var(--accent-orange)] leading-relaxed">{orgDetail?.usp ?? (meta.usp as string)}</p>
                  </div>
                )}
                {(orgDetail?.icp_reason || (meta.icp_reason as string)) && (
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1">ICP Reason</div>
                    <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{orgDetail?.icp_reason ?? (meta.icp_reason as string)}</p>
                  </div>
                )}
                {(strengths || weaknesses) && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {strengths && strengths.length > 0 && (
                      <div>
                        <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1 flex items-center gap-1"><TrendingUp className="h-3 w-3" /> Strengths</div>
                        <ul className="space-y-0.5">
                          {strengths.map((s, i) => (<li key={i} className="text-xs text-green-400/80 flex items-start gap-1.5"><span className="text-green-400/50 mt-0.5">+</span>{s}</li>))}
                        </ul>
                      </div>
                    )}
                    {weaknesses && weaknesses.length > 0 && (
                      <div>
                        <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1 flex items-center gap-1"><AlertCircle className="h-3 w-3" /> Weaknesses</div>
                        <ul className="space-y-0.5">
                          {weaknesses.map((w, i) => (<li key={i} className="text-xs text-red-400/80 flex items-start gap-1.5"><span className="text-red-400/50 mt-0.5">-</span>{w}</li>))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
                {signals.length > 0 && (
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1.5">Signals ({signals.length})</div>
                    <div className="space-y-1.5 max-h-[160px] overflow-y-auto scrollbar-thin">
                      {signals.map((sig) => (
                        <div key={sig.id} className="flex items-start gap-2 text-xs">
                          <Badge variant="glass-indigo" className="text-[9px] shrink-0 mt-0.5">{sig.signal_type}</Badge>
                          <span className="text-[var(--text-secondary)] flex-1">{sig.description}</span>
                          {sig.date && <span className="text-[var(--text-muted)] shrink-0 text-[10px]">{new Date(sig.date).toLocaleDateString()}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {hasFirmographics && (
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1.5">Firmographics</div>
                    <div className="flex flex-wrap gap-4 text-xs">
                      {firmographics.industry && (<div className="flex items-center gap-1.5 text-[var(--text-secondary)]"><Briefcase className="h-3 w-3 text-[var(--text-muted)]" />{firmographics.industry}</div>)}
                      {firmographics.employees != null && (<div className="flex items-center gap-1.5 text-[var(--text-secondary)]"><Users className="h-3 w-3 text-[var(--text-muted)]" />{typeof firmographics.employees === "number" ? firmographics.employees.toLocaleString() : firmographics.employees} employees</div>)}
                      {firmographics.revenue && (<div className="flex items-center gap-1.5 text-[var(--text-secondary)]"><DollarSign className="h-3 w-3 text-[var(--text-muted)]" />{firmographics.revenue}</div>)}
                      {firmographics.funding && (<div className="flex items-center gap-1.5 text-[var(--text-secondary)]"><TrendingUp className="h-3 w-3 text-[var(--text-muted)]" />{firmographics.funding} funding</div>)}
                    </div>
                  </div>
                )}
                {entry.error && (
                  <div className="p-2 rounded bg-red-500/5 border border-red-500/15">
                    <p className="text-xs text-red-400">{entry.error}</p>
                  </div>
                )}
                {!orgDetail?.description && !(meta.description as string) && !orgDetail?.context && !(meta.context as string) && !orgDetail?.usp && !(meta.usp as string) && signals.length === 0 && !hasFirmographics && !entry.error && (
                  <p className="text-xs text-[var(--text-muted)] italic">No enrichment details available for this organization.</p>
                )}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Person Child Row (one person within an expanded person enrichment job)
// ---------------------------------------------------------------------------

function PersonChildRow({ entry, isLast }: { entry: ChildJobEntry; isLast: boolean }) {
  const meta = (entry.metadata ?? {}) as Record<string, unknown>;
  const personName = (meta.full_name as string) ?? (meta.contact_name as string) ?? (meta.person_name as string) ?? entry.target_id?.slice(0, 8) ?? "Unknown";
  const emailFound = !!(meta.email_found ?? meta.email);
  const linkedinFound = !!(meta.linkedin_found ?? meta.linkedin_url);
  const twitterFound = !!(meta.twitter_found ?? meta.twitter_handle);
  const phoneFound = !!(meta.phone_found ?? meta.phone);

  return (
    <tr className={cn("border-b border-white/[0.03] hover:bg-white/[0.02] transition-all duration-150", isLast && "border-0")}>
      <td className="pl-6 pr-2 py-2 w-6"><User className="h-3 w-3 text-[var(--text-muted)]" /></td>
      <td className="px-3 py-2 text-white text-xs truncate max-w-[200px]">{personName}</td>
      <td className="px-3 py-2" colSpan={2}>
        <div className="flex items-center gap-3 text-xs">
          <span className={emailFound ? "text-green-400" : "text-[var(--text-muted)]"}><Mail className="h-3 w-3 inline mr-0.5" />{emailFound ? "\u2713" : "\u2014"}</span>
          <span className={linkedinFound ? "text-green-400" : "text-[var(--text-muted)]"}><Linkedin className="h-3 w-3 inline mr-0.5" />{linkedinFound ? "\u2713" : "\u2014"}</span>
          <span className={twitterFound ? "text-green-400" : "text-[var(--text-muted)]"}><Twitter className="h-3 w-3 inline mr-0.5" />{twitterFound ? "\u2713" : "\u2014"}</span>
          <span className={phoneFound ? "text-green-400" : "text-[var(--text-muted)]"}><Phone className="h-3 w-3 inline mr-0.5" />{phoneFound ? "\u2713" : "\u2014"}</span>
        </div>
      </td>
      <td className="px-3 py-2" />
      <td className="px-3 py-2">
        <Badge variant={entry.status === "completed" ? "sent" : entry.status === "failed" ? "failed" : "processing"} className="text-[10px]">{entry.status}</Badge>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Job History Table (shared) -- with expandable result rows
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
    <div className="space-y-2">
      {jobs.map((job) => {
        const meta = (job.metadata ?? {}) as Record<string, unknown>;
        const isOrgJob = job.job_type.includes("organization");
        const timestamp = new Date(job.created_at);
        const timeStr = timestamp.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " " + timestamp.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

        // Org job stats
        const orgCount = (meta.org_count as number) ?? (meta.orgs_enriched as number) ?? null;
        const orgsEnriched = (meta.orgs_enriched as number) ?? null;
        const signalsCreated = (meta.signals_created as number) ?? null;
        const peopleFound = (meta.people_found as number) ?? null;

        // Person job stats
        const personsProcessed = (meta.contacts_processed as number) ?? (meta.persons_processed as number) ?? null;
        const emailsFound = (meta.emails_found as number) ?? null;
        const linkedinFound = (meta.linkedin_found as number) ?? null;

        return (
          <Link
            key={job.id}
            href={`/admin/enrichment/${job.id}`}
            className="flex items-center gap-3 px-4 py-3 rounded-xl glass hover:bg-white/[0.04] transition-all duration-200 group"
          >
            {/* Type badge */}
            <Badge variant={isOrgJob ? "glass-indigo" : "glass-orange"} className="text-[10px] shrink-0 w-[90px] text-center">
              {isOrgJob ? "Organization" : "Person"}
            </Badge>

            {/* Stats */}
            <div className="flex items-center gap-3 flex-1 min-w-0 text-xs">
              {isOrgJob ? (
                <>
                  {orgCount != null && (
                    <span className="text-white font-medium">{orgCount} org{orgCount !== 1 ? "s" : ""}</span>
                  )}
                  {orgsEnriched != null && (
                    <span className="text-[var(--text-muted)]">{orgsEnriched} enriched</span>
                  )}
                  {signalsCreated != null && signalsCreated > 0 && (
                    <span className="text-[var(--accent-indigo)]">{signalsCreated} signals</span>
                  )}
                  {peopleFound != null && peopleFound > 0 && (
                    <span className="text-[var(--accent-orange)]">{peopleFound} people found</span>
                  )}
                </>
              ) : (
                <>
                  {personsProcessed != null && (
                    <span className="text-white font-medium">{personsProcessed} person{personsProcessed !== 1 ? "s" : ""}</span>
                  )}
                  {emailsFound != null && emailsFound > 0 && (
                    <span className="text-[var(--accent-orange)]">{emailsFound} emails</span>
                  )}
                  {linkedinFound != null && linkedinFound > 0 && (
                    <span className="text-[var(--accent-indigo)]">{linkedinFound} linkedin</span>
                  )}
                </>
              )}
            </div>

            {/* Timestamp */}
            <span className="text-[10px] text-[var(--text-muted)] shrink-0 tabular-nums">
              {timeStr}
            </span>

            {/* Status */}
            <Badge
              variant={job.status === "completed" ? "sent" : job.status === "failed" ? "failed" : "processing"}
              className="text-[10px] shrink-0"
            >
              {job.status}
            </Badge>

            {/* Arrow */}
            <ArrowRight className="h-3.5 w-3.5 text-[var(--text-muted)] opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
          </Link>
        );
      })}
    </div>
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
      {/* Fade-in animation for live status entries */}
      <style jsx global>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(-4px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>

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
