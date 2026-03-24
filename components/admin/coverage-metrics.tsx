interface CoverageMetricsProps {
  enrichedContactPct: number; // 0-100
  avgIcp: number | null;
  totalSignals: number;
}

function metricColor(value: number, thresholds: { high: number; mid: number }) {
  if (value >= thresholds.high)
    return "bg-green-500/10 text-green-400 border-green-500/20";
  if (value >= thresholds.mid)
    return "bg-yellow-500/10 text-yellow-400 border-yellow-500/20";
  return "bg-gray-500/10 text-gray-400 border-gray-500/20";
}

export function CoverageMetrics({
  enrichedContactPct,
  avgIcp,
  totalSignals,
}: CoverageMetricsProps) {
  const pctColor = metricColor(enrichedContactPct, { high: 80, mid: 50 });
  const icpColor = avgIcp !== null
    ? metricColor(avgIcp, { high: 90, mid: 75 })
    : "bg-gray-500/10 text-gray-400 border-gray-500/20";

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border ${pctColor}`}
        title="Enriched contact coverage"
      >
        <span>👤</span> {Math.round(enrichedContactPct)}%
      </span>
      <span
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border ${icpColor}`}
        title="Average ICP score"
      >
        <span>📊</span> {avgIcp !== null ? Math.round(avgIcp) : "—"}
      </span>
      <span
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border bg-gray-500/10 text-gray-400 border-gray-500/20"
        title="Total signals"
      >
        <span>📡</span> {totalSignals}
      </span>
    </div>
  );
}
