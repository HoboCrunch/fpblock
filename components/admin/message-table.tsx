import type { Message } from "@/lib/types/database";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

type MessageRow = Message & {
  contact?: { id: string; full_name: string };
  company?: { id: string; name: string };
};

export function MessageTable({ messages }: { messages: MessageRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[var(--text-muted)] border-b border-white/[0.06]">
            <th className="px-5 py-3 font-medium">Contact</th>
            <th className="px-5 py-3 font-medium">Company</th>
            <th className="px-5 py-3 font-medium">Channel</th>
            <th className="px-5 py-3 font-medium">Seq</th>
            <th className="px-5 py-3 font-medium">Status</th>
            <th className="px-5 py-3 font-medium">Scheduled</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.04]">
          {messages.map((msg) => (
            <tr key={msg.id} className="hover:bg-white/[0.03] transition-all duration-200">
              <td className="px-5 py-3">
                {msg.contact ? (
                  <Link href={`/admin/contacts/${msg.contact.id}`} className="text-[var(--accent-indigo)] hover:underline">
                    {msg.contact.full_name}
                  </Link>
                ) : "\u2014"}
              </td>
              <td className="px-5 py-3 text-[var(--text-secondary)]">
                {msg.company ? (
                  <Link href={`/admin/companies/${msg.company.id}`} className="text-[var(--text-secondary)] hover:underline">
                    {msg.company.name}
                  </Link>
                ) : "\u2014"}
              </td>
              <td className="px-5 py-3"><Badge>{msg.channel}</Badge></td>
              <td className="px-5 py-3 text-[var(--text-muted)]">#{msg.sequence_number}.{msg.iteration}</td>
              <td className="px-5 py-3"><Badge variant={msg.status}>{msg.status}</Badge></td>
              <td className="px-5 py-3 text-[var(--text-muted)]">
                {msg.scheduled_at ? new Date(msg.scheduled_at).toLocaleDateString() : "\u2014"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
