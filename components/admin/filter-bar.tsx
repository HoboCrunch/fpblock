"use client";

import { cn } from "@/lib/utils";
import { GlassSelect } from "@/components/ui/glass-select";

export interface FilterConfig {
  key: string;
  placeholder: string;
  options: { value: string; label: string }[];
}

interface FilterBarProps {
  filters: FilterConfig[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  className?: string;
}

export function FilterBar({
  filters,
  values,
  onChange,
  className,
}: FilterBarProps) {
  return (
    <div className={cn("flex flex-wrap items-center gap-3", className)}>
      {filters.map((filter) => (
        <div key={filter.key} className="w-44">
          <GlassSelect
            options={filter.options}
            placeholder={filter.placeholder}
            value={values[filter.key] || ""}
            onChange={(e) => onChange(filter.key, e.target.value)}
          />
        </div>
      ))}
    </div>
  );
}
