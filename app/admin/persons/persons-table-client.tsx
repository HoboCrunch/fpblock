"use client";

import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Mail,
  Linkedin,
  Twitter,
  Send,
  Phone,
  Search,
  Check,
  AlertCircle,
  Loader2,
  Minus,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  Users,
  X,
} from "lucide-react";
import { TwoPanelLayout } from "@/components/admin/two-panel-layout";
import { FilterGroup } from "@/components/admin/filter-group";
import { ActiveFilters } from "@/components/admin/active-filters";
import { SelectionSummary } from "@/components/admin/selection-summary";
import { CorrelationBadge } from "@/components/admin/correlation-badge";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassInput } from "@/components/ui/glass-input";
import { GlassSelect } from "@/components/ui/glass-select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PersonEvent {
  event_id: string;
  event_name: string;
  role: string;
  talk_title: string | null;
  track: string | null;
}

interface OrgEvent {
  event_id: string;
  event_name: string;
  tier: string | null;
  role: string;
  org_name: string;
  org_id: string;
}

interface PersonRow {
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

interface PersonsTableClientProps {
  rows: PersonRow[];
  eventOptions: { id: string; name: string }[];
  sourceOptions: string[];
  seniorityOptions: string[];
  departmentOptions: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type SortField =
  | "full_name"
  | "title"
  | "primary_org_name"
  | "seniority"
  | "icp_score"
  | "enrichment_status"
  | "last_interaction_at";

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

function GlassCheckbox({ checked, onChange, onClick }: { checked: boolean; onChange?: () => void; onClick?: (e: React.MouseEvent) => void }) {
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

const SPEAKER_ROLES = ["speaker", "panelist", "mc"];

interface CorrelationResult {
  type: string;
  segments: { text: string; href?: string; badge?: string }[];
}

function computeCorrelation(
  personEvents: PersonEvent[],
  orgEvents: OrgEvent[]
): CorrelationResult {
  const personSpeakerEvents = personEvents.filter((e) =>
    SPEAKER_ROLES.includes(e.role)
  );

  // Rule 1: Person is speaker AND their org sponsors same event
  for (const pe of personSpeakerEvents) {
    const orgMatch = orgEvents.find((oe) => oe.event_id === pe.event_id);
    if (orgMatch && orgMatch.tier) {
      return {
        type: "speaker_sponsor",
        segments: [
          { text: "Speaker" },
          { text: orgMatch.org_name, href: `/admin/organizations/${orgMatch.org_id}` },
          { text: `${orgMatch.tier} Sponsor`, badge: orgMatch.tier.toLowerCase() },
        ],
      };
    }
  }

  // Rule 2: Person's org sponsors an event they attend (not as speaker)
  for (const pe of personEvents) {
    const orgMatch = orgEvents.find((oe) => oe.event_id === pe.event_id);
    if (orgMatch && orgMatch.tier) {
      return {
        type: "sponsor_contact",
        segments: [
          { text: `${pe.role}` },
          { text: orgMatch.org_name, href: `/admin/organizations/${orgMatch.org_id}` },
          { text: `${orgMatch.tier} Sponsor`, badge: orgMatch.tier.toLowerCase() },
        ],
      };
    }
  }

  // Rule 3: Person is speaker but org doesn't sponsor
  if (personSpeakerEvents.length > 0) {
    const pe = personSpeakerEvents[0];
    return {
      type: "speaker_only",
      segments: [
        { text: "Speaker" },
        { text: pe.event_name },
      ],
    };
  }

  // Rule 4: Person's org sponsors an event (person not participating)
  if (orgEvents.length > 0) {
    const oe = orgEvents.find((o) => o.tier) || orgEvents[0];
    if (oe.tier) {
      return {
        type: "org_sponsor",
        segments: [
          { text: oe.org_name, href: `/admin/organizations/${oe.org_id}` },
          { text: `${oe.tier} Sponsor`, badge: oe.tier.toLowerCase() },
        ],
      };
    }
  }

  // Rule 5: No relationship
  return { type: "none", segments: [] };
}

function compactCorrelationLabel(c: CorrelationResult): { label: string; colorClass: string } {
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

// ---------------------------------------------------------------------------
// Isolated preview card — owns its own state so table never re-renders on hover
// ---------------------------------------------------------------------------

function RowPreviewCard({
  setterRef,
  correlations,
  onMouseEnter,
  onMouseLeave,
}: {
  setterRef: React.MutableRefObject<(row: PersonRow | null) => void>;
  correlations: Record<string, CorrelationResult>;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  const [row, setRow] = useState<PersonRow | null>(null);

  // Register the setter so parent can push updates via ref (no parent re-render)
  useEffect(() => {
    setterRef.current = setRow;
  }, [setterRef]);

  if (!row) return null;

  return (
    <div onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
      <GlassCard className="!p-4">
        <div className="flex items-start gap-3 mb-3">
          {row.photo_url ? (
            <img src={row.photo_url} alt={row.full_name} className="w-12 h-12 rounded-full object-cover flex-shrink-0" />
          ) : (
            <div className="w-12 h-12 rounded-full bg-white/[0.06] flex items-center justify-center text-sm font-medium text-[var(--text-muted)] flex-shrink-0">
              {getInitials(row.full_name)}
            </div>
          )}
          <div className="min-w-0">
            <p className="text-sm font-medium text-white truncate">{row.full_name}</p>
            <p className="text-xs text-[var(--text-secondary)] truncate">
              {row.title || ""}{row.title && row.primary_org_name ? " @ " : ""}{row.primary_org_name || ""}
            </p>
          </div>
        </div>

        {row.bio && (
          <p className="text-xs text-[var(--text-muted)] mb-3 line-clamp-2">
            {row.bio.slice(0, 100)}{row.bio.length > 100 ? "..." : ""}
          </p>
        )}

        <div className="flex flex-wrap gap-2 mb-3">
          {row.email && (
            <a href={`mailto:${row.email}`} className="inline-flex items-center gap-1 text-xs text-[var(--text-secondary)] hover:text-white">
              <Mail className="w-3 h-3" /> {row.email}
            </a>
          )}
          {row.linkedin_url && (
            <a href={row.linkedin_url} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-xs text-[var(--text-secondary)] hover:text-white">
              <Linkedin className="w-3 h-3" /> LinkedIn
            </a>
          )}
          {row.twitter_handle && (
            <a href={`https://twitter.com/${row.twitter_handle}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-xs text-[var(--text-secondary)] hover:text-white">
              <Twitter className="w-3 h-3" /> @{row.twitter_handle}
            </a>
          )}
          {row.telegram_handle && (
            <a href={`https://t.me/${row.telegram_handle}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-xs text-[var(--text-secondary)] hover:text-white">
              <Send className="w-3 h-3" /> {row.telegram_handle}
            </a>
          )}
          {row.phone && (
            <a href={`tel:${row.phone}`} className="inline-flex items-center gap-1 text-xs text-[var(--text-secondary)] hover:text-white">
              <Phone className="w-3 h-3" /> {row.phone}
            </a>
          )}
        </div>

        {correlations[row.id]?.segments.length > 0 && (
          <div className="pt-2 border-t border-[var(--glass-border)]">
            <CorrelationBadge segments={correlations[row.id].segments} />
          </div>
        )}
      </GlassCard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PersonsTableClient({
  rows,
  eventOptions,
  sourceOptions,
  seniorityOptions,
  departmentOptions,
}: PersonsTableClientProps) {
  const router = useRouter();

  // --- Filter state ---
  const [search, setSearch] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  const [filterEvents, setFilterEvents] = useState<string[]>([]);
  const [filterHasOrg, setFilterHasOrg] = useState<string>("");
  const [filterCorrelationType, setFilterCorrelationType] = useState<string[]>([]);
  const [filterSeniority, setFilterSeniority] = useState<string[]>([]);
  const [filterDepartment, setFilterDepartment] = useState<string[]>([]);
  const [filterSource, setFilterSource] = useState<string[]>([]);
  const [filterHasEmail, setFilterHasEmail] = useState(false);
  const [filterHasLinkedin, setFilterHasLinkedin] = useState(false);
  const [filterHasPhone, setFilterHasPhone] = useState(false);
  const [filterHasTwitter, setFilterHasTwitter] = useState(false);
  const [filterHasTelegram, setFilterHasTelegram] = useState(false);
  const [filterEnrichmentStatus, setFilterEnrichmentStatus] = useState<string[]>([]);
  const [filterIcpMin, setFilterIcpMin] = useState("");
  const [filterIcpMax, setFilterIcpMax] = useState("");

  // --- Sort state ---
  const [sortField, setSortField] = useState<SortField>("icp_score");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // --- Selection state ---
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lastClickedIdx, setLastClickedIdx] = useState<number | null>(null);

  // --- Hover preview (fully ref-based — zero table re-renders) ---
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewLockRef = useRef(false);
  const hoveredIdRef = useRef<string | null>(null);
  const previewSetterRef = useRef<(row: PersonRow | null) => void>(() => {});

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // --- Pre-compute row lookup map ---
  const rowMap = useMemo(() => {
    const m = new Map<string, PersonRow>();
    for (const row of rows) m.set(row.id, row);
    return m;
  }, [rows]);

  // --- Compute correlations ---
  const correlations = useMemo(() => {
    const map: Record<string, CorrelationResult> = {};
    for (const row of rows) {
      map[row.id] = computeCorrelation(row.personEvents, row.orgEvents);
    }
    return map;
  }, [rows]);

  // --- Filter + Sort ---
  const filteredRows = useMemo(() => {
    let result = rows;

    // Search
    if (searchDebounced) {
      const q = searchDebounced.toLowerCase();
      result = result.filter(
        (r) =>
          r.full_name.toLowerCase().includes(q) ||
          (r.email && r.email.toLowerCase().includes(q)) ||
          (r.primary_org_name && r.primary_org_name.toLowerCase().includes(q))
      );
    }

    // Event filter
    if (filterEvents.length > 0) {
      result = result.filter((r) =>
        r.personEvents.some((pe) => filterEvents.includes(pe.event_id))
      );
    }

    // Has Org
    if (filterHasOrg === "yes") {
      result = result.filter((r) => r.primary_org_name);
    } else if (filterHasOrg === "no") {
      result = result.filter((r) => !r.primary_org_name);
    }

    // Correlation type
    if (filterCorrelationType.length > 0) {
      result = result.filter((r) => {
        const c = correlations[r.id];
        return filterCorrelationType.includes(c.type);
      });
    }

    // Seniority
    if (filterSeniority.length > 0) {
      result = result.filter(
        (r) => r.seniority && filterSeniority.includes(r.seniority)
      );
    }

    // Department
    if (filterDepartment.length > 0) {
      result = result.filter(
        (r) => r.department && filterDepartment.includes(r.department)
      );
    }

    // Source
    if (filterSource.length > 0) {
      result = result.filter(
        (r) => r.source && filterSource.includes(r.source)
      );
    }

    // Contact toggles
    if (filterHasEmail) result = result.filter((r) => r.email);
    if (filterHasLinkedin) result = result.filter((r) => r.linkedin_url);
    if (filterHasPhone) result = result.filter((r) => r.phone);
    if (filterHasTwitter) result = result.filter((r) => r.twitter_handle);
    if (filterHasTelegram) result = result.filter((r) => r.telegram_handle);

    // Enrichment status
    if (filterEnrichmentStatus.length > 0) {
      result = result.filter((r) =>
        filterEnrichmentStatus.includes(r.enrichment_status || "none")
      );
    }

    // ICP range
    if (filterIcpMin) {
      const min = parseInt(filterIcpMin);
      result = result.filter((r) => r.icp_score !== null && r.icp_score >= min);
    }
    if (filterIcpMax) {
      const max = parseInt(filterIcpMax);
      result = result.filter((r) => r.icp_score !== null && r.icp_score <= max);
    }

    // Sort
    result = [...result].sort((a, b) => {
      let aVal: any = (a as any)[sortField];
      let bVal: any = (b as any)[sortField];
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      if (typeof aVal === "string") aVal = aVal.toLowerCase();
      if (typeof bVal === "string") bVal = bVal.toLowerCase();
      const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return sortDir === "desc" ? -cmp : cmp;
    });

    return result;
  }, [
    rows,
    searchDebounced,
    filterEvents,
    filterHasOrg,
    filterCorrelationType,
    filterSeniority,
    filterDepartment,
    filterSource,
    filterHasEmail,
    filterHasLinkedin,
    filterHasPhone,
    filterHasTwitter,
    filterHasTelegram,
    filterEnrichmentStatus,
    filterIcpMin,
    filterIcpMax,
    sortField,
    sortDir,
    correlations,
  ]);

  // --- Selection helpers ---
  const allVisibleSelected =
    filteredRows.length > 0 &&
    filteredRows.every((r) => selectedIds.has(r.id));

  const toggleSelectAll = () => {
    if (allVisibleSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredRows.map((r) => r.id)));
    }
  };

  const handleCheckboxClick = (id: string, idx: number, shiftKey: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (shiftKey && lastClickedIdx !== null) {
        const start = Math.min(lastClickedIdx, idx);
        const end = Math.max(lastClickedIdx, idx);
        for (let i = start; i <= end; i++) {
          next.add(filteredRows[i].id);
        }
      } else {
        if (next.has(id)) next.delete(id);
        else next.add(id);
      }
      return next;
    });
    setLastClickedIdx(idx);
  };

  // --- Selection stats ---
  const selectionStats = useMemo(() => {
    if (selectedIds.size === 0) return "";
    const selected = rows.filter((r) => selectedIds.has(r.id));
    const icpScores = selected.map((r) => r.icp_score).filter((s): s is number => s !== null);
    const avgIcp = icpScores.length > 0 ? Math.round(icpScores.reduce((a, b) => a + b, 0) / icpScores.length) : null;
    const hasEmail = selected.filter((r) => r.email).length;
    const parts: string[] = [];
    if (avgIcp !== null) parts.push(`Avg ICP ${avgIcp}`);
    parts.push(`${hasEmail} have email`);
    return parts.join(" \u00b7 ");
  }, [selectedIds, rows]);

  // --- Hover preview (ref-based to avoid full table re-renders) ---
  const handleRowMouseEnter = useCallback((id: string) => {
    if (previewLockRef.current) return;
    hoveredIdRef.current = id;
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => {
      const row = rowMap.get(id);
      if (row) previewSetterRef.current(row);
    }, 80);
  }, [rowMap]);

  const handleRowMouseLeave = useCallback(() => {
    hoveredIdRef.current = null;
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => {
      if (!previewLockRef.current) {
        previewSetterRef.current(null);
      }
    }, 100);
  }, []);

