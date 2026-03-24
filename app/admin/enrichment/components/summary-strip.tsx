"use client";

import { cn } from "@/lib/utils";

// ---------- Types ----------

export interface SummaryStripProps {
  stats: {
    processed: number;
    enriched: number;
    signals?: number;
    avgIcp?: number | null;
    peopleFound?: number;
    newPersons?: number;
  };
  tab: "persons" | "organizations";
}

// ---------- Helpers ----------

interface StatCardProps {
  label: string;
  value: number | string;
  accent?: string;
}

function StatCard({ label, value, accent }: StatCardProps) {
  return (
    <div className="flex flex-col items-center min-w-[60px]">
      <span className="text-[10px] text-[var(--text-muted)] font-[family-name:var(--font-body)] uppercase tracking-wider">
        {label}
      </span>
      <span
        className={cn(
          "text-lg font-semibold font-[family-name:var(--font-heading)] tabular-nums",
          accent ?? "text-white"
        )}
      >
        {value}
      </span>
    </div>
  );
}

// ---------- Component ----------

export function SummaryStrip({ stats, tab }: SummaryStripProps) {
  const showPeopleFinder = stats.peopleFound !== undefined;

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-white/[0.03] border border-white/[0.06] mb-3">
      <StatCard label="Processed" value={stats.processed} />

      <Divider />

      <StatCard
        label="Enriched"
        value={stats.enriched}
        accent="text-[var(--accent-orange)]"
      />

      {tab === "organizations" && stats.signals !== undefined && (
        <>
          <Divider />
          <StatCard
            label="Signals"
            value={stats.signals}
            accent="text-[var(--accent-indigo)]"
          />
        </>
      )}

      {stats.avgIcp !== undefined && stats.avgIcp !== null && (
        <>
          <Divider />
          <StatCard label="Avg ICP" value={Math.round(stats.avgIcp)} />
        </>
      )}

      {showPeopleFinder && (
        <>
          <Divider />
          <StatCard label="People Found" value={stats.peopleFound!} />
        </>
      )}

      {stats.newPersons !== undefined && (
        <>
          <Divider />
          <StatCard
            label="New Persons"
            value={stats.newPersons}
            accent="text-[var(--accent-orange)]"
          />
        </>
      )}
    </div>
  );
}

function Divider() {
  return <div className="w-px h-8 bg-white/[0.08]" />;
}
