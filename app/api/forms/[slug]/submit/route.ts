import { after, NextResponse } from "next/server";
import { z } from "zod";
import { getPublishedForm } from "@/services/forms/public";
import { afterSubmission, createSubmission, SubmissionError } from "@/services/submissions/create";
import { getAppSettings } from "@/services/settings";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { verifyCaptcha } from "@/lib/security/turnstile";
import { getClientIp, isSameOrigin, readLimitedText } from "@/lib/security/request";
import { hashIp } from "@/lib/security/crypto";
import { logError } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 1_500_000; // signatures are the largest payload (~300 KB max)

const bodySchema = z.object({
  answers: z.record(z.string().max(64), z.unknown()),
  clientToken: z.string().uuid().nullable().optional(),
  captchaToken: z.string().max(4096).optional(),
  // Honeypot: real users never fill this hidden field.
  website: z.string().max(500).optional(),
  startedAt: z.number().int().optional(),
});

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request, ctx: RouteContext<"/api/forms/[slug]/submit">) {
  const { slug } = await ctx.params;

  if (!isSameOrigin(request.headers)) return json({ error: "Invalid request origin." }, 403);

  const ip = getClientIp(request.headers);
  const ipHash = hashIp(ip);
  const settings = await getAppSettings();
  const limitKey = `submit:${ipHash ?? "unknown"}`;
  const [minuteOk, hourOk] = await Promise.all([
    checkRateLimit(`${limitKey}:m`, settings.security.submissionRateLimitPerMinute, 60),
    checkRateLimit(`${limitKey}:h`, settings.security.submissionRateLimitPerHour, 3600),
  ]);
  if (!minuteOk || !hourOk) {
    return json({ error: "Too many submissions. Please wait a moment and try again." }, 429);
  }

  const raw = await readLimitedText(request, MAX_BODY_BYTES);
  if (raw === null) return json({ error: "Submission is too large." }, 413);

  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(JSON.parse(raw));
  } catch {
    return json({ error: "Invalid submission." }, 400);
  }

  const form = await getPublishedForm(slug);
  if (!form) return json({ error: "This form is not available." }, 404);

  // Bots: honeypot filled or submitted impossibly fast (< 2s). Pretend success.
  if (parsed.website || (parsed.startedAt && Date.now() - parsed.startedAt < 2000)) {
    return json({ ok: true, submissionNumber: null });
  }

  const captchaOk = await verifyCaptcha(parsed.captchaToken, ip, settings.security.captchaEnabled);
  if (!captchaOk) return json({ error: "Please complete the verification challenge." }, 400);

  try {
    const result = await createSubmission({
      form,
      answers: parsed.answers as Record<string, never>,
      clientToken: parsed.clientToken ?? null,
      ipHash,
      userAgent: request.headers.get("user-agent"),
      referrer: request.headers.get("referer"),
    });

    // Google Sheets + email happen after the response is sent.
    after(() => afterSubmission(form, result));

    return json({ ok: true, submissionNumber: result.submissionNumber });
  } catch (err) {
    if (err instanceof SubmissionError) {
      return json({ error: err.message, fieldErrors: err.fieldErrors }, err.status);
    }
    logError("submit.unhandled", err, { slug });
    return json({ error: "We couldn't save your response. Please try again." }, 500);
  }
}
