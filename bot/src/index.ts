// bot/src/index.ts — Entry point: starts Grammy bot + Supabase Realtime

import { Bot } from "grammy";
import { registerMenuHandlers } from "./menus/main.js";
import { startRealtimeSubscriptions, stopRealtime } from "./realtime.js";

async function main() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("Missing TELEGRAM_BOT_TOKEN");

  console.log("[bot] Starting FP Block CRM Bot...");

  // Initialize Grammy bot
  const bot = new Bot(token);
  registerMenuHandlers(bot);

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

  // Start long-polling
  await bot.start({
    onStart: () => console.log("[bot] Grammy polling started"),
  });
}

main().catch((err) => {
  console.error("[bot] Fatal error:", err);
  process.exit(1);
});
