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
          <tr className="text-left text-gray-400 border-b border-gray-800">
            <th className="pb-2 font-medium">Contact</th>
            <th className="pb-2 font-medium">Company</th>
            <th className="pb-2 font-medium">Channel</th>
            <th className="pb-2 font-medium">Seq</th>
            <th className="pb-2 font-medium">Status</th>
            <th className="pb-2 font-medium">Scheduled</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-800/50">
          {messages.map((msg) => (
            <tr key={msg.id} className="hover:bg-gray-900/50">
              <td className="py-2">
                {msg.contact ? (
                  <Link href={`/admin/contacts/${msg.contact.id}`} className="text-blue-400 hover:underline">
                    {msg.contact.full_name}
                  </Link>
                ) : "—"}
              </td>
              <td className="py-2 text-gray-300">
                {msg.company ? (
                  <Link href={`/admin/companies/${msg.company.id}`} className="text-gray-300 hover:underline">
                    {msg.company.name}
                  </Link>
                ) : "—"}
              </td>
              <td className="py-2"><Badge>{msg.channel}</Badge></td>
              <td className="py-2 text-gray-400">#{msg.sequence_number}.{msg.iteration}</td>
              <td className="py-2"><Badge variant={msg.status}>{msg.status}</Badge></td>
              <td className="py-2 text-gray-400">
                {msg.scheduled_at ? new Date(msg.scheduled_at).toLocaleDateString() : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
