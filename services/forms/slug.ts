import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { slugify } from "@/lib/utils";

/**
 * Returns a globally unique slug. Uses the service role because RLS hides
 * forms in other branches from branch-scoped admins, but slugs are global.
 */
export async function uniqueSlug(desired: string, excludeFormId?: string): Promise<string> {
  const base = slugify(desired) || "form";
  const db = createAdminClient();
  const { data } = await db.from("forms").select("id, slug").like("slug", `${base}%`).limit(500);
  const taken = new Set((data ?? []).filter((r) => r.id !== excludeFormId).map((r) => r.slug as string));
  if (!taken.has(base) && base.length >= 2) return base;
  for (let i = 2; i < 1000; i++) {
    const candidate = `${base}-${i}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

export async function isSlugAvailable(slug: string, excludeFormId?: string): Promise<boolean> {
  const db = createAdminClient();
  const { data } = await db.from("forms").select("id").eq("slug", slug).maybeSingle();
  return !data || data.id === excludeFormId;
}
