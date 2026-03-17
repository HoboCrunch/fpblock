import type { JobLog } from "@/lib/types/database";

export function ActivityFeed({ logs }: { logs: JobLog[] }) {
  if (logs.length === 0) {
    return <p className="text-gray-500 text-sm">No recent activity.</p>;
  }

  return (
    <div className="space-y-2">
      {logs.map((log) => (
        <div
          key={log.id}
          className="flex items-center justify-between bg-gray-900 border border-gray-800 rounded px-4 py-2 text-sm"
        >
          <div className="flex items-center gap-3">
            <span
              className={`w-2 h-2 rounded-full ${
                log.status === "completed"
                  ? "bg-green-500"
                  : log.status === "failed"
                  ? "bg-red-500"
                  : "bg-yellow-500"
              }`}
            />
            <span className="text-gray-300">
              {log.job_type.replace(/_/g, " ")}
            </span>
            {log.target_table && (
              <span className="text-gray-500">
                {log.target_table}
              </span>
            )}
          </div>
          <span className="text-gray-500">
            {new Date(log.created_at).toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  );
}
