"use client";

import { memo } from "react";
import Image from "next/image";
import { GlassCard } from "@/components/ui/glass-card";
import { Badge } from "@/components/ui/badge";
import { Globe, Linkedin } from "lucide-react";
import type { OrgRow } from "./organizations-table-client";

interface OrgPreviewCardProps {
  row: OrgRow;
  people: Array<{ full_name: string; title: string | null; seniority: string | null }>;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

export const OrgPreviewCard = memo(function OrgPreviewCard({
  row,
  people,
  onMouseEnter,
  onMouseLeave,
}: OrgPreviewCardProps) {
  return (
    <div onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
      <GlassCard className="animate-in fade-in slide-in-from-right-2 duration-200">
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            {row.logo_url ? (
              <Image src={row.logo_url} alt={row.name} width={48} height={48} className="w-12 h-12 rounded-lg object-cover" />
            ) : (
              <div className="w-12 h-12 rounded-lg bg-[var(--glass-bg)] border border-[var(--glass-border)] flex items-center justify-center text-lg font-bold text-[var(--text-muted)]">
                {row.name.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-white font-medium truncate">{row.name}</p>
              {row.category && <Badge variant="default" className="mt-0.5">{row.category}</Badge>}
            </div>
          </div>
          {row.description && (
            <p className="text-xs text-[var(--text-muted)] line-clamp-3">
              {row.description.slice(0, 120)}{row.description.length > 120 ? "..." : ""}
            </p>
          )}
          <div className="flex items-center gap-3">
            {row.website && (
              <a href={row.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-[var(--accent-indigo)] hover:underline">
                <Globe className="w-3 h-3" /> Website
              </a>
            )}
            {row.linkedin_url && (
              <a href={row.linkedin_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-[var(--accent-indigo)] hover:underline">
                <Linkedin className="w-3 h-3" /> LinkedIn
              </a>
            )}
          </div>
          {row.icp_reason && (
            <div>
              <p className="text-[10px] uppercase tracking-wide text-[var(--text-muted)] mb-0.5">ICP Reason</p>
              <p className="text-xs text-[var(--text-secondary)] line-clamp-2">{row.icp_reason}</p>
            </div>
          )}
          {row.usp && (
            <div>
              <p className="text-[10px] uppercase tracking-wide text-[var(--text-muted)] mb-0.5">USP</p>
              <p className="text-xs text-[var(--text-secondary)] line-clamp-2">
                {row.usp.slice(0, 100)}{row.usp.length > 100 ? "..." : ""}
              </p>
            </div>
          )}
          {people.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wide text-[var(--text-muted)] mb-1">Top People</p>
              <div className="space-y-1">
                {people.map((p) => (
                  <div key={`${p.full_name}-${p.title ?? ""}`} className="text-xs">
                    <span className="text-white">{p.full_name}</span>
                    {p.title && <span className="text-[var(--text-muted)]"> - {p.title}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </GlassCard>
    </div>
  );
});
