"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { queryKeys } from "./query-keys";
import type { Organization } from "@/lib/types/database";

export interface UseOrganizationsParams {
  category?: string;
  enrichmentStatus?: string;
  search?: string;
}

export function useOrganizations(params?: UseOrganizationsParams) {
  const supabase = createClient();

  return useQuery({
    queryKey: queryKeys.organizations.list(params as Record<string, unknown>),
    queryFn: async () => {
      const { data } = await fetchAll<Organization>(
        supabase,
        "organizations",
        "*",
        {
          order: { column: "name", ascending: true },
          filters: params
            ? (query) => {
                let q = query;
                if (params.category) {
                  q = q.eq("category", params.category);
                }
                if (params.enrichmentStatus) {
                  q = q.eq("enrichment_status", params.enrichmentStatus);
                }
                if (params.search) {
                  q = q.ilike("name", `%${params.search}%`);
                }
                return q;
              }
            : undefined,
        },
      );
      return data;
    },
  });
}
