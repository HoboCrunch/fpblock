import Link from "next/link";
import { cn } from "@/lib/utils";

interface OrgEvent {
  event_id: string;
  event_name: string;
  tier: string | null;
  role: string;
}

interface OrgPerson {
  id: string;
  full_name: string;
  enrichment_status: string;
}

interface PersonSpeaking {
  person_id: string;
  person_name: string;
  event_id: string;
  event_name: string;
}

interface OrgCorrelationSummaryProps {
  orgEvents: OrgEvent[];
  people: OrgPerson[];
  peopleSpeaking: PersonSpeaking[];
  signalCount: number;
  icpScore: number | null;
}

export function OrgCorrelationSummary({
  orgEvents,
  people,
  peopleSpeaking,
  signalCount,
  icpScore,
}: OrgCorrelationSummaryProps) {
  if (orgEvents.length === 0 && people.length === 0) return null;

  const enrichedCount = people.filter(
    (p) => p.enrichment_status === "complete"
  ).length;
  const speakerCount = new Set(peopleSpeaking.map((ps) => ps.person_id)).size;

  // Primary event = first one (usually the main one)
  const [primary, ...additional] = orgEvents;

  // Count people per event for additional line
  function peopleAtEvent(eventId: string): number {
    return peopleSpeaking.filter((ps) => ps.event_id === eventId).length;
  }

  return (
    <div className="glass rounded-xl px-5 py-3 space-y-1">
      {/* Primary line */}
      <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
        {primary && (
          <>
            {primary.tier && (
              <span className="text-white font-medium">
                {primary.tier} Sponsor
              </span>
            )}
            {primary.tier && " at "}
            {!primary.tier && (
              <span className="text-white font-medium capitalize">
                {primary.role}
              </span>
            )}
            {!primary.tier && " at "}
            <Link
              href={`/admin/events/${primary.event_id}`}
              className="text-[var(--accent-indigo)] hover:underline"
            >
              {primary.event_name}
            </Link>
            {" · "}
          </>
        )}
        <span className="text-white font-medium">{enrichedCount}</span>
        {" enriched contacts"}
        {speakerCount > 0 && (
          <>
            {" ("}
            <span className="text-white font-medium">{speakerCount}</span>
            {" speakers)"}
          </>
        )}
        {signalCount > 0 && (
          <>
            {" · "}
            <span className="text-white font-medium">{signalCount}</span>
            {" signals"}
          </>
        )}
        {icpScore != null && (
          <>
            {" · ICP "}
            <span
              className={cn(
                "font-bold",
                icpScore >= 90
                  ? "text-emerald-400"
                  : icpScore >= 75
                  ? "text-yellow-400"
                  : "text-gray-400"
              )}
            >
              {icpScore}
            </span>
          </>
        )}
      </p>

      {/* Additional events */}
      {additional.length > 0 && (
        <p className="text-xs text-[var(--text-muted)] leading-relaxed">
          Also:{" "}
          {additional.map((evt, i) => (
            <span key={evt.event_id}>
              {i > 0 && " · "}
              {evt.tier && (
                <span className="text-[var(--text-secondary)]">
                  {evt.tier}
                </span>
              )}
              {evt.tier ? " at " : ""}
              {!evt.tier && (
                <span className="text-[var(--text-secondary)] capitalize">
                  {evt.role}
                </span>
              )}
              {!evt.tier ? " at " : ""}
              <Link
                href={`/admin/events/${evt.event_id}`}
                className="text-[var(--accent-indigo)] hover:underline"
              >
                {evt.event_name}
              </Link>
              {" · "}
              {people.length} people linked
            </span>
          ))}
        </p>
      )}
    </div>
  );
}
