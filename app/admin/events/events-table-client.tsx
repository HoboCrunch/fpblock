"use client";

import { useState, useMemo, useRef, useCallback } from "react";
import Link from "next/link";
import {
  Search,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  Calendar,
  Globe,
  ExternalLink,
  Check,
} from "lucide-react";
import { TwoPanelLayout } from "@/components/admin/two-panel-layout";
import { FilterGroup } from "@/components/admin/filter-group";
import { ActiveFilters } from "@/components/admin/active-filters";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassInput } from "@/components/ui/glass-input";
import { Badge } from "@/components/ui/badge";
import { CoverageMetrics } from "@/components/admin/coverage-metrics";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────

interface EventRow {
  id: string;
  name: string;
  event_type: string | null;
  date_start: string | null;
  date_end: string | null;
  location: string | null;
  website: string | null;
  speaker_count: number;
  sponsor_count: number;
  contact_count: number;
  org_count: number;
  enriched_contact_pct: number;
  avg_icp: number | null;
  total_signals: number;
  top_sponsors: Array<{
    name: string;
    tier: string | null;
    icp: number | null;
  }>;
}

interface Props {
  events: EventRow[];
  eventTypes: string[];
  locations: string[];
}

type SortField =
  | "name"
  | "event_type"
  | "date_start"
  | "location"
  | "speaker_count"
  | "sponsor_count"
  | "contact_count"
  | "org_count"
  | "avg_icp";

// ─── Helpers ─────────────────────────────────────────────────────────

function formatDateRange(start: string | null, end: string | null): string {
  if (!start) return "—";
  const s = new Date(start);
  const sMonth = s.toLocaleString("en-US", { month: "short" });
  const sDay = s.getDate();

  if (!end) return `${sMonth} ${sDay}`;

  const e = new Date(end);
  const eMonth = e.toLocaleString("en-US", { month: "short" });
  const eDay = e.getDate();

  if (sMonth === eMonth) {
    return `${sMonth} ${sDay}\u2013${eDay}`;
  }
  return `${sMonth} ${sDay} \u2013 ${eMonth} ${eDay}`;
}

function icpColor(score: number | null): string {
  if (score === null) return "default";
  if (score >= 90) return "replied"; // green
  if (score >= 75) return "scheduled"; // blue/yellow
  return "default";
}

// ─── Glass Checkbox ──────────────────────────────────────────────────

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

// ─── Component ───────────────────────────────────────────────────────