  const handlePreviewMouseEnter = useCallback(() => {
    previewLockRef.current = true;
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
  }, []);

  const handlePreviewMouseLeave = useCallback(() => {
    previewLockRef.current = false;
    previewSetterRef.current(null);
    hoveredIdRef.current = null;
  }, []);

  // --- Sort handler ---
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  // --- Active filters ---
  const activeFilters = useMemo(() => {
    const filters: { key: string; label: string; value: string }[] = [];
    if (filterEvents.length > 0) {
      const names = filterEvents.map((id) => eventOptions.find((e) => e.id === id)?.name || id);
      filters.push({ key: "events", label: "Event", value: names.join(", ") });
    }
    if (filterHasOrg) filters.push({ key: "hasOrg", label: "Has Org", value: filterHasOrg });
    if (filterCorrelationType.length > 0) filters.push({ key: "correlationType", label: "Correlation", value: filterCorrelationType.join(", ") });
    if (filterSeniority.length > 0) filters.push({ key: "seniority", label: "Seniority", value: filterSeniority.join(", ") });
    if (filterDepartment.length > 0) filters.push({ key: "department", label: "Department", value: filterDepartment.join(", ") });
    if (filterSource.length > 0) filters.push({ key: "source", label: "Source", value: filterSource.join(", ") });
    if (filterHasEmail) filters.push({ key: "hasEmail", label: "Has Email", value: "Yes" });
    if (filterHasLinkedin) filters.push({ key: "hasLinkedin", label: "Has LinkedIn", value: "Yes" });
    if (filterHasPhone) filters.push({ key: "hasPhone", label: "Has Phone", value: "Yes" });
    if (filterHasTwitter) filters.push({ key: "hasTwitter", label: "Has Twitter", value: "Yes" });
    if (filterHasTelegram) filters.push({ key: "hasTelegram", label: "Has Telegram", value: "Yes" });
    if (filterEnrichmentStatus.length > 0) filters.push({ key: "enrichmentStatus", label: "Enrichment", value: filterEnrichmentStatus.join(", ") });
    if (filterIcpMin) filters.push({ key: "icpMin", label: "ICP Min", value: filterIcpMin });
    if (filterIcpMax) filters.push({ key: "icpMax", label: "ICP Max", value: filterIcpMax });
    return filters;
  }, [filterEvents, filterHasOrg, filterCorrelationType, filterSeniority, filterDepartment, filterSource, filterHasEmail, filterHasLinkedin, filterHasPhone, filterHasTwitter, filterHasTelegram, filterEnrichmentStatus, filterIcpMin, filterIcpMax, eventOptions]);

