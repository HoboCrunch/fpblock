"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { GlassCard } from "@/components/ui/glass-card";
import type { PipelineContact } from "@/lib/types/pipeline";

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

export function PipelineTable({ contacts }: { contacts: PipelineContact[] }) {
  if (contacts.length === 0) {
    return (
      <GlassCard className="p-8 text-center">
        <p className="text-white/40 text-sm">No contacts match the current filters.</p>
      </GlassCard>
    );
  }

  return (
    <GlassCard className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/[0.06]">
              <th className="text-left px-4 py-3 text-xs font-medium text-white/40 uppercase tracking-wider">
                Contact
              </th>
              <th className="text-left px-4 py-3 text-xs font-medium text-white/40 uppercase tracking-wider">
                Company
              </th>
              <th className="text-left px-4 py-3 text-xs font-medium text-white/40 uppercase tracking-wider">
                Channel
              </th>
              <th className="text-left px-4 py-3 text-xs font-medium text-white/40 uppercase tracking-wider">
                Stage
              </th>
              <th className="text-left px-4 py-3 text-xs font-medium text-white/40 uppercase tracking-wider">
                ICP
              </th>
              <th className="text-left px-4 py-3 text-xs font-medium text-white/40 uppercase tracking-wider">
                Last Updated
              </th>
            </tr>
          </thead>
          <tbody>
            {contacts.map((contact) => {
              const stageDef = STAGE_BADGE[contact.pipeline_stage] || STAGE_BADGE.not_contacted;
              return (
                <tr
                  key={contact.id}
                  className="border-b border-white/[0.04] hover:bg-white/[0.04] transition-colors duration-200"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/contacts/${contact.id}`}
                      className="text-white hover:text-[#6e86ff] transition-colors"
                    >
                      {contact.full_name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-white/60">
                    {contact.company_name || "—"}
                  </td>
                  <td className="px-4 py-3 text-white/60 capitalize">
                    {contact.channel || "—"}
                  </td>
                  <td className="px-4 py-3">
                    <Badge className={cn("text-xs", stageDef.className)}>
                      {stageDef.label}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    {contact.icp_score != null ? (
                      <Badge className={cn("text-xs", icpBadgeClass(contact.icp_score))}>
                        {contact.icp_score}
                      </Badge>
                    ) : (
                      <span className="text-white/30">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-white/40 text-xs">
                    {contact.last_updated
                      ? new Date(contact.last_updated).toLocaleDateString()
                      : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </GlassCard>
  );
}
