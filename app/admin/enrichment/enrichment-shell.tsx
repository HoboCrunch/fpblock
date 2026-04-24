"use client";

import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from "react";
import { useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/queries/query-keys";
import { useEnrichmentJobs } from "@/lib/queries/use-enrichment-jobs";
import { useEnrichmentItems } from "@/lib/queries/use-enrichment-items";
import { useEvents } from "@/lib/queries/use-events";
import { useInitiatives } from "@/lib/queries/use-initiatives";
import { useEventPersonIds } from "@/lib/queries/use-event-affiliations";
import { GlassCard } from "@/components/ui/glass-card";
import { cn } from "@/lib/utils";
import { Settings2 } from "lucide-react";
import {
  EventRelationToggle,
  toggleToRelation,
} from "@/components/admin/event-relation-toggle";

import {
  CenterPanel,
  type CenterState,
} from "./components/center-panel";
import {
  ConfigPanel,
  type OrgStage,
  type EnrichField,
  type TargetType,
} from "./components/config-panel";
import {
  JobHistory,
} from "./components/job-history";
import type { FilterState } from "./components/filter-bar";
import type { OrgRow, PersonRow, OrgProgress } from "./components/entity-table";
import type { SummaryStripProps } from "./components/summary-strip";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EMPTY_FILTERS: FilterState = {
  search: "",
  event: "",
  initiative: "",
  icpMin: "",
  icpMax: "",
  status: "",
  categoryOrSource: "",
};

// ---------------------------------------------------------------------------
// Shell Component
// ---------------------------------------------------------------------------

export function EnrichmentShell() {
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const preSelectedOrgs = useMemo(
    () => searchParams.get("organizations")?.split(",").filter(Boolean) ?? [],
    [searchParams]
  );
  const preSelectedPersons = useMemo(
    () => searchParams.get("persons")?.split(",").filter(Boolean) ?? [],
    [searchParams]
  );
  const retryJobId = searchParams.get("retry");

  // Determine default tab from query params
  const defaultTab: "persons" | "organizations" = retryJobId
    ? "organizations"
    : preSelectedOrgs.length > 0
      ? "organizations"
      : preSelectedPersons.length > 0
        ? "persons"
        : "organizations";

  // ---- Tab ----
  const [activeTab, setActiveTab] = useState<"persons" | "organizations">(defaultTab);

  // ---- Center state machine ----
  const [centerState, setCenterState] = useState<CenterState>("list");

  // ---- Selection ----
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // ---- Filters ----
  const [filters, setFilters] = useState<FilterState>({ ...EMPTY_FILTERS });

  // ---- Config state (kept here since it interacts with run logic) ----
  const [stages, setStages] = useState<OrgStage[]>(["apollo", "perplexity", "gemini"]);
  const [personFields, setPersonFields] = useState<EnrichField[]>(["email", "linkedin"]);
  const [pfPerCompany, setPfPerCompany] = useState(5);
  const [pfSeniorities, setPfSeniorities] = useState([
    "Owner", "Founder", "C-Suite", "VP", "Director",
  ]);
  const [pfDepartments, setPfDepartments] = useState<string[]>([]);

  // ---- Target ----
  const [target, setTarget] = useState<TargetType>("unenriched");
  const [eventId, setEventId] = useState("");
  const [initiativeId, setInitiativeId] = useState("");
  const [icpThreshold, setIcpThreshold] = useState(75);
  const [savedListId, setSavedListId] = useState("");

  // ---- Event relation toggles (only applies when target === "event") ----
  const [speakerOn, setSpeakerOn] = useState(true);
  const [orgAffiliatedOn, setOrgAffiliatedOn] = useState(true);
  const eventRelation = toggleToRelation(speakerOn, orgAffiliatedOn);

  // ---- Running ----
  const [isRunning, setIsRunning] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [jobStartTime, setJobStartTime] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // ---- Progress ----
  const [progressData, setProgressData] = useState<Map<string, OrgProgress>>(new Map());
  const [activeStages, setActiveStages] = useState<Map<string, string>>(new Map());
  const [progressCompleted, setProgressCompleted] = useState(0);
  const [progressTotal, setProgressTotal] = useState(0);

  // ---- Queued items (captured at run time for immediate display) ----
  const [queuedItems, setQueuedItems] = useState<(OrgRow | PersonRow)[]>([]);

  // ---- Results ----
  const [resultStats, setResultStats] = useState<SummaryStripProps["stats"] | undefined>();
  const [resultOutcomes, setResultOutcomes] = useState<Map<string, "enriched" | "failed" | "skipped">>(new Map());
  const [viewingJobId, setViewingJobId] = useState<string | null>(null);

  // ---- Sorting ----
  const [sortKey, setSortKey] = useState("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // ---- Responsive sidebar ----
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // =========================================================================
  // React Query data
  // =========================================================================

  const { data: jobs = [] } = useEnrichmentJobs();
  const { data: itemsData, isLoading: itemsLoading } = useEnrichmentItems({ tab: activeTab });
  const { data: eventsRaw = [] } = useEvents();
  const { data: initiativesRaw = [] } = useInitiatives();

  // Authoritative person id set for the chosen (eventId, relation). Unconditional
  // hook call: args are null when not applicable so it stays disabled.
  const { data: affiliatedPersonIds } = useEventPersonIds(
    activeTab === "persons" && target === "event" && eventId ? eventId : null,
    activeTab === "persons" && target === "event" ? eventRelation : null,
  );

  const allItems = itemsData?.items ?? [];
  const totalCount = itemsData?.totalCount ?? 0;
  const categories = itemsData?.categories ?? [];
  const sources = itemsData?.sources ?? [];

  // Map events/initiatives to the { id, name } shape expected by sub-components
  const events = useMemo(
    () => eventsRaw.map((e) => ({ id: e.id, name: e.name })),
    [eventsRaw]
  );
  const initiatives = useMemo(
    () => initiativesRaw.map((i) => ({ id: i.id, name: i.name })),
    [initiativesRaw]
  );

  // Saved lists (fetched directly since no existing hook matches the schema)
  const [savedLists, setSavedLists] = useState<{ id: string; name: string; count: number }[]>([]);
  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("person_lists")
      .select("id, name, person_list_items(count)")
      .order("name")
      .then(({ data }) => {
        if (data) {
          setSavedLists(
            data.map((l: Record<string, unknown>) => ({
              id: l.id as string,
              name: l.name as string,
              count: (l.person_list_items as { count: number }[])?.[0]?.count ?? 0,
            }))
          );
        }
      });
  }, []);

  // =========================================================================
  // Pre-selected items from URL query params
  // =========================================================================

  const hasAppliedQueryParams = useRef(false);
  useEffect(() => {
    if (hasAppliedQueryParams.current) return;
    if (itemsLoading || allItems.length === 0) return;

    if (activeTab === "organizations" && preSelectedOrgs.length > 0) {
      setSelectedIds(new Set(preSelectedOrgs));
      setTarget("selected");
      hasAppliedQueryParams.current = true;
    } else if (activeTab === "persons" && preSelectedPersons.length > 0) {
      setSelectedIds(new Set(preSelectedPersons));
      setTarget("selected");
      hasAppliedQueryParams.current = true;
    }
  }, [activeTab, allItems, itemsLoading, preSelectedOrgs, preSelectedPersons]);

  // ---- Handle retry query param ----
  useEffect(() => {
    if (!retryJobId || activeTab !== "organizations") return;
    if (itemsLoading || allItems.length === 0) return;

    (async () => {
      const supabase = createClient();
      const { data: childJobs } = await supabase
        .from("job_log")
        .select("target_id, status")
        .or(`metadata->>parent_job_id.eq.${retryJobId}`)
        .in("status", ["failed", "error"]);

      if (childJobs) {
        const failedIds = new Set(
          childJobs
            .map((j: Record<string, unknown>) => j.target_id as string)
            .filter(Boolean)
        );
        if (failedIds.size > 0) {
          setSelectedIds(failedIds);
          setTarget("selected");
        }
      }
    })();
  }, [retryJobId, activeTab, allItems, itemsLoading]);

  // =========================================================================
  // Filtering (client-side)
  // =========================================================================

  const filteredItems = useMemo(() => {
    return allItems.filter((item) => {
      // Search filter
      const name = "full_name" in item ? item.full_name : (item as OrgRow).name;
      if (filters.search && !name.toLowerCase().includes(filters.search.toLowerCase())) {
        return false;
      }

      // Event filter (by event ID)
      if (filters.event) {
        const itemEventIds = (item as OrgRow & { event_ids?: string[] }).event_ids ??
          (item as PersonRow & { event_ids?: string[] }).event_ids;
        if (!itemEventIds?.includes(filters.event)) return false;
      }

      // Status filter
      if (filters.status && item.enrichment_status !== filters.status) return false;

      // ICP filter
      if (filters.icpMin && (item.icp_score ?? 0) < Number(filters.icpMin)) return false;
      if (filters.icpMax && (item.icp_score ?? 0) > Number(filters.icpMax)) return false;

      // Category / Source filter
      if (filters.categoryOrSource) {
        if ("category" in item && (item as OrgRow).category !== filters.categoryOrSource) return false;
        if ("source" in item && !("category" in item) && (item as PersonRow).source !== filters.categoryOrSource) return false;
      }

      return true;
    });
  }, [allItems, filters]);

  // =========================================================================
  // Sorting
  // =========================================================================

  const sortedItems = useMemo(() => {
    const sorted = [...filteredItems];
    sorted.sort((a, b) => {
      const aRaw = (a as unknown as Record<string, unknown>)[sortKey];
      const bRaw = (b as unknown as Record<string, unknown>)[sortKey];
      const aVal = aRaw as string | number | null | undefined;
      const bVal = bRaw as string | number | null | undefined;

      if (aVal == null) return 1;
      if (bVal == null) return -1;
      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortDir === "asc"
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }
      if (typeof aVal === "number" && typeof bVal === "number") {
        return sortDir === "asc" ? aVal - bVal : bVal - aVal;
      }
      return 0;
    });
    return sorted;
  }, [filteredItems, sortKey, sortDir]);

  // =========================================================================
  // Display items
  // =========================================================================

  const displayItems = useMemo(() => {
    if (centerState === "progress" && queuedItems.length > 0) return queuedItems;

    if (centerState === "results" && viewingJobId && resultOutcomes.size > 0) {
      return sortedItems.filter((item) => resultOutcomes.has(item.id));
    }

    if (selectedIds.size > 0 && selectedIds.size < sortedItems.length) {
      return sortedItems.filter((item) => selectedIds.has(item.id));
    }

    return sortedItems;
  }, [sortedItems, centerState, queuedItems, viewingJobId, resultOutcomes, selectedIds]);

  function handleSort(key: string) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  // =========================================================================
  // Target / Selection sync
  // =========================================================================

  useEffect(() => {
    if (target === "selected") return;

    const matching = new Set<string>();
    for (const item of allItems) {
      let matches = false;
      switch (target) {
        case "unenriched":
          matches = item.enrichment_status === "none" || !item.enrichment_status;
          break;
        case "failed_incomplete":
          matches = item.enrichment_status === "failed" || item.enrichment_status === "partial";
          break;
        case "icp_below":
          matches = (item.icp_score ?? 0) < icpThreshold;
          break;
        case "event":
          if (eventId) {
            if (activeTab === "persons") {
              // Use authoritative set from affiliation + direct union (server-computed).
              // When eventRelation is null (both toggles off), affiliatedPersonIds is [] → empty selection.
              matches = (affiliatedPersonIds ?? []).includes(item.id);
            } else {
              // Orgs: existing behavior (event_ids membership)
              const ids = (item as OrgRow & { event_ids?: string[] }).event_ids;
              matches = ids?.includes(eventId) ?? false;
            }
          }
          break;
        case "initiative":
          break;
        case "saved_list":
          break;
      }
      if (matches) matching.add(item.id);
    }
    setSelectedIds((prev) => {
      if (prev.size === matching.size && [...matching].every((id) => prev.has(id))) return prev;
      return matching;
    });
  }, [target, allItems, icpThreshold, eventId, activeTab, affiliatedPersonIds]);

  function handleSelectionChange(ids: Set<string>) {
    setSelectedIds(ids);
  }

  // =========================================================================
  // Tab switching
  // =========================================================================

  function switchTab(tab: "persons" | "organizations") {
    if (tab === activeTab) return;
    setActiveTab(tab);
    setCenterState("list");
    setSelectedIds(new Set());
    setFilters({ ...EMPTY_FILTERS });
    setTarget("selected");
    setViewingJobId(null);
    setResultStats(undefined);
    setResultOutcomes(new Map());
    setSortKey(tab === "organizations" ? "name" : "full_name");
    setSortDir("asc");
  }

  // =========================================================================
  // Back to list
  // =========================================================================

  function handleBackToList() {
    setCenterState("list");
    setViewingJobId(null);
    setResultStats(undefined);
    setResultOutcomes(new Map());
    setQueuedItems([]);
  }

  // =========================================================================
  // canRun
  // =========================================================================

  const canRun = useMemo(() => {
    if (selectedIds.size === 0) return false;
    if (activeTab === "organizations" && stages.length === 0) return false;
    if (activeTab === "persons" && personFields.length === 0) return false;
    // When scoping by event on the persons tab, require at least one relation toggle
    if (activeTab === "persons" && target === "event" && eventId && eventRelation === null) {
      return false;
    }
    return true;
  }, [selectedIds.size, activeTab, stages.length, personFields.length, target, eventId, eventRelation]);

  // =========================================================================
  // Run Pipeline
  // =========================================================================

  async function handleRun() {
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setIsRunning(true);
    setCenterState("progress");
    setProgressData(new Map());
    setActiveStages(new Map());
    setResultStats(undefined);
    setResultOutcomes(new Map());
    setViewingJobId(null);

    const ids = Array.from(selectedIds);
    setProgressTotal(ids.length);
    setProgressCompleted(0);
    setJobStartTime(new Date().toISOString());

    // Capture selected items for immediate display as queued rows
    const queued = allItems.filter((item) => selectedIds.has(item.id));
    setQueuedItems(queued);

    try {
      const body: Record<string, unknown> = {};

      if (activeTab === "organizations") {
        const CORE: OrgStage[] = ["apollo", "perplexity", "gemini"];
        const hasAllCore = CORE.every((s) => stages.includes(s));
        const apiStages = hasAllCore
          ? ["full", ...stages.filter((s) => !CORE.includes(s))]
          : stages;
        body.stages = apiStages;
        body.organizationIds = ids;
        if (stages.includes("people_finder")) {
          body.peopleFinderConfig = {
            perCompany: pfPerCompany,
            seniorities: pfSeniorities,
            departments: pfDepartments,
          };
        }

        const res = await fetch("/api/enrich/organizations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        const data = await res.json();

        if (data.jobId) setActiveJobId(data.jobId);

        const results = data.results as { orgId: string; success: boolean; icp_score: number | null }[] | undefined;
        const icpResults = results?.filter((r) => r.icp_score != null) ?? [];
        setResultStats({
          processed: data.orgs_processed ?? 0,
          enriched: data.orgs_enriched ?? 0,
          signals: data.signals_created ?? 0,
          avgIcp:
            icpResults.length > 0
              ? Math.round(
                  icpResults.reduce((s, r) => s + (r.icp_score ?? 0), 0) /
                    icpResults.length
                )
              : null,
          peopleFound: data.people_found,
          newPersons: data.people_created,
        });

        const outcomes = new Map<string, "enriched" | "failed" | "skipped">();
        results?.forEach((r) => {
          outcomes.set(r.orgId, r.success ? "enriched" : "failed");
        });
        setResultOutcomes(outcomes);
      } else {
        body.fields = personFields;
        body.source = "apollo";
        body.personIds = ids;
        if (target === "event" && eventId && eventRelation) {
          body.eventId = eventId;
          body.relation = eventRelation;
        }

        const res = await fetch("/api/enrich/persons", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        const data = await res.json();

        if (data.jobId) setActiveJobId(data.jobId);

        setResultStats({
          processed: data.contacts_processed ?? 0,
          enriched: data.enriched ?? 0,
        });

        const outcomes = new Map<string, "enriched" | "failed" | "skipped">();
        const personResults = data.results as { personId?: string; id?: string; success: boolean }[] | undefined;
        personResults?.forEach((r) => {
          outcomes.set(r.personId ?? r.id ?? "", r.success ? "enriched" : "failed");
        });
        setResultOutcomes(outcomes);
      }

      setCenterState("results");
      setQueuedItems([]);
      // Invalidate caches so data refreshes
      queryClient.invalidateQueries({ queryKey: queryKeys.enrichment.jobs.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.enrichment.items.all });
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        setCenterState("results");
      } else {
        console.error("Enrichment error:", err);
        setCenterState("list");
      }
    } finally {
      setIsRunning(false);
      setActiveJobId(null);
      abortControllerRef.current = null;
      setJobStartTime(null);
      setQueuedItems([]);
    }
  }

  // =========================================================================
  // Stop / Cancel
  // =========================================================================

  async function handleStop() {
    if (activeJobId) {
      await fetch("/api/enrich/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: activeJobId }),
      });
    }
    abortControllerRef.current?.abort("User cancelled enrichment");
  }

  // =========================================================================
  // Polling for progress during run
  // =========================================================================

  useEffect(() => {
    if (!isRunning || !jobStartTime) return;

    const supabase = createClient();

    const poll = async () => {
      if (activeTab === "organizations") {
        const { data } = await supabase
          .from("job_log")
          .select("id, target_id, status, job_type, metadata, created_at, error")
          .eq("target_table", "organizations")
          .in("job_type", [
            "enrichment_full",
            "enrichment_apollo",
            "enrichment_perplexity",
            "enrichment_gemini",
            "enrichment_people_finder",
          ])
          .gte("created_at", jobStartTime)
          .order("created_at", { ascending: false })
          .limit(500);

        if (data) {
          const newProgressData = new Map<string, OrgProgress>();
          const newActiveStages = new Map<string, string>();
          let completed = 0;

          const byOrg = new Map<
            string,
            { stages: Record<string, string>; latestProcessing?: string; overallStatus: string }
          >();

          for (const j of data) {
            const tid = (j as Record<string, unknown>).target_id as string | null;
            if (!tid) continue;

            let entry = byOrg.get(tid);
            if (!entry) {
              entry = { stages: {}, overallStatus: "processing" };
              byOrg.set(tid, entry);
            }

            const jobType = (j as Record<string, unknown>).job_type as string;
            const status = (j as Record<string, unknown>).status as string;
            const stageKey = jobType.replace("enrichment_", "");

            if (stageKey === "full") {
              entry.overallStatus = status;
            } else {
              if (!entry.stages[stageKey]) {
                entry.stages[stageKey] = status;
              }
              if (status === "processing") {
                entry.latestProcessing = stageKey;
              }
            }
          }

          for (const [orgId, entry] of byOrg) {
            const isCompleted =
              entry.overallStatus === "completed" || entry.overallStatus === "failed";
            if (isCompleted) completed++;

            newProgressData.set(orgId, {
              status: entry.overallStatus,
              activeStage: entry.latestProcessing,
            });

            if (entry.latestProcessing) {
              newActiveStages.set(orgId, entry.latestProcessing);
            }
          }

          setProgressData(newProgressData);
          setActiveStages(newActiveStages);
          setProgressCompleted(completed);
        }
      } else {
        const { data } = await supabase
          .from("job_log")
          .select("id, target_id, status, metadata")
          .eq("target_table", "persons")
          .eq("job_type", "enrichment_person")
          .gte("created_at", jobStartTime)
          .limit(500);

        if (data) {
          let completed = 0;
          for (const j of data) {
            const status = (j as Record<string, unknown>).status as string;
            if (status === "completed" || status === "failed") {
              completed++;
            }
          }
          setProgressCompleted(completed);
        }
      }
    };

    const interval = setInterval(poll, 2000);
    poll();
    return () => clearInterval(interval);
  }, [isRunning, jobStartTime, activeTab]);

  // =========================================================================
  // Historical job loading
  // =========================================================================

  const handleSelectJob = useCallback(async (jobId: string) => {
    setViewingJobId(jobId);
    setCenterState("results");

    const supabase = createClient();

    const { data: parentJob } = await supabase
      .from("job_log")
      .select("*")
      .eq("id", jobId)
      .single();

    if (!parentJob) return;

    const meta = (parentJob.metadata ?? {}) as Record<string, unknown>;

    if (parentJob.metadata) {
      setResultStats({
        processed: (meta.org_count as number) ?? (meta.contacts_processed as number) ?? 0,
        enriched: (meta.orgs_enriched as number) ?? (meta.enriched as number) ?? 0,
        signals: meta.signals_created as number | undefined,
        avgIcp: meta.avg_icp as number | undefined,
        peopleFound: meta.people_found as number | undefined,
        newPersons: meta.people_created as number | undefined,
      });
    } else {
      setResultStats(undefined);
    }

    const itemIds = (meta.organization_ids as string[]) ?? (meta.person_ids as string[]);

    if (itemIds && itemIds.length > 0) {
      const { data: childJobs } = await supabase
        .from("job_log")
        .select("target_id, status")
        .in("target_id", itemIds)
        .in("job_type", [
          "enrichment_full", "enrichment_apollo", "enrichment_perplexity",
          "enrichment_gemini", "enrichment_people_finder", "enrichment_person",
        ])
        .gte("created_at", parentJob.created_at)
        .not("target_id", "is", null);

      const outcomes = new Map<string, "enriched" | "failed" | "skipped">();
      if (childJobs) {
        for (const j of childJobs) {
          const tid = (j as Record<string, unknown>).target_id as string;
          const status = (j as Record<string, unknown>).status as string;
          if (tid && !outcomes.has(tid)) {
            outcomes.set(tid, status === "completed" ? "enriched" : status === "failed" ? "failed" : "enriched");
          }
        }
      }
      for (const id of itemIds) {
        if (!outcomes.has(id)) outcomes.set(id, "skipped");
      }
      setResultOutcomes(outcomes);
    } else {
      setResultOutcomes(new Map());
    }
  }, []);

  // =========================================================================
  // Render
  // =========================================================================

  return (
    <div className="flex flex-col h-[calc(100vh-120px)]">
      {/* Global animations */}
      <style jsx global>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes slideIn {
          from { opacity: 0; transform: translateY(-8px); max-height: 0; }
          to { opacity: 1; transform: translateY(0); max-height: 48px; }
        }
      `}</style>

      {/* ---- Page Header ---- */}
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div />
        <div className="flex items-center gap-2">
          {/* Responsive sidebar toggle (below 1100px) */}
          <button
            onClick={() => setSidebarOpen((o) => !o)}
            className="lg:hidden p-2 rounded-lg glass text-[var(--text-muted)] hover:text-white transition-colors"
            aria-label="Toggle config"
          >
            <Settings2 className="h-4 w-4" />
          </button>

          {/* Tab toggle */}
          <div className="flex gap-1 glass rounded-lg p-1">
            <button
              onClick={() => switchTab("persons")}
              className={cn(
                "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                activeTab === "persons"
                  ? "bg-[var(--accent-orange)]/15 text-[var(--accent-orange)] border border-[var(--accent-orange)]/20"
                  : "text-[var(--text-muted)] hover:text-white border border-transparent"
              )}
            >
              Persons
            </button>
            <button
              onClick={() => switchTab("organizations")}
              className={cn(
                "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                activeTab === "organizations"
                  ? "bg-[var(--accent-orange)]/15 text-[var(--accent-orange)] border border-[var(--accent-orange)]/20"
                  : "text-[var(--text-muted)] hover:text-white border border-transparent"
              )}
            >
              Organizations
            </button>
          </div>
        </div>
      </div>

      {/* ---- Two-panel layout ---- */}
      <div className="flex gap-6 flex-1 min-h-0 relative">
        {/* ---- Center Panel (65%) ---- */}
        <div className="flex-1 min-w-0 flex flex-col">
            <CenterPanel
              state={centerState}
              tab={activeTab}
              filters={filters}
              onFiltersChange={setFilters}
              events={events}
              initiatives={initiatives}
              items={displayItems}
              loading={itemsLoading}
              totalCount={totalCount}
              selectedIds={selectedIds}
              onSelectionChange={handleSelectionChange}
              categories={categories}
              sources={sources}
              progressData={progressData}
              activeStages={activeStages}
              progressCompleted={progressCompleted}
              progressTotal={progressTotal}
              resultStats={resultStats}
              resultOutcomes={resultOutcomes}
              onBackToList={handleBackToList}
              viewingJobId={viewingJobId}
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={handleSort}
            />
        </div>

        {/* ---- Right Sidebar ---- */}
        <div
          className={cn(
            "hidden lg:flex w-[360px] min-w-[320px] max-w-[400px] flex-col gap-4 shrink-0",
          )}
        >
          <ConfigPanel
            tab={activeTab}
            stages={stages}
            onStagesChange={setStages}
            personFields={personFields}
            onPersonFieldsChange={setPersonFields}
            pfPerCompany={pfPerCompany}
            onPfPerCompanyChange={setPfPerCompany}
            pfSeniorities={pfSeniorities}
            onPfSenioritiesChange={setPfSeniorities}
            pfDepartments={pfDepartments}
            onPfDepartmentsChange={setPfDepartments}
            target={target}
            onTargetChange={setTarget}
            eventId={eventId}
            onEventIdChange={setEventId}
            initiativeId={initiativeId}
            onInitiativeIdChange={setInitiativeId}
            icpThreshold={icpThreshold}
            onIcpThresholdChange={setIcpThreshold}
            savedListId={savedListId}
            onSavedListIdChange={setSavedListId}
            events={events}
            initiatives={initiatives}
            savedLists={savedLists}
            selectedCount={selectedIds.size}
            isRunning={isRunning}
            canRun={canRun}
            onRun={handleRun}
            onStop={handleStop}
          />

          {activeTab === "persons" && target === "event" && eventId && (
            <GlassCard className="p-3">
              <div className="text-xs text-[var(--text-muted)] mb-2">
                Event scope
              </div>
              <EventRelationToggle
                speaker={speakerOn}
                orgAffiliated={orgAffiliatedOn}
                onChange={({ speaker, orgAffiliated }) => {
                  setSpeakerOn(speaker);
                  setOrgAffiliatedOn(orgAffiliated);
                }}
              />
            </GlassCard>
          )}

          <GlassCard className="flex-1 min-h-0 flex flex-col overflow-hidden">
            <JobHistory
              jobs={jobs}
              activeJobId={activeJobId}
              viewingJobId={viewingJobId}
              onSelectJob={handleSelectJob}
            />
          </GlassCard>
        </div>

        {/* ---- Mobile sidebar overlay ---- */}
        {sidebarOpen && (
          <>
            <div
              className="lg:hidden fixed inset-0 bg-black/50 z-40"
              onClick={() => setSidebarOpen(false)}
            />
            <div className="lg:hidden fixed right-0 top-0 bottom-0 w-[380px] max-w-[90vw] z-50 bg-[#0f0f13] border-l border-white/[0.06] p-4 flex flex-col gap-4 overflow-y-auto">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-white font-medium">Configuration</span>
                <button
                  onClick={() => setSidebarOpen(false)}
                  className="text-[var(--text-muted)] hover:text-white p-1"
                >
                  &times;
                </button>
              </div>

              <ConfigPanel
                tab={activeTab}
                stages={stages}
                onStagesChange={setStages}
                personFields={personFields}
                onPersonFieldsChange={setPersonFields}
                pfPerCompany={pfPerCompany}
                onPfPerCompanyChange={setPfPerCompany}
                pfSeniorities={pfSeniorities}
                onPfSenioritiesChange={setPfSeniorities}
                pfDepartments={pfDepartments}
                onPfDepartmentsChange={setPfDepartments}
                target={target}
                onTargetChange={setTarget}
                eventId={eventId}
                onEventIdChange={setEventId}
                initiativeId={initiativeId}
                onInitiativeIdChange={setInitiativeId}
                icpThreshold={icpThreshold}
                onIcpThresholdChange={setIcpThreshold}
                savedListId={savedListId}
                onSavedListIdChange={setSavedListId}
                events={events}
                initiatives={initiatives}
                savedLists={savedLists}
                selectedCount={selectedIds.size}
                isRunning={isRunning}
                canRun={canRun}
                onRun={handleRun}
                onStop={handleStop}
              />

              {activeTab === "persons" && target === "event" && eventId && (
                <GlassCard className="p-3">
                  <div className="text-xs text-[var(--text-muted)] mb-2">
                    Event scope
                  </div>
                  <EventRelationToggle
                    speaker={speakerOn}
                    orgAffiliated={orgAffiliatedOn}
                    onChange={({ speaker, orgAffiliated }) => {
                      setSpeakerOn(speaker);
                      setOrgAffiliatedOn(orgAffiliated);
                    }}
                  />
                </GlassCard>
              )}

              <GlassCard className="flex-1 min-h-0 flex flex-col overflow-hidden">
                <JobHistory
                  jobs={jobs}
                  activeJobId={activeJobId}
                  viewingJobId={viewingJobId}
                  onSelectJob={(id) => {
                    handleSelectJob(id);
                    setSidebarOpen(false);
                  }}
                />
              </GlassCard>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
