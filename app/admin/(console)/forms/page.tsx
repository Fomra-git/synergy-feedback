import type { Metadata } from "next";
import Link from "next/link";
import { FilePlus2, FileText, Search } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { EmptyState } from "@/components/admin/empty-state";
import { Pagination } from "@/components/admin/pagination";
import { FormStatusBadge, SheetStatusBadge } from "@/components/admin/status-badges";
import { FormActionsMenu } from "@/components/admin/form-actions-menu";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FORMS_PAGE_SIZE, listBranchOptions, listForms } from "@/services/forms/admin";
import { requireAdminPage } from "@/lib/auth/session";
import { formatDate } from "@/lib/forms/format";
import { formatNumber } from "@/lib/utils";
import { publicFormUrl } from "@/lib/urls";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "Forms" };

export default async function FormsPage(props: PageProps<"/admin/forms">) {
  const session = await requireAdminPage();
  const sp = await props.searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const filters = { q: str("q")?.slice(0, 100), status: str("status"), branch: str("branch"), page: Number(str("page") ?? 1) || 1 };
  const [{ items, total }, branches] = await Promise.all([listForms(filters), listBranchOptions()]);
  const tz = env.timezone();
  const hasFilters = Boolean(filters.q || filters.status || filters.branch);

  return (
    <>
      <PageHeader
        title="Forms"
        description="Create, publish and manage feedback forms for every branch."
        actions={
          <Button asChild>
            <Link href="/admin/forms/new"><FilePlus2 /> Create Form</Link>
          </Button>
        }
      />

      <Card className="overflow-hidden">
        <form className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center" role="search">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input name="q" defaultValue={filters.q} placeholder="Search forms…" className="pl-9" aria-label="Search forms" />
          </div>
          <NativeSelect name="status" defaultValue={filters.status ?? ""} aria-label="Filter by status" className="sm:w-40">
            <option value="">Active forms</option>
            <option value="published">Published</option>
            <option value="draft">Draft</option>
            <option value="archived">Archived</option>
          </NativeSelect>
          <NativeSelect name="branch" defaultValue={filters.branch ?? ""} aria-label="Filter by branch" className="sm:w-44">
            <option value="">All branches</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </NativeSelect>
          <Button type="submit" variant="secondary">Apply</Button>
        </form>

        {items.length === 0 ? (
          hasFilters ? (
            <EmptyState icon={Search} title="No forms match your filters" description="Try a different search or clear the filters." action={<Button asChild variant="outline"><Link href="/admin/forms">Clear filters</Link></Button>} />
          ) : (
            <EmptyState
              icon={FileText}
              title="No Forms Yet"
              description="Create your first Synergy Wellness feedback form."
              action={<Button asChild><Link href="/admin/forms/new"><FilePlus2 /> Create Form</Link></Button>}
            />
          )
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Form Name</TableHead>
                    <TableHead>Branch</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Responses</TableHead>
                    <TableHead>Google Sheet</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Updated</TableHead>
                    <TableHead><span className="sr-only">Actions</span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((f) => (
                    <TableRow key={f.id}>
                      <TableCell className="max-w-[260px]">
                        <Link href={`/admin/forms/${f.id}`} className="font-medium hover:text-primary hover:underline">{f.name}</Link>
                        <p className="truncate text-xs text-muted-foreground">/forms/{f.slug}</p>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{f.branch?.name ?? "—"}</TableCell>
                      <TableCell><FormStatusBadge status={f.status} /></TableCell>
                      <TableCell className="text-right tabular-nums">
                        <Link href={`/admin/submissions?form=${f.id}`} className="hover:underline">{formatNumber(f.responses)}</Link>
                      </TableCell>
                      <TableCell><SheetStatusBadge status={f.sheet?.status} enabled={f.sheet?.enabled} /></TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(f.created_at, tz)}</TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(f.updated_at, tz)}</TableCell>
                      <TableCell className="text-right">
                        <FormActionsMenu form={f} publicUrl={publicFormUrl(f.slug)} isSuperAdmin={session.isSuperAdmin} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {/* Mobile cards */}
            <ul className="divide-y md:hidden">
              {items.map((f) => (
                <li key={f.id} className="flex items-start gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <Link href={`/admin/forms/${f.id}`} className="font-medium">{f.name}</Link>
                    <p className="text-xs text-muted-foreground">{f.branch?.name ?? "No branch"} · {formatNumber(f.responses)} responses</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <FormStatusBadge status={f.status} />
                      <SheetStatusBadge status={f.sheet?.status} enabled={f.sheet?.enabled} />
                    </div>
                  </div>
                  <FormActionsMenu form={f} publicUrl={publicFormUrl(f.slug)} isSuperAdmin={session.isSuperAdmin} />
                </li>
              ))}
            </ul>
            <Pagination page={filters.page} pageSize={FORMS_PAGE_SIZE} total={total} basePath="/admin/forms" params={{ q: filters.q, status: filters.status, branch: filters.branch }} />
          </>
        )}
      </Card>
    </>
  );
}
