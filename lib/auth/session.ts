import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ProfileRow } from "@/types/db";
import { roleHasPermission, type Permission } from "./permissions";

export interface AdminSession {
  userId: string;
  email: string;
  profile: ProfileRow;
  isSuperAdmin: boolean;
  /** Admin or super admin: every feature plus user management. */
  isAdmin: boolean;
  /** Branch ids the user is limited to; empty = all branches. */
  branchIds: string[];
  can: (permission: Permission) => boolean;
}

export class AuthorizationError extends Error {
  constructor(message = "You are not authorised to perform this action.") {
    super(message);
    this.name = "AuthorizationError";
  }
}

/**
 * Validates the session token and loads the profile in one query. getClaims()
 * verifies the JWT signature (locally when the project uses asymmetric JWT
 * signing keys, otherwise via the auth server). Deactivated users are still
 * refused here because the profile's is_active flag is checked on every request.
 * Any active user (super admin, admin or staff) gets a session; what they may
 * do is decided by `can()` and, in the database, RLS.
 */
export const getAdminSession = cache(async (): Promise<AdminSession | null> => {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = typeof auth?.claims?.sub === "string" ? auth.claims.sub : null;
  if (!userId) return null;

  const { data } = await supabase
    .from("profiles")
    .select("*, profile_branches(branch_id)")
    .eq("id", userId)
    .maybeSingle<ProfileRow & { profile_branches: { branch_id: string }[] | null }>();
  if (!data || !data.is_active) return null;
  const { profile_branches: scope, ...profile } = data;
  const permissions = profile.permissions ?? [];
  return {
    userId,
    email: (typeof auth?.claims?.email === "string" && auth.claims.email) || profile.email,
    profile,
    isSuperAdmin: profile.role === "super_admin",
    isAdmin: profile.role === "admin" || profile.role === "super_admin",
    branchIds: profile.role === "super_admin" ? [] : (scope ?? []).map((r) => r.branch_id),
    can: (permission) => roleHasPermission(profile.role, permissions, permission),
  };
});

/** For pages/layouts: redirect to login if not an active user. */
export async function requireAdminPage(): Promise<AdminSession> {
  const session = await getAdminSession();
  if (!session) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    redirect(user ? "/?error=not_authorized" : "/");
  }
  return session;
}

/** For server actions / route handlers: throw instead of redirecting. */
export async function requireAdmin(): Promise<AdminSession> {
  const session = await getAdminSession();
  if (!session) throw new AuthorizationError();
  return session;
}

/** For pages: show the "no access" screen unless the user holds the permission. */
export async function requirePermissionPage(permission: Permission): Promise<AdminSession> {
  const session = await requireAdminPage();
  if (!session.can(permission)) redirect(`/admin/no-access?need=${encodeURIComponent(permission)}`);
  return session;
}

/** For server actions / route handlers. */
export async function requirePermission(permission: Permission): Promise<AdminSession> {
  const session = await requireAdmin();
  if (!session.can(permission)) throw new AuthorizationError("You do not have permission to do this.");
  return session;
}

/** Admins and super admins only (user management, audit log). */
export async function requireAdminRole(): Promise<AdminSession> {
  const session = await requireAdmin();
  if (!session.isAdmin) throw new AuthorizationError("Only an admin can do this.");
  return session;
}

export async function requireAdminRolePage(): Promise<AdminSession> {
  const session = await requireAdminPage();
  if (!session.isAdmin) redirect("/admin/no-access");
  return session;
}

export async function requireSuperAdmin(): Promise<AdminSession> {
  const session = await requireAdmin();
  if (!session.isSuperAdmin) throw new AuthorizationError("Only a super admin can perform this action.");
  return session;
}
