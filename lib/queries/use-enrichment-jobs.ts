"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "./query-keys";
import type { JobHistoryJob } from "@/app/admin/enrichment/components/job-history";

export function useEnrichmentJobs() {
  const supabase = createClient();

  return useQuery({
    queryKey: queryKeys.enrichment.jobs.all,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("job_log")
        .select("id, job_type, status, created_at, metadata")
        .in("job_type", [
          "enrichment",
          "enrichment_batch_organizations",
          "enrichment_batch_persons",
          "enrichment_person",
        ])
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data as JobHistoryJob[]) ?? [];
    },
    refetchInterval: (query) => {
      const jobs = query.state.data ?? [];
      const hasProcessing = jobs.some(
        (j) => j.status === "processing" || j.status === "in_progress"
      );
      return hasProcessing ? 5000 : false;
    },
  });
}
