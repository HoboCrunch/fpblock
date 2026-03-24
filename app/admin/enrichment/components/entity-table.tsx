"use client";

import { useCallback, useRef } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { OrgStatusIcons, PersonStatusIcons } from "./status-icons";
import { ChevronUp, ChevronDown } from "lucide-react";

// ---------- Types ----------

export type TableMode = "list" | "progress" | "results";

export interface OrgRow {
  id: string;
  name: string;
  event_ids?: string[];
  event_names?: string[];
  category: string | null;
  icp_score: number | null;
  enrichment_stages: Record<
    string,
    { status?: string; [key: string]: unknown }
  > | null;
  enrichment_status: string;
}

export interface PersonRow {
  id: string;
  full_name: string;
  primary_org_name: string | null;
  event_ids?: string[];
  event_names?: string[];
  source: string | null;
  icp_score: number | null;
  email: string | null;
  linkedin_url: string | null;
  twitter_handle: string | null;
  phone: string | null;
  enrichment_status: string;
}

export interface OrgProgress {
  status: string;
  activeStage?: string;
}

export interface EntityTableProps {
  mode: TableMode;
  tab: "persons" | "organizations";
  items: (OrgRow | PersonRow)[];
  // Selection (list mode)
  selectedIds?: Set<string>;
  onSelectionChange?: (ids: Set<string>) => void;
  // Progress
  progressData?: Map<string, OrgProgress>;
  activeStages?: Map<string, string>;
  // Results
  resultOutcomes?: Map<string, "enriched" | "failed" | "skipped">;
  // Sorting
  sortKey?: string;
  sortDir?: "asc" | "desc";
  onSort?: (key: string) => void;
}

// ---------- Helpers ----------

function icpColor(score: number | null): string {
  if (score === null || score === undefined) return "text-gray-500";
  if (score >= 75) return "text-[var(--accent-orange)]";
  if (score >= 50) return "text-yellow-400";
  return "text-gray-500";
}

function outcomeBadgeVariant(
  outcome: "enriched" | "failed" | "skipped"
): string {
  switch (outcome) {
    case "enriched":
      return "sent";
    case "failed":
      return "failed";
    case "skipped":
      return "default";
  }
}

function isOrgRow(item: OrgRow | PersonRow): item is OrgRow {
  return "name" in item && !("full_name" in item);
}

// ---------- Sort Header ----------

function SortableHeader({
  label,
  sortKey: colKey,
  currentSortKey,
  currentSortDir,
  onSort,
}: {
  label: string;
  sortKey: string;
  currentSortKey?: string;
  currentSortDir?: "asc" | "desc";
  onSort?: (key: string) => void;
}) {
  const isActive = currentSortKey === colKey;
  return (
    <th
      className={cn(
        "px-3 py-2 text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-medium text-left",
        onSort && "cursor-pointer select-none hover:text-white"
      )}
      onClick={() => onSort?.(colKey)}
    >
      <span className="flex items-center gap-0.5">
        {label}
        {isActive &&
          (currentSortDir === "asc" ? (
            <ChevronUp className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          ))}
      </span>
    </th>
  );
}

// ---------- Component ----------

