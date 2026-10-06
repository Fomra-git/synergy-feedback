import { createBrowserClient } from "@supabase/ssr";

/** Browser client — anon key only. Used for auth flows (login, password reset). */
export function createClient() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}
