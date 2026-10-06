import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/logger";

/**
 * Distributed fixed-window rate limiter backed by PostgreSQL (works across
 * serverless instances without extra infrastructure). Fails open on database
 * errors so a limiter outage never blocks legitimate patients.
 */
export async function checkRateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  try {
    const { data, error } = await createAdminClient().rpc("check_rate_limit", {
      p_key: key,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });
    if (error) throw error;
    return data === true;
  } catch (err) {
    logError("rate_limit.check_failed", err, { key });
    return true;
  }
}
