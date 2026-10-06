import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { BranchRow, FormFieldRow, FormRow, FormSettingsRow, SheetConnectionRow } from "@/types/db";
import { rowToField } from "./mappers";

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
  const { data } = await supabase.from("forms").select("id, name").order("name");
  return (data ?? []) as { id: string; name: string }[];
}
