"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "./query-keys";
import type { Job } from "@/lib/jobs/types";

export function useJobChildren(parentJobId: string | null) {
  const supabase = createClient();

  return useQuery({
    queryKey: queryKeys.jobs.children(parentJobId ?? "none"),
    enabled: !!parentJobId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("job_log")
        .select(
          "id, job_type, target_table, target_id, parent_job_id, status, label, phase, progress_total, progress_completed, progress_failed, error, metadata, created_at, updated_at"
        )
        .eq("parent_job_id", parentJobId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data as Job[]) ?? [];
    },
    refetchInterval: 2000,
  });
}
