"use client";

import { useState } from "react";
import type { Initiative, Event } from "@/lib/types/database";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";

export type InitiativeRow = Initiative & {
  event?: Pick<Event, "id" | "name"> | null;
  enrollment_count: number;
  interaction_count: number;
};

const typeVariant: Record<string, string> = {
  outreach: "glass-orange",
  sponsorship: "glass-indigo",
  partnership: "glass-indigo",
  event: "scheduled",
  research: "draft",
};

const statusVariant: Record<string, string> = {
  draft: "draft",
  active: "sent",
  paused: "scheduled",
  completed: "replied",
  archived: "default",
};

function SortButton({
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
    <th className="px-3 md:px-5 py-3 font-medium">
      <button
        onClick={() => onSort(field)}
        className="inline-flex items-center gap-1 hover:text-white transition-colors"
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
    </th>
  );
}

export function InitiativeTable({
  initiatives,
}: {
  initiatives: InitiativeRow[];
}) {
  const [sortField, setSortField] = useState("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  function handleSort(field: string) {
    if (sortField === field) {
      setSortDir(sortDir === "desc" ? "asc" : "desc");
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  }

  const sorted = [...initiatives].sort((a, b) => {
    let aVal: any, bVal: any;

    switch (sortField) {
      case "name":
        aVal = a.name?.toLowerCase();
        bVal = b.name?.toLowerCase();
        break;
      case "initiative_type":
        aVal = a.initiative_type?.toLowerCase() ?? null;
        bVal = b.initiative_type?.toLowerCase() ?? null;
        break;
      case "status":
        aVal = a.status?.toLowerCase();
        bVal = b.status?.toLowerCase();
        break;
      case "owner":
        aVal = a.owner?.toLowerCase() ?? null;
        bVal = b.owner?.toLowerCase() ?? null;
        break;
      case "event":
        aVal = a.event?.name?.toLowerCase() ?? null;
        bVal = b.event?.name?.toLowerCase() ?? null;
        break;
      case "enrollment_count":
        aVal = a.enrollment_count ?? 0;
        bVal = b.enrollment_count ?? 0;
        break;
      case "interaction_count":
        aVal = a.interaction_count ?? 0;
        bVal = b.interaction_count ?? 0;
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

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[600px] text-sm">
        <thead>
          <tr className="text-left text-[var(--text-muted)] border-b border-[var(--glass-border)]">
            <SortButton label="Name" field="name" currentSort={sortField} currentDir={sortDir} onSort={handleSort} />
            <SortButton label="Type" field="initiative_type" currentSort={sortField} currentDir={sortDir} onSort={handleSort} />
            <SortButton label="Status" field="status" currentSort={sortField} currentDir={sortDir} onSort={handleSort} />
            <SortButton label="Owner" field="owner" currentSort={sortField} currentDir={sortDir} onSort={handleSort} />
            <SortButton label="Event" field="event" currentSort={sortField} currentDir={sortDir} onSort={handleSort} />
            <SortButton label="Enrollments" field="enrollment_count" currentSort={sortField} currentDir={sortDir} onSort={handleSort} />
            <SortButton label="Interactions" field="interaction_count" currentSort={sortField} currentDir={sortDir} onSort={handleSort} />
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.04]">
          {sorted.length === 0 && (
            <tr>
              <td colSpan={7} className="px-3 md:px-5 py-12 text-center">
                <p className="text-[var(--text-muted)]">No initiatives found.</p>
              </td>
            </tr>
          )}
          {sorted.map((initiative) => (
            <tr key={initiative.id} className="hover:bg-white/[0.03] transition-all duration-200">
              <td className="px-3 md:px-5 py-3">
                <Link
                  href={`/admin/initiatives/${initiative.id}`}
                  className="text-[var(--accent-indigo)] hover:underline font-medium"
                >
                  {initiative.name}
                </Link>
              </td>
              <td className="px-3 md:px-5 py-3">
                {initiative.initiative_type && (
                  <Badge variant={typeVariant[initiative.initiative_type] ?? "default"}>
                    {initiative.initiative_type}
                  </Badge>
                )}
              </td>
              <td className="px-3 md:px-5 py-3">
                <Badge variant={statusVariant[initiative.status] ?? "default"}>
                  {initiative.status}
                </Badge>
              </td>
              <td className="px-3 md:px-5 py-3 text-[var(--text-secondary)]">
                {initiative.owner || "\u2014"}
              </td>
              <td className="px-3 md:px-5 py-3">
                {initiative.event ? (
                  <Link
                    href={`/admin/events/${initiative.event.id}`}
                    className="text-[var(--accent-indigo)] hover:underline"
                  >
                    {initiative.event.name}
                  </Link>
                ) : (
                  <span className="text-[var(--text-muted)]">&mdash;</span>
                )}
              </td>
              <td className="px-3 md:px-5 py-3 text-[var(--text-muted)]">
                {initiative.enrollment_count}
              </td>
              <td className="px-3 md:px-5 py-3 text-[var(--text-muted)]">
                {initiative.interaction_count}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
