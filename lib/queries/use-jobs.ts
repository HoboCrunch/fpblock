"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "./query-keys";
import { CHILD_JOB_TYPES, type Job } from "@/lib/jobs/types";
import { isActiveStatus, deriveDisplayStatus } from "@/lib/jobs/status";

const CHILD_JOB_TYPES_EXCLUDE = `(${CHILD_JOB_TYPES.join(",")})`;

export function useJobs() {
  const supabase = createClient();

  return useQuery({
    queryKey: queryKeys.jobs.all,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("job_log")
        .select(
          "id, job_type, target_table, target_id, parent_job_id, status, label, phase, progress_total, progress_completed, progress_failed, error, metadata, created_at, updated_at"
        )
        .not("job_type", "in", CHILD_JOB_TYPES_EXCLUDE)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data as Job[]) ?? [];
    },
    refetchInterval: (query) => {
      const jobs = query.state.data ?? [];
      const hasActive = jobs.some((j) =>
        isActiveStatus(deriveDisplayStatus(j as Job))
      );
      return hasActive ? 4000 : false;
    },
  });
}
