import { NextResponse, type NextRequest } from "next/server";
import { getAdminSession } from "@/lib/auth/session";
import { safeAdminPath } from "@/lib/auth/form-access";
import { exchangeAuthorizationCode, readIdToken } from "@/lib/google/oauth";
import { encryptSecret, safeEqual, verifyToken } from "@/lib/security/crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { logError } from "@/lib/logger";
import { attachAccountToForm } from "@/services/google-sheets/connections";
import { requeueJobs, runSyncBatch } from "@/services/google-sheets/sync";
import type { GoogleAccountRow } from "@/types/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OAUTH_COOKIE = "sf_google_oauth";

interface OAuthCookie extends Record<string, unknown> {
  state: string;
  verifier: string;
  formId: string | null;
  userId: string;
  returnTo: string;
}

function redirectWith(request: NextRequest, path: string, status: string) {
  const url = new URL(path, request.url);
  url.searchParams.set("google", status);
  const res = NextResponse.redirect(url);
  res.cookies.set(OAUTH_COOKIE, "", { path: "/api/google/oauth", maxAge: 0 });
  return res;
}

export async function GET(request: NextRequest) {
  const raw = request.cookies.get(OAUTH_COOKIE)?.value;
  const cookie = raw ? verifyToken<OAuthCookie>(raw, "google-oauth") : null;
  const fallback = "/admin/integrations/google-sheets";
  if (!cookie) return redirectWith(request, fallback, "expired");

  const returnTo = safeAdminPath(cookie.returnTo, fallback);
  const params = request.nextUrl.searchParams;

  if (params.get("error")) return redirectWith(request, returnTo, "denied");
  const code = params.get("code");
  const state = params.get("state") ?? "";
  if (!code || !safeEqual(state, cookie.state)) return redirectWith(request, returnTo, "invalid_state");

  const session = await getAdminSession();
  if (!session || session.userId !== cookie.userId) return redirectWith(request, "/admin/login", "session");

  try {
    const tokens = await exchangeAuthorizationCode(code, cookie.verifier);
    const identity = readIdToken(tokens.id_token);
    const grantedScopes = (tokens.scope ?? "").split(" ").filter(Boolean);
    if (!grantedScopes.includes("https://www.googleapis.com/auth/spreadsheets")) {
      return redirectWith(request, returnTo, "missing_scope");
    }

    const db = createAdminClient();
    const { data: existing } = await db
      .from("google_accounts")
      .select("id, status, refresh_token_encrypted")
      .eq("email", identity.email)
      .maybeSingle<Pick<GoogleAccountRow, "id" | "status" | "refresh_token_encrypted">>();

    if (!tokens.refresh_token && !existing?.refresh_token_encrypted) {
      return redirectWith(request, returnTo, "no_refresh_token");
    }

    const record = {
      email: identity.email,
      google_user_id: identity.sub,
      scopes: grantedScopes,
      access_token_encrypted: encryptSecret(tokens.access_token),
      token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      status: "connected" as const,
      last_error: null,
      ...(tokens.refresh_token ? { refresh_token_encrypted: encryptSecret(tokens.refresh_token) } : {}),
    };

    let accountId: string;
    if (existing) {
      const { error } = await db.from("google_accounts").update(record).eq("id", existing.id);
      if (error) throw error;
      accountId = existing.id;
    } else {
      const { data, error } = await db
        .from("google_accounts")
        .insert({ ...record, connected_by: session.userId })
        .select("id")
        .single<{ id: string }>();
      if (error) throw error;
      accountId = data.id;
    }

    // Re-authorisation: restore every form that uses this account and retry
    // the syncs that were waiting for it. (Done on every re-consent: a
    // connection can be flagged even while the account row looks healthy.)
    if (existing) {
      await db
        .from("google_sheet_connections")
        .update({ status: "connected", last_error: null })
        .eq("google_account_id", accountId)
        .eq("status", "reauth_required")
        .not("spreadsheet_id", "is", null);
      await db
        .from("google_sheet_connections")
        .update({ status: "pending_setup", last_error: null })
        .eq("google_account_id", accountId)
        .eq("status", "reauth_required")
        .is("spreadsheet_id", null);
      await requeueJobs({ accountId });
      if (existing.status !== "connected") await logAudit({
        userId: session.userId,
        action: "google_sheet.reauthorized",
        entityType: "google_account",
        entityId: accountId,
        metadata: { email: identity.email },
      });
    } else if (!existing) {
      await logAudit({
        userId: session.userId,
        action: "google_account.connected",
        entityType: "google_account",
        entityId: accountId,
        metadata: { email: identity.email },
      });
    }

    if (cookie.formId) {
      await attachAccountToForm(cookie.formId, accountId, session.userId);
    }

    // Kick the queue so restored connections catch up immediately.
    runSyncBatch({ limit: 25 }).catch(() => undefined);

    return redirectWith(request, returnTo, "connected");
  } catch (err) {
    logError("google.oauth_callback_failed", err);
    return redirectWith(request, returnTo, "error");
  }
}
