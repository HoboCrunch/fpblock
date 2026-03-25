"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { queryKeys } from "./query-keys";
import type { Sequence, SequenceEnrollment, Interaction } from "@/lib/types/database";

export interface SequenceFilters {
  search?: string;
  status?: string[];
  sendMode?: string;
  eventId?: string;
  initiativeId?: string;
  hasEnrollments?: boolean;
}

export interface SequenceWithStats extends Sequence {
  enrollment_count: number;
  active_enrollment_count: number;
  sent_count: number;
  opened_count: number;
  replied_count: number;
  next_send_at: string | null;
  event_name: string | null;
}

export function useSequences(filters: SequenceFilters = {}) {
  const supabase = createClient();

  return useQuery({
    queryKey: queryKeys.sequences.list(filters as Record<string, unknown>),
    queryFn: async (): Promise<SequenceWithStats[]> => {
      // Fetch sequences with server-side filters where possible
      const { data: sequences } = await fetchAll<Sequence>(
        supabase,
        "sequences",
        "*",
        {
          order: { column: "created_at", ascending: false },
          filters: (query) => {
            let q = query;
            if (filters.status && filters.status.length > 0) {
              q = q.in("status", filters.status);
            }
            if (filters.sendMode) {
              q = q.eq("send_mode", filters.sendMode);
            }
            if (filters.eventId) {
              q = q.eq("event_id", filters.eventId);
            }
            if (filters.initiativeId) {
              q = q.eq("initiative_id", filters.initiativeId);
            }
            return q;
          },
        }
      );

      if (sequences.length === 0) return [];

      // Parallel fetch: enrollments + interactions + events
      const sequenceIds = sequences.map((s) => s.id);
      const eventIds = [...new Set(sequences.map((s) => s.event_id).filter(Boolean))] as string[];

      const [enrollmentsResult, interactionsResult, eventsResult] = await Promise.all([
        fetchAll<SequenceEnrollment>(supabase, "sequence_enrollments", "id,sequence_id,status,enrolled_at", {
          filters: (q) => q.in("sequence_id", sequenceIds),
        }),
        fetchAll<Pick<Interaction, "id" | "sequence_id" | "sequence_step" | "status" | "scheduled_at">>(
          supabase,
          "interactions",
          "id,sequence_id,sequence_step,status,scheduled_at",
          {
            filters: (q) => q.in("sequence_id", sequenceIds),
          }
        ),
        eventIds.length > 0
          ? fetchAll<{ id: string; name: string }>(supabase, "events", "id,name", {
              filters: (q) => q.in("id", eventIds),
            })
          : Promise.resolve({ data: [], count: 0 }),
      ]);

      const enrollments = enrollmentsResult.data;
      const interactions = interactionsResult.data;
      const eventMap = new Map(eventsResult.data.map((e) => [e.id, e.name]));

      // Aggregate counts per sequence
      const enrollmentsBySeq = new Map<string, SequenceEnrollment[]>();
      for (const e of enrollments) {
        const arr = enrollmentsBySeq.get(e.sequence_id) ?? [];
        arr.push(e);
        enrollmentsBySeq.set(e.sequence_id, arr);
      }

      const interactionsBySeq = new Map<string, typeof interactions>();
      for (const i of interactions) {
        if (!i.sequence_id) continue;
        const arr = interactionsBySeq.get(i.sequence_id) ?? [];
        arr.push(i);
        interactionsBySeq.set(i.sequence_id, arr);
      }

      let result: SequenceWithStats[] = sequences.map((seq) => {
        const seqEnrollments = enrollmentsBySeq.get(seq.id) ?? [];
        const seqInteractions = interactionsBySeq.get(seq.id) ?? [];

        const enrollment_count = seqEnrollments.length;
        const active_enrollment_count = seqEnrollments.filter((e) => e.status === "active").length;
        const sent_count = seqInteractions.filter((i) => i.status === "sent" || i.status === "delivered" || i.status === "opened" || i.status === "clicked" || i.status === "replied").length;
        const opened_count = seqInteractions.filter((i) => i.status === "opened" || i.status === "clicked" || i.status === "replied").length;
        const replied_count = seqInteractions.filter((i) => i.status === "replied").length;

        // Find next scheduled send
        const scheduled = seqInteractions
          .filter((i) => (i.status === "scheduled" || i.status === "sending") && i.scheduled_at)
          .map((i) => i.scheduled_at as string)
          .sort();
        const next_send_at = scheduled[0] ?? null;

        const event_name = seq.event_id ? (eventMap.get(seq.event_id) ?? null) : null;

        return {
          ...seq,
          enrollment_count,
          active_enrollment_count,
          sent_count,
          opened_count,
          replied_count,
          next_send_at,
          event_name,
        };
      });

      // Client-side filters
      if (filters.search) {
        const term = filters.search.toLowerCase();
        result = result.filter((s) => s.name.toLowerCase().includes(term));
      }

      if (filters.hasEnrollments !== undefined) {
        result = result.filter((s) =>
          filters.hasEnrollments ? s.enrollment_count > 0 : s.enrollment_count === 0
        );
      }

      return result;
    },
  });
}
