"use client";

import { cn } from "@/lib/utils";

interface BaseProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
  onClick?: () => void;
}

const cellBase = "px-[var(--cell-px,0.5rem)] py-[var(--cell-py,0.25rem)] min-w-0 flex items-center";

export function TextCell({ children, className, title }: BaseProps) {
  return (
    <div className={cn(cellBase, className)} title={title}>
      <span className="truncate text-xs">{children}</span>
    </div>
  );
}

export function NumericCell({ children, className }: BaseProps) {
  return (
    <div className={cn(cellBase, "justify-end tabular-nums text-xs", className)}>
      {children}
    </div>
  );
}

export function DateCell({ children, className }: BaseProps) {
  return (
    <div className={cn(cellBase, "whitespace-nowrap text-[10px] text-[var(--text-muted)]", className)}>
      {children}
    </div>
  );
}

export function PillCell({ children, className, title }: BaseProps) {
  return (
    <div
      className={cn(cellBase, "gap-1 overflow-hidden", className)}
      title={title}
    >
      {children}
    </div>
  );
}

export function HeaderCell({ children, className, onClick }: BaseProps) {
  return (
    <div
      className={cn(
        "px-[var(--cell-px,0.5rem)] py-[var(--cell-py-header,0.5rem)] text-[10px] uppercase tracking-wider font-medium text-[var(--text-muted)] flex items-center min-w-0",
        className
      )}
      onClick={onClick}
    >
      {children}
    </div>
  );
}
