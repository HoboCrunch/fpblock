import type { CompanySignal } from "@/lib/types/database";
import { Badge } from "@/components/ui/badge";

export function SignalsTimeline({ signals }: { signals: CompanySignal[] }) {
  if (signals.length === 0) {
    return <p className="text-gray-500 text-sm">No signals yet.</p>;
  }

  return (
    <div className="space-y-3">
      {signals.map((signal) => (
        <div key={signal.id} className="flex items-start gap-3 bg-gray-900 border border-gray-800 rounded p-3">
          <Badge>{signal.signal_type}</Badge>
          <div className="flex-1">
            <p className="text-sm text-gray-300">{signal.description}</p>
            {signal.date && (
              <p className="text-xs text-gray-500 mt-1">{signal.date}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
