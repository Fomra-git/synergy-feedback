import { AlertTriangle, CheckCircle2, CircleDashed, Clock, Loader2, MinusCircle, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { SheetConnectionStatus, SyncStatus } from "@/types/db";
import type { FormStatus } from "@/types/forms";

export function FormStatusBadge({ status }: { status: FormStatus }) {
  if (status === "published") return <Badge variant="success"><CheckCircle2 aria-hidden />Published</Badge>;
  if (status === "archived") return <Badge variant="secondary"><MinusCircle aria-hidden />Archived</Badge>;
  return <Badge variant="warning"><CircleDashed aria-hidden />Draft</Badge>;
}

export function SheetStatusBadge({ status, enabled = true }: { status: SheetConnectionStatus | null | undefined; enabled?: boolean }) {
  if (!status || status === "disconnected") return <Badge variant="outline" className="text-muted-foreground">Not Connected</Badge>;
  if (status === "pending_setup") return <Badge variant="info"><Clock aria-hidden />Setup needed</Badge>;
  if (status === "reauth_required") return <Badge variant="destructive"><AlertTriangle aria-hidden />Reauthorize</Badge>;
  if (status === "error") return <Badge variant="destructive"><XCircle aria-hidden />Error</Badge>;
  if (!enabled) return <Badge variant="secondary">Paused</Badge>;
  return <Badge variant="success"><CheckCircle2 aria-hidden />Connected</Badge>;
}

export function SyncStatusBadge({ status }: { status: SyncStatus | null | undefined }) {
  switch (status) {
    case "synced":
      return <Badge variant="success"><CheckCircle2 aria-hidden />Synced</Badge>;
    case "pending":
      return <Badge variant="warning"><Clock aria-hidden />Pending</Badge>;
    case "processing":
      return <Badge variant="info"><Loader2 aria-hidden className="animate-spin" />Syncing</Badge>;
    case "failed":
      return <Badge variant="destructive"><AlertTriangle aria-hidden />Failed</Badge>;
    case "skipped":
      return <Badge variant="secondary">Skipped</Badge>;
    default:
      return <span className="text-xs text-muted-foreground">—</span>;
  }
}
