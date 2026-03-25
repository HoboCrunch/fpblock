"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "./query-keys";

// TODO: No saved_lists table references found in the codebase yet.
// Update the select columns and return type once the table schema is defined.
export interface SavedList {
  id: string;
  name: string;
  description: string | null;
  filter_criteria: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export function useSavedLists() {
  const supabase = createClient();

  return useQuery({
    queryKey: queryKeys.savedLists.all,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("saved_lists")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as SavedList[]) ?? [];
    },
  });
}
