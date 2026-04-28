"use client";

import { memo } from "react";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { Check } from "lucide-react";
import { OrgStatusIcons } from "@/app/admin/enrichment/components/status-icons";
import { cn } from "@/lib/utils";
import type { OrgRow } from "./organizations-table-client";

export const ORG_GRID_COLS =
  "32px minmax(150px,2.5fr) 48px 56px minmax(90px,1.2fr) 48px minmax(70px,1fr) 64px 80px 72px 64px";

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

function icpBadgeVariant(score: number | null) {
  if (score === null) return "default";
  if (score >= 90) return "replied";
  if (score >= 75) return "scheduled";
  return "default";
}

function employeeBucket(count: number | string | null): string {
  if (count === null || count === undefined) return "\u2014";
  const n = typeof count === "string" ? parseInt(count, 10) : count;
  if (isNaN(n)) return typeof count === "string" ? count : "\u2014";
  if (n <= 10) return "1-10";
  if (n <= 50) return "11-50";
  if (n <= 200) return "51-200";
  if (n <= 500) return "201-500";
  if (n <= 1000) return "501-1k";
  return "1k+";
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

function truncateCategory(cat: string): string {
  if (cat.length <= 18) return cat;
  // Shorten at " / " boundary if present
  const slash = cat.indexOf(" / ");
  if (slash > 0 && slash <= 18) return cat.slice(0, slash);
  return cat.slice(0, 16) + "…";
}

// ------------------------------------------------------------------
// GlassCheckbox
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
  eventsPropagated?: number;
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
    eventsPropagated = 0,
    style,
    onRowClick,
    onMouseEnter,
    onMouseLeave,
    onToggleSelect,
  }: OrgTableRowProps) {
    return (
      <div
        role="row"
        className={`grid items-center text-sm border-b border-white/[0.04] cursor-pointer ${
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
        <div className="px-[var(--cell-px,0.5rem)] py-1.5 flex items-center">
          <GlassCheckbox
            checked={isSelected}
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelect(row.id, index, e.shiftKey);
            }}
          />
        </div>

        {/* Logo + Name + Category */}
        <div className="px-[var(--cell-px,0.5rem)] py-1 min-w-0" title={`${row.name}${row.category ? ` — ${row.category}` : ""}`}>
          <div className="flex items-center gap-1.5 min-w-0">
            {row.logo_url ? (
              <Image
                src={row.logo_url}
                alt=""
                width={20}
                height={20}
                className="w-5 h-5 rounded object-cover flex-shrink-0"
                unoptimized
              />
            ) : (
              <div className="w-5 h-5 rounded bg-white/[0.06] flex items-center justify-center text-[9px] font-medium text-[var(--text-muted)] flex-shrink-0">
                {row.name.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 leading-tight">
              <div className="text-xs font-medium text-white truncate">{row.name}</div>
              {row.category && (
                <div className="text-[10px] text-[var(--text-muted)] truncate">{truncateCategory(row.category)}</div>
              )}
            </div>
          </div>
        </div>

        {/* ICP */}
        <div className="px-[var(--cell-px,0.5rem)] py-1">
          {row.icp_score !== null ? (
            <Badge variant={icpBadgeVariant(row.icp_score)} className="text-[10px] px-1.5 py-0">
              {row.icp_score}
            </Badge>
          ) : (
            <span className="text-[var(--text-muted)] text-xs">&mdash;</span>
          )}
        </div>

        {/* People */}
        <div className="px-[var(--cell-px,0.5rem)] py-1 text-xs">
          {row.person_count > 0 ? (
            <span className={row.enriched_person_count > 0 ? "text-[var(--accent-orange)]" : "text-[var(--text-secondary)]"}>
              {row.person_count}
            </span>
          ) : (
            <span className="text-[var(--text-muted)]">&mdash;</span>
          )}
        </div>

        {/* Events */}
        <div
          className="px-[var(--cell-px,0.5rem)] py-1 min-w-0"
          title={row.events.length > 0 ? row.events.map((e) => e.name).join(", ") : undefined}
        >
          <div className="flex items-center gap-1 min-w-0 overflow-hidden">
            {row.events.slice(0, 2).map((ev) => (
              <Badge
                key={ev.id || `${ev.name}-${ev.role}`}
                variant={ev.tier ? (ev.tier as string) : "default"}
                className="text-[10px] px-1.5 py-0 max-w-[70px] flex-shrink"
              >
                {ev.name}
              </Badge>
            ))}
            {row.events.length > 2 && (
              <span className="text-[10px] text-[var(--text-muted)] flex-shrink-0">
                +{row.events.length - 2}
              </span>
            )}
            {row.events.length === 0 && (
              <span className="text-[var(--text-muted)] text-xs">&mdash;</span>
            )}
          </div>
        </div>

        {/* Signals */}
        <div className="px-[var(--cell-px,0.5rem)] py-1 text-xs">
          {row.signal_count > 0 ? (
            <span className="text-[var(--text-secondary)]">{row.signal_count}</span>
          ) : (
            <span className="text-[var(--text-muted)]">&mdash;</span>
          )}
        </div>

        {/* Industry */}
        <div className="px-[var(--cell-px,0.5rem)] py-1 min-w-0">
          <span className="text-[10px] text-[var(--text-muted)] truncate block">
            {row.industry || "\u2014"}
          </span>
        </div>

        {/* Employees */}
        <div className="px-[var(--cell-px,0.5rem)] py-1 text-[10px] text-[var(--text-muted)]">
          {employeeBucket(row.employee_count)}
        </div>

        {/* Enrichment Stages */}
        <div className="px-[var(--cell-px,0.5rem)] py-1">
          <OrgStatusIcons
            stages={row.enrichment_stages}
            orgData={{
              icp_score: row.icp_score,
              description: row.description,
              enriched_person_count: row.enriched_person_count,
            }}
          />
        </div>

        {/* Events Propagated */}
        <div className="px-[var(--cell-px,0.5rem)] py-1 text-xs">
          {eventsPropagated > 0 ? (
            <span className="text-[var(--text-secondary)]">{eventsPropagated}</span>
          ) : (
            <span className="text-[var(--text-muted)]">&mdash;</span>
          )}
        </div>

        {/* Last Signal */}
        <div className="px-[var(--cell-px,0.5rem)] py-1 text-[10px] text-[var(--text-muted)]">
          {relativeDate(row.last_signal)}
        </div>
      </div>
    );
  },
  (prev, next) =>
    prev.row.id === next.row.id &&
    prev.isSelected === next.isSelected &&
    prev.isHovered === next.isHovered &&
    prev.index === next.index &&
    prev.eventsPropagated === next.eventsPropagated &&
    prev.row === next.row
);
