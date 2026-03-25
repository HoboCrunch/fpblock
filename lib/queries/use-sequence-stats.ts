"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { queryKeys } from "./query-keys";

export interface SequenceStats {
  total: number;
  draft: number;
  scheduled: number;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  replied: number;
  bounced: number;
  failed: number;
}

export function useSequenceStats(sequenceId: string) {
  const supabase = createClient();

  return useQuery({
    queryKey: queryKeys.sequences.stats(sequenceId),
    enabled: !!sequenceId,
    queryFn: async (): Promise<SequenceStats> => {
      const { data } = await fetchAll<{ status: string }>(
        supabase,
        "interactions",
        "status",
        {
          filters: (q) => q.eq("sequence_id", sequenceId),
        }
      );

      const counts: Record<string, number> = {};
      for (const row of data) {
        counts[row.status] = (counts[row.status] ?? 0) + 1;
      }

      return {
        total: data.length,
        draft: counts["draft"] ?? 0,
        scheduled: counts["scheduled"] ?? 0,
        sent: counts["sent"] ?? 0,
        delivered: counts["delivered"] ?? 0,
        opened: counts["opened"] ?? 0,
        clicked: counts["clicked"] ?? 0,
        replied: counts["replied"] ?? 0,
        bounced: counts["bounced"] ?? 0,
        failed: counts["failed"] ?? 0,
      };
    },
  });
}
