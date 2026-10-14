import { NextResponse, type NextRequest } from "next/server";
import { getAdminSession } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { ratingReportCsv } from "@/lib/reports/csv";
import { currentMonth, loadRatingData, reportFor } from "@/services/reports/rating";

export const dynamic = "force-dynamic";

/** CSV of the rating report for a month (RLS-scoped to the signed-in user). */
export async function GET(request: NextRequest) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.can("analytics.view")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const tz = env.timezone();
  const sp = request.nextUrl.searchParams;
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.get("month") ?? "") ? sp.get("month")! : currentMonth(tz);
  const branch = sp.get("branch");
  const branchId = branch && /^[0-9a-f-]{36}$/i.test(branch) ? branch : null;

  const data = await loadRatingData(await createClient(), month, tz, branchId);
  const all = reportFor(data);
  const scopes = branchId
    ? [{ name: all.branches[0]?.name ?? "Branch", report: all }]
    : [{ name: "All branches", report: all }, ...all.branches.map((b) => ({ name: b.name, report: reportFor(data, b.id) }))];
  return new NextResponse(ratingReportCsv(month, scopes), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="feedback-report-${month}${branchId ? "-branch" : ""}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
