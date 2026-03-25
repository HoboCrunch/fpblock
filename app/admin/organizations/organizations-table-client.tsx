"use client";

import { useState, useMemo, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useVirtualizer } from "@tanstack/react-virtual";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassInput } from "@/components/ui/glass-input";
import { GlassSelect } from "@/components/ui/glass-select";
import { TwoPanelLayout } from "@/components/admin/two-panel-layout";
import { FilterGroup } from "@/components/admin/filter-group";
import { ActiveFilters } from "@/components/admin/active-filters";
import { SelectionSummary } from "@/components/admin/selection-summary";
import Link from "next/link";
import {
  Building2,
  Check,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { OrgTableRow, ORG_GRID_COLS } from "./org-table-row";
import { OrgPreviewCard } from "./org-preview-card";

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------

export interface OrgRow {
  id: string;
  name: string;
  logo_url: string | null;
  category: string | null;
  description: string | null;
  website: string | null;
  linkedin_url: string | null;
  icp_score: number | null;
  icp_reason: string | null;
  usp: string | null;
  enrichment_status: string | null;
  enrichment_stages: Record<string, { status?: string; error?: string; [key: string]: unknown }> | null;
  person_count: number;
  enriched_person_count: number;
  signal_count: number;
  last_signal: string | null;
  events: Array<{ id: string; name: string; role: string; tier: string | null }>;
  industry: string | null;
  employee_count: number | string | null;
}

export interface FilterOptions {
  categories: string[];
  signalTypes: string[];
  industries: string[];
  events: Array<{ id: string; name: string }>;
  sponsorTiers: string[];
}

interface Filters {
  search: string;
  event: string;
  sponsorTier: string;
  hasPeople: string;
  minPeopleCount: string;
  category: string;
  industry: string;
  employeeRange: string;
  foundedYearMin: string;
  foundedYearMax: string;
  enrichmentStatus: string;
  icpMin: string;
  icpMax: string;
  hasSignals: string;
  signalType: string;
}

type SortField = "name" | "category" | "icp_score" | "person_count" | "signal_count" | "last_signal" | "industry" | "employee_count";

const EMPTY_FILTERS: Filters = {
  search: "",
  event: "",
  sponsorTier: "",
  hasPeople: "",
  minPeopleCount: "",
  category: "",
  industry: "",
  employeeRange: "",
  foundedYearMin: "",
  foundedYearMax: "",
  enrichmentStatus: "",
  icpMin: "",
  icpMax: "",
  hasSignals: "",
  signalType: "",
};

const EMPLOYEE_BUCKETS = [
  { value: "1-10", label: "1-10", min: 1, max: 10 },
  { value: "11-50", label: "11-50", min: 11, max: 50 },
  { value: "51-200", label: "51-200", min: 51, max: 200 },
  { value: "201-500", label: "201-500", min: 201, max: 500 },
  { value: "501-1000", label: "501-1000", min: 501, max: 1000 },
  { value: "1000+", label: "1000+", min: 1001, max: Infinity },
];

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

function matchesEmployeeBucket(count: number | string | null, bucket: string): boolean {
  if (count === null || count === undefined) return false;
  const n = typeof count === "string" ? parseInt(count, 10) : count;
  if (isNaN(n)) return false;
  const b = EMPLOYEE_BUCKETS.find((b) => b.value === bucket);
  if (!b) return false;
  return n >= b.min && n <= b.max;
}

// ------------------------------------------------------------------
// GlassCheckbox
// ------------------------------------------------------------------

function GlassCheckbox({ checked, onChange, onClick }: { checked: boolean; onChange?: () => void; onClick?: (e: React.MouseEvent) => void }) {
  return (
    <button
      type="button"
      onClick={(e) => { if (onClick) onClick(e); else if (onChange) onChange(); }}
      className={cn(
        "w-4 h-4 rounded border flex items-center justify-center transition-all duration-150 flex-shrink-0",
        checked
          ? "bg-[var(--accent-orange)]/20 border-[var(--accent-orange)]/60 text-[var(--accent-orange)]"
          : "border-white/20 bg-white/[0.04] hover:border-white/40"
      )}
    >
      {checked && <Check className="w-3 h-3" />}
    </button>
  );
}

// ------------------------------------------------------------------
// Component
// ------------------------------------------------------------------

interface OrganizationsTableClientProps {
  rows: OrgRow[];
  filterOptions: FilterOptions;
  orgPeopleMap: Record<string, Array<{ full_name: string; title: string | null; seniority: string | null }>>;
}

export function OrganizationsTableClient({ rows, filterOptions, orgPeopleMap }: OrganizationsTableClientProps) {
  const router = useRouter();
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [sortField, setSortField] = useState<SortField>("icp_score");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const lastSelectedIndexRef = useRef<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Debounced hover
  const handleRowMouseEnter = useCallback((id: string) => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    setHoveredId(id);
    hoverTimeoutRef.current = setTimeout(() => {
      setPreviewId(id);
    }, 80);
  }, []);

  const handleRowMouseLeave = useCallback(() => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    setHoveredId(null);
    hoverTimeoutRef.current = setTimeout(() => {
      setPreviewId(null);
    }, 150);
  }, []);

  const handlePreviewMouseEnter = useCallback(() => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
  }, []);

  const handlePreviewMouseLeave = useCallback(() => {
    setPreviewId(null);
    setHoveredId(null);
  }, []);

  // Row click navigation
  const handleRowClick = useCallback((rowId: string) => {
    router.push(`/admin/organizations/${rowId}`);
  }, [router]);

  // Filter + sort rows
  const filteredRows = useMemo(() => {
    let result = rows;

    if (filters.search) {
      const s = filters.search.toLowerCase();
      result = result.filter(
        (r) =>
          r.name.toLowerCase().includes(s) ||
          (r.website && r.website.toLowerCase().includes(s)) ||
          (r.description && r.description.toLowerCase().includes(s))
      );
    }

    if (filters.event) {
      result = result.filter((r) => r.events.some((e) => e.id === filters.event));
    }

    if (filters.sponsorTier) {
      result = result.filter((r) => r.events.some((e) => e.tier === filters.sponsorTier));
    }

    if (filters.hasPeople === "yes") {
      result = result.filter((r) => r.person_count > 0);
    } else if (filters.hasPeople === "no") {
      result = result.filter((r) => r.person_count === 0);
    }

    if (filters.minPeopleCount) {
      const min = parseInt(filters.minPeopleCount);
      if (!isNaN(min)) result = result.filter((r) => r.person_count >= min);
    }

    if (filters.category) {
      result = result.filter((r) => r.category === filters.category);
    }

    if (filters.industry) {
      result = result.filter((r) => r.industry === filters.industry);
    }

    if (filters.employeeRange) {
      result = result.filter((r) => matchesEmployeeBucket(r.employee_count, filters.employeeRange));
    }

    if (filters.enrichmentStatus) {
      if (filters.enrichmentStatus === "none") {
        result = result.filter((r) => !r.enrichment_status || r.enrichment_status === "none");
      } else {
        result = result.filter((r) => r.enrichment_status === filters.enrichmentStatus);
      }
    }

    if (filters.icpMin) {
      const min = parseInt(filters.icpMin);
      if (!isNaN(min)) result = result.filter((r) => r.icp_score !== null && r.icp_score >= min);
    }

    if (filters.icpMax) {
      const max = parseInt(filters.icpMax);
      if (!isNaN(max)) result = result.filter((r) => r.icp_score !== null && r.icp_score <= max);
    }

    if (filters.hasSignals === "yes") {
      result = result.filter((r) => r.signal_count > 0);
    } else if (filters.hasSignals === "no") {
      result = result.filter((r) => r.signal_count === 0);
    }

    // Sort
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
  }, [rows, filters, sortField, sortDir]);

  // Virtualizer
  const virtualizer = useVirtualizer({
    count: filteredRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 36,
    overscan: 5,
  });

  // Update filter helper
  const setFilter = useCallback((key: keyof Filters, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  // Active filters for chip display
  const activeFiltersList = useMemo(() => {
    const list: Array<{ key: string; label: string; value: string }> = [];
    if (filters.event) {
      const ev = filterOptions.events.find((e) => e.id === filters.event);
      list.push({ key: "event", label: "Event", value: ev?.name || filters.event });
    }
    if (filters.sponsorTier) list.push({ key: "sponsorTier", label: "Sponsor Tier", value: filters.sponsorTier });
    if (filters.hasPeople) list.push({ key: "hasPeople", label: "Has People", value: filters.hasPeople });
    if (filters.minPeopleCount) list.push({ key: "minPeopleCount", label: "Min People", value: filters.minPeopleCount });
    if (filters.category) list.push({ key: "category", label: "Category", value: filters.category });
    if (filters.industry) list.push({ key: "industry", label: "Industry", value: filters.industry });
    if (filters.employeeRange) list.push({ key: "employeeRange", label: "Employees", value: filters.employeeRange });
    if (filters.enrichmentStatus) list.push({ key: "enrichmentStatus", label: "Enrichment", value: filters.enrichmentStatus });
    if (filters.icpMin) list.push({ key: "icpMin", label: "ICP Min", value: filters.icpMin });
    if (filters.icpMax) list.push({ key: "icpMax", label: "ICP Max", value: filters.icpMax });
    if (filters.hasSignals) list.push({ key: "hasSignals", label: "Has Signals", value: filters.hasSignals });
    if (filters.signalType) list.push({ key: "signalType", label: "Signal Type", value: filters.signalType });
    return list;
  }, [filters, filterOptions.events]);

  // Selection handlers
  const toggleSelect = useCallback(
    (id: string, index: number, shiftKey: boolean) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (shiftKey && lastSelectedIndexRef.current !== null) {
          const start = Math.min(lastSelectedIndexRef.current, index);
          const end = Math.max(lastSelectedIndexRef.current, index);
          for (let i = start; i <= end; i++) {
            next.add(filteredRows[i].id);
          }
        } else {
          if (next.has(id)) {
            next.delete(id);
          } else {
            next.add(id);
          }
        }
        lastSelectedIndexRef.current = index;
        return next;
      });
    },
    [filteredRows]
  );

  const toggleSelectAll = useCallback(() => {
    const allVisible = filteredRows.map((r) => r.id);
    const allSelected = allVisible.every((id) => selectedIds.has(id));
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allVisible));
    }
  }, [filteredRows, selectedIds]);

  // Selection stats
  const selectionStats = useMemo(() => {
    if (selectedIds.size === 0) return "";
    const selected = rows.filter((r) => selectedIds.has(r.id));
    const withIcp = selected.filter((r) => r.icp_score !== null);
    const avgIcp = withIcp.length > 0 ? Math.round(withIcp.reduce((s, r) => s + (r.icp_score ?? 0), 0) / withIcp.length) : 0;
    const totalContacts = selected.reduce((s, r) => s + r.person_count, 0);
    return `Avg ICP ${avgIcp} \u00b7 ${totalContacts} total contacts`;
  }, [selectedIds, rows]);

  // Sort handler
  const handleSort = useCallback(
    (field: SortField) => {
      if (sortField === field) {
        setSortDir((d) => (d === "desc" ? "asc" : "desc"));
      } else {
        setSortField(field);
        setSortDir("desc");
      }
    },
    [sortField]
  );

  // Pre-compute row lookup Map for O(1) access
  const rowMap = useMemo(() => {
    const m = new Map<string, OrgRow>();
    for (const r of rows) m.set(r.id, r);
    return m;
  }, [rows]);

  // Preview row data
  const previewRow = previewId ? rowMap.get(previewId) ?? null : null;
  const previewPeople = previewId ? orgPeopleMap[previewId] || [] : [];

  // ------------------------------------------------------------------
  // Sidebar
  // ------------------------------------------------------------------

  const sidebar = (
    <div className="space-y-4">
      {/* Search */}
      <GlassInput
        icon={Search}
        placeholder="Search name, website, description..."
        value={filters.search}
        onChange={(e) => setFilter("search", e.target.value)}
      />

      {/* Filter Groups */}
      <GlassCard padding={false} className="p-4">
        <FilterGroup title="Relationships" defaultOpen={true}>
          <div className="space-y-2">
            <GlassSelect
              placeholder="Event"
              options={filterOptions.events.map((e) => ({ value: e.id, label: e.name }))}
              value={filters.event}
              onChange={(e) => setFilter("event", e.target.value)}
            />
            <GlassSelect
              placeholder="Sponsor Tier"
              options={filterOptions.sponsorTiers.map((t) => ({ value: t, label: t }))}
              value={filters.sponsorTier}
              onChange={(e) => setFilter("sponsorTier", e.target.value)}
            />
            <GlassSelect
              placeholder="Has People"
              options={[
                { value: "yes", label: "Yes" },
                { value: "no", label: "No" },
              ]}
              value={filters.hasPeople}
              onChange={(e) => setFilter("hasPeople", e.target.value)}
            />
            <GlassInput
              placeholder="Min People Count"
              type="number"
              value={filters.minPeopleCount}
              onChange={(e) => setFilter("minPeopleCount", e.target.value)}
            />
          </div>
        </FilterGroup>

        <FilterGroup title="Profile" defaultOpen={false}>
          <div className="space-y-2">
            <GlassSelect
              placeholder="Category"
              options={filterOptions.categories.map((c) => ({ value: c, label: c }))}
              value={filters.category}
              onChange={(e) => setFilter("category", e.target.value)}
            />
            <GlassSelect
              placeholder="Industry"
              options={filterOptions.industries.map((i) => ({ value: i, label: i }))}
              value={filters.industry}
              onChange={(e) => setFilter("industry", e.target.value)}
            />
            <GlassSelect
              placeholder="Employee Range"
              options={EMPLOYEE_BUCKETS.map((b) => ({ value: b.value, label: b.label }))}
              value={filters.employeeRange}
              onChange={(e) => setFilter("employeeRange", e.target.value)}
            />
          </div>
        </FilterGroup>

        <FilterGroup title="Enrichment" defaultOpen={false}>
          <div className="space-y-2">
            <GlassSelect
              placeholder="Status"
              options={[
                { value: "none", label: "None" },
                { value: "in_progress", label: "In Progress" },
                { value: "partial", label: "Partial" },
                { value: "complete", label: "Complete" },
                { value: "failed", label: "Failed" },
              ]}
              value={filters.enrichmentStatus}
              onChange={(e) => setFilter("enrichmentStatus", e.target.value)}
            />
            <GlassInput
              placeholder="ICP Min"
              type="number"
              value={filters.icpMin}
              onChange={(e) => setFilter("icpMin", e.target.value)}
            />
            <GlassInput
              placeholder="ICP Max"
              type="number"
              value={filters.icpMax}
              onChange={(e) => setFilter("icpMax", e.target.value)}
            />
          </div>
        </FilterGroup>

        <FilterGroup title="Signals" defaultOpen={false}>
          <div className="space-y-2">
            <GlassSelect
              placeholder="Has Signals"
              options={[
                { value: "yes", label: "Yes" },
                { value: "no", label: "No" },
              ]}
              value={filters.hasSignals}
              onChange={(e) => setFilter("hasSignals", e.target.value)}
            />
            <GlassSelect
              placeholder="Signal Type"
              options={filterOptions.signalTypes.map((t) => ({ value: t, label: t }))}
              value={filters.signalType}
              onChange={(e) => setFilter("signalType", e.target.value)}
            />
          </div>
        </FilterGroup>
      </GlassCard>

      {/* Active Filters */}
      <ActiveFilters
        filters={activeFiltersList}
        onRemove={(key) => setFilter(key as keyof Filters, "")}
        onClearAll={() => setFilters(EMPTY_FILTERS)}
      />

      {/* Selection Summary */}
      <SelectionSummary
        count={selectedIds.size}
        stats={selectionStats}
        actions={
          <>
            <Link
              href="/admin/enrichment"
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-[var(--accent-orange)]/15 text-[var(--accent-orange)] border border-[var(--accent-orange)]/20 hover:bg-[var(--accent-orange)]/25"
            >
              Enrich
            </Link>
          </>
        }
      />

      {/* Row Preview */}
      {previewRow && (
        <OrgPreviewCard
          row={previewRow}
          people={previewPeople}
          onMouseEnter={handlePreviewMouseEnter}
          onMouseLeave={handlePreviewMouseLeave}
        />
      )}
    </div>
  );

  // ------------------------------------------------------------------
  // Sort Header Component
  // ------------------------------------------------------------------

  function SortHeader({ label, field }: { label: string; field: SortField }) {
    const isActive = sortField === field;
    return (
      <div className="px-2 py-3 font-medium">
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

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  const allVisibleSelected = filteredRows.length > 0 && filteredRows.every((r) => selectedIds.has(r.id));

  return (
    <TwoPanelLayout sidebar={sidebar}>
      <GlassCard padding={false}>
        <div className="overflow-x-auto">
          {/* Single table with colgroup for consistent column widths */}
          <div className="w-full min-w-[900px]">
            {/* Sticky header */}
            <div className="grid text-sm text-left text-[var(--text-muted)] border-b border-[var(--glass-border)]"
              style={{ gridTemplateColumns: ORG_GRID_COLS }}
            >
              <div className="px-2 py-3 flex items-center">
                <GlassCheckbox checked={allVisibleSelected} onChange={toggleSelectAll} />
              </div>
              <SortHeader label="Name" field="name" />
              <SortHeader label="ICP" field="icp_score" />
              <SortHeader label="People" field="person_count" />
              <div className="px-2 py-3 font-medium">Events</div>
              <SortHeader label="Signals" field="signal_count" />
              <SortHeader label="Industry" field="industry" />
              <SortHeader label="Employees" field="employee_count" />
              <div className="px-2 py-3 font-medium hidden xl:block">Enrichment</div>
              <SortHeader label="Last Signal" field="last_signal" />
            </div>

            {/* Virtualized scroll container */}
            <div
              ref={scrollRef}
              className="overflow-y-auto"
              style={{ height: "calc(100vh - 280px)" }}
            >
              {filteredRows.length === 0 ? (
                <div className="px-5 py-12 text-center">
                  <Building2 className="w-10 h-10 text-[var(--text-muted)] mx-auto mb-3" />
                  <p className="text-[var(--text-muted)]">No organizations found.</p>
                </div>
              ) : (
                <div style={{ position: "relative", height: `${virtualizer.getTotalSize()}px` }}>
                  {virtualizer.getVirtualItems().map((virtualItem) => {
                    const row = filteredRows[virtualItem.index];
                    return (
                      <OrgTableRow
                        key={row.id}
                        row={row}
                        index={virtualItem.index}
                        isSelected={selectedIds.has(row.id)}
                        isHovered={hoveredId === row.id}
                        style={{
                          position: "absolute",
                          top: 0,
                          left: 0,
                          width: "100%",
                          transform: `translateY(${virtualItem.start}px)`,
                          height: `${virtualItem.size}px`,
                        }}
                        onRowClick={handleRowClick}
                        onMouseEnter={handleRowMouseEnter}
                        onMouseLeave={handleRowMouseLeave}
                        onToggleSelect={toggleSelect}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="px-5 py-3 border-t border-[var(--glass-border)]">
          <p className="text-xs text-[var(--text-muted)]">
            {filteredRows.length} organization{filteredRows.length !== 1 ? "s" : ""}
            {filteredRows.length !== rows.length && ` (${rows.length} total)`}
          </p>
        </div>
      </GlassCard>
    </TwoPanelLayout>
  );
}