  const handleRemoveFilter = (key: string) => {
    switch (key) {
      case "events": setFilterEvents([]); break;
      case "hasOrg": setFilterHasOrg(""); break;
      case "correlationType": setFilterCorrelationType([]); break;
      case "seniority": setFilterSeniority([]); break;
      case "department": setFilterDepartment([]); break;
      case "source": setFilterSource([]); break;
      case "hasEmail": setFilterHasEmail(false); break;
      case "hasLinkedin": setFilterHasLinkedin(false); break;
      case "hasPhone": setFilterHasPhone(false); break;
      case "hasTwitter": setFilterHasTwitter(false); break;
      case "hasTelegram": setFilterHasTelegram(false); break;
      case "enrichmentStatus": setFilterEnrichmentStatus([]); break;
      case "icpMin": setFilterIcpMin(""); break;
      case "icpMax": setFilterIcpMax(""); break;
    }
  };

  const handleClearAll = () => {
    setFilterEvents([]);
    setFilterHasOrg("");
    setFilterCorrelationType([]);
    setFilterSeniority([]);
    setFilterDepartment([]);
    setFilterSource([]);
    setFilterHasEmail(false);
    setFilterHasLinkedin(false);
    setFilterHasPhone(false);
    setFilterHasTwitter(false);
    setFilterHasTelegram(false);
    setFilterEnrichmentStatus([]);
    setFilterIcpMin("");
    setFilterIcpMax("");
    setSearch("");
  };

