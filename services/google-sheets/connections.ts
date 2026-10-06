import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { GoogleApiError } from "@/lib/google/errors";
import { a1Sheet, parseSpreadsheetId, type SpreadsheetInfo, type WorksheetInfo } from "@/lib/google/sheets-api";
import { rowToField } from "@/services/forms/mappers";
import type { FormFieldRow, SheetColumn, SheetConnectionRow } from "@/types/db";
import type { FormSheetSettings } from "@/types/forms";
import { adoptExistingHeaders, headersOf, reconcileColumns } from "./columns";
import { ensureHeaders } from "./engine";
import { getSheetsClient } from "./tokens";
import { queueBackfill } from "./sync";

export const DEFAULT_WORKSHEET = "Responses";

async function loadConnection(formId: string): Promise<SheetConnectionRow | null> {
  const { data } = await createAdminClient()
    .from("google_sheet_connections")
    .select("*")
    .eq("form_id", formId)
    .maybeSingle<SheetConnectionRow>();
  return data ?? null;
}

async function requireAccountConnection(formId: string): Promise<SheetConnectionRow & { google_account_id: string }> {
  const conn = await loadConnection(formId);
  if (!conn?.google_account_id) {
    throw new GoogleApiError("Connect a Google account first.", "config");
  }
  return conn as SheetConnectionRow & { google_account_id: string };
}

async function loadFormForSheets(formId: string) {
  const db = createAdminClient();
  const [{ data: form }, { data: fields }, { data: settings }] = await Promise.all([
    db.from("forms").select("name, branches(name)").eq("id", formId).single<{ name: string; branches: { name: string } | null }>(),
    db.from("form_fields").select("*").eq("form_id", formId).order("position").returns<FormFieldRow[]>(),
    db.from("form_settings").select("google_sheets").eq("form_id", formId).maybeSingle<{ google_sheets: FormSheetSettings }>(),
  ]);
  return {
    name: form?.name ?? "Form",
    branchName: form?.branches?.name ?? "",
    fields: (fields ?? []).map(rowToField),
    sheetSettings: settings?.google_sheets ?? {},
  };
}

/** Links a form to an already-authorised Google account (no new OAuth needed). */
export async function attachAccountToForm(formId: string, accountId: string, userId: string): Promise<void> {
  const db = createAdminClient();
  const { data: account } = await db
    .from("google_accounts")
    .select("id, email, status")
    .eq("id", accountId)
    .maybeSingle<{ id: string; email: string; status: string }>();
  if (!account) throw new GoogleApiError("Google account not found.", "config");
  if (account.status !== "connected") throw new GoogleApiError("Google Sheet connection requires reauthorization.", "auth");

  const existing = await loadConnection(formId);
  const keepSheet = existing?.spreadsheet_id && existing.status !== "disconnected" && existing.google_account_id === accountId;
  const { error } = await db.from("google_sheet_connections").upsert(
    {
      form_id: formId,
      google_account_id: account.id,
      google_account_email: account.email,
      status: keepSheet ? "connected" : "pending_setup",
      created_by: existing?.id ? undefined : userId,
      ...(keepSheet
        ? {}
        : {
            spreadsheet_id: null,
            spreadsheet_name: null,
            spreadsheet_url: null,
            worksheet_id: null,
            worksheet_name: null,
            column_map: [],
            headers_hash: null,
          }),
      last_error: null,
      disconnected_at: null,
    },
    { onConflict: "form_id" },
  );
  if (error) throw error;
}

export async function listSpreadsheets(formId: string, query: string, pageToken?: string) {
  const conn = await requireAccountConnection(formId);
  const client = await getSheetsClient(conn.google_account_id);
  return client.listSpreadsheets(query, pageToken);
}

export async function getSpreadsheetDetails(formId: string, spreadsheetIdOrUrl: string): Promise<SpreadsheetInfo> {
  const id = parseSpreadsheetId(spreadsheetIdOrUrl);
  if (!id) throw new GoogleApiError("That doesn't look like a Google Sheets link or ID.", "config");
  const conn = await requireAccountConnection(formId);
  const client = await getSheetsClient(conn.google_account_id);
  return client.getSpreadsheet(id);
}

