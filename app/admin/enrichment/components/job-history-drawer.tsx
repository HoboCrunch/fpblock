"use client";

import React from "react";
import { ChevronUp, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { JobHistory } from "./job-history";
import type { ComponentProps } from "react";

type JobHistoryProps = ComponentProps<typeof JobHistory>;

export interface JobHistoryDrawerProps extends JobHistoryProps {
  open: boolean;
  onToggle: () => void;
}

export const JobHistoryDrawer = React.memo(function JobHistoryDrawer({
  open,
  onToggle,
  jobs,
  activeJobId,
  viewingJobId,
  onSelectJob,
}: JobHistoryDrawerProps) {
  return (
    <div
      className={cn(
        "hidden lg:flex fixed bottom-0 right-6 z-30 flex-col bg-[#0f0f13] border border-white/[0.06] border-b-0 rounded-t-lg shadow-2xl transition-all duration-300 ease-out",
        open ? "h-[40vh] w-[420px]" : "h-8 w-[200px]"
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center justify-between px-3 h-8 shrink-0 text-xs text-[var(--text-muted)] hover:text-white transition-colors"
      >
        <span>History · {jobs.length} job{jobs.length !== 1 ? "s" : ""}</span>
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
      </button>
      {open && (
        <div className="flex-1 min-h-0 overflow-hidden p-2">
          <JobHistory
            jobs={jobs}
            activeJobId={activeJobId}
            viewingJobId={viewingJobId}
            onSelectJob={onSelectJob}
          />
        </div>
      )}
    </div>
  );
});

JobHistoryDrawer.displayName = "JobHistoryDrawer";
