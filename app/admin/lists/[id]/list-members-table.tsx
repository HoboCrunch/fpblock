"use client";

import React, { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Trash2, Users } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { HeaderCell } from "@/components/ui/data-cell";
import { PersonTableRow, GlassCheckbox, PERSON_GRID_COLS } from "@/app/admin/persons/person-table-row";
import type { PersonRow, CorrelationResult } from "@/app/admin/persons/person-table-row";

type EventRelation = { direct: boolean; viaOrgIds: string[] };

export type ListMembersTableProps = {
  rows: PersonRow[];
  correlations: Record<string, CorrelationResult>;
  eventRelationMap?: Map<string, EventRelation> | undefined;
  onRemove: (personIds: string[]) => Promise<void>;
  isFiltered: boolean;
  totalMembers: number;
};

export function ListMembersTable({
  rows, correlations, eventRelationMap, onRemove, isFiltered, totalMembers,
}: ListMembersTableProps) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isRemoving, setIsRemoving] = useState(false);
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 36,
    overscan: 5,
  });

  const allSelected = rows.length > 0 && rows.every((r) => selectedIds.has(r.id));

  const toggleAll = useCallback(() => {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(rows.map((r) => r.id)));
  }, [allSelected, rows]);

  const handleCheckboxClick = useCallback((id: string, _idx: number, _shiftKey: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  async function handleRemoveSelected() {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Remove ${selectedIds.size} ${selectedIds.size === 1 ? "person" : "persons"} from this list?`)) return;
    setIsRemoving(true);
    await onRemove(Array.from(selectedIds));
    setSelectedIds(new Set());
    setIsRemoving(false);
  }

  const noop = useCallback(() => {}, []);

  return (
    <GlassCard padding={false}>
      <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--glass-border)]">
        <h2 className="text-sm font-medium text-[var(--text-muted)]">
          {isFiltered ? `Filtered members` : `All members`}
          <span className="ml-1.5 tabular-nums">{rows.length}</span>
          {isFiltered && <span className="ml-1 text-[var(--text-muted)]">/ {totalMembers}</span>}
        </h2>
        {selectedIds.size > 0 && (
          <button
            onClick={handleRemoveSelected}
            disabled={isRemoving}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 disabled:opacity-50"
          >
            <Trash2 className="h-3 w-3" />
            Remove {selectedIds.size}
          </button>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Users className="h-8 w-8 text-[var(--text-muted)] mb-3" />
          <p className="text-sm text-[var(--text-muted)]">
            {isFiltered ? "No members match these filters." : "No members yet."}
          </p>
          {!isFiltered && (
            <p className="text-xs text-[var(--text-muted)] mt-2">
              Switch to Matches and apply filters to add people.
            </p>
          )}
        </div>
      ) : (
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
              <HeaderCell>
                <GlassCheckbox checked={allSelected} onChange={toggleAll} />
              </HeaderCell>
              <HeaderCell>Name</HeaderCell>
              <HeaderCell>Organization</HeaderCell>
              <HeaderCell>ICP</HeaderCell>
              <HeaderCell>Channels</HeaderCell>
              <HeaderCell>Events</HeaderCell>
              <HeaderCell className="hidden lg:block">Correlation</HeaderCell>
              <HeaderCell className="hidden lg:block">Enr.</HeaderCell>
              <HeaderCell>Activity</HeaderCell>
            </div>
            <div style={{ position: "relative", height: `${virtualizer.getTotalSize()}px` }}>
              {virtualizer.getVirtualItems().map((vi) => {
                const row = rows[vi.index];
                return (
                  <PersonTableRow
                    key={row.id}
                    row={row}
                    isSelected={selectedIds.has(row.id)}
                    correlation={correlations[row.id]}
                    eventRelation={eventRelationMap?.get(row.id)}
                    idx={vi.index}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      height: `${vi.size}px`,
                      transform: `translateY(${vi.start}px)`,
                    }}
                    onMouseEnter={noop}
                    onMouseLeave={noop}
                    onCheckboxClick={handleCheckboxClick}
                    onRowClick={(id) => router.push(`/admin/persons/${id}`)}
                  />
                );
              })}
            </div>
          </div>
        </div>
      )}
    </GlassCard>
  );
}
