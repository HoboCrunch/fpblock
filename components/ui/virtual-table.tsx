"use client";

import { useRef, useCallback } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

interface ColumnDef {
  key: string;
  header: string;
  width?: string;
  className?: string;
}

interface VirtualTableProps<T> {
  rows: T[];
  columns: ColumnDef[];
  renderRow: (
    row: T,
    index: number,
    style: React.CSSProperties
  ) => React.ReactNode;
  estimateSize?: number;
  overscan?: number;
  scrollContainerHeight?: string;
  onRowClick?: (row: T) => void;
  emptyMessage?: string;
}

export function VirtualTable<T>({
  rows,
  columns,
  renderRow,
  estimateSize = 36,
  overscan = 5,
  scrollContainerHeight = "calc(100vh - 280px)",
  onRowClick,
  emptyMessage = "No data available",
}: VirtualTableProps<T>) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => estimateSize,
    overscan,
    measureElement:
      typeof window !== "undefined" &&
      navigator.userAgent.indexOf("Firefox") === -1
        ? (element) => element.getBoundingClientRect().height
        : undefined,
  });

  const handleRowClick = useCallback(
    (row: T) => {
      onRowClick?.(row);
    },
    [onRowClick]
  );

  if (rows.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-[var(--text-secondary)]"
        style={{ height: scrollContainerHeight }}
      >
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="w-full overflow-hidden rounded-lg border border-white/10">
      {/* Sticky header */}
      <div className="bg-[var(--glass-bg)] sticky top-0 z-10">
        <table className="w-full table-fixed">
          <thead>
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)] ${col.className ?? ""}`}
                  style={col.width ? { width: col.width } : undefined}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
        </table>
      </div>

      {/* Scrollable body */}
      <div
        ref={scrollRef}
        className="overflow-y-auto"
        style={{ height: scrollContainerHeight }}
      >
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: "100%",
            position: "relative",
          }}
        >
          {virtualizer.getVirtualItems().map((virtualItem) => {
            const row = rows[virtualItem.index];
            const style: React.CSSProperties = {
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              transform: `translateY(${virtualItem.start}px)`,
            };

            return (
              <div
                key={virtualItem.key}
                data-index={virtualItem.index}
                ref={virtualizer.measureElement}
                onClick={onRowClick ? () => handleRowClick(row) : undefined}
                className={`border-b border-white/5 text-[var(--text-primary)] ${onRowClick ? "cursor-pointer hover:bg-white/5" : ""}`}
                style={style}
              >
                {renderRow(row, virtualItem.index, style)}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
