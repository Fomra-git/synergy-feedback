import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/logger";

export type AuditAction =
  | "form.created"
  | "form.updated"
  | "form.published"
  | "form.unpublished"
  | "form.archived"
  | "form.restored"
  | "form.deleted"
  | "form.duplicated"
  | "branch.created"
  | "branch.updated"
  | "branch.status_changed"
  | "branch.archived"
  | "google_sheet.connected"
  | "google_sheet.disconnected"
  | "google_sheet.reauthorized"
  | "google_sheet.mapping_updated"
  | "google_account.connected"
  | "submission.archived"
  | "submission.restored"
  | "submission.deleted"
  | "submissions.exported"
  | "settings.updated"
  | "user.updated";

/** Append-only audit trail. Failures are logged but never break the user action. */
export async function logAudit(entry: {
  userId: string | null;
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    const { error } = await createAdminClient()
      .from("audit_logs")
      .insert({
        user_id: entry.userId,
        action: entry.action,
        entity_type: entry.entityType,
        entity_id: entry.entityId ?? null,
        metadata: entry.metadata ?? {},
      });
    if (error) throw error;
  } catch (err) {
    logError("audit.write_failed", err, { action: entry.action });
  }
}
