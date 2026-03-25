"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "./query-keys";
import type { Event } from "@/lib/types/database";

export function useEvents() {
  const supabase = createClient();

  return useQuery({
    queryKey: queryKeys.events.all,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("*")
        .order("date_start", { ascending: true });
      if (error) throw error;
      return (data as Event[]) ?? [];
    },
  });
}
