"use client";

import { X } from "lucide-react";

interface ActiveFilter {
  key: string;
  label: string;
  value: string;
}

interface ActiveFiltersProps {
  filters: ActiveFilter[];
  onRemove: (key: string) => void;
  onClearAll: () => void;
}

export function ActiveFilters({ filters, onRemove, onClearAll }: ActiveFiltersProps) {
  if (filters.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {filters.map((f) => (
        <span
          key={f.key}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-white/[0.06] text-[var(--text-secondary)] border border-white/[0.08] max-w-[220px]"
          title={`${f.label}: ${f.value}`}
        >
          <span className="truncate">
            <span className="text-[var(--text-muted)]">{f.label}:</span> {f.value}
          </span>
          <button
            onClick={() => onRemove(f.key)}
            className="hover:text-white shrink-0"
            aria-label={`Remove ${f.label} filter`}
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}
      <button
        onClick={onClearAll}
        className="text-[11px] text-[var(--text-muted)] hover:text-white px-1"
      >
        Clear all
      </button>
    </div>
  );
}
