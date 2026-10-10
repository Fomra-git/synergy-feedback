import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, FileText, Star } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { SyncStatusBadge } from "@/components/admin/status-badges";
import { createClient } from "@/lib/supabase/server";
import { requirePermissionPage } from "@/lib/auth/session";
import { formatDateTime, storedAnswerText } from "@/lib/forms/format";
import { env } from "@/lib/env";
import type { AnswerRow, FormFieldRow, SyncLogRow } from "@/types/db";
import type { StoredFileRef } from "@/types/forms";
import { RetrySyncButton, SubmissionActions } from "./submission-actions";

export const metadata: Metadata = { title: "Submission" };

function AnswerValue({ answer, max }: { answer: AnswerRow; max?: number }) {
  if (answer.field_type === "star_rating") {
    const n = Number(answer.value);
    const total = max ?? 5;
    return (
      <span className="inline-flex items-center gap-0.5" aria-label={`${n} out of ${total} stars`}>
        {Array.from({ length: total }, (_, i) => (
          <Star key={i} className={i < n ? "size-5 fill-amber-400 text-amber-400" : "size-5 text-slate-300"} aria-hidden />
        ))}
      </span>
    );
  }
  if (answer.field_type === "file_upload" || answer.field_type === "signature") {
    const refs = (Array.isArray(answer.value_json) ? answer.value_json : [answer.value_json]).filter(Boolean) as StoredFileRef[];
    if (answer.field_type === "signature" && refs[0]) {
      return (
        // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL via redirect
        <img src={`/api/admin/files?answer=${answer.id}&i=0`} alt="Signature" className="h-24 rounded border bg-white p-1" />
      );
    }
    return (
      <ul className="space-y-1">
        {refs.map((f, i) => (
          <li key={i}>
            <a href={`/api/admin/files?answer=${answer.id}&i=${i}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-primary hover:underline">
              <FileText className="size-4" aria-hidden /> {f.name}
            </a>
          </li>
        ))}
      </ul>
    );
  }
  const text = storedAnswerText(answer);
  return <span className="whitespace-pre-wrap">{text || <span className="text-muted-foreground">—</span>}</span>;
}

export default async function SubmissionDetailPage(props: PageProps<"/admin/submissions/[submissionId]">) {
  const session = await requirePermissionPage("submissions.view");
  const { submissionId } = await props.params;
  if (!/^[0-9a-f-]{36}$/i.test(submissionId)) notFound();
  const supabase = await createClient();
  const { data: sub } = await supabase
    .from("form_submissions")
    .select("*, forms(id, name), branches(name)")
    .eq("id", submissionId)
    .maybeSingle();
  if (!sub) notFound();

  const [{ data: answers }, { data: fields }, { data: log }] = await Promise.all([
    supabase.from("submission_answers").select("*").eq("submission_id", submissionId).returns<AnswerRow[]>(),
    supabase.from("form_fields").select("field_id, position, settings").eq("form_id", sub.form_id).returns<Pick<FormFieldRow, "field_id" | "position" | "settings">[]>(),
    supabase.from("google_sheet_sync_logs").select("*").eq("submission_id", submissionId).maybeSingle<SyncLogRow>(),
  ]);
  const order = new Map((fields ?? []).map((f) => [f.field_id, f.position]));
  const settings = new Map((fields ?? []).map((f) => [f.field_id, f.settings]));
  const sorted = [...(answers ?? [])].sort((a, b) => (order.get(a.field_id) ?? 9999) - (order.get(b.field_id) ?? 9999));
  const tz = env.timezone();

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/admin/submissions" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" aria-hidden /> All submissions
      </Link>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-mono text-xl font-semibold sm:text-2xl">Submission #{sub.submission_number}</h1>
          {sub.status === "archived" && <p className="mt-1 text-sm text-amber-700">This submission is archived.</p>}
        </div>
        <SubmissionActions id={sub.id} archived={sub.status === "archived"} isSuperAdmin={session.isSuperAdmin} canManage={session.can("submissions.manage")} />
      </div>

      <Card>
        <CardContent className="pt-6 sm:pt-6">
          <dl className="grid gap-4 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-muted-foreground">Form</dt>
              <dd className="font-medium">
                <Link href={`/admin/forms/${sub.forms?.id}`} className="hover:underline">{sub.forms?.name}</Link>
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Branch</dt>
              <dd className="font-medium">{sub.branches?.name ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Submitted</dt>
              <dd className="font-medium">{formatDateTime(sub.submitted_at, tz)}</dd>
            </div>
          </dl>
          <Separator className="my-6" />
          {sorted.length === 0 ? (
            <p className="text-sm text-muted-foreground">No answers were provided.</p>
          ) : (
            <dl className="space-y-5">
              {sorted.map((a) => (
                <div key={a.id}>
                  <dt className="text-sm font-medium text-muted-foreground">
                    {a.field_label || a.field_id}
                    {!order.has(a.field_id) && <span className="ml-2 text-xs font-normal">(field since removed)</span>}
                  </dt>
                  <dd className="mt-1 text-[15px]">
                    <AnswerValue answer={a} max={settings.get(a.field_id)?.max} />
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Google Sheets</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {log ? (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <SyncStatusBadge status={log.status} />
                {log.google_row_number && <span className="text-muted-foreground">Row {log.google_row_number} · {log.worksheet_name}</span>}
                {log.synced_at && <span className="text-muted-foreground">Synced {formatDateTime(log.synced_at, tz)}</span>}
              </div>
              <p className="text-muted-foreground">Attempts: {log.attempt_count}{log.attempted_at ? ` · last ${formatDateTime(log.attempted_at, tz)}` : ""}{log.next_attempt_at && log.status !== "synced" ? ` · next retry ${formatDateTime(log.next_attempt_at, tz)}` : ""}</p>
              {log.error_message && log.status !== "synced" && <p className="rounded-md bg-red-50 p-3 text-red-800">{log.error_message}</p>}
            </>
          ) : (
            <p className="text-muted-foreground">No Google Sheet was connected when this submission was received.</p>
          )}
          <RetrySyncButton id={sub.id} show={session.can("integrations.manage") && (!log || log.status !== "synced")} />
        </CardContent>
      </Card>
    </div>
  );
}
