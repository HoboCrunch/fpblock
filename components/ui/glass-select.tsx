"use client";

import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";
import { forwardRef } from "react";

interface GlassSelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {
  options: { value: string; label: string }[];
  placeholder?: string;
}

export const GlassSelect = forwardRef<HTMLSelectElement, GlassSelectProps>(
  ({ className, options, placeholder, ...props }, ref) => {
    return (
      <div className="relative">
        <select
          ref={ref}
          className={cn(
            "w-full appearance-none rounded-lg font-[family-name:var(--font-body)]",
            "bg-[var(--glass-bg)] border border-[var(--glass-border)]",
            "backdrop-blur-xl text-white",
            "px-3 py-2 pr-9 text-sm transition-all duration-200",
            "focus:outline-none focus:ring-2 focus:ring-[var(--accent-orange)]/40 focus:border-[var(--accent-orange)]/50",
            "hover:bg-[var(--glass-bg-hover)] hover:border-[var(--glass-border-hover)]",
            className
          )}
          {...props}
        >
          {placeholder && (
            <option value="" className="bg-[#0f0f13]">
              {placeholder}
            </option>
          )}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value} className="bg-[#0f0f13]">
              {opt.label}
            </option>
          ))}
        </select>
        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-muted)] pointer-events-none" />
      </div>
    );
  }
);

GlassSelect.displayName = "GlassSelect";
