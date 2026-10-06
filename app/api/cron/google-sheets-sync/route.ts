import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { safeEqual } from "@/lib/security/crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { drainQueue } from "@/services/google-sheets/sync";
import { purgeAbandonedUploads } from "@/services/submissions/files";
import { logError } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Background retry worker for Google Sheets sync. Triggered by Vercel Cron
 * (see vercel.json) or any scheduler that sends `Authorization: Bearer
 * $CRON_SECRET` (e.g. Supabase pg_cron + pg_net).
 */
async function handle(request: Request) {
  const secret = env.cronSecret();
  const auth = request.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const summary = await drainQueue(300, 50_000);

  // Housekeeping (best effort)
  try {
    await createAdminClient().rpc("purge_rate_limits");
    await purgeAbandonedUploads();
  } catch (err) {
    logError("cron.housekeeping_failed", err);
  }

  return NextResponse.json({ ok: true, ...summary });
}

export const GET = handle;
export const POST = handle;
