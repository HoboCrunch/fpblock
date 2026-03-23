// bot/src/menus/enrich.ts — Enrichment target picker + trigger

import { InlineKeyboard } from "grammy";
import { getSupabase } from "../supabase.js";

export function enrichText(): string {
  return "🔍 <b>Enrichment</b>\n\nSelect an action:";
}

export function enrichKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("▶️ Run Full Pipeline", "enrich:targets")
    .text("📊 Active Jobs", "menu:activity")
    .row()
    .text("← Back", "menu:main");
}

export function enrichTargetsText(): string {
  return "Select target:";
}

export function enrichTargetsKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("Unenriched Orgs", "enrich:run:unenriched")
    .text("ICP Below 50", "enrich:run:low_icp")
    .row()
    .text("← Back", "menu:enrich");
}

export async function triggerEnrichment(target: string): Promise<string> {
  const sb = getSupabase();

  let filter: Record<string, unknown> = {};
  if (target === "unenriched") {
    filter = { icp_score: null };
  } else if (target === "low_icp") {
    filter = { icp_below: 50 };
  }

  const { data, error } = await sb.functions.invoke("enrich-company", {
    body: { target, filter },
  });

  if (error) {
    return `❌ Failed to start enrichment: ${error.message}`;
  }

  return `✅ Enrichment pipeline started for "${target}" targets.`;
}
