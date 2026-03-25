"use client";

import React from "react";
import { ArrowLeft } from "lucide-react";
import {
  FilterBar,
  type FilterState,
} from "./filter-bar";
import {
  EntityTable,
  type OrgRow,
  type PersonRow,
  type OrgProgress,
} from "./entity-table";
import { SummaryStrip, type SummaryStripProps } from "./summary-strip";

// ---------- Types ----------

export type CenterState = "list" | "progress" | "results";

export interface CenterPanelProps {
  state: CenterState;
  tab: "persons" | "organizations";
  // Shared
  filters: FilterState;
  onFiltersChange: (f: FilterState) => void;
  events: { id: string; name: string }[];
  initiatives: { id: string; name: string }[];
  // List state
  items: (OrgRow | PersonRow)[];
  loading?: boolean;
  totalCount: number;
  selectedIds: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
  categories: string[];
  sources: string[];
  // Progress state
  progressData?: Map<string, OrgProgress>;
  activeStages?: Map<string, string>;
  progressCompleted?: number;
  progressTotal?: number;
  // Results state
  resultStats?: SummaryStripProps["stats"];
  resultOutcomes?: Map<string, "enriched" | "failed" | "skipped">;
  onBackToList?: () => void;
  viewingJobId?: string | null;
  // Sorting
  sortKey?: string;
  sortDir?: "asc" | "desc";
  onSort?: (key: string) => void;
}

// ---------- Component ----------

export const CenterPanel = React.memo(function CenterPanel({
  state,
  tab,
  filters,
  onFiltersChange,
  events,
  initiatives,
  items,
  loading,
  totalCount,
  selectedIds,
  onSelectionChange,
  categories,
  sources,
  progressData,
  activeStages,
  progressCompleted,
  progressTotal,
  resultStats,
  resultOutcomes,
  onBackToList,
  sortKey,
  sortDir,
  onSort,
}: CenterPanelProps) {
  const filteredCount = items.length;

  return (
    <div className="flex flex-col min-h-0 flex-1">
      {/* Filter Bar — always visible */}
      <FilterBar
        filters={filters}
        onFiltersChange={onFiltersChange}
        tab={tab}
        events={events}
        initiatives={initiatives}
        categories={categories}
        sources={sources}
      />

      {/* Count summary — between filter bar and table */}
      <div className="flex items-center justify-between mb-2 text-[10px] text-[var(--text-muted)] font-[family-name:var(--font-body)]">
        <span>
          Showing {filteredCount} of {totalCount}
        </span>
        {state === "list" && selectedIds.size > 0 && (
          <span className="text-[var(--accent-orange)]">
            {selectedIds.size} selected
          </span>
        )}
      </div>

      {/* Progress bar */}
      {state === "progress" &&
        progressTotal !== undefined &&
        progressCompleted !== undefined && (
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-[var(--text-muted)] font-[family-name:var(--font-body)]">
                Processing {progressCompleted} of {progressTotal}{" "}
                {tab === "organizations" ? "organizations" : "persons"}...
              </span>
              <span className="text-xs text-[var(--text-muted)] tabular-nums">
                {progressTotal > 0
                  ? Math.round((progressCompleted / progressTotal) * 100)
                  : 0}
                %
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
              <div
                className="h-full bg-[var(--accent-orange)] rounded-full transition-all duration-500"
                style={{
                  width: `${progressTotal > 0 ? (progressCompleted / progressTotal) * 100 : 0}%`,
                }}
              />
            </div>
          </div>
        )}

      {/* Results header */}
      {state === "results" && (
        <>
          {onBackToList && (
            <button
              onClick={onBackToList}
              className="text-xs text-[var(--text-muted)] hover:text-white mb-2 flex items-center gap-1 font-[family-name:var(--font-body)] transition-colors"
            >
              <ArrowLeft className="h-3 w-3" />
              Back to list
            </button>
          )}
          {resultStats && <SummaryStrip stats={resultStats} tab={tab} />}
        </>
      )}

      {/* Table */}
      <EntityTable
        mode={state}
        tab={tab}
        items={items}
        loading={loading}
        selectedIds={state === "list" ? selectedIds : undefined}
        onSelectionChange={state === "list" ? onSelectionChange : undefined}
        progressData={progressData}
        activeStages={activeStages}
        resultOutcomes={resultOutcomes}
        sortKey={sortKey}
        sortDir={sortDir}
        onSort={onSort}
      />
    </div>
  );
});

CenterPanel.displayName = "CenterPanel";
