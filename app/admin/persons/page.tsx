import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { GlassCard } from "@/components/ui/glass-card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import {
  Mail,
  Linkedin,
  Twitter,
  Send,
  Phone,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Users,
} from "lucide-react";

interface SearchParams {
  search?: string;
  icp_min?: string;
  icp_max?: string;
  has_email?: string;
  event?: string;
  source?: string;
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

function icpBadgeVariant(score: number | null) {
  if (score === null) return "default";
  if (score >= 90) return "replied";
  if (score >= 75) return "scheduled";
  return "default";
}

export default async function PersonsListPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const sortField = params.sort || "icp_score";
  const sortDir = params.dir || "desc";

  // Fetch events and sources for filter dropdowns
  const { data: events } = await supabase
    .from("events")
    .select("id, name")
    .order("name");

  // Get distinct sources for filter
  const { data: sourcesRaw } = await supabase
    .from("persons")
    .select("source")
    .not("source", "is", null);

  const sources = [...new Set((sourcesRaw || []).map((s: any) => s.source).filter(Boolean))].sort();

  // Pre-filter by event participation IDs (server-side)
  let filterIds: string[] | null = null;

  if (params.event) {
    const { data: eventParticipations } = await supabase
      .from("event_participations")
      .select("person_id")
      .eq("event_id", params.event)
      .not("person_id", "is", null);
    const ids = (eventParticipations || []).map((ep: any) => ep.person_id);
    filterIds = filterIds !== null ? (filterIds as string[]).filter((id: string) => ids.includes(id)) : ids;
  }

