"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin, requireSuperAdmin } from "@/lib/auth/session";
import { check, runAction, UserFacingError, type ActionResult } from "@/lib/actions";
import { logAudit } from "@/lib/audit";
import { appSettingsSchema, type AppSettings } from "@/schemas/settings";
import { contentMatchesMime } from "@/lib/security/files";

export async function saveAppSettingsAction(input: AppSettings): Promise<ActionResult> {
  return runAction(
    "saveAppSettings",
    async () => {
      const session = await requireSuperAdmin();
      const data = appSettingsSchema.parse(input);
      try {
        new Intl.DateTimeFormat("en", { timeZone: data.timezone });
      } catch {
        throw new UserFacingError("Unknown timezone. Use an IANA name such as Asia/Kolkata.");
      }
      const supabase = await createClient();
      check(await supabase.from("app_settings").update({ ...data, updated_by: session.userId }).eq("id", 1));
      await logAudit({ userId: session.userId, action: "settings.updated", entityType: "app_settings", entityId: "1" });
      revalidatePath("/admin/settings");
      return undefined;
    },
    "Settings saved",
  );
}

const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"];

/** Uploads a logo to the public branding bucket. SVG is excluded (script risk). */
export async function uploadLogoAction(formData: FormData): Promise<ActionResult<{ url: string }>> {
  return runAction("uploadLogo", async () => {
    const session = await requireAdmin();
    // Organisation logo (super admin) or a form's own logo (form editors).
    if (!session.isSuperAdmin && !session.can("forms.edit")) throw new UserFacingError("You do not have permission to upload logos.");
    const file = formData.get("file");
    if (!(file instanceof File)) throw new UserFacingError("Choose an image to upload.");
    if (!LOGO_TYPES.includes(file.type)) throw new UserFacingError("Logo must be a PNG, JPG or WebP image.");
    if (file.size > 2 * 1024 * 1024) throw new UserFacingError("Logo must be smaller than 2 MB.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!contentMatchesMime(bytes, file.type)) throw new UserFacingError("The file is not a valid image.");
    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const path = `logos/${randomUUID()}.${ext}`;
    const storage = createAdminClient().storage.from("branding");
    const { error } = await storage.upload(path, bytes, { contentType: file.type, cacheControl: "31536000" });
    if (error) throw error;
    return { url: storage.getPublicUrl(path).data.publicUrl };
  });
}

export async function updateProfileAction(input: { fullName: string }): Promise<ActionResult> {
  return runAction(
    "updateProfile",
    async () => {
      const session = await requireAdmin();
      const fullName = String(input.fullName ?? "").trim().slice(0, 120);
      const supabase = await createClient();
      check(await supabase.from("profiles").update({ full_name: fullName || null }).eq("id", session.userId));
      revalidatePath("/admin", "layout");
      return undefined;
    },
    "Profile updated",
  );
}
