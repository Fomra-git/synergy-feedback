import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Inbox, Lock, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { QrCodePanel } from "@/components/admin/qr-code-dialog";
import { TimeSeriesChart } from "@/components/dashboard/charts";
import { getFormForAdmin, listBranchOptions } from "@/services/forms/admin";
import { getTimeseries } from "@/services/analytics";
import { createClient } from "@/lib/supabase/server";
import { publicFormUrl } from "@/lib/urls";
import { isInputType } from "@/lib/forms/field-registry";
import { formatDateTime } from "@/lib/forms/format";
import { env } from "@/lib/env";
import { formatNumber } from "@/lib/utils";
import { FormDetailsForm } from "./form-details-form";

export const metadata: Metadata = { title: "Form" };

export default async function FormOverviewPage(props: PageProps<"/admin/forms/[formId]">) {
  const { formId } = await props.params;
  const [data, branches, series] = await Promise.all([getFormForAdmin(formId), listBranchOptions(), getTimeseries(30, { formId })]);
  if (!data) notFound();
  const { form, fields } = data;
  const supabase = await createClient();
  const [{ count }, { data: last }] = await Promise.all([
    supabase.from("form_submissions").select("id", { count: "exact", head: true }).eq("form_id", formId).eq("status", "active"),
    supabase.from("form_submissions").select("submitted_at").eq("form_id", formId).order("submitted_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const questionCount = fields.filter((f) => isInputType(f.type)).length;
  const url = publicFormUrl(form.slug);

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <div className="grid grid-cols-3 gap-3">
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">Responses</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{formatNumber(count ?? 0)}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">Questions</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{questionCount}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">Last response</p>
            <p className="mt-1 text-sm font-medium">{last?.submitted_at ? formatDateTime(last.submitted_at, env.timezone()) : "—"}</p>
          </Card>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Responses, last 30 days</CardTitle>
          </CardHeader>
          <CardContent>
            <TimeSeriesChart data={series} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Form details</CardTitle>
            <CardDescription>Name, description, branch and public URL.</CardDescription>
          </CardHeader>
          <CardContent>
            <FormDetailsForm
              form={{ id: form.id, name: form.name, description: form.description ?? "", branchId: form.branch_id ?? "", slug: form.slug }}
              branches={branches}
              appUrl={env.appUrl()}
            />
          </CardContent>
        </Card>
      </div>
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Share</CardTitle>
            <CardDescription>Public link and QR code for branches.</CardDescription>
          </CardHeader>
          <CardContent>
            {form.status === "published" ? (
              <QrCodePanel url={url} formName={form.name} />
            ) : (
              <div className="rounded-lg border border-dashed p-5 text-center">
                <Lock className="mx-auto mb-2 size-5 text-muted-foreground" aria-hidden />
                <p className="text-sm font-medium">Not public yet</p>
                <p className="mt-1 text-xs text-muted-foreground">Publish the form to get a shareable link and QR code.</p>
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-2 pt-6 sm:pt-6">
            <Button asChild className="w-full">
              <Link href={`/admin/forms/${form.id}/builder`}><Wrench /> Open builder</Link>
            </Button>
            <Button asChild variant="outline" className="w-full">
              <Link href={`/admin/submissions?form=${form.id}`}><Inbox /> View submissions</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
