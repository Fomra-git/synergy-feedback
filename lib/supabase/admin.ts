import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

let cached: SupabaseClient | null = null;

/**
 * Service-role client. BYPASSES RLS — use only in trusted server code after an
 * explicit authorisation check (or for public submission handling, which is
 * fully validated server-side). Never import from client components.
 */
export function createAdminClient(): SupabaseClient {
  if (!cached) {
    cached = createClient(env.supabaseUrl(), env.supabaseServiceRoleKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cached;
}
