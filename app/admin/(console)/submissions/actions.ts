"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/session";
import { check, runAction, UserFacingError, type ActionResult } from "@/lib/actions";
import { logAudit } from "@/lib/audit";

const idsSchema = z.array(z.uuid()).min(1).max(200);

export async function setSubmissionsArchivedAction(ids: string[], archived: boolean): Promise<ActionResult<{ count: number }>> {
  return runAction(
    "archiveSubmissions",
    async () => {
      const session = await requireAdmin();
      const list = idsSchema.parse(ids);
      const supabase = await createClient();
      const rows = check(
        await supabase
          .from("form_submissions")
          .update({ status: archived ? "archived" : "active", archived_at: archived ? new Date().toISOString() : null })
          .in("id", list)
          .select("id"),
      );
      for (const r of rows ?? []) {
        await logAudit({
          userId: session.userId,
          action: archived ? "submission.archived" : "submission.restored",
          entityType: "submission",
          entityId: r.id as string,
        });
      }
      revalidatePath("/admin/submissions");
      revalidatePath("/admin/dashboard");
      return { count: rows?.length ?? 0 };
    },
    archived ? "Submission archived" : "Submission restored",
  );
}

/** Permanent deletion — super admin only. Rows already in Google Sheets are not removed. */
export async function deleteSubmissionAction(id: string): Promise<ActionResult> {
  return runAction(
    "deleteSubmission",
    async () => {
      const session = await requireAdmin();
      if (!session.isSuperAdmin) throw new UserFacingError("Only a super admin can permanently delete submissions.");
      const supabase = await createClient();
      const { data: sub } = await supabase.from("form_submissions").select("id, submission_number, form_id").eq("id", z.uuid().parse(id)).maybeSingle();
      if (!sub) throw new UserFacingError("Submission not found.");
      check(await supabase.from("form_submissions").delete().eq("id", id));
      await logAudit({
        userId: session.userId,
        action: "submission.deleted",
        entityType: "submission",
        entityId: id,
        metadata: { submissionNumber: sub.submission_number, formId: sub.form_id },
      });
      revalidatePath("/admin/submissions");
      return undefined;
    },
    "Submission permanently deleted",
  );
}
