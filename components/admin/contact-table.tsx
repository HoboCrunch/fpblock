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
          <tr className="text-left text-[var(--text-muted)] border-b border-white/[0.06]">
            <th className="px-5 py-3 font-medium">Name</th>
            <th className="px-5 py-3 font-medium">Company</th>
            <th className="px-5 py-3 font-medium">Role</th>
            <th className="px-5 py-3 font-medium">ICP</th>
            <th className="px-5 py-3 font-medium">Type</th>
            <th className="px-5 py-3 font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.04]">
          {contacts.map((contact) => {
            const primary = contact.contact_company?.find((cc) => cc.is_primary) || contact.contact_company?.[0];
            return (
              <tr key={contact.id} className="hover:bg-white/[0.03] transition-all duration-200">
                <td className="px-5 py-3">
                  <Link href={`/admin/contacts/${contact.id}`} className="text-[var(--accent-indigo)] hover:underline">
                    {contact.full_name}
                  </Link>
                </td>
                <td className="px-5 py-3 text-[var(--text-secondary)]">
                  {primary?.company?.name || "\u2014"}
                </td>
                <td className="px-5 py-3 text-[var(--text-muted)]">{contact.title || "\u2014"}</td>
                <td className="px-5 py-3">
                  {primary?.company?.icp_score != null && (
                    <Badge variant={primary.company.icp_score >= 90 ? "replied" : primary.company.icp_score >= 75 ? "scheduled" : "default"}>
                      {primary.company.icp_score}
                    </Badge>
                  )}
                </td>
                <td className="px-5 py-3 text-[var(--text-muted)]">{contact.participation_type || "\u2014"}</td>
                <td className="px-5 py-3">
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
