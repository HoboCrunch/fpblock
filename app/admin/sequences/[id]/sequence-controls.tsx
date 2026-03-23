"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Play, Pause, Square } from "lucide-react";
import { updateSequenceStatus } from "../actions";

export function SequenceControls({
  sequenceId,
  status,
}: {
  sequenceId: string;
  status: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  async function handleStatusChange(newStatus: string) {
    const result = await updateSequenceStatus(sequenceId, newStatus);
    if (result.success) {
      startTransition(() => router.refresh());
    }
  }

  return (
    <div className="flex items-center gap-2">
      {status !== "active" && status !== "completed" && (
        <button
          onClick={() => handleStatusChange("active")}
          disabled={isPending}
          className={cn(
            "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200",
            "bg-green-500/10 text-green-400 border border-green-500/20",
            "hover:bg-green-500/20",
            "disabled:opacity-50 disabled:cursor-not-allowed"
          )}
        >
          <Play className="h-4 w-4" />
          Start
        </button>
      )}
      {status === "active" && (
        <button
          onClick={() => handleStatusChange("paused")}
          disabled={isPending}
          className={cn(
            "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200",
            "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20",
            "hover:bg-yellow-500/20",
            "disabled:opacity-50 disabled:cursor-not-allowed"
          )}
        >
          <Pause className="h-4 w-4" />
          Pause
        </button>
      )}
      {(status === "active" || status === "paused") && (
        <button
          onClick={() => handleStatusChange("completed")}
          disabled={isPending}
          className={cn(
            "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200",
            "bg-red-500/10 text-red-400 border border-red-500/20",
            "hover:bg-red-500/20",
            "disabled:opacity-50 disabled:cursor-not-allowed"
          )}
        >
          <Square className="h-4 w-4" />
          Stop
        </button>
      )}
    </div>
  );
}
