"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdminRole, type AdminSession } from "@/lib/auth/session";
import { canManageUser, checkAssignableAccess, normaliseAccess, type Manager } from "@/lib/auth/user-admin";
import { sanitizePermissions } from "@/lib/auth/permissions";
import { runAction, UserFacingError, type ActionResult } from "@/lib/actions";
import { logAudit } from "@/lib/audit";
import { env, isEmailConfigured } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/services/email/resend";
import { escapeHtml } from "@/services/email/notifications";
import { getAppSettings } from "@/services/settings";
import { allBranchIds, getUserWithScope, writeUserAccess } from "@/services/users";
import { userCreateSchema, userUpdateSchema, type UserCreateInput, type UserUpdateInput } from "@/schemas/user";

const manager = (s: AdminSession): Manager => ({ userId: s.userId, role: s.profile.role, branchIds: s.branchIds });

/** A one-time link that signs the person in and asks them to choose a password. */
function setPasswordLink(hashedToken: string, type: "invite" | "recovery") {
  const url = new URL("/auth/confirm", env.appUrl());
  url.searchParams.set("token_hash", hashedToken);
  url.searchParams.set("type", type);
  url.searchParams.set("next", "/admin/reset-password");
  return url.toString();
}

/** Emails the link when Resend is configured. Returns whether it was sent. */
async function emailLink(to: string, name: string, link: string, kind: "invite" | "reset"): Promise<boolean> {
  if (!isEmailConfigured()) return false;
  const settings = await getAppSettings();
  const org = settings.organization.name || "Synergy Wellness";
  const subject = kind === "invite" ? `You're invited to ${org} Synergy Feedback` : "Set a new password for Synergy Feedback";
  const intro =
    kind === "invite"
      ? `${escapeHtml(org)} has given you access to Synergy Feedback. Click the button below to choose your password and sign in.`
      : "Click the button below to choose a new password for Synergy Feedback.";
  const html = `<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;border:1px solid #e2e8f0">
<tr><td style="padding:28px">
<h1 style="margin:0 0 12px;font-size:20px;color:#0f172a">Hi ${escapeHtml(name)},</h1>
<p style="margin:0 0 20px;color:#475569;font-size:14px;line-height:1.6">${intro}</p>
<p style="margin:0 0 20px"><a href="${escapeHtml(link)}" style="display:inline-block;background:#02334c;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;font-size:14px">Choose password</a></p>
<p style="margin:0;color:#94a3b8;font-size:12px">This link works once and expires after 24 hours. If you weren't expecting it, you can ignore this email.</p>
</td></tr></table></td></tr></table></body></html>`;
  return sendEmail({ to: [to], subject, html, text: `Hi ${name},\n\n${kind === "invite" ? `${org} has given you access to Synergy Feedback.` : ""}\nChoose your password: ${link}\n\nThe link works once and expires after 24 hours.` });
}

export interface CreateUserResult {
  userId: string;
  /** Present when the invite could not be emailed: share it with the person yourself. */
  link?: string;
  emailed: boolean;
}

