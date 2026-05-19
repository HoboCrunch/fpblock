import Link from "next/link";
import { cn } from "@/lib/utils";

export interface IcpBucket {
  bucket: string;
  count: number;
}

interface Props {
  buckets: IcpBucket[];
}

const BUCKET_META: Record<
  string,
  { label: string; sub: string; color: string; textColor: string }
> = {
  tier1: {
    label: "Tier 1",
    sub: "≥ 90",
    color: "bg-[var(--accent-orange)]",
    textColor: "text-[var(--accent-orange)]",
  },
  qualified: {
    label: "Qualified",
    sub: "75–89",
    color: "bg-[var(--accent-indigo)]",
    textColor: "text-[var(--accent-indigo)]",
  },
  mid: {
    label: "Mid",
    sub: "50–74",
    color: "bg-white/30",
    textColor: "text-white/60",
  },
  low: {
    label: "Low",
    sub: "< 50",
    color: "bg-white/[0.15]",
    textColor: "text-white/40",
  },
  unscored: {
    label: "Unscored",
    sub: "no score",
    color: "bg-white/[0.08]",
    textColor: "text-white/30",
  },
};

const ORDER = ["tier1", "qualified", "mid", "low", "unscored"];

export function IcpDistribution({ buckets }: Props) {
  const map = new Map(buckets.map((b) => [b.bucket, b.count]));
  const ordered = ORDER.map((k) => ({
    key: k,
    meta: BUCKET_META[k],
    count: map.get(k) || 0,
  }));
  const total = ordered.reduce((s, x) => s + x.count, 0);
  const qualifiedPlus = (map.get("tier1") || 0) + (map.get("qualified") || 0);
  const qualifiedPct = total > 0 ? (qualifiedPlus / total) * 100 : 0;

  return (
    <section className="glass rounded-xl p-6 h-full flex flex-col">
      <header className="flex items-baseline justify-between mb-4">
        <div>
          <h2 className="font-[family-name:var(--font-heading)] text-lg font-semibold text-white">
            ICP distribution
          </h2>
          <p className="text-xs text-white/40 mt-0.5">
            {total.toLocaleString()} organizations
          </p>
        </div>
        <div className="text-right">
          <div className="font-[family-name:var(--font-heading)] text-lg font-semibold text-[var(--accent-orange)] tabular-nums leading-none">
            {qualifiedPct.toFixed(0)}%
          </div>
          <div className="text-[10px] uppercase tracking-wider text-white/40 mt-0.5">
            qualified+
          </div>
        </div>
      </header>

      {/* Stacked bar */}
      <div className="flex w-full h-2 rounded-full overflow-hidden bg-white/[0.04]">
        {ordered.map(({ key, meta, count }) => {
          if (count === 0) return null;
          const pct = total > 0 ? (count / total) * 100 : 0;
          return (
            <div
              key={key}
              className={meta.color}
              style={{ width: `${pct}%` }}
              title={`${meta.label}: ${count}`}
            />
          );
        })}
      </div>

      {/* Legend rows */}
      <ul className="mt-4 space-y-1.5 flex-1">
        {ordered.map(({ key, meta, count }) => {
          const pct = total > 0 ? (count / total) * 100 : 0;
          const href =
            key === "tier1"
              ? "/admin/organizations?icp_min=90"
              : key === "qualified"
                ? "/admin/organizations?icp_min=75&icp_max=89"
                : "/admin/organizations";
          return (
            <li key={key}>
              <Link
                href={href}
                className={cn(
                  "flex items-center gap-3 rounded-md px-2 py-1.5",
                  "hover:bg-white/[0.04] transition-colors",
                )}
              >
                <span className={cn("w-2 h-2 rounded-sm shrink-0", meta.color)} />
                <span className="text-sm text-white/75 flex-1">
                  {meta.label}
                  <span className="text-white/30 text-xs ml-2">{meta.sub}</span>
                </span>
                <span className="text-sm text-white/85 tabular-nums">
                  {count.toLocaleString()}
                </span>
                <span className="text-[11px] text-white/40 tabular-nums w-10 text-right">
                  {pct.toFixed(0)}%
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
