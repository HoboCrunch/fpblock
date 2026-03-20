import { createClient } from "@/lib/supabase/server";
import { GlassCard } from "@/components/ui/glass-card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import {
  Building2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

const PAGE_SIZE = 25;

interface SearchParams {
  search?: string;
  icp_min?: string;
  icp_max?: string;
  category?: string;
  has_signals?: string;
  page?: string;
}

export default async function CompaniesListPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const page = Math.max(1, parseInt(params.page || "1", 10));
  const offset = (page - 1) * PAGE_SIZE;

  // Build companies query
  let query = supabase
    .from("companies")
    .select(
      "*, contact_company(id), company_signals(id, date)",
      { count: "exact" }
    );

  if (params.search) {
    query = query.ilike("name", `%${params.search}%`);
  }

  if (params.category) {
    query = query.eq("category", params.category);
  }

  if (params.icp_min) {
    query = query.gte("icp_score", parseInt(params.icp_min));
  }

  if (params.icp_max) {
    query = query.lte("icp_score", parseInt(params.icp_max));
  }

  const { data: allCompanies, count } = await query
    .order("name")
    .range(offset, offset + PAGE_SIZE - 1);

  // Get unique categories for filter
  const { data: categoryData } = await supabase
    .from("companies")
    .select("category")
    .not("category", "is", null);

  const categories = [
    ...new Set((categoryData || []).map((c: any) => c.category).filter(Boolean)),
  ].sort();

  // Process rows
  const rows = (allCompanies || [])
    .map((company: any) => {
      const contactCount = company.contact_company?.length || 0;
      const signals = company.company_signals || [];
      const signalCount = signals.length;
      const lastSignal =
        signals.length > 0
          ? signals.reduce((latest: string, s: any) =>
              s.date && s.date > latest ? s.date : latest,
            signals[0]?.date || "")
          : null;

      return {
        id: company.id,
        name: company.name,
        category: company.category,
        icp_score: company.icp_score,
        contact_count: contactCount,
        signal_count: signalCount,
        last_signal: lastSignal,
      };
    })
    .filter((row: any) => {
      if (params.has_signals === "yes" && row.signal_count === 0) return false;
      if (params.has_signals === "no" && row.signal_count > 0) return false;
      return true;
    });

  const totalPages = Math.ceil((count || 0) / PAGE_SIZE);

  function buildUrl(overrides: Record<string, string | undefined>) {
    const p = new URLSearchParams();
    const merged = { ...params, ...overrides };
    for (const [k, v] of Object.entries(merged)) {
      if (v && v !== "" && v !== "all") p.set(k, v);
    }
    return `/admin/companies?${p.toString()}`;
  }

  function icpBadgeVariant(score: number | null) {
    if (score === null) return "default";
    if (score >= 90) return "replied";
    if (score >= 75) return "scheduled";
    return "default";
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold font-[family-name:var(--font-heading)]">
        Companies
      </h1>

      {/* Filters */}
      <GlassCard padding={false} className="p-4">
        <form className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            name="search"
            placeholder="Search companies..."
            defaultValue={params.search || ""}
            className="glass rounded-lg px-3 py-2 text-sm text-white placeholder:text-[var(--text-muted)] bg-transparent focus:outline-none focus:border-[var(--accent-indigo)]/30 w-64"
          />

          <select
            name="icp_min"
            defaultValue={params.icp_min || ""}
            className="glass rounded-lg px-3 py-2 text-sm text-[var(--text-secondary)] bg-transparent focus:outline-none"
          >
            <option value="">ICP Min</option>
            <option value="50">50+</option>
            <option value="75">75+</option>
            <option value="90">90+</option>
          </select>

          <select
            name="icp_max"
            defaultValue={params.icp_max || ""}
            className="glass rounded-lg px-3 py-2 text-sm text-[var(--text-secondary)] bg-transparent focus:outline-none"
          >
            <option value="">ICP Max</option>
            <option value="50">Up to 50</option>
            <option value="75">Up to 75</option>
            <option value="90">Up to 90</option>
          </select>

          <select
            name="category"
            defaultValue={params.category || ""}
            className="glass rounded-lg px-3 py-2 text-sm text-[var(--text-secondary)] bg-transparent focus:outline-none"
          >
            <option value="">Category</option>
            {categories.map((cat: any) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>

          <select
            name="has_signals"
            defaultValue={params.has_signals || ""}
            className="glass rounded-lg px-3 py-2 text-sm text-[var(--text-secondary)] bg-transparent focus:outline-none"
          >
            <option value="">Has Signals</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>

          <button
            type="submit"
            className="px-4 py-2 text-sm font-medium rounded-lg bg-[var(--accent-orange)]/15 text-[var(--accent-orange)] border border-[var(--accent-orange)]/20 hover:bg-[var(--accent-orange)]/25 transition-all duration-200"
          >
            Filter
          </button>

          <Link
            href="/admin/companies"
            className="px-4 py-2 text-sm text-[var(--text-muted)] hover:text-white transition-all duration-200"
          >
            Clear
          </Link>
        </form>
      </GlassCard>

      {/* Table */}
      <GlassCard padding={false}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[var(--text-muted)] border-b border-white/[0.06]">
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-5 py-3 font-medium">Category</th>
                <th className="px-5 py-3 font-medium">ICP Score</th>
                <th className="px-5 py-3 font-medium">Contacts</th>
                <th className="px-5 py-3 font-medium">Signals</th>
                <th className="px-5 py-3 font-medium">Last Signal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center">
                    <Building2 className="w-10 h-10 text-[var(--text-muted)] mx-auto mb-3" />
                    <p className="text-[var(--text-muted)]">
                      No companies found.
                    </p>
                  </td>
                </tr>
              )}
              {rows.map((row: any) => (
                <tr
                  key={row.id}
                  className="hover:bg-white/[0.03] transition-all duration-200"
                >
                  <td className="px-5 py-3">
                    <Link
                      href={`/admin/companies/${row.id}`}
                      className="text-[var(--accent-indigo)] hover:underline font-medium"
                    >
                      {row.name}
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-[var(--text-muted)]">
                    {row.category || "\u2014"}
                  </td>
                  <td className="px-5 py-3">
                    {row.icp_score !== null ? (
                      <Badge variant={icpBadgeVariant(row.icp_score)}>
                        {row.icp_score}
                      </Badge>
                    ) : (
                      <span className="text-[var(--text-muted)]">&mdash;</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-[var(--text-secondary)]">
                    {row.contact_count}
                  </td>
                  <td className="px-5 py-3 text-[var(--text-secondary)]">
                    {row.signal_count}
                  </td>
                  <td className="px-5 py-3 text-[var(--text-muted)]">
                    {row.last_signal
                      ? new Date(row.last_signal).toLocaleDateString()
                      : "\u2014"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-white/[0.06]">
            <p className="text-xs text-[var(--text-muted)]">
              Page {page} of {totalPages} ({count} companies)
            </p>
            <div className="flex items-center gap-2">
              {page > 1 && (
                <Link
                  href={buildUrl({ page: String(page - 1) })}
                  className="glass rounded-lg px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:text-white transition-all duration-200 flex items-center gap-1"
                >
                  <ChevronLeft className="w-4 h-4" /> Prev
                </Link>
              )}
              {page < totalPages && (
                <Link
                  href={buildUrl({ page: String(page + 1) })}
                  className="glass rounded-lg px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:text-white transition-all duration-200 flex items-center gap-1"
                >
                  Next <ChevronRight className="w-4 h-4" />
                </Link>
              )}
            </div>
          </div>
        )}
      </GlassCard>
    </div>
  );
}
