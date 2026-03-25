"use client";

import React from "react";
import {
  Mail,
  Linkedin,
  Twitter,
  Send,
  Phone,
  Check,
  AlertCircle,
  Loader2,
  Minus,
} from "lucide-react";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export const PERSON_GRID_COLS = "32px minmax(140px,2fr) minmax(120px,1.5fr) 48px 100px minmax(100px,1.2fr) minmax(80px,1fr) 40px 72px";

// ---------------------------------------------------------------------------
// Types (shared with parent)
// ---------------------------------------------------------------------------

export interface PersonEvent {
  event_id: string;
  event_name: string;
  role: string;
  talk_title: string | null;
  track: string | null;
}

export interface OrgEvent {
  event_id: string;
  event_name: string;
  tier: string | null;
  role: string;
  org_name: string;
  org_id: string;
}

export interface PersonRow {
  id: string;
  full_name: string;
  title: string | null;
  primary_org_name: string | null;
  seniority: string | null;
  department: string | null;
  icp_score: number | null;
  email: string | null;
  linkedin_url: string | null;
  twitter_handle: string | null;
  telegram_handle: string | null;
  phone: string | null;
  photo_url: string | null;
  bio: string | null;
  source: string | null;
  enrichment_status: string;
  interaction_count: number;
  last_interaction_at: string | null;
  personEvents: PersonEvent[];
  orgEvents: OrgEvent[];
}

