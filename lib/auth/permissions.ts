import type { UserRole } from "@/types/db";

/** Permission keys a staff member can be granted (kept in sync with the DB check constraint). */
export const PERMISSIONS = [
  { key: "forms.create", label: "Create forms", hint: "Create new forms and duplicate existing ones." },
  { key: "forms.edit", label: "Edit forms", hint: "Change details, fields, settings; publish, unpublish and archive." },
  { key: "submissions.view", label: "View submissions", hint: "See responses and their answers." },
  { key: "submissions.export", label: "Export submissions", hint: "Download CSV / Excel exports." },
  { key: "submissions.manage", label: "Archive submissions", hint: "Archive and restore responses." },
  { key: "analytics.view", label: "View analytics", hint: "Charts and statistics." },
  { key: "branches.manage", label: "Manage branches", hint: "Create and edit branches." },
  { key: "integrations.manage", label: "Manage Google Sheets", hint: "Connect, change and retry Google Sheets sync." },
] as const;

export type Permission = (typeof PERMISSIONS)[number]["key"];

export const PERMISSION_KEYS = PERMISSIONS.map((p) => p.key) as Permission[];

export const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  staff: "Staff",
};

/** Admins and super admins hold every permission; staff hold only what was granted. */
export function roleHasPermission(role: UserRole, granted: readonly string[], permission: Permission): boolean {
  return role === "super_admin" || role === "admin" || granted.includes(permission);
}

/** Only known keys survive (defence against tampered input). */
export function sanitizePermissions(input: readonly string[]): Permission[] {
  return PERMISSION_KEYS.filter((k) => input.includes(k));
}

/** Which items the per-form three-dot menu may show. Computed on the server. */
export interface FormMenuAccess {
  superAdmin: boolean;
  edit: boolean;
  create: boolean;
  submissions: boolean;
  integrations: boolean;
}

export function formMenuAccess(session: { isSuperAdmin: boolean; can: (p: Permission) => boolean }): FormMenuAccess {
  return {
    superAdmin: session.isSuperAdmin,
    edit: session.can("forms.edit"),
    create: session.can("forms.create"),
    submissions: session.can("submissions.view"),
    integrations: session.can("integrations.manage"),
  };
}
