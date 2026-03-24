// bot/src/index.ts — Entry point: starts Grammy bot + Supabase Realtime

import { Bot } from "grammy";
import { registerMenuHandlers } from "./menus/main.js";
import { startRealtimeSubscriptions, stopRealtime } from "./realtime.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("Missing TELEGRAM_BOT_TOKEN");

  console.log("[bot] Starting FP Block CRM Bot...");

  // Initialize Grammy bot
  const bot = new Bot(token);
  registerMenuHandlers(bot);

  // Drop any pending getUpdates from a previous instance
  try {
    await bot.api.deleteWebhook({ drop_pending_updates: true });
    console.log("[bot] Cleared pending updates");
  } catch (err) {
    console.warn("[bot] Could not clear pending updates:", err);
  }

  // Start Supabase Realtime subscriptions
  const channel = startRealtimeSubscriptions();
  console.log("[bot] Realtime subscriptions active");

  // Graceful shutdown
  const shutdown = async () => {
    console.log("[bot] Shutting down...");
    stopRealtime();
    await bot.stop();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Heartbeat logging
  setInterval(() => {
    console.log(`[bot] heartbeat — ${new Date().toISOString()}`);
  }, 60_000);

  // Start long-polling with retry on conflict
  const maxRetries = 5;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await bot.start({
        onStart: () => console.log("[bot] Grammy polling started"),
      });
      break; // Clean exit from bot.stop()
    } catch (err: any) {
      if (err?.error_code === 409 && attempt < maxRetries) {
        console.warn(`[bot] Grammy conflict (attempt ${attempt}/${maxRetries}), retrying in ${attempt * 3}s...`);
        await sleep(attempt * 3000);
      } else {
        throw err;
      }
    }
  }
}

main().catch((err) => {
  console.error("[bot] Fatal error:", err);
  process.exit(1);
});
