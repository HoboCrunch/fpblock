import { createClient } from "@/lib/supabase/server";
import { GlassCard } from "@/components/ui/glass-card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import {
  Mail,
  Linkedin,
  Twitter,
  Send,
  ChevronLeft,
  ChevronRight,
  Users,
} from "lucide-react";

const STATUS_ORDER: Record<string, number> = {
  failed: 0,
  bounced: 1,
  draft: 2,
  scheduled: 3,
  sending: 4,
  sent: 5,
  delivered: 6,
  opened: 7,
  replied: 8,
};

const PAGE_SIZE = 25;

interface SearchParams {
  search?: string;
  icp_min?: string;
  icp_max?: string;
  has_email?: string;
  outreach_status?: string;
  event?: string;
  company?: string;
  page?: string;
}

export default async function ContactsListPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const page = Math.max(1, parseInt(params.page || "1", 10));
  const offset = (page - 1) * PAGE_SIZE;

  // Build contacts query with primary company
  let query = supabase
    .from("contacts")
    .select(
      "*, contact_company(*, company:companies(id, name, icp_score)), messages(id, status, updated_at)",
      { count: "exact" }
    );

  if (params.search) {
    query = query.or(
      `full_name.ilike.%${params.search}%,email.ilike.%${params.search}%`
    );
  }

  if (params.has_email === "yes") {
    query = query.not("email", "is", null);
  } else if (params.has_email === "no") {
    query = query.is("email", null);
  }

  const { data: contacts, count } = await query
    .order("full_name")
    .range(offset, offset + PAGE_SIZE - 1);

  // Fetch events for filter dropdown
  const { data: events } = await supabase
    .from("events")
    .select("id, name")
    .order("name");

  // Fetch companies for filter dropdown
  const { data: companies } = await supabase
    .from("companies")
    .select("id, name")
    .order("name");

  // If event filter is set, get contact IDs for that event
  let eventContactIds: Set<string> | null = null;
  if (params.event) {
    const { data: contactEvents } = await supabase
      .from("contact_event")
      .select("contact_id")
      .eq("event_id", params.event);
    eventContactIds = new Set(
      (contactEvents || []).map((ce: { contact_id: string }) => ce.contact_id)
    );
  }

  // If company filter is set, get contact IDs for that company
  let companyContactIds: Set<string> | null = null;
  if (params.company) {
    const { data: contactCompanies } = await supabase
      .from("contact_company")
      .select("contact_id")
      .eq("company_id", params.company);
    companyContactIds = new Set(
      (contactCompanies || []).map(
        (cc: { contact_id: string }) => cc.contact_id
      )
    );
  }

  // Process contacts with computed fields
  const rows = (contacts || [])
    .map((contact: any) => {
      const primaryAff =
        contact.contact_company?.find((cc: any) => cc.is_primary) ||
        contact.contact_company?.[0];
      const company = primaryAff?.company;
      const icpScore = company?.icp_score ?? null;

      // Compute outreach status (most advanced message status)
      const msgs = contact.messages || [];
      let outreachStatus = "Not Contacted";
      let lastTouched = contact.created_at;

      if (msgs.length > 0) {
        let bestOrder = -1;
        let maxUpdated = "";
        for (const m of msgs) {
          const order = STATUS_ORDER[m.status] ?? -1;
          if (order > bestOrder) {
            bestOrder = order;
            outreachStatus = m.status;
          }
          if (m.updated_at && m.updated_at > maxUpdated) {
            maxUpdated = m.updated_at;
          }
        }
        if (maxUpdated) lastTouched = maxUpdated;
      }

      return {
        id: contact.id,
        full_name: contact.full_name,
        title: contact.title,
        email: contact.email,
        linkedin: contact.linkedin,
        twitter: contact.twitter,
        telegram: contact.telegram,
        company_name: company?.name || null,
        company_id: company?.id || null,
        icp_score: icpScore,
        outreach_status: outreachStatus,
        last_touched: lastTouched,
      };
    })
    .filter((row: any) => {
      // Apply client-side filters that can't be done in the query
      if (params.icp_min && (row.icp_score === null || row.icp_score < parseInt(params.icp_min))) return false;
      if (params.icp_max && row.icp_score !== null && row.icp_score > parseInt(params.icp_max)) return false;
      if (params.outreach_status && row.outreach_status !== params.outreach_status) return false;
      if (eventContactIds && !eventContactIds.has(row.id)) return false;
      if (companyContactIds && !companyContactIds.has(row.id)) return false;
      return true;
    });

  const totalPages = Math.ceil((count || 0) / PAGE_SIZE);

  function buildUrl(overrides: Record<string, string | undefined>) {
    const p = new URLSearchParams();
    const merged = { ...params, ...overrides };
    for (const [k, v] of Object.entries(merged)) {
      if (v && v !== "" && v !== "all") p.set(k, v);
    }
    return `/admin/contacts?${p.toString()}`;
  }

  function icpBadgeVariant(score: number | null) {
    if (score === null) return "default";
    if (score >= 90) return "replied";
    if (score >= 75) return "scheduled";
    return "default";
  }

  function statusBadgeVariant(status: string) {
    if (status === "Not Contacted") return "not_contacted";
    return status;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold font-[family-name:var(--font-heading)]">
        Contacts
      </h1>

      {/* Filters */}
      <GlassCard padding={false} className="p-4">
        <form className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            name="search"
            placeholder="Search contacts..."
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
            name="has_email"
            defaultValue={params.has_email || ""}
            className="glass rounded-lg px-3 py-2 text-sm text-[var(--text-secondary)] bg-transparent focus:outline-none"
          >
            <option value="">Has Email</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>

          <select
            name="outreach_status"
            defaultValue={params.outreach_status || ""}
            className="glass rounded-lg px-3 py-2 text-sm text-[var(--text-secondary)] bg-transparent focus:outline-none"
          >
            <option value="">Outreach Status</option>
            <option value="Not Contacted">Not Contacted</option>
            <option value="draft">Draft</option>
            <option value="scheduled">Scheduled</option>
            <option value="sent">Sent</option>
            <option value="delivered">Delivered</option>
            <option value="opened">Opened</option>
            <option value="replied">Replied</option>
            <option value="bounced">Bounced</option>
            <option value="failed">Failed</option>
          </select>

          <select
            name="event"
            defaultValue={params.event || ""}
            className="glass rounded-lg px-3 py-2 text-sm text-[var(--text-secondary)] bg-transparent focus:outline-none"
          >
            <option value="">Event</option>
            {(events || []).map((e: any) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>

          <select
            name="company"
            defaultValue={params.company || ""}
            className="glass rounded-lg px-3 py-2 text-sm text-[var(--text-secondary)] bg-transparent focus:outline-none"
          >
            <option value="">Company</option>
            {(companies || []).map((c: any) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <button
            type="submit"
            className="px-4 py-2 text-sm font-medium rounded-lg bg-[var(--accent-orange)]/15 text-[var(--accent-orange)] border border-[var(--accent-orange)]/20 hover:bg-[var(--accent-orange)]/25 transition-all duration-200"
          >
            Filter
          </button>

          <Link
            href="/admin/contacts"
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
                <th className="px-5 py-3 font-medium">Company</th>
                <th className="px-5 py-3 font-medium">Title</th>
                <th className="px-5 py-3 font-medium">ICP</th>
                <th className="px-5 py-3 font-medium">Channels</th>
                <th className="px-5 py-3 font-medium">Outreach Status</th>
                <th className="px-5 py-3 font-medium">Last Touched</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center">
                    <Users className="w-10 h-10 text-[var(--text-muted)] mx-auto mb-3" />
                    <p className="text-[var(--text-muted)]">
                      No contacts found.
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
                      href={`/admin/contacts/${row.id}`}
                      className="text-[var(--accent-indigo)] hover:underline font-medium"
                    >
                      {row.full_name}
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-[var(--text-secondary)]">
                    {row.company_id ? (
                      <Link
                        href={`/admin/companies/${row.company_id}`}
                        className="hover:underline"
                      >
                        {row.company_name}
                      </Link>
                    ) : (
                      <span className="text-[var(--text-muted)]">&mdash;</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-[var(--text-muted)]">
                    {row.title || "\u2014"}
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
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-1.5">
                      {row.email && (
                        <Mail className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                      )}
                      {row.linkedin && (
                        <Linkedin className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                      )}
                      {row.twitter && (
                        <Twitter className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                      )}
                      {row.telegram && (
                        <Send className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <Badge variant={statusBadgeVariant(row.outreach_status)}>
                      {row.outreach_status}
                    </Badge>
                  </td>
                  <td className="px-5 py-3 text-[var(--text-muted)]">
                    {new Date(row.last_touched).toLocaleDateString()}
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
              Page {page} of {totalPages} ({count} contacts)
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
