import type { OrganizationSignal } from "@/lib/types/database";
import { Badge } from "@/components/ui/badge";

export function SignalsTimeline({ signals }: { signals: OrganizationSignal[] }) {
  if (signals.length === 0) {
    return <p className="text-[var(--text-muted)] text-sm">No signals yet.</p>;
  }

  return (
    <div className="space-y-3">
      {signals.map((signal) => (
        <div
          key={signal.id}
          className="flex items-start gap-3 glass rounded-xl p-3 hover:bg-white/[0.03] transition-all duration-200"
        >
          <Badge>{signal.signal_type}</Badge>
          <div className="flex-1">
            <p className="text-sm text-[var(--text-secondary)]">{signal.description}</p>
            {signal.date && (
              <p className="text-xs text-[var(--text-muted)] mt-1">{signal.date}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
