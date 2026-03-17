import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { MessageTable } from "@/components/admin/message-table";
import Link from "next/link";

export default async function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: contact } = await supabase
    .from("contacts")
    .select("*")
    .eq("id", id)
    .single();

  if (!contact) notFound();

  const [
    { data: affiliations },
    { data: events },
    { data: messages },
  ] = await Promise.all([
    supabase
      .from("contact_company")
      .select("*, company:companies(*)")
      .eq("contact_id", id),
    supabase
      .from("contact_event")
      .select("*, event:events(*)")
      .eq("contact_id", id),
    supabase
      .from("messages")
      .select("*, company:companies(id, name)")
      .eq("contact_id", id)
      .order("channel")
      .order("sequence_number")
      .order("iteration", { ascending: false }),
  ]);

  const primaryCompany = affiliations?.find((a: any) => a.is_primary)?.company || affiliations?.[0]?.company;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">{contact.full_name}</h1>
        <p className="text-gray-400 text-sm mt-1">
          {contact.title}{primaryCompany ? ` at ${primaryCompany.name}` : ""}
        </p>
        {primaryCompany?.icp_score != null && (
          <Badge variant={primaryCompany.icp_score >= 90 ? "replied" : "scheduled"} className="mt-2">
            ICP {primaryCompany.icp_score}
          </Badge>
        )}
      </div>

      {/* Contact info */}
      <div className="grid grid-cols-2 gap-4 bg-gray-900 border border-gray-800 rounded-lg p-4">
        {[
          ["Email", contact.email],
          ["LinkedIn", contact.linkedin],
          ["Twitter", contact.twitter],
          ["Telegram", contact.telegram],
          ["Phone", contact.phone],
          ["Source", contact.source],
        ].map(([label, value]) => (
          <div key={label as string}>
            <div className="text-xs text-gray-500">{label}</div>
            <div className="text-sm text-gray-300 mt-0.5">{(value as string) || "—"}</div>
          </div>
        ))}
      </div>

      {/* Context */}
      {contact.context && (
        <div>
          <h2 className="text-lg font-medium mb-2">Context</h2>
          <p className="text-sm text-gray-300 bg-gray-900 border border-gray-800 rounded-lg p-4">
            {contact.context}
          </p>
        </div>
      )}

      {/* Company affiliations */}
      <div>
        <h2 className="text-lg font-medium mb-2">Companies</h2>
        <div className="space-y-2">
          {(affiliations || []).map((aff: any) => (
            <div key={aff.id} className="flex items-center gap-3 bg-gray-900 border border-gray-800 rounded p-3">
              <Link href={`/admin/companies/${aff.company.id}`} className="text-blue-400 hover:underline text-sm">
                {aff.company.name}
              </Link>
              <span className="text-gray-400 text-sm">{aff.role || "—"}</span>
              {aff.founder_status && <Badge>{aff.founder_status}</Badge>}
              {aff.is_primary && <Badge variant="approved">primary</Badge>}
            </div>
          ))}
        </div>
      </div>

      {/* Events */}
      <div>
        <h2 className="text-lg font-medium mb-2">Events</h2>
        <div className="space-y-2">
          {(events || []).map((ce: any) => (
            <div key={ce.id} className="flex items-center gap-3 bg-gray-900 border border-gray-800 rounded p-3">
              <Link href={`/admin/events/${ce.event.id}`} className="text-blue-400 hover:underline text-sm">
                {ce.event.name}
              </Link>
              {ce.participation_type && <Badge>{ce.participation_type}</Badge>}
              {ce.track && <span className="text-gray-400 text-sm">{ce.track}</span>}
            </div>
          ))}
        </div>
      </div>

      {/* Messages */}
      <div>
        <h2 className="text-lg font-medium mb-2">Messages</h2>
        <MessageTable messages={(messages || []).map((m: any) => ({ ...m, contact: { id: contact.id, full_name: contact.full_name } }))} />
      </div>
    </div>
  );
}
