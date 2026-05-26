"use client";

import { cn } from "@/lib/utils";
import { useState } from "react";

export function Tabs({
  tabs,
  defaultTab,
}: {
  tabs: { id: string; label: string; content: React.ReactNode; action?: React.ReactNode }[];
  defaultTab?: string;
}) {
  const [active, setActive] = useState(defaultTab || tabs[0]?.id);
  const activeTab = tabs.find((t) => t.id === active);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-1 glass rounded-lg p-1 w-fit">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActive(tab.id)}
              className={cn(
                "px-4 py-2 text-sm font-medium transition-all duration-200 rounded-md",
                active === tab.id
                  ? "bg-[var(--accent-orange)]/15 text-[var(--accent-orange)] border border-[var(--accent-orange)]/20"
                  : "text-[var(--text-muted)] hover:text-white border border-transparent"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {activeTab?.action}
      </div>
      {activeTab?.content}
    </div>
  );
}
