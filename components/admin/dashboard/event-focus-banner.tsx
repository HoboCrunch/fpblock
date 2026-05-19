import Link from "next/link";
import { CalendarClock, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface UpcomingEvent {
  event_id: string;
  name: string;
  slug: string | null;
  location: string | null;
  date_start: string | null;
  date_end: string | null;
  persons_count: number;
  qualified_count: number;
  sent_count: number;
  replied_count: number;
}

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const ms = d.getTime() - today.getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

function formatDateRange(start: string | null, end: string | null): string {
  if (!start) return "Date TBD";
  const s = new Date(start);
  if (Number.isNaN(s.getTime())) return "Date TBD";
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  const sFmt = s.toLocaleDateString("en-US", opts);
  if (!end) return sFmt;
  const e = new Date(end);
  if (Number.isNaN(e.getTime())) return sFmt;
  const sameMonth = s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear();
  if (sameMonth) {
    return `${s.toLocaleDateString("en-US", { month: "short" })} ${s.getDate()}–${e.getDate()}, ${e.getFullYear()}`;
  }
  return `${sFmt} – ${e.toLocaleDateString("en-US", { ...opts, year: "numeric" })}`;
}

interface Props {
  event: UpcomingEvent | null;
}

export function EventFocusBanner({ event }: Props) {
  if (!event) {
    return (
      <div className="glass rounded-xl p-6 border-l-2 border-l-[var(--accent-orange)]/40">
        <div className="flex items-center gap-3">
          <CalendarClock className="h-5 w-5 text-white/30" />
          <p className="text-sm text-white/50">
            No upcoming events. Create one to focus the team.
          </p>
        </div>
      </div>
    );
  }

  const days = daysUntil(event.date_start);
  const reachPct = event.persons_count > 0
    ? Math.round((event.sent_count / event.persons_count) * 100)
    : 0;
  const replyPct = event.sent_count > 0
    ? Math.round((event.replied_count / event.sent_count) * 100)
    : 0;

  const countdownLabel =
    days === null
      ? null
      : days > 0
        ? `${days} day${days === 1 ? "" : "s"} out`
        : days === 0
          ? "Today"
          : `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} ago`;

  const href = `/admin/events/${event.event_id}`;

  return (
    <Link
      href={href}
      className={cn(
        "group relative block rounded-xl overflow-hidden",
        "glass border-l-2 border-l-[var(--accent-orange)] transition-all duration-200",
        "hover:bg-[var(--glass-bg-hover)]",
      )}
    >
      {/* Subtle orange glow on the left */}
      <div
        className="pointer-events-none absolute inset-y-0 left-0 w-1/3 opacity-[0.06]"
        style={{
          background:
            "radial-gradient(60% 100% at 0% 50%, var(--accent-orange) 0%, transparent 70%)",
        }}
      />

      <div className="relative flex flex-col md:flex-row md:items-center gap-6 p-6">
        {/* Left: event identity */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-[var(--accent-orange)]/90 font-medium">
            <CalendarClock className="h-3.5 w-3.5" />
            Focus Event
            {countdownLabel && (
              <span className="text-white/40 normal-case tracking-normal">
                · {countdownLabel}
              </span>
            )}
          </div>
          <h2 className="mt-2 font-[family-name:var(--font-heading)] text-2xl md:text-3xl font-semibold text-white leading-tight truncate">
            {event.name}
          </h2>
          <p className="mt-1 text-sm text-white/50 flex items-center gap-2">
            <span>{formatDateRange(event.date_start, event.date_end)}</span>
            {event.location && (
              <>
                <span className="text-white/20">·</span>
                <span className="truncate">{event.location}</span>
              </>
            )}
          </p>
        </div>

        {/* Right: inline KPIs */}
        <div className="grid grid-cols-4 gap-x-6 md:gap-x-8 shrink-0">
          <BannerStat label="Audience" value={event.persons_count.toLocaleString()} />
          <BannerStat
            label="Qualified"
            value={event.qualified_count.toLocaleString()}
            accent="indigo"
          />
          <BannerStat
            label="Reached"
            value={`${reachPct}%`}
            accent="orange"
          />
          <BannerStat
            label="Reply"
            value={`${replyPct}%`}
            accent="emerald"
          />
        </div>

        <ArrowUpRight
          className={cn(
            "absolute top-5 right-5 h-4 w-4 text-white/20 transition-all",
            "group-hover:text-white/60 group-hover:translate-x-0.5 group-hover:-translate-y-0.5",
          )}
        />
      </div>
    </Link>
  );
}

function BannerStat({
  label,
  value,
  accent = "neutral",
}: {
  label: string;
  value: string;
  accent?: "orange" | "indigo" | "emerald" | "neutral";
}) {
  const accentClass =
    accent === "orange"
      ? "text-[var(--accent-orange)]"
      : accent === "indigo"
        ? "text-[var(--accent-indigo)]"
        : accent === "emerald"
          ? "text-emerald-400"
          : "text-white";

  return (
    <div className="flex flex-col items-start">
      <span className="text-[10px] uppercase tracking-wider text-white/40 font-medium">
        {label}
      </span>
      <span
        className={cn(
          "font-[family-name:var(--font-heading)] text-xl md:text-2xl font-semibold tabular-nums",
          accentClass,
        )}
      >
        {value}
      </span>
    </div>
  );
}
