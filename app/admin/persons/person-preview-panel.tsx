"use client";

import React, { useState, useEffect } from "react";
import {
  Mail,
  Linkedin,
  Twitter,
  Send,
  Phone,
} from "lucide-react";
import Image from "next/image";
import { GlassCard } from "@/components/ui/glass-card";
import { CorrelationBadge } from "@/components/admin/correlation-badge";
import type { PersonRow, CorrelationResult } from "./person-table-row";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getInitials(name: string) {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ---------------------------------------------------------------------------
// PersonPreviewPanel
// ---------------------------------------------------------------------------

interface PersonPreviewPanelProps {
  setterRef: React.MutableRefObject<(row: PersonRow | null) => void>;
  correlations: Record<string, CorrelationResult>;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

export const PersonPreviewPanel = React.memo(function PersonPreviewPanel({
  setterRef,
  correlations,
  onMouseEnter,
  onMouseLeave,
}: PersonPreviewPanelProps) {
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
            <Image
              src={row.photo_url}
              alt={row.full_name}
              width={48}
              height={48}
              className="w-12 h-12 rounded-full object-cover flex-shrink-0"
              unoptimized
            />
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
});
