import { createClient } from "@/lib/supabase/server";
import { GlassCard } from "@/components/ui/glass-card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import {
  Building2,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
} from "lucide-react";

interface SearchParams {
  search?: string;
  icp_min?: string;
  icp_max?: string;
  category?: string;
  has_signals?: string;
  sort?: string;
  dir?: string;
}

function SortHeader({
  label,
  field,
  currentSort,
  currentDir,
  buildUrl,
}: {
  label: string;
  field: string;
  currentSort: string;
  currentDir: string;
  buildUrl: (overrides: Record<string, string | undefined>) => string;
}) {
  const isActive = currentSort === field;
  const nextDir = isActive && currentDir === "desc" ? "asc" : "desc";
  return (
    <th className="px-5 py-3 font-medium">
      <Link
        href={buildUrl({ sort: field, dir: nextDir })}
        className="inline-flex items-center gap-1 hover:text-white transition-colors"
      >
        {label}
        {isActive ? (
          currentDir === "desc" ? (
            <ChevronDown className="w-3.5 h-3.5 text-[var(--accent-orange)]" />
          ) : (
            <ChevronUp className="w-3.5 h-3.5 text-[var(--accent-orange)]" />
          )
        ) : (
          <ChevronsUpDown className="w-3 h-3 opacity-40" />
        )}
      </Link>
    </th>
  );
}

