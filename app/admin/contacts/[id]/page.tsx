import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { GlassCard } from "@/components/ui/glass-card";
import { MessageTable } from "@/components/admin/message-table";
import Link from "next/link";

export default async function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: contact } = await supabase
    .from("contacts")
    .select("*")
    .eq("id", id)
    .single();

  if (!contact) notFound();

  const [
    { data: affiliations },
    { data: events },
    { data: messages },
  ] = await Promise.all([
    supabase
      .from("contact_company")
      .select("*, company:companies(*)")
      .eq("contact_id", id),
    supabase
      .from("contact_event")
      .select("*, event:events(*)")
      .eq("contact_id", id),
    supabase
      .from("messages")
      .select("*, company:companies(id, name)")
      .eq("contact_id", id)
      .order("channel")
      .order("sequence_number")
      .order("iteration", { ascending: false }),
  ]);

  const primaryCompany = affiliations?.find((a: any) => a.is_primary)?.company || affiliations?.[0]?.company;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold font-[family-name:var(--font-heading)]">
          {contact.full_name}
        </h1>
        <p className="text-[var(--text-muted)] text-sm mt-1">
          {contact.title}{primaryCompany ? ` at ${primaryCompany.name}` : ""}
        </p>
        {primaryCompany?.icp_score != null && (
          <Badge variant={primaryCompany.icp_score >= 90 ? "replied" : "scheduled"} className="mt-2">
            ICP {primaryCompany.icp_score}
          </Badge>
        )}
      </div>

      {/* Contact info */}
      <GlassCard>
        <div className="grid grid-cols-2 gap-4">
          {[
            ["Email", contact.email],
            ["LinkedIn", contact.linkedin],
            ["Twitter", contact.twitter],
            ["Telegram", contact.telegram],
            ["Phone", contact.phone],
            ["Source", contact.source],
          ].map(([label, value]) => (
            <div key={label as string}>
              <div className="text-xs text-[var(--text-muted)]">{label}</div>
              <div className="text-sm text-[var(--text-secondary)] mt-0.5">
                {(value as string) || "\u2014"}
              </div>
            </div>
          ))}
        </div>
      </GlassCard>

      {/* Context */}
      {contact.context && (
        <div>
          <h2 className="text-lg font-medium font-[family-name:var(--font-heading)] mb-2">
            Context
          </h2>
          <GlassCard>
            <p className="text-sm text-[var(--text-secondary)]">{contact.context}</p>
          </GlassCard>
        </div>
      )}

      {/* Company affiliations */}
      <div>
        <h2 className="text-lg font-medium font-[family-name:var(--font-heading)] mb-2">
          Companies
        </h2>
        <div className="space-y-2">
          {(affiliations || []).map((aff: any) => (
            <GlassCard key={aff.id} className="flex items-center gap-3 !p-3">
              <Link href={`/admin/companies/${aff.company.id}`} className="text-[var(--accent-indigo)] hover:underline text-sm">
                {aff.company.name}
              </Link>
              <span className="text-[var(--text-muted)] text-sm">{aff.role || "\u2014"}</span>
              {aff.founder_status && <Badge>{aff.founder_status}</Badge>}
              {aff.is_primary && <Badge variant="approved">primary</Badge>}
            </GlassCard>
          ))}
        </div>
      </div>

      {/* Events */}
      <div>
        <h2 className="text-lg font-medium font-[family-name:var(--font-heading)] mb-2">
          Events
        </h2>
        <div className="space-y-2">
          {(events || []).map((ce: any) => (
            <GlassCard key={ce.id} className="flex items-center gap-3 !p-3">
              <Link href={`/admin/events/${ce.event.id}`} className="text-[var(--accent-indigo)] hover:underline text-sm">
                {ce.event.name}
              </Link>
              {ce.participation_type && <Badge>{ce.participation_type}</Badge>}
              {ce.track && <span className="text-[var(--text-muted)] text-sm">{ce.track}</span>}
            </GlassCard>
          ))}
        </div>
      </div>

      {/* Messages */}
      <div>
        <h2 className="text-lg font-medium font-[family-name:var(--font-heading)] mb-2">
          Messages
        </h2>
        <GlassCard padding={false}>
          <MessageTable messages={(messages || []).map((m: any) => ({ ...m, contact: { id: contact.id, full_name: contact.full_name } }))} />
        </GlassCard>
      </div>
    </div>
  );
}