  // --- Multi-select helper ---
  const toggleMultiSelect = (
    value: string,
    current: string[],
    setter: (v: string[]) => void
  ) => {
    if (current.includes(value)) {
      setter(current.filter((v) => v !== value));
    } else {
      setter([...current, value]);
    }
  };

  // --- Sort header component ---
  function SortHeader({
    label,
    field,
    className: extraClass,
  }: {
    label: string;
    field: SortField;
    className?: string;
  }) {
    const isActive = sortField === field;
    return (
      <th className={cn("px-2 py-2 font-medium", extraClass)}>
        <button
          onClick={() => handleSort(field)}
          className="inline-flex items-center gap-1 hover:text-white transition-colors"
        >
          {label}
          {isActive ? (
            sortDir === "desc" ? (
              <ChevronDown className="w-3.5 h-3.5 text-[var(--accent-orange)]" />
            ) : (
              <ChevronUp className="w-3.5 h-3.5 text-[var(--accent-orange)]" />
            )
          ) : (
            <ChevronsUpDown className="w-3 h-3 opacity-40" />
          )}
        </button>
      </th>
    );
  }

  // --- Toggle component ---
  function Toggle({
    label,
    checked,
    onChange,
  }: {
    label: string;
    checked: boolean;
    onChange: (v: boolean) => void;
  }) {
    return (
      <label className="flex items-center gap-2 cursor-pointer text-sm text-[var(--text-secondary)] hover:text-white transition-colors">
        <div
          className={`w-8 h-4.5 rounded-full relative transition-colors ${
            checked ? "bg-[var(--accent-orange)]/40" : "bg-white/[0.08]"
          }`}
          onClick={(e) => { e.preventDefault(); onChange(!checked); }}
        >
          <div
            className={`absolute top-0.5 w-3.5 h-3.5 rounded-full transition-all ${
              checked
                ? "left-4 bg-[var(--accent-orange)]"
                : "left-0.5 bg-[var(--text-muted)]"
            }`}
          />
        </div>
        {label}
      </label>
    );
  }

