import "server-only";
import { createHash } from "node:crypto";
import { env } from "@/lib/env";
import { randomToken } from "@/lib/security/crypto";
import { GoogleApiError } from "./errors";

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke";

/**
 * Minimum scopes:
 *  - openid email: identify which Google account was connected
 *  - spreadsheets: create spreadsheets, read metadata, append rows
 *  - drive.metadata.readonly (optional): list the account's spreadsheets so
 *    admins can pick one instead of pasting IDs. Disable with
 *    GOOGLE_DRIVE_LISTING=false to avoid this restricted scope.
 */
export function googleScopes(): string[] {
  const scopes = ["openid", "email", "https://www.googleapis.com/auth/spreadsheets"];
  if (env.googleDriveListing()) scopes.push("https://www.googleapis.com/auth/drive.metadata.readonly");
  return scopes;
}

export function createPkcePair(): { verifier: string; challenge: string } {
  const verifier = randomToken(48);
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function buildAuthorizationUrl(params: { state: string; codeChallenge: string; loginHint?: string }): string {
  const url = new URL(AUTH_ENDPOINT);
  url.searchParams.set("client_id", env.googleClientId()!);
  url.searchParams.set("redirect_uri", env.googleRedirectUri());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", googleScopes().join(" "));
  url.searchParams.set("access_type", "offline");
  // consent guarantees a refresh token is issued on every (re)authorisation
  url.searchParams.set("prompt", "consent select_account");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", params.state);
  url.searchParams.set("code_challenge", params.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  if (params.loginHint) url.searchParams.set("login_hint", params.loginHint);
  return url.toString();
}

export interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  id_token?: string;
  token_type: string;
}

async function tokenRequest(body: URLSearchParams): Promise<GoogleTokenResponse> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  const json = (await res.json().catch(() => ({}))) as GoogleTokenResponse & { error?: string; error_description?: string };
  if (!res.ok) {
    // invalid_grant = refresh token revoked/expired → admin must reconnect
    const kind = json.error === "invalid_grant" || res.status === 401 ? "auth" : res.status >= 500 ? "transient" : "invalid";
    throw new GoogleApiError(json.error_description || json.error || `Token request failed (${res.status})`, kind, res.status);
  }
  return json;
}

export function exchangeAuthorizationCode(code: string, codeVerifier: string) {
  return tokenRequest(
    new URLSearchParams({
      code,
      code_verifier: codeVerifier,
      client_id: env.googleClientId()!,
      client_secret: env.googleClientSecret()!,
      redirect_uri: env.googleRedirectUri(),
      grant_type: "authorization_code",
    }),
  );
}

export function refreshAccessToken(refreshToken: string) {
  return tokenRequest(
    new URLSearchParams({
      refresh_token: refreshToken,
      client_id: env.googleClientId()!,
      client_secret: env.googleClientSecret()!,
      grant_type: "refresh_token",
    }),
  );
}

export async function revokeToken(token: string): Promise<void> {
  await fetch(REVOKE_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }),
    signal: AbortSignal.timeout(10000),
  }).catch(() => undefined);
}

/**
 * Reads identity claims from the ID token. The token was received directly
 * from Google's token endpoint over TLS (authorization-code flow), so per
 * OpenID Connect Core §3.1.3.7 TLS server validation suffices; we still check
 * issuer, audience and expiry.
 */
export function readIdToken(idToken: string | undefined): { email: string; sub: string } {
  if (!idToken) throw new GoogleApiError("Google did not return an ID token", "invalid");
  const [, payload] = idToken.split(".");
  const claims = JSON.parse(Buffer.from(payload ?? "", "base64url").toString("utf8")) as {
    iss?: string;
    aud?: string;
    exp?: number;
    email?: string;
    email_verified?: boolean;
    sub?: string;
  };
  if (claims.iss !== "https://accounts.google.com" && claims.iss !== "accounts.google.com") {
    throw new GoogleApiError("Invalid ID token issuer", "invalid");
  }
  if (claims.aud !== env.googleClientId()) throw new GoogleApiError("Invalid ID token audience", "invalid");
  if (!claims.exp || claims.exp * 1000 < Date.now() - 60_000) throw new GoogleApiError("Expired ID token", "invalid");
  if (!claims.email || !claims.sub) throw new GoogleApiError("Google account email unavailable", "invalid");
  return { email: claims.email.toLowerCase(), sub: claims.sub };
}
