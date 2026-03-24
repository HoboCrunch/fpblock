"use client";

import { useState } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface TwoPanelLayoutProps {
  title: string;
  actions?: React.ReactNode;
  sidebar: React.ReactNode;
  children: React.ReactNode;
}

export function TwoPanelLayout({ title, actions, sidebar, children }: TwoPanelLayoutProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div>
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">{title}</h1>
        <div className="flex items-center gap-3">
          {actions}
          {/* Mobile drawer toggle */}
          <button
            onClick={() => setDrawerOpen(true)}
            className="lg:hidden p-2 rounded-lg glass hover:bg-white/[0.05]"
          >
            <SlidersHorizontal className="w-5 h-5 text-[var(--text-muted)]" />
          </button>
        </div>
      </div>

      {/* Two-panel layout */}
      <div className="flex gap-6">
        {/* Center panel */}
        <div className="flex-1 min-w-0">
          {children}
        </div>

        {/* Desktop sidebar */}
        <aside className="hidden lg:block w-[320px] xl:w-[360px] flex-shrink-0">
          <div className="sticky top-4 max-h-[calc(100vh-6rem)] overflow-y-auto space-y-4 scrollbar-thin">
            {sidebar}
          </div>
        </aside>
      </div>

      {/* Mobile drawer */}
      {drawerOpen && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setDrawerOpen(false)} />
          <div className="fixed right-0 top-0 h-full w-[340px] max-w-[85vw] z-50 lg:hidden bg-[#0f0f13] border-l border-[var(--glass-border)] overflow-y-auto p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">Filters</h2>
              <button onClick={() => setDrawerOpen(false)} className="p-1 rounded hover:bg-white/[0.05]">
                <X className="w-5 h-5 text-[var(--text-muted)]" />
              </button>
            </div>
            {sidebar}
          </div>
        </>
      )}
    </div>
  );
}
