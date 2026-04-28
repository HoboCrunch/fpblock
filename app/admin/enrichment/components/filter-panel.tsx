"use client";

import React from "react";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassInput } from "@/components/ui/glass-input";
import { MultiSelectField } from "@/components/admin/multi-select-field";
import { EventRelationToggle } from "@/components/admin/event-relation-toggle";
import { cn } from "@/lib/utils";
import { Search, X, RotateCcw } from "lucide-react";

// ----- Types (re-export hoisted from Task 1) -----

export type TriState = "any" | "present" | "missing";

export interface PersonFilterState {
  search: string;
  eventIds: string[];
  speakerOn: boolean;
  orgAffiliatedOn: boolean;
  initiativeIds: string[];
  savedListIds: string[];
  sources: string[];
  statuses: string[];
  icpMin: number | null;
  icpMax: number | null;
  icpIncludeNull: boolean;
  hasEmail: TriState;
  hasLinkedin: TriState;
  hasTwitter: TriState;
  hasPhone: TriState;
  specificIds: string[] | null;
}

export interface OrgFilterState {
  search: string;
  eventIds: string[];
  initiativeIds: string[];
  categories: string[];
  statuses: string[];
  icpMin: number | null;
  icpMax: number | null;
  icpIncludeNull: boolean;
  hasPeople: TriState;
  specificIds: string[] | null;
}

export const EMPTY_FILTERS_PERSONS: PersonFilterState = {
  search: "",
  eventIds: [],
  speakerOn: true,
  orgAffiliatedOn: true,
  initiativeIds: [],
  savedListIds: [],
  sources: [],
  statuses: [],
  icpMin: null,
  icpMax: null,
  icpIncludeNull: true,
  hasEmail: "any",
  hasLinkedin: "any",
  hasTwitter: "any",
  hasPhone: "any",
  specificIds: null,
};

export const EMPTY_FILTERS_ORGS: OrgFilterState = {
  search: "",
  eventIds: [],
  initiativeIds: [],
  categories: [],
  statuses: [],
  icpMin: null,
  icpMax: null,
  icpIncludeNull: true,
  hasPeople: "any",
  specificIds: null,
};

// ----- Constants -----

const NONE_SENTINEL = "__none__";
const NULL_SENTINEL = "__null__";

const PERSON_STATUS_OPTIONS = [
  { value: "none", label: "New" },
  { value: "partial", label: "Partial" },
  { value: "complete", label: "Complete" },
  { value: "failed", label: "Failed" },
  { value: "in_progress", label: "In progress" },
];

const ORG_STATUS_OPTIONS = [
  { value: "none", label: "New" },
  { value: "partial", label: "Partial" },
  { value: "complete", label: "Complete" },
  { value: "failed", label: "Failed" },
];

// ----- Tri-state pill -----

function TriStatePill({
  label,
  value,
  onChange,
}: {
  label: string;
  value: TriState;
  onChange: (next: TriState) => void;
}) {
  const next: Record<TriState, TriState> = { any: "present", present: "missing", missing: "any" };
  const display = value === "any" ? "any" : value === "present" ? "✓ present" : "✗ missing";
  const tone =
    value === "present"
      ? "bg-[var(--accent-orange)]/15 text-[var(--accent-orange)] border-[var(--accent-orange)]/20"
      : value === "missing"
        ? "bg-red-500/15 text-red-400 border-red-500/20"
        : "bg-[var(--glass-bg)] text-[var(--text-muted)] border-[var(--glass-border)]";
  return (
    <button
      type="button"
      onClick={() => onChange(next[value])}
      className={cn("flex items-center justify-between px-2 py-1 rounded-md text-[11px] font-medium border transition-colors", tone)}
    >
      <span>{label}</span>
      <span className="ml-2 opacity-80">{display}</span>
    </button>
  );
}

// ----- Section header helper -----

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-1.5 mt-3 first:mt-0">
      {children}
    </div>
  );
}

// ----- Common props -----

export interface FilterPanelProps {
  tab: "persons" | "organizations";
  filterPersons: PersonFilterState;
  filterOrgs: OrgFilterState;
  onFilterPersonsChange: (f: PersonFilterState) => void;
  onFilterOrgsChange: (f: OrgFilterState) => void;
  events: { id: string; name: string }[];
  initiatives: { id: string; name: string }[];
  savedLists: { id: string; name: string; count: number }[];
  categories: string[];
  sources: string[];
  filteredCount: number;
  selectedCount: number;
  onSelectAllVisible: () => void;
  onClearVisible: () => void;
  disabled?: boolean;
}

// ----- Component -----