  // Preview card is rendered by a separate component to isolate re-renders

  // --- Sidebar ---
  const sidebar = (
    <div className="space-y-4">
      {/* Search */}
      <GlassInput
        icon={Search}
        placeholder="Search name, email, org..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {/* Filter Groups */}
      <GlassCard className="!p-3">
        <FilterGroup title="Relationships" defaultOpen={true}>
          <div className="space-y-2">
            <GlassSelect
              placeholder="Filter by event..."
              options={eventOptions.map((e) => ({ value: e.id, label: e.name }))}
              value={filterEvents[0] || ""}
              onChange={(e) => {
                const val = e.target.value;
                if (val) {
                  toggleMultiSelect(val, filterEvents, setFilterEvents);
                }
              }}
            />
            {filterEvents.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {filterEvents.map((id) => (
                  <span
                    key={id}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-white/[0.06] text-[var(--text-secondary)]"
                  >
                    {eventOptions.find((e) => e.id === id)?.name || id}
                    <button onClick={() => toggleMultiSelect(id, filterEvents, setFilterEvents)}>
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            <GlassSelect
              placeholder="Has Organization"
              options={[
                { value: "yes", label: "Yes" },
                { value: "no", label: "No" },
              ]}
              value={filterHasOrg}
              onChange={(e) => setFilterHasOrg(e.target.value)}
            />

            <GlassSelect
              placeholder="Correlation Type"
              options={[
                { value: "speaker_sponsor", label: "Speaker + Sponsor" },
                { value: "speaker_only", label: "Speaker Only" },
                { value: "sponsor_contact", label: "Sponsor Contact" },
                { value: "org_sponsor", label: "Org Sponsor" },
                { value: "none", label: "No Event Link" },
              ]}
              value={filterCorrelationType[0] || ""}
              onChange={(e) => {
                const val = e.target.value;
                if (val) toggleMultiSelect(val, filterCorrelationType, setFilterCorrelationType);
              }}
            />
            {filterCorrelationType.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {filterCorrelationType.map((ct) => (
                  <span
                    key={ct}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-white/[0.06] text-[var(--text-secondary)]"
                  >
                    {ct.replace(/_/g, " ")}
                    <button onClick={() => toggleMultiSelect(ct, filterCorrelationType, setFilterCorrelationType)}>
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </FilterGroup>

        <FilterGroup title="Profile" defaultOpen={false}>
          <div className="space-y-2">
            <GlassSelect
              placeholder="Seniority"
              options={seniorityOptions.map((s) => ({ value: s, label: s }))}
              value={filterSeniority[0] || ""}
              onChange={(e) => {
                const val = e.target.value;
                if (val) toggleMultiSelect(val, filterSeniority, setFilterSeniority);
              }}
            />
            {filterSeniority.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {filterSeniority.map((s) => (
                  <span key={s} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-white/[0.06] text-[var(--text-secondary)]">
                    {s}
                    <button onClick={() => toggleMultiSelect(s, filterSeniority, setFilterSeniority)}><X className="w-3 h-3" /></button>
                  </span>
                ))}
              </div>
            )}

            <GlassSelect
              placeholder="Department"
              options={departmentOptions.map((d) => ({ value: d, label: d }))}
              value={filterDepartment[0] || ""}
              onChange={(e) => {
                const val = e.target.value;
                if (val) toggleMultiSelect(val, filterDepartment, setFilterDepartment);
              }}
            />
            {filterDepartment.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {filterDepartment.map((d) => (
                  <span key={d} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-white/[0.06] text-[var(--text-secondary)]">
                    {d}
                    <button onClick={() => toggleMultiSelect(d, filterDepartment, setFilterDepartment)}><X className="w-3 h-3" /></button>
                  </span>
                ))}
              </div>
            )}

            <GlassSelect
              placeholder="Source"
              options={sourceOptions.map((s) => ({ value: s, label: s }))}
              value={filterSource[0] || ""}
              onChange={(e) => {
                const val = e.target.value;
                if (val) toggleMultiSelect(val, filterSource, setFilterSource);
              }}
            />
            {filterSource.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {filterSource.map((s) => (
                  <span key={s} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-white/[0.06] text-[var(--text-secondary)]">
                    {s}
                    <button onClick={() => toggleMultiSelect(s, filterSource, setFilterSource)}><X className="w-3 h-3" /></button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </FilterGroup>

        <FilterGroup title="Contact" defaultOpen={false}>
          <div className="space-y-2">
            <Toggle label="Has Email" checked={filterHasEmail} onChange={setFilterHasEmail} />
            <Toggle label="Has LinkedIn" checked={filterHasLinkedin} onChange={setFilterHasLinkedin} />
            <Toggle label="Has Phone" checked={filterHasPhone} onChange={setFilterHasPhone} />
            <Toggle label="Has Twitter" checked={filterHasTwitter} onChange={setFilterHasTwitter} />
            <Toggle label="Has Telegram" checked={filterHasTelegram} onChange={setFilterHasTelegram} />
          </div>
        </FilterGroup>

        <FilterGroup title="Enrichment" defaultOpen={false}>
          <div className="space-y-2">
            <GlassSelect
              placeholder="Enrichment Status"
              options={[
                { value: "none", label: "None" },
                { value: "in_progress", label: "In Progress" },
                { value: "complete", label: "Complete" },
                { value: "failed", label: "Failed" },
              ]}
              value={filterEnrichmentStatus[0] || ""}
              onChange={(e) => {
                const val = e.target.value;
                if (val) toggleMultiSelect(val, filterEnrichmentStatus, setFilterEnrichmentStatus);
              }}
            />
            {filterEnrichmentStatus.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {filterEnrichmentStatus.map((s) => (
                  <span key={s} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-white/[0.06] text-[var(--text-secondary)]">
                    {s}
                    <button onClick={() => toggleMultiSelect(s, filterEnrichmentStatus, setFilterEnrichmentStatus)}><X className="w-3 h-3" /></button>
                  </span>
                ))}
              </div>
            )}

            <div className="flex items-center gap-2">
              <GlassInput
                placeholder="ICP Min"
                type="number"
                value={filterIcpMin}
                onChange={(e) => setFilterIcpMin(e.target.value)}
                className="w-full"
              />
              <GlassInput
                placeholder="ICP Max"
                type="number"
                value={filterIcpMax}
                onChange={(e) => setFilterIcpMax(e.target.value)}
                className="w-full"
              />
            </div>
          </div>
        </FilterGroup>
      </GlassCard>

      {/* Active Filters */}
      <ActiveFilters
        filters={activeFilters}
        onRemove={handleRemoveFilter}
        onClearAll={handleClearAll}
      />

      {/* Selection Summary */}
      <SelectionSummary
        count={selectedIds.size}
        stats={selectionStats}
        actions={
          <div className="flex items-center gap-2">
            <Badge variant="glass-orange" className="cursor-pointer hover:opacity-80">
              Add to List
            </Badge>
            <Badge variant="glass-orange" className="cursor-pointer hover:opacity-80">
              Enrich
            </Badge>
          </div>
        }
      />

      {/* Row Preview */}
      <RowPreviewCard
        setterRef={previewSetterRef}
        correlations={correlations}
        onMouseEnter={handlePreviewMouseEnter}
        onMouseLeave={handlePreviewMouseLeave}
      />
    </div>
  );

  // --- Render ---
  return (
    <TwoPanelLayout sidebar={sidebar}>
      <GlassCard padding={false}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[var(--text-muted)] border-b border-[var(--glass-border)] text-xs">
                <th className="px-2 py-2 w-8">
                  <GlassCheckbox
                    checked={allVisibleSelected && filteredRows.length > 0}
                    onChange={toggleSelectAll}
                  />
                </th>
                <SortHeader label="Name" field="full_name" className="min-w-[120px] max-w-[180px]" />
                <SortHeader label="Organization" field="primary_org_name" className="min-w-[100px] max-w-[160px]" />
                <SortHeader label="ICP" field="icp_score" className="w-[44px]" />
                <th className="px-1.5 py-2 font-medium">
                  Channels
                </th>
                <th className="px-1.5 py-2 font-medium">
                  Events
                </th>
                <th className="px-1.5 py-2 font-medium hidden lg:table-cell" style={{ maxWidth: "140px" }}>
                  Correlation
                </th>
                <th className="px-1 py-2 font-medium hidden lg:table-cell">
                  Enr.
                </th>
                <SortHeader label="Activity" field="last_interaction_at" />
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {filteredRows.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-5 py-12 text-center">
                    <Users className="w-10 h-10 text-[var(--text-muted)] mx-auto mb-3" />
                    <p className="text-[var(--text-muted)]">No persons found.</p>
                  </td>
                </tr>
              )}
              {filteredRows.map((row, idx) => {
                const correlation = correlations[row.id];
                const isSelected = selectedIds.has(row.id);
                return (
                  <tr
                    key={row.id}
                    className={`hover:bg-white/[0.03] cursor-pointer ${
                      isSelected ? "bg-[var(--accent-orange)]/[0.04]" : ""
                    }`}
                    style={{ height: "36px" }}
                    onMouseEnter={() => handleRowMouseEnter(row.id)}
                    onMouseLeave={handleRowMouseLeave}
                    onClick={(e) => {
                      // Don't navigate on checkbox click
                      if ((e.target as HTMLElement).closest("button[type=button]")) return;
                      router.push(`/admin/persons/${row.id}`);
                    }}
                  >
                    {/* Checkbox */}
                    <td className="px-2 py-1.5">
                      <GlassCheckbox
                        checked={isSelected}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCheckboxClick(row.id, idx, e.shiftKey);
                        }}
                      />
                    </td>

                    {/* Name + Title (combined) */}
                    <td className="px-2 py-1 max-w-[180px]" title={`${row.full_name}${row.title ? ` — ${row.title}` : ""}`}>
                      <div className="flex items-center gap-1.5 min-w-0">
                        {row.photo_url ? (
                          <img
                            src={row.photo_url}
                            alt=""
                            className="w-5 h-5 rounded-full object-cover flex-shrink-0"
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
                    </td>

                    {/* Organization + Seniority (combined) */}
                    <td className="px-1.5 py-1 text-xs max-w-[160px]" title={`${row.primary_org_name || ""}${row.seniority ? ` · ${row.seniority}` : ""}`}>
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
                    </td>

                    {/* ICP */}
                    <td className="px-1 py-1">
                      {row.icp_score !== null ? (
                        <Badge variant={icpBadgeVariant(row.icp_score)} className="text-[10px] px-1.5 py-0">
                          {row.icp_score}
                        </Badge>
                      ) : (
                        <span className="text-[var(--text-muted)] text-xs">&mdash;</span>
                      )}
                    </td>

                    {/* Channels */}
                    <td className="px-1.5 py-1">
                      <div className="flex items-center gap-0.5">
                        <Mail className={`w-3 h-3 ${row.email ? "text-[var(--text-secondary)]" : "text-white/[0.1]"}`} />
                        <Linkedin className={`w-3 h-3 ${row.linkedin_url ? "text-[var(--text-secondary)]" : "text-white/[0.1]"}`} />
                        <Twitter className={`w-3 h-3 ${row.twitter_handle ? "text-[var(--text-secondary)]" : "text-white/[0.1]"}`} />
                        <Send className={`w-3 h-3 ${row.telegram_handle ? "text-[var(--text-secondary)]" : "text-white/[0.1]"}`} />
                        <Phone className={`w-3 h-3 ${row.phone ? "text-[var(--text-secondary)]" : "text-white/[0.1]"}`} />
                      </div>
                    </td>

                    {/* Events */}
                    <td className="px-1.5 py-1">
                      <div className="flex flex-wrap gap-1">
                        {row.personEvents.slice(0, 2).map((pe, i) => (
                          <Badge key={i} variant="default" className="text-[10px] px-1.5 py-0 truncate max-w-[70px]">
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
                    </td>

                    {/* Correlation */}
                    <td className="px-1.5 py-1 hidden lg:table-cell" style={{ maxWidth: "140px" }}>
                      {(() => {
                        const { label, colorClass } = compactCorrelationLabel(correlation);
                        return (
                          <span
                            className={`text-[10px] truncate block ${colorClass}`}
                            title={label}
                          >
                            {label}
                          </span>
                        );
                      })()}
                    </td>

                    {/* Enrichment */}
                    <td className="px-1 py-1 hidden lg:table-cell">
                      {enrichmentIcon(row.enrichment_status)}
                    </td>

                    {/* Last Activity */}
                    <td className="px-1.5 py-1 text-[var(--text-muted)] text-[10px]">
                      {relativeDate(row.last_interaction_at)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="px-2 py-2 border-t border-[var(--glass-border)] flex items-center justify-between">
          <p className="text-xs text-[var(--text-muted)]">
            {filteredRows.length} of {rows.length} persons
          </p>
          {selectedIds.size > 0 && (
            <p className="text-xs text-[var(--accent-orange)]">
              {selectedIds.size} selected
            </p>
          )}
        </div>
      </GlassCard>
    </TwoPanelLayout>
  );
}
