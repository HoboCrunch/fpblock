import { createClient } from "@/lib/supabase/server";
import { PipelineView } from "@/components/admin/pipeline-view";
import type { PipelineContact } from "@/lib/types/pipeline";

/**
 * Map raw interaction status to pipeline stage.
 * The pipeline collapses sending/sent/delivered -> "sent"
 * and bounced/failed -> "bounced_failed".
 */
function statusToStage(status: string | null): string {
  if (!status) return "not_contacted";
  switch (status) {
    case "draft":
      return "draft";
    case "scheduled":
      return "scheduled";
    case "sending":
    case "sent":
    case "delivered":
      return "sent";
    case "opened":
      return "opened";
    case "replied":
      return "replied";
    case "bounced":
    case "failed":
      return "bounced_failed";
    default:
      return "not_contacted";
  }
}

/**
 * Status ordering: higher number = more advanced in pipeline.
 */
const STATUS_RANK: Record<string, number> = {
  failed: 0,
  bounced: 1,
  draft: 2,
  scheduled: 3,
  sending: 4,
  sent: 5,
  delivered: 6,
  opened: 7,
  replied: 8,
};

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<{ stage?: string; initiative?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  // Fetch all persons (handle >1000 rows with batched fetching)
  const BATCH = 1000;

  async function fetchAllRows<T = any>(
    table: string,
    select: string,
    filters?: (q: any) => any
  ): Promise<T[]> {
    let all: T[] = [];
    let offset = 0;
    while (true) {
      let q = supabase.from(table).select(select);
      if (filters) q = filters(q);
      q = q.range(offset, offset + BATCH - 1);
      const { data } = await q;
      if (!data || data.length === 0) break;
      all = all.concat(data as T[]);
      if (data.length < BATCH) break;
      offset += BATCH;
    }
    return all;
  }

  const allPersons = await fetchAllRows(
    "persons_with_icp",
    "id, full_name, primary_org_name, icp_score, created_at"
  );

  const allInteractions = await fetchAllRows(
    "interactions",
    "id, person_id, status, channel, event_id, initiative_id, created_at"
  );

  // Fetch initiatives for the filter dropdown
  const { data: initiatives } = await supabase
    .from("initiatives")
    .select("id, name, status")
    .order("name", { ascending: true });

  // Fetch events for the filter dropdown
  const { data: events } = await supabase
    .from("events")
    .select("*")
    .order("date_start", { ascending: false });

  // If initiative filter is active, scope interactions to that initiative
  const initiativeFilter = params.initiative || null;
  const filteredInteractions = initiativeFilter
    ? allInteractions.filter((i: any) => i.initiative_id === initiativeFilter)
    : allInteractions;

  // Build lookup: interactions by person_id
  const interactionsByPerson = new Map<string, typeof filteredInteractions>();
  for (const interaction of filteredInteractions) {
    const existing = interactionsByPerson.get(interaction.person_id) || [];
    existing.push(interaction);
    interactionsByPerson.set(interaction.person_id, existing);
  }

  // Build pipeline contacts
  const pipelineContacts: PipelineContact[] = [];

  if (allPersons) {
    for (const person of allPersons) {
      const interactions = interactionsByPerson.get(person.id) || [];

      // Find most advanced interaction status
      let bestStatus: string | null = null;
      let bestRank = -1;
      let bestChannel: string | null = null;
      let bestEventId: string | null = null;
      let bestInitiativeId: string | null = null;
      let lastUpdated: string | null = null;

      for (const interaction of interactions) {
        const rank = STATUS_RANK[interaction.status] ?? -1;
        if (rank > bestRank) {
          bestRank = rank;
          bestStatus = interaction.status;
          bestChannel = interaction.channel;
          bestEventId = interaction.event_id;
          bestInitiativeId = interaction.initiative_id;
        }
        const interactionDate = interaction.created_at;
        if (!lastUpdated || interactionDate > lastUpdated) {
          lastUpdated = interactionDate;
        }
      }

      // If initiative filter is active and person has no interactions, skip them
      if (initiativeFilter && interactions.length === 0) continue;

      pipelineContacts.push({
        id: person.id,
        full_name: person.full_name,
        company_name: person.primary_org_name || null,
        icp_score: person.icp_score || null,
        channel: bestChannel,
        pipeline_stage: statusToStage(bestStatus),
        last_updated: lastUpdated || person.created_at,
        initiative_id: bestInitiativeId,
        event_id: bestEventId,
        event_name: null,
      });
    }
  }

  return (
    <PipelineView
      contacts={pipelineContacts}
      events={events || []}
      initiatives={initiatives || []}
      initialStageFilter={params.stage || null}
      initialInitiativeFilter={initiativeFilter}
    />
  );
}
