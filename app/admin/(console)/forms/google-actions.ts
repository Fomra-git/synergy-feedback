"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertFormAccess } from "@/lib/auth/form-access";
import { requirePermission, requireSuperAdmin } from "@/lib/auth/session";
import { runAction, UserFacingError, type ActionResult } from "@/lib/actions";
import { logAudit } from "@/lib/audit";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptSecret } from "@/lib/security/crypto";
import { revokeToken } from "@/lib/google/oauth";
import type { SpreadsheetInfo, SpreadsheetSummary } from "@/lib/google/sheets-api";
import {
  attachAccountToForm,
  connectExistingSpreadsheet,
  createSpreadsheetForForm,
  disconnectSheet,
  getSpreadsheetDetails,
  listSpreadsheets,
  setSheetEnabled,
  testConnection,
  updateColumnHeaders,
  type ConnectionTestResult,
} from "@/services/google-sheets/connections";
import { requeueJobs, runSyncBatch } from "@/services/google-sheets/sync";

function refresh(formId: string) {
  revalidatePath(`/admin/forms/${formId}`, "layout");
  revalidatePath("/admin/forms");
  revalidatePath("/admin/integrations/google-sheets");
}

export async function attachGoogleAccountAction(formId: string, accountId: string): Promise<ActionResult> {
  return runAction("google.attach", async () => {
    const { session } = await assertFormAccess(formId, "integrations.manage");
    await attachAccountToForm(formId, z.uuid().parse(accountId), session.userId);
    refresh(formId);
    return undefined;
  });
}

export async function listSpreadsheetsAction(
  formId: string,
  query: string,
  pageToken?: string,
): Promise<ActionResult<{ files: SpreadsheetSummary[]; nextPageToken?: string }>> {
  return runAction("google.list", async () => {
    await assertFormAccess(formId, "integrations.manage");
    return listSpreadsheets(formId, String(query ?? "").slice(0, 100), pageToken);
  });
}

export async function getSpreadsheetAction(formId: string, idOrUrl: string): Promise<ActionResult<SpreadsheetInfo>> {
  return runAction("google.get", async () => {
    await assertFormAccess(formId, "integrations.manage");
    return getSpreadsheetDetails(formId, String(idOrUrl).slice(0, 500));
  });
}

const connectSchema = z.object({
  spreadsheetId: z.string().regex(/^[a-zA-Z0-9-_]{20,}$/),
  worksheetId: z.number().int().nullable().optional(),
  newWorksheetName: z.string().trim().max(90).nullable().optional(),
  backfill: z.boolean().default(false),
});

export async function connectExistingSheetAction(formId: string, input: z.input<typeof connectSchema>): Promise<ActionResult<{ queued: number }>> {
  return runAction("google.connectExisting", async () => {
    const { session } = await assertFormAccess(formId, "integrations.manage");
    const data = connectSchema.parse(input);
    const res = await connectExistingSpreadsheet(formId, data);
    await logAudit({
      userId: session.userId,
      action: "google_sheet.connected",
      entityType: "form",
      entityId: formId,
      metadata: { spreadsheet: res.spreadsheetName, mode: "existing", backfill: data.backfill },
    });
    if (res.queued) runSyncBatch({ limit: 50 }).catch(() => undefined);
    refresh(formId);
    return { queued: res.queued };
  });
}

export async function createSheetAction(formId: string, input: { title?: string; backfill: boolean }): Promise<ActionResult<{ queued: number; url: string }>> {
  return runAction("google.create", async () => {
    const { session } = await assertFormAccess(formId, "integrations.manage");
    const title = z.string().trim().max(200).optional().parse(input.title);
    const res = await createSpreadsheetForForm(formId, { title, backfill: Boolean(input.backfill) });
    await logAudit({
      userId: session.userId,
      action: "google_sheet.connected",
      entityType: "form",
      entityId: formId,
      metadata: { spreadsheet: res.spreadsheetName, mode: "created", backfill: input.backfill },
    });
    if (res.queued) runSyncBatch({ limit: 50 }).catch(() => undefined);
    refresh(formId);
    return { queued: res.queued, url: res.url };
  });
}

export async function testSheetConnectionAction(formId: string): Promise<ActionResult<ConnectionTestResult>> {
  return runAction("google.test", async () => {
    await assertFormAccess(formId, "integrations.manage");
    const res = await testConnection(formId);
    refresh(formId);
    return res;
  });
}

