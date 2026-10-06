import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, FileText, Mail, MapPin, Phone, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormStatusBadge } from "@/components/admin/status-badges";
import { EmptyState } from "@/components/admin/empty-state";
import { TimeSeriesChart } from "@/components/dashboard/charts";
import { createClient } from "@/lib/supabase/server";
import { getTimeseries } from "@/services/analytics";
import { formatNumber } from "@/lib/utils";
import type { BranchRow, FormRow } from "@/types/db";
import { BranchFormDialog } from "../branch-form-dialog";
import { BranchStatusButtons } from "../branch-status-button";

export const metadata: Metadata = { title: "Branch" };

export default async function BranchPage(props: PageProps<"/admin/branches/[branchId]">) {
  const { branchId } = await props.params;
  if (!/^[0-9a-f-]{36}$/i.test(branchId)) notFound();
  const supabase = await createClient();
  const { data: branch } = await supabase.from("branches").select("*").eq("id", branchId).maybeSingle<BranchRow>();
  if (!branch) notFound();
  const [{ data: forms }, { data: stats }, series] = await Promise.all([
    supabase.from("forms").select("id, name, status, slug").eq("branch_id", branchId).neq("status", "archived").order("name").returns<Pick<FormRow, "id" | "name" | "status" | "slug">[]>(),
    supabase.rpc("get_branch_stats", { p_branch_ids: [branchId] }),
    getTimeseries(30, { branchId }),
  ]);
  const s = ((stats ?? []) as { submission_count: number }[])[0];

  return (
    <>
      <Link href="/admin/branches" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" aria-hidden /> All branches
      </Link>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{branch.name}</h1>
          <div className="mt-2 flex items-center gap-2">
            <span className="font-mono text-xs text-muted-foreground">{branch.code}</span>
            {branch.status === "active" ? <Badge variant="success">Active</Badge> : <Badge variant="secondary">Inactive</Badge>}
            {branch.archived_at && <Badge variant="warning">Archived</Badge>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <BranchFormDialog
            trigger="icon"
            branch={{
              id: branch.id,
              name: branch.name,
              code: branch.code,
              address: branch.address ?? "",
              phone: branch.phone ?? "",
              email: branch.email ?? "",
              managerName: branch.manager_name ?? "",
              status: branch.status,
            }}
          />
          {!branch.archived_at && <BranchStatusButtons id={branch.id} status={branch.status} name={branch.name} />}
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Details</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="flex gap-2"><MapPin className="size-4 shrink-0 text-muted-foreground" aria-hidden />{branch.address ?? "—"}</p>
            <p className="flex gap-2"><Phone className="size-4 shrink-0 text-muted-foreground" aria-hidden />{branch.phone ?? "—"}</p>
            <p className="flex gap-2 break-all"><Mail className="size-4 shrink-0 text-muted-foreground" aria-hidden />{branch.email ?? "—"}</p>
            <p className="flex gap-2"><User className="size-4 shrink-0 text-muted-foreground" aria-hidden />{branch.manager_name ?? "—"}</p>
            <p className="border-t pt-3 text-muted-foreground">
              <span className="text-2xl font-semibold text-foreground tabular-nums">{formatNumber(Number(s?.submission_count ?? 0))}</span> submissions
            </p>
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Submissions, last 30 days</CardTitle></CardHeader>
          <CardContent><TimeSeriesChart data={series} /></CardContent>
        </Card>
      </div>
      <Card className="mt-6">
        <CardHeader><CardTitle>Forms</CardTitle></CardHeader>
        <CardContent className="px-0 sm:px-0">
          {(forms ?? []).length === 0 ? (
            <EmptyState icon={FileText} title="No forms for this branch" />
          ) : (
            <ul className="divide-y">
              {(forms ?? []).map((f) => (
                <li key={f.id}>
                  <Link href={`/admin/forms/${f.id}`} className="flex items-center justify-between gap-3 px-6 py-3 hover:bg-muted/50">
                    <span className="font-medium">{f.name}</span>
                    <FormStatusBadge status={f.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}
