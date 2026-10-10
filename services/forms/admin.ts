import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { BranchRow, FormFieldRow, FormRow, FormSettingsRow, SheetConnectionRow } from "@/types/db";
import { rowToField } from "./mappers";
import { zonedDayStart } from "@/services/submissions/query";
import { getAdminSession } from "@/lib/auth/session";

/**
 * Branch ids the signed-in user is limited to, or null for all branches.
 * Needed on top of RLS because published forms are publicly readable, so
 * without this a branch-limited user would see other branches' live forms.
 */
async function branchScope(): Promise<string[] | null> {
  const session = await getAdminSession();
  return session && session.branchIds.length ? session.branchIds : null;
}

export interface FormListItem extends FormRow {
  branch: { id: string; name: string } | null;
  responses: number;
  sheet: Pick<SheetConnectionRow, "status" | "enabled" | "spreadsheet_name" | "spreadsheet_url"> | null;
}

export const FORMS_PAGE_SIZE = 20;

export async function listForms(filters: {
  q?: string;
  status?: string;
  branch?: string;
  page?: number;
}): Promise<{ items: FormListItem[]; total: number }> {
  const supabase = await createClient();
  const page = Math.max(1, filters.page ?? 1);
  let query = supabase
    .from("forms")
    .select("*, branch:branches(id, name), sheet:google_sheet_connections(status, enabled, spreadsheet_name, spreadsheet_url)", {
      count: "exact",
    })
    .order("updated_at", { ascending: false })
    .range((page - 1) * FORMS_PAGE_SIZE, page * FORMS_PAGE_SIZE - 1);

  if (filters.status && ["draft", "published", "archived"].includes(filters.status)) {
    query = query.eq("status", filters.status);
  } else {
    query = query.neq("status", "archived");
  }
  if (filters.branch) query = query.eq("branch_id", filters.branch);
  const scope = await branchScope();
  if (scope) query = query.in("branch_id", scope);
  if (filters.q) query = query.ilike("name", `%${filters.q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`);

  const { data, count, error } = await query;
  if (error) throw error;

  const rows = (data ?? []) as (FormRow & {
    branch: FormListItem["branch"];
    sheet: FormListItem["sheet"] | FormListItem["sheet"][];
  })[];
  const ids = rows.map((r) => r.id);
  const counts = new Map<string, number>();
  if (ids.length) {
    const { data: c } = await supabase.rpc("get_form_response_counts", { p_form_ids: ids });
    for (const row of (c ?? []) as { form_id: string; total: number }[]) counts.set(row.form_id, Number(row.total));
  }

  return {
    items: rows.map((r) => ({
      ...r,
      sheet: Array.isArray(r.sheet) ? (r.sheet[0] ?? null) : r.sheet,
      responses: counts.get(r.id) ?? 0,
    })),
    total: count ?? 0,
  };
}

export async function getFormForAdmin(formId: string) {
  const supabase = await createClient();
  const [{ data: form }, { data: fields }, { data: settings }, { data: connection }] = await Promise.all([
    supabase.from("forms").select("*, branch:branches(id, name)").eq("id", formId).maybeSingle(),
    supabase.from("form_fields").select("*").eq("form_id", formId).order("position").returns<FormFieldRow[]>(),
    supabase.from("form_settings").select("*").eq("form_id", formId).maybeSingle<FormSettingsRow>(),
    supabase.from("google_sheet_connections").select("*").eq("form_id", formId).maybeSingle<SheetConnectionRow>(),
  ]);
  if (!form) return null;
  return {
    form: form as FormRow & { branch: { id: string; name: string } | null },
    fields: (fields ?? []).map(rowToField),
    settings: settings ?? null,
    connection: connection ?? null,
  };
}

export async function listBranchOptions(): Promise<Pick<BranchRow, "id" | "name" | "status">[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("branches").select("id, name, status").is("archived_at", null).order("name");
  return (data ?? []) as Pick<BranchRow, "id" | "name" | "status">[];
}

export async function listFormOptions(): Promise<{ id: string; name: string }[]> {
  const supabase = await createClient();
  let query = supabase.from("forms").select("id, name").order("name");
  const scope = await branchScope();
  if (scope) query = query.in("branch_id", scope);
  const { data } = await query;
  return (data ?? []) as { id: string; name: string }[];
}

export interface DashboardFormItem extends Pick<FormRow, "id" | "name" | "slug" | "status"> {
  branch: { name: string } | null;
  total: number;
  today: number;
}

/**
 * Every non-archived form with its all-time and today's response counts, for
 * the dashboard. `today` is the calendar day in `timeZone` (YYYY-MM-DD).
 */
export async function listDashboardForms(today: string, timeZone: string): Promise<DashboardFormItem[]> {
  const supabase = await createClient();
  let query = supabase
    .from("forms")
    .select("id, name, slug, status, branch:branches(name)")
    .neq("status", "archived")
    .order("name");
  const scope = await branchScope();
  if (scope) query = query.in("branch_id", scope);
  const { data, error } = await query;
  if (error) throw error;
  const rows = (data ?? []) as unknown as Omit<DashboardFormItem, "total" | "today">[];
  if (!rows.length) return [];

  const ids = rows.map((r) => r.id);
  const [{ data: totals }, { data: todays }] = await Promise.all([
    supabase.rpc("get_form_response_counts", { p_form_ids: ids }),
    supabase
      .from("form_submissions")
      .select("form_id")
      .in("form_id", ids)
      .eq("status", "active")
      .gte("submitted_at", zonedDayStart(today, timeZone))
      .limit(50_000),
  ]);
  const total = new Map<string, number>();
  for (const row of (totals ?? []) as { form_id: string; total: number }[]) total.set(row.form_id, Number(row.total));
  const todayCount = new Map<string, number>();
  for (const row of (todays ?? []) as { form_id: string }[]) todayCount.set(row.form_id, (todayCount.get(row.form_id) ?? 0) + 1);

  return rows.map((r) => ({ ...r, total: total.get(r.id) ?? 0, today: todayCount.get(r.id) ?? 0 }));
}
