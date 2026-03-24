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
    <div className="flex flex-wrap items-center gap-2">
      {filters.map((f) => (
        <span
          key={f.key}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-[var(--accent-orange)]/10 text-[var(--accent-orange)] border border-[var(--accent-orange)]/20"
        >
          {f.label}: {f.value}
          <button onClick={() => onRemove(f.key)} className="hover:text-white ml-0.5">
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}
      {filters.length > 2 && (
        <button onClick={onClearAll} className="text-xs text-[var(--text-muted)] hover:text-white ml-1">
          Clear all
        </button>
      )}
    </div>
  );
}
