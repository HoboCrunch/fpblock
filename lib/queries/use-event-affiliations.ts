"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import {
  getPersonIdsForEvent,
  getPersonIdsForEvents,
  getPersonRelationsForEvent,
  type EventPersonRelation,
} from "./event-persons";
import { queryKeys } from "./query-keys";

export function useEventPersonIds(
  eventId: string | null,
  relation: EventPersonRelation | null
) {
  return useQuery({
    queryKey: queryKeys.eventAffiliations.personIdsForEvent(eventId ?? "", relation ?? "none"),
    queryFn: async () => {
      if (!eventId || !relation) return [] as string[];
      const supabase = createClient();
      return getPersonIdsForEvent(supabase, eventId, relation);
    },
    enabled: eventId !== null && relation !== null,
  });
}

export function useEventsPersonIds(
  eventIds: string[] | null,
  relation: EventPersonRelation | null
) {
  const safeIds = eventIds ?? [];
  return useQuery({
    queryKey: queryKeys.eventAffiliations.personIdsForEvents(safeIds, relation ?? "none"),
    queryFn: async () => {
      if (safeIds.length === 0 || !relation) return [] as string[];
      const supabase = createClient();
      return getPersonIdsForEvents(supabase, safeIds, relation);
    },
    enabled: safeIds.length > 0 && relation !== null,
  });
}

export function useEventRelationMap(eventId: string | null) {
  const supabase = createClient();

  return useQuery({
    queryKey: queryKeys.eventAffiliations.byEvent(eventId ?? ""),
    queryFn: async () => {
      if (!eventId) return new Map<string, { direct: boolean; viaOrgIds: string[] }>();
      return getPersonRelationsForEvent(supabase, eventId);
    },
    enabled: eventId !== null,
  });
}
