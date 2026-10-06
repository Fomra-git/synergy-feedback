import { z } from "zod";

export const submissionFiltersSchema = z.object({
  q: z.string().trim().max(200).optional().catch(undefined),
  form: z.uuid().optional().catch(undefined),
  branch: z.uuid().optional().catch(undefined),
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .catch(undefined),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .catch(undefined),
  status: z.enum(["active", "archived"]).optional().catch(undefined),
  sync: z.enum(["pending", "processing", "synced", "failed", "skipped"]).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(100000).optional().catch(undefined),
});

export type SubmissionFilters = z.infer<typeof submissionFiltersSchema>;

export function parseSubmissionFilters(input: Record<string, string | string[] | undefined>): SubmissionFilters {
  const flat: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(input)) flat[k] = Array.isArray(v) ? v[0] : v || undefined;
  return submissionFiltersSchema.parse(flat);
}

/** Converts a local calendar day to an ISO instant in the given IANA timezone. */
export function zonedDayStart(day: string, timeZone: string): string {
  const [y, m, d] = day.split("-").map(Number);
  const utcGuess = Date.UTC(y!, m! - 1, d!, 0, 0, 0);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcGuess));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
  const offset = asUtc - utcGuess;
  return new Date(utcGuess - offset).toISOString();
}

export function nextDay(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function syncEmbed(f: SubmissionFilters, columns = "status, error_message, google_row_number"): string {
  return `google_sheet_sync_logs${f.sync ? "!inner" : ""}(${columns})`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FilterableQuery = any;

/**
 * Applies list/export filters to a Supabase query on form_submissions. Every
 * filter runs in PostgreSQL (indexed), never in the browser.
 */
export function applySubmissionFilters<Q extends FilterableQuery>(query: Q, f: SubmissionFilters, timeZone: string): Q {
  let q: FilterableQuery = query;
  q = q.eq("status", f.status ?? "active");
  if (f.form) q = q.eq("form_id", f.form);
  if (f.branch) q = q.eq("branch_id", f.branch);
  if (f.from) q = q.gte("submitted_at", zonedDayStart(f.from, timeZone));
  if (f.to) q = q.lt("submitted_at", zonedDayStart(nextDay(f.to), timeZone));
  // Requires the caller's select to embed google_sheet_sync_logs!inner(...)
  if (f.sync) q = q.eq("google_sheet_sync_logs.status", f.sync);
  if (f.q) {
    const term = f.q.toLowerCase().replace(/[%_\\]/g, (c) => `\\${c}`).replace(/[,()]/g, " ");
    q = q.ilike("search_text", `%${term}%`);
  }
  return q as Q;
}
