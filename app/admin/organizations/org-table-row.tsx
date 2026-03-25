"use client";

import { memo } from "react";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { Check } from "lucide-react";
import { OrgStatusIcons } from "@/app/admin/enrichment/components/status-icons";
import { cn } from "@/lib/utils";
import type { OrgRow } from "./organizations-table-client";

export const ORG_GRID_COLS = "40px minmax(160px,2fr) 56px 72px minmax(120px,1.5fr) 64px minmax(80px,1fr) 80px minmax(80px,1fr) 80px";

// ------------------------------------------------------------------
// Helpers (duplicated to keep this module self-contained)
// ------------------------------------------------------------------

function icpBadgeVariant(score: number | null) {
  if (score === null) return "default";
  if (score >= 90) return "replied";
  if (score >= 75) return "scheduled";
  return "default";
}

const EMPLOYEE_BUCKETS = [
  { value: "1-10", label: "1-10", min: 1, max: 10 },
  { value: "11-50", label: "11-50", min: 11, max: 50 },
  { value: "51-200", label: "51-200", min: 51, max: 200 },
  { value: "201-500", label: "201-500", min: 201, max: 500 },
  { value: "501-1000", label: "501-1000", min: 501, max: 1000 },
  { value: "1000+", label: "1000+", min: 1001, max: Infinity },
];

function employeeBucket(count: number | string | null): string {
  if (count === null || count === undefined) return "\u2014";
  const n = typeof count === "string" ? parseInt(count, 10) : count;
  if (isNaN(n)) return typeof count === "string" ? count : "\u2014";
  for (const b of EMPLOYEE_BUCKETS) {
    if (n >= b.min && n <= b.max) return b.label;
  }
  return `${n}`;
}

function relativeDate(dateStr: string | null): string {
  if (!dateStr) return "\u2014";
  const now = Date.now();
  const d = new Date(dateStr).getTime();
  const diff = now - d;
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days < 1) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

// ------------------------------------------------------------------
// GlassCheckbox (inlined to avoid circular dep)
// ------------------------------------------------------------------

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

// ------------------------------------------------------------------
// OrgTableRow
// ------------------------------------------------------------------

export interface OrgTableRowProps {
  row: OrgRow;
  index: number;
  isSelected: boolean;
  isHovered: boolean;
  style?: React.CSSProperties;
  onRowClick: (rowId: string) => void;
  onMouseEnter: (id: string) => void;
  onMouseLeave: () => void;
  onToggleSelect: (id: string, index: number, shiftKey: boolean) => void;
}

export const OrgTableRow = memo(
  function OrgTableRow({
    row,
    index,
    isSelected,
    isHovered,
    style,
    onRowClick,
    onMouseEnter,
    onMouseLeave,
    onToggleSelect,
  }: OrgTableRowProps) {
    return (
      <div
        role="row"
        className={`grid items-center text-sm border-b border-white/[0.04] transition-all duration-150 cursor-pointer ${
          isHovered ? "bg-white/[0.05]" : "hover:bg-white/[0.03]"
        } ${isSelected ? "bg-[var(--accent-orange)]/[0.04]" : ""}`}
        style={{ ...style, gridTemplateColumns: ORG_GRID_COLS }}
        onClick={(e) => {
          const tag = (e.target as HTMLElement).tagName;
          if (tag === "INPUT" || tag === "BUTTON" || (e.target as HTMLElement).closest("button")) return;
          onRowClick(row.id);
        }}
        onMouseEnter={() => onMouseEnter(row.id)}
        onMouseLeave={onMouseLeave}
      >
        {/* Checkbox */}
        <div className="px-2 py-2 flex items-center">
          <GlassCheckbox
            checked={isSelected}
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelect(row.id, index, e.shiftKey);
            }}
          />
        </div>

        {/* Logo + Name + Category */}
        <div className="px-2 py-2 min-w-0">
          <div className="flex items-start gap-2">
            {row.logo_url ? (
              <Image
                src={row.logo_url}
                alt={row.name}
                width={24}
                height={24}
                className="w-6 h-6 rounded object-cover flex-shrink-0 mt-0.5"
              />
            ) : (
              <div className="w-6 h-6 rounded bg-[var(--glass-bg)] border border-[var(--glass-border)] flex items-center justify-center text-[10px] font-bold text-[var(--text-muted)] flex-shrink-0 mt-0.5">
                {row.name.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <span className="text-xs font-medium text-white truncate block">
                {row.name}
              </span>
              {row.category && (
                <Badge variant="default" className="text-[10px] mt-0.5">{row.category}</Badge>
              )}
            </div>
          </div>
        </div>

        {/* ICP */}
        <div className="px-2 py-2">
          {row.icp_score !== null ? (
            <Badge variant={icpBadgeVariant(row.icp_score)}>
              {row.icp_score}
            </Badge>
          ) : (
            <span className="text-[var(--text-muted)]">&mdash;</span>
          )}
        </div>

        {/* People */}
        <div className="px-2 py-2 text-[var(--text-secondary)]">
          {row.person_count}
          {row.enriched_person_count > 0 && (
            <span className="text-[var(--accent-orange)] ml-1">
              ({row.enriched_person_count}&uarr;)
            </span>
          )}
        </div>

        {/* Events */}
        <div className="px-2 py-2 min-w-0">
          <div className="flex flex-wrap gap-1">
            {row.events.slice(0, 3).map((ev) => (
              <Badge
                key={ev.id || `${ev.name}-${ev.role}`}
                variant={ev.tier ? (ev.tier as string) : "glass-indigo"}
                className="text-[10px]"
              >
                {ev.name}{ev.tier ? `: ${ev.tier}` : ""}
              </Badge>
            ))}
            {row.events.length > 3 && (
              <span className="text-[10px] text-[var(--text-muted)]">+{row.events.length - 3}</span>
            )}
            {row.events.length === 0 && <span className="text-[var(--text-muted)]">&mdash;</span>}
          </div>
        </div>

        {/* Signals */}
        <div className="px-2 py-2 text-[var(--text-secondary)]">
          {row.signal_count}
        </div>

        {/* Industry */}
        <div className="px-2 py-2 text-[var(--text-muted)] truncate">
          {row.industry || "\u2014"}
        </div>

        {/* Employees */}
        <div className="px-2 py-2 text-[var(--text-muted)]">
          {employeeBucket(row.employee_count)}
        </div>

        {/* Enrichment Stages */}
        <div className="px-2 py-2 hidden xl:block">
          <OrgStatusIcons stages={row.enrichment_stages} />
        </div>

        {/* Last Signal */}
        <div className="px-2 py-2 text-[var(--text-muted)]">
          {relativeDate(row.last_signal)}
        </div>
      </div>
    );
  },
  // Custom comparison: only re-render when meaningful props change
  (prev, next) =>
    prev.row.id === next.row.id &&
    prev.isSelected === next.isSelected &&
    prev.isHovered === next.isHovered &&
    prev.index === next.index &&
    prev.row === next.row
);
