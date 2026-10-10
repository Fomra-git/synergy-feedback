"use client";

import { useState, useTransition } from "react";
import { KeyRound, Loader2, MoreHorizontal, Pencil, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { PERMISSIONS, ROLE_LABELS } from "@/lib/auth/permissions";
import type { UserRole } from "@/types/db";
import { sendPasswordLinkAction } from "./actions";
import { UserAccessDialog, type DialogUser } from "./user-access-dialog";

export interface UserRowData extends DialogUser {
  canManage: boolean;
  isSelf: boolean;
}

const ROLE_VARIANT: Record<UserRole, "default" | "info" | "secondary"> = { super_admin: "default", admin: "info", staff: "secondary" };

function PermissionSummary({ u }: { u: UserRowData }) {
  if (u.role !== "staff") return <span className="text-muted-foreground">Full access</span>;
  if (u.permissions.length === 0) return <span className="text-muted-foreground">View only</span>;
  const labels = PERMISSIONS.filter((p) => u.permissions.includes(p.key)).map((p) => p.label);
  return <span title={labels.join(", ")}>{labels.length <= 2 ? labels.join(", ") : `${labels.slice(0, 2).join(", ")} +${labels.length - 2}`}</span>;
}

export function UsersManager({
  users,
  branches,
  viewer,
  emailConfigured,
}: {
  users: UserRowData[];
  branches: { id: string; name: string }[];
  viewer: { isSuperAdmin: boolean; branchIds: string[] };
  emailConfigured: boolean;
}) {
  const [editing, setEditing] = useState<UserRowData | null>(null);
  const [adding, setAdding] = useState(false);
  const [pending, start] = useTransition();
  const branchName = new Map(branches.map((b) => [b.id, b.name]));

  const sendLink = (u: UserRowData) =>
    start(async () => {
      const res = await sendPasswordLinkAction(u.id);
      if (!res.ok) return void toast.error(res.error);
      if (res.data.emailed) toast.success(`Password link emailed to ${u.email}`);
      else if (res.data.link) {
        await navigator.clipboard.writeText(res.data.link).catch(() => undefined);
        toast.success("Link copied — send it to them (works once, expires in 24 hours)", { duration: 8000 });
      }
    });

  return (
    <>
      <div className="flex items-center justify-between gap-3 border-b p-4">
        <p className="text-sm text-muted-foreground">
          {users.length} user{users.length === 1 ? "" : "s"}
        </p>
        <Button onClick={() => setAdding(true)}>
          <UserPlus /> Add user
        </Button>
      </div>
      <ul className="divide-y">
        {users.map((u) => (
          <li key={u.id} className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1.4fr)_110px_minmax(0,1fr)_minmax(0,1fr)_40px] sm:items-center sm:gap-4 sm:px-6">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">
                {u.fullName || u.email}
                {u.isSelf && <span className="ml-1 text-xs font-normal text-muted-foreground">(you)</span>}
              </p>
              <p className="truncate text-xs text-muted-foreground">{u.email}</p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant={ROLE_VARIANT[u.role]}>{ROLE_LABELS[u.role]}</Badge>
              {!u.isActive && <Badge variant="warning">Inactive</Badge>}
            </div>
            <p className="truncate text-sm" title={u.branchIds.map((b) => branchName.get(b)).join(", ")}>
              <span className="text-xs text-muted-foreground sm:hidden">Branches: </span>
              {u.role === "super_admin" || u.branchIds.length === 0 ? (
                <span className="text-muted-foreground">All branches</span>
              ) : (
                u.branchIds.map((b) => branchName.get(b) ?? "—").join(", ")
              )}
            </p>
            <p className="truncate text-sm">
              <span className="text-xs text-muted-foreground sm:hidden">Access: </span>
              <PermissionSummary u={u} />
            </p>
            <div className="justify-self-end">
              {u.canManage && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${u.email}`} disabled={pending}>
                      {pending ? <Loader2 className="animate-spin" /> : <MoreHorizontal />}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => setEditing(u)}>
                      <Pencil /> Edit access
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => sendLink(u)}>
                      <KeyRound /> Send password link
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </li>
        ))}
      </ul>

      {adding && <UserAccessDialog open onOpenChange={(o) => !o && setAdding(false)} branches={branches} viewer={viewer} emailConfigured={emailConfigured} />}
      {editing && (
        <UserAccessDialog
          key={editing.id}
          open
          onOpenChange={(o) => !o && setEditing(null)}
          user={editing}
          branches={branches}
          viewer={viewer}
          emailConfigured={emailConfigured}
        />
      )}
    </>
  );
}
