import type { Metadata } from "next";
import Link from "next/link";
import { Building2 } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { EmptyState } from "@/components/admin/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/forms/format";
import { env } from "@/lib/env";
import { formatNumber } from "@/lib/utils";
import type { BranchRow } from "@/types/db";
import { BranchFormDialog } from "./branch-form-dialog";

export const metadata: Metadata = { title: "Branches" };

export default async function BranchesPage() {
  const supabase = await createClient();
  const { data } = await supabase.from("branches").select("*").is("archived_at", null).order("name").returns<BranchRow[]>();
  const branches = data ?? [];
  const { data: stats } = branches.length
    ? await supabase.rpc("get_branch_stats", { p_branch_ids: branches.map((b) => b.id) })
    : { data: [] };
  const byId = new Map(((stats ?? []) as { branch_id: string; form_count: number; submission_count: number }[]).map((s) => [s.branch_id, s]));
  const tz = env.timezone();

  return (
    <>
      <PageHeader title="Branches" description="Synergy Wellness clinic locations." actions={<BranchFormDialog />} />
      <Card className="overflow-hidden">
        {branches.length === 0 ? (
          <EmptyState icon={Building2} title="No branches yet" description="Add your first clinic location to assign forms to it." action={<BranchFormDialog />} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Branch</TableHead>
                <TableHead>Code</TableHead>
                <TableHead className="hidden lg:table-cell">Manager</TableHead>
                <TableHead className="hidden md:table-cell">Contact</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Forms</TableHead>
                <TableHead className="text-right">Submissions</TableHead>
                <TableHead className="hidden lg:table-cell">Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {branches.map((b) => {
                const s = byId.get(b.id);
                return (
                  <TableRow key={b.id}>
                    <TableCell>
                      <Link href={`/admin/branches/${b.id}`} className="font-medium hover:text-primary hover:underline">{b.name}</Link>
                      {b.address && <p className="max-w-xs truncate text-xs text-muted-foreground">{b.address}</p>}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{b.code}</TableCell>
                    <TableCell className="hidden lg:table-cell">{b.manager_name ?? "—"}</TableCell>
                    <TableCell className="hidden text-xs text-muted-foreground md:table-cell">
                      {b.phone && <p>{b.phone}</p>}
                      {b.email && <p>{b.email}</p>}
                    </TableCell>
                    <TableCell>{b.status === "active" ? <Badge variant="success">Active</Badge> : <Badge variant="secondary">Inactive</Badge>}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      <Link href={`/admin/forms?branch=${b.id}`} className="hover:underline">{formatNumber(Number(s?.form_count ?? 0))}</Link>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <Link href={`/admin/submissions?branch=${b.id}`} className="hover:underline">{formatNumber(Number(s?.submission_count ?? 0))}</Link>
                    </TableCell>
                    <TableCell className="hidden whitespace-nowrap text-muted-foreground lg:table-cell">{formatDate(b.created_at, tz)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>
    </>
  );
}