  // Short-circuit if filter yields no IDs
  if (filterIds !== null && filterIds.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold font-[family-name:var(--font-heading)]">
          Persons
        </h1>
        <GlassCard padding={false}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[var(--text-muted)] border-b border-[var(--glass-border)]">
                  <th className="px-5 py-3 font-medium">ICP</th>
                  <th className="px-5 py-3 font-medium">Name</th>
                  <th className="px-5 py-3 font-medium">Organization</th>
                  <th className="px-5 py-3 font-medium">Title</th>
                  <th className="px-5 py-3 font-medium">Channels</th>
                  <th className="px-5 py-3 font-medium">Last Interaction</th>
                  <th className="px-5 py-3 font-medium">Interactions</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center">
                    <Users className="w-10 h-10 text-[var(--text-muted)] mx-auto mb-3" />
                    <p className="text-[var(--text-muted)]">No persons found.</p>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </GlassCard>
      </div>
    );
  }

  // Fetch persons from the persons_with_icp view using batched fetching
  const { data: allPersons } = await fetchAll(supabase, "persons_with_icp", "*", {
    order: { column: "full_name", ascending: true },
    filters: (query: any) => {
      let q = query;
      if (params.search) {
        q = q.or(
          `full_name.ilike.%${params.search}%,email.ilike.%${params.search}%`
        );
      }
      if (params.has_email === "yes") {
        q = q.not("email", "is", null);
      } else if (params.has_email === "no") {
        q = q.is("email", null);
      }
      if (params.source) {
        q = q.eq("source", params.source);
      }
      if (filterIds !== null && filterIds.length > 0) {
        q = q.in("id", filterIds);
      }
      return q;
    },
  });

  // Fetch interaction counts and last interaction dates per person
  const personIds = allPersons.map((p: any) => p.id);
  let interactionStats: Record<string, { count: number; last_at: string | null }> = {};

  if (personIds.length > 0) {
    // Fetch interactions in batches (same pattern)
    const { data: interactions } = await fetchAll(supabase, "interactions", "person_id, occurred_at, created_at", {
      filters: (query: any) => query.not("person_id", "is", null),
    });

    for (const ix of interactions) {
      if (!ix.person_id) continue;
      const existing = interactionStats[ix.person_id];
      const ixDate = ix.occurred_at || ix.created_at;
      if (!existing) {
        interactionStats[ix.person_id] = { count: 1, last_at: ixDate };
      } else {
        existing.count += 1;
        if (ixDate && (!existing.last_at || ixDate > existing.last_at)) {
          existing.last_at = ixDate;
        }
      }
    }
  }

  // Deduplicate persons (view may return duplicates if multiple primary org links)
  const seenIds = new Set<string>();
  const dedupedPersons = allPersons.filter((p: any) => {
    if (seenIds.has(p.id)) return false;
    seenIds.add(p.id);
    return true;
  });

  // Process rows
  const rows = dedupedPersons
    .map((person: any) => {
      const stats = interactionStats[person.id];
      return {
        ...person,
        interaction_count: stats?.count ?? 0,
        last_interaction_at: stats?.last_at ?? null,
      };
    })
    .filter((row: any) => {
      if (params.icp_min && (row.icp_score === null || row.icp_score < parseInt(params.icp_min))) return false;
      if (params.icp_max && row.icp_score !== null && row.icp_score > parseInt(params.icp_max)) return false;
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
    return `/admin/persons?${p.toString()}`;
  }

  const selectClass = "glass rounded-lg px-3 py-2 text-sm text-[var(--text-secondary)] focus:outline-none [&>option]:bg-[#16161e] [&>option]:text-white";

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold font-[family-name:var(--font-heading)]">
        Persons
      </h1>

      {/* Filters */}
      <GlassCard padding={false} className="p-4">
        <form className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            name="search"
            placeholder="Search persons..."
            defaultValue={params.search || ""}
            className="glass rounded-lg px-3 py-2 text-sm text-white placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-indigo)] w-64"
          />

          <select name="icp_min" defaultValue={params.icp_min || ""} className={selectClass}>
            <option value="">ICP Min</option>
            <option value="50">50+</option>
            <option value="75">75+</option>
            <option value="90">90+</option>
          </select>

          <select name="has_email" defaultValue={params.has_email || ""} className={selectClass}>
            <option value="">Has Email</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>

          <select name="event" defaultValue={params.event || ""} className={selectClass}>
            <option value="">Event</option>
            {(events || []).map((e: any) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>

          <select name="source" defaultValue={params.source || ""} className={selectClass}>
            <option value="">Source</option>
            {sources.map((s: string) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          {/* Preserve sort params through filter submission */}
          {params.sort && <input type="hidden" name="sort" value={params.sort} />}
          {params.dir && <input type="hidden" name="dir" value={params.dir} />}

          <button
            type="submit"
            className="px-4 py-2 text-sm font-medium rounded-lg bg-[var(--accent-orange)]/15 text-[var(--accent-orange)] border border-[var(--accent-orange)]/20 hover:bg-[var(--accent-orange)]/25 transition-all duration-200"
          >
            Filter
          </button>

          <Link
            href="/admin/persons"
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
                <SortHeader label="Name" field="full_name" currentSort={sortField} currentDir={sortDir} buildUrl={buildUrl} />
                <SortHeader label="Organization" field="primary_org_name" currentSort={sortField} currentDir={sortDir} buildUrl={buildUrl} />
                <SortHeader label="Title" field="title" currentSort={sortField} currentDir={sortDir} buildUrl={buildUrl} />
                <th className="px-5 py-3 font-medium">Channels</th>
                <SortHeader label="Last Interaction" field="last_interaction_at" currentSort={sortField} currentDir={sortDir} buildUrl={buildUrl} />
                <SortHeader label="Interactions" field="interaction_count" currentSort={sortField} currentDir={sortDir} buildUrl={buildUrl} />
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center">
                    <Users className="w-10 h-10 text-[var(--text-muted)] mx-auto mb-3" />
                    <p className="text-[var(--text-muted)]">No persons found.</p>
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
                      href={`/admin/persons/${row.id}`}
                      className="text-[var(--accent-indigo)] hover:underline font-medium"
                    >
                      {row.full_name}
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-[var(--text-secondary)]">
                    {row.primary_org_name || <span className="text-[var(--text-muted)]">&mdash;</span>}
                  </td>
                  <td className="px-5 py-3 text-[var(--text-muted)]">
                    {row.title || "\u2014"}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-1.5">
                      {row.email && <Mail className="w-3.5 h-3.5 text-[var(--text-muted)]" />}
                      {row.linkedin_url && <Linkedin className="w-3.5 h-3.5 text-[var(--text-muted)]" />}
                      {row.twitter_handle && <Twitter className="w-3.5 h-3.5 text-[var(--text-muted)]" />}
                      {row.telegram_handle && <Send className="w-3.5 h-3.5 text-[var(--text-muted)]" />}
                      {row.phone && <Phone className="w-3.5 h-3.5 text-[var(--text-muted)]" />}
                    </div>
                  </td>
                  <td className="px-5 py-3 text-[var(--text-muted)]">
                    {row.last_interaction_at
                      ? new Date(row.last_interaction_at).toLocaleDateString()
                      : "\u2014"}
                  </td>
                  <td className="px-5 py-3 text-[var(--text-muted)]">
                    {row.interaction_count}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="px-5 py-3 border-t border-[var(--glass-border)]">
          <p className="text-xs text-[var(--text-muted)]">{rows.length} persons</p>
        </div>
      </GlassCard>
    </div>
  );
}
