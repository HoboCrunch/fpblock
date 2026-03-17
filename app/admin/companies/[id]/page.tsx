import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { SignalsTimeline } from "@/components/admin/signals-timeline";
import { ContactTable } from "@/components/admin/contact-table";
import { MessageTable } from "@/components/admin/message-table";

export default async function CompanyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: company } = await supabase
    .from("companies")
    .select("*")
    .eq("id", id)
    .single();

  if (!company) notFound();

  const [
    { data: signals },
    { data: contactLinks },
    { data: messages },
  ] = await Promise.all([
    supabase
      .from("company_signals")
      .select("*")
      .eq("company_id", id)
      .order("date", { ascending: false, nullsFirst: false }),
    supabase
      .from("contact_company")
      .select("*, contact:contacts(*, contact_company(*, company:companies(*)))")
      .eq("company_id", id),
    supabase
      .from("messages")
      .select("*, contact:contacts(id, full_name)")
      .eq("company_id", id)
      .order("created_at", { ascending: false }),
  ]);

  const contacts = (contactLinks || []).map((cl: any) => cl.contact);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">{company.name}</h1>
        <p className="text-gray-400 text-sm mt-1">{company.category || "—"}</p>
        {company.icp_score != null && (
          <Badge variant={company.icp_score >= 90 ? "replied" : "scheduled"} className="mt-2">
            ICP {company.icp_score}
          </Badge>
        )}
      </div>

      {/* Company info */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-3">
        {company.description && <div><div className="text-xs text-gray-500">Description</div><p className="text-sm text-gray-300 mt-0.5">{company.description}</p></div>}
        {company.context && <div><div className="text-xs text-gray-500">Context</div><p className="text-sm text-gray-300 mt-0.5">{company.context}</p></div>}
        {company.usp && <div><div className="text-xs text-gray-500">Our Angle (USP)</div><p className="text-sm text-gray-300 mt-0.5">{company.usp}</p></div>}
        {company.icp_reason && <div><div className="text-xs text-gray-500">ICP Reason</div><p className="text-sm text-gray-300 mt-0.5">{company.icp_reason}</p></div>}
      </div>

      {/* Signals */}
      <div>
        <h2 className="text-lg font-medium mb-2">Signals</h2>
        <SignalsTimeline signals={signals || []} />
      </div>

      {/* Contacts */}
      <div>
        <h2 className="text-lg font-medium mb-2">Contacts ({contacts.length})</h2>
        <ContactTable contacts={contacts} />
      </div>

      {/* Messages */}
      <div>
        <h2 className="text-lg font-medium mb-2">Messages</h2>
        <MessageTable messages={(messages || []).map((m: any) => ({ ...m, company: { id: company.id, name: company.name } }))} />
      </div>
    </div>
  );
}
