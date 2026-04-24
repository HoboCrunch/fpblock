"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

/**
 * Returns a map of organization_id -> count of distinct events that
 * organization has propagated persons into via enrichment
 * (i.e. rows in person_event_affiliations where via_organization_id = orgId).
 */
export function useOrgEventPropagation() {
  return useQuery({
    queryKey: ["org-event-propagation"],
    queryFn: async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("person_event_affiliations")
        .select("via_organization_id, event_id");
      const byOrg: Record<string, Set<string>> = {};
      for (const row of (data ?? []) as Array<{
        via_organization_id: string | null;
        event_id: string;
      }>) {
        if (!row.via_organization_id) continue;
        (byOrg[row.via_organization_id] ??= new Set()).add(row.event_id);
      }
      return Object.fromEntries(
        Object.entries(byOrg).map(([k, v]) => [k, v.size])
      ) as Record<string, number>;
    },
  });
}
