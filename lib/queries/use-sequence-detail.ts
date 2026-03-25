"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { queryKeys } from "./query-keys";
import type {
  Sequence,
  SequenceEnrollment,
  Interaction,
  SenderProfile,
} from "@/lib/types/database";

export interface DeliveryStats {
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  replied: number;
  bounced: number;
  failed: number;
}

export interface SequenceEnrollmentWithPerson extends SequenceEnrollment {
  person: {
    id: string;
    full_name: string;
    email: string | null;
    title: string | null;
  } | null;
}

export interface SequenceDetail extends Sequence {
  enrollments: SequenceEnrollmentWithPerson[];
  event_name: string | null;
  initiative_name: string | null;
  sender_profile: SenderProfile | null;
  delivery_stats: DeliveryStats;
  step_stats: Record<number, { sent: number; opened: number; replied: number }>;
}

export function useSequenceDetail(id: string) {
  const supabase = createClient();

  return useQuery({
    queryKey: queryKeys.sequences.detail(id),
    enabled: !!id,
    queryFn: async (): Promise<SequenceDetail> => {
      // Parallel fetch: sequence + enrollments (with person join) + interactions
      const [sequenceResult, enrollmentsResult, interactionsResult] = await Promise.all([
        supabase.from("sequences").select("*").eq("id", id).single(),
        supabase
          .from("sequence_enrollments")
          .select("*, person:persons(id,full_name,email,title)")
          .eq("sequence_id", id),
        fetchAll<Interaction>(supabase, "interactions", "*", {
          filters: (q) => q.eq("sequence_id", id),
        }),
      ]);

      if (sequenceResult.error) {
        throw new Error(`Failed to fetch sequence: ${sequenceResult.error.message}`);
      }

      const sequence = sequenceResult.data as Sequence;
      const enrollments = (enrollmentsResult.data ?? []) as SequenceEnrollmentWithPerson[];
      const interactions = interactionsResult.data;

      // Then parallel fetch: event name, initiative name, sender profile (conditional on FK)
      const [eventResult, initiativeResult, senderResult] = await Promise.all([
        sequence.event_id
          ? supabase.from("events").select("name").eq("id", sequence.event_id).single()
          : Promise.resolve({ data: null, error: null }),
        sequence.initiative_id
          ? supabase.from("initiatives").select("name").eq("id", sequence.initiative_id).single()
          : Promise.resolve({ data: null, error: null }),
        sequence.sender_id
          ? supabase.from("sender_profiles").select("*").eq("id", sequence.sender_id).single()
          : Promise.resolve({ data: null, error: null }),
      ]);

      const event_name = (eventResult.data as { name: string } | null)?.name ?? null;
      const initiative_name = (initiativeResult.data as { name: string } | null)?.name ?? null;
      const sender_profile = (senderResult.data as SenderProfile | null) ?? null;

      // Aggregate delivery stats
      const delivery_stats: DeliveryStats = {
        sent: 0,
        delivered: 0,
        opened: 0,
        clicked: 0,
        replied: 0,
        bounced: 0,
        failed: 0,
      };

      const step_stats: Record<number, { sent: number; opened: number; replied: number }> = {};

      for (const interaction of interactions) {
        const status = interaction.status;

        if (status === "sent" || status === "delivered" || status === "opened" || status === "clicked" || status === "replied") {
          delivery_stats.sent++;
        }
        if (status === "delivered" || status === "opened" || status === "clicked" || status === "replied") {
          delivery_stats.delivered++;
        }
        if (status === "opened" || status === "clicked" || status === "replied") {
          delivery_stats.opened++;
        }
        if (status === "clicked") {
          delivery_stats.clicked++;
        }
        if (status === "replied") {
          delivery_stats.replied++;
        }
        if (status === "bounced") {
          delivery_stats.bounced++;
        }
        if (status === "failed") {
          delivery_stats.failed++;
        }

        // Per-step stats
        if (interaction.sequence_step !== null) {
          const step = interaction.sequence_step;
          if (!step_stats[step]) {
            step_stats[step] = { sent: 0, opened: 0, replied: 0 };
          }
          if (status === "sent" || status === "delivered" || status === "opened" || status === "clicked" || status === "replied") {
            step_stats[step].sent++;
          }
          if (status === "opened" || status === "clicked" || status === "replied") {
            step_stats[step].opened++;
          }
          if (status === "replied") {
            step_stats[step].replied++;
          }
        }
      }

      return {
        ...sequence,
        enrollments,
        event_name,
        initiative_name,
        sender_profile,
        delivery_stats,
        step_stats,
      };
    },
  });
}