export function EntityTable({
  mode,
  tab,
  items,
  selectedIds,
  onSelectionChange,
  progressData,
  activeStages,
  resultOutcomes,
  sortKey,
  sortDir,
  onSort,
}: EntityTableProps) {
  const lastClickedIndex = useRef<number | null>(null);
  const showCheckboxes = mode === "list";

  const allIds = items.map((item) => item.id);
  const allSelected =
    showCheckboxes &&
    selectedIds &&
    allIds.length > 0 &&
    allIds.every((id) => selectedIds.has(id));

  const toggleSelectAll = useCallback(() => {
    if (!onSelectionChange || !selectedIds) return;
    if (allSelected) {
      const next = new Set(selectedIds);
      allIds.forEach((id) => next.delete(id));
      onSelectionChange(next);
    } else {
      const next = new Set(selectedIds);
      allIds.forEach((id) => next.add(id));
      onSelectionChange(next);
    }
  }, [allSelected, allIds, selectedIds, onSelectionChange]);

  const handleRowCheck = useCallback(
    (index: number, shiftKey: boolean) => {
      if (!onSelectionChange || !selectedIds) return;
      const id = items[index].id;
      const next = new Set(selectedIds);

      if (shiftKey && lastClickedIndex.current !== null) {
        const start = Math.min(lastClickedIndex.current, index);
        const end = Math.max(lastClickedIndex.current, index);
        const shouldSelect = !selectedIds.has(id);
        for (let i = start; i <= end; i++) {
          if (shouldSelect) {
            next.add(items[i].id);
          } else {
            next.delete(items[i].id);
          }
        }
      } else {
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
      }

      lastClickedIndex.current = index;
      onSelectionChange(next);
    },
    [items, selectedIds, onSelectionChange]
  );

  const isOrg = tab === "organizations";

  return (
    <div className="rounded-lg bg-white/[0.02] border border-white/[0.06] overflow-hidden">
      <div className="max-h-[calc(100vh-280px)] overflow-y-auto">
        <table className="w-full">
          <thead className="sticky top-0 bg-[#0f0f13]/95 backdrop-blur-sm z-10">
            <tr>
              {showCheckboxes && (
                <th className="px-3 py-2 w-8">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleSelectAll}
                    className="accent-[var(--accent-orange)] h-3.5 w-3.5"
                  />
                </th>
              )}
              {isOrg ? (
                <>
                  <SortableHeader
                    label="Name"
                    sortKey="name"
                    currentSortKey={sortKey}
                    currentSortDir={sortDir}
                    onSort={onSort}
                  />
                  <SortableHeader
                    label="Event"
                    sortKey="event"
                    currentSortKey={sortKey}
                    currentSortDir={sortDir}
                    onSort={onSort}
                  />
                  <SortableHeader
                    label="Category"
                    sortKey="category"
                    currentSortKey={sortKey}
                    currentSortDir={sortDir}
                    onSort={onSort}
                  />
                  <SortableHeader
                    label="ICP"
                    sortKey="icp_score"
                    currentSortKey={sortKey}
                    currentSortDir={sortDir}
                    onSort={onSort}
                  />
                  <th className="px-3 py-2 text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-medium text-left">
                    Status
                  </th>
                </>
              ) : (
                <>
                  <SortableHeader
                    label="Name"
                    sortKey="full_name"
                    currentSortKey={sortKey}
                    currentSortDir={sortDir}
                    onSort={onSort}
                  />
                  <SortableHeader
                    label="Org"
                    sortKey="primary_org_name"
                    currentSortKey={sortKey}
                    currentSortDir={sortDir}
                    onSort={onSort}
                  />
                  <SortableHeader
                    label="Event"
                    sortKey="event"
                    currentSortKey={sortKey}
                    currentSortDir={sortDir}
                    onSort={onSort}
                  />
                  <SortableHeader
                    label="Source"
                    sortKey="source"
                    currentSortKey={sortKey}
                    currentSortDir={sortDir}
                    onSort={onSort}
                  />
                  <SortableHeader
                    label="ICP"
                    sortKey="icp_score"
                    currentSortKey={sortKey}
                    currentSortDir={sortDir}
                    onSort={onSort}
                  />
                  <th className="px-3 py-2 text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-medium text-left">
                    Status
                  </th>
                </>
              )}
              {mode === "results" && (
                <th className="px-3 py-2 text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-medium text-left">
                  Outcome
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => {
              const isSelected = selectedIds?.has(item.id) ?? false;
              const progress = progressData?.get(item.id);
              const activeStage = activeStages?.get(item.id);
              const outcome = resultOutcomes?.get(item.id);
              const isQueued = mode === "progress" && !progress;
              const isActive = mode === "progress" && !!progress && progress.status === "processing";

              return (
                <tr
                  key={item.id}
                  className={cn(
                    "h-9 border-b border-white/[0.04] hover:bg-white/[0.03] transition-all duration-300 text-xs text-white",
                    isSelected && "bg-white/[0.05]",
                    isQueued && "opacity-40",
                    isActive && "animate-[slideIn_0.3s_ease-out]"
                  )}
                >
                  {showCheckboxes && (
                    <td className="px-3 py-1 w-8">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => {
                          e.stopPropagation();
                          handleRowCheck(index, e.nativeEvent instanceof MouseEvent ? (e.nativeEvent as MouseEvent).shiftKey : false);
                        }}
                        className="accent-[var(--accent-orange)] h-3.5 w-3.5"
                      />
                    </td>
                  )}
                  {isOrg && isOrgRow(item) ? (
                    <>
                      <td className="px-3 py-1 truncate max-w-[200px]" title={item.name}>
                        {item.name}
                      </td>
                      <td className="px-3 py-1 truncate max-w-[120px]">
                        {item.event_names?.join(", ") ?? "—"}
                      </td>
                      <td className="px-3 py-1 truncate max-w-[100px]">
                        {item.category ?? "—"}
                      </td>
                      <td className={cn("px-3 py-1 tabular-nums", icpColor(item.icp_score))}>
                        {item.icp_score ?? "—"}
                      </td>
                      <td className="px-3 py-1">
                        {isQueued ? (
                          <span className="text-[10px] text-[var(--text-muted)]">Queued</span>
                        ) : (
                          <OrgStatusIcons
                            stages={item.enrichment_stages}
                            mode={mode === "progress" ? "live" : "static"}
                            activeStage={activeStage}
                          />
                        )}
                      </td>
                    </>
                  ) : !isOrg && !isOrgRow(item) ? (
                    <>
                      <td className="px-3 py-1 truncate max-w-[160px]" title={item.full_name}>
                        {item.full_name}
                      </td>
                      <td className="px-3 py-1 truncate max-w-[120px]">
                        {item.primary_org_name ?? "—"}
                      </td>
                      <td className="px-3 py-1 truncate max-w-[120px]">
                        {item.event_names?.join(", ") ?? "—"}
                      </td>
                      <td className="px-3 py-1 truncate max-w-[80px]">
                        {item.source ?? "—"}
                      </td>
                      <td className={cn("px-3 py-1 tabular-nums", icpColor(item.icp_score))}>
                        {item.icp_score ?? "—"}
                      </td>
                      <td className="px-3 py-1">
                        {isQueued ? (
                          <span className="text-[10px] text-[var(--text-muted)]">Queued</span>
                        ) : (
                          <PersonStatusIcons
                            email={item.email}
                            linkedin_url={item.linkedin_url}
                            twitter_handle={item.twitter_handle}
                            phone={item.phone}
                            enrichmentStatus={item.enrichment_status}
                            mode={mode === "progress" ? "live" : "static"}
                            activeField={activeStage}
                          />
                        )}
                      </td>
                    </>
                  ) : null}
                  {mode === "results" && (
                    <td className="px-3 py-1">
                      {outcome && (
                        <Badge variant={outcomeBadgeVariant(outcome)} className="text-[10px]">
                          {outcome}
                        </Badge>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
            {items.length === 0 && (
              <tr>
                <td
                  colSpan={99}
                  className="px-3 py-8 text-center text-sm text-[var(--text-muted)]"
                >
                  No items found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
