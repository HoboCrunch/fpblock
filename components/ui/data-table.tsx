"use client";

import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { cn } from "@/lib/utils";

export interface DataTableProps<T> {
  rows: T[];
  /** CSS grid-template-columns string (e.g. "32px minmax(140px,2fr) 48px ...") */
  gridTemplate: string;
  /** Header rendered as direct grid children (use HeaderCell). */
  header: React.ReactNode;
  /** Renders a single row's grid children (use TextCell/PillCell/etc.). */
  renderRow: (row: T, index: number) => React.ReactNode;
  /** Stable key for each row. */
  getRowKey: (row: T, index: number) => string;
  estimateRowHeight?: number;
  scrollHeight?: string;
  minWidth?: string;
  emptyMessage?: string;
  onRowClick?: (row: T) => void;
  isRowSelected?: (row: T) => boolean;
  onRowMouseEnter?: (row: T) => void;
  onRowMouseLeave?: (row: T) => void;
  /** Per-row class string. Useful for state-driven styling like opacity or slide-in animations. */
  rowClassName?: (row: T, index: number) => string | undefined;
}

export function DataTable<T>({
  rows,
  gridTemplate,
  header,
  renderRow,
  getRowKey,
  estimateRowHeight = 36,
  scrollHeight = "calc(100vh - 220px)",
  minWidth = "800px",
  emptyMessage = "No data",
  onRowClick,
  isRowSelected,
  onRowMouseEnter,
  onRowMouseLeave,
  rowClassName,
}: DataTableProps<T>) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => estimateRowHeight,
    overscan: 8,
  });

  return (
    <div className="overflow-x-auto">
      <div
        ref={scrollRef}
        className="overflow-y-auto"
        style={{ maxHeight: scrollHeight, minWidth }}
      >
        {/* Sticky header */}
        <div
          className="grid sticky top-0 z-10 bg-[var(--glass-bg)] backdrop-blur-sm border-b border-[var(--glass-border)]"
          style={{ gridTemplateColumns: gridTemplate }}
        >
          {header}
        </div>

        {rows.length === 0 ? (
          <div className="px-5 py-12 text-center text-[var(--text-muted)] text-sm">
            {emptyMessage}
          </div>
        ) : (
          <div
            style={{
              position: "relative",
              height: `${virtualizer.getTotalSize()}px`,
            }}
          >
            {virtualizer.getVirtualItems().map((vi) => {
              const row = rows[vi.index];
              const selected = isRowSelected?.(row) ?? false;
              return (
                <div
                  key={getRowKey(row, vi.index)}
                  data-index={vi.index}
                  className={cn(
                    "grid items-center text-xs border-b border-white/[0.04]",
                    onRowClick && "cursor-pointer hover:bg-white/[0.03]",
                    selected && "bg-[var(--accent-orange)]/[0.04]",
                    rowClassName?.(row, vi.index)
                  )}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: `${vi.size}px`,
                    transform: `translateY(${vi.start}px)`,
                    gridTemplateColumns: gridTemplate,
                  }}
                  onClick={
                    onRowClick
                      ? (e) => {
                          const tag = (e.target as HTMLElement).tagName;
                          if (tag === "INPUT" || tag === "BUTTON") return;
                          if ((e.target as HTMLElement).closest("button")) return;
                          onRowClick(row);
                        }
                      : undefined
                  }
                  onMouseEnter={onRowMouseEnter ? () => onRowMouseEnter(row) : undefined}
                  onMouseLeave={onRowMouseLeave ? () => onRowMouseLeave(row) : undefined}
                >
                  {renderRow(row, vi.index)}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
