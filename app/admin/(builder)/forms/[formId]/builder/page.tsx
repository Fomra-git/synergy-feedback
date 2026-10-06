import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FormBuilder } from "@/components/form-builder/form-builder";
import { getFormForAdmin } from "@/services/forms/admin";
import { publicFormUrl } from "@/lib/urls";

export const metadata: Metadata = { title: "Form Builder" };

export default async function BuilderPage(props: PageProps<"/admin/forms/[formId]/builder">) {
  const { formId } = await props.params;
  if (!/^[0-9a-f-]{36}$/i.test(formId)) notFound();
  const data = await getFormForAdmin(formId);
  if (!data) notFound();
  const { form, fields, connection } = data;
  return (
    <FormBuilder
      form={{ id: form.id, name: form.name, description: form.description, status: form.status, version: form.version, slug: form.slug }}
      initialFields={fields}
      sheetStatus={connection && connection.status !== "disconnected" ? connection.status : null}
      publicUrl={publicFormUrl(form.slug)}
    />
  );
}
