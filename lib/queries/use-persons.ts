"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { queryKeys } from "./query-keys";

/** Shape returned by the persons_with_icp view. */
export interface PersonWithIcp {
  id: string;
  full_name: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  linkedin_url: string | null;
  twitter_handle: string | null;
  telegram_handle: string | null;
  phone: string | null;
  title: string | null;
  seniority: string | null;
  department: string | null;
  bio: string | null;
  photo_url: string | null;
  source: string | null;
  enrichment_status: string;
  icp_score: number | null;
  primary_org_name: string | null;
}

export interface UsePersonsParams {
  eventId?: string;
  source?: string;
  seniority?: string;
  enrichmentStatus?: string;
  search?: string;
}

export function usePersons(params?: UsePersonsParams) {
  const supabase = createClient();

  return useQuery({
    queryKey: queryKeys.persons.list(params as Record<string, unknown>),
    queryFn: async () => {
      const { data } = await fetchAll<PersonWithIcp>(
        supabase,
        "persons_with_icp",
        "*",
        {
          order: { column: "full_name", ascending: true },
          filters: params
            ? (query) => {
                let q = query;
                if (params.source) {
                  q = q.eq("source", params.source);
                }
                if (params.seniority) {
                  q = q.eq("seniority", params.seniority);
                }
                if (params.enrichmentStatus) {
                  q = q.eq("enrichment_status", params.enrichmentStatus);
                }
                if (params.search) {
                  q = q.ilike("full_name", `%${params.search}%`);
                }
                return q;
              }
            : undefined,
        },
      );

      // Deduplicate — view may return duplicates if multiple primary org links
      const seen = new Set<string>();
      return data.filter((p) => {
        if (seen.has(p.id)) return false;
        seen.add(p.id);
        return true;
      });
    },
  });
}
