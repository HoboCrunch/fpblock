"use client";

import { useState, useMemo, useCallback, useRef, memo } from "react";
import { useRouter } from "next/navigation";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassInput } from "@/components/ui/glass-input";
import { GlassSelect } from "@/components/ui/glass-select";
import { Badge } from "@/components/ui/badge";
import { TwoPanelLayout } from "@/components/admin/two-panel-layout";
import { FilterGroup } from "@/components/admin/filter-group";
import { ActiveFilters } from "@/components/admin/active-filters";
import { SelectionSummary } from "@/components/admin/selection-summary";
import { OrgStatusIcons } from "@/app/admin/enrichment/components/status-icons";
import Link from "next/link";
import {
  Building2,
  Check,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Search,
  Globe,
  Linkedin,
} from "lucide-react";
import { cn } from "@/lib/utils";

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

function icpBadgeVariant(score: number | null) {
  if (score === null) return "default";
  if (score >= 90) return "replied";
  if (score >= 75) return "scheduled";
  return "default";
}

function employeeBucket(count: number | string | null): string {
  if (count === null || count === undefined) return "\u2014";
  const n = typeof count === "string" ? parseInt(count, 10) : count;
  if (isNaN(n)) return typeof count === "string" ? count : "\u2014";
  for (const b of EMPLOYEE_BUCKETS) {
    if (n >= b.min && n <= b.max) return b.label;
  }
  return `${n}`;
}

function relativeDate(dateStr: string | null): string {
  if (!dateStr) return "\u2014";
  const now = Date.now();
  const d = new Date(dateStr).getTime();
  const diff = now - d;
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days < 1) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

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
// Memoized Preview Card
// ------------------------------------------------------------------

