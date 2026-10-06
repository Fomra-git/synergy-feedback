import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Info } from "lucide-react";
import { DynamicFormRenderer } from "@/components/public-form/dynamic-form-renderer";
import { getFormForAdmin } from "@/services/forms/admin";
import { getAppSettings } from "@/services/settings";

export const metadata: Metadata = { title: "Preview" };

export default async function PreviewPage(props: PageProps<"/admin/forms/[formId]/preview">) {
  const { formId } = await props.params;
  const [data, settings] = await Promise.all([getFormForAdmin(formId), getAppSettings()]);
  if (!data) notFound();
  const { form, fields } = data;
  return (
    <div>
      <p className="mb-4 flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm text-sky-800">
        <Info className="size-4 shrink-0" aria-hidden />
        Preview mode — this uses the same renderer as the public form. Nothing you submit here is saved.
      </p>
      <div className="overflow-hidden rounded-xl border">
        <DynamicFormRenderer
          mode="preview"
          form={{ slug: form.slug, name: form.name, description: form.description, settings: form.settings ?? {}, fields }}
          orgName={settings.organization.name}
          logoUrl={form.settings?.appearance?.logoUrl || settings.branding.logoUrl || null}
        />
      </div>
    </div>
  );
}
