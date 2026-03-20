"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { GlassCard } from "@/components/ui/glass-card";

export type PipelineStage = {
  label: string;
  count: number;
  color: string;
  slug: string;
};

const STAGE_COLORS: Record<string, string> = {
  "not_contacted": "bg-gray-500",
  "draft": "bg-yellow-500",
  "scheduled": "bg-blue-500",
  "sent": "bg-green-500",
  "opened": "bg-teal-400",
  "replied": "bg-emerald-500",
  "bounced_failed": "bg-red-500",
};

export function PipelineBar({ stages }: { stages: PipelineStage[] }) {
  const total = stages.reduce((sum, s) => sum + s.count, 0);

  if (total === 0) {
    return (
      <GlassCard className="p-6">
        <h2 className="font-[family-name:var(--font-heading)] text-lg font-semibold text-white mb-4">
          Pipeline Funnel
        </h2>
        <p className="text-sm text-white/40">No contacts yet.</p>
      </GlassCard>
    );
  }

  return (
    <GlassCard className="p-6">
      <h2 className="font-[family-name:var(--font-heading)] text-lg font-semibold text-white mb-4">
        Pipeline Funnel
      </h2>
      <div className="flex w-full h-10 rounded-lg overflow-hidden">
        {stages.map((stage) => {
          if (stage.count === 0) return null;
          const pct = (stage.count / total) * 100;
          return (
            <Link
              key={stage.slug}
              href={`/admin/pipeline?stage=${stage.slug}`}
              className={cn(
                stage.color,
                "relative flex items-center justify-center text-xs font-medium text-white transition-all duration-200 hover:brightness-110 min-w-[28px]"
              )}
              style={{ width: `${pct}%` }}
              title={`${stage.label}: ${stage.count}`}
            >
              {pct > 6 && (
                <span className="truncate px-1">{stage.count}</span>
              )}
            </Link>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-4 mt-3">
        {stages.map((stage) => (
          <div key={stage.slug} className="flex items-center gap-1.5 text-xs text-white/60">
            <span className={cn("w-2.5 h-2.5 rounded-full", stage.color)} />
            <span>{stage.label}</span>
            <span className="text-white/40">({stage.count})</span>
          </div>
        ))}
      </div>
    </GlassCard>
  );
}
