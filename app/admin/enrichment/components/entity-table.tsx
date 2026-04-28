"use client";

import { useCallback, useMemo, useRef, useTransition } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { OrgStatusIcons, PersonStatusIcons } from "./status-icons";
import { ChevronUp, ChevronDown, Check } from "lucide-react";
import { DataTable } from "@/components/ui/data-table";
import { TextCell, NumericCell, PillCell, HeaderCell } from "@/components/ui/data-cell";

function GlassCheckbox({ checked, onClick }: { checked: boolean; onClick?: (e: React.MouseEvent) => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
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

// ---------- Types ----------

export type TableMode = "list" | "progress" | "results";

export interface OrgRow {
  id: string;
  name: string;
  event_ids?: string[];
  event_names?: string[];
  category: string | null;
  icp_score: number | null;
  description: string | null;
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
  loading?: boolean;
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
    <HeaderCell
      className={cn(onSort && "cursor-pointer select-none hover:text-white")}
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
    </HeaderCell>
  );
}

// ---------- Component ----------

export function EntityTable({
  mode,
  tab,
  items,
  loading,
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
  const [isPending, startTransition] = useTransition();

  const isOrg = tab === "organizations";

  const allIds = useMemo(() => items.map((item) => item.id), [items]);
  const allSelected = useMemo(() => {
    if (!showCheckboxes || !selectedIds || allIds.length === 0) return false;
    if (selectedIds.size < allIds.length) return false;
    return allIds.every((id) => selectedIds.has(id));
  }, [allIds, selectedIds, showCheckboxes]);

  const toggleSelectAll = useCallback(() => {
    if (!onSelectionChange || !selectedIds) return;
    const shouldDeselect = allSelected;
    startTransition(() => {
      const next = new Set(selectedIds);
      if (shouldDeselect) {
        for (const id of allIds) next.delete(id);
      } else {
        for (const id of allIds) next.add(id);
      }
      onSelectionChange(next);
    });
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

  const gridTemplate = useMemo(() => {
    const cols: string[] = [];
    if (showCheckboxes) cols.push("32px");
    if (isOrg) {
      // Name, Event, Category, ICP, Status
      cols.push("minmax(160px,2fr)", "minmax(100px,1fr)", "minmax(80px,0.8fr)", "60px", "120px");
    } else {
      // Name, Org, Event, Source, ICP, Status
      cols.push("minmax(140px,1.5fr)", "minmax(100px,1fr)", "minmax(100px,1fr)", "80px", "60px", "120px");
    }
    if (mode === "results") cols.push("100px");
    return cols.join(" ");
  }, [showCheckboxes, isOrg, mode]);

  return (
    <div className="rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)] overflow-hidden">
      {items.length === 0 ? (
        <div className="px-3 py-12 text-center text-sm text-[var(--text-muted)]">
          {loading ? (
            <div className="flex items-center justify-center gap-2 animate-pulse">
              <div className="h-1.5 w-1.5 rounded-full bg-[var(--accent-orange)] animate-bounce [animation-delay:0ms]" />
              <div className="h-1.5 w-1.5 rounded-full bg-[var(--accent-orange)] animate-bounce [animation-delay:150ms]" />
              <div className="h-1.5 w-1.5 rounded-full bg-[var(--accent-orange)] animate-bounce [animation-delay:300ms]" />
            </div>
          ) : (
            "No items found"
          )}
        </div>
      ) : (
        <DataTable
          rows={items}
          gridTemplate={gridTemplate}
          estimateRowHeight={36}
          scrollHeight="calc(100vh - 280px)"
          minWidth="700px"
          getRowKey={(item) => item.id}
          isRowSelected={(item) => selectedIds?.has(item.id) ?? false}
          rowClassName={(item) => {
            if (mode !== "progress") return undefined;
            const progress = progressData?.get(item.id);
            if (!progress) return "opacity-40";
            if (progress.status === "processing") return "animate-[slideIn_0.3s_ease-out]";
            return undefined;
          }}
          header={
            <>
              {showCheckboxes && (
                <HeaderCell>
                  <GlassCheckbox checked={isPending ? !allSelected : !!allSelected} onClick={toggleSelectAll} />
                </HeaderCell>
              )}
              {isOrg ? (
                <>
                  <SortableHeader label="Name" sortKey="name" currentSortKey={sortKey} currentSortDir={sortDir} onSort={onSort} />
                  <SortableHeader label="Event" sortKey="event" currentSortKey={sortKey} currentSortDir={sortDir} onSort={onSort} />
                  <SortableHeader label="Category" sortKey="category" currentSortKey={sortKey} currentSortDir={sortDir} onSort={onSort} />
                  <SortableHeader label="ICP" sortKey="icp_score" currentSortKey={sortKey} currentSortDir={sortDir} onSort={onSort} />
                  <HeaderCell>Status</HeaderCell>
                </>
              ) : (
                <>
                  <SortableHeader label="Name" sortKey="full_name" currentSortKey={sortKey} currentSortDir={sortDir} onSort={onSort} />
                  <SortableHeader label="Org" sortKey="primary_org_name" currentSortKey={sortKey} currentSortDir={sortDir} onSort={onSort} />
                  <SortableHeader label="Event" sortKey="event" currentSortKey={sortKey} currentSortDir={sortDir} onSort={onSort} />
                  <SortableHeader label="Source" sortKey="source" currentSortKey={sortKey} currentSortDir={sortDir} onSort={onSort} />
                  <SortableHeader label="ICP" sortKey="icp_score" currentSortKey={sortKey} currentSortDir={sortDir} onSort={onSort} />
                  <HeaderCell>Status</HeaderCell>
                </>
              )}
              {mode === "results" && <HeaderCell>Outcome</HeaderCell>}
            </>
          }
          renderRow={(item, index) => {
            const isSelected = selectedIds?.has(item.id) ?? false;
            const progress = progressData?.get(item.id);
            const activeStage = activeStages?.get(item.id);
            const outcome = resultOutcomes?.get(item.id);
            const isQueued = mode === "progress" && !progress;

            return (
              <>
                {showCheckboxes && (
                  <div className="px-3 py-1 flex items-center">
                    <GlassCheckbox
                      checked={isSelected}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRowCheck(index, e.shiftKey);
                      }}
                    />
                  </div>
                )}
                {isOrg && isOrgRow(item) ? (
                  <>
                    <TextCell title={item.name}>{item.name}</TextCell>
                    <TextCell>{item.event_names?.join(", ") ?? "—"}</TextCell>
                    <TextCell>{item.category ?? "—"}</TextCell>
                    <NumericCell className={icpColor(item.icp_score)}>{item.icp_score ?? "—"}</NumericCell>
                    <PillCell>
                      {isQueued ? (
                        <span className="text-[10px] text-[var(--text-muted)]">Queued</span>
                      ) : (
                        <OrgStatusIcons
                          stages={item.enrichment_stages}
                          mode={mode === "progress" ? "live" : "static"}
                          activeStage={activeStage}
                          orgData={{ icp_score: item.icp_score, description: item.description }}
                        />
                      )}
                    </PillCell>
                  </>
                ) : !isOrg && !isOrgRow(item) ? (
                  <>
                    <TextCell title={item.full_name}>{item.full_name}</TextCell>
                    <TextCell>{item.primary_org_name ?? "—"}</TextCell>
                    <TextCell>{item.event_names?.join(", ") ?? "—"}</TextCell>
                    <TextCell>{item.source ?? "—"}</TextCell>
                    <NumericCell className={icpColor(item.icp_score)}>{item.icp_score ?? "—"}</NumericCell>
                    <PillCell>
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
                    </PillCell>
                  </>
                ) : null}
                {mode === "results" && (
                  <PillCell>
                    {outcome && (
                      <Badge variant={outcomeBadgeVariant(outcome)} className="text-[10px]">
                        {outcome}
                      </Badge>
                    )}
                  </PillCell>
                )}
              </>
            );
          }}
        />
      )}
    </div>
  );
}
