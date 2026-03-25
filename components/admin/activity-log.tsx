"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

interface ActivityEntry {
  id: string;
  updated_at: string;
  status: string;
  sequence_step: number | null;
  type: string;
}

interface ActivityLogProps {
  sequenceId: string;
}

function describeEntry(entry: ActivityEntry): string {
  const step = entry.sequence_step != null ? ` (Step ${entry.sequence_step})` : "";
  switch (entry.status) {
    case "sent":
      return `Message sent${step}`;
    case "delivered":
      return `Message delivered${step}`;
    case "opened":
      return `Message opened${step}`;
    case "clicked":
      return `Link clicked${step}`;
    case "replied":
      return `Reply received${step}`;
    case "bounced":
      return `Message bounced${step}`;
    case "failed":
      return `Send failed${step}`;
    case "scheduled":
      return `Message scheduled${step}`;
    default:
      return `Status: ${entry.status}${step}`;
  }
}

export function ActivityLog({ sequenceId }: ActivityLogProps) {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!sequenceId) return;
    const supabase = createClient();

    supabase
      .from("interactions")
      .select("id, updated_at, status, sequence_step, type")
      .eq("sequence_id", sequenceId)
      .order("updated_at", { ascending: false })
      .limit(20)
      .then(({ data }) => {
        setEntries((data as ActivityEntry[]) ?? []);
        setLoading(false);
      });
  }, [sequenceId]);

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-8 rounded bg-white/[0.03] animate-pulse" />
        ))}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <p className="text-xs text-[var(--text-muted)] py-2">No activity yet.</p>
    );
  }

  return (
    <div className="max-h-60 overflow-y-auto space-y-1 scrollbar-thin">
      {entries.map((entry) => (
        <div key={entry.id} className="flex items-center justify-between py-1.5 border-b border-[var(--glass-border)] last:border-0">
          <span className="text-xs text-[var(--text-secondary)]">{describeEntry(entry)}</span>
          <span className="text-xs text-[var(--text-muted)] shrink-0 ml-3">
            {timeAgo(entry.updated_at)}
          </span>
        </div>
      ))}
    </div>
  );
}
