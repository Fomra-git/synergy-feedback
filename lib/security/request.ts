import "server-only";
import { env } from "@/lib/env";

/** Best-effort client IP (Vercel / reverse proxies set x-forwarded-for). */
export function getClientIp(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim() || null;
  return headers.get("x-real-ip") ?? null;
}

/**
 * CSRF defence for cookie-authenticated and public POST endpoints: the
 * request must originate from our own site.
 */
export function isSameOrigin(headers: Headers): boolean {
  const origin = headers.get("origin");
  if (!origin) {
    // Some browsers omit Origin on same-origin requests; fall back to Sec-Fetch-Site.
    const site = headers.get("sec-fetch-site");
    return site === null || site === "same-origin" || site === "none";
  }
  const allowed = new Set([new URL(env.appUrl()).origin]);
  const host = headers.get("x-forwarded-host") ?? headers.get("host");
  if (host) {
    const proto = headers.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
    allowed.add(`${proto}://${host}`);
  }
  return allowed.has(origin);
}

/** Reads a request body with a hard byte limit (Content-Length can lie). */
export async function readLimitedText(request: Request, maxBytes: number): Promise<string | null> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > maxBytes) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}
