import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ProfileRow } from "@/types/db";

export interface AdminSession {
  userId: string;
  email: string;
  profile: ProfileRow;
  isSuperAdmin: boolean;
}

export class AuthorizationError extends Error {
  constructor(message = "You are not authorised to perform this action.") {
    super(message);
    this.name = "AuthorizationError";
  }
}

/** Validates the session with Supabase Auth (getUser hits the auth server) and loads the profile. */
export const getAdminSession = cache(async (): Promise<AdminSession | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle<ProfileRow>();
  if (!profile || !profile.is_active || (profile.role !== "admin" && profile.role !== "super_admin")) {
    return null;
  }
  return { userId: user.id, email: user.email ?? profile.email, profile, isSuperAdmin: profile.role === "super_admin" };
});

/** For pages/layouts: redirect to login if not an active admin. */
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

export async function requireSuperAdmin(): Promise<AdminSession> {
  const session = await requireAdmin();
  if (!session.isSuperAdmin) throw new AuthorizationError("Only a super admin can perform this action.");
  return session;
}
