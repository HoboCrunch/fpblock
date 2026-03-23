import { createClient } from "@/lib/supabase/server";
import { GlassCard } from "@/components/ui/glass-card";
import Link from "next/link";
import { Calendar, Users, Building2, Mic2 } from "lucide-react";
import type { Event, EventParticipation } from "@/lib/types/database";

export default async function EventsListPage() {
  const supabase = await createClient();

  const { data: events } = await supabase
    .from("events")
    .select("*")
    .order("date_start", { ascending: false, nullsFirst: false });

  const eventIds = (events || []).map((e: Event) => e.id);

  // Fetch all event_participations for these events
  const { data: participations } = eventIds.length
    ? await supabase
        .from("event_participations")
        .select("event_id, role, person_id, organization_id")
        .in("event_id", eventIds)
    : { data: [] as EventParticipation[] };

  // Compute counts per event
  type RoleCounts = { speakers: number; sponsors: number; contacts: number };
  const countsByEvent: Record<string, RoleCounts> = {};

  for (const p of participations || []) {
    const eid = p.event_id;
    if (!countsByEvent[eid]) countsByEvent[eid] = { speakers: 0, sponsors: 0, contacts: 0 };
    if (p.role === "speaker" || p.role === "panelist" || p.role === "mc") {
      countsByEvent[eid].speakers++;
    } else if (p.role === "sponsor" || p.role === "partner" || p.role === "exhibitor") {
      countsByEvent[eid].sponsors++;
    }
    // All person-level participations count as related contacts
    if (p.person_id) {
      countsByEvent[eid].contacts++;
    }
  }

  function formatDate(dateStr: string | null) {
    if (!dateStr) return null;
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  const eventTypeBadgeColor: Record<string, string> = {
    conference: "bg-[var(--accent-orange)]/15 text-[var(--accent-orange)]",
    hackathon: "bg-purple-500/15 text-purple-400",
    summit: "bg-blue-500/15 text-blue-400",
    meetup: "bg-green-500/15 text-green-400",
    workshop: "bg-yellow-500/15 text-yellow-400",
  };

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
          {(events || []).map((event: Event) => {
            const counts = countsByEvent[event.id] || { speakers: 0, sponsors: 0, contacts: 0 };
            return (
              <Link key={event.id} href={`/admin/events/${event.id}`}>
                <GlassCard hover glow className="h-full flex flex-col">
                  <div className="flex-1">
                    <div className="flex items-start justify-between mb-2">
                      <h2 className="text-lg font-semibold font-[family-name:var(--font-heading)] text-white">
                        {event.name}
                      </h2>
                      <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                        {event.event_type && (
                          <span
                            className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                              eventTypeBadgeColor[event.event_type.toLowerCase()] ||
                              "bg-white/10 text-[var(--text-secondary)]"
                            }`}
                          >
                            {event.event_type}
                          </span>
                        )}
                        <Calendar className="w-5 h-5 text-[var(--accent-orange)]" />
                      </div>
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
                      <Mic2 className="w-3.5 h-3.5" />
                      <span>{counts.speakers} speakers</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
                      <Building2 className="w-3.5 h-3.5" />
                      <span>{counts.sponsors} sponsors</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
                      <Users className="w-3.5 h-3.5" />
                      <span>{counts.contacts} total</span>
                    </div>
                  </div>
                </GlassCard>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
