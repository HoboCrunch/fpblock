// bot/src/menus/activity.ts — Recent job_log query + render

import { InlineKeyboard } from "grammy";
import { getSupabase } from "../supabase.js";

export async function activityText(): Promise<string> {
  const sb = getSupabase();

  const { data: jobs } = await sb
    .from("job_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(10);

  if (!jobs || jobs.length === 0) {
    return "📋 <b>Recent Activity</b>\n\nNo recent jobs.";
  }

  const lines = jobs.map((j) => {
    const icon = j.status === "completed" ? "✅" : j.status === "failed" ? "❌" : "⏳";
    const meta = j.metadata as Record<string, unknown> | null;
    const detail = meta
      ? Object.entries(meta)
          .filter(([k]) => typeof meta[k] === "number")
          .map(([k, v]) => `${v} ${k}`)
          .join(", ")
      : "";
    const ago = timeAgo(j.created_at);
    return `${icon} ${j.job_type}${detail ? ` — ${detail}` : ""} — ${ago}`;
  });

  return [`📋 <b>Recent Activity</b>`, "", ...lines].join("\n");
}

export function activityKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("🔄 Refresh", "menu:activity")
    .text("← Back", "menu:main");
}

function timeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
