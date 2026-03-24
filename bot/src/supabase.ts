// bot/src/supabase.ts — Supabase client singleton
// Uses anon key for Realtime WebSocket auth + service role key for REST queries

import { createClient, SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (client) return client;

  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.SUPABASE_ANON_KEY;

  if (!url || !serviceKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  // Use service role key for REST (bypasses RLS)
  // Use anon key for Realtime WebSocket if available (sb_secret_ keys don't work with Realtime)
  client = createClient(url, serviceKey, {
    realtime: {
      params: {
        eventsPerSecond: 10,
        ...(anonKey ? { apikey: anonKey } : {}),
      },
    },
  });
  return client;
}
