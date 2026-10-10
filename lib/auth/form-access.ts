import "server-only";
import { createClient } from "@/lib/supabase/server";
import { AuthorizationError, requireAdmin, type AdminSession } from "./session";
import type { Permission } from "./permissions";
import type { FormRow } from "@/types/db";

/**
 * Confirms the signed-in admin may access a form. The lookup runs through the
 * user's RLS-scoped client, so branch scoping is enforced by PostgreSQL.
 * Use before any service-role operation on that form.
 */
export async function assertFormAccess(formId: string, permission: Permission = "forms.edit"): Promise<{ session: AdminSession; form: FormRow }> {
  const session = await requireAdmin();
  if (!session.can(permission)) throw new AuthorizationError("You do not have permission to do this.");
  if (!/^[0-9a-f-]{36}$/i.test(formId)) throw new AuthorizationError("Form not found.");
  const supabase = await createClient();
  const { data: form } = await supabase.from("forms").select("*").eq("id", formId).maybeSingle<FormRow>();
  if (!form) throw new AuthorizationError("Form not found or access denied.");
  return { session, form };
}

/** Only allow redirects to internal admin paths (prevents open redirects). */
export function safeAdminPath(path: string | null | undefined, fallback = "/admin/dashboard"): string {
  if (!path || !path.startsWith("/admin") || path.startsWith("//") || path.includes("\\")) return fallback;
  return path;
}
