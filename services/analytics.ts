import "server-only";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";

export interface DashboardStats {
  totalForms: number;
  publishedForms: number;
  draftForms: number;
  totalSubmissions: number;
  submissionsToday: number;
  submissionsThisWeek: number;
  submissionsThisMonth: number;
  totalBranches: number;
  activeBranches: number;
  sheetConnections: number;
  sheetsNeedingAttention: number;
  failedSyncs: number;
  pendingSyncs: number;
}

const EMPTY: DashboardStats = {
  totalForms: 0,
  publishedForms: 0,
  draftForms: 0,
  totalSubmissions: 0,
  submissionsToday: 0,
  submissionsThisWeek: 0,
  submissionsThisMonth: 0,
  totalBranches: 0,
  activeBranches: 0,
  sheetConnections: 0,
  sheetsNeedingAttention: 0,
  failedSyncs: 0,
  pendingSyncs: 0,
};

/** All aggregates are computed in PostgreSQL (RLS-scoped), never in the browser. */
export async function getDashboardStats(): Promise<DashboardStats> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_dashboard_stats", { p_tz: env.timezone() });
  if (error) throw error;
  const raw = (data ?? {}) as Record<string, number>;
  return Object.fromEntries(Object.keys(EMPTY).map((k) => [k, Number(raw[k] ?? 0)])) as unknown as DashboardStats;
}

export async function getTimeseries(days: number, filters: { formId?: string; branchId?: string } = {}) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_submission_timeseries", {
    p_days: days,
    p_tz: env.timezone(),
    p_form_id: filters.formId ?? null,
    p_branch_id: filters.branchId ?? null,
  });
  if (error) throw error;
  return ((data ?? []) as { day: string; total: number }[]).map((r) => ({ day: r.day, total: Number(r.total) }));
}

export async function getByBranch(days: number) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_submissions_by_branch", { p_days: days });
  if (error) throw error;
  return ((data ?? []) as { branch_id: string | null; branch_name: string; total: number }[]).map((r) => ({
    id: r.branch_id,
    label: r.branch_name,
    value: Number(r.total),
  }));
}

export async function getByForm(days: number) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_submissions_by_form", { p_days: days });
  if (error) throw error;
  return ((data ?? []) as { form_id: string; form_name: string; total: number }[]).map((r) => ({
    id: r.form_id,
    label: r.form_name,
    value: Number(r.total),
  }));
}

export async function getSyncCounts(): Promise<Record<"synced" | "pending" | "processing" | "failed" | "skipped", number>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_sync_status_counts");
  if (error) throw error;
  const out = { synced: 0, pending: 0, processing: 0, failed: 0, skipped: 0 };
  for (const r of (data ?? []) as { status: keyof typeof out; total: number }[]) out[r.status] = Number(r.total);
  return out;
}

export async function getRecentSubmissions(limit = 8) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("form_submissions")
    .select("id, submission_number, submitted_at, forms(name), branches(name), google_sheet_sync_logs(status)")
    .eq("status", "active")
    .order("submitted_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as unknown as {
    id: string;
    submission_number: string;
    submitted_at: string;
    forms: { name: string } | null;
    branches: { name: string } | null;
    google_sheet_sync_logs: { status: "synced" | "pending" | "processing" | "failed" | "skipped" } | { status: string }[] | null;
  }[];
}

export const RANGES = [
  { id: "1", label: "Today", days: 1 },
  { id: "7", label: "Last 7 days", days: 7 },
  { id: "30", label: "Last 30 days", days: 30 },
  { id: "90", label: "Last 90 days", days: 90 },
] as const;

export function parseRange(v: string | string[] | undefined): number {
  const s = Array.isArray(v) ? v[0] : v;
  return RANGES.find((r) => r.id === s)?.days ?? 30;
}
