import "server-only";
import { env, isEmailConfigured } from "@/lib/env";
import { logError, logInfo } from "@/lib/logger";

export interface EmailMessage {
  to: string[];
  subject: string;
  html: string;
  text: string;
  fromName?: string;
  replyTo?: string;
  idempotencyKey?: string;
}

/** Sends an email through the Resend REST API. Returns false (never throws) on failure. */
export async function sendEmail(message: EmailMessage): Promise<boolean> {
  if (!isEmailConfigured()) {
    logInfo("email.skipped_not_configured", { subject: message.subject });
    return false;
  }
  if (!message.to.length) return false;

  let from = env.emailFrom()!;
  if (message.fromName && !from.includes("<")) from = `${message.fromName.replace(/[<>"]/g, "")} <${from}>`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.resendApiKey()}`,
        "Content-Type": "application/json",
        ...(message.idempotencyKey ? { "Idempotency-Key": message.idempotencyKey } : {}),
      },
      body: JSON.stringify({
        from,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
        ...(message.replyTo ? { reply_to: message.replyTo } : {}),
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      logError("email.send_failed", { status: res.status, body: await res.text().catch(() => "") });
      return false;
    }
    return true;
  } catch (err) {
    logError("email.send_error", err);
    return false;
  }
}
