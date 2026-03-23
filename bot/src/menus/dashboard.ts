// bot/src/menus/dashboard.ts — Dashboard stats query + render

import { InlineKeyboard } from "grammy";
import { getSupabase } from "../supabase.js";

export async function dashboardText(): Promise<string> {
  const sb = getSupabase();

  const [persons, orgs, interactions, replied, pipeline, activeJobs] = await Promise.all([
    sb.from("persons").select("id", { count: "exact", head: true }),
    sb.from("organizations").select("id", { count: "exact", head: true }),
    sb.from("interactions").select("id", { count: "exact", head: true }),
    sb.from("interactions").select("id", { count: "exact", head: true }).eq("status", "replied"),
    sb.from("interactions").select("status"),
    sb.from("job_log").select("id, job_type, metadata", { count: "exact" }).eq("status", "processing"),
  ]);

  const statusCounts: Record<string, number> = {};
  for (const row of pipeline.data || []) {
    statusCounts[row.status] = (statusCounts[row.status] || 0) + 1;
  }

  const jobInfo = activeJobs.count
    ? `Active Jobs: ${activeJobs.count} (${(activeJobs.data || []).map((j) => j.job_type).join(", ")})`
    : "Active Jobs: None";

  return [
    "📊 <b>Dashboard</b>",
    "",
    `Persons: ${persons.count ?? 0}  |  Organizations: ${orgs.count ?? 0}`,
    `Interactions: ${interactions.count ?? 0}  |  Replied: ${replied.count ?? 0}`,
    "",
    "<b>Pipeline:</b>",
    `  Draft: ${statusCounts["draft"] || 0} | Scheduled: ${statusCounts["scheduled"] || 0} | Sent: ${statusCounts["sent"] || 0}`,
    `  Opened: ${statusCounts["opened"] || 0} | Replied: ${statusCounts["replied"] || 0} | Bounced: ${statusCounts["bounced"] || 0}`,
    "",
    jobInfo,
  ].join("\n");
}

export function dashboardKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("🔄 Refresh", "menu:dashboard")
    .text("← Back", "menu:main");
}
