"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/session";
import { assertFormAccess } from "@/lib/auth/form-access";
import { check, runAction, UserFacingError, type ActionResult } from "@/lib/actions";
import { logAudit } from "@/lib/audit";
import {
  builderSaveSchema,
  formCreateSchema,
  formDetailsSchema,
  privateSettingsSchema,
  publicSettingsSchema,
  type BuilderSaveInput,
  type PrivateSettingsInput,
  type PublicSettingsInput,
} from "@/schemas/form";
import { isSlugAvailable, uniqueSlug } from "@/services/forms/slug";
import { isInputType } from "@/lib/forms/field-registry";

function revalidateForm(formId?: string, slug?: string) {
  revalidatePath("/admin/forms");
  revalidatePath("/admin/dashboard");
  if (formId) revalidatePath(`/admin/forms/${formId}`, "layout");
  if (slug) revalidatePath(`/forms/${slug}`);
}

export async function createFormAction(input: z.input<typeof formCreateSchema>): Promise<ActionResult<{ id: string }>> {
  const result = await runAction("createForm", async () => {
    const session = await requireAdmin();
    const data = formCreateSchema.parse(input);
    const slug = data.slug ? data.slug : await uniqueSlug(data.name);
    if (data.slug && !(await isSlugAvailable(slug))) throw new UserFacingError("That URL slug is already taken.");

    const supabase = await createClient();
    const form = check(
      await supabase
        .from("forms")
        .insert({
          name: data.name,
          description: data.description || null,
          branch_id: data.branchId || null,
          slug,
          status: "draft",
          created_by: session.userId,
          settings: {
            appearance: { useGlobal: true, primaryColor: "#0f766e", backgroundColor: "#f0fdfa", buttonColor: "#0f766e", font: "inter" },
            behavior: {
              submitButtonText: "Submit",
              successTitle: "Thank You!",
              successMessage: "Your feedback has been submitted successfully.",
              showSubmissionNumber: true,
            },
            seo: {},
          },
        })
        .select("id")
        .single<{ id: string }>(),
    );
    await logAudit({ userId: session.userId, action: "form.created", entityType: "form", entityId: form.id, metadata: { name: data.name, slug } });
    revalidateForm();
    return { id: form.id };
  });
  return result;
}

export async function updateFormDetailsAction(input: z.input<typeof formDetailsSchema>): Promise<ActionResult> {
  return runAction(
    "updateFormDetails",
    async () => {
      const data = formDetailsSchema.parse(input);
      const { session, form } = await assertFormAccess(data.formId);
      if (data.slug !== form.slug && !(await isSlugAvailable(data.slug, form.id))) {
        throw new UserFacingError("That URL slug is already taken.");
      }
      const supabase = await createClient();
      check(
        await supabase
          .from("forms")
          .update({ name: data.name, description: data.description || null, branch_id: data.branchId || null, slug: data.slug })
          .eq("id", form.id),
      );
      await logAudit({
        userId: session.userId,
        action: "form.updated",
        entityType: "form",
        entityId: form.id,
        metadata: { name: data.name, slugChanged: data.slug !== form.slug },
      });
      revalidateForm(form.id, form.slug);
      revalidatePath(`/forms/${data.slug}`);
      return undefined;
    },
    "Form details saved",
  );
}

export async function setFormStatusAction(formId: string, status: "draft" | "published" | "archived"): Promise<ActionResult> {
  return runAction(
    "setFormStatus",
    async () => {
      const { session, form } = await assertFormAccess(formId);
      if (status === "published") {
        const supabase = await createClient();
        const { data: fields } = await supabase.from("form_fields").select("type").eq("form_id", formId);
        if (!(fields ?? []).some((f) => isInputType(f.type))) {
          throw new UserFacingError("Add at least one question before publishing.");
        }
      }
      const supabase = await createClient();
      check(await supabase.from("forms").update({ status }).eq("id", formId));
      const action =
        status === "published"
          ? "form.published"
          : status === "archived"
            ? "form.archived"
            : form.status === "archived"
              ? "form.restored"
              : "form.unpublished";
      await logAudit({ userId: session.userId, action, entityType: "form", entityId: formId, metadata: { name: form.name } });
      revalidateForm(formId, form.slug);
      return undefined;
    },
    status === "published" ? "Form published" : status === "archived" ? "Form archived" : "Form moved to draft",
  );
}

