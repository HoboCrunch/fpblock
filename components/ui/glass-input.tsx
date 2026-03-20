"use client";

import { cn } from "@/lib/utils";
import { type LucideIcon } from "lucide-react";
import { forwardRef } from "react";

interface GlassInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: LucideIcon;
}

export const GlassInput = forwardRef<HTMLInputElement, GlassInputProps>(
  ({ className, icon: Icon, ...props }, ref) => {
    return (
      <div className="relative">
        {Icon && (
          <Icon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-muted)]" />
        )}
        <input
          ref={ref}
          className={cn(
            "w-full rounded-lg font-[family-name:var(--font-body)]",
            "bg-[var(--glass-bg)] border border-[var(--glass-border)]",
            "backdrop-blur-xl text-white placeholder:text-[var(--text-muted)]",
            "px-3 py-2 text-sm transition-all duration-200",
            "focus:outline-none focus:ring-2 focus:ring-[var(--accent-orange)]/40 focus:border-[var(--accent-orange)]/50",
            "hover:bg-[var(--glass-bg-hover)] hover:border-[var(--glass-border-hover)]",
            Icon && "pl-9",
            className
          )}
          {...props}
        />
      </div>
    );
  }
);

GlassInput.displayName = "GlassInput";
