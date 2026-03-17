import type { Contact, ContactCompany, Company } from "@/lib/types/database";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

type ContactRow = Contact & {
  contact_company: (ContactCompany & { company: Company })[];
  message_status?: string;
  participation_type?: string;
};

export function ContactTable({ contacts }: { contacts: ContactRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-gray-400 border-b border-gray-800">
            <th className="pb-2 font-medium">Name</th>
            <th className="pb-2 font-medium">Company</th>
            <th className="pb-2 font-medium">Role</th>
            <th className="pb-2 font-medium">ICP</th>
            <th className="pb-2 font-medium">Type</th>
            <th className="pb-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-800/50">
          {contacts.map((contact) => {
            const primary = contact.contact_company?.find((cc) => cc.is_primary) || contact.contact_company?.[0];
            return (
              <tr key={contact.id} className="hover:bg-gray-900/50">
                <td className="py-2">
                  <Link href={`/admin/contacts/${contact.id}`} className="text-blue-400 hover:underline">
                    {contact.full_name}
                  </Link>
                </td>
                <td className="py-2 text-gray-300">
                  {primary?.company?.name || "—"}
                </td>
                <td className="py-2 text-gray-400">{contact.title || "—"}</td>
                <td className="py-2">
                  {primary?.company?.icp_score != null && (
                    <Badge variant={primary.company.icp_score >= 90 ? "replied" : primary.company.icp_score >= 75 ? "scheduled" : "default"}>
                      {primary.company.icp_score}
                    </Badge>
                  )}
                </td>
                <td className="py-2 text-gray-400">{contact.participation_type || "—"}</td>
                <td className="py-2">
                  {contact.message_status && <Badge variant={contact.message_status}>{contact.message_status}</Badge>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