async function finalizeConnection(
  formId: string,
  conn: SheetConnectionRow,
  spreadsheet: SpreadsheetInfo,
  worksheet: WorksheetInfo,
  columns: SheetColumn[],
  options: { backfill: boolean },
): Promise<{ queued: number }> {
  const db = createAdminClient();
  const patch = {
    spreadsheet_id: spreadsheet.id,
    spreadsheet_name: spreadsheet.title,
    spreadsheet_url: spreadsheet.url,
    worksheet_id: worksheet.sheetId,
    worksheet_name: worksheet.title,
    status: "connected" as const,
    enabled: true,
    column_map: columns,
    headers_hash: null,
    last_error: null,
    connected_at: new Date().toISOString(),
    disconnected_at: null,
  };
  const { error } = await db.from("google_sheet_connections").update(patch).eq("id", conn.id);
  if (error) throw error;

  // Write the header row now so the admin immediately sees the structure.
  const client = await getSheetsClient(conn.google_account_id!);
  const form = await loadFormForSheets(formId);
  await ensureHeaders(client, { ...conn, ...patch }, form, {
    updateConnection: async (id, p) => {
      await db.from("google_sheet_connections").update(p).eq("id", id);
    },
  });

  const queued = options.backfill ? await queueBackfill(formId) : 0;
  return { queued };
}

export async function connectExistingSpreadsheet(
  formId: string,
  input: { spreadsheetId: string; worksheetId?: number | null; newWorksheetName?: string | null; backfill: boolean },
): Promise<{ queued: number; spreadsheetName: string }> {
  const conn = await requireAccountConnection(formId);
  const client = await getSheetsClient(conn.google_account_id);
  const spreadsheet = await client.getSpreadsheet(input.spreadsheetId);

  let worksheet: WorksheetInfo | undefined;
  if (input.newWorksheetName) {
    const name = input.newWorksheetName.trim().slice(0, 90);
    if (!name) throw new GoogleApiError("Enter a worksheet name.", "config");
    worksheet = spreadsheet.sheets.find((s) => s.title.toLowerCase() === name.toLowerCase());
    if (!worksheet) worksheet = await client.addWorksheet(spreadsheet.id, name);
  } else {
    worksheet = spreadsheet.sheets.find((s) => s.sheetId === input.worksheetId) ?? spreadsheet.sheets[0];
  }
  if (!worksheet) throw new GoogleApiError("The selected worksheet was not found.", "config");

  // Never overwrite an existing header row: adopt it and append new columns.
  const form = await loadFormForSheets(formId);
  const firstRow = (await client.getValues(spreadsheet.id, `${a1Sheet(worksheet.title)}!1:1`))[0] ?? [];
  const columns = firstRow.some((c) => String(c).trim())
    ? adoptExistingHeaders(firstRow.map(String), form.fields, form.sheetSettings)
    : reconcileColumns([], form.fields, form.sheetSettings);

  const { queued } = await finalizeConnection(formId, conn, spreadsheet, worksheet, columns, input);
  return { queued, spreadsheetName: spreadsheet.title };
}

export async function createSpreadsheetForForm(
  formId: string,
  input: { title?: string; backfill: boolean },
): Promise<{ queued: number; spreadsheetName: string; url: string }> {
  const conn = await requireAccountConnection(formId);
  const client = await getSheetsClient(conn.google_account_id);
  const form = await loadFormForSheets(formId);
  const title = (input.title?.trim() || `Synergy Feedback - ${form.name}`).slice(0, 200);
  const spreadsheet = await client.createSpreadsheet(title, DEFAULT_WORKSHEET);
  const worksheet = spreadsheet.sheets[0]!;
  const columns = reconcileColumns([], form.fields, form.sheetSettings);
  const { queued } = await finalizeConnection(formId, conn, spreadsheet, worksheet, columns, input);
  return { queued, spreadsheetName: spreadsheet.title, url: spreadsheet.url };
}

export interface ConnectionTestResult {
  ok: boolean;
  message: string;
  details?: { spreadsheet: string; worksheet: string; columns: number };
}

