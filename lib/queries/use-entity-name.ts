"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type EntityKind =
  | "events"
  | "persons"
  | "organizations"
  | "lists";

const ENTITY_CONFIG: Record<EntityKind, { table: string; nameColumn: string }> = {
  events: { table: "events", nameColumn: "name" },
  persons: { table: "persons", nameColumn: "full_name" },
  organizations: { table: "organizations", nameColumn: "name" },
  lists: { table: "person_lists", nameColumn: "name" },
};

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export function useEntityName(kind: EntityKind | null, id: string | null) {
  const enabled = Boolean(kind && id && isUuid(id));
  const supabase = createClient();

  return useQuery({
    queryKey: ["entity-name", kind, id],
    enabled,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      if (!kind || !id) return null;
      const cfg = ENTITY_CONFIG[kind];
      const { data, error } = await supabase
        .from(cfg.table)
        .select(cfg.nameColumn)
        .eq("id", id)
        .single();
      if (error) return null;
      const row = data as unknown as Record<string, string | null> | null;
      return row?.[cfg.nameColumn] ?? null;
    },
  });
}
