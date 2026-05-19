"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

export interface PipelineStage {
  label: string;
  count: number;
  /** Tailwind background-color class. */
  color: string;
  /** Tailwind text color class matching `color`. */
  textColor: string;
  slug: string;
}

interface Props {
  stages: PipelineStage[];
}

/**
 * Pipeline funnel card — visual bar + per-stage tile row.
 * Each stage is click-through to /admin/pipeline?stage=<slug>.
 */
export function PipelineFunnelCard({ stages }: Props) {
  const total = stages.reduce((s, x) => s + x.count, 0);

  return (
    <section className="glass rounded-xl p-6">
      <header className="flex items-baseline justify-between mb-5">
        <div>
          <h2 className="font-[family-name:var(--font-heading)] text-lg font-semibold text-white">
            Pipeline Funnel
          </h2>
          <p className="text-xs text-white/40 mt-0.5">
            {total.toLocaleString()} {total === 1 ? "person" : "persons"} · click a stage to drill in
          </p>
        </div>
        <Link
          href="/admin/pipeline"
          className="text-xs text-white/50 hover:text-white transition-colors"
        >
          View pipeline →
        </Link>
      </header>

      {total === 0 ? (
        <p className="text-sm text-white/40 py-8 text-center">No contacts yet.</p>
      ) : (
        <>
          {/* Visual bar */}
          <div className="flex w-full h-9 rounded-lg overflow-hidden ring-1 ring-white/[0.04]">
            {stages.map((stage) => {
              if (stage.count === 0) return null;
              const pct = (stage.count / total) * 100;
              return (
                <Link
                  key={stage.slug}
                  href={`/admin/pipeline?stage=${stage.slug}`}
                  className={cn(
                    stage.color,
                    "relative flex items-center justify-center text-xs font-medium text-white",
                    "transition-all duration-200 hover:brightness-110 min-w-[32px]",
                  )}
                  style={{ width: `${pct}%` }}
                  title={`${stage.label}: ${stage.count} (${pct.toFixed(1)}%)`}
                >
                  {pct > 6 && (
                    <span className="truncate px-1 tabular-nums">
                      {stage.count.toLocaleString()}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>

          {/* Per-stage tiles */}
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
            {stages.map((stage) => {
              const pct = total > 0 ? (stage.count / total) * 100 : 0;
              return (
                <Link
                  key={stage.slug}
                  href={`/admin/pipeline?stage=${stage.slug}`}
                  className={cn(
                    "group rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5",
                    "hover:bg-white/[0.05] hover:border-white/[0.12] transition-all duration-200",
                  )}
                >
                  <div className="flex items-center gap-1.5">
                    <span className={cn("w-1.5 h-1.5 rounded-full", stage.color)} />
                    <span className="text-[11px] uppercase tracking-wide text-white/50 group-hover:text-white/70 truncate">
                      {stage.label}
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-baseline gap-1.5">
                    <span className="font-[family-name:var(--font-heading)] text-xl font-semibold text-white tabular-nums">
                      {stage.count.toLocaleString()}
                    </span>
                    <span className="text-[10px] text-white/30 tabular-nums">
                      {pct.toFixed(0)}%
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
