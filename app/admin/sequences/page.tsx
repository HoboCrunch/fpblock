import { createClient } from "@/lib/supabase/server";
import type { Sequence, Event } from "@/lib/types/database";
import { SequenceListClient } from "./sequence-list-client";

interface SequenceWithCounts extends Sequence {
  enrollment_count: number;
  completed_count: number;
}

export default async function SequencesPage() {
  const supabase = await createClient();

  const { data: sequences } = await supabase
    .from("sequences")
    .select("*")
    .order("created_at", { ascending: false });

  const { data: events } = await supabase
    .from("events")
    .select("*")
    .order("name");

  // Get enrollment counts per sequence
  const { data: enrollments } = await supabase
    .from("sequence_enrollments")
    .select("sequence_id, status");

  const enrollmentMap = new Map<
    string,
    { total: number; completed: number }
  >();
  (enrollments ?? []).forEach((e: { sequence_id: string; status: string }) => {
    const existing = enrollmentMap.get(e.sequence_id) ?? {
      total: 0,
      completed: 0,
    };
    existing.total++;
    if (e.status === "completed") existing.completed++;
    enrollmentMap.set(e.sequence_id, existing);
  });

  const sequencesWithCounts: SequenceWithCounts[] = (
    (sequences as Sequence[]) ?? []
  ).map((s) => {
    const counts = enrollmentMap.get(s.id) ?? { total: 0, completed: 0 };
    return {
      ...s,
      enrollment_count: counts.total,
      completed_count: counts.completed,
    };
  });

  return (
    <SequenceListClient
      sequences={sequencesWithCounts}
      events={(events as Event[]) ?? []}
    />
  );
}
