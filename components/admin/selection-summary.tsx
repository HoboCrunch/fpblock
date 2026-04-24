"use client";

interface SelectionSummaryProps {
  count: number;
  stats: string;
  actions: React.ReactNode;
}

export function SelectionSummary({ count, stats, actions }: SelectionSummaryProps) {
  if (count === 0) return null;

  return (
    <div className="glass rounded-lg p-3 flex flex-col gap-1.5">
      <span className="text-sm text-white">
        <strong>{count}</strong> selected{stats ? ` · ${stats}` : ""}
      </span>
      <div className="flex items-center flex-nowrap gap-1.5">{actions}</div>
    </div>
  );
}
