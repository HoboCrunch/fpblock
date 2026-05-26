"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useJobs } from "@/lib/queries/use-jobs";
import { deriveDisplayStatus, isActiveStatus } from "@/lib/jobs/status";
import { toast, ToastViewport } from "@/components/ui/toast";
import type { Job, JobStatus } from "@/lib/jobs/types";
import { ProcessDetailsDrawer } from "./process-details-drawer";

// ---------- context ----------

interface ProcessDetailsContextValue {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
  expandedJobId: string | null;
  setExpandedJobId: React.Dispatch<React.SetStateAction<string | null>>;
  openJob: (jobId: string) => void;
  jobs: Job[];
}

const ProcessDetailsContext = createContext<ProcessDetailsContextValue | null>(
  null
);

export function useProcessDetails(): ProcessDetailsContextValue {
  const ctx = useContext(ProcessDetailsContext);
  if (!ctx) {
    throw new Error(
      "useProcessDetails must be used within a ProcessDetailsProvider"
    );
  }
  return ctx;
}

// ---------- toast watcher ----------

/**
 * Tracks job statuses seen during this session so we can detect transitions.
 * Only toasts for jobs that were *actively processing this session* and then
 * reach a terminal state — never on first load.
 */
function useJobToasts(
  jobs: Job[],
  openJob: (jobId: string) => void
) {
  /**
   * seenStatuses: map of jobId → last status we observed (only set after the
   * first render pass so we don't back-fill). The first-load guard is a simple
   * boolean ref.
   */
  const firstLoadDone = useRef(false);
  const seenStatuses = useRef<Map<string, JobStatus>>(new Map());

  useEffect(() => {
    if (jobs.length === 0) return;

    // On the very first render with real data: record existing statuses as
    // "known terminal" to avoid toast spam, then mark first-load done.
    if (!firstLoadDone.current) {
      for (const job of jobs) {
        seenStatuses.current.set(job.id, job.status);
      }
      firstLoadDone.current = true;
      return;
    }

    // Subsequent renders: diff against seenStatuses.
    for (const job of jobs) {
      const prev = seenStatuses.current.get(job.id);
      const displayStatus = deriveDisplayStatus(job);

      if (prev === undefined) {
        // Brand-new job that appeared this session — record it.
        seenStatuses.current.set(job.id, displayStatus);
        // Will be picked up as "was active" on a future render when it
        // completes. No toast yet.
        continue;
      }

      const wasActive = isActiveStatus(prev);
      const isNowTerminal =
        displayStatus === "completed" || displayStatus === "failed";

      if (wasActive && isNowTerminal && prev !== displayStatus) {
        const label = job.label ?? job.job_type.replace(/_/g, " ");
        if (displayStatus === "completed") {
          toast.success(`Completed: ${label}`, () => openJob(job.id));
        } else {
          toast.error(`Failed: ${label}`, () => openJob(job.id));
        }
      }

      // Update seen status.
      seenStatuses.current.set(job.id, displayStatus);
    }
  }, [jobs, openJob]);
}

// ---------- auto-surface watcher ----------

/**
 * When a NEW job id appears with an active display-status, open the drawer.
 */
function useAutoSurface(
  jobs: Job[],
  setOpen: React.Dispatch<React.SetStateAction<boolean>>
) {
  const seenIds = useRef<Set<string>>(new Set());
  const firstLoadDone = useRef(false);

  useEffect(() => {
    if (jobs.length === 0) return;

    // On first load: register existing ids without opening the drawer.
    if (!firstLoadDone.current) {
      for (const job of jobs) {
        seenIds.current.add(job.id);
      }
      firstLoadDone.current = true;
      return;
    }

    // Subsequent polls: look for newly seen ids that are active.
    for (const job of jobs) {
      if (!seenIds.current.has(job.id)) {
        seenIds.current.add(job.id);
        const displayStatus = deriveDisplayStatus(job);
        if (isActiveStatus(displayStatus)) {
          setOpen(true);
        }
      }
    }
  }, [jobs, setOpen]);
}

// ---------- provider ----------

export function ProcessDetailsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);

  const { data: jobs = [] } = useJobs();

  const openJob = useCallback(
    (jobId: string) => {
      setOpen(true);
      setExpandedJobId(jobId);
    },
    []
  );

  useJobToasts(jobs, openJob);
  useAutoSurface(jobs, setOpen);

  const value: ProcessDetailsContextValue = {
    open,
    setOpen,
    expandedJobId,
    setExpandedJobId,
    openJob,
    jobs,
  };

  return (
    <ProcessDetailsContext.Provider value={value}>
      {children}
      <ProcessDetailsDrawer />
      <ToastViewport />
    </ProcessDetailsContext.Provider>
  );
}
