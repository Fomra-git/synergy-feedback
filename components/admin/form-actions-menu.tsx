"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArchiveRestore,
  Copy,
  CopyPlus,
  Eye,
  Inbox,
  Link2,
  MoreHorizontal,
  Pencil,
  QrCode,
  Rocket,
  Sheet,
  Trash2,
  Undo2,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "./confirm-dialog";
import { QrCodeDialog } from "./qr-code-dialog";
import { deleteFormAction, duplicateFormAction, setFormStatusAction } from "@/app/admin/(console)/forms/actions";
import type { FormStatus } from "@/types/forms";
import type { FormMenuAccess } from "@/lib/auth/permissions";

export function FormActionsMenu({
  form,
  publicUrl,
  access,
}: {
  form: { id: string; name: string; slug: string; status: FormStatus };
  publicUrl: string;
  access: FormMenuAccess;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState<null | "publish" | "unpublish" | "archive" | "delete">(null);
  const [qr, setQr] = useState(false);

  function run(fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) {
    start(async () => {
      const res = await fn();
      if (res.ok) {
        if (res.message) toast.success(res.message);
        router.refresh();
      } else toast.error(res.error);
    });
  }

  const published = form.status === "published";

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${form.name}`} disabled={pending}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {access.edit && (
            <>
              <DropdownMenuItem asChild>
                <Link href={`/admin/forms/${form.id}`}><Pencil />Edit</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`/admin/forms/${form.id}/builder`}><Wrench />Builder</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`/admin/forms/${form.id}/preview`}><Eye />Preview</Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {form.status === "draft" && (
                <DropdownMenuItem onSelect={() => setConfirm("publish")}><Rocket />Publish</DropdownMenuItem>
              )}
              {published && (
                <DropdownMenuItem onSelect={() => setConfirm("unpublish")}><Undo2 />Unpublish</DropdownMenuItem>
              )}
              {form.status === "archived" && (
                <DropdownMenuItem onSelect={() => run(() => setFormStatusAction(form.id, "draft"))}><ArchiveRestore />Restore</DropdownMenuItem>
              )}
            </>
          )}
          {access.create && (
            <DropdownMenuItem
              onSelect={() =>
                start(async () => {
                  const res = await duplicateFormAction(form.id);
                  if (res.ok) {
                    toast.success(res.message);
                    router.push(`/admin/forms/${res.data.id}`);
                  } else toast.error(res.error);
                })
              }
            >
              <CopyPlus />Duplicate
            </DropdownMenuItem>
          )}
          {access.submissions && (
            <DropdownMenuItem asChild>
              <Link href={`/admin/submissions?form=${form.id}`}><Inbox />Submissions</Link>
            </DropdownMenuItem>
          )}
          {access.integrations && access.edit && (
            <DropdownMenuItem asChild>
              <Link href={`/admin/forms/${form.id}/settings?tab=integrations`}><Sheet />Google Sheet</Link>
            </DropdownMenuItem>
          )}
          {(access.edit || access.create || access.submissions) && <DropdownMenuSeparator />}
          <DropdownMenuItem
            disabled={!published}
            onSelect={async () => {
              await navigator.clipboard.writeText(publicUrl);
              toast.success("Public link copied");
            }}
          >
            <Link2 />Copy Link
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!published} onSelect={() => setQr(true)}><QrCode />QR Code</DropdownMenuItem>
          {form.status !== "archived" && access.edit ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => setConfirm("archive")}><Archive />Archive</DropdownMenuItem>
            </>
          ) : form.status === "archived" && access.superAdmin ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => setConfirm("delete")}><Trash2 />Delete permanently</DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmDialog
        open={confirm === "publish"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Publish Form?"
        description={<p>This form will become available publicly at <span className="font-medium break-all text-foreground">{publicUrl}</span>.</p>}
        confirmLabel="Publish"
        onConfirm={() => run(() => setFormStatusAction(form.id, "published"))}
      />
      <ConfirmDialog
        open={confirm === "unpublish"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Unpublish form?"
        description={<p>The public link will stop working until you publish again. Existing submissions are kept.</p>}
        confirmLabel="Unpublish"
        onConfirm={() => run(() => setFormStatusAction(form.id, "draft"))}
      />
      <ConfirmDialog
        open={confirm === "archive"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Archive form?"
        description={<p>The form will be hidden and stop accepting submissions. Submissions and any connected Google Sheet are kept and can be restored.</p>}
        confirmLabel="Archive"
        destructive
        onConfirm={() => run(() => setFormStatusAction(form.id, "archived"))}
      />
      <ConfirmDialog
        open={confirm === "delete"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Delete form permanently?"
        description={
          <>
            <p>This permanently deletes the form and all of its submissions from Synergy Feedback. This cannot be undone.</p>
            <p>The connected Google Sheet (if any) is <strong>not</strong> deleted.</p>
          </>
        }
        confirmLabel="Delete permanently"
        destructive
        onConfirm={() =>
          start(async () => {
            const res = await deleteFormAction(form.id);
            if (res.ok) {
              toast.success(res.message);
              router.push("/admin/forms");
              router.refresh();
            } else toast.error(res.error);
          })
        }
      />
      <QrCodeDialog open={qr} onOpenChange={setQr} url={publicUrl} formName={form.name} />
    </>
  );
}

export function CopyLinkButton({ url, label = "Copy link" }: { url: string; label?: string }) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={async () => {
        await navigator.clipboard.writeText(url);
        toast.success("Link copied");
      }}
    >
      <Copy /> {label}
    </Button>
  );
}
