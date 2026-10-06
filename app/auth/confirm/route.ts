import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { safeAdminPath } from "@/lib/auth/form-access";

export const dynamic = "force-dynamic";

/**
 * Handles Supabase email links (password recovery, invites). Configure the
 * Supabase "Reset password" email template to link to:
 *   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/admin/reset-password
 */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const tokenHash = sp.get("token_hash");
  const type = sp.get("type") as EmailOtpType | null;
  const code = sp.get("code");
  const next = safeAdminPath(sp.get("next"), "/admin/dashboard");

  const supabase = await createClient();
  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(new URL(next, request.url));
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, request.url));
  }
  return NextResponse.redirect(new URL("/admin/login?error=link_expired", request.url));
}
