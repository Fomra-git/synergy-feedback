import { describeGoogleError, GoogleApiError } from "@/lib/google/errors";
import { a1Sheet, columnLetter } from "@/lib/google/a1";
import type { FormField, FormSheetSettings } from "@/types/forms";
import type { SheetColumn, SheetConnectionRow, SyncLogRow } from "@/types/db";
import { buildRow, headersHash, headersOf, reconcileColumns, SUBMISSION_ID_KEY } from "./columns";

/**
 * Google Sheets synchronisation engine.
 *
 * Pure orchestration with injected dependencies so it can be unit tested
 * without Google or Supabase. Guarantees:
 *  - Supabase stays the source of truth: failures only update sync logs.
 *  - Idempotent appends: a job whose previous attempt may have reached Google
 *    (attempt_count > 1) is checked against the sheet's Submission ID column
 *    before appending, so retries never create duplicate rows.
 *  - Bounded retries with exponential backoff; permanent errors (revoked
 *    authorisation, deleted spreadsheet) stop retrying until an admin acts.
 */

export const MAX_ATTEMPTS = 8;
const BACKOFF_MINUTES = [1, 5, 15, 60, 180, 360, 720];

export function nextAttemptDelayMs(attemptCount: number): number {
  const idx = Math.min(Math.max(attemptCount, 1), BACKOFF_MINUTES.length) - 1;
  return BACKOFF_MINUTES[idx]! * 60_000;
}

export interface SheetApi {
  getValues(spreadsheetId: string, range: string): Promise<string[][]>;
  updateValues(spreadsheetId: string, range: string, values: (string | number)[][]): Promise<void>;
  appendRows(spreadsheetId: string, range: string, values: (string | number)[][]): Promise<number | null>;
  formatHeaderRow(spreadsheetId: string, sheetId: number): Promise<void>;
}

export interface SubmissionForSync {
  id: string;
  submission_number: string;
  submitted_at: string;
  user_agent: string | null;
  ip_hash: string | null;
  answers: { field_id: string; field_type: string; value: string | null; value_json: unknown }[];
}

export interface FormContext {
  name: string;
  branchName: string;
  fields: FormField[];
  sheetSettings: FormSheetSettings;
}

export interface SyncDeps {
  timeZone: string;
  getConnection(id: string): Promise<SheetConnectionRow | null>;
  getClient(accountId: string): Promise<SheetApi>;
  getFormContext(formId: string): Promise<FormContext>;
  getSubmissions(ids: string[]): Promise<SubmissionForSync[]>;
  updateConnection(id: string, patch: Partial<SheetConnectionRow>): Promise<void>;
  updateLog(id: string, patch: Partial<SyncLogRow>): Promise<void>;
  /** Called when Google rejects the account's credentials (revoked/expired). */
  markAccountReauth?(accountId: string, reason: string): Promise<void>;
  now?: () => Date;
}

export interface SyncSummary {
  processed: number;
  synced: number;
  failed: number;
  skipped: number;
  alreadyPresent: number;
}

/** Writes the header row when the column layout changed. Returns the active columns. */
export async function ensureHeaders(
  api: SheetApi,
  conn: SheetConnectionRow,
  form: FormContext,
  deps: Pick<SyncDeps, "updateConnection">,
): Promise<SheetColumn[]> {
  const columns = reconcileColumns(conn.column_map ?? [], form.fields, form.sheetSettings);
  const hash = headersHash(columns);
  if (hash !== conn.headers_hash) {
    const sheet = a1Sheet(conn.worksheet_name!);
    await api.updateValues(conn.spreadsheet_id!, `${sheet}!A1:${columnLetter(columns.length - 1)}1`, [headersOf(columns)]);
    if (!conn.headers_hash && conn.worksheet_id !== null && conn.worksheet_id !== undefined) {
      await api.formatHeaderRow(conn.spreadsheet_id!, Number(conn.worksheet_id)).catch(() => undefined);
    }
    await deps.updateConnection(conn.id, { column_map: columns, headers_hash: hash });
    conn.column_map = columns;
    conn.headers_hash = hash;
  }
  return columns;
}

/** Reads the Submission ID column → map of submission number → sheet row number. */
export async function readExistingSubmissionRows(api: SheetApi, conn: SheetConnectionRow, columns: SheetColumn[]): Promise<Map<string, number>> {
  const idx = columns.findIndex((c) => c.key === SUBMISSION_ID_KEY);
  const map = new Map<string, number>();
  if (idx < 0) return map;
  const letter = columnLetter(idx);
  const rows = await api.getValues(conn.spreadsheet_id!, `${a1Sheet(conn.worksheet_name!)}!${letter}:${letter}`);
  rows.forEach((row, i) => {
    const v = row[0];
    if (v && i > 0) map.set(String(v).trim(), i + 1);
  });
  return map;
}

