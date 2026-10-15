import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { safeEqual } from "@/lib/security/crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { previousMonth } from "@/lib/reports/rating";
import { currentMonth } from "@/services/reports/rating";
import { sendRatingReport } from "@/services/reports/monthly-email";
import { logError, logInfo } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Emails last month's rating report to "Recipients for all forms". Runs daily
 * (vercel.json) but only sends during the first week of a month and only once
 * per month, so a missed or failed day is retried automatically.
 */
async function handle(request: Request) {
  const secret = env.cronSecret();
  const auth = request.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tz = env.timezone();
  const today = Number(new Intl.DateTimeFormat("en-CA", { timeZone: tz, day: "2-digit" }).format(new Date()));
  const month = previousMonth(currentMonth(tz));
  if (today > 7) return NextResponse.json({ ok: true, skipped: "not_first_week", month });

  const { data: already } = await createAdminClient()
    .from("audit_logs")
    .select("id")
    .eq("action", "report.monthly_sent")
    .eq("metadata->>month", month)
    .is("user_id", null)
    .limit(1);
  if (already?.length) return NextResponse.json({ ok: true, skipped: "already_sent", month });

  try {
    const result = await sendRatingReport({ kind: "month", month }, { idempotencyKey: `monthly-report-${month}` });
    logInfo("report.monthly", { month, ...result });
    return NextResponse.json({ ok: true, month, ...result });
  } catch (err) {
    logError("report.monthly_failed", err, { month });
    return NextResponse.json({ ok: false, month }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
