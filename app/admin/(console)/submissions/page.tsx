import type { Metadata } from "next";
import Link from "next/link";
import { Download, Inbox, Search } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { EmptyState } from "@/components/admin/empty-state";
import { Pagination } from "@/components/admin/pagination";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { createClient } from "@/lib/supabase/server";
import { requireAdminPage } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { listBranchOptions, listFormOptions } from "@/services/forms/admin";
import { applySubmissionFilters, parseSubmissionFilters, syncEmbed } from "@/services/submissions/query";
import { SubmissionsTable, type SubmissionListRow } from "./submissions-table";

export const metadata: Metadata = { title: "Submissions" };

const PAGE_SIZE = 25;

export default async function SubmissionsPage(props: PageProps<"/admin/submissions">) {
  const session = await requireAdminPage();
  const sp = await props.searchParams;
  const filters = parseSubmissionFilters(sp);
  const page = filters.page ?? 1;
  const tz = env.timezone();
  const supabase = await createClient();

  let query = supabase
    .from("form_submissions")
    .select(`id, submission_number, submitted_at, status, forms(name), branches(name), ${syncEmbed(filters)}`, { count: "estimated" })
    .order("submitted_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  query = applySubmissionFilters(query, filters, tz);

  const [{ data, count, error }, forms, branches] = await Promise.all([query, listFormOptions(), listBranchOptions()]);
  if (error) throw error;
  const rows = (data ?? []) as unknown as SubmissionListRow[];

  const params: Record<string, string | undefined> = {
    q: filters.q,
    form: filters.form,
    branch: filters.branch,
    from: filters.from,
    to: filters.to,
    status: filters.status,
    sync: filters.sync,
  };
  const exportQs = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]).toString();
  const hasFilters = Object.values(params).some(Boolean);

  return (
    <>
      <PageHeader
        title="Submissions"
        description="Search, filter, review and export responses."
        actions={
          <>
            <Button asChild variant="outline">
              <a href={`/api/admin/submissions/export?${exportQs}`} download>
                <Download /> CSV
              </a>
            </Button>
            <Button asChild variant="outline">
              <a href={`/api/admin/submissions/export?${exportQs}${exportQs ? "&" : ""}format=excel`} download>
                <Download /> Excel CSV
              </a>
            </Button>
          </>
        }
      />
      <Card className="overflow-hidden">
        <form className="grid gap-3 border-b p-4 sm:grid-cols-2 lg:grid-cols-6" role="search">
          <div className="relative sm:col-span-2">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input name="q" defaultValue={filters.q} placeholder="Search ID, name, phone, answers…" className="pl-9" aria-label="Search submissions" />
          </div>
          <NativeSelect name="form" defaultValue={filters.form ?? ""} aria-label="Filter by form">
            <option value="">All forms</option>
            {forms.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </NativeSelect>
          <NativeSelect name="branch" defaultValue={filters.branch ?? ""} aria-label="Filter by branch">
            <option value="">All branches</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </NativeSelect>
          <Input type="date" name="from" defaultValue={filters.from} aria-label="From date" />
          <Input type="date" name="to" defaultValue={filters.to} aria-label="To date" />
          <NativeSelect name="sync" defaultValue={filters.sync ?? ""} aria-label="Filter by Google Sheet sync status">
            <option value="">Any sync status</option>
            <option value="synced">Synced</option>
            <option value="pending">Pending</option>
            <option value="failed">Failed</option>
            <option value="skipped">Skipped</option>
          </NativeSelect>
          <NativeSelect name="status" defaultValue={filters.status ?? ""} aria-label="Active or archived">
            <option value="">Active</option>
            <option value="archived">Archived</option>
          </NativeSelect>
          <div className="flex gap-2 lg:col-span-2">
            <Button type="submit" variant="secondary" className="flex-1">Apply filters</Button>
            {hasFilters && (
              <Button asChild variant="ghost">
                <Link href="/admin/submissions">Clear</Link>
              </Button>
            )}
          </div>
        </form>
        {rows.length === 0 ? (
          <EmptyState
            icon={hasFilters ? Search : Inbox}
            title={hasFilters ? "No submissions match your filters" : "No submissions yet."}
            description={hasFilters ? "Try adjusting the filters or date range." : "Responses will appear here when someone submits your form."}
          />
        ) : (
          <>
            <SubmissionsTable rows={rows} timeZone={tz} archivedView={filters.status === "archived"} isSuperAdmin={session.isSuperAdmin} />
            <Pagination page={page} pageSize={PAGE_SIZE} total={count ?? rows.length} basePath="/admin/submissions" params={params} />
          </>
        )}
      </Card>
    </>
  );
}
