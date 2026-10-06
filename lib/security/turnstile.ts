import "server-only";
import { env, isCaptchaConfigured } from "@/lib/env";
import { logError } from "@/lib/logger";

/**
 * Cloudflare Turnstile verification. When CAPTCHA is not configured the check
 * is skipped (rate limiting + honeypot still apply).
 */
export async function verifyCaptcha(token: string | undefined, ip: string | null, required: boolean): Promise<boolean> {
  if (!required || !isCaptchaConfigured()) return true;
  if (!token) return false;
  try {
    const body = new URLSearchParams({ secret: env.turnstileSecret()!, response: token });
    if (ip) body.set("remoteip", ip);
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body,
      signal: AbortSignal.timeout(8000),
    });
    const json = (await res.json()) as { success?: boolean };
    return json.success === true;
  } catch (err) {
    logError("captcha.verify_failed", err);
    return false;
  }
}
