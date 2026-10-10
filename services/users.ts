import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ProfileRow } from "@/types/db";

export interface UserListItem extends ProfileRow {
  branchIds: string[];
}

/** Every profile with its branch scope. Service role: callers must already be authorised admins. */
export async function listUsersWithScope(): Promise<UserListItem[]> {
  const db = createAdminClient();
  const [{ data: profiles, error }, { data: scopes }] = await Promise.all([
    db.from("profiles").select("*").order("created_at"),
    db.from("profile_branches").select("profile_id, branch_id"),
  ]);
  if (error) throw error;
  const byUser = new Map<string, string[]>();
  for (const s of (scopes ?? []) as { profile_id: string; branch_id: string }[]) {
    byUser.set(s.profile_id, [...(byUser.get(s.profile_id) ?? []), s.branch_id]);
  }
  return ((profiles ?? []) as ProfileRow[]).map((p) => ({ ...p, permissions: p.permissions ?? [], branchIds: byUser.get(p.id) ?? [] }));
}

export async function getUserWithScope(userId: string): Promise<UserListItem | null> {
  const db = createAdminClient();
  const [{ data: p }, { data: scopes }] = await Promise.all([
    db.from("profiles").select("*").eq("id", userId).maybeSingle<ProfileRow>(),
    db.from("profile_branches").select("branch_id").eq("profile_id", userId),
  ]);
  if (!p) return null;
  return { ...p, permissions: p.permissions ?? [], branchIds: (scopes ?? []).map((s) => s.branch_id as string) };
}

export async function allBranchIds(): Promise<string[]> {
  const { data } = await createAdminClient().from("branches").select("id");
  return (data ?? []).map((b) => b.id as string);
}

/** Replaces a user's role, permissions, activation, name and branch scope. */
export async function writeUserAccess(
  userId: string,
  a: { role: ProfileRow["role"]; permissions: string[]; branchIds: string[]; isActive: boolean; fullName: string },
) {
  const db = createAdminClient();
  const { error } = await db
    .from("profiles")
    .update({ role: a.role, permissions: a.permissions, is_active: a.isActive, full_name: a.fullName })
    .eq("id", userId);
  if (error) throw error;
  const del = await db.from("profile_branches").delete().eq("profile_id", userId);
  if (del.error) throw del.error;
  if (a.branchIds.length) {
    const ins = await db.from("profile_branches").insert(a.branchIds.map((branch_id) => ({ profile_id: userId, branch_id })));
    if (ins.error) throw ins.error;
  }
}
