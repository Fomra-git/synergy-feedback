import "server-only";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import { sha256 } from "@/lib/security/crypto";
import { answerToText, type StoredAnswer } from "@/lib/forms/format";
import { isInputType } from "@/lib/forms/field-registry";
import { validateAnswers } from "@/lib/forms/validation";
import { logError } from "@/lib/logger";
import { getAppSettings } from "@/services/settings";
import { sendSubmissionNotification } from "@/services/email/notifications";
import { resolveNotificationRecipients } from "@/lib/email/recipients";
import { runSyncBatch } from "@/services/google-sheets/sync";
import type { PublishedForm } from "@/services/forms/public";
import type { AnswerMap, FormNotificationSettings, FormSubmissionSettings, UploadedFileRef } from "@/types/forms";
import { finalizeUploads, storeSignature, UploadError } from "./files";

export class SubmissionError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly fieldErrors?: Record<string, string>,
  ) {
    super(message);
  }
}

export interface CreateSubmissionInput {
  form: PublishedForm;
  answers: AnswerMap;
  clientToken: string | null;
  ipHash: string | null;
  userAgent: string | null;
  referrer?: string | null;
}

export interface CreateSubmissionResult {
  submissionId: string;
  submissionNumber: string;
  syncLogId: string | null;
  isDuplicate: boolean;
  notification: FormNotificationSettings;
}

/**
 * The submission pipeline:
 *   1. Validate on the server (client validation is never trusted)
 *   2. Finalise uploads / signatures
 *   3. Save submission + answers + pending sync record atomically in Supabase
 * Google Sheets sync and email run AFTER the response (see afterSubmission),
 * so they can never cause a submission to be lost.
 */
export async function createSubmission(input: CreateSubmissionInput): Promise<CreateSubmissionResult> {
  const { form } = input;
  const db = createAdminClient();

  const { data: privateSettings } = await db
    .from("form_settings")
    .select("submission, notifications")
    .eq("form_id", form.id)
    .maybeSingle<{ submission: FormSubmissionSettings; notifications: FormNotificationSettings }>();

  const submissionSettings = privateSettings?.submission ?? {};
  if (submissionSettings.allowSubmissions === false) {
    throw new SubmissionError(submissionSettings.closedMessage || "This form is not accepting submissions right now.", 403);
  }

  const result = validateAnswers(form.fields, input.answers);
  if (!result.success) {
    throw new SubmissionError("Please correct the highlighted fields.", 422, result.errors);
  }

  // Files & signatures → private storage; answers keep only storage paths.
  const folder = randomUUID();
  const answers: StoredAnswer[] = [];
  const searchParts: string[] = [];
  try {
    for (const field of form.fields) {
      if (!isInputType(field.type)) continue;
      const value = result.values[field.field_id];
      if (value === undefined) continue;

      let stored: StoredAnswer;
      if (field.type === "file_upload") {
        const files = await finalizeUploads(form.id, field.field_id, value as UploadedFileRef[], folder);
        stored = { field_id: field.field_id, field_type: field.type, field_label: field.label, value: files.map((f) => f.name).join(", "), value_json: files };
      } else if (field.type === "signature") {
        const sig = await storeSignature(form.id, field.field_id, value as string, folder);
        stored = { field_id: field.field_id, field_type: field.type, field_label: field.label, value: "Signed", value_json: sig };
      } else {
        const text = answerToText(field.type, value);
        stored = {
          field_id: field.field_id,
          field_type: field.type,
          field_label: field.label,
          value: text,
          value_json: Array.isArray(value) || typeof value === "number" ? value : null,
        };
        searchParts.push(text);
      }
      answers.push(stored);
    }
  } catch (err) {
    if (err instanceof UploadError) throw new SubmissionError(err.message, 422);
    throw err;
  }

  const dedupeHash =
    submissionSettings.duplicateProtection === false
      ? null
      : sha256(JSON.stringify([input.ipHash ?? "", answers.map((a) => [a.field_id, a.value])]));

  const { data, error } = await db.rpc("create_submission", {
    p_form_id: form.id,
    p_answers: answers,
    p_client_token: input.clientToken,
    p_ip_hash: input.ipHash,
    p_user_agent: input.userAgent,
    p_metadata: { referrer: input.referrer ?? null },
    p_dedupe_hash: dedupeHash,
    p_search_text: searchParts.join(" ").slice(0, 20000),
    p_tz: env.timezone(),
  });

  if (error) {
    if (error.message.includes("submissions_closed")) {
      throw new SubmissionError(submissionSettings.closedMessage || "This form is no longer accepting submissions.", 403);
    }
    if (error.message.includes("submission_limit_reached")) {
      throw new SubmissionError("This form has reached its submission limit.", 403);
    }
    if (error.message.includes("form_not_available")) throw new SubmissionError("This form is not available.", 404);
    logError("submission.create_failed", error, { form: form.slug });
    throw new SubmissionError("We couldn't save your response. Please try again.", 500);
  }

  const row = (Array.isArray(data) ? data[0] : data) as {
    submission_id: string;
    submission_number: string;
    sync_log_id: string | null;
    is_duplicate: boolean;
  };

  return {
    submissionId: row.submission_id,
    submissionNumber: row.submission_number,
    syncLogId: row.sync_log_id,
    isDuplicate: row.is_duplicate,
    notification: privateSettings?.notifications ?? {},
  };
}

