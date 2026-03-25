"use client";

import React from "react";
import { GlassInput } from "@/components/ui/glass-input";
import { GlassSelect } from "@/components/ui/glass-select";
import { Search } from "lucide-react";

// ---------- Types ----------

export interface FilterState {
  search: string;
  event: string;
  initiative: string;
  icpMin: string;
  icpMax: string;
  status: string;
  categoryOrSource: string;
}

export interface FilterBarProps {
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  tab: "persons" | "organizations";
  events: { id: string; name: string }[];
  initiatives: { id: string; name: string }[];
  categories: string[];
  sources: string[];
}

// ---------- Component ----------

const ORG_STATUS_OPTIONS = [
  { value: "", label: "All" },
  { value: "none", label: "New" },
  { value: "partial", label: "Partial" },
  { value: "complete", label: "Complete" },
  { value: "failed", label: "Failed" },
];

const PERSON_STATUS_OPTIONS = [
  { value: "", label: "All" },
  { value: "none", label: "New" },
  { value: "complete", label: "Complete" },
  { value: "failed", label: "Failed" },
];

export const FilterBar = React.memo(function FilterBar({
  filters,
  onFiltersChange,
  tab,
  events,
  initiatives,
  categories,
  sources,
}: FilterBarProps) {
  const update = (patch: Partial<FilterState>) =>
    onFiltersChange({ ...filters, ...patch });

  const statusOptions =
    tab === "organizations" ? ORG_STATUS_OPTIONS : PERSON_STATUS_OPTIONS;

  const categoryOrSourceOptions =
    tab === "organizations"
      ? categories.map((c) => ({ value: c, label: c }))
      : sources.map((s) => ({ value: s, label: s }));

  const categoryOrSourceLabel =
    tab === "organizations" ? "Category" : "Source";

  return (
    <div className="flex flex-wrap items-center gap-2 mb-3">
      {/* Search */}
      <div className="w-44">
        <GlassInput
          icon={Search}
          placeholder="Search..."
          value={filters.search}
          onChange={(e) => update({ search: e.target.value })}
          className="text-xs py-1.5"
        />
      </div>

      {/* Event */}
      <div className="w-36">
        <GlassSelect
          value={filters.event}
          onChange={(e) => update({ event: e.target.value })}
          options={events.map((ev) => ({ value: ev.id, label: ev.name }))}
          placeholder="Event"
          className="text-xs py-1.5"
        />
      </div>

      {/* Initiative */}
      <div className="w-36">
        <GlassSelect
          value={filters.initiative}
          onChange={(e) => update({ initiative: e.target.value })}
          options={initiatives.map((i) => ({ value: i.id, label: i.name }))}
          placeholder="Initiative"
          className="text-xs py-1.5"
        />
      </div>

      {/* ICP min-max */}
      <div className="flex items-center gap-1">
        <div className="w-16">
          <GlassInput
            type="number"
            placeholder="ICP ≥"
            value={filters.icpMin}
            onChange={(e) => update({ icpMin: e.target.value })}
            className="text-xs py-1.5"
            min={0}
            max={100}
          />
        </div>
        <span className="text-[var(--text-muted)] text-xs">–</span>
        <div className="w-16">
          <GlassInput
            type="number"
            placeholder="≤"
            value={filters.icpMax}
            onChange={(e) => update({ icpMax: e.target.value })}
            className="text-xs py-1.5"
            min={0}
            max={100}
          />
        </div>
      </div>

      {/* Status */}
      <div className="w-28">
        <GlassSelect
          value={filters.status}
          onChange={(e) => update({ status: e.target.value })}
          options={statusOptions}
          placeholder="Status"
          className="text-xs py-1.5"
        />
      </div>

      {/* Category / Source */}
      <div className="w-32">
        <GlassSelect
          value={filters.categoryOrSource}
          onChange={(e) => update({ categoryOrSource: e.target.value })}
          options={categoryOrSourceOptions}
          placeholder={categoryOrSourceLabel}
          className="text-xs py-1.5"
        />
      </div>

    </div>
  );
});

FilterBar.displayName = "FilterBar";