export async function createUserAction(input: UserCreateInput): Promise<ActionResult<CreateUserResult>> {
  return runAction("createUser", async () => {
    const session = await requireAdminRole();
    const parsed = userCreateSchema.safeParse(input);
    if (!parsed.success) throw new UserFacingError(parsed.error.issues[0]?.message ?? "Invalid input");
    const d = normaliseAccess({ ...parsed.data, permissions: sanitizePermissions(parsed.data.permissions) });
    const problem = checkAssignableAccess(manager(session), d, await allBranchIds());
    if (problem) throw new UserFacingError(problem);

    const db = createAdminClient();
    let userId: string;
    let link: string | undefined;
    if (d.method === "password") {
      const { data, error } = await db.auth.admin.createUser({
        email: d.email,
        password: d.password!,
        email_confirm: true,
        user_metadata: { full_name: d.fullName },
      });
      if (error) throw new UserFacingError(/already|registered|exists/i.test(error.message) ? "A user with this email already exists." : error.message);
      userId = data.user.id;
    } else {
      const { data, error } = await db.auth.admin.generateLink({ type: "invite", email: d.email, options: { data: { full_name: d.fullName } } });
      if (error) throw new UserFacingError(/already|registered|exists/i.test(error.message) ? "A user with this email already exists." : error.message);
      userId = data.user.id;
      link = setPasswordLink(data.properties.hashed_token, "invite");
    }

    await writeUserAccess(userId, { role: d.role, permissions: d.permissions, branchIds: d.branchIds, isActive: true, fullName: d.fullName });
    const emailed = link ? await emailLink(d.email, d.fullName, link, "invite") : false;
    await logAudit({
      userId: session.userId,
      action: "user.created",
      entityType: "profile",
      entityId: userId,
      metadata: { email: d.email, role: d.role, branches: d.branchIds.length, permissions: d.permissions, method: d.method, emailed },
    });
    revalidatePath("/admin/users");
    return { userId, emailed, link: link && !emailed ? link : undefined };
  });
}

export async function updateUserAccessAction(input: UserUpdateInput): Promise<ActionResult> {
  return runAction(
    "updateUserAccess",
    async () => {
      const session = await requireAdminRole();
      const parsed = userUpdateSchema.safeParse(input);
      if (!parsed.success) throw new UserFacingError(parsed.error.issues[0]?.message ?? "Invalid input");
      const target = await getUserWithScope(parsed.data.userId);
      if (!target) throw new UserFacingError("User not found.");
      const m = manager(session);
      if (!canManageUser(m, { id: target.id, role: target.role, branchIds: target.branchIds })) {
        throw new UserFacingError("You can't change this user's access.");
      }
      const d = normaliseAccess({ ...parsed.data, permissions: sanitizePermissions(parsed.data.permissions) });
      const problem = checkAssignableAccess(m, d, await allBranchIds());
      if (problem) throw new UserFacingError(problem);

      await writeUserAccess(target.id, { role: d.role, permissions: d.permissions, branchIds: d.branchIds, isActive: d.isActive, fullName: d.fullName });
      // Deactivated users are signed out everywhere.
      if (!d.isActive && target.is_active) await createAdminClient().auth.admin.signOut(target.id).catch(() => undefined);
      await logAudit({
        userId: session.userId,
        action: "user.updated",
        entityType: "profile",
        entityId: target.id,
        metadata: { role: d.role, isActive: d.isActive, branches: d.branchIds.length, permissions: d.permissions },
      });
      revalidatePath("/admin/users");
      return undefined;
    },
    "Access updated",
  );
}

/** Creates a "choose a new password" link for someone (also re-sends an invite). */
export async function sendPasswordLinkAction(userId: string): Promise<ActionResult<{ link?: string; emailed: boolean }>> {
  return runAction("sendPasswordLink", async () => {
    const session = await requireAdminRole();
    const target = await getUserWithScope(z.uuid().parse(userId));
    if (!target) throw new UserFacingError("User not found.");
    if (!canManageUser(manager(session), { id: target.id, role: target.role, branchIds: target.branchIds })) {
      throw new UserFacingError("You can't manage this user.");
    }
    // Someone who never accepted their invite gets a fresh invite; everyone else a password reset.
    const db = createAdminClient();
    const { data: authUser } = await db.auth.admin.getUserById(target.id);
    const type = authUser.user && !authUser.user.email_confirmed_at ? "invite" : "recovery";
    const { data, error } = await db.auth.admin.generateLink({ type, email: target.email });
    if (error) throw new UserFacingError(error.message);
    const link = setPasswordLink(data.properties.hashed_token, type);
    const emailed = await emailLink(target.email, target.full_name || target.email, link, "reset");
    await logAudit({ userId: session.userId, action: "user.reset_link_created", entityType: "profile", entityId: target.id, metadata: { emailed } });
    return { emailed, link: emailed ? undefined : link };
  });
}