/** Runs after the HTTP response: Google Sheets sync, then email. Never throws. */
export async function afterSubmission(form: PublishedForm, result: CreateSubmissionResult): Promise<void> {
  if (result.isDuplicate) return;

  if (result.syncLogId) {
    try {
      await runSyncBatch({ ids: [result.syncLogId], limit: 1 });
    } catch (err) {
      logError("submission.sheet_sync_failed", err, { submission: result.submissionNumber });
    }
  }

  try {
    const n = result.notification;
    if (n.enabled === false) return;
    const settings = await getAppSettings();

    const db = createAdminClient();
    const { data: sub } = await db
      .from("form_submissions")
      .select("submitted_at, branch_id, branches(name)")
      .eq("id", result.submissionId)
      .single<{ submitted_at: string; branch_id: string | null; branches: { name: string } | null }>();

    const recipients = resolveNotificationRecipients({
      formEnabled: n.enabled,
      formRecipients: n.recipients,
      allForms: settings.email.defaultRecipients,
      branchRecipients: settings.email.branchRecipients,
      branchId: sub?.branch_id,
    });
    if (!recipients.length) return;

    let answers: { label: string; value: string }[] | undefined;
    if (n.includeAnswers) {
      const { data: rows } = await db
        .from("submission_answers")
        .select("field_id, field_label, field_type, value")
        .eq("submission_id", result.submissionId);
      const order = new Map(form.fields.map((f, i) => [f.field_id, i]));
      answers = (rows ?? [])
        .filter((r) => r.field_type !== "signature")
        .sort((a, b) => (order.get(a.field_id as string) ?? 0) - (order.get(b.field_id as string) ?? 0))
        .map((r) => ({ label: r.field_label as string, value: (r.value as string) ?? "" }));
    }

    await sendSubmissionNotification({
      recipients,
      formName: form.name,
      branchName: sub?.branches?.name ?? null,
      submissionId: result.submissionId,
      submissionNumber: result.submissionNumber,
      submittedAt: sub?.submitted_at ?? new Date().toISOString(),
      subjectTemplate: n.subject,
      senderName: settings.email.senderName,
      brandColor: settings.branding.primaryColor,
      answers,
    });
  } catch (err) {
    logError("submission.notification_failed", err, { submission: result.submissionNumber });
  }

  // Piggy-back: opportunistically retry a few overdue sync jobs.
  try {
    await runSyncBatch({ limit: 5 });
  } catch {
    // cron will pick them up
  }
}
