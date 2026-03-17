import type { Company } from "@/lib/types/database";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

type CompanyRow = Company & {
  sponsor_tier?: string;
  contact_count?: number;
};

export function CompanyTable({ companies }: { companies: CompanyRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-gray-400 border-b border-gray-800">
            <th className="pb-2 font-medium">Company</th>
            <th className="pb-2 font-medium">Category</th>
            <th className="pb-2 font-medium">Tier</th>
            <th className="pb-2 font-medium">ICP</th>
            <th className="pb-2 font-medium">Contacts</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-800/50">
          {companies.map((co) => (
            <tr key={co.id} className="hover:bg-gray-900/50">
              <td className="py-2">
                <Link href={`/admin/companies/${co.id}`} className="text-blue-400 hover:underline">
                  {co.name}
                </Link>
              </td>
              <td className="py-2 text-gray-400">{co.category || "—"}</td>
              <td className="py-2">
                {co.sponsor_tier && <Badge>{co.sponsor_tier.replace(" SPONSORS", "")}</Badge>}
              </td>
              <td className="py-2">
                {co.icp_score != null && (
                  <Badge variant={co.icp_score >= 90 ? "replied" : co.icp_score >= 75 ? "scheduled" : "default"}>
                    {co.icp_score}
                  </Badge>
                )}
              </td>
              <td className="py-2 text-gray-400">{co.contact_count ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