export async function disconnectSheetAction(formId: string): Promise<ActionResult> {
  return runAction(
    "google.disconnect",
    async () => {
      const { session } = await assertFormAccess(formId, "integrations.manage");
      await disconnectSheet(formId);
      await logAudit({ userId: session.userId, action: "google_sheet.disconnected", entityType: "form", entityId: formId });
      refresh(formId);
      return undefined;
    },
    "Google Sheet disconnected. Existing sheet data was not changed.",
  );
}

export async function setSheetEnabledAction(formId: string, enabled: boolean): Promise<ActionResult> {
  return runAction("google.enable", async () => {
    await assertFormAccess(formId, "integrations.manage");
    await setSheetEnabled(formId, Boolean(enabled));
    refresh(formId);
    return undefined;
  });
}

export async function updateSheetMappingAction(formId: string, headers: Record<string, string>): Promise<ActionResult> {
  return runAction(
    "google.mapping",
    async () => {
      const { session } = await assertFormAccess(formId, "integrations.manage");
      const parsed = z.record(z.string().max(80), z.string().max(200)).parse(headers);
      await updateColumnHeaders(formId, parsed);
      await logAudit({ userId: session.userId, action: "google_sheet.mapping_updated", entityType: "form", entityId: formId });
      refresh(formId);
      return undefined;
    },
    "Column mapping saved",
  );
}

/** Retries failed syncs for one form (or a single submission) and processes them now. */
export async function retrySyncAction(input: { formId?: string; submissionId?: string }): Promise<ActionResult<{ queued: number; synced: number; failed: number }>> {
  return runAction("google.retry", async () => {
    if (input.formId) await assertFormAccess(input.formId, "integrations.manage");
    else await requirePermission("integrations.manage");

    if (input.submissionId) {
      // Authorise via RLS: the admin must be able to read the submission.
      const { createClient } = await import("@/lib/supabase/server");
      const supabase = await createClient();
      const { data } = await supabase.from("form_submissions").select("id, form_id").eq("id", input.submissionId).maybeSingle();
      if (!data) throw new UserFacingError("Submission not found.");
      const queued = await requeueJobs({ submissionIds: [data.id] });
      const { data: logs } = await createAdminClient().from("google_sheet_sync_logs").select("id").eq("submission_id", data.id);
      const summary = await runSyncBatch({ ids: (logs ?? []).map((l) => l.id as string), limit: 5 });
      revalidatePath(`/admin/submissions/${data.id}`);
      if (!queued && !summary.processed) {
        throw new UserFacingError("Nothing to retry. Make sure a Google Sheet is connected and enabled for this form.");
      }
      return { queued, synced: summary.synced, failed: summary.failed };
    }

    if (!input.formId) throw new UserFacingError("Nothing to retry.");
    const queued = await requeueJobs({ formId: input.formId });
    const summary = await runSyncBatch({ limit: 50 });
    refresh(input.formId);
    return { queued, synced: summary.synced, failed: summary.failed };
  });
}

/** Removes a Google account entirely (super admin). Spreadsheets are never deleted. */
export async function removeGoogleAccountAction(accountId: string): Promise<ActionResult> {
  return runAction(
    "google.removeAccount",
    async () => {
      const session = await requireSuperAdmin();
      const db = createAdminClient();
      const { data: account } = await db.from("google_accounts").select("id, email, refresh_token_encrypted").eq("id", z.uuid().parse(accountId)).maybeSingle();
      if (!account) throw new UserFacingError("Account not found.");
      const { data: forms } = await db.from("google_sheet_connections").select("form_id").eq("google_account_id", accountId);
      for (const f of forms ?? []) await disconnectSheet(f.form_id as string);
      if (account.refresh_token_encrypted) {
        try {
          await revokeToken(decryptSecret(account.refresh_token_encrypted as string));
        } catch {
          // revoke is best effort
        }
      }
      await db.from("google_accounts").delete().eq("id", accountId);
      await logAudit({ userId: session.userId, action: "google_sheet.disconnected", entityType: "google_account", entityId: accountId, metadata: { email: account.email, removed: true } });
      revalidatePath("/admin/integrations/google-sheets");
      return undefined;
    },
    "Google account removed",
  );
}
