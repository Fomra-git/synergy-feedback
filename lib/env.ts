import "server-only";
import { siteOrigin } from "@/lib/site-origin";

/**
 * Server-side environment access. Importing this module from a Client
 * Component fails the build (server-only), which guarantees secrets such as
 * SUPABASE_SERVICE_ROLE_KEY, GOOGLE_CLIENT_SECRET and TOKEN_ENCRYPTION_KEY are
 * never bundled for the browser.
 */
function read(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() !== "" ? v.trim() : undefined;
}

export function requireEnv(name: string): string {
  const v = read(name);
  if (!v) throw new Error(`Missing required environment variable: ${name}`);
  return v;
}

export const env = {
  appUrl: () => siteOrigin(read("NEXT_PUBLIC_APP_URL")),
  timezone: () => read("APP_TIMEZONE") ?? "Asia/Kolkata",
  supabaseUrl: () => requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
  supabaseAnonKey: () => requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  supabaseServiceRoleKey: () => requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
  resendApiKey: () => read("RESEND_API_KEY"),
  emailFrom: () => read("EMAIL_FROM"),
  googleClientId: () => read("GOOGLE_CLIENT_ID"),
  googleClientSecret: () => read("GOOGLE_CLIENT_SECRET"),
  googleRedirectUri: () => read("GOOGLE_REDIRECT_URI") ?? `${env.appUrl()}/api/google/oauth/callback`,
  googleDriveListing: () => (read("GOOGLE_DRIVE_LISTING") ?? "true").toLowerCase() !== "false",
  tokenEncryptionKey: () => requireEnv("TOKEN_ENCRYPTION_KEY"),
  appSecret: () => requireEnv("APP_SECRET"),
  cronSecret: () => read("CRON_SECRET"),
  turnstileSecret: () => read("TURNSTILE_SECRET_KEY"),
  turnstileSiteKey: () => read("NEXT_PUBLIC_TURNSTILE_SITE_KEY"),
};

export function isGoogleConfigured(): boolean {
  return Boolean(env.googleClientId() && env.googleClientSecret() && read("TOKEN_ENCRYPTION_KEY"));
}

export function isEmailConfigured(): boolean {
  return Boolean(env.resendApiKey() && env.emailFrom());
}

export function isCaptchaConfigured(): boolean {
  return Boolean(env.turnstileSecret() && env.turnstileSiteKey());
}
