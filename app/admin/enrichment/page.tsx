"use client";

import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from "react";
import { useSearchParams } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { GlassCard } from "@/components/ui/glass-card";
import { cn } from "@/lib/utils";
import { Settings2 } from "lucide-react";

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
  type JobHistoryJob,
} from "./components/job-history";
import type { FilterState } from "./components/filter-bar";
import type { OrgRow, PersonRow, OrgProgress } from "./components/entity-table";
import type { SummaryStripProps } from "./components/summary-strip";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function useSupabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

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
// Page Component
// ---------------------------------------------------------------------------

export default function EnrichmentPage() {
  const searchParams = useSearchParams();

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

  // ---- Org config ----
  const [stages, setStages] = useState<OrgStage[]>(["apollo", "perplexity", "gemini"]);

  // ---- Person config ----
  const [personFields, setPersonFields] = useState<EnrichField[]>(["email", "linkedin"]);

  // ---- People Finder settings ----
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

  // ---- Reference data ----
  const [events, setEvents] = useState<{ id: string; name: string }[]>([]);
  const [initiatives, setInitiatives] = useState<{ id: string; name: string }[]>([]);
  const [savedLists, setSavedLists] = useState<{ id: string; name: string; count: number }[]>([]);
  const [jobs, setJobs] = useState<JobHistoryJob[]>([]);

  // ---- Items ----
  const [allItems, setAllItems] = useState<(OrgRow | PersonRow)[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [itemsLoading, setItemsLoading] = useState(false);

  // ---- Categories / Sources (derived) ----
  const [categories, setCategories] = useState<string[]>([]);
  const [sources, setSources] = useState<string[]>([]);

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
  // Data fetching
  // =========================================================================

  const loadJobs = useCallback(async () => {
    const supabase = useSupabase();
    const { data } = await supabase
      .from("job_log")
      .select("id, job_type, status, created_at, metadata")
      .in("job_type", [
        "enrichment",
        "enrichment_batch_organizations",
        "enrichment_batch_persons",
        "enrichment_person",
      ])
      .order("created_at", { ascending: false })
      .limit(50);
    if (data) setJobs(data as JobHistoryJob[]);
  }, []);

  // Load events, initiatives, saved lists, and jobs on mount
  useEffect(() => {
    const supabase = useSupabase();

    supabase
      .from("events")
      .select("id, name")
      .order("date_start", { ascending: false })
      .then(({ data }) => {
        if (data) setEvents(data as { id: string; name: string }[]);
      });

    supabase
      .from("initiatives")
      .select("id, name")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (data) setInitiatives(data as { id: string; name: string }[]);
      });

    // Saved lists (for person tab)
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

    loadJobs();
  }, [loadJobs]);

  // Auto-refresh jobs while any are processing
  useEffect(() => {
    const hasProcessing = jobs.some(
      (j) => j.status === "processing" || j.status === "in_progress"
    );
    if (!hasProcessing) return;

    const interval = setInterval(loadJobs, 5000);
    return () => clearInterval(interval);
  }, [jobs, loadJobs]);

  // ---- Load items when tab changes ----
  const loadItems = useCallback(async () => {
    setItemsLoading(true);
    const supabase = useSupabase();

    try {
      if (activeTab === "organizations") {
        // Fetch orgs
        const { data: orgs } = await supabase
          .from("organizations")
          .select("id, name, category, icp_score, enrichment_status, enrichment_stages")
          .order("name")
          .limit(2000);

        if (!orgs) {
          setAllItems([]);
          setTotalCount(0);
          setCategories([]);
          return;
        }

        // Fetch event participations for those orgs
        const orgIds = orgs.map((o: Record<string, unknown>) => o.id as string);
        const { data: eps } = await supabase
          .from("event_participations")
          .select("organization_id, event_id, events(name)")
          .in("organization_id", orgIds.slice(0, 500)); // Supabase IN limit

        // Build event map: org_id -> { event_ids, event_names }
        const eventMap = new Map<string, { ids: string[]; names: string[] }>();
        if (eps) {
          for (const ep of eps) {
            const orgId = (ep as Record<string, unknown>).organization_id as string;
            const eventId = (ep as Record<string, unknown>).event_id as string;
            const eventRec = (ep as Record<string, unknown>).events as { name: string } | null;
            const eventName = eventRec?.name ?? "";

            let entry = eventMap.get(orgId);
            if (!entry) {
              entry = { ids: [], names: [] };
              eventMap.set(orgId, entry);
            }
            if (!entry.ids.includes(eventId)) {
              entry.ids.push(eventId);
              entry.names.push(eventName);
            }
          }
        }

        // Build rows
        const rows: OrgRow[] = orgs.map((o: Record<string, unknown>) => {
          const ev = eventMap.get(o.id as string);
          return {
            id: o.id as string,
            name: o.name as string,
            event_ids: ev?.ids,
            event_names: ev?.names,
            category: (o.category as string) ?? null,
            icp_score: (o.icp_score as number) ?? null,
            enrichment_stages: (o.enrichment_stages as OrgRow["enrichment_stages"]) ?? null,
            enrichment_status: (o.enrichment_status as string) ?? "none",
          };
        });

        // Extract unique categories
        const cats = new Set<string>();
        rows.forEach((r) => {
          if (r.category) cats.add(r.category);
        });
        setCategories(Array.from(cats).sort());
        setSources([]);

        setAllItems(rows);
        setTotalCount(rows.length);
      } else {
        // Fetch persons from the view
        const { data: persons } = await supabase
          .from("persons_with_icp")
          .select("id, full_name, primary_org_name, icp_score, icp_reason, org_category, email, linkedin_url, twitter_handle, phone, source, enrichment_status")
          .order("full_name")
          .limit(2000);

        if (!persons) {
          setAllItems([]);
          setTotalCount(0);
          setSources([]);
          return;
        }

        // Fetch event participations for persons
        const personIds = persons.map((p: Record<string, unknown>) => p.id as string);
        const { data: eps } = await supabase
          .from("event_participations")
          .select("person_id, event_id, events(name)")
          .in("person_id", personIds.slice(0, 500));

        const eventMap = new Map<string, { ids: string[]; names: string[] }>();
        if (eps) {
          for (const ep of eps) {
            const personId = (ep as Record<string, unknown>).person_id as string;
            const eid = (ep as Record<string, unknown>).event_id as string;
            const eventRec = (ep as Record<string, unknown>).events as { name: string } | null;
            const eventName = eventRec?.name ?? "";

            let entry = eventMap.get(personId);
            if (!entry) {
              entry = { ids: [], names: [] };
              eventMap.set(personId, entry);
            }
            if (!entry.ids.includes(eid)) {
              entry.ids.push(eid);
              entry.names.push(eventName);
            }
          }
        }

        const rows: PersonRow[] = persons.map((p: Record<string, unknown>) => {
          const ev = eventMap.get(p.id as string);
          return {
            id: p.id as string,
            full_name: (p.full_name as string) ?? "",
            primary_org_name: (p.primary_org_name as string) ?? null,
            event_ids: ev?.ids,
            event_names: ev?.names,
            source: (p.source as string) ?? null,
            icp_score: (p.icp_score as number) ?? null,
            email: (p.email as string) ?? null,
            linkedin_url: (p.linkedin_url as string) ?? null,
            twitter_handle: (p.twitter_handle as string) ?? null,
            phone: (p.phone as string) ?? null,
            enrichment_status: (p.enrichment_status as string) ?? "none",
          };
        });

        // Extract unique sources
        const srcs = new Set<string>();
        rows.forEach((r) => {
          if (r.source) srcs.add(r.source);
        });
        setSources(Array.from(srcs).sort());
        setCategories([]);

        setAllItems(rows);
        setTotalCount(rows.length);
      }
    } finally {
      setItemsLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  // ---- Handle pre-selected items from URL query params ----
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
      const supabase = useSupabase();
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

      // Initiative filter — we don't have initiative IDs on items client-side,
      // so this filter would require a separate query. For now, skip if empty.
      // TODO: Could be expanded if initiative_enrollment data is loaded on items.

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
    if (target === "selected") return; // Manual selection, don't auto-select

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
            const ids = (item as OrgRow & { event_ids?: string[] }).event_ids ??
              (item as PersonRow & { event_ids?: string[] }).event_ids;
            matches = ids?.includes(eventId) ?? false;
          }
          break;
        case "initiative":
          // Initiative filtering would require loading enrollment data
          // For now, select nothing until we implement it
          break;
        case "saved_list":
          // Saved list filtering requires loading list items
          break;
      }
      if (matches) matching.add(item.id);
    }
    setSelectedIds(matching);
  }, [target, allItems, icpThreshold, eventId]);

  // When user manually checks rows, switch to "selected" if appropriate
  function handleSelectionChange(ids: Set<string>) {
    setSelectedIds(ids);
    // If the user is manually selecting and we're not on "selected" target,
    // switch to "selected" so the run button uses their selection
    if (target !== "selected" && ids.size > 0) {
      // Only switch to "selected" if the ids differ from the auto-selected set
      // For simplicity, just let the user's selection override
    }
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
    setTarget("unenriched");
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
    return true;
  }, [selectedIds.size, activeTab, stages.length, personFields.length]);

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
        // API expects "full" when all three core stages are selected
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

        // Build result stats
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

        // Build outcomes map
        const outcomes = new Map<string, "enriched" | "failed" | "skipped">();
        results?.forEach((r) => {
          outcomes.set(r.orgId, r.success ? "enriched" : "failed");
        });
        setResultOutcomes(outcomes);
      } else {
        body.fields = personFields;
        body.source = "apollo";
        body.personIds = ids;

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
      loadJobs();
      loadItems();
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
    abortControllerRef.current?.abort();
  }

  // =========================================================================
  // Polling for progress during run
  // =========================================================================

  useEffect(() => {
    if (!isRunning || !jobStartTime) return;

    const supabase = useSupabase();

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

          // Group by target_id
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
              // Only set if not already set (first = most recent due to ordering)
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
        // Person enrichment polling
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

  async function handleSelectJob(jobId: string) {
    setViewingJobId(jobId);
    setCenterState("results");

    const supabase = useSupabase();

    // Get parent job for stats
    const { data: parentJob } = await supabase
      .from("job_log")
      .select("*")
      .eq("id", jobId)
      .single();

    if (parentJob?.metadata) {
      const meta = parentJob.metadata as Record<string, unknown>;
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

    // Get child job entries for per-item outcomes
    const { data: childJobs } = await supabase
      .from("job_log")
      .select("target_id, status")
      .or(`metadata->>parent_job_id.eq.${jobId}`)
      .not("target_id", "is", null);

    if (childJobs) {
      const outcomes = new Map<string, "enriched" | "failed" | "skipped">();
      for (const j of childJobs) {
        const tid = (j as Record<string, unknown>).target_id as string;
        const status = (j as Record<string, unknown>).status as string;
        if (tid) {
          outcomes.set(tid, status === "completed" ? "enriched" : "failed");
        }
      }
      setResultOutcomes(outcomes);
    }
  }

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
        <h1 className="text-2xl font-semibold font-[family-name:var(--font-heading)] text-white">
          Enrichment
        </h1>

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
          {itemsLoading && allItems.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-sm text-[var(--text-muted)] animate-pulse">
                Loading {activeTab}...
              </div>
            </div>
          ) : (
            <CenterPanel
              state={centerState}
              tab={activeTab}
              filters={filters}
              onFiltersChange={setFilters}
              events={events}
              initiatives={initiatives}
              items={centerState === "progress" && queuedItems.length > 0 ? queuedItems : sortedItems}
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
          )}
        </div>

        {/* ---- Right Sidebar ---- */}
        {/* Desktop: always visible; Mobile: overlay drawer */}
        <div
          className={cn(
            // Desktop
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
            {/* Backdrop */}
            <div
              className="lg:hidden fixed inset-0 bg-black/50 z-40"
              onClick={() => setSidebarOpen(false)}
            />
            {/* Drawer */}
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
