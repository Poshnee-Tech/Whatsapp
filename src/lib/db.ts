import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env";

let client: SupabaseClient | undefined;

/** Server-only Supabase client using the secret key (bypasses RLS). */
export function db(): SupabaseClient {
  client ??= createClient(env.supabaseUrl, env.supabaseSecretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

export type WebhookEventRow = {
  id: number;
  payload: unknown;
  attempts: number;
};
