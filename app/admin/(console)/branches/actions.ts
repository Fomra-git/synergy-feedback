"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/session";
import { check, runAction, UserFacingError, type ActionResult } from "@/lib/actions";
import { logAudit } from "@/lib/audit";
import { branchSchema, type BranchInput } from "@/schemas/branch";

export async function saveBranchAction(input: BranchInput): Promise<ActionResult<{ id: string }>> {
  return runAction(
    "saveBranch",
    async () => {
      const session = await requireAdmin();
      const data = branchSchema.parse(input);
      const supabase = await createClient();
      const row = {
        name: data.name,
        code: data.code,
        address: data.address,
        phone: data.phone,
        email: data.email,
        manager_name: data.managerName,
        status: data.status,
      };
      let id = data.id;
      if (id) {
        const updated = check(await supabase.from("branches").update(row).eq("id", id).select("id"));
        if (!updated?.length) throw new UserFacingError("Branch not found or access denied.");
        await logAudit({ userId: session.userId, action: "branch.updated", entityType: "branch", entityId: id, metadata: { name: data.name } });
      } else {
        const created = check(await supabase.from("branches").insert({ ...row, created_by: session.userId }).select("id").single<{ id: string }>());
        id = created.id;
        await logAudit({ userId: session.userId, action: "branch.created", entityType: "branch", entityId: id, metadata: { name: data.name } });
      }
      revalidatePath("/admin/branches");
      revalidatePath(`/admin/branches/${id}`);
      return { id: id! };
    },
    input.id ? "Branch updated" : "Branch created",
  );
}

export async function setBranchStatusAction(branchId: string, status: "active" | "inactive"): Promise<ActionResult> {
  return runAction(
    "setBranchStatus",
    async () => {
      const session = await requireAdmin();
      const supabase = await createClient();
      const updated = check(await supabase.from("branches").update({ status }).eq("id", z.uuid().parse(branchId)).select("id"));
      if (!updated?.length) throw new UserFacingError("Branch not found or access denied.");
      await logAudit({ userId: session.userId, action: "branch.status_changed", entityType: "branch", entityId: branchId, metadata: { status } });
      revalidatePath("/admin/branches");
      revalidatePath(`/admin/branches/${branchId}`);
      return undefined;
    },
    status === "active" ? "Branch activated" : "Branch deactivated",
  );
}

/** Soft delete: the branch disappears from lists but history is kept. */
export async function archiveBranchAction(branchId: string): Promise<ActionResult> {
  return runAction(
    "archiveBranch",
    async () => {
      const session = await requireAdmin();
      const supabase = await createClient();
      const updated = check(
        await supabase.from("branches").update({ archived_at: new Date().toISOString(), status: "inactive" }).eq("id", z.uuid().parse(branchId)).select("id"),
      );
      if (!updated?.length) throw new UserFacingError("Branch not found or access denied.");
      await logAudit({ userId: session.userId, action: "branch.archived", entityType: "branch", entityId: branchId });
      revalidatePath("/admin/branches");
      return undefined;
    },
    "Branch archived",
  );
}