export function EventsTableClient({ events, eventTypes, locations }: Props) {
  // Filters
  const [search, setSearch] = useState("");
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [minSpeakers, setMinSpeakers] = useState("");
  const [minSponsors, setMinSponsors] = useState("");
  const [hasEnrichedContacts, setHasEnrichedContacts] = useState(false);
  const [minAvgIcp, setMinAvgIcp] = useState("");

  // Sort
  const [sortField, setSortField] = useState<SortField>("date_start");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // Hover preview
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const hoverTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);

  const handleRowEnter = useCallback((id: string) => {
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
    hoverTimeout.current = setTimeout(() => setHoveredId(id), 80);
  }, []);

  const handleRowLeave = useCallback(() => {
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
    hoverTimeout.current = setTimeout(() => setHoveredId(null), 150);
  }, []);

  const handlePreviewEnter = useCallback(() => {
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
  }, []);

  const handlePreviewLeave = useCallback(() => {
    hoverTimeout.current = setTimeout(() => setHoveredId(null), 150);
  }, []);

  // ─── Filter logic ──────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let rows = [...events];

    // Text search
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          (r.location && r.location.toLowerCase().includes(q)),
      );
    }

    // Type filter
    if (selectedTypes.length > 0) {
      rows = rows.filter(
        (r) =>
          r.event_type && selectedTypes.includes(r.event_type.toLowerCase()),
      );
    }

    // Date range
    if (dateFrom) {
      rows = rows.filter(
        (r) => r.date_start && r.date_start >= dateFrom,
      );
    }
    if (dateTo) {
      rows = rows.filter(
        (r) => r.date_start && r.date_start <= dateTo,
      );
    }

    // Location
    if (locationFilter.trim()) {
      const loc = locationFilter.toLowerCase();
      rows = rows.filter(
        (r) => r.location && r.location.toLowerCase().includes(loc),
      );
    }

    // Coverage filters
    if (minSpeakers) {
      const min = parseInt(minSpeakers);
      if (!isNaN(min)) rows = rows.filter((r) => r.speaker_count >= min);
    }
    if (minSponsors) {
      const min = parseInt(minSponsors);
      if (!isNaN(min)) rows = rows.filter((r) => r.sponsor_count >= min);
    }
    if (hasEnrichedContacts) {
      rows = rows.filter((r) => r.enriched_contact_pct > 0);
    }
    if (minAvgIcp) {
      const min = parseInt(minAvgIcp);
      if (!isNaN(min))
        rows = rows.filter(
          (r) => r.avg_icp !== null && r.avg_icp >= min,
        );
    }

    return rows;
  }, [
    events,
    search,
    selectedTypes,
    dateFrom,
    dateTo,
    locationFilter,
    minSpeakers,
    minSponsors,
    hasEnrichedContacts,
    minAvgIcp,
  ]);

  // ─── Sort logic ────────────────────────────────────────────────────
  const sorted = useMemo(() => {
    const rows = [...filtered];
    rows.sort((a, b) => {
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
    return rows;
  }, [filtered, sortField, sortDir]);

  // ─── Active filter chips ───────────────────────────────────────────
  const activeFilters = useMemo(() => {
    const chips: Array<{ key: string; label: string; value: string }> = [];
    if (search.trim()) chips.push({ key: "search", label: "Search", value: search });
    if (selectedTypes.length > 0)
      chips.push({
        key: "types",
        label: "Type",
        value: selectedTypes.join(", "),
      });
    if (dateFrom) chips.push({ key: "dateFrom", label: "From", value: dateFrom });
    if (dateTo) chips.push({ key: "dateTo", label: "To", value: dateTo });
    if (locationFilter.trim())
      chips.push({ key: "location", label: "Location", value: locationFilter });
    if (minSpeakers)
      chips.push({ key: "minSpeakers", label: "Min Speakers", value: minSpeakers });
    if (minSponsors)
      chips.push({ key: "minSponsors", label: "Min Sponsors", value: minSponsors });
    if (hasEnrichedContacts)
      chips.push({ key: "hasEnriched", label: "Has Enriched", value: "Yes" });
    if (minAvgIcp)
      chips.push({ key: "minAvgIcp", label: "Min Avg ICP", value: minAvgIcp });
    return chips;
  }, [
    search,
    selectedTypes,
    dateFrom,
    dateTo,
    locationFilter,
    minSpeakers,
    minSponsors,
    hasEnrichedContacts,
    minAvgIcp,
  ]);

  function removeFilter(key: string) {
    switch (key) {
      case "search": setSearch(""); break;
      case "types": setSelectedTypes([]); break;
      case "dateFrom": setDateFrom(""); break;
      case "dateTo": setDateTo(""); break;
      case "location": setLocationFilter(""); break;
      case "minSpeakers": setMinSpeakers(""); break;
      case "minSponsors": setMinSponsors(""); break;
      case "hasEnriched": setHasEnrichedContacts(false); break;
      case "minAvgIcp": setMinAvgIcp(""); break;
    }
  }

  function clearAllFilters() {
    setSearch("");
    setSelectedTypes([]);
    setDateFrom("");
    setDateTo("");
    setLocationFilter("");
    setMinSpeakers("");
    setMinSponsors("");
    setHasEnrichedContacts(false);
    setMinAvgIcp("");
  }

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  }

  function toggleType(type: string) {
    setSelectedTypes((prev) =>
      prev.includes(type)
        ? prev.filter((t) => t !== type)
        : [...prev, type],
    );
  }

  // Pre-compute row lookup for hover preview
  const eventMap = useMemo(() => {
    const map = new Map<string, EventRow>();
    for (const e of events) map.set(e.id, e);
    return map;
  }, [events]);

  const hoveredEvent = hoveredId ? eventMap.get(hoveredId) ?? null : null;

  // ─── Sort header component ────────────────────────────────────────
  function SortHeader({
    label,
    field,
    className,
  }: {
    label: string;
    field: SortField;
    className?: string;
  }) {
    const isActive = sortField === field;
    return (
      <th className={`px-2 py-3 font-medium ${className ?? ""}`}>
        <button
          onClick={() => toggleSort(field)}
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

  // ─── Sidebar ───────────────────────────────────────────────────────
  const sidebar = (
    <div className="space-y-4">
      {/* Search */}
      <GlassInput
        icon={Search}
        placeholder="Search events..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {/* Active Filters */}
      <ActiveFilters
        filters={activeFilters}
        onRemove={removeFilter}
        onClearAll={clearAllFilters}
      />

      {/* Event Filters */}
      <GlassCard padding={false} className="p-3">
        <FilterGroup title="Event">
          <div className="space-y-2">
            <label className="text-xs text-[var(--text-muted)]">Type</label>
            <div className="flex flex-wrap gap-1.5">
              {eventTypes.map((type) => (
                <button
                  key={type}
                  onClick={() => toggleType(type.toLowerCase())}
                  className={`px-2 py-1 text-xs rounded-md border transition-all duration-150 ${
                    selectedTypes.includes(type.toLowerCase())
                      ? "bg-[var(--accent-orange)]/15 text-[var(--accent-orange)] border-[var(--accent-orange)]/30"
                      : "glass text-[var(--text-secondary)] hover:text-white"
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>

            <label className="text-xs text-[var(--text-muted)] mt-2 block">
              Date Range
            </label>
            <div className="flex gap-2">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="flex-1 glass rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-[var(--accent-orange)]/40"
              />
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="flex-1 glass rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-[var(--accent-orange)]/40"
              />
            </div>

            <label className="text-xs text-[var(--text-muted)] mt-2 block">
              Location
            </label>
            <GlassInput
              placeholder="Filter by location..."
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              className="text-xs"
            />
          </div>
        </FilterGroup>

        <FilterGroup title="Coverage" defaultOpen={false}>
          <div className="space-y-2">
            <label className="text-xs text-[var(--text-muted)]">
              Min Speakers
            </label>
            <GlassInput
              type="number"
              placeholder="0"
              value={minSpeakers}
              onChange={(e) => setMinSpeakers(e.target.value)}
              className="text-xs"
            />

            <label className="text-xs text-[var(--text-muted)]">
              Min Sponsors
            </label>
            <GlassInput
              type="number"
              placeholder="0"
              value={minSponsors}
              onChange={(e) => setMinSponsors(e.target.value)}
              className="text-xs"
            />

            <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)] cursor-pointer mt-1">
              <GlassCheckbox
                checked={hasEnrichedContacts}
                onChange={() => setHasEnrichedContacts(!hasEnrichedContacts)}
              />
              Has Enriched Contacts
            </label>

            <label className="text-xs text-[var(--text-muted)] mt-1 block">
              Min Avg ICP
            </label>
            <GlassInput
              type="number"
              placeholder="0"
              value={minAvgIcp}
              onChange={(e) => setMinAvgIcp(e.target.value)}
              className="text-xs"
            />
          </div>
        </FilterGroup>
      </GlassCard>

      {/* Event Preview */}
      {hoveredEvent && (
        <div
          ref={previewRef}
          onMouseEnter={handlePreviewEnter}
          onMouseLeave={handlePreviewLeave}
        >
          <GlassCard className="space-y-3">
            <h3 className="text-sm font-semibold text-white truncate">
              {hoveredEvent.name}
            </h3>

            <div className="space-y-1.5 text-xs">
              <div className="flex items-center gap-2 text-[var(--text-secondary)]">
                <Calendar className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                {formatDateRange(
                  hoveredEvent.date_start,
                  hoveredEvent.date_end,
                )}
              </div>

              {hoveredEvent.location && (
                <p className="text-[var(--text-muted)]">
                  {hoveredEvent.location}
                </p>
              )}

              {hoveredEvent.website && (
                <a
                  href={hoveredEvent.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[var(--accent-indigo)] hover:underline"
                >
                  <Globe className="w-3 h-3" />
                  Website
                  <ExternalLink className="w-2.5 h-2.5" />
                </a>
              )}
            </div>

            {hoveredEvent.top_sponsors.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-medium">
                  Top Sponsors
                </p>
                <div className="space-y-1">
                  {hoveredEvent.top_sponsors.map((sp, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between text-xs"
                    >
                      <span className="text-[var(--text-secondary)] truncate">
                        {sp.name}
                      </span>
                      <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                        {sp.tier && (
                          <Badge variant={sp.tier} className="text-[9px] px-1.5 py-0">
                            {sp.tier}
                          </Badge>
                        )}
                        {sp.icp !== null && (
                          <Badge
                            variant={icpColor(sp.icp)}
                            className="text-[9px] px-1.5 py-0"
                          >
                            {sp.icp}
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="pt-2 border-t border-white/[0.06]">
              <p className="text-[10px] text-[var(--text-muted)]">
                {hoveredEvent.sponsor_count > 0
                  ? `${Math.round(hoveredEvent.enriched_contact_pct)}% sponsors enriched`
                  : "No sponsors"}{" "}
                · {hoveredEvent.contact_count} contacts ·{" "}
                {hoveredEvent.avg_icp !== null
                  ? `Avg ICP ${Math.round(hoveredEvent.avg_icp)}`
                  : "No ICP data"}
              </p>
            </div>
          </GlassCard>
        </div>
      )}
    </div>
  );

  // ─── Render ────────────────────────────────────────────────────────
  return (
    <TwoPanelLayout sidebar={sidebar}>
      <GlassCard padding={false}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[var(--text-muted)] border-b border-[var(--glass-border)]">
                <SortHeader label="Name" field="name" />
                <SortHeader label="Type" field="event_type" />
                <SortHeader label="Dates" field="date_start" />
                <SortHeader label="Location" field="location" />
                <SortHeader label="Speakers" field="speaker_count" />
                <SortHeader label="Sponsors" field="sponsor_count" />
                <SortHeader label="Contacts" field="contact_count" />
                <SortHeader label="Orgs" field="org_count" />
                <th className="px-2 py-3 font-medium">Coverage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-5 py-12 text-center">
                    <Calendar className="w-10 h-10 text-[var(--text-muted)] mx-auto mb-3" />
                    <p className="text-[var(--text-muted)]">
                      No events match your filters.
                    </p>
                  </td>
                </tr>
              )}
              {sorted.map((event) => (
                <tr
                  key={event.id}
                  className="hover:bg-white/[0.03] transition-all duration-200 cursor-pointer"
                  onMouseEnter={() => handleRowEnter(event.id)}
                  onMouseLeave={handleRowLeave}
                  onClick={() => {
                    window.location.href = `/admin/events/${event.id}`;
                  }}
                >
                  <td className="px-2 py-3">
                    <Link
                      href={`/admin/events/${event.id}`}
                      className="text-[var(--accent-indigo)] hover:underline font-medium"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {event.name}
                    </Link>
                  </td>
                  <td className="px-2 py-3">
                    {event.event_type ? (
                      <Badge
                        variant={
                          event.event_type.toLowerCase() === "conference"
                            ? "glass-orange"
                            : event.event_type.toLowerCase() === "hackathon"
                              ? "approved"
                              : event.event_type.toLowerCase() === "summit"
                                ? "scheduled"
                                : event.event_type.toLowerCase() === "meetup"
                                  ? "replied"
                                  : "default"
                        }
                      >
                        {event.event_type}
                      </Badge>
                    ) : (
                      <span className="text-[var(--text-muted)]">&mdash;</span>
                    )}
                  </td>
                  <td className="px-2 py-3 text-[var(--text-secondary)] whitespace-nowrap">
                    {formatDateRange(event.date_start, event.date_end)}
                  </td>
                  <td className="px-2 py-3 text-[var(--text-muted)] max-w-[130px] truncate">
                    {event.location ?? "—"}
                  </td>
                  <td className="px-2 py-3 text-[var(--text-secondary)] text-center">
                    {event.speaker_count}
                  </td>
                  <td className="px-2 py-3 text-[var(--text-secondary)] text-center">
                    {event.sponsor_count}
                  </td>
                  <td className="px-2 py-3 text-[var(--text-secondary)] text-center">
                    {event.contact_count}
                  </td>
                  <td className="px-2 py-3 text-[var(--text-secondary)] text-center">
                    {event.org_count}
                  </td>
                  <td className="px-2 py-3">
                    <CoverageMetrics
                      enrichedContactPct={event.enriched_contact_pct}
                      avgIcp={event.avg_icp}
                      totalSignals={event.total_signals}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="px-5 py-3 border-t border-[var(--glass-border)]">
          <p className="text-xs text-[var(--text-muted)]">
            {sorted.length} event{sorted.length !== 1 ? "s" : ""}
            {sorted.length !== events.length &&
              ` (filtered from ${events.length})`}
          </p>
        </div>
      </GlassCard>
    </TwoPanelLayout>
  );
}
