import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import { logError, logInfo } from "@/lib/logger";
import { rowToField } from "@/services/forms/mappers";
import type { FormFieldRow, SheetConnectionRow, SyncLogRow } from "@/types/db";
import type { FormSheetSettings } from "@/types/forms";
import { syncJobs, type SyncDeps, type SyncSummary } from "./engine";
import { getSheetsClient, markAccountReauthRequired } from "./tokens";

export function supabaseSyncDeps(): SyncDeps {
  const db = createAdminClient();
  return {
    timeZone: env.timezone(),
    async getConnection(id) {
      const { data } = await db.from("google_sheet_connections").select("*").eq("id", id).maybeSingle<SheetConnectionRow>();
      return data ?? null;
    },
    getClient: (accountId) => getSheetsClient(accountId),
    async getFormContext(formId) {
      const [{ data: form }, { data: fields }, { data: settings }] = await Promise.all([
        db.from("forms").select("name, branches(name)").eq("id", formId).single<{ name: string; branches: { name: string } | null }>(),
        db.from("form_fields").select("*").eq("form_id", formId).order("position").returns<FormFieldRow[]>(),
        db.from("form_settings").select("google_sheets").eq("form_id", formId).maybeSingle<{ google_sheets: FormSheetSettings }>(),
      ]);
      return {
        name: form?.name ?? "",
        branchName: form?.branches?.name ?? "",
        fields: (fields ?? []).map(rowToField),
        sheetSettings: settings?.google_sheets ?? {},
      };
    },
    async getSubmissions(ids) {
      const { data } = await db
        .from("form_submissions")
        .select("id, submission_number, submitted_at, user_agent, ip_hash, submission_answers(field_id, field_type, value, value_json)")
        .in("id", ids);
      return (data ?? []).map((s) => ({
        id: s.id as string,
        submission_number: s.submission_number as string,
        submitted_at: s.submitted_at as string,
        user_agent: s.user_agent as string | null,
        ip_hash: s.ip_hash as string | null,
        answers: (s.submission_answers ?? []) as { field_id: string; field_type: string; value: string | null; value_json: unknown }[],
      }));
    },
    async updateConnection(id, patch) {
      const { error } = await db.from("google_sheet_connections").update(patch).eq("id", id);
      if (error) logError("sheets.update_connection_failed", error, { id });
    },
    markAccountReauth: (accountId, reason) => markAccountReauthRequired(accountId, reason),
    async updateLog(id, patch) {
      const { error } = await db.from("google_sheet_sync_logs").update(patch).eq("id", id);
      if (error) logError("sheets.update_log_failed", error, { id });
    },
  };
}

/** Claims due jobs (FOR UPDATE SKIP LOCKED) and processes them. */
export async function runSyncBatch(options: { ids?: string[]; limit?: number } = {}): Promise<SyncSummary> {
  const db = createAdminClient();
  const { data: jobs, error } = await db.rpc("claim_sync_jobs", {
    p_limit: options.limit ?? 50,
    p_ids: options.ids?.length ? options.ids : null,
  });
  if (error) {
    logError("sheets.claim_failed", error);
    return { processed: 0, synced: 0, failed: 0, skipped: 0, alreadyPresent: 0 };
  }
  const list = (jobs ?? []) as SyncLogRow[];
  if (!list.length) return { processed: 0, synced: 0, failed: 0, skipped: 0, alreadyPresent: 0 };
  const summary = await syncJobs(list, supabaseSyncDeps());
  logInfo("sheets.batch_complete", { ...summary });
  return summary;
}

export async function requeueJobs(filter: {
  formId?: string;
  accountId?: string;
  submissionIds?: string[];
}): Promise<number> {
  const { data, error } = await createAdminClient().rpc("requeue_sheet_jobs", {
    p_form_id: filter.formId ?? null,
    p_account_id: filter.accountId ?? null,
    p_submission_ids: filter.submissionIds?.length ? filter.submissionIds : null,
    p_include_pending: true,
  });
  if (error) {
    logError("sheets.requeue_failed", error, filter);
    throw new Error("Could not queue the sync. Please try again.");
  }
  return (data as number) ?? 0;
}

export async function queueBackfill(formId: string): Promise<number> {
  const { data, error } = await createAdminClient().rpc("queue_sheet_backfill", { p_form_id: formId });
  if (error) {
    logError("sheets.backfill_failed", error, { formId });
    throw new Error("Could not queue existing submissions.");
  }
  return (data as number) ?? 0;
}

/** Process up to `max` due jobs in a loop (used by cron / manual "sync now"). */
export async function drainQueue(max = 200, timeBudgetMs = 50_000): Promise<SyncSummary> {
  const started = Date.now();
  const total: SyncSummary = { processed: 0, synced: 0, failed: 0, skipped: 0, alreadyPresent: 0 };
  while (total.processed < max && Date.now() - started < timeBudgetMs) {
    const s = await runSyncBatch({ limit: Math.min(50, max - total.processed) });
    if (!s.processed) break;
    total.processed += s.processed;
    total.synced += s.synced;
    total.failed += s.failed;
    total.skipped += s.skipped;
    total.alreadyPresent += s.alreadyPresent;
  }
  return total;
}
