"use client";

import { useState } from "react";
import type { Organization } from "@/lib/types/database";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";

export type OrganizationRow = Organization & {
  person_count?: number;
  signal_count?: number;
  last_signal?: string | null;
  events?: { id: string; name: string; role: string; tier: string | null }[];
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

export function OrganizationTable({ organizations }: { organizations: OrganizationRow[] }) {
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

  const sorted = [...organizations].sort((a, b) => {
    let aVal: any, bVal: any;
    switch (sortField) {
      case "icp_score":
        aVal = a.icp_score ?? null;
        bVal = b.icp_score ?? null;
        break;
      case "name":
        aVal = a.name?.toLowerCase();
        bVal = b.name?.toLowerCase();
        break;
      case "category":
        aVal = a.category?.toLowerCase() ?? null;
        bVal = b.category?.toLowerCase() ?? null;
        break;
      case "person_count":
        aVal = a.person_count ?? 0;
        bVal = b.person_count ?? 0;
        break;
      case "signal_count":
        aVal = a.signal_count ?? 0;
        bVal = b.signal_count ?? 0;
        break;
      case "last_signal":
        aVal = a.last_signal ?? null;
        bVal = b.last_signal ?? null;
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
            <SortButton label="ICP" field="icp_score" currentSort={sortField} currentDir={sortDir} onSort={handleSort} />
            <SortButton label="Name" field="name" currentSort={sortField} currentDir={sortDir} onSort={handleSort} />
            <SortButton label="Category" field="category" currentSort={sortField} currentDir={sortDir} onSort={handleSort} />
            <SortButton label="People" field="person_count" currentSort={sortField} currentDir={sortDir} onSort={handleSort} />
            <SortButton label="Signals" field="signal_count" currentSort={sortField} currentDir={sortDir} onSort={handleSort} />
            <SortButton label="Last Signal" field="last_signal" currentSort={sortField} currentDir={sortDir} onSort={handleSort} />
            <th className="px-3 md:px-5 py-3 font-medium">Events</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.04]">
          {sorted.map((org) => (
            <tr key={org.id} className="hover:bg-white/[0.03] transition-all duration-200">
              <td className="px-3 md:px-5 py-3">
                {org.icp_score != null ? (
                  <Badge variant={org.icp_score >= 90 ? "replied" : org.icp_score >= 75 ? "scheduled" : "default"}>
                    {org.icp_score}
                  </Badge>
                ) : (
                  <span className="text-[var(--text-muted)]">&mdash;</span>
                )}
              </td>
              <td className="px-3 md:px-5 py-3">
                <Link href={`/admin/organizations/${org.id}`} className="text-[var(--accent-indigo)] hover:underline font-medium">
                  {org.name}
                </Link>
              </td>
              <td className="px-3 md:px-5 py-3 text-[var(--text-muted)]">{org.category || "\u2014"}</td>
              <td className="px-3 md:px-5 py-3 text-[var(--text-secondary)]">{org.person_count ?? "\u2014"}</td>
              <td className="px-3 md:px-5 py-3 text-[var(--text-secondary)]">{org.signal_count ?? 0}</td>
              <td className="px-3 md:px-5 py-3 text-[var(--text-muted)]">
                {org.last_signal
                  ? new Date(org.last_signal).toLocaleDateString()
                  : "\u2014"}
              </td>
              <td className="px-3 md:px-5 py-3">
                <div className="flex flex-wrap gap-1">
                  {(org.events || []).map((ev, i) => (
                    <Badge key={i} variant={ev.tier ? "glass-orange" : "glass-indigo"}>
                      {ev.name}{ev.tier ? ` (${ev.tier})` : ""}
                    </Badge>
                  ))}
                  {(!org.events || org.events.length === 0) && <span className="text-[var(--text-muted)]">&mdash;</span>}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