export interface CorrelationResult {
  type: string;
  segments: { text: string; href?: string; badge?: string }[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SPEAKER_ROLES = ["speaker", "panelist", "mc"];

function icpBadgeVariant(score: number | null) {
  if (score === null) return "default";
  if (score >= 90) return "replied";
  if (score >= 75) return "scheduled";
  return "default";
}

function seniorityBadgeVariant(s: string | null) {
  if (!s) return "default";
  const lower = s.toLowerCase();
  if (lower.includes("c-level") || lower.includes("founder") || lower.includes("ceo") || lower.includes("cto") || lower.includes("cfo")) return "c-level";
  if (lower.includes("vp") || lower.includes("vice president")) return "vp";
  if (lower.includes("director")) return "director";
  return "default";
}

function enrichmentIcon(status: string) {
  switch (status) {
    case "complete":
      return <Check className="w-4 h-4 text-emerald-400" />;
    case "in_progress":
      return <Loader2 className="w-4 h-4 text-orange-400 animate-spin" />;
    case "failed":
      return <AlertCircle className="w-4 h-4 text-red-400" />;
    default:
      return <Minus className="w-4 h-4 text-[var(--text-muted)]" />;
  }
}

function relativeDate(dateStr: string | null) {
  if (!dateStr) return "\u2014";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
  return `${Math.floor(diffDays / 365)}y ago`;
}

function getInitials(name: string) {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function compactCorrelationLabel(c: CorrelationResult): { label: string; colorClass: string } {
  if (c.type === "speaker_sponsor") {
    const tierSeg = c.segments.find((s) => s.badge);
    const tier = tierSeg ? tierSeg.text : "Sponsor";
    return { label: `🎤 Speaker · ${tier}`, colorClass: "text-orange-400" };
  }
  if (c.type === "sponsor_contact") {
    const orgSeg = c.segments.find((s) => s.href);
    const tierSeg = c.segments.find((s) => s.badge);
    const org = orgSeg ? orgSeg.text : "";
    const tier = tierSeg ? tierSeg.text : "Sponsor";
    return { label: `🏢 ${org} · ${tier}`, colorClass: "text-indigo-400" };
  }
  if (c.type === "speaker_only") {
    return { label: "🎤 Speaker", colorClass: "text-[var(--text-secondary)]" };
  }
  if (c.type === "org_sponsor") {
    const orgSeg = c.segments.find((s) => s.href);
    const tierSeg = c.segments.find((s) => s.badge);
    const org = orgSeg ? orgSeg.text : "";
    const tier = tierSeg ? tierSeg.text : "Sponsor";
    return { label: `🏢 ${org} · ${tier}`, colorClass: "text-[var(--text-secondary)]" };
  }
  return { label: "\u2014", colorClass: "text-[var(--text-muted)]" };
}

// Checkbox extracted here for use in the row
export function GlassCheckbox({ checked, onChange, onClick }: { checked: boolean; onChange?: () => void; onClick?: (e: React.MouseEvent) => void }) {
  return (
    <button
      type="button"
      onClick={(e) => { if (onClick) onClick(e); else if (onChange) onChange(); }}
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

// ---------------------------------------------------------------------------
// PersonTableRow
// ---------------------------------------------------------------------------

interface PersonTableRowProps {
  row: PersonRow;
  isSelected: boolean;
  correlation: CorrelationResult;
  idx: number;
  style?: React.CSSProperties;
  onMouseEnter: (id: string) => void;
  onMouseLeave: () => void;
  onCheckboxClick: (id: string, idx: number, shiftKey: boolean) => void;
  onRowClick: (id: string) => void;
}

export const PersonTableRow = React.memo(function PersonTableRow({
  row,
  isSelected,
  correlation,
  idx,
  style,
  onMouseEnter,
  onMouseLeave,
  onCheckboxClick,
  onRowClick,
}: PersonTableRowProps) {
  const { label: corrLabel, colorClass: corrColorClass } = compactCorrelationLabel(correlation);

  return (
    <div
      role="row"
      className={`grid items-center text-sm border-b border-white/[0.04] hover:bg-white/[0.03] cursor-pointer ${
        isSelected ? "bg-[var(--accent-orange)]/[0.04]" : ""
      }`}
      style={{ ...style, gridTemplateColumns: PERSON_GRID_COLS }}
      onMouseEnter={() => onMouseEnter(row.id)}
      onMouseLeave={onMouseLeave}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("button[type=button]")) return;
        onRowClick(row.id);
      }}
    >
      {/* Checkbox */}
      <div className="px-2 py-1.5 flex items-center">
        <GlassCheckbox
          checked={isSelected}
          onClick={(e) => {
            e.stopPropagation();
            onCheckboxClick(row.id, idx, e.shiftKey);
          }}
        />
      </div>

      {/* Name + Title */}
      <div className="px-2 py-1 min-w-0" title={`${row.full_name}${row.title ? ` — ${row.title}` : ""}`}>
        <div className="flex items-center gap-1.5 min-w-0">
          {row.photo_url ? (
            <Image
              src={row.photo_url}
              alt=""
              width={20}
              height={20}
              className="w-5 h-5 rounded-full object-cover flex-shrink-0"
              unoptimized
            />
          ) : (
            <div className="w-5 h-5 rounded-full bg-white/[0.06] flex items-center justify-center text-[9px] font-medium text-[var(--text-muted)] flex-shrink-0">
              {getInitials(row.full_name)}
            </div>
          )}
          <div className="min-w-0 leading-tight">
            <div className="text-xs font-medium text-white truncate">{row.full_name}</div>
            {row.title && (
              <div className="text-[10px] text-[var(--text-muted)] truncate">{row.title}</div>
            )}
          </div>
        </div>
      </div>

      {/* Organization + Seniority */}
      <div className="px-1.5 py-1 text-xs min-w-0" title={`${row.primary_org_name || ""}${row.seniority ? ` · ${row.seniority}` : ""}`}>
        {row.primary_org_name ? (
          <div className="min-w-0 leading-tight">
            <div className="text-[var(--text-secondary)] truncate text-xs">{row.primary_org_name}</div>
            {row.seniority && (
              <Badge variant={seniorityBadgeVariant(row.seniority)} className="text-[9px] px-1 py-0 mt-0.5">
                {row.seniority}
              </Badge>
            )}
          </div>
        ) : (
          <span className="text-[var(--text-muted)]">&mdash;</span>
        )}
      </div>

      {/* ICP */}
      <div className="px-1 py-1">
        {row.icp_score !== null ? (
          <Badge variant={icpBadgeVariant(row.icp_score)} className="text-[10px] px-1.5 py-0">
            {row.icp_score}
          </Badge>
        ) : (
          <span className="text-[var(--text-muted)] text-xs">&mdash;</span>
        )}
      </div>

      {/* Channels */}
      <div className="px-1.5 py-1">
        <div className="flex items-center gap-0.5">
          <Mail className={`w-3 h-3 ${row.email ? "text-[var(--text-secondary)]" : "text-white/[0.1]"}`} />
          <Linkedin className={`w-3 h-3 ${row.linkedin_url ? "text-[var(--text-secondary)]" : "text-white/[0.1]"}`} />
          <Twitter className={`w-3 h-3 ${row.twitter_handle ? "text-[var(--text-secondary)]" : "text-white/[0.1]"}`} />
          <Send className={`w-3 h-3 ${row.telegram_handle ? "text-[var(--text-secondary)]" : "text-white/[0.1]"}`} />
          <Phone className={`w-3 h-3 ${row.phone ? "text-[var(--text-secondary)]" : "text-white/[0.1]"}`} />
        </div>
      </div>

      {/* Events */}
      <div className="px-1.5 py-1 min-w-0">
        <div className="flex flex-wrap gap-1">
          {row.personEvents.slice(0, 2).map((pe) => (
            <Badge key={`${pe.event_id}-${pe.role}`} variant="default" className="text-[10px] px-1.5 py-0 truncate max-w-[70px]">
              {pe.event_name.length > 12
                ? pe.event_name.slice(0, 12) + "..."
                : pe.event_name}
              {pe.role && SPEAKER_ROLES.includes(pe.role) ? `: ${pe.role}` : ""}
            </Badge>
          ))}
          {row.personEvents.length > 2 && (
            <span className="text-[10px] text-[var(--text-muted)]">
              +{row.personEvents.length - 2}
            </span>
          )}
          {row.personEvents.length === 0 && (
            <span className="text-[var(--text-muted)] text-xs">&mdash;</span>
          )}
        </div>
      </div>

      {/* Correlation */}
      <div className="px-1.5 py-1 hidden lg:block min-w-0">
        <span
          className={`text-[10px] truncate block ${corrColorClass}`}
          title={corrLabel}
        >
          {corrLabel}
        </span>
      </div>

      {/* Enrichment */}
      <div className="px-1 py-1 hidden lg:block">
        {enrichmentIcon(row.enrichment_status)}
      </div>

      {/* Last Activity */}
      <div className="px-1.5 py-1 text-[var(--text-muted)] text-[10px]">
        {relativeDate(row.last_interaction_at)}
      </div>
    </div>
  );
}, (prev, next) => {
  // Custom comparison: only re-render when these change
  return (
    prev.row.id === next.row.id &&
    prev.isSelected === next.isSelected &&
    prev.idx === next.idx &&
    prev.row === next.row &&
    prev.correlation === next.correlation &&
    prev.style?.transform === next.style?.transform
  );
});
