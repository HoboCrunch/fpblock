"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "./query-keys";
import type { Initiative, Event } from "@/lib/types/database";

export type InitiativeWithEvent = Initiative & {
  event: Pick<Event, "id" | "name"> | null;
};

export function useInitiatives() {
  const supabase = createClient();

  return useQuery({
    queryKey: queryKeys.initiatives.all,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("initiatives")
        .select("*, event:events(id, name)")
        .order("name", { ascending: true });
      if (error) throw error;
      return (data as InitiativeWithEvent[]) ?? [];
    },
  });
}
