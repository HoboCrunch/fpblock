import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { Tabs } from "@/components/ui/tabs";
import { ContactTable } from "@/components/admin/contact-table";
import { CompanyTable } from "@/components/admin/company-table";
import { MessageTable } from "@/components/admin/message-table";

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: event } = await supabase
    .from("events")
    .select("*")
    .eq("id", id)
    .single();

  if (!event) notFound();

  const { data: eventConfig } = await supabase
    .from("event_config")
    .select("*, sender:sender_profiles(*), prompt:prompt_templates(*)")
    .eq("event_id", id)
    .single();

  // Contacts linked to this event
  const { data: contactEvents } = await supabase
    .from("contact_event")
    .select("participation_type, contact:contacts(*, contact_company(*, company:companies(*)))")
    .eq("event_id", id);

  // Companies linked to this event
  const { data: companyEvents } = await supabase
    .from("company_event")
    .select("sponsor_tier, relationship_type, company:companies(*)")
    .eq("event_id", id);

  // Messages for this event
  const { data: messages } = await supabase
    .from("messages")
    .select("*, contact:contacts(id, full_name), company:companies(id, name)")
    .eq("event_id", id)
    .order("created_at", { ascending: false });

  const contacts = (contactEvents || []).map((ce: any) => ({
    ...ce.contact,
    participation_type: ce.participation_type,
  }));

  const companies = (companyEvents || []).map((ce: any) => ({
    ...ce.company,
    sponsor_tier: ce.sponsor_tier,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{event.name}</h1>
        <p className="text-gray-400 text-sm mt-1">
          {event.location} · {event.date_start} — {event.date_end}
        </p>
        {eventConfig && (
          <p className="text-gray-500 text-xs mt-2">
            Sender: {eventConfig.sender?.name || "—"} · CTA: {eventConfig.cta_url || "—"}
          </p>
        )}
      </div>

      <Tabs
        tabs={[
          {
            id: "contacts",
            label: `Contacts (${contacts.length})`,
            content: <ContactTable contacts={contacts} />,
          },
          {
            id: "companies",
            label: `Companies (${companies.length})`,
            content: <CompanyTable companies={companies} />,
          },
          {
            id: "messages",
            label: `Messages (${(messages || []).length})`,
            content: <MessageTable messages={messages || []} />,
          },
        ]}
      />
    </div>
  );
}
