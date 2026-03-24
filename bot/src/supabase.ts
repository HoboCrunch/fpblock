// bot/src/supabase.ts — Supabase clients
// Anon key client for Realtime (WebSocket needs JWT auth)
// Service role client for queries (bypasses RLS)

import { createClient, SupabaseClient } from "@supabase/supabase-js";

let realtimeClient: SupabaseClient | null = null;
let queryClient: SupabaseClient | null = null;

/** Client for Realtime subscriptions — uses anon key (JWT required for WebSocket) */
export function getRealtimeSupabase(): SupabaseClient {
  if (realtimeClient) return realtimeClient;

  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_ANON_KEY");
  }

  realtimeClient = createClient(url, anonKey);
  return realtimeClient;
}

/** Client for database queries — uses service role key (bypasses RLS) */
export function getSupabase(): SupabaseClient {
  if (queryClient) return queryClient;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  queryClient = createClient(url, key);
  return queryClient;
}
