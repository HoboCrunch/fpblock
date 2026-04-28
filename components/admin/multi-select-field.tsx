"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface MultiSelectOption {
  value: string;
  label: string;
}

interface MultiSelectFieldProps {
  placeholder: string;
  options: MultiSelectOption[];
  values: string[];
  onChange: (values: string[]) => void;
  className?: string;
}

export function MultiSelectField({
  placeholder,
  options,
  values,
  onChange,
  className,
}: MultiSelectFieldProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const display =
    values.length === 0
      ? placeholder
      : values.length === 1
      ? options.find((o) => o.value === values[0])?.label ?? values[0]
      : `${values.length} selected`;

  const toggle = (value: string) => {
    if (values.includes(value)) onChange(values.filter((v) => v !== value));
    else onChange([...values, value]);
  };

  return (
    <div ref={ref} className={cn("relative", className)}>
      <div
        className={cn(
          "w-full flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm",
          "bg-[var(--glass-bg)] border border-[var(--glass-border)]",
          "hover:bg-white/[0.04] transition-colors cursor-pointer",
          values.length === 0 && "text-[var(--text-muted)]"
        )}
      >
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="truncate text-left flex-1 bg-transparent border-0 p-0 text-sm cursor-pointer text-inherit"
        >
          {display}
        </button>
        {values.length > 0 ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChange([]);
            }}
            className="text-[var(--text-muted)] hover:text-white shrink-0"
            aria-label="Clear selection"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="shrink-0 bg-transparent border-0 p-0 cursor-pointer"
            tabIndex={-1}
            aria-hidden="true"
          >
            <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" />
          </button>
        )}
      </div>

      {open && (
        <div className="absolute z-20 left-0 right-0 mt-1 max-h-64 overflow-y-auto rounded-lg border border-[var(--glass-border)] bg-[var(--glass-bg)] backdrop-blur-md shadow-lg">
          {options.length === 0 ? (
            <div className="px-3 py-2 text-xs text-[var(--text-muted)]">No options</div>
          ) : (
            options.map((opt) => {
              const selected = values.includes(opt.value);
              return (
                <button
                  type="button"
                  key={opt.value}
                  onClick={() => toggle(opt.value)}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left",
                    "hover:bg-white/[0.04]",
                    selected && "text-[var(--accent-orange)]"
                  )}
                >
                  <span
                    className={cn(
                      "w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0",
                      selected
                        ? "bg-[var(--accent-orange)]/20 border-[var(--accent-orange)]/60"
                        : "border-white/20"
                    )}
                  >
                    {selected && <Check className="w-2.5 h-2.5" />}
                  </span>
                  <span className="truncate">{opt.label}</span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