/** Super admins may permanently delete an ARCHIVED form. Google Sheets are never touched. */
export async function deleteFormAction(formId: string): Promise<ActionResult> {
  return runAction(
    "deleteForm",
    async () => {
      const { session, form } = await assertFormAccess(formId);
      if (!session.isSuperAdmin) throw new UserFacingError("Only a super admin can permanently delete forms. Archive it instead.");
      if (form.status !== "archived") throw new UserFacingError("Archive the form before deleting it permanently.");
      const supabase = await createClient();
      check(await supabase.from("forms").delete().eq("id", formId));
      await logAudit({ userId: session.userId, action: "form.deleted", entityType: "form", entityId: formId, metadata: { name: form.name, slug: form.slug } });
      revalidateForm();
      return undefined;
    },
    "Form deleted",
  );
}

export async function duplicateFormAction(formId: string): Promise<ActionResult<{ id: string }>> {
  return runAction(
    "duplicateForm",
    async () => {
      const { session, form } = await assertFormAccess(formId);
      const name = `${form.name} (Copy)`.slice(0, 150);
      const slug = await uniqueSlug(`${form.slug}-copy`);
      const supabase = await createClient();
      const newId = check(await supabase.rpc("duplicate_form", { p_form_id: formId, p_new_name: name, p_new_slug: slug })) as string;
      await logAudit({ userId: session.userId, action: "form.duplicated", entityType: "form", entityId: newId, metadata: { sourceFormId: formId } });
      revalidateForm();
      return { id: newId };
    },
    "Form duplicated — Google Sheets is not connected on the copy",
  );
}

export async function saveBuilderAction(input: BuilderSaveInput): Promise<ActionResult<{ version: number }>> {
  return runAction("saveBuilder", async () => {
    const data = builderSaveSchema.parse(input);
    const { form } = await assertFormAccess(data.formId);
    const supabase = await createClient();
    const { data: version, error } = await supabase.rpc("save_form_fields", {
      p_form_id: data.formId,
      p_fields: data.fields,
      p_expected_version: data.expectedVersion,
    });
    if (error) {
      if (error.code === "40001" || error.message.includes("version_conflict")) {
        throw new UserFacingError("This form was changed in another tab or by another admin. Reload to get the latest version.");
      }
      throw error;
    }
    if (form.status === "published") revalidatePath(`/forms/${form.slug}`);
    return { version: version as number };
  });
}

export async function savePublicSettingsAction(formId: string, input: PublicSettingsInput): Promise<ActionResult> {
  return runAction(
    "savePublicSettings",
    async () => {
      const { session, form } = await assertFormAccess(formId);
      const data = publicSettingsSchema.parse(input);
      const supabase = await createClient();
      check(await supabase.from("forms").update({ settings: data }).eq("id", formId));
      await logAudit({ userId: session.userId, action: "form.updated", entityType: "form", entityId: formId, metadata: { section: "appearance" } });
      revalidateForm(formId, form.slug);
      return undefined;
    },
    "Settings saved",
  );
}

export async function savePrivateSettingsAction(formId: string, input: PrivateSettingsInput): Promise<ActionResult> {
  return runAction(
    "savePrivateSettings",
    async () => {
      const { session } = await assertFormAccess(formId);
      const data = privateSettingsSchema.parse(input);
      const supabase = await createClient();
      check(
        await supabase
          .from("form_settings")
          .update({ submission: data.submission, notifications: data.notifications, google_sheets: data.google_sheets })
          .eq("form_id", formId),
      );
      await logAudit({ userId: session.userId, action: "form.updated", entityType: "form", entityId: formId, metadata: { section: "settings" } });
      revalidatePath(`/admin/forms/${formId}`, "layout");
      return undefined;
    },
    "Settings saved",
  );
}

export async function createFormAndRedirect(input: z.input<typeof formCreateSchema>) {
  const res = await createFormAction(input);
  if (res.ok) redirect(`/admin/forms/${res.data.id}/builder`);
  return res;
}
