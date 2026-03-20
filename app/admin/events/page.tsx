import { createClient } from "@/lib/supabase/server";
import { GlassCard } from "@/components/ui/glass-card";
import Link from "next/link";
import { Calendar, Users, Building2, Mail } from "lucide-react";

export default async function EventsListPage() {
  const supabase = await createClient();

  const { data: events } = await supabase
    .from("events")
    .select("*")
    .order("date_start", { ascending: false, nullsFirst: false });

  // Fetch counts for each event
  const eventIds = (events || []).map((e: any) => e.id);

  const [
    { data: contactCounts },
    { data: companyCounts },
    { data: messageCounts },
  ] = await Promise.all([
    supabase
      .from("contact_event")
      .select("event_id")
      .in("event_id", eventIds),
    supabase
      .from("company_event")
      .select("event_id")
      .in("event_id", eventIds),
    supabase
      .from("messages")
      .select("event_id")
      .in("event_id", eventIds),
  ]);

  // Aggregate counts by event_id
  function countBy(data: any[], field: string) {
    const map: Record<string, number> = {};
    for (const row of data || []) {
      const key = row[field];
      map[key] = (map[key] || 0) + 1;
    }
    return map;
  }

  const contactsByEvent = countBy(contactCounts || [], "event_id");
  const companiesByEvent = countBy(companyCounts || [], "event_id");
  const messagesByEvent = countBy(messageCounts || [], "event_id");

  function formatDate(dateStr: string | null) {
    if (!dateStr) return null;
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold font-[family-name:var(--font-heading)]">
        Events
      </h1>

      {(events || []).length === 0 ? (
        <GlassCard>
          <div className="text-center py-8">
            <Calendar className="w-10 h-10 text-[var(--text-muted)] mx-auto mb-3" />
            <p className="text-[var(--text-muted)]">No events found.</p>
          </div>
        </GlassCard>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {(events || []).map((event: any) => (
            <Link key={event.id} href={`/admin/events/${event.id}`}>
              <GlassCard hover glow className="h-full flex flex-col">
                <div className="flex-1">
                  <div className="flex items-start justify-between mb-2">
                    <h2 className="text-lg font-semibold font-[family-name:var(--font-heading)] text-white">
                      {event.name}
                    </h2>
                    <Calendar className="w-5 h-5 text-[var(--accent-orange)] flex-shrink-0 ml-2" />
                  </div>

                  {(event.date_start || event.date_end) && (
                    <p className="text-sm text-[var(--text-secondary)] mb-1">
                      {formatDate(event.date_start)}
                      {event.date_end && ` \u2014 ${formatDate(event.date_end)}`}
                    </p>
                  )}

                  {event.location && (
                    <p className="text-sm text-[var(--text-muted)]">
                      {event.location}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-4 mt-4 pt-3 border-t border-white/[0.06]">
                  <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
                    <Users className="w-3.5 h-3.5" />
                    <span>{contactsByEvent[event.id] || 0}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
                    <Building2 className="w-3.5 h-3.5" />
                    <span>{companiesByEvent[event.id] || 0}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
                    <Mail className="w-3.5 h-3.5" />
                    <span>{messagesByEvent[event.id] || 0}</span>
                  </div>
                </div>
              </GlassCard>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
