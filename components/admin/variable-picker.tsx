"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";

const VARIABLE_GROUPS: Record<string, string[]> = {
  person: [
    "first_name",
    "full_name",
    "title",
    "seniority",
    "department",
    "email",
    "linkedin_url",
    "bio",
  ],
  org: [
    "name",
    "category",
    "icp_score",
    "icp_reason",
    "usp",
    "context",
    "website",
  ],
  event: ["name", "date_start", "location"],
  sender: ["name", "email", "signature"],
};

export interface VariablePickerProps {
  onSelect: (variable: string) => void;
  trigger?: "button" | "inline";
  position?: { top: number; left: number };
  onClose?: () => void;
}

export function VariablePicker({
  onSelect,
  trigger = "button",
  position,
  onClose,
}: VariablePickerProps) {
  const [open, setOpen] = useState(trigger === "inline");
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;

    function handlePointerDown(e: PointerEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
        onClose?.();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open, onClose]);

  // Focus search when dropdown opens
  useEffect(() => {
    if (open) {
      setTimeout(() => searchRef.current?.focus(), 0);
    } else {
      setSearch("");
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        onClose?.();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  function handleSelect(group: string, field: string) {
    const token = `{${group}.${field}}`;
    onSelect(token);
    setOpen(false);
    setSearch("");
    onClose?.();
  }

  const query = search.trim().toLowerCase();

  const filteredGroups = Object.entries(VARIABLE_GROUPS).reduce<
    Record<string, string[]>
  >((acc, [group, fields]) => {
    if (!query) {
      acc[group] = fields;
      return acc;
    }
    const matched = fields.filter(
      (field) =>
        field.includes(query) ||
        group.includes(query) ||
        `${group}.${field}`.includes(query)
    );
    if (matched.length > 0) acc[group] = matched;
    return acc;
  }, {});

  const hasResults = Object.keys(filteredGroups).length > 0;

  const dropdown = (
    <div
      className={cn(
        "z-50 w-64 rounded-xl glass border border-white/[0.06]",
        "shadow-xl backdrop-blur-xl",
        trigger === "inline" ? "absolute" : "absolute top-full left-0 mt-1"
      )}
      style={
        trigger === "inline" && position
          ? { top: position.top, left: position.left }
          : undefined
      }
    >
      {/* Search */}
      <div className="p-2 border-b border-white/[0.06]">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-muted)]" />
          <input
            ref={searchRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search variables..."
            className={cn(
              "w-full pl-8 pr-3 py-1.5 rounded-lg text-sm",
              "bg-white/[0.04] border border-white/[0.06]",
              "text-[var(--text-secondary)] placeholder:text-[var(--text-muted)]",
              "focus:outline-none focus:ring-1 focus:ring-[var(--accent-orange)]/40 focus:border-[var(--accent-orange)]/40",
              "transition-all duration-150"
            )}
          />
        </div>
      </div>

      {/* Groups */}
      <div className="max-h-64 overflow-y-auto py-1">
        {hasResults ? (
          Object.entries(filteredGroups).map(([group, fields]) => (
            <div key={group}>
              {/* Group header */}
              <div className="px-3 pt-2 pb-0.5">
                <span className="text-[10px] font-semibold tracking-widest text-[var(--text-muted)] uppercase">
                  {group}
                </span>
              </div>
              {/* Fields */}
              {fields.map((field) => (
                <button
                  key={`${group}.${field}`}
                  onClick={() => handleSelect(group, field)}
                  className={cn(
                    "w-full flex items-center px-3 py-1.5 text-left",
                    "text-[var(--text-secondary)] hover:bg-white/[0.05]",
                    "transition-colors duration-100"
                  )}
                >
                  <span className="font-mono text-xs text-[var(--accent-orange)]">
                    {`{${group}.${field}}`}
                  </span>
                </button>
              ))}
            </div>
          ))
        ) : (
          <p className="px-3 py-4 text-xs text-[var(--text-muted)] text-center">
            No variables match &ldquo;{search}&rdquo;
          </p>
        )}
      </div>
    </div>
  );

  if (trigger === "inline") {
    return (
      <div ref={containerRef} className="relative">
        {dropdown}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium",
          "border border-white/[0.06] bg-white/[0.04]",
          "text-[var(--text-secondary)] hover:bg-white/[0.08] hover:text-white",
          "transition-all duration-150"
        )}
      >
        <span className="font-mono text-[var(--accent-orange)]">{"{}"}</span>
        Insert Variable
        <ChevronDown
          className={cn(
            "h-3 w-3 text-[var(--text-muted)] transition-transform duration-150",
            open && "rotate-180"
          )}
        />
      </button>

      {open && dropdown}
    </div>
  );
}
