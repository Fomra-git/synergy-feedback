import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptSecret, encryptSecret } from "@/lib/security/crypto";
import { refreshAccessToken } from "@/lib/google/oauth";
import { GoogleApiError } from "@/lib/google/errors";
import { SheetsClient } from "@/lib/google/sheets-api";
import type { GoogleAccountRow } from "@/types/db";

const EXPIRY_MARGIN_MS = 90_000;

/** Marks an account (and every form connection using it) as needing reauthorisation. */
export async function markAccountReauthRequired(accountId: string, reason: string): Promise<void> {
  const db = createAdminClient();
  await db.from("google_accounts").update({ status: "reauth_required", last_error: reason.slice(0, 500) }).eq("id", accountId);
  await db
    .from("google_sheet_connections")
    .update({ status: "reauth_required", last_error: "Google Sheet connection requires reauthorization." })
    .eq("google_account_id", accountId)
    .in("status", ["connected", "error", "pending_setup"]);
}

/**
 * Returns a valid access token for a Google account, refreshing (and
 * re-encrypting) it when needed. Tokens never leave the server.
 */
export async function getAccessToken(accountId: string): Promise<string> {
  const db = createAdminClient();
  const { data: account, error } = await db
    .from("google_accounts")
    .select("*")
    .eq("id", accountId)
    .maybeSingle<GoogleAccountRow>();
  if (error) throw new GoogleApiError("Could not load Google account", "transient");
  if (!account) throw new GoogleApiError("Google account is no longer connected", "auth");
  if (account.status !== "connected") throw new GoogleApiError("Google Sheet connection requires reauthorization.", "auth");

  const expiresAt = account.token_expires_at ? new Date(account.token_expires_at).getTime() : 0;
  if (account.access_token_encrypted && expiresAt - EXPIRY_MARGIN_MS > Date.now()) {
    return decryptSecret(account.access_token_encrypted);
  }

  if (!account.refresh_token_encrypted) {
    await markAccountReauthRequired(account.id, "No refresh token stored");
    throw new GoogleApiError("Google Sheet connection requires reauthorization.", "auth");
  }

  try {
    const tokens = await refreshAccessToken(decryptSecret(account.refresh_token_encrypted));
    const update: Record<string, unknown> = {
      access_token_encrypted: encryptSecret(tokens.access_token),
      token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      last_error: null,
    };
    if (tokens.refresh_token) update.refresh_token_encrypted = encryptSecret(tokens.refresh_token);
    await db.from("google_accounts").update(update).eq("id", account.id);
    return tokens.access_token;
  } catch (err) {
    if (err instanceof GoogleApiError && err.kind === "auth") {
      await markAccountReauthRequired(account.id, err.message);
    }
    throw err;
  }
}

export async function getSheetsClient(accountId: string): Promise<SheetsClient> {
  return new SheetsClient(await getAccessToken(accountId));
}
