"use client";

import React, { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Loader2, UserPlus, Users, Check } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { HeaderCell } from "@/components/ui/data-cell";
import { PersonTableRow, PERSON_GRID_COLS } from "@/app/admin/persons/person-table-row";
import type { PersonRow, CorrelationResult } from "@/app/admin/persons/person-table-row";
import { cn } from "@/lib/utils";

type EventRelation = { direct: boolean; viaOrgIds: string[] };

export type ListMatchesTableProps = {
  rows: PersonRow[];
  correlations: Record<string, CorrelationResult>;
  eventRelationMap?: Map<string, EventRelation> | undefined;
  memberIds: Set<string>;
  onAdd: (personIds: string[]) => Promise<void>;
  isFiltered: boolean;
};

export function ListMatchesTable({
  rows, correlations, eventRelationMap, memberIds, onAdd, isFiltered,
}: ListMatchesTableProps) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isAdding, setIsAdding] = useState(false);
  const parentRef = useRef<HTMLDivElement>(null);

  const newMatches = useMemo(() => rows.filter((r) => !memberIds.has(r.id)), [rows, memberIds]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 36,
    overscan: 5,
  });

  const allNotInListSelected =
    newMatches.length > 0 && newMatches.every((r) => selectedIds.has(r.id));

  const toggleSelectAllNew = useCallback(() => {
    if (allNotInListSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(newMatches.map((r) => r.id)));
  }, [allNotInListSelected, newMatches]);

  const handleCheckboxClick = useCallback((id: string, _idx: number, _shiftKey: boolean) => {
    if (memberIds.has(id)) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, [memberIds]);

  async function handleAddSelected() {
    if (selectedIds.size === 0) return;
    setIsAdding(true);
    await onAdd(Array.from(selectedIds));
    setSelectedIds(new Set());
    setIsAdding(false);
  }

  const noop = useCallback(() => {}, []);

  if (!isFiltered) {
    return (
      <GlassCard>
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Users className="h-8 w-8 text-[var(--text-muted)] mb-3" />
          <p className="text-sm text-[var(--text-muted)]">Apply filters to find matches.</p>
        </div>
      </GlassCard>
    );
  }

  if (rows.length === 0) {
    return (
      <GlassCard>
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Users className="h-8 w-8 text-[var(--text-muted)] mb-3" />
          <p className="text-sm text-[var(--text-muted)]">No persons match these filters.</p>
        </div>
      </GlassCard>
    );
  }

  return (
    <GlassCard padding={false}>
      <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--glass-border)]">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-medium text-[var(--text-muted)]">
            Matches <span className="ml-1.5 tabular-nums">{rows.length}</span>
            {newMatches.length > 0 && (
              <span className="ml-2 text-xs text-[var(--accent-indigo)]">
                {newMatches.length} not in list
              </span>
            )}
          </h2>
          {newMatches.length > 0 && (
            <button
              onClick={toggleSelectAllNew}
              className="text-xs text-[var(--accent-indigo)] hover:underline"
            >
              {allNotInListSelected ? "Clear selection" : `Select all ${newMatches.length}`}
            </button>
          )}
        </div>
        <button
          onClick={handleAddSelected}
          disabled={selectedIds.size === 0 || isAdding}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200",
            "bg-[var(--accent-orange)] text-white hover:bg-[var(--accent-orange)]/90",
            "shadow-lg shadow-[var(--accent-orange)]/20",
            "disabled:opacity-40 disabled:cursor-not-allowed",
          )}
        >
          {isAdding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
          Add {selectedIds.size > 0 ? selectedIds.size : ""} to list
        </button>
      </div>

      <div className="overflow-x-auto">
        <div
          ref={parentRef}
          className="w-full min-w-[800px] overflow-y-auto"
          style={{ maxHeight: "calc(100vh - 280px)" }}
        >
          <div
            className="grid sticky top-0 z-10 bg-[var(--glass-bg)] backdrop-blur-sm border-b border-[var(--glass-border)]"
            style={{ gridTemplateColumns: PERSON_GRID_COLS }}
          >
            <HeaderCell>{null}</HeaderCell>
            <HeaderCell>Name</HeaderCell>
            <HeaderCell>Organization</HeaderCell>
            <HeaderCell>ICP</HeaderCell>
            <HeaderCell>Channels</HeaderCell>
            <HeaderCell>Events</HeaderCell>
            <HeaderCell className="hidden lg:block">Correlation</HeaderCell>
            <HeaderCell className="hidden lg:block">Enr.</HeaderCell>
            <HeaderCell>Status</HeaderCell>
          </div>
          <div style={{ position: "relative", height: `${virtualizer.getTotalSize()}px` }}>
            {virtualizer.getVirtualItems().map((vi) => {
              const row = rows[vi.index];
              const inList = memberIds.has(row.id);
              return (
                <div
                  key={row.id}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: `${vi.size}px`,
                    transform: `translateY(${vi.start}px)`,
                    opacity: inList ? 0.55 : 1,
                  }}
                >
                  <PersonTableRow
                    row={row}
                    isSelected={selectedIds.has(row.id)}
                    correlation={correlations[row.id]}
                    eventRelation={eventRelationMap?.get(row.id)}
                    idx={vi.index}
                    style={{}}
                    onMouseEnter={noop}
                    onMouseLeave={noop}
                    onCheckboxClick={handleCheckboxClick}
                    onRowClick={(id) => router.push(`/admin/persons/${id}`)}
                  />
                  {inList && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 text-xs text-[var(--accent-indigo)] bg-[var(--accent-indigo)]/10 px-2 py-0.5 rounded">
                      <Check className="h-3 w-3" /> in list
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </GlassCard>
  );
}
