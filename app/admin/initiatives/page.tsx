import { createClient } from "@/lib/supabase/server";
import type { Initiative, Event } from "@/lib/types/database";
import { InitiativesListClient } from "./initiatives-list-client";
import type { InitiativeRow } from "@/components/admin/initiative-table";

export default async function InitiativesPage() {
  const supabase = await createClient();

  // Fetch all initiatives with nested event
  const { data: initiatives } = await supabase
    .from("initiatives")
    .select("*, event:events(id, name)")
    .order("created_at", { ascending: false });

  // Fetch events for filter dropdown
  const { data: events } = await supabase
    .from("events")
    .select("*")
    .order("name");

  // Fetch enrollment counts per initiative
  const { data: enrollments } = await supabase
    .from("initiative_enrollments")
    .select("initiative_id");

  const enrollmentMap = new Map<string, number>();
  (enrollments ?? []).forEach((e: { initiative_id: string }) => {
    enrollmentMap.set(e.initiative_id, (enrollmentMap.get(e.initiative_id) ?? 0) + 1);
  });

  // Fetch interaction counts per initiative
  const { data: interactions } = await supabase
    .from("interactions")
    .select("initiative_id")
    .not("initiative_id", "is", null);

  const interactionMap = new Map<string, number>();
  (interactions ?? []).forEach((i: { initiative_id: string }) => {
    interactionMap.set(i.initiative_id, (interactionMap.get(i.initiative_id) ?? 0) + 1);
  });

  const initiativesWithCounts: InitiativeRow[] = (
    (initiatives as (Initiative & { event: Pick<Event, "id" | "name"> | null })[]) ?? []
  ).map((init) => ({
    ...init,
    enrollment_count: enrollmentMap.get(init.id) ?? 0,
    interaction_count: interactionMap.get(init.id) ?? 0,
  }));

  return (
    <InitiativesListClient
      initiatives={initiativesWithCounts}
      events={(events as Event[]) ?? []}
    />
  );
}