export default async function OrganizationsListPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const sortField = params.sort || "icp_score";
  const sortDir = params.dir || "desc";

  // Fetch all organizations (handle >1000 rows with batched fetching)
  let allOrgsArr: any[] = [];
  let fetchOffset = 0;
  const BATCH = 1000;

  while (true) {
    let batchQuery = supabase
      .from("organizations")
      .select("*");

    if (params.search) {
      batchQuery = batchQuery.ilike("name", `%${params.search}%`);
    }

    if (params.category) {
      batchQuery = batchQuery.eq("category", params.category);
    }

    if (params.icp_min) {
      batchQuery = batchQuery.gte("icp_score", parseInt(params.icp_min));
    }

    if (params.icp_max) {
      batchQuery = batchQuery.lte("icp_score", parseInt(params.icp_max));
    }

    batchQuery = batchQuery.order("name").range(fetchOffset, fetchOffset + BATCH - 1);

    const { data } = await batchQuery;
    if (!data || data.length === 0) break;
    allOrgsArr = allOrgsArr.concat(data);
    if (data.length < BATCH) break;
    fetchOffset += BATCH;
  }

  const allOrgs = allOrgsArr;

  // Fetch related data in parallel using org IDs to avoid nested query RLS issues
  const orgIds = allOrgsArr.map((o: any) => o.id);

  // Helper to fetch with batching if orgIds > 500
  async function fetchInBatches(
    table: string,
    select: string,
    ids: string[],
    extraFilters?: (q: any) => any,
  ) {
    if (ids.length === 0) return { data: [] };
    const CHUNK = 500;
    let results: any[] = [];
    for (let i = 0; i < ids.length; i += CHUNK) {
      const chunk = ids.slice(i, i + CHUNK);
      let q = supabase.from(table).select(select).in("organization_id", chunk);
      if (extraFilters) q = extraFilters(q);
      const { data } = await q;
      if (data) results = results.concat(data);
    }
    return { data: results };
  }

  const [personLinksRes, signalsRes, eventParticipationsRes] = await Promise.all([
    fetchInBatches("person_organization", "organization_id, id, source", orgIds),
    fetchInBatches("organization_signals", "organization_id, id, date", orgIds),
    fetchInBatches(
      "event_participations",
      "organization_id, event_id, role, sponsor_tier, event:events(id, name)",
      orgIds,
      (q) => q.not("organization_id", "is", null),
    ),
  ]);

  // Build lookup maps
  const personCountMap = new Map<string, { total: number; enriched: number }>();
  for (const pl of (personLinksRes.data ?? []) as any[]) {
    const existing = personCountMap.get(pl.organization_id) ?? { total: 0, enriched: 0 };
    existing.total++;
    if (pl.source === "org_enrichment") existing.enriched++;
    personCountMap.set(pl.organization_id, existing);
  }

  const signalCountMap = new Map<string, { count: number; lastDate: string | null }>();
  for (const sig of (signalsRes.data ?? []) as any[]) {
    const existing = signalCountMap.get(sig.organization_id) ?? { count: 0, lastDate: null };
    existing.count++;
    if (sig.date && (!existing.lastDate || sig.date > existing.lastDate)) {
      existing.lastDate = sig.date;
    }
    signalCountMap.set(sig.organization_id, existing);
  }

  const eventMap = new Map<string, any[]>();
  for (const ep of (eventParticipationsRes.data ?? []) as any[]) {
    if (!ep.organization_id) continue;
    const existing = eventMap.get(ep.organization_id) ?? [];
    existing.push(ep);
    eventMap.set(ep.organization_id, existing);
  }

  // Get unique categories for filter
  const { data: categoryData } = await supabase
    .from("organizations")
    .select("category")
    .not("category", "is", null);

  const categories = [
    ...new Set((categoryData || []).map((c: any) => c.category).filter(Boolean)),
  ].sort();

  // Process rows
  const rows = (allOrgs || [])
    .map((org: any) => {
      const personCounts = personCountMap.get(org.id) ?? { total: 0, enriched: 0 };
      const signalData = signalCountMap.get(org.id) ?? { count: 0, lastDate: null };
      const events = eventMap.get(org.id) ?? [];

      return {
        id: org.id,
        name: org.name,
        category: org.category,
        icp_score: org.icp_score,
        person_count: personCounts.total,
        enriched_person_count: personCounts.enriched,
        signal_count: signalData.count,
        last_signal: signalData.lastDate,
        events: events.map((ep: any) => {
          const evt = Array.isArray(ep.event) ? ep.event[0] : ep.event;
          return {
            id: evt?.id,
            name: evt?.name,
            role: ep.role,
            tier: ep.sponsor_tier,
          };
        }),
      };
    })
    .filter((row: any) => {
      if (params.has_signals === "yes" && row.signal_count === 0) return false;
      if (params.has_signals === "no" && row.signal_count > 0) return false;
      return true;
    });

  // Client-side sort
  rows.sort((a: any, b: any) => {
    let aVal = a[sortField];
    let bVal = b[sortField];
    if (aVal == null && bVal == null) return 0;
    if (aVal == null) return 1;
    if (bVal == null) return -1;
    if (typeof aVal === "string") aVal = aVal.toLowerCase();
    if (typeof bVal === "string") bVal = bVal.toLowerCase();
    const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
    return sortDir === "desc" ? -cmp : cmp;
  });

  function buildUrl(overrides: Record<string, string | undefined>) {
    const p = new URLSearchParams();
    const merged = { ...params, ...overrides };
    for (const [k, v] of Object.entries(merged)) {
      if (v && v !== "" && v !== "all") p.set(k, v);
    }
    return `/admin/organizations?${p.toString()}`;
  }

  function icpBadgeVariant(score: number | null) {
    if (score === null) return "default";
    if (score >= 90) return "replied";
    if (score >= 75) return "scheduled";
    return "default";
  }

  const selectClass = "glass rounded-lg px-3 py-2 text-sm text-[var(--text-secondary)] focus:outline-none [&>option]:bg-[#16161e] [&>option]:text-white";

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold font-[family-name:var(--font-heading)]">
        Organizations
      </h1>

      {/* Filters */}
      <GlassCard padding={false} className="p-4">
        <form className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            name="search"
            placeholder="Search organizations..."
            defaultValue={params.search || ""}
            className="glass rounded-lg px-3 py-2 text-sm text-white placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-indigo)] w-64"
          />

          <select name="icp_min" defaultValue={params.icp_min || ""} className={selectClass}>
            <option value="">ICP Min</option>
            <option value="50">50+</option>
            <option value="75">75+</option>
            <option value="90">90+</option>
          </select>

          <select name="icp_max" defaultValue={params.icp_max || ""} className={selectClass}>
            <option value="">ICP Max</option>
            <option value="50">Up to 50</option>
            <option value="75">Up to 75</option>
            <option value="90">Up to 90</option>
          </select>

          <select name="category" defaultValue={params.category || ""} className={selectClass}>
            <option value="">Category</option>
            {categories.map((cat: any) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>

          <select name="has_signals" defaultValue={params.has_signals || ""} className={selectClass}>
            <option value="">Has Signals</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>

          {params.sort && <input type="hidden" name="sort" value={params.sort} />}
          {params.dir && <input type="hidden" name="dir" value={params.dir} />}

          <button
            type="submit"
            className="px-4 py-2 text-sm font-medium rounded-lg bg-[var(--accent-orange)]/15 text-[var(--accent-orange)] border border-[var(--accent-orange)]/20 hover:bg-[var(--accent-orange)]/25 transition-all duration-200"
          >
            Filter
          </button>

          <Link
            href="/admin/organizations"
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
              <tr className="text-left text-[var(--text-muted)] border-b border-[var(--glass-border)]">
                <SortHeader label="ICP" field="icp_score" currentSort={sortField} currentDir={sortDir} buildUrl={buildUrl} />
                <SortHeader label="Name" field="name" currentSort={sortField} currentDir={sortDir} buildUrl={buildUrl} />
                <SortHeader label="Category" field="category" currentSort={sortField} currentDir={sortDir} buildUrl={buildUrl} />
                <SortHeader label="People" field="person_count" currentSort={sortField} currentDir={sortDir} buildUrl={buildUrl} />
                <SortHeader label="Signals" field="signal_count" currentSort={sortField} currentDir={sortDir} buildUrl={buildUrl} />
                <SortHeader label="Last Signal" field="last_signal" currentSort={sortField} currentDir={sortDir} buildUrl={buildUrl} />
                <th className="px-5 py-3 font-medium">Events</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center">
                    <Building2 className="w-10 h-10 text-[var(--text-muted)] mx-auto mb-3" />
                    <p className="text-[var(--text-muted)]">No organizations found.</p>
                  </td>
                </tr>
              )}
              {rows.map((row: any) => (
                <tr
                  key={row.id}
                  className="hover:bg-white/[0.03] transition-all duration-200"
                >
                  <td className="px-5 py-3">
                    {row.icp_score !== null ? (
                      <Badge variant={icpBadgeVariant(row.icp_score)}>
                        {row.icp_score}
                      </Badge>
                    ) : (
                      <span className="text-[var(--text-muted)]">&mdash;</span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <Link
                      href={`/admin/organizations/${row.id}`}
                      className="text-[var(--accent-indigo)] hover:underline font-medium"
                    >
                      {row.name}
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-[var(--text-muted)]">
                    {row.category || "\u2014"}
                  </td>
                  <td className="px-5 py-3 text-[var(--text-secondary)]">
                    {row.person_count}
                    {row.enriched_person_count > 0 && (
                      <span className="text-[10px] text-[var(--accent-orange)] ml-1" title="Found via People Finder">
                        (+{row.enriched_person_count})
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-[var(--text-secondary)]">
                    {row.signal_count}
                  </td>
                  <td className="px-5 py-3 text-[var(--text-muted)]">
                    {row.last_signal
                      ? new Date(row.last_signal).toLocaleDateString()
                      : "\u2014"}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex flex-wrap gap-1">
                      {row.events.map((ev: any, i: number) => (
                        <Badge key={i} variant={ev.tier ? "glass-orange" : "glass-indigo"}>
                          {ev.name}{ev.tier ? ` (${ev.tier})` : ""}
                        </Badge>
                      ))}
                      {row.events.length === 0 && <span className="text-[var(--text-muted)]">&mdash;</span>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="px-5 py-3 border-t border-[var(--glass-border)]">
          <p className="text-xs text-[var(--text-muted)]">{rows.length} organizations</p>
        </div>
      </GlassCard>
    </div>
  );
}
