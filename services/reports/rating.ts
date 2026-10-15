import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { zonedDayStart } from "@/services/submissions/query";
import { buildRatingReport, periodBounds, type CustomerRow, type RatingReport, type RatingRow, type ReportPeriod } from "@/lib/reports/rating";

/** Today ("YYYY-MM-DD") in the clinic timezone. */
export function currentDate(timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

/** Current calendar month ("YYYY-MM") in the clinic timezone. */
export function currentMonth(timeZone: string): string {
  return currentDate(timeZone).slice(0, 7);
}

export interface RatingData {
  rows: RatingRow[];
  customers: CustomerRow[];
}

/**
 * Loads raw report rows for a day or month. Pass the user's RLS client for the
 * page (branch scope applies) or the service-role client for the monthly email.
 */
export async function loadRatingData(client: SupabaseClient, period: ReportPeriod, timeZone: string, branchId?: string | null): Promise<RatingData> {
  const { start, next } = periodBounds(period);
  const args = { p_from: zonedDayStart(start, timeZone), p_to: zonedDayStart(next, timeZone), p_branch_id: branchId ?? null };
  const [rows, customers] = await Promise.all([client.rpc("get_rating_report", args), client.rpc("get_rating_customers", args)]);
  if (rows.error) throw rows.error;
  if (customers.error) throw customers.error;
  return { rows: (rows.data ?? []) as RatingRow[], customers: (customers.data ?? []) as CustomerRow[] };
}

export function reportFor(data: RatingData, branchId?: string | null): RatingReport {
  if (branchId === undefined) return buildRatingReport(data.rows, data.customers);
  return buildRatingReport(
    data.rows.filter((r) => r.branch_id === branchId),
    data.customers.filter((c) => c.branch_id === branchId),
  );
}