const PreviewCard = memo(function PreviewCard({
  row,
  people,
  onMouseEnter,
  onMouseLeave,
}: {
  row: OrgRow;
  people: Array<{ full_name: string; title: string | null; seniority: string | null }>;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  return (
    <div onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
      <GlassCard className="animate-in fade-in slide-in-from-right-2 duration-200">
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            {row.logo_url ? (
              <img src={row.logo_url} alt="" className="w-12 h-12 rounded-lg object-cover" />
            ) : (
              <div className="w-12 h-12 rounded-lg bg-[var(--glass-bg)] border border-[var(--glass-border)] flex items-center justify-center text-lg font-bold text-[var(--text-muted)]">
                {row.name.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-white font-medium truncate">{row.name}</p>
              {row.category && <Badge variant="default" className="mt-0.5">{row.category}</Badge>}
            </div>
          </div>
          {row.description && (
            <p className="text-xs text-[var(--text-muted)] line-clamp-3">
              {row.description.slice(0, 120)}{row.description.length > 120 ? "..." : ""}
            </p>
          )}
          <div className="flex items-center gap-3">
            {row.website && (
              <a href={row.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-[var(--accent-indigo)] hover:underline">
                <Globe className="w-3 h-3" /> Website
              </a>
            )}
            {row.linkedin_url && (
              <a href={row.linkedin_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-[var(--accent-indigo)] hover:underline">
                <Linkedin className="w-3 h-3" /> LinkedIn
              </a>
            )}
          </div>
          {row.icp_reason && (
            <div>
              <p className="text-[10px] uppercase tracking-wide text-[var(--text-muted)] mb-0.5">ICP Reason</p>
              <p className="text-xs text-[var(--text-secondary)] line-clamp-2">{row.icp_reason}</p>
            </div>
          )}
          {row.usp && (
            <div>
              <p className="text-[10px] uppercase tracking-wide text-[var(--text-muted)] mb-0.5">USP</p>
              <p className="text-xs text-[var(--text-secondary)] line-clamp-2">
                {row.usp.slice(0, 100)}{row.usp.length > 100 ? "..." : ""}
              </p>
            </div>
          )}
          {people.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wide text-[var(--text-muted)] mb-1">Top People</p>
              <div className="space-y-1">
                {people.map((p, i) => (
                  <div key={i} className="text-xs">
                    <span className="text-white">{p.full_name}</span>
                    {p.title && <span className="text-[var(--text-muted)]"> - {p.title}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </GlassCard>
    </div>
  );
});

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
    // Don't immediately clear preview — let mouse-into-preview work
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

    if (filters.signalType) {
      // Signal type filtering not available at row level in current data shape
      // Would need signal_types on row — skipping for now
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
    return `Avg ICP ${avgIcp} · ${totalContacts} total contacts`;
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
        <PreviewCard
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
      <th className="px-2 py-3 font-medium">
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
      </th>
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
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[var(--text-muted)] border-b border-[var(--glass-border)]">
                <th className="px-2 py-3 w-10">
                  <GlassCheckbox checked={allVisibleSelected} onChange={toggleSelectAll} />
                </th>
                <SortHeader label="Name" field="name" />
                <SortHeader label="ICP" field="icp_score" />
                <SortHeader label="People" field="person_count" />
                <th className="px-2 py-3 font-medium">Events</th>
                <SortHeader label="Signals" field="signal_count" />
                <SortHeader label="Industry" field="industry" />
                <SortHeader label="Employees" field="employee_count" />
                <th className="px-2 py-3 font-medium hidden xl:table-cell">Enrichment</th>
                <SortHeader label="Last Signal" field="last_signal" />
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {filteredRows.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-5 py-12 text-center">
                    <Building2 className="w-10 h-10 text-[var(--text-muted)] mx-auto mb-3" />
                    <p className="text-[var(--text-muted)]">No organizations found.</p>
                  </td>
                </tr>
              )}
              {filteredRows.map((row, index) => (
                <tr
                  key={row.id}
                  className={`transition-all duration-150 cursor-pointer ${
                    hoveredId === row.id ? "bg-white/[0.05]" : "hover:bg-white/[0.03]"
                  } ${selectedIds.has(row.id) ? "bg-[var(--accent-orange)]/[0.04]" : ""}`}
                  onClick={(e) => {
                    // Don't navigate if clicking checkbox
                    const tag = (e.target as HTMLElement).tagName;
                    if (tag === "INPUT" || tag === "BUTTON" || (e.target as HTMLElement).closest("button")) return;
                    router.push(`/admin/organizations/${row.id}`);
                  }}
                  onMouseEnter={() => handleRowMouseEnter(row.id)}
                  onMouseLeave={handleRowMouseLeave}
                >
                  {/* Checkbox */}
                  <td className="px-2 py-3 w-10">
                    <GlassCheckbox
                      checked={selectedIds.has(row.id)}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleSelect(row.id, index, e.shiftKey);
                      }}
                    />
                  </td>

                  {/* Logo + Name + Category */}
                  <td className="px-2 py-3">
                    <div className="flex items-start gap-2 min-w-[140px]">
                      {row.logo_url ? (
                        <img
                          src={row.logo_url}
                          alt=""
                          className="w-6 h-6 rounded object-cover flex-shrink-0 mt-0.5"
                        />
                      ) : (
                        <div className="w-6 h-6 rounded bg-[var(--glass-bg)] border border-[var(--glass-border)] flex items-center justify-center text-[10px] font-bold text-[var(--text-muted)] flex-shrink-0 mt-0.5">
                          {row.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <span className="text-xs font-medium text-white truncate block max-w-[160px]">
                          {row.name}
                        </span>
                        {row.category && (
                          <Badge variant="default" className="text-[10px] mt-0.5">{row.category}</Badge>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* ICP */}
                  <td className="px-2 py-3">
                    {row.icp_score !== null ? (
                      <Badge variant={icpBadgeVariant(row.icp_score)}>
                        {row.icp_score}
                      </Badge>
                    ) : (
                      <span className="text-[var(--text-muted)]">&mdash;</span>
                    )}
                  </td>

                  {/* People */}
                  <td className="px-2 py-3 text-[var(--text-secondary)]">
                    {row.person_count}
                    {row.enriched_person_count > 0 && (
                      <span className="text-[var(--accent-orange)] ml-1">
                        ({row.enriched_person_count}&uarr;)
                      </span>
                    )}
                  </td>

                  {/* Events */}
                  <td className="px-2 py-3">
                    <div className="flex flex-wrap gap-1 max-w-[180px]">
                      {row.events.slice(0, 3).map((ev, i) => (
                        <Badge
                          key={i}
                          variant={ev.tier ? (ev.tier as string) : "glass-indigo"}
                          className="text-[10px]"
                        >
                          {ev.name}{ev.tier ? `: ${ev.tier}` : ""}
                        </Badge>
                      ))}
                      {row.events.length > 3 && (
                        <span className="text-[10px] text-[var(--text-muted)]">+{row.events.length - 3}</span>
                      )}
                      {row.events.length === 0 && <span className="text-[var(--text-muted)]">&mdash;</span>}
                    </div>
                  </td>

                  {/* Signals */}
                  <td className="px-2 py-3 text-[var(--text-secondary)]">
                    {row.signal_count}
                  </td>

                  {/* Industry */}
                  <td className="px-2 py-3 text-[var(--text-muted)] truncate max-w-[120px]">
                    {row.industry || "\u2014"}
                  </td>

                  {/* Employees */}
                  <td className="px-2 py-3 text-[var(--text-muted)]">
                    {employeeBucket(row.employee_count)}
                  </td>

                  {/* Enrichment Stages */}
                  <td className="px-2 py-3 hidden xl:table-cell">
                    <OrgStatusIcons stages={row.enrichment_stages} />
                  </td>

                  {/* Last Signal */}
                  <td className="px-2 py-3 text-[var(--text-muted)]">
                    {relativeDate(row.last_signal)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
