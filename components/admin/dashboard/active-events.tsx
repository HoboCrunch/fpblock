import Link from "next/link";
import { cn } from "@/lib/utils";
import type { UpcomingEvent } from "./event-focus-banner";

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

interface Props {
  events: UpcomingEvent[];
}

export function ActiveEvents({ events }: Props) {
  // Skip the first event (it's already in the focus banner).
  const rest = events.slice(1, 6);

  return (
    <section className="glass rounded-xl p-6 h-full flex flex-col">
      <header className="flex items-baseline justify-between mb-4">
        <div>
          <h2 className="font-[family-name:var(--font-heading)] text-lg font-semibold text-white">
            Upcoming events
          </h2>
          <p className="text-xs text-white/40 mt-0.5">
            {events.length} active · ranked by date
          </p>
        </div>
        <Link
          href="/admin/events"
          className="text-xs text-white/50 hover:text-white transition-colors"
        >
          All events →
        </Link>
      </header>

      {rest.length === 0 ? (
        <p className="text-sm text-white/40 py-8 text-center">
          {events.length > 0
            ? "All upcoming events shown above."
            : "No upcoming events."}
        </p>
      ) : (
        <ul className="flex-1 space-y-1.5">
          {rest.map((e) => {
            const days = daysUntil(e.date_start);
            const reachPct =
              e.persons_count > 0
                ? Math.round((e.sent_count / e.persons_count) * 100)
                : 0;
            return (
              <li key={e.event_id}>
                <Link
                  href={`/admin/events/${e.event_id}`}
                  className={cn(
                    "group flex items-center gap-4 rounded-lg px-3 py-2.5",
                    "ring-1 ring-white/[0.06] bg-white/[0.02]",
                    "hover:bg-white/[0.05] hover:ring-white/[0.12] transition-all duration-200",
                  )}
                >
                  {/* Countdown chip */}
                  <div
                    className={cn(
                      "shrink-0 w-14 text-center rounded-md py-1.5",
                      "bg-white/[0.04] ring-1 ring-white/[0.06]",
                    )}
                  >
                    {days !== null ? (
                      <>
                        <div className="font-[family-name:var(--font-heading)] text-lg font-semibold text-white leading-none tabular-nums">
                          {days >= 0 ? days : 0}
                        </div>
                        <div className="text-[9px] uppercase tracking-wider text-white/40 mt-0.5">
                          {days === 0 ? "today" : days === 1 ? "day" : "days"}
                        </div>
                      </>
                    ) : (
                      <div className="text-[10px] uppercase tracking-wider text-white/40 py-1">
                        TBD
                      </div>
                    )}
                  </div>

                  {/* Identity */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white/90 truncate group-hover:text-white">
                      {e.name}
                    </p>
                    <p className="text-[11px] text-white/40 truncate">
                      {e.location || "Location TBD"}
                    </p>
                  </div>

                  {/* Metrics */}
                  <div className="hidden sm:flex items-center gap-4 text-right shrink-0">
                    <Stat label="Pool" value={e.persons_count} />
                    <Stat
                      label="Qual"
                      value={e.qualified_count}
                      accent="indigo"
                    />
                    <Stat
                      label="Reach"
                      value={`${reachPct}%`}
                      accent="orange"
                    />
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  accent = "neutral",
}: {
  label: string;
  value: string | number;
  accent?: "orange" | "indigo" | "neutral";
}) {
  const display =
    typeof value === "number" ? value.toLocaleString() : value;
  const accentClass =
    accent === "orange"
      ? "text-[var(--accent-orange)]"
      : accent === "indigo"
        ? "text-[var(--accent-indigo)]"
        : "text-white/80";
  return (
    <div className="flex flex-col items-end">
      <span
        className={cn(
          "text-sm font-medium tabular-nums leading-none",
          accentClass,
        )}
      >
        {display}
      </span>
      <span className="text-[9px] uppercase tracking-wider text-white/30 mt-0.5">
        {label}
      </span>
    </div>
  );
}
