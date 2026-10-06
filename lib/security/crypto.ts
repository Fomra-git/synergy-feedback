import "server-only";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

const VERSION = "v1";

function encryptionKey(raw = env.tokenEncryptionKey()): Buffer {
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("TOKEN_ENCRYPTION_KEY must be 32 bytes, base64 encoded (openssl rand -base64 32)");
  }
  return key;
}

/** AES-256-GCM authenticated encryption. Output: v1:<iv>:<tag>:<ciphertext> (base64url). */
export function encryptSecret(plaintext: string, rawKey?: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(rawKey), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(":");
}

export function decryptSecret(payload: string, rawKey?: string): string {
  const [version, iv, tag, data] = payload.split(":");
  if (version !== VERSION || !iv || !tag || !data) throw new Error("Unsupported encrypted payload");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(rawKey), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}

export function hmac(value: string, purpose: string, secret = env.appSecret()): string {
  return createHmac("sha256", `${purpose}:${secret}`).update(value).digest("base64url");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Signs a JSON payload with an expiry: <base64url(json)>.<hmac> */
export function signToken(payload: Record<string, unknown>, purpose: string, ttlSeconds: number, secret?: string): string {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds })).toString(
    "base64url",
  );
  return `${body}.${hmac(body, purpose, secret)}`;
}

export function verifyToken<T extends Record<string, unknown>>(token: string, purpose: string, secret?: string): T | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  if (!safeEqual(sig, hmac(body, purpose, secret))) return null;
  try {
    const data = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T & { exp?: number };
    if (!data.exp || data.exp < Math.floor(Date.now() / 1000)) return null;
    return data;
  } catch {
    return null;
  }
}

/** One-way, salted IP hash — raw IP addresses are never stored. */
export function hashIp(ip: string | null): string | null {
  if (!ip) return null;
  return hmac(ip, "ip-hash").slice(0, 32);
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}
