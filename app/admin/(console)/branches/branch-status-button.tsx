"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, Power } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { archiveBranchAction, setBranchStatusAction } from "./actions";

export function BranchStatusButtons({ id, status, name }: { id: string; status: "active" | "inactive"; name: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState(false);
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await setBranchStatusAction(id, status === "active" ? "inactive" : "active");
            if (res.ok) {
              toast.success(res.message);
              router.refresh();
            } else toast.error(res.error);
          })
        }
      >
        <Power /> {status === "active" ? "Deactivate" : "Activate"}
      </Button>
      <Button variant="outline" size="sm" className="text-destructive" onClick={() => setConfirm(true)}>
        <Archive /> Archive
      </Button>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={`Archive ${name}?`}
        description={<p>The branch is hidden from lists. Its forms and submissions are kept.</p>}
        confirmLabel="Archive"
        destructive
        onConfirm={() =>
          start(async () => {
            const res = await archiveBranchAction(id);
            if (res.ok) {
              toast.success(res.message);
              router.push("/admin/branches");
            } else toast.error(res.error);
          })
        }
      />
    </>
  );
}
