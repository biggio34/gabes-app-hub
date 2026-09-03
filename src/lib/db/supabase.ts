import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const DEFAULT_SUPABASE_URL = "https://cylppatfrlazaioptpzo.supabase.co";

const globalForSupabase = globalThis as unknown as {
  hubSupabase?: SupabaseClient;
};

export function isSupabaseConfigured() {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function supabaseUrl() {
  return process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL;
}

export function getSupabase() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  if (!globalForSupabase.hubSupabase) {
    globalForSupabase.hubSupabase = createClient(supabaseUrl(), key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return globalForSupabase.hubSupabase;
}

export function throwIfError<T>(
  result: { data: T; error: { message: string } | null },
  fallback: string,
): T {
  if (result.error) {
    const message = result.error.message || fallback;
    if (/does not exist|schema cache/i.test(message)) {
      throw new Error(
        "The hub tables are not in Supabase yet. Run supabase/hub.sql and supabase/hub-players-identity.sql in the SQL editor.",
      );
    }
    throw new Error(message);
  }
  return result.data;
}
