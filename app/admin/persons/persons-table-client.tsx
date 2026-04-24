"use client";

import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Search,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  Users,
  X,
} from "lucide-react";
import { TwoPanelLayout } from "@/components/admin/two-panel-layout";
import { FilterGroup } from "@/components/admin/filter-group";
import { ActiveFilters } from "@/components/admin/active-filters";
import { SelectionSummary } from "@/components/admin/selection-summary";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassInput } from "@/components/ui/glass-input";
import { GlassSelect } from "@/components/ui/glass-select";
import { Badge } from "@/components/ui/badge";
import { AddToListDropdown } from "@/components/admin/add-to-list-dropdown";
import { cn } from "@/lib/utils";

import { PersonTableRow, GlassCheckbox, PERSON_GRID_COLS } from "./person-table-row";
import { PersonPreviewPanel } from "./person-preview-panel";
import type { PersonRow, PersonEvent, OrgEvent, CorrelationResult } from "./person-table-row";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PersonsTableClientProps {
  rows: PersonRow[];
  eventOptions: { id: string; name: string }[];
  sourceOptions: string[];
  seniorityOptions: string[];
  departmentOptions: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type SortField =
  | "full_name"
  | "title"
  | "primary_org_name"
  | "seniority"
  | "icp_score"
  | "enrichment_status"
  | "last_interaction_at";

const SPEAKER_ROLES = ["speaker", "panelist", "mc"];

function computeCorrelation(
  personEvents: PersonEvent[],
  orgEvents: OrgEvent[]
): CorrelationResult {
  const personSpeakerEvents = personEvents.filter((e) =>
    SPEAKER_ROLES.includes(e.role)
  );

  for (const pe of personSpeakerEvents) {
    const orgMatch = orgEvents.find((oe) => oe.event_id === pe.event_id);
    if (orgMatch && orgMatch.tier) {
      return {
        type: "speaker_sponsor",
        segments: [
          { text: "Speaker" },
          { text: orgMatch.org_name, href: `/admin/organizations/${orgMatch.org_id}` },
          { text: `${orgMatch.tier} Sponsor`, badge: orgMatch.tier.toLowerCase() },
        ],
      };
    }
  }

  for (const pe of personEvents) {
    const orgMatch = orgEvents.find((oe) => oe.event_id === pe.event_id);
    if (orgMatch && orgMatch.tier) {
      return {
        type: "sponsor_contact",
        segments: [
          { text: `${pe.role}` },
          { text: orgMatch.org_name, href: `/admin/organizations/${orgMatch.org_id}` },
          { text: `${orgMatch.tier} Sponsor`, badge: orgMatch.tier.toLowerCase() },
        ],
      };
    }
  }

  if (personSpeakerEvents.length > 0) {
    const pe = personSpeakerEvents[0];
    return {
      type: "speaker_only",
      segments: [
        { text: "Speaker" },
        { text: pe.event_name },
      ],
    };
  }

  if (orgEvents.length > 0) {
    const oe = orgEvents.find((o) => o.tier) || orgEvents[0];
    if (oe.tier) {
      return {
        type: "org_sponsor",
        segments: [
          { text: oe.org_name, href: `/admin/organizations/${oe.org_id}` },
          { text: `${oe.tier} Sponsor`, badge: oe.tier.toLowerCase() },
        ],
      };
    }
  }

  return { type: "none", segments: [] };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PersonsTableClient({
  rows,
  eventOptions,
  sourceOptions,
  seniorityOptions,
  departmentOptions,
}: PersonsTableClientProps) {
  const router = useRouter();

  // --- Filter state ---
  const [search, setSearch] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  const [filterEvents, setFilterEvents] = useState<string[]>([]);
  const [filterHasOrg, setFilterHasOrg] = useState<string>("");
  const [filterCorrelationType, setFilterCorrelationType] = useState<string[]>([]);
  const [filterSeniority, setFilterSeniority] = useState<string[]>([]);
  const [filterDepartment, setFilterDepartment] = useState<string[]>([]);
  const [filterSource, setFilterSource] = useState<string[]>([]);
  const [filterHasEmail, setFilterHasEmail] = useState(false);
  const [filterHasLinkedin, setFilterHasLinkedin] = useState(false);
  const [filterHasPhone, setFilterHasPhone] = useState(false);
  const [filterHasTwitter, setFilterHasTwitter] = useState(false);
  const [filterHasTelegram, setFilterHasTelegram] = useState(false);
  const [filterEnrichmentStatus, setFilterEnrichmentStatus] = useState<string[]>([]);
  const [filterIcpMin, setFilterIcpMin] = useState("");
  const [filterIcpMax, setFilterIcpMax] = useState("");

  // --- Sort state ---
  const [sortField, setSortField] = useState<SortField>("icp_score");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // --- Selection state ---
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lastClickedIdx, setLastClickedIdx] = useState<number | null>(null);

  // --- Hover preview (fully ref-based — zero table re-renders) ---
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewLockRef = useRef(false);
  const hoveredIdRef = useRef<string | null>(null);
  const previewSetterRef = useRef<(row: PersonRow | null) => void>(() => {});

  // --- Virtualizer ref ---
  const parentRef = useRef<HTMLDivElement>(null);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // --- Pre-compute row lookup map ---
  const rowMap = useMemo(() => {
    const m = new Map<string, PersonRow>();
    for (const row of rows) m.set(row.id, row);
    return m;
  }, [rows]);

  // --- Compute correlations ---
  const correlations = useMemo(() => {
    const map: Record<string, CorrelationResult> = {};
    for (const row of rows) {
      map[row.id] = computeCorrelation(row.personEvents, row.orgEvents);
    }
    return map;
  }, [rows]);

  // --- Filter + Sort ---
  const filteredRows = useMemo(() => {
    let result = rows;

    if (searchDebounced) {
      const q = searchDebounced.toLowerCase();
      result = result.filter(
        (r) =>
          r.full_name.toLowerCase().includes(q) ||
          (r.email && r.email.toLowerCase().includes(q)) ||
          (r.primary_org_name && r.primary_org_name.toLowerCase().includes(q))
      );
    }

    if (filterEvents.length > 0) {
      result = result.filter((r) =>
        r.personEvents.some((pe) => filterEvents.includes(pe.event_id))
      );
    }

    if (filterHasOrg === "yes") {
      result = result.filter((r) => r.primary_org_name);
    } else if (filterHasOrg === "no") {
      result = result.filter((r) => !r.primary_org_name);
    }

    if (filterCorrelationType.length > 0) {
      result = result.filter((r) => {
        const c = correlations[r.id];
        return filterCorrelationType.includes(c.type);
      });
    }

    if (filterSeniority.length > 0) {
      result = result.filter(
        (r) => r.seniority && filterSeniority.includes(r.seniority)
      );
    }

    if (filterDepartment.length > 0) {
      result = result.filter(
        (r) => r.department && filterDepartment.includes(r.department)
      );
    }

    if (filterSource.length > 0) {
      result = result.filter(
        (r) => r.source && filterSource.includes(r.source)
      );
    }

    if (filterHasEmail) result = result.filter((r) => r.email);
    if (filterHasLinkedin) result = result.filter((r) => r.linkedin_url);
    if (filterHasPhone) result = result.filter((r) => r.phone);
    if (filterHasTwitter) result = result.filter((r) => r.twitter_handle);
    if (filterHasTelegram) result = result.filter((r) => r.telegram_handle);

    if (filterEnrichmentStatus.length > 0) {
      result = result.filter((r) =>
        filterEnrichmentStatus.includes(r.enrichment_status || "none")
      );
    }

    if (filterIcpMin) {
      const min = parseInt(filterIcpMin);
      result = result.filter((r) => r.icp_score !== null && r.icp_score >= min);
    }
    if (filterIcpMax) {
      const max = parseInt(filterIcpMax);
      result = result.filter((r) => r.icp_score !== null && r.icp_score <= max);
    }

    result = [...result].sort((a, b) => {
      let aVal: any = (a as any)[sortField];
      let bVal: any = (b as any)[sortField];
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      if (typeof aVal === "string") aVal = aVal.toLowerCase();
      if (typeof bVal === "string") bVal = bVal.toLowerCase();
      const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return sortDir === "desc" ? -cmp : cmp;
    });

    return result;
  }, [
    rows,
    searchDebounced,
    filterEvents,
    filterHasOrg,
    filterCorrelationType,
    filterSeniority,
    filterDepartment,
    filterSource,
    filterHasEmail,
    filterHasLinkedin,
    filterHasPhone,
    filterHasTwitter,
    filterHasTelegram,
    filterEnrichmentStatus,
    filterIcpMin,
    filterIcpMax,
    sortField,
    sortDir,
    correlations,
  ]);

  // --- Virtualizer ---
  const virtualizer = useVirtualizer({
    count: filteredRows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 36,
    overscan: 5,
  });

  // --- Selection helpers ---
  const allVisibleSelected =
    filteredRows.length > 0 &&
    filteredRows.every((r) => selectedIds.has(r.id));

  const toggleSelectAll = useCallback(() => {
    if (allVisibleSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredRows.map((r) => r.id)));
    }
  }, [allVisibleSelected, filteredRows]);

  const handleCheckboxClick = useCallback((id: string, idx: number, shiftKey: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (shiftKey && lastClickedIdx !== null) {
        const start = Math.min(lastClickedIdx, idx);
        const end = Math.max(lastClickedIdx, idx);
        for (let i = start; i <= end; i++) {
          next.add(filteredRows[i].id);
        }
      } else {
        if (next.has(id)) next.delete(id);
        else next.add(id);
      }
      return next;
    });
    setLastClickedIdx(idx);
  }, [lastClickedIdx, filteredRows]);

  // --- Selection stats ---
  const selectionStats = useMemo(() => {
    if (selectedIds.size === 0) return "";
    const selected = rows.filter((r) => selectedIds.has(r.id));
    const icpScores = selected.map((r) => r.icp_score).filter((s): s is number => s !== null);
    const avgIcp = icpScores.length > 0 ? Math.round(icpScores.reduce((a, b) => a + b, 0) / icpScores.length) : null;
    const hasEmail = selected.filter((r) => r.email).length;
    const parts: string[] = [];
    if (avgIcp !== null) parts.push(`Avg ICP ${avgIcp}`);
    parts.push(`${hasEmail} have email`);
    return parts.join(" \u00b7 ");
  }, [selectedIds, rows]);

  // --- Hover preview (ref-based to avoid full table re-renders) ---
  const handleRowMouseEnter = useCallback((id: string) => {
    if (previewLockRef.current) return;
    hoveredIdRef.current = id;
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => {
      const row = rowMap.get(id);
      if (row) previewSetterRef.current(row);
    }, 80);
  }, [rowMap]);

  const handleRowMouseLeave = useCallback(() => {
    hoveredIdRef.current = null;
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => {
      if (!previewLockRef.current) {
        previewSetterRef.current(null);
      }
    }, 100);
  }, []);

  const handlePreviewMouseEnter = useCallback(() => {
    previewLockRef.current = true;
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
  }, []);

  const handlePreviewMouseLeave = useCallback(() => {
    previewLockRef.current = false;
    previewSetterRef.current(null);
    hoveredIdRef.current = null;
  }, []);

  // --- Row click ---
  const handleRowClick = useCallback((id: string) => {
    router.push(`/admin/persons/${id}`);
  }, [router]);

  // --- Sort handler ---
  const handleSort = useCallback((field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  }, [sortField]);

  // --- Active filters ---
  const activeFilters = useMemo(() => {
    const filters: { key: string; label: string; value: string }[] = [];
    if (filterEvents.length > 0) {
      const names = filterEvents.map((id) => eventOptions.find((e) => e.id === id)?.name || id);
      filters.push({ key: "events", label: "Event", value: names.join(", ") });
    }
    if (filterHasOrg) filters.push({ key: "hasOrg", label: "Has Org", value: filterHasOrg });
    if (filterCorrelationType.length > 0) filters.push({ key: "correlationType", label: "Correlation", value: filterCorrelationType.join(", ") });
    if (filterSeniority.length > 0) filters.push({ key: "seniority", label: "Seniority", value: filterSeniority.join(", ") });
    if (filterDepartment.length > 0) filters.push({ key: "department", label: "Department", value: filterDepartment.join(", ") });
    if (filterSource.length > 0) filters.push({ key: "source", label: "Source", value: filterSource.join(", ") });
    if (filterHasEmail) filters.push({ key: "hasEmail", label: "Has Email", value: "Yes" });
    if (filterHasLinkedin) filters.push({ key: "hasLinkedin", label: "Has LinkedIn", value: "Yes" });
    if (filterHasPhone) filters.push({ key: "hasPhone", label: "Has Phone", value: "Yes" });
    if (filterHasTwitter) filters.push({ key: "hasTwitter", label: "Has Twitter", value: "Yes" });
    if (filterHasTelegram) filters.push({ key: "hasTelegram", label: "Has Telegram", value: "Yes" });
    if (filterEnrichmentStatus.length > 0) filters.push({ key: "enrichmentStatus", label: "Enrichment", value: filterEnrichmentStatus.join(", ") });
    if (filterIcpMin) filters.push({ key: "icpMin", label: "ICP Min", value: filterIcpMin });
    if (filterIcpMax) filters.push({ key: "icpMax", label: "ICP Max", value: filterIcpMax });
    return filters;
  }, [filterEvents, filterHasOrg, filterCorrelationType, filterSeniority, filterDepartment, filterSource, filterHasEmail, filterHasLinkedin, filterHasPhone, filterHasTwitter, filterHasTelegram, filterEnrichmentStatus, filterIcpMin, filterIcpMax, eventOptions]);

  const handleRemoveFilter = useCallback((key: string) => {
    switch (key) {
      case "events": setFilterEvents([]); break;
      case "hasOrg": setFilterHasOrg(""); break;
      case "correlationType": setFilterCorrelationType([]); break;
      case "seniority": setFilterSeniority([]); break;
      case "department": setFilterDepartment([]); break;
      case "source": setFilterSource([]); break;
      case "hasEmail": setFilterHasEmail(false); break;
      case "hasLinkedin": setFilterHasLinkedin(false); break;
      case "hasPhone": setFilterHasPhone(false); break;
      case "hasTwitter": setFilterHasTwitter(false); break;
      case "hasTelegram": setFilterHasTelegram(false); break;
      case "enrichmentStatus": setFilterEnrichmentStatus([]); break;
      case "icpMin": setFilterIcpMin(""); break;
      case "icpMax": setFilterIcpMax(""); break;
    }
  }, []);

  const handleClearAll = useCallback(() => {
    setFilterEvents([]);
    setFilterHasOrg("");
    setFilterCorrelationType([]);
    setFilterSeniority([]);
    setFilterDepartment([]);
    setFilterSource([]);
    setFilterHasEmail(false);
    setFilterHasLinkedin(false);
    setFilterHasPhone(false);
    setFilterHasTwitter(false);
    setFilterHasTelegram(false);
    setFilterEnrichmentStatus([]);
    setFilterIcpMin("");
    setFilterIcpMax("");
    setSearch("");
  }, []);

  // --- Multi-select helper ---
  const toggleMultiSelect = useCallback((
    value: string,
    current: string[],
    setter: (v: string[]) => void
  ) => {
    if (current.includes(value)) {
      setter(current.filter((v) => v !== value));
    } else {
      setter([...current, value]);
    }
  }, []);

  // --- Sort header component ---
  function SortHeader({
    label,
    field,
    className: extraClass,
  }: {
    label: string;
    field: SortField;
    className?: string;
  }) {
    const isActive = sortField === field;
    return (
      <div className={cn("px-2 py-2 font-medium", extraClass)}>
        <button
          onClick={() => handleSort(field)}
          className="inline-flex items-center gap-1 hover:text-white transition-colors"
        >
          {label}
          {isActive ? (
            sortDir === "desc" ? (
              <ChevronDown className="w-3.5 h-3.5 text-[var(--accent-orange)]" />
            ) : (
              <ChevronUp className="w-3.5 h-3.5 text-[var(--accent-orange)]" />
            )
          ) : (
            <ChevronsUpDown className="w-3 h-3 opacity-40" />
          )}
        </button>
      </div>
    );
  }

  // --- Toggle component ---
  function Toggle({
    label,
    checked,
    onChange,
  }: {
    label: string;
    checked: boolean;
    onChange: (v: boolean) => void;
  }) {
    return (
      <label className="flex items-center gap-2 cursor-pointer text-sm text-[var(--text-secondary)] hover:text-white transition-colors">
        <div
          className={`w-8 h-4.5 rounded-full relative transition-colors ${
            checked ? "bg-[var(--accent-orange)]/40" : "bg-white/[0.08]"
          }`}
          onClick={(e) => { e.preventDefault(); onChange(!checked); }}
        >
          <div
            className={`absolute top-0.5 w-3.5 h-3.5 rounded-full transition-all ${
              checked
                ? "left-4 bg-[var(--accent-orange)]"
                : "left-0.5 bg-[var(--text-muted)]"
            }`}
          />
        </div>
        {label}
      </label>
    );
  }

  // --- Sidebar ---
  const sidebar = (
    <div className="space-y-4">
      {/* Search */}
      <GlassInput
        icon={Search}
        placeholder="Search name, email, org..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {/* Filter Groups */}
      <GlassCard className="!p-3">
        <FilterGroup title="Relationships" defaultOpen={true}>
          <div className="space-y-2">
            <GlassSelect
              placeholder="Filter by event..."
              options={eventOptions.map((e) => ({ value: e.id, label: e.name }))}
              value={filterEvents[0] || ""}
              onChange={(e) => {
                const val = e.target.value;
                if (val) {
                  toggleMultiSelect(val, filterEvents, setFilterEvents);
                }
              }}
            />
            {filterEvents.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {filterEvents.map((id) => (
                  <span
                    key={id}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-white/[0.06] text-[var(--text-secondary)]"
                  >
                    {eventOptions.find((e) => e.id === id)?.name || id}
                    <button onClick={() => toggleMultiSelect(id, filterEvents, setFilterEvents)}>
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            <GlassSelect
              placeholder="Has Organization"
              options={[
                { value: "yes", label: "Yes" },
                { value: "no", label: "No" },
              ]}
              value={filterHasOrg}
              onChange={(e) => setFilterHasOrg(e.target.value)}
            />

            <GlassSelect
              placeholder="Correlation Type"
              options={[
                { value: "speaker_sponsor", label: "Speaker + Sponsor" },
                { value: "speaker_only", label: "Speaker Only" },
                { value: "sponsor_contact", label: "Sponsor Contact" },
                { value: "org_sponsor", label: "Org Sponsor" },
                { value: "none", label: "No Event Link" },
              ]}
              value={filterCorrelationType[0] || ""}
              onChange={(e) => {
                const val = e.target.value;
                if (val) toggleMultiSelect(val, filterCorrelationType, setFilterCorrelationType);
              }}
            />
            {filterCorrelationType.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {filterCorrelationType.map((ct) => (
                  <span
                    key={ct}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-white/[0.06] text-[var(--text-secondary)]"
                  >
                    {ct.replace(/_/g, " ")}
                    <button onClick={() => toggleMultiSelect(ct, filterCorrelationType, setFilterCorrelationType)}>
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </FilterGroup>

        <FilterGroup title="Profile" defaultOpen={false}>
          <div className="space-y-2">
            <GlassSelect
              placeholder="Seniority"
              options={seniorityOptions.map((s) => ({ value: s, label: s }))}
              value={filterSeniority[0] || ""}
              onChange={(e) => {
                const val = e.target.value;
                if (val) toggleMultiSelect(val, filterSeniority, setFilterSeniority);
              }}
            />
            {filterSeniority.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {filterSeniority.map((s) => (
                  <span key={s} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-white/[0.06] text-[var(--text-secondary)]">
                    {s}
                    <button onClick={() => toggleMultiSelect(s, filterSeniority, setFilterSeniority)}><X className="w-3 h-3" /></button>
                  </span>
                ))}
              </div>
            )}

            <GlassSelect
              placeholder="Department"
              options={departmentOptions.map((d) => ({ value: d, label: d }))}
              value={filterDepartment[0] || ""}
              onChange={(e) => {
                const val = e.target.value;
                if (val) toggleMultiSelect(val, filterDepartment, setFilterDepartment);
              }}
            />
            {filterDepartment.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {filterDepartment.map((d) => (
                  <span key={d} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-white/[0.06] text-[var(--text-secondary)]">
                    {d}
                    <button onClick={() => toggleMultiSelect(d, filterDepartment, setFilterDepartment)}><X className="w-3 h-3" /></button>
                  </span>
                ))}
              </div>
            )}

            <GlassSelect
              placeholder="Source"
              options={sourceOptions.map((s) => ({ value: s, label: s }))}
              value={filterSource[0] || ""}
              onChange={(e) => {
                const val = e.target.value;
                if (val) toggleMultiSelect(val, filterSource, setFilterSource);
              }}
            />
            {filterSource.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {filterSource.map((s) => (
                  <span key={s} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-white/[0.06] text-[var(--text-secondary)]">
                    {s}
                    <button onClick={() => toggleMultiSelect(s, filterSource, setFilterSource)}><X className="w-3 h-3" /></button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </FilterGroup>

        <FilterGroup title="Contact" defaultOpen={false}>
          <div className="space-y-2">
            <Toggle label="Has Email" checked={filterHasEmail} onChange={setFilterHasEmail} />
            <Toggle label="Has LinkedIn" checked={filterHasLinkedin} onChange={setFilterHasLinkedin} />
            <Toggle label="Has Phone" checked={filterHasPhone} onChange={setFilterHasPhone} />
            <Toggle label="Has Twitter" checked={filterHasTwitter} onChange={setFilterHasTwitter} />
            <Toggle label="Has Telegram" checked={filterHasTelegram} onChange={setFilterHasTelegram} />
          </div>
        </FilterGroup>

        <FilterGroup title="Enrichment" defaultOpen={false}>
          <div className="space-y-2">
            <GlassSelect
              placeholder="Enrichment Status"
              options={[
                { value: "none", label: "None" },
                { value: "in_progress", label: "In Progress" },
                { value: "complete", label: "Complete" },
                { value: "failed", label: "Failed" },
              ]}
              value={filterEnrichmentStatus[0] || ""}
              onChange={(e) => {
                const val = e.target.value;
                if (val) toggleMultiSelect(val, filterEnrichmentStatus, setFilterEnrichmentStatus);
              }}
            />
            {filterEnrichmentStatus.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {filterEnrichmentStatus.map((s) => (
                  <span key={s} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-white/[0.06] text-[var(--text-secondary)]">
                    {s}
                    <button onClick={() => toggleMultiSelect(s, filterEnrichmentStatus, setFilterEnrichmentStatus)}><X className="w-3 h-3" /></button>
                  </span>
                ))}
              </div>
            )}

            <div className="flex items-center gap-2">
              <GlassInput
                placeholder="ICP Min"
                type="number"
                value={filterIcpMin}
                onChange={(e) => setFilterIcpMin(e.target.value)}
                className="w-full"
              />
              <GlassInput
                placeholder="ICP Max"
                type="number"
                value={filterIcpMax}
                onChange={(e) => setFilterIcpMax(e.target.value)}
                className="w-full"
              />
            </div>
          </div>
        </FilterGroup>
      </GlassCard>

      {/* Active Filters */}
      <ActiveFilters
        filters={activeFilters}
        onRemove={handleRemoveFilter}
        onClearAll={handleClearAll}
      />

      {/* Selection Summary */}
      <SelectionSummary
        count={selectedIds.size}
        stats={selectionStats}
        actions={
          <div className="flex items-center gap-2">
            <AddToListDropdown personIds={Array.from(selectedIds)} />
            <Link
              href={`/admin/enrichment?persons=${Array.from(selectedIds).join(",")}`}
              className="px-2.5 py-1 text-xs font-medium rounded-lg bg-[var(--accent-orange)]/15 text-[var(--accent-orange)] border border-[var(--accent-orange)]/20 hover:bg-[var(--accent-orange)]/25 whitespace-nowrap"
            >
              Enrich
            </Link>
          </div>
        }
      />

      {/* Row Preview */}
      <PersonPreviewPanel
        setterRef={previewSetterRef}
        correlations={correlations}
        onMouseEnter={handlePreviewMouseEnter}
        onMouseLeave={handlePreviewMouseLeave}
      />
    </div>
  );

  // --- Render ---
  return (
    <TwoPanelLayout sidebar={sidebar}>
      <GlassCard padding={false}>
        <div className="overflow-x-auto">
          <div className="w-full min-w-[800px]">
            {/* Sticky header */}
            <div
              className="grid text-xs text-left text-[var(--text-muted)] border-b border-[var(--glass-border)] items-center"
              style={{ gridTemplateColumns: PERSON_GRID_COLS }}
            >
              <div className="px-2 py-2 flex items-center">
                <GlassCheckbox
                  checked={allVisibleSelected && filteredRows.length > 0}
                  onChange={toggleSelectAll}
                />
              </div>
              <SortHeader label="Name" field="full_name" />
              <SortHeader label="Organization" field="primary_org_name" />
              <SortHeader label="ICP" field="icp_score" />
              <div className="px-1.5 py-2 font-medium">Channels</div>
              <div className="px-1.5 py-2 font-medium">Events</div>
              <div className="px-1.5 py-2 font-medium hidden lg:block">Correlation</div>
              <div className="px-1 py-2 font-medium hidden lg:block">Enr.</div>
              <SortHeader label="Activity" field="last_interaction_at" />
            </div>

            {/* Virtualized scroll container */}
            <div
              ref={parentRef}
              className="overflow-y-auto"
              style={{ maxHeight: "calc(100vh - 220px)" }}
            >
              {filteredRows.length === 0 ? (
                <div className="px-5 py-12 text-center">
                  <Users className="w-10 h-10 text-[var(--text-muted)] mx-auto mb-3" />
                  <p className="text-[var(--text-muted)]">No persons found.</p>
                </div>
              ) : (
                <div style={{ position: "relative", height: `${virtualizer.getTotalSize()}px` }}>
                  {virtualizer.getVirtualItems().map((virtualItem) => {
                    const row = filteredRows[virtualItem.index];
                    return (
                      <PersonTableRow
                        key={row.id}
                        row={row}
                        isSelected={selectedIds.has(row.id)}
                        correlation={correlations[row.id]}
                        idx={virtualItem.index}
                        style={{
                          position: "absolute",
                          top: 0,
                          left: 0,
                          width: "100%",
                          height: `${virtualItem.size}px`,
                          transform: `translateY(${virtualItem.start}px)`,
                        }}
                        onMouseEnter={handleRowMouseEnter}
                        onMouseLeave={handleRowMouseLeave}
                        onCheckboxClick={handleCheckboxClick}
                        onRowClick={handleRowClick}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="px-2 py-2 border-t border-[var(--glass-border)] flex items-center justify-between">
          <p className="text-xs text-[var(--text-muted)]">
            {filteredRows.length} of {rows.length} persons
          </p>
          {selectedIds.size > 0 && (
            <p className="text-xs text-[var(--accent-orange)]">
              {selectedIds.size} selected
            </p>
          )}
        </div>
      </GlassCard>
    </TwoPanelLayout>
  );
}
