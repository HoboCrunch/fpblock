"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { queryKeys } from "./query-keys";

export interface MessageFilters {
  status?: string[];
  step?: number;
  search?: string;
  scheduledFrom?: string;
  scheduledTo?: string;
}

export interface SequenceMessage {
  id: string;
  person_id: string | null;
  person_name: string | null;
  person_title: string | null;
  person_org: string | null;
  sequence_step: number | null;
  subject: string | null;
  body: string | null;
  status: string;
  scheduled_at: string | null;
  occurred_at: string | null;
  detail: Record<string, unknown> | null;
}

type InteractionWithPerson = {
  id: string;
  person_id: string | null;
  sequence_step: number | null;
  subject: string | null;
  body: string | null;
  status: string;
  scheduled_at: string | null;
  occurred_at: string | null;
  detail: Record<string, unknown> | null;
  persons: {
    full_name: string;
    title: string | null;
  } | null;
};

export function useSequenceMessages(sequenceId: string, filters: MessageFilters = {}) {
  const supabase = createClient();

  return useQuery({
    queryKey: queryKeys.sequences.messages.list(sequenceId, filters as Record<string, unknown>),
    enabled: !!sequenceId,
    refetchInterval: (query) => {
      const msgs = (query.state.data as SequenceMessage[]) ?? [];
      const hasPending = msgs.some(
        (m) => m.status === "sending" || m.status === "scheduled"
      );
      return hasPending ? 10_000 : false;
    },
    queryFn: async (): Promise<SequenceMessage[]> => {
      const { data } = await fetchAll<InteractionWithPerson>(
        supabase,
        "interactions",
        "id,person_id,sequence_step,subject,body,status,scheduled_at,occurred_at,detail,persons(full_name,title)",
        {
          order: { column: "scheduled_at", ascending: true },
          filters: (q) => {
            let query = q.eq("sequence_id", sequenceId);

            if (filters.status && filters.status.length > 0) {
              query = query.in("status", filters.status);
            }
            if (filters.step !== undefined) {
              query = query.eq("sequence_step", filters.step);
            }
            if (filters.scheduledFrom) {
              query = query.gte("scheduled_at", filters.scheduledFrom);
            }
            if (filters.scheduledTo) {
              query = query.lte("scheduled_at", filters.scheduledTo);
            }

            return query;
          },
        }
      );

      let messages: SequenceMessage[] = data.map((row) => ({
        id: row.id,
        person_id: row.person_id,
        person_name: row.persons?.full_name ?? null,
        person_title: row.persons?.title ?? null,
        person_org: null, // not available without additional join
        sequence_step: row.sequence_step,
        subject: row.subject,
        body: row.body,
        status: row.status,
        scheduled_at: row.scheduled_at,
        occurred_at: row.occurred_at,
        detail: row.detail,
      }));

      // Client-side search filter on person_name and subject
      if (filters.search) {
        const term = filters.search.toLowerCase();
        messages = messages.filter(
          (m) =>
            (m.person_name?.toLowerCase().includes(term) ?? false) ||
            (m.subject?.toLowerCase().includes(term) ?? false)
        );
      }

      return messages;
    },
  });
}
