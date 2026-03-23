// bot/src/menus/inbox.ts — Recent replies + sync trigger

import { InlineKeyboard } from "grammy";
import { getSupabase } from "../supabase.js";

export async function inboxText(): Promise<string> {
  const sb = getSupabase();

  const { data: emails } = await sb
    .from("inbound_emails")
    .select("id, from_name, subject, body_preview, received_at, person_id, persons ( full_name )")
    .not("person_id", "is", null)
    .order("received_at", { ascending: false })
    .limit(5);

  if (!emails || emails.length === 0) {
    return "📬 <b>Inbox</b>\n\nNo recent replies from pipeline contacts.";
  }

  const lines = emails.map((e: any, i: number) => {
    const name = e.persons?.full_name || e.from_name || "Unknown";
    const subject = e.subject || "(no subject)";
    const ago = timeAgo(e.received_at);
    return `${i + 1}. <b>${name}</b> — "${subject}" — ${ago}`;
  });

  return [`📬 <b>Inbox</b> (${emails.length} recent)`, "", ...lines].join("\n");
}

export function inboxKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("🔄 Sync Now", "inbox:sync")
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
