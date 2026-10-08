import { NextResponse, type NextRequest } from "next/server";
import { isGoogleConfigured } from "@/lib/env";
import { getAdminSession } from "@/lib/auth/session";
import { assertFormAccess, safeAdminPath } from "@/lib/auth/form-access";
import { buildAuthorizationUrl, createPkcePair } from "@/lib/google/oauth";
import { randomToken, signToken } from "@/lib/security/crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OAUTH_COOKIE = "sf_google_oauth";

/**
 * Starts Google OAuth 2.0 (authorization code + PKCE). The state value and
 * PKCE verifier are kept in a short-lived, signed, httpOnly cookie — nothing
 * sensitive is exposed to the browser.
 */
export async function GET(request: NextRequest) {
  const session = await getAdminSession();
  if (!session) return NextResponse.redirect(new URL("/", request.url));

  const formId = request.nextUrl.searchParams.get("formId");
  const returnTo = safeAdminPath(
    request.nextUrl.searchParams.get("returnTo"),
    formId ? `/admin/forms/${formId}/settings?tab=integrations` : "/admin/integrations/google-sheets",
  );

  if (!isGoogleConfigured()) {
    const url = new URL(returnTo, request.url);
    url.searchParams.set("google", "not_configured");
    return NextResponse.redirect(url);
  }

  if (formId) {
    try {
      await assertFormAccess(formId);
    } catch {
      return NextResponse.redirect(new URL("/admin/forms", request.url));
    }
  }

  const state = randomToken(24);
  const { verifier, challenge } = createPkcePair();
  const cookieValue = signToken({ state, verifier, formId, userId: session.userId, returnTo }, "google-oauth", 600);

  const response = NextResponse.redirect(
    buildAuthorizationUrl({ state, codeChallenge: challenge, loginHint: request.nextUrl.searchParams.get("hint") ?? undefined }),
  );
  response.cookies.set(OAUTH_COOKIE, cookieValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/google/oauth",
    maxAge: 600,
  });
  return response;
}