export async function syncJobs(jobs: SyncLogRow[], deps: SyncDeps): Promise<SyncSummary> {
  const summary: SyncSummary = { processed: 0, synced: 0, failed: 0, skipped: 0, alreadyPresent: 0 };
  const now = () => (deps.now ? deps.now() : new Date());

  const byConnection = new Map<string, SyncLogRow[]>();
  for (const job of jobs) {
    const key = job.connection_id ?? "none";
    byConnection.set(key, [...(byConnection.get(key) ?? []), job]);
  }

  for (const [connectionId, group] of byConnection) {
    summary.processed += group.length;
    const conn = connectionId === "none" ? null : await deps.getConnection(connectionId);

    if (!conn || conn.status === "disconnected" || !conn.enabled || !conn.spreadsheet_id || !conn.worksheet_name || !conn.google_account_id) {
      for (const job of group) {
        await deps.updateLog(job.id, {
          status: "skipped",
          error_message: "Google Sheet is not connected for this form.",
          next_attempt_at: null,
          locked_at: null,
        });
      }
      summary.skipped += group.length;
      continue;
    }

    const done = new Set<string>();
    try {
      const api = await deps.getClient(conn.google_account_id);
      const form = await deps.getFormContext(conn.form_id);
      const columns = await ensureHeaders(api, conn, form, deps);
      const submissions = new Map((await deps.getSubmissions(group.map((j) => j.submission_id))).map((s) => [s.id, s]));

      const needsCheck = group.some((j) => j.attempt_count > 1 || (j.spreadsheet_id && j.spreadsheet_id !== conn.spreadsheet_id));
      const existing = needsCheck ? await readExistingSubmissionRows(api, conn, columns) : new Map<string, number>();

      const toAppend: { job: SyncLogRow; row: string[] }[] = [];
      for (const job of group) {
        const sub = submissions.get(job.submission_id);
        if (!sub) {
          await deps.updateLog(job.id, { status: "skipped", error_message: "Submission no longer exists.", next_attempt_at: null, locked_at: null });
          summary.skipped++;
          done.add(job.id);
          continue;
        }
        const presentRow = existing.get(sub.submission_number);
        if (presentRow) {
          await deps.updateLog(job.id, {
            status: "synced",
            google_row_number: presentRow,
            synced_at: now().toISOString(),
            error_message: null,
            error_kind: null,
            next_attempt_at: null,
            locked_at: null,
            spreadsheet_id: conn.spreadsheet_id,
            worksheet_name: conn.worksheet_name,
          });
          summary.synced++;
          summary.alreadyPresent++;
          done.add(job.id);
          continue;
        }
        toAppend.push({
          job,
          row: buildRow(columns, {
            submissionNumber: sub.submission_number,
            submittedAt: sub.submitted_at,
            formName: form.name,
            branchName: form.branchName,
            userAgent: sub.user_agent,
            ipHash: sub.ip_hash,
            timeZone: deps.timeZone,
            answers: new Map(sub.answers.map((a) => [a.field_id, a])),
          }),
        });
      }

      if (toAppend.length) {
        // One API call per connection batch (Sheets quota friendly).
        const startRow = await api.appendRows(
          conn.spreadsheet_id,
          `${a1Sheet(conn.worksheet_name)}!A1`,
          toAppend.map((t) => t.row),
        );
        for (let i = 0; i < toAppend.length; i++) {
          const { job } = toAppend[i]!;
          await deps.updateLog(job.id, {
            status: "synced",
            google_row_number: startRow ? startRow + i : null,
            synced_at: now().toISOString(),
            error_message: null,
            error_kind: null,
            next_attempt_at: null,
            locked_at: null,
            spreadsheet_id: conn.spreadsheet_id,
            worksheet_name: conn.worksheet_name,
          });
          done.add(job.id);
          summary.synced++;
        }
      }

      await deps.updateConnection(conn.id, {
        last_sync_at: now().toISOString(),
        last_error: null,
        ...(conn.status !== "connected" ? { status: "connected" as const } : {}),
      });
    } catch (err) {
      const gErr = err instanceof GoogleApiError ? err : null;
      const message = describeGoogleError(err);
      const permanent = gErr ? !gErr.retryable : false;

      if (gErr && (gErr.kind === "permission" || gErr.kind === "not_found")) {
        await deps.updateConnection(conn.id, { status: "error", last_error: message });
      } else if (gErr?.kind === "auth") {
        await deps.updateConnection(conn.id, { status: "reauth_required", last_error: message });
        await deps.markAccountReauth?.(conn.google_account_id, gErr.message);
      } else {
        await deps.updateConnection(conn.id, { last_error: message });
      }

      for (const job of group) {
        if (done.has(job.id)) continue;
        const exhausted = job.attempt_count >= MAX_ATTEMPTS;
        await deps.updateLog(job.id, {
          status: "failed",
          error_message: exhausted && !permanent ? `${message} (retry limit reached)` : message,
          error_kind: gErr?.kind === "auth" ? "auth" : permanent ? "config" : "transient",
          next_attempt_at:
            permanent || exhausted ? null : new Date(now().getTime() + nextAttemptDelayMs(job.attempt_count)).toISOString(),
          locked_at: null,
        });
        summary.failed++;
      }
    }
  }

  return summary;
}
