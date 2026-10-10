import { requireAdminRolePage } from "@/lib/auth/session";
import type { Metadata } from "next";
import { ScrollText } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { EmptyState } from "@/components/admin/empty-state";
import { Pagination } from "@/components/admin/pagination";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/forms/format";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "Audit Log" };
const PAGE = 50;

export default async function AuditLogPage(props: PageProps<"/admin/audit-log">) {
  await requireAdminRolePage();
  const sp = await props.searchParams;
  const page = Math.max(1, Number(typeof sp.page === "string" ? sp.page : 1) || 1);
  const supabase = await createClient();
  const { data, count } = await supabase
    .from("audit_logs")
    .select("id, action, entity_type, entity_id, metadata, created_at, profiles(email, full_name)", { count: "estimated" })
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE, page * PAGE - 1);
  const rows = (data ?? []) as unknown as {
    id: number;
    action: string;
    entity_type: string;
    entity_id: string | null;
    metadata: Record<string, unknown>;
    created_at: string;
    profiles: { email: string; full_name: string | null } | null;
  }[];
  const tz = env.timezone();

  return (
    <>
      <PageHeader title="Audit Log" description="Append-only record of administrative actions." />
      <Card className="overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState icon={ScrollText} title="No activity yet" />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead className="hidden md:table-cell">Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{formatDateTime(r.created_at, tz)}</TableCell>
                    <TableCell className="max-w-[200px] truncate">{r.profiles?.full_name || r.profiles?.email || "System"}</TableCell>
                    <TableCell><Badge variant="secondary" className="font-mono">{r.action}</Badge></TableCell>
                    <TableCell className="hidden max-w-md truncate font-mono text-xs text-muted-foreground md:table-cell" title={JSON.stringify(r.metadata)}>
                      {r.entity_type}
                      {r.entity_id ? `:${r.entity_id.slice(0, 8)}` : ""} {Object.keys(r.metadata ?? {}).length ? JSON.stringify(r.metadata) : ""}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Pagination page={page} pageSize={PAGE} total={count ?? 0} basePath="/admin/audit-log" params={{}} />
          </>
        )}
      </Card>
    </>
  );
}
