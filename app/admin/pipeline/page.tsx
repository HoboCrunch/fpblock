import { createClient } from "@/lib/supabase/server";
import { PipelineView } from "@/components/admin/pipeline-view";
import type { PipelineContact } from "@/lib/types/pipeline";

/**
 * Map raw message status to pipeline stage.
 * The pipeline collapses sending/sent/delivered → "sent"
 * and bounced/failed → "bounced_failed".
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
  searchParams: Promise<{ stage?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  // Fetch all contacts with their primary company and messages
  const { data: contacts } = await supabase
    .from("contacts")
    .select(`
      id,
      full_name,
      contact_company!inner(company_id, is_primary, companies(id, name, icp_score)),
      messages(id, status, channel, event_id, updated_at, created_at)
    `)
    .eq("contact_company.is_primary", true);

  // Also fetch contacts without any company (left join fallback)
  const { data: allContacts } = await supabase
    .from("contacts")
    .select(`
      id,
      full_name,
      created_at
    `);

  const { data: allMessages } = await supabase
    .from("messages")
    .select("id, contact_id, status, channel, event_id, updated_at, created_at");

  const { data: contactCompanies } = await supabase
    .from("contact_company")
    .select("contact_id, company_id, is_primary, companies(id, name, icp_score)")
    .eq("is_primary", true);

  const { data: events } = await supabase
    .from("events")
    .select("*")
    .order("date_start", { ascending: false });

  // Build lookup maps
  const companyMap = new Map<string, { name: string; icp_score: number | null; id: string }>();
  if (contactCompanies) {
    for (const cc of contactCompanies) {
      const company = cc.companies as unknown as { id: string; name: string; icp_score: number | null } | null;
      if (company) {
        companyMap.set(cc.contact_id, company);
      }
    }
  }

  const messagesByContact = new Map<string, typeof allMessages>();
  if (allMessages) {
    for (const msg of allMessages) {
      const existing = messagesByContact.get(msg.contact_id) || [];
      existing.push(msg);
      messagesByContact.set(msg.contact_id, existing);
    }
  }

  // Build pipeline contacts
  const pipelineContacts: PipelineContact[] = [];

  if (allContacts) {
    for (const contact of allContacts) {
      const msgs = messagesByContact.get(contact.id) || [];
      const company = companyMap.get(contact.id);

      // Find most advanced message status
      let bestStatus: string | null = null;
      let bestRank = -1;
      let bestChannel: string | null = null;
      let bestEventId: string | null = null;
      let lastUpdated: string | null = null;

      for (const msg of msgs) {
        const rank = STATUS_RANK[msg.status] ?? -1;
        if (rank > bestRank) {
          bestRank = rank;
          bestStatus = msg.status;
          bestChannel = msg.channel;
          bestEventId = msg.event_id;
        }
        const msgDate = msg.updated_at || msg.created_at;
        if (!lastUpdated || msgDate > lastUpdated) {
          lastUpdated = msgDate;
        }
      }

      pipelineContacts.push({
        id: contact.id,
        full_name: contact.full_name,
        company_name: company?.name || null,
        company_id: company?.id || null,
        icp_score: company?.icp_score || null,
        channel: bestChannel,
        pipeline_stage: statusToStage(bestStatus),
        last_updated: lastUpdated || contact.created_at,
        event_id: bestEventId,
        event_name: null, // Could join events if needed
      });
    }
  }

  return (
    <PipelineView
      contacts={pipelineContacts}
      events={events || []}
      initialStageFilter={params.stage || null}
    />
  );
}
