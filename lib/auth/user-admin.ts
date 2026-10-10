import type { UserRole } from "@/types/db";

/** The signed-in admin, as far as user management is concerned. */
export interface Manager {
  userId: string;
  role: UserRole;
  /** Empty = all branches. */
  branchIds: string[];
}

export interface ManagedUser {
  id: string;
  role: UserRole;
  branchIds: string[];
}

const isAdminRole = (r: UserRole) => r === "admin" || r === "super_admin";

/**
 * Whether `manager` may edit `target`:
 * - only admins and super admins manage users, never their own account here;
 * - only a super admin touches super admin accounts;
 * - a branch-limited admin manages only users limited to (a subset of) their branches.
 */
export function canManageUser(manager: Manager, target: ManagedUser): boolean {
  if (!isAdminRole(manager.role) || manager.userId === target.id) return false;
  if (target.role === "super_admin") return manager.role === "super_admin";
  if (manager.role === "super_admin" || manager.branchIds.length === 0) return true;
  return target.branchIds.length > 0 && target.branchIds.every((b) => manager.branchIds.includes(b));
}

/**
 * Validates the access a manager wants to give. Returns an error message, or
 * null when allowed. `allBranchIds` = every existing branch id.
 */
export function checkAssignableAccess(
  manager: Manager,
  next: { role: UserRole; branchIds: string[] },
  allBranchIds: string[],
): string | null {
  if (!isAdminRole(manager.role)) return "Only an admin can manage users.";
  if (next.role === "super_admin" && manager.role !== "super_admin") return "Only a super admin can create or promote super admins.";
  if (next.branchIds.some((b) => !allBranchIds.includes(b))) return "Unknown branch.";
  if (manager.role !== "super_admin" && manager.branchIds.length > 0) {
    if (next.branchIds.length === 0) return "You can only give access to your own branches.";
    if (next.branchIds.some((b) => !manager.branchIds.includes(b))) return "You can only give access to your own branches.";
  }
  return null;
}

/** What is actually stored: super admins are never branch-limited; admins hold every permission implicitly. */
export function normaliseAccess<T extends { role: UserRole; branchIds: string[]; permissions: string[] }>(a: T): T {
  return {
    ...a,
    branchIds: a.role === "super_admin" ? [] : Array.from(new Set(a.branchIds)),
    permissions: a.role === "staff" ? Array.from(new Set(a.permissions)) : [],
  };
}
