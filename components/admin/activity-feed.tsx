import type { JobLog } from "@/lib/types/database";
import { cn } from "@/lib/utils";

export function ActivityFeed({ logs }: { logs: JobLog[] }) {
  if (logs.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-white/40 text-sm">No recent activity.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
      {logs.map((log) => (
        <div
          key={log.id}
          className={cn(
            "flex items-center justify-between rounded-lg px-4 py-3 text-sm",
            "bg-white/[0.02] border border-white/[0.06]",
            "hover:bg-white/[0.05] transition-all duration-200"
          )}
        >
          <div className="flex items-center gap-3 min-w-0">
            <span
              className={cn(
                "w-2 h-2 rounded-full shrink-0",
                log.status === "completed"
                  ? "bg-emerald-500"
                  : log.status === "failed"
                  ? "bg-red-500"
                  : log.status === "running"
                  ? "bg-blue-500 animate-pulse"
                  : "bg-yellow-500"
              )}
            />
            <span className="text-white/70 truncate">
              {log.job_type.replace(/_/g, " ")}
            </span>
            {log.target_table && (
              <span className="text-white/30 text-xs shrink-0">
                {log.target_table}
              </span>
            )}
          </div>
          <span className="text-white/30 text-xs whitespace-nowrap ml-4">
            {new Date(log.created_at).toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  );
}
