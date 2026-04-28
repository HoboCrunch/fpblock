"use client";

import { useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { GlassCard } from "@/components/ui/glass-card";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import type { PipelineContact } from "@/lib/types/pipeline";
import { DataTable } from "@/components/ui/data-table";
import { TextCell, NumericCell, PillCell, DateCell, HeaderCell } from "@/components/ui/data-cell";

const STAGE_BADGE: Record<string, { label: string; className: string }> = {
  not_contacted: { label: "Not Contacted", className: "bg-gray-500/20 text-gray-400" },
  draft: { label: "Draft", className: "bg-yellow-500/20 text-yellow-400" },
  scheduled: { label: "Scheduled", className: "bg-blue-500/20 text-blue-400" },
  sent: { label: "Sent", className: "bg-green-500/20 text-green-400" },
  opened: { label: "Opened", className: "bg-teal-400/20 text-teal-400" },
  replied: { label: "Replied", className: "bg-emerald-500/20 text-emerald-400" },
  bounced_failed: { label: "Bounced/Failed", className: "bg-red-500/20 text-red-400" },
};

function icpBadgeClass(score: number | null): string {
  if (!score) return "bg-gray-500/20 text-gray-400";
  if (score >= 90) return "bg-emerald-500/20 text-emerald-400";
  if (score >= 75) return "bg-orange-500/20 text-orange-400";
  if (score >= 50) return "bg-blue-500/20 text-blue-400";
  return "bg-gray-500/20 text-gray-400";
}

const GRID_TEMPLATE = "56px minmax(120px,1.5fr) minmax(120px,1.5fr) 100px 120px 100px";

function SortHeader({
  label,
  field,
  currentSort,
  currentDir,
  onSort,
}: {
  label: string;
  field: string;
  currentSort: string;
  currentDir: "asc" | "desc";
  onSort: (field: string) => void;
}) {
  const isActive = currentSort === field;
  return (
    <HeaderCell>
      <button
        onClick={() => onSort(field)}
        className="inline-flex items-center gap-1 hover:text-white/70 transition-colors"
      >
        {label}
        {isActive ? (
          currentDir === "desc" ? (
            <ChevronDown className="w-3.5 h-3.5 text-[var(--accent-orange)]" />
          ) : (
            <ChevronUp className="w-3.5 h-3.5 text-[var(--accent-orange)]" />
          )
        ) : (
          <ChevronsUpDown className="w-3 h-3 opacity-40" />
        )}
      </button>
    </HeaderCell>
  );
}

export function PipelineTable({ contacts }: { contacts: PipelineContact[] }) {
  const [sortField, setSortField] = useState("icp_score");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  function handleSort(field: string) {
    if (sortField === field) {
      setSortDir(sortDir === "desc" ? "asc" : "desc");
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  }

  if (contacts.length === 0) {
    return (
      <GlassCard className="p-8 text-center">
        <p className="text-white/40 text-sm">No persons match the current filters.</p>
      </GlassCard>
    );
  }

  const sorted = [...contacts].sort((a, b) => {
    let aVal: any, bVal: any;
    switch (sortField) {
      case "icp_score":
        aVal = a.icp_score ?? null;
        bVal = b.icp_score ?? null;
        break;
      case "full_name":
        aVal = a.full_name?.toLowerCase();
        bVal = b.full_name?.toLowerCase();
        break;
      case "company_name":
        aVal = a.company_name?.toLowerCase() ?? null;
        bVal = b.company_name?.toLowerCase() ?? null;
        break;
      case "channel":
        aVal = a.channel ?? null;
        bVal = b.channel ?? null;
        break;
      case "pipeline_stage":
        aVal = a.pipeline_stage;
        bVal = b.pipeline_stage;
        break;
      case "last_updated":
        aVal = a.last_updated ?? null;
        bVal = b.last_updated ?? null;
        break;
      default:
        return 0;
    }
    if (aVal == null && bVal == null) return 0;
    if (aVal == null) return 1;
    if (bVal == null) return -1;
    const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
    return sortDir === "desc" ? -cmp : cmp;
  });

  const header = (
    <>
      <SortHeader label="ICP" field="icp_score" currentSort={sortField} currentDir={sortDir} onSort={handleSort} />
      <SortHeader label="Person" field="full_name" currentSort={sortField} currentDir={sortDir} onSort={handleSort} />
      <SortHeader label="Organization" field="company_name" currentSort={sortField} currentDir={sortDir} onSort={handleSort} />
      <SortHeader label="Channel" field="channel" currentSort={sortField} currentDir={sortDir} onSort={handleSort} />
      <SortHeader label="Stage" field="pipeline_stage" currentSort={sortField} currentDir={sortDir} onSort={handleSort} />
      <SortHeader label="Last Updated" field="last_updated" currentSort={sortField} currentDir={sortDir} onSort={handleSort} />
    </>
  );

  return (
    <GlassCard className="overflow-hidden">
      <DataTable
        rows={sorted}
        gridTemplate={GRID_TEMPLATE}
        header={header}
        getRowKey={(contact) => contact.id}
        emptyMessage="No persons match the current filters."
        renderRow={(contact) => {
          const stageDef = STAGE_BADGE[contact.pipeline_stage] || STAGE_BADGE.not_contacted;
          return (
            <>
              {/* ICP score */}
              <NumericCell>
                {contact.icp_score != null ? (
                  <Badge className={cn("text-xs", icpBadgeClass(contact.icp_score))}>
                    {contact.icp_score}
                  </Badge>
                ) : (
                  <span className="text-white/30">&mdash;</span>
                )}
              </NumericCell>

              {/* Person name (link) */}
              <TextCell title={contact.full_name ?? undefined}>
                <Link
                  href={`/admin/persons/${contact.id}`}
                  className="truncate text-white hover:text-[#6e86ff] transition-colors"
                  onClick={(e) => e.stopPropagation()}
                >
                  {contact.full_name}
                </Link>
              </TextCell>

              {/* Organization */}
              <TextCell title={contact.company_name ?? undefined}>
                {contact.company_name || "—"}
              </TextCell>

              {/* Channel */}
              <TextCell className="capitalize">
                {contact.channel || "—"}
              </TextCell>

              {/* Stage badge */}
              <PillCell>
                <Badge className={cn("text-xs", stageDef.className)}>
                  {stageDef.label}
                </Badge>
              </PillCell>

              {/* Last Updated */}
              <DateCell>
                {contact.last_updated
                  ? new Date(contact.last_updated).toLocaleDateString()
                  : "—"}
              </DateCell>
            </>
          );
        }}
      />
    </GlassCard>
  );
}
