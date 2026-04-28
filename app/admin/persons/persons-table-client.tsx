"use client";

import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  Users,
} from "lucide-react";
import { TwoPanelLayout } from "@/components/admin/two-panel-layout";
import { ActiveFilters } from "@/components/admin/active-filters";
import { SelectionSummary } from "@/components/admin/selection-summary";
import { GlassCard } from "@/components/ui/glass-card";
import { AddToListDropdown } from "@/components/admin/add-to-list-dropdown";
import { toggleToRelation } from "@/components/admin/event-relation-toggle";
import { useEventPersonIds, useEventRelationMap } from "@/lib/queries/use-event-affiliations";
import { useEvents } from "@/lib/queries/use-events";
import { PersonFilterSidebar } from "@/components/admin/person-filter-sidebar";
import {
  applyPersonFilters,
  defaultPersonFilterRules,
  personFilterRulesToActiveFilters,
  removeFilterKey,
  clearAllFilters,
  type PersonFilterRules,
  type FilterKey,
} from "@/lib/filters/person-filters";

import { PersonTableRow, GlassCheckbox, PERSON_GRID_COLS } from "./person-table-row";
import { PersonPreviewPanel } from "./person-preview-panel";
import type { PersonRow, PersonEvent, OrgEvent, CorrelationResult } from "./person-table-row";
import { HeaderCell } from "@/components/ui/data-cell";

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
  const [rules, setRules] = useState<PersonFilterRules>(defaultPersonFilterRules());
  const [searchDebounced, setSearchDebounced] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(rules.search ?? ""), 300);
    return () => clearTimeout(t);
  }, [rules.search]);

  const eventRelation = rules.eventScope
    ? toggleToRelation(rules.eventScope.speaker, rules.eventScope.orgAffiliated)
    : null;
  const { data: events } = useEvents();
  void events;
  const { data: eventPersonIds } = useEventPersonIds(rules.eventScope?.eventId ?? null, eventRelation);
  const { data: eventRelationMap } = useEventRelationMap(rules.eventScope?.eventId ?? null);

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
    const rulesForApply: PersonFilterRules = { ...rules, search: searchDebounced };
    let result = applyPersonFilters(rows, rulesForApply, {
      correlations,
      eventPersonIds: rules.eventScope ? (eventPersonIds ? new Set(eventPersonIds) : null) : undefined,
    });

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
  }, [rows, rules, searchDebounced, eventPersonIds, sortField, sortDir, correlations]);

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
  const activeFilters = useMemo(
    () => personFilterRulesToActiveFilters(rules, { eventOptions }),
    [rules, eventOptions],
  );

  const handleRemoveFilter = useCallback((key: string) => {
    setRules((r) => removeFilterKey(r, key as FilterKey));
  }, []);

  const handleClearAll = useCallback(() => {
    setRules(clearAllFilters());
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
      <HeaderCell className={extraClass}>
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
      </HeaderCell>
    );
  }

  // --- Sidebar ---
  const sidebar = (
    <div className="space-y-3">
      <GlassCard padding={false} className="overflow-hidden">
        <PersonFilterSidebar
          rules={rules}
          onChange={setRules}
          eventOptions={eventOptions}
          sourceOptions={sourceOptions}
          seniorityOptions={seniorityOptions}
          departmentOptions={departmentOptions}
        />
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
          <div
            ref={parentRef}
            className="w-full min-w-[800px] overflow-y-auto"
            style={{ maxHeight: "calc(100vh - 220px)" }}
          >
            {/* Sticky header */}
            <div
              className="grid sticky top-0 z-10 bg-[var(--glass-bg)] backdrop-blur-sm border-b border-[var(--glass-border)]"
              style={{ gridTemplateColumns: PERSON_GRID_COLS }}
            >
              <HeaderCell>
                <GlassCheckbox
                  checked={allVisibleSelected && filteredRows.length > 0}
                  onChange={toggleSelectAll}
                />
              </HeaderCell>
              <SortHeader label="Name" field="full_name" />
              <SortHeader label="Organization" field="primary_org_name" />
              <SortHeader label="ICP" field="icp_score" />
              <HeaderCell>Channels</HeaderCell>
              <HeaderCell>Events</HeaderCell>
              <HeaderCell className="hidden lg:block">Correlation</HeaderCell>
              <HeaderCell className="hidden lg:block">Enr.</HeaderCell>
              <SortHeader label="Activity" field="last_interaction_at" />
            </div>

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
                      eventRelation={
                        rules.eventScope?.eventId ? eventRelationMap?.get(row.id) : undefined
                      }
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
