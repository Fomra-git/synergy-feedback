import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ExternalLink } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requirePermissionPage } from "@/lib/auth/session";
import { FormStatusBadge, SheetStatusBadge } from "@/components/admin/status-badges";
import { FormActionsMenu } from "@/components/admin/form-actions-menu";
import { formMenuAccess } from "@/lib/auth/permissions";
import { Button } from "@/components/ui/button";
import { publicFormUrl } from "@/lib/urls";
import { FormTabs } from "./form-tabs";
import type { FormRow, SheetConnectionRow } from "@/types/db";

export default async function FormLayout(props: LayoutProps<"/admin/forms/[formId]">) {
  const { formId } = await props.params;
  if (!/^[0-9a-f-]{36}$/i.test(formId)) notFound();
  const session = await requirePermissionPage("forms.edit");
  const supabase = await createClient();
  const [{ data: form }, { data: conn }] = await Promise.all([
    supabase.from("forms").select("id, name, slug, status, branch:branches(name)").eq("id", formId).maybeSingle(),
    supabase.from("google_sheet_connections").select("status, enabled").eq("form_id", formId).maybeSingle<Pick<SheetConnectionRow, "status" | "enabled">>(),
  ]);
  if (!form) notFound();
  const f = form as unknown as Pick<FormRow, "id" | "name" | "slug" | "status"> & { branch: { name: string } | null };
  const url = publicFormUrl(f.slug);

  return (
    <>
      <Link href="/admin/forms" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" aria-hidden /> All forms
      </Link>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{f.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <FormStatusBadge status={f.status} />
            <SheetStatusBadge status={conn?.status} enabled={conn?.enabled} />
            <span>{f.branch?.name ?? "No branch"}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {f.status === "published" && (
            <Button asChild variant="outline" size="sm">
              <a href={url} target="_blank" rel="noreferrer">
                <ExternalLink /> Open form
              </a>
            </Button>
          )}
          <FormActionsMenu form={f} publicUrl={url} access={formMenuAccess(session)} />
        </div>
      </div>
      <FormTabs formId={formId} />
      {props.children}
    </>
  );
}
