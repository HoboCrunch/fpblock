"use client";

import { useState } from "react";
import type { PersonWithIcp } from "@/lib/types/database";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import {
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Mail,
  Linkedin,
  Twitter,
  Send,
  Phone,
} from "lucide-react";

export type PersonRow = PersonWithIcp & {
  interaction_count?: number;
  last_interaction_at?: string | null;
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

function icpBadgeVariant(score: number | null) {
  if (score === null) return "default";
  if (score >= 90) return "replied";
  if (score >= 75) return "scheduled";
  return "default";
}

export function PersonTable({ persons }: { persons: PersonRow[] }) {
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

  const sorted = [...persons].sort((a, b) => {
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
      case "primary_org_name":
        aVal = a.primary_org_name?.toLowerCase() ?? null;
        bVal = b.primary_org_name?.toLowerCase() ?? null;
        break;
      case "title":
        aVal = a.title?.toLowerCase() ?? null;
        bVal = b.title?.toLowerCase() ?? null;
        break;
      case "last_interaction_at":
        aVal = a.last_interaction_at ?? null;
        bVal = b.last_interaction_at ?? null;
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
            <SortButton label="ICP" field="icp_score" currentSort={sortField} currentDir={sortDir} onSort={handleSort} />
            <SortButton label="Name" field="full_name" currentSort={sortField} currentDir={sortDir} onSort={handleSort} />
            <SortButton label="Organization" field="primary_org_name" currentSort={sortField} currentDir={sortDir} onSort={handleSort} />
            <SortButton label="Title" field="title" currentSort={sortField} currentDir={sortDir} onSort={handleSort} />
            <th className="px-3 md:px-5 py-3 font-medium">Channels</th>
            <SortButton label="Last Interaction" field="last_interaction_at" currentSort={sortField} currentDir={sortDir} onSort={handleSort} />
            <SortButton label="Interactions" field="interaction_count" currentSort={sortField} currentDir={sortDir} onSort={handleSort} />
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.04]">
          {sorted.length === 0 && (
            <tr>
              <td colSpan={7} className="px-3 md:px-5 py-12 text-center">
                <p className="text-[var(--text-muted)]">No persons found.</p>
              </td>
            </tr>
          )}
          {sorted.map((person) => (
            <tr key={person.id} className="hover:bg-white/[0.03] transition-all duration-200">
              <td className="px-3 md:px-5 py-3">
                {person.icp_score != null ? (
                  <Badge variant={icpBadgeVariant(person.icp_score)}>
                    {person.icp_score}
                  </Badge>
                ) : (
                  <span className="text-[var(--text-muted)]">&mdash;</span>
                )}
              </td>
              <td className="px-3 md:px-5 py-3">
                <Link
                  href={`/admin/persons/${person.id}`}
                  className="text-[var(--accent-indigo)] hover:underline font-medium"
                >
                  {person.full_name}
                </Link>
              </td>
              <td className="px-3 md:px-5 py-3 text-[var(--text-secondary)]">
                {person.primary_org_name || "\u2014"}
              </td>
              <td className="px-3 md:px-5 py-3 text-[var(--text-muted)]">
                {person.title || "\u2014"}
              </td>
              <td className="px-3 md:px-5 py-3">
                <div className="flex items-center gap-1.5">
                  {person.email && <Mail className="w-3.5 h-3.5 text-[var(--text-muted)]" />}
                  {person.linkedin_url && <Linkedin className="w-3.5 h-3.5 text-[var(--text-muted)]" />}
                  {person.twitter_handle && <Twitter className="w-3.5 h-3.5 text-[var(--text-muted)]" />}
                  {person.telegram_handle && <Send className="w-3.5 h-3.5 text-[var(--text-muted)]" />}
                  {person.phone && <Phone className="w-3.5 h-3.5 text-[var(--text-muted)]" />}
                </div>
              </td>
              <td className="px-3 md:px-5 py-3 text-[var(--text-muted)]">
                {person.last_interaction_at
                  ? new Date(person.last_interaction_at).toLocaleDateString()
                  : "\u2014"}
              </td>
              <td className="px-3 md:px-5 py-3 text-[var(--text-muted)]">
                {person.interaction_count ?? 0}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
