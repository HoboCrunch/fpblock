import Link from "next/link";
import { Users, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface EnrichmentBlock {
  total: number;
  complete: number;
  partial?: number;
  in_progress: number;
  failed: number;
  none: number;
}

export interface EnrichmentCoverageData {
  persons: EnrichmentBlock;
  organizations: EnrichmentBlock;
}

interface Props {
  data: EnrichmentCoverageData;
}

export function EnrichmentCoverage({ data }: Props) {
  return (
    <section className="glass rounded-xl p-6 h-full flex flex-col">
      <header className="mb-4">
        <h2 className="font-[family-name:var(--font-heading)] text-lg font-semibold text-white">
          Enrichment coverage
        </h2>
        <p className="text-xs text-white/40 mt-0.5">
          % of records with complete data
        </p>
      </header>

      <div className="flex-1 grid grid-cols-1 gap-5">
        <CoverageRow
          label="Persons"
          icon={Users}
          block={data.persons}
          href="/admin/persons"
        />
        <CoverageRow
          label="Organizations"
          icon={Building2}
          block={data.organizations}
          href="/admin/organizations"
        />
      </div>
    </section>
  );
}

function CoverageRow({
  label,
  icon: Icon,
  block,
  href,
}: {
  label: string;
  icon: typeof Users;
  block: EnrichmentBlock;
  href: string;
}) {
  const partial = block.partial || 0;
  const enriched = block.complete + partial;
  const enrichedPct = block.total > 0 ? (enriched / block.total) * 100 : 0;
  const inProgressPct =
    block.total > 0 ? (block.in_progress / block.total) * 100 : 0;
  const failedPct = block.total > 0 ? (block.failed / block.total) * 100 : 0;
  const nonePct = block.total > 0 ? (block.none / block.total) * 100 : 0;

  return (
    <Link
      href={href}
      className="group block rounded-lg hover:bg-white/[0.03] transition-colors px-2 -mx-2 py-1.5"
    >
      <div className="flex items-baseline justify-between mb-2">
        <div className="flex items-center gap-2">
          <Icon className="h-3.5 w-3.5 text-white/40" />
          <span className="text-sm text-white/75">{label}</span>
          <span className="text-xs text-white/30 tabular-nums">
            {block.total.toLocaleString()}
          </span>
        </div>
        <span className="font-[family-name:var(--font-heading)] text-base font-semibold text-emerald-400 tabular-nums">
          {enrichedPct.toFixed(0)}%
        </span>
      </div>

      <div className="flex h-1.5 w-full rounded-full overflow-hidden bg-white/[0.04]">
        {enrichedPct > 0 && (
          <div
            className="bg-emerald-500"
            style={{ width: `${enrichedPct}%` }}
            title={`Complete: ${block.complete}${partial ? ` · Partial: ${partial}` : ""}`}
          />
        )}
        {inProgressPct > 0 && (
          <div
            className="bg-[var(--accent-indigo)] animate-pulse"
            style={{ width: `${inProgressPct}%` }}
            title={`In progress: ${block.in_progress}`}
          />
        )}
        {failedPct > 0 && (
          <div
            className="bg-rose-500"
            style={{ width: `${failedPct}%` }}
            title={`Failed: ${block.failed}`}
          />
        )}
        {nonePct > 0 && (
          <div
            className="bg-white/[0.08]"
            style={{ width: `${nonePct}%` }}
            title={`Not enriched: ${block.none}`}
          />
        )}
      </div>

      <div className="mt-2 flex items-center gap-4 text-[11px] text-white/40 tabular-nums">
        <Legend dot="bg-emerald-500" label="Complete" value={block.complete + partial} />
        {block.in_progress > 0 && (
          <Legend dot="bg-[var(--accent-indigo)]" label="Running" value={block.in_progress} />
        )}
        {block.failed > 0 && (
          <Legend dot="bg-rose-500" label="Failed" value={block.failed} />
        )}
        {block.none > 0 && (
          <Legend dot="bg-white/30" label="None" value={block.none} />
        )}
      </div>
    </Link>
  );
}

function Legend({
  dot,
  label,
  value,
}: {
  dot: string;
  label: string;
  value: number;
}) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn("w-1.5 h-1.5 rounded-full", dot)} />
      <span>
        {label}{" "}
        <span className="text-white/60">{value.toLocaleString()}</span>
      </span>
    </span>
  );
}
