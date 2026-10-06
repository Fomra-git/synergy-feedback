"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { getClientIp } from "@/lib/security/request";
import { hashIp } from "@/lib/security/crypto";
import { env } from "@/lib/env";
import { safeAdminPath } from "@/lib/auth/form-access";

export interface AuthState {
  error?: string;
  success?: string;
}

const loginSchema = z.object({
  email: z.email("Enter a valid email address").max(254),
  password: z.string().min(1, "Enter your password").max(200),
  next: z.string().max(300).optional(),
});

export async function signInAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const ipHash = hashIp(getClientIp(await headers()));
  const email = parsed.data.email.toLowerCase();
  const [ipOk, emailOk] = await Promise.all([
    checkRateLimit(`login:ip:${ipHash}`, 20, 900),
    checkRateLimit(`login:email:${email}`, 8, 900),
  ]);
  if (!ipOk || !emailOk) return { error: "Too many sign-in attempts. Please wait 15 minutes and try again." };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password: parsed.data.password });
  if (error || !data.user) return { error: "Invalid email or password." };

  const { data: profile } = await supabase.from("profiles").select("role, is_active").eq("id", data.user.id).maybeSingle();
  if (!profile?.is_active || (profile.role !== "admin" && profile.role !== "super_admin")) {
    await supabase.auth.signOut();
    return { error: "Your account is not yet activated. Please contact a super admin." };
  }

  redirect(safeAdminPath(parsed.data.next, "/admin/dashboard"));
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/admin/login");
}

export async function requestPasswordResetAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = z.email().safeParse(String(formData.get("email") ?? "").trim().toLowerCase());
  if (!parsed.success) return { error: "Enter a valid email address." };

  const ipHash = hashIp(getClientIp(await headers()));
  if (!(await checkRateLimit(`reset:${ipHash}`, 5, 3600))) {
    return { error: "Too many requests. Please try again later." };
  }

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data, {
    redirectTo: `${env.appUrl()}/auth/confirm?next=/admin/reset-password`,
  });
  // Same response whether or not the account exists (prevents user enumeration).
  return { success: "If an account exists for that email, a password reset link has been sent." };
}

const passwordSchema = z
  .object({
    password: z
      .string()
      .min(10, "Use at least 10 characters")
      .max(200)
      .regex(/[A-Za-z]/, "Include at least one letter")
      .regex(/[0-9]/, "Include at least one number"),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, { message: "Passwords do not match", path: ["confirm"] });

export async function updatePasswordAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = passwordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid password" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Your reset link has expired. Please request a new one." };

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: "Could not update your password. Please request a new reset link." };
  redirect("/admin/dashboard");
}
