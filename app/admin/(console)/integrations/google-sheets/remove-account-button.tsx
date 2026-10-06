"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { removeGoogleAccountAction } from "../../forms/google-actions";

export function RemoveAccountButton({ id, email }: { id: string; email: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <>
      <Button size="sm" variant="ghost" className="text-destructive" disabled={pending} onClick={() => setOpen(true)}>
        <Trash2 /> Remove
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`Remove ${email}?`}
        description={
          <>
            <p>All forms using this account will be disconnected and Synergy Feedback&apos;s access will be revoked.</p>
            <p>Spreadsheets and their data are not deleted.</p>
          </>
        }
        confirmLabel="Remove account"
        destructive
        onConfirm={() =>
          start(async () => {
            const res = await removeGoogleAccountAction(id);
            if (res.ok) {
              toast.success(res.message);
              router.refresh();
            } else toast.error(res.error);
          })
        }
      />
    </>
  );
}