export async function testConnection(formId: string): Promise<ConnectionTestResult> {
  const db = createAdminClient();
  const conn = await loadConnection(formId);
  if (!conn?.google_account_id || !conn.spreadsheet_id || !conn.worksheet_name) {
    return { ok: false, message: "No spreadsheet is connected yet." };
  }
  try {
    const client = await getSheetsClient(conn.google_account_id);
    const spreadsheet = await client.getSpreadsheet(conn.spreadsheet_id);
    const worksheet =
      spreadsheet.sheets.find((s) => s.sheetId === Number(conn.worksheet_id)) ??
      spreadsheet.sheets.find((s) => s.title === conn.worksheet_name);
    if (!worksheet) {
      await db.from("google_sheet_connections").update({ status: "error", last_error: "Worksheet not found." }).eq("id", conn.id);
      return { ok: false, message: `Worksheet "${conn.worksheet_name}" was not found. It may have been deleted.` };
    }
    // Worksheet renamed in Google Sheets → follow it.
    const patch: Partial<SheetConnectionRow> = {
      status: "connected",
      last_error: null,
      spreadsheet_name: spreadsheet.title,
      spreadsheet_url: spreadsheet.url,
      worksheet_name: worksheet.title,
    };
    await db.from("google_sheet_connections").update(patch).eq("id", conn.id);
    const form = await loadFormForSheets(formId);
    const columns = await ensureHeaders(client, { ...conn, ...patch } as SheetConnectionRow, form, {
      updateConnection: async (id, p) => {
        await db.from("google_sheet_connections").update(p).eq("id", id);
      },
    });
    return {
      ok: true,
      message: "Connection is working. Synergy Feedback can write to this spreadsheet.",
      details: { spreadsheet: spreadsheet.title, worksheet: worksheet.title, columns: columns.length },
    };
  } catch (err) {
    const e = err instanceof GoogleApiError ? err : null;
    const message =
      e?.kind === "auth"
        ? "Google Sheet connection requires reauthorization."
        : e?.kind === "not_found"
          ? "The spreadsheet could not be found. It may have been deleted."
          : e?.kind === "permission"
            ? "The connected Google account no longer has access to this spreadsheet."
            : "Could not reach Google Sheets. Please try again shortly.";
    if (e && e.kind !== "transient" && e.kind !== "rate_limit") {
      await db
        .from("google_sheet_connections")
        .update({ status: e.kind === "auth" ? "reauth_required" : "error", last_error: message })
        .eq("id", conn.id);
    }
    return { ok: false, message };
  }
}

/** Disconnects the form. The spreadsheet and its data are NEVER deleted. */
export async function disconnectSheet(formId: string): Promise<void> {
  const db = createAdminClient();
  const conn = await loadConnection(formId);
  if (!conn) return;
  await db
    .from("google_sheet_connections")
    .update({
      status: "disconnected",
      enabled: false,
      disconnected_at: new Date().toISOString(),
      last_error: null,
    })
    .eq("id", conn.id);
  await db
    .from("google_sheet_sync_logs")
    .update({ status: "skipped", next_attempt_at: null, error_message: "Google Sheet was disconnected.", locked_at: null })
    .eq("connection_id", conn.id)
    .in("status", ["pending", "failed"]);
}

export async function setSheetEnabled(formId: string, enabled: boolean): Promise<void> {
  const conn = await loadConnection(formId);
  if (!conn || conn.status === "disconnected") throw new GoogleApiError("No Google Sheet is connected.", "config");
  await createAdminClient().from("google_sheet_connections").update({ enabled }).eq("id", conn.id);
}

/** Saves custom column headers. Takes effect on the sheet immediately. */
export async function updateColumnHeaders(formId: string, headers: Record<string, string>): Promise<void> {
  const db = createAdminClient();
  const conn = await loadConnection(formId);
  if (!conn || conn.status === "disconnected") throw new GoogleApiError("No Google Sheet is connected.", "config");
  const form = await loadFormForSheets(formId);
  const current = reconcileColumns(conn.column_map ?? [], form.fields, form.sheetSettings);
  const defaults = new Map(reconcileColumns([], form.fields, form.sheetSettings).map((c) => [c.key, c.header]));
  const updated = current.map((col) => {
    const next = headers[col.key];
    if (next === undefined) return col;
    const header = next.trim().slice(0, 200) || defaults.get(col.key) || col.header;
    return { ...col, header, custom: defaults.has(col.key) ? header !== defaults.get(col.key) : true };
  });
  await db.from("google_sheet_connections").update({ column_map: updated }).eq("id", conn.id);
  if (conn.status === "connected" && conn.google_account_id && conn.spreadsheet_id) {
    try {
      const client = await getSheetsClient(conn.google_account_id);
      await ensureHeaders(client, { ...conn, column_map: updated }, form, {
        updateConnection: async (id, p) => {
          await db.from("google_sheet_connections").update(p).eq("id", id);
        },
      });
    } catch {
      // Header row will be rewritten on the next successful sync.
    }
  }
}

/** Current mapping (stored columns reconciled with the live form) for the UI. */
export async function getColumnPreview(formId: string): Promise<SheetColumn[]> {
  const conn = await loadConnection(formId);
  const form = await loadFormForSheets(formId);
  return reconcileColumns(conn?.column_map ?? [], form.fields, form.sheetSettings);
}

export { headersOf };
