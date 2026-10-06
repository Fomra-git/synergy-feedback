"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { deleteSubmissionAction, setSubmissionsArchivedAction } from "../actions";
import { retrySyncAction } from "../../forms/google-actions";

export function SubmissionActions({ id, archived, isSuperAdmin }: { id: string; archived: boolean; isSuperAdmin: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState<"archive" | "delete" | null>(null);

  return (
    <div className="flex gap-2">
      {archived ? (
        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await setSubmissionsArchivedAction([id], false);
              if (res.ok) {
                toast.success("Submission restored");
                router.refresh();
              } else toast.error(res.error);
            })
          }
        >
          <ArchiveRestore /> Restore
        </Button>
      ) : (
        <Button variant="outline" size="sm" onClick={() => setConfirm("archive")}>
          <Archive /> Archive
        </Button>
      )}
      {isSuperAdmin && (
        <Button variant="outline" size="sm" className="text-destructive" onClick={() => setConfirm("delete")}>
          <Trash2 /> Delete
        </Button>
      )}
      <ConfirmDialog
        open={confirm === "archive"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Archive submission?"
        description={<p>It will be hidden from lists, statistics and exports. You can restore it from the Archived filter.</p>}
        confirmLabel="Archive"
        onConfirm={() =>
          start(async () => {
            const res = await setSubmissionsArchivedAction([id], true);
            if (res.ok) {
              toast.success("Submission archived");
              router.refresh();
            } else toast.error(res.error);
          })
        }
      />
      <ConfirmDialog
        open={confirm === "delete"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Permanently delete submission?"
        description={<p>This cannot be undone. A row already written to Google Sheets is not removed from the sheet.</p>}
        confirmLabel="Delete permanently"
        destructive
        onConfirm={() =>
          start(async () => {
            const res = await deleteSubmissionAction(id);
            if (res.ok) {
              toast.success(res.message);
              router.push("/admin/submissions");
            } else toast.error(res.error);
          })
        }
      />
    </div>
  );
}

export function RetrySyncButton({ id, show }: { id: string; show: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (!show) return null;
  return (
    <Button
      variant="outline"
      size="sm"
      className="mt-2"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await retrySyncAction({ submissionId: id });
          if (res.ok) {
            if (res.data.synced) toast.success("Synced to Google Sheets");
            else toast.error("Sync is still failing — see the error above.");
            router.refresh();
          } else toast.error(res.error);
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" /> : <RefreshCw />} Retry Sync
    </Button>
  );
}

