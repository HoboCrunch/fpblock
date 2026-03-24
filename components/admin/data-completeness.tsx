"use client";

import { GlassCard } from "@/components/ui/glass-card";
import { Check, X as XIcon, Loader2, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

interface FieldCheck {
  label: string;
  present: boolean;
}

interface DataCompletenessProps {
  fields: FieldCheck[];
  enrichmentStatus?: string;
  lastEnrichedAt?: string | null;
  enrichmentStages?: React.ReactNode;
}

function EnrichmentStatusIcon({ status }: { status: string }) {
  switch (status) {
    case "complete":
      return <Check className="w-3.5 h-3.5 text-emerald-400" />;
    case "in_progress":
      return <Loader2 className="w-3.5 h-3.5 text-[var(--accent-orange)] animate-spin" />;
    case "failed":
      return <XIcon className="w-3.5 h-3.5 text-red-400" />;
    default:
      return <Minus className="w-3.5 h-3.5 text-[var(--text-muted)]" />;
  }
}

function enrichmentStatusLabel(status: string): string {
  switch (status) {
    case "complete":
      return "Complete";
    case "in_progress":
      return "In Progress";
    case "failed":
      return "Failed";
    default:
      return "Not Enriched";
  }
}

export function DataCompleteness({
  fields,
  enrichmentStatus,
  lastEnrichedAt,
  enrichmentStages,
}: DataCompletenessProps) {
  const filledCount = fields.filter((f) => f.present).length;
  const percentage = fields.length > 0 ? Math.round((filledCount / fields.length) * 100) : 0;

  return (
    <GlassCard>
      {/* Header + percentage */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-white">Data Completeness</h3>
        <span className="text-sm font-semibold text-[var(--accent-orange)]">
          {percentage}%
        </span>
      </div>

      {/* Progress bar */}
      <div className="w-full h-2 rounded-full glass mb-4">
        <div
          className="h-full rounded-full bg-[var(--accent-orange)] transition-all duration-300"
          style={{ width: `${percentage}%` }}
        />
      </div>

      {/* Field checklist — 3 columns */}
      <div className="grid grid-cols-3 gap-x-2 gap-y-1.5">
        {fields.map((field) => (
          <div key={field.label} className="flex items-center gap-1.5">
            {field.present ? (
              <Check className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
            ) : (
              <XIcon className="w-3.5 h-3.5 text-red-400/60 flex-shrink-0" />
            )}
            <span
              className={cn(
                "text-xs truncate",
                field.present
                  ? "text-[var(--text-secondary)]"
                  : "text-[var(--text-muted)]"
              )}
            >
              {field.label}
            </span>
          </div>
        ))}
      </div>

      {/* Enrichment status */}
      {enrichmentStatus && (
        <div className="mt-4 pt-3 border-t border-[var(--glass-border)] space-y-2">
          <div className="flex items-center gap-2 text-xs">
            <EnrichmentStatusIcon status={enrichmentStatus} />
            <span className="text-[var(--text-secondary)]">
              Enrichment: {enrichmentStatusLabel(enrichmentStatus)}
            </span>
          </div>

          {lastEnrichedAt && (
            <p className="text-xs text-[var(--text-muted)]">
              Last enriched: {lastEnrichedAt}
            </p>
          )}
        </div>
      )}

      {/* Enrichment stages slot */}
      {enrichmentStages && (
        <div className="mt-3 pt-3 border-t border-[var(--glass-border)]">
          {enrichmentStages}
        </div>
      )}
    </GlassCard>
  );
}
