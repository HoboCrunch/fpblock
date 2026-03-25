"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "./query-keys";

export interface DashboardStats {
  organizations: number;
  persons: number;
  totalInteractions: number;
  repliedCount: number;
  statusCounts: Record<string, number>;
}

export function useDashboardStats() {
  const supabase = createClient();

  return useQuery({
    queryKey: queryKeys.dashboard.stats,
    queryFn: async () => {
      const [
        { count: personCount, error: personErr },
        { count: orgCount, error: orgErr },
        { data: interactionCounts, error: rpcErr },
      ] = await Promise.all([
        supabase.from("persons").select("id", { count: "exact", head: true }),
        supabase
          .from("organizations")
          .select("id", { count: "exact", head: true }),
        supabase.rpc("interaction_status_counts"),
      ]);

      if (personErr) throw personErr;
      if (orgErr) throw orgErr;
      if (rpcErr) throw rpcErr;

      const statusCounts: Record<string, number> = {};
      if (interactionCounts) {
        for (const row of interactionCounts as {
          status: string;
          count: number;
        }[]) {
          statusCounts[row.status] = Number(row.count);
        }
      }

      const totalInteractions = Object.values(statusCounts).reduce(
        (sum, v) => sum + v,
        0,
      );
      const repliedCount = statusCounts["replied"] ?? 0;

      return {
        organizations: orgCount ?? 0,
        persons: personCount ?? 0,
        totalInteractions,
        repliedCount,
        statusCounts,
      } satisfies DashboardStats;
    },
  });
}
