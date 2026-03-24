// bot/src/supabase.ts — Single Supabase client using service_role key
// Service role bypasses RLS — correct for a server-side bot

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import ws from "ws";

let client: SupabaseClient | null = null;

/** Single client for both Realtime and queries — service_role key bypasses RLS */
export function getSupabase(): SupabaseClient {
  if (client) return client;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  console.log(`[supabase] Client using key: ${key.slice(0, 20)}...`);
  client = createClient(url, key, {
    realtime: {
      timeout: 30000,
      transport: ws as any,
    },
  });
  return client;
}

/** @deprecated Use getSupabase() — kept for import compatibility */
export const getRealtimeSupabase = getSupabase;
