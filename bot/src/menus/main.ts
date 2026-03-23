// bot/src/menus/main.ts — Main menu keyboard + callback router

import { Bot, InlineKeyboard } from "grammy";
import { dashboardText, dashboardKeyboard } from "./dashboard.js";
import { inboxText, inboxKeyboard } from "./inbox.js";
import { enrichText, enrichKeyboard, enrichTargetsText, enrichTargetsKeyboard, triggerEnrichment } from "./enrich.js";
import { activityText, activityKeyboard } from "./activity.js";
import { settingsText, settingsKeyboard, muteState } from "./settings.js";

const CHAT_ID = () => process.env.TELEGRAM_CHAT_ID!;

function mainText(): string {
  return "🤖 <b>FP Block CRM Bot</b>\n\nSelect an option:";
}

function mainKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("📊 Dashboard", "menu:dashboard")
    .text("📬 Inbox", "menu:inbox")
    .text("🔍 Enrich", "menu:enrich")
    .row()
    .text("⚙️ Settings", "menu:settings")
    .text("📋 Recent Activity", "menu:activity");
}

export function registerMenuHandlers(bot: Bot): void {
  bot.command("start", async (ctx) => {
    if (String(ctx.chat.id) !== CHAT_ID()) return;
    await ctx.reply(mainText(), {
      parse_mode: "HTML",
      reply_markup: mainKeyboard(),
    });
  });

  bot.on("callback_query:data", async (ctx) => {
    if (String(ctx.chat?.id) !== CHAT_ID()) return;

    const data = ctx.callbackQuery.data;
    await ctx.answerCallbackQuery();

    try {
      const { text, keyboard } = await routeCallback(data);
      await ctx.editMessageText(text, {
        parse_mode: "HTML",
        reply_markup: keyboard,
        link_preview_options: { is_disabled: true },
      });
    } catch (err) {
      console.error("[menu] Error handling callback:", data, err);
    }
  });
}

async function routeCallback(data: string): Promise<{ text: string; keyboard: InlineKeyboard }> {
  switch (data) {
    case "menu:main":
      return { text: mainText(), keyboard: mainKeyboard() };

    case "menu:dashboard":
      return { text: await dashboardText(), keyboard: dashboardKeyboard() };

    case "menu:inbox":
      return { text: await inboxText(), keyboard: inboxKeyboard() };

    case "menu:enrich":
      return { text: enrichText(), keyboard: enrichKeyboard() };

    case "enrich:targets":
      return { text: enrichTargetsText(), keyboard: enrichTargetsKeyboard() };

    case "menu:activity":
      return { text: await activityText(), keyboard: activityKeyboard() };

    case "menu:settings":
      return { text: settingsText(), keyboard: settingsKeyboard() };

    default:
      if (data.startsWith("settings:mute:")) {
        const mins = parseInt(data.split(":")[2], 10);
        muteState.muteFor(mins);
        return { text: settingsText(), keyboard: settingsKeyboard() };
      }
      if (data === "settings:unmute") {
        muteState.unmute();
        return { text: settingsText(), keyboard: settingsKeyboard() };
      }
      if (data.startsWith("enrich:run:")) {
        const target = data.split(":")[2];
        const result = await triggerEnrichment(target);
        return {
          text: `🔍 <b>Enrichment</b>\n\n${result}`,
          keyboard: new InlineKeyboard()
            .text("📊 View Jobs", "menu:activity")
            .text("← Back", "menu:enrich"),
        };
      }
      if (data === "inbox:sync") {
        const appUrl = process.env.APP_URL || "http://localhost:3000";
        try {
          await fetch(`${appUrl}/api/inbox/sync`, { method: "POST" });
        } catch { /* best-effort */ }
        return {
          text: "📬 <b>Inbox</b>\n\n🔄 Sync triggered. Refreshing...",
          keyboard: inboxKeyboard(),
        };
      }

      return { text: mainText(), keyboard: mainKeyboard() };
  }
}
