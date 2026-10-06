"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, ChevronRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SyncStatusBadge } from "@/components/admin/status-badges";
import { formatDateTime } from "@/lib/forms/format";
import type { SyncStatus } from "@/types/db";
import { setSubmissionsArchivedAction } from "./actions";

export interface SubmissionListRow {
  id: string;
  submission_number: string;
  submitted_at: string;
  status: "active" | "archived";
  forms: { name: string } | null;
  branches: { name: string } | null;
  google_sheet_sync_logs: { status: SyncStatus; error_message: string | null } | { status: SyncStatus; error_message: string | null }[] | null;
}

function syncOf(r: SubmissionListRow) {
  return Array.isArray(r.google_sheet_sync_logs) ? r.google_sheet_sync_logs[0] : r.google_sheet_sync_logs;
}

export function SubmissionsTable({ rows, timeZone, archivedView }: { rows: SubmissionListRow[]; timeZone: string; archivedView: boolean; isSuperAdmin: boolean }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();
  const all = rows.length > 0 && selected.size === rows.length;

  const bulk = () =>
    start(async () => {
      const res = await setSubmissionsArchivedAction(Array.from(selected), !archivedView);
      if (res.ok) {
        toast.success(`${res.data.count} submission${res.data.count === 1 ? "" : "s"} ${archivedView ? "restored" : "archived"}`);
        setSelected(new Set());
        router.refresh();
      } else toast.error(res.error);
    });

  return (
    <>
      {selected.size > 0 && (
        <div className="flex items-center gap-3 border-b bg-accent/60 px-4 py-2 text-sm">
          <span className="font-medium">{selected.size} selected</span>
          <Button size="sm" variant="outline" onClick={bulk} disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : archivedView ? <ArchiveRestore /> : <Archive />}
            {archivedView ? "Restore" : "Archive"}
          </Button>
        </div>
      )}
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  aria-label="Select all on this page"
                  checked={all}
                  onCheckedChange={(v) => setSelected(v ? new Set(rows.map((r) => r.id)) : new Set())}
                />
              </TableHead>
              <TableHead>Submission ID</TableHead>
              <TableHead>Form</TableHead>
              <TableHead>Branch</TableHead>
              <TableHead>Submitted</TableHead>
              <TableHead>Google Sheet</TableHead>
              <TableHead><span className="sr-only">View</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const sync = syncOf(r);
              return (
                <TableRow key={r.id} data-state={selected.has(r.id) ? "selected" : undefined}>
                  <TableCell>
                    <Checkbox
                      aria-label={`Select ${r.submission_number}`}
                      checked={selected.has(r.id)}
                      onCheckedChange={(v) =>
                        setSelected((s) => {
                          const n = new Set(s);
                          if (v) n.add(r.id);
                          else n.delete(r.id);
                          return n;
                        })
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <Link href={`/admin/submissions/${r.id}`} className="font-mono text-[13px] font-medium hover:text-primary hover:underline">
                      {r.submission_number}
                    </Link>
                  </TableCell>
                  <TableCell>{r.forms?.name ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{r.branches?.name ?? "—"}</TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{formatDateTime(r.submitted_at, timeZone)}</TableCell>
                  <TableCell title={sync?.error_message ?? undefined}>
                    <SyncStatusBadge status={sync?.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button asChild variant="ghost" size="icon-sm" aria-label={`View ${r.submission_number}`}>
                      <Link href={`/admin/submissions/${r.id}`}><ChevronRight /></Link>
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <ul className="divide-y md:hidden">
        {rows.map((r) => (
          <li key={r.id}>
            <Link href={`/admin/submissions/${r.id}`} className="flex items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="font-mono text-sm font-medium">{r.submission_number}</p>
                <p className="truncate text-sm">{r.forms?.name}</p>
                <p className="text-xs text-muted-foreground">
                  {r.branches?.name ?? "No branch"} · {formatDateTime(r.submitted_at, timeZone)}
                </p>
              </div>
              <SyncStatusBadge status={syncOf(r)?.status} />
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
