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
          <tr className="text-left text-[var(--text-muted)] border-b border-white/[0.06]">
            <th className="px-5 py-3 font-medium">Company</th>
            <th className="px-5 py-3 font-medium">Category</th>
            <th className="px-5 py-3 font-medium">Tier</th>
            <th className="px-5 py-3 font-medium">ICP</th>
            <th className="px-5 py-3 font-medium">Contacts</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.04]">
          {companies.map((co) => (
            <tr key={co.id} className="hover:bg-white/[0.03] transition-all duration-200">
              <td className="px-5 py-3">
                <Link href={`/admin/companies/${co.id}`} className="text-[var(--accent-indigo)] hover:underline">
                  {co.name}
                </Link>
              </td>
              <td className="px-5 py-3 text-[var(--text-muted)]">{co.category || "\u2014"}</td>
              <td className="px-5 py-3">
                {co.sponsor_tier && <Badge>{co.sponsor_tier.replace(" SPONSORS", "")}</Badge>}
              </td>
              <td className="px-5 py-3">
                {co.icp_score != null && (
                  <Badge variant={co.icp_score >= 90 ? "replied" : co.icp_score >= 75 ? "scheduled" : "default"}>
                    {co.icp_score}
                  </Badge>
                )}
              </td>
              <td className="px-5 py-3 text-[var(--text-muted)]">{co.contact_count ?? "\u2014"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