export const FilterPanel = React.memo(function FilterPanel({
  tab,
  filterPersons,
  filterOrgs,
  onFilterPersonsChange,
  onFilterOrgsChange,
  events,
  initiatives,
  savedLists,
  categories,
  sources,
  filteredCount,
  selectedCount,
  onSelectAllVisible,
  onClearVisible,
  disabled,
}: FilterPanelProps) {
  const f = tab === "persons" ? filterPersons : filterOrgs;
  const updatePerson = (patch: Partial<PersonFilterState>) =>
    onFilterPersonsChange({ ...filterPersons, ...patch });
  const updateOrg = (patch: Partial<OrgFilterState>) =>
    onFilterOrgsChange({ ...filterOrgs, ...patch });

  function reset() {
    if (tab === "persons") {
      onFilterPersonsChange({ ...EMPTY_FILTERS_PERSONS, specificIds: filterPersons.specificIds });
    } else {
      onFilterOrgsChange({ ...EMPTY_FILTERS_ORGS, specificIds: filterOrgs.specificIds });
    }
  }

  function clearSpecificIds() {
    if (tab === "persons") updatePerson({ specificIds: null });
    else updateOrg({ specificIds: null });
  }

  // Event multi-select option list (with __none__ sentinel)
  const eventOptions = [
    { value: NONE_SENTINEL, label: "(no event)" },
    ...events.map((e) => ({ value: e.id, label: e.name })),
  ];

  // Selecting __none__ clears concrete; selecting concrete clears __none__
  function setEventIds(next: string[]) {
    let cleaned = next;
    if (next.includes(NONE_SENTINEL) && next.length > 1) {
      // If user just toggled __none__ on while concrete selected, keep __none__ alone
      cleaned = next[next.length - 1] === NONE_SENTINEL ? [NONE_SENTINEL] : next.filter((v) => v !== NONE_SENTINEL);
    }
    if (tab === "persons") updatePerson({ eventIds: cleaned });
    else updateOrg({ eventIds: cleaned });
  }

  const hasConcreteEvents =
    f.eventIds.length > 0 && !f.eventIds.includes(NONE_SENTINEL);

  return (
    <GlassCard className={cn("relative", disabled && "pointer-events-none opacity-40")}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-[var(--text-muted)] uppercase tracking-wider font-medium">
          Filters
        </span>
        <button
          onClick={reset}
          className="text-[10px] text-[var(--text-muted)] hover:text-white flex items-center gap-1 transition-colors"
        >
          <RotateCcw className="h-3 w-3" />
          Reset
        </button>
      </div>

      {/* specificIds chip */}
      {f.specificIds && (
        <div className="mb-3 flex items-center justify-between gap-2 px-2 py-1.5 rounded-md bg-[var(--accent-orange)]/10 border border-[var(--accent-orange)]/20 text-[var(--accent-orange)] text-xs">
          <span>Showing {f.specificIds.length} specific item{f.specificIds.length !== 1 ? "s" : ""}</span>
          <button onClick={clearSpecificIds} aria-label="Clear specific items">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Search */}
      <SectionLabel>Search</SectionLabel>
      <GlassInput
        icon={Search}
        placeholder={tab === "persons" ? "Name..." : "Org name..."}
        value={f.search}
        onChange={(e) =>
          tab === "persons"
            ? updatePerson({ search: e.target.value })
            : updateOrg({ search: e.target.value })
        }
        className="text-xs py-1.5"
      />

      {/* Events */}
      <SectionLabel>Event affiliation</SectionLabel>
      <MultiSelectField
        placeholder="Any event"
        options={eventOptions}
        values={f.eventIds}
        onChange={setEventIds}
      />
      {tab === "persons" && hasConcreteEvents && (
        <div className="mt-2 px-2 py-1.5 rounded-md bg-white/[0.02] border border-white/[0.04]">
          <div className="text-[10px] text-[var(--text-muted)] mb-1">Relation</div>
          <EventRelationToggle
            speaker={(f as PersonFilterState).speakerOn}
            orgAffiliated={(f as PersonFilterState).orgAffiliatedOn}
            onChange={({ speaker, orgAffiliated }) =>
              updatePerson({ speakerOn: speaker, orgAffiliatedOn: orgAffiliated })
            }
          />
        </div>
      )}

      {/* Initiative */}
      <SectionLabel>Initiative</SectionLabel>
      <MultiSelectField
        placeholder="Any initiative"
        options={initiatives.map((i) => ({ value: i.id, label: i.name }))}
        values={f.initiativeIds}
        onChange={(next) =>
          tab === "persons"
            ? updatePerson({ initiativeIds: next })
            : updateOrg({ initiativeIds: next })
        }
      />

      {/* Saved list (persons only) */}
      {tab === "persons" && (
        <>
          <SectionLabel>Saved list</SectionLabel>
          <MultiSelectField
            placeholder="Any list"
            options={savedLists.map((l) => ({ value: l.id, label: `${l.name} (${l.count})` }))}
            values={(f as PersonFilterState).savedListIds}
            onChange={(next) => updatePerson({ savedListIds: next })}
          />
        </>
      )}

      {/* Source / Category */}
      <SectionLabel>{tab === "persons" ? "Source" : "Category"}</SectionLabel>
      <MultiSelectField
        placeholder={tab === "persons" ? "Any source" : "Any category"}
        options={[
          { value: NULL_SENTINEL, label: "(none)" },
          ...(tab === "persons" ? sources : categories).map((v) => ({ value: v, label: v })),
        ]}
        values={tab === "persons" ? (f as PersonFilterState).sources : (f as OrgFilterState).categories}
        onChange={(next) =>
          tab === "persons"
            ? updatePerson({ sources: next })
            : updateOrg({ categories: next })
        }
      />

      {/* Status */}
      <SectionLabel>Enrichment status</SectionLabel>
      <div className="flex flex-wrap gap-1">
        {(tab === "persons" ? PERSON_STATUS_OPTIONS : ORG_STATUS_OPTIONS).map((opt) => {
          const active = f.statuses.includes(opt.value);
          return (
            <button
              key={opt.value}
              onClick={() => {
                const next = active
                  ? f.statuses.filter((s) => s !== opt.value)
                  : [...f.statuses, opt.value];
                if (tab === "persons") updatePerson({ statuses: next });
                else updateOrg({ statuses: next });
              }}
              className={cn(
                "px-2 py-1 rounded-md text-[10px] font-medium border transition-colors",
                active
                  ? "bg-[var(--accent-orange)]/15 text-[var(--accent-orange)] border-[var(--accent-orange)]/20"
                  : "bg-[var(--glass-bg)] text-[var(--text-muted)] border-[var(--glass-border)]"
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {/* ICP */}
      <SectionLabel>ICP score</SectionLabel>
      <div className="flex items-center gap-1">
        <GlassInput
          type="number"
          min={0}
          max={100}
          placeholder="≥"
          value={f.icpMin ?? ""}
          onChange={(e) => {
            const v = e.target.value === "" ? null : Number(e.target.value);
            if (tab === "persons") updatePerson({ icpMin: v });
            else updateOrg({ icpMin: v });
          }}
          className="w-16 text-xs py-1.5"
        />
        <span className="text-[var(--text-muted)] text-xs">–</span>
        <GlassInput
          type="number"
          min={0}
          max={100}
          placeholder="≤"
          value={f.icpMax ?? ""}
          onChange={(e) => {
            const v = e.target.value === "" ? null : Number(e.target.value);
            if (tab === "persons") updatePerson({ icpMax: v });
            else updateOrg({ icpMax: v });
          }}
          className="w-16 text-xs py-1.5"
        />
      </div>
      <label className="flex items-center gap-1.5 mt-1.5 text-[11px] text-[var(--text-muted)] cursor-pointer">
        <input
          type="checkbox"
          checked={f.icpIncludeNull}
          onChange={(e) => {
            if (tab === "persons") updatePerson({ icpIncludeNull: e.target.checked });
            else updateOrg({ icpIncludeNull: e.target.checked });
          }}
          className="accent-current"
        />
        Include items with no score
      </label>

      {/* Tri-states */}
      {tab === "persons" ? (
        <>
          <SectionLabel>Contact fields</SectionLabel>
          <div className="grid grid-cols-2 gap-1">
            <TriStatePill label="Email" value={(f as PersonFilterState).hasEmail} onChange={(v) => updatePerson({ hasEmail: v })} />
            <TriStatePill label="LinkedIn" value={(f as PersonFilterState).hasLinkedin} onChange={(v) => updatePerson({ hasLinkedin: v })} />
            <TriStatePill label="Twitter" value={(f as PersonFilterState).hasTwitter} onChange={(v) => updatePerson({ hasTwitter: v })} />
            <TriStatePill label="Phone" value={(f as PersonFilterState).hasPhone} onChange={(v) => updatePerson({ hasPhone: v })} />
          </div>
        </>
      ) : (
        <>
          <SectionLabel>People</SectionLabel>
          <TriStatePill
            label="Has enriched persons"
            value={(f as OrgFilterState).hasPeople}
            onChange={(v) => updateOrg({ hasPeople: v })}
          />
        </>
      )}

      {/* Footer */}
      <div className="mt-4 pt-3 border-t border-white/[0.04] flex items-center justify-between text-[11px]">
        <span className="text-[var(--text-muted)]">
          Filtered: {filteredCount} • Selected: {selectedCount}
        </span>
        <div className="flex gap-2">
          <button onClick={onSelectAllVisible} className="text-[var(--accent-orange)] hover:underline">
            Select all
          </button>
          <button onClick={onClearVisible} className="text-[var(--text-muted)] hover:text-white">
            Clear
          </button>
        </div>
      </div>
    </GlassCard>
  );
});

FilterPanel.displayName = "FilterPanel";
