"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { PERMISSIONS, type Permission } from "@/lib/auth/permissions";
import type { UserRole } from "@/types/db";
import { createUserAction, updateUserAccessAction } from "./actions";

export interface DialogUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  isActive: boolean;
  branchIds: string[];
  permissions: string[];
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Edit this user; omit to add a new one. */
  user?: DialogUser;
  branches: { id: string; name: string }[];
  viewer: { isSuperAdmin: boolean; branchIds: string[] };
  emailConfigured: boolean;
}

const STAFF_DEFAULT: Permission[] = ["submissions.view"];

export function UserAccessDialog({ open, onOpenChange, user, branches, viewer, emailConfigured }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const scopedViewer = !viewer.isSuperAdmin && viewer.branchIds.length > 0;
  // Branch-limited admins can only hand out their own branches.
  const selectable = scopedViewer ? branches.filter((b) => viewer.branchIds.includes(b.id)) : branches;

  const [fullName, setFullName] = useState(user?.fullName ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [role, setRole] = useState<UserRole>(user?.role ?? "staff");
  const [isActive, setIsActive] = useState(user?.isActive ?? true);
  const [allBranches, setAllBranches] = useState(scopedViewer ? false : (user?.branchIds.length ?? 0) === 0);
  const [branchIds, setBranchIds] = useState<string[]>(user?.branchIds ?? (scopedViewer ? viewer.branchIds : []));
  const [permissions, setPermissions] = useState<string[]>(user ? user.permissions : STAFF_DEFAULT);
  const [method, setMethod] = useState<"invite" | "password">(emailConfigured ? "invite" : "password");
  const [password, setPassword] = useState("");
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const submit = () =>
    start(async () => {
      const access = { role, branchIds: role === "super_admin" || allBranches ? [] : branchIds, permissions: role === "staff" ? permissions : [] };
      if (role !== "super_admin" && !allBranches && access.branchIds.length === 0) {
        toast.error("Choose at least one branch, or give access to all branches.");
        return;
      }
      if (user) {
        const res = await updateUserAccessAction({ userId: user.id, fullName, isActive, ...access });
        if (!res.ok) return void toast.error(res.error);
        toast.success(res.message);
        onOpenChange(false);
        router.refresh();
        return;
      }
      const res = await createUserAction({ email, fullName, method, password: method === "password" ? password : undefined, ...access });
      if (!res.ok) return void toast.error(res.error);
      router.refresh();
      if (res.data.link) {
        setShareLink(res.data.link);
        return;
      }
      toast.success(res.data.emailed ? `Invite emailed to ${email}` : `${fullName} can now sign in with the password you set`);
      onOpenChange(false);
    });

  if (shareLink) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Share the invite link</DialogTitle>
            <DialogDescription>
              Email sending isn&apos;t set up, so send this link to {fullName} yourself (WhatsApp, email…). It lets them choose a password, works once and
              expires in 24 hours.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Input readOnly value={shareLink} aria-label="Invite link" onFocus={(e) => e.currentTarget.select()} />
            <Button
              type="button"
              variant="outline"
              onClick={async () => {
                await navigator.clipboard.writeText(shareLink);
                setCopied(true);
              }}
            >
              {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => onOpenChange(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{user ? `Edit access — ${user.fullName || user.email}` : "Add user"}</DialogTitle>
          <DialogDescription>{user ? user.email : "Give a colleague access to Synergy Feedback."}</DialogDescription>
        </DialogHeader>

        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="u-name">Full name</Label>
              <Input id="u-name" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="u-email">Email</Label>
              <Input id="u-email" type="email" required disabled={!!user} value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="u-role">Role</Label>
            <NativeSelect id="u-role" value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
              <option value="staff">Staff — only the permissions you tick</option>
              <option value="admin">Admin — every feature and managing users</option>
              {viewer.isSuperAdmin && <option value="super_admin">Super Admin — everything, incl. organisation settings</option>}
            </NativeSelect>
          </div>

          {role !== "super_admin" && (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Branch access</legend>
              {!scopedViewer && (
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={allBranches} onCheckedChange={(v) => setAllBranches(v === true)} />
                  All branches (including ones added later)
                </label>
              )}
              {!allBranches && (
                <div className="grid gap-2 rounded-lg border p-3 sm:grid-cols-2">
                  {selectable.length === 0 && <p className="text-sm text-muted-foreground">No branches yet.</p>}
                  {selectable.map((b) => (
                    <label key={b.id} className="flex items-center gap-2 text-sm">
                      <Checkbox checked={branchIds.includes(b.id)} onCheckedChange={() => setBranchIds((l) => toggle(l, b.id))} />
                      {b.name}
                    </label>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground">They only see forms, submissions and stats for these branches.</p>
            </fieldset>
          )}

          {role === "staff" ? (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Permissions</legend>
              <div className="divide-y rounded-lg border">
                {PERMISSIONS.map((p) => (
                  <label key={p.key} className="flex items-start gap-3 px-3 py-2.5">
                    <Checkbox className="mt-0.5" checked={permissions.includes(p.key)} onCheckedChange={() => setPermissions((l) => toggle(l, p.key))} />
                    <span>
                      <span className="block text-sm font-medium">{p.label}</span>
                      <span className="block text-xs text-muted-foreground">{p.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">Everyone can see the dashboard, the forms list and copy form links / QR codes.</p>
            </fieldset>
          ) : (
            <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
              {role === "admin" ? "Admins can use every feature in their branches and manage users." : "Super admins have full access."}
            </p>
          )}

          {user ? (
            <label className="flex items-center justify-between gap-4 rounded-lg border p-3">
              <span>
                <span className="block text-sm font-medium">Active</span>
                <span className="block text-xs text-muted-foreground">Inactive users can&apos;t sign in and are signed out immediately.</span>
              </span>
              <Switch checked={isActive} onCheckedChange={setIsActive} aria-label="Active" />
            </label>
          ) : (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">How will they sign in?</legend>
              <label className="flex items-start gap-2 text-sm">
                <input type="radio" name="method" className="mt-1 accent-[var(--primary)]" checked={method === "invite"} onChange={() => setMethod("invite")} />
                <span>
                  Send an invite link — they choose their own password
                  <span className="block text-xs text-muted-foreground">
                    {emailConfigured ? "Emailed to them." : "Email isn't set up, so you'll get a link to share yourself."}
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input type="radio" name="method" className="mt-1 accent-[var(--primary)]" checked={method === "password"} onChange={() => setMethod("password")} />
                <span>Set a password now and tell them</span>
              </label>
              {method === "password" && (
                <Input
                  type="text"
                  autoComplete="new-password"
                  aria-label="Temporary password"
                  placeholder="At least 10 characters, a letter and a number"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              )}
            </fieldset>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}
              {user ? "Save access" : method === "invite" ? "Create & invite" : "Create user"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
