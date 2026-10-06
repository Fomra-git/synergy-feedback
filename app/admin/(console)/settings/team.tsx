"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import type { ProfileRow, UserRole } from "@/types/db";
import { updateProfileAction, updateTeamMemberAction } from "./actions";

export function ProfileForm({ fullName }: { fullName: string }) {
  const router = useRouter();
  const [name, setName] = useState(fullName);
  const [pending, start] = useTransition();
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await updateProfileAction({ fullName: name });
          if (res.ok) {
            toast.success(res.message);
            router.refresh();
          } else toast.error(res.error);
        });
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="p-name">Full name</Label>
        <Input id="p-name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {pending && <Loader2 className="animate-spin" />} Save
      </Button>
    </form>
  );
}

function MemberRow({ member, isSelf }: { member: ProfileRow; isSelf: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const update = (role: UserRole, isActive: boolean) =>
    start(async () => {
      const res = await updateTeamMemberAction({ userId: member.id, role, isActive });
      if (res.ok) {
        toast.success(res.message);
        router.refresh();
      } else toast.error(res.error);
    });
  return (
    <li className="flex flex-col gap-3 px-6 py-3 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{member.full_name || member.email}</p>
        <p className="truncate text-xs text-muted-foreground">{member.email}{isSelf ? " (you)" : ""}</p>
      </div>
      <div className="flex items-center gap-3">
        <NativeSelect aria-label={`Role for ${member.email}`} className="h-8 w-36 text-sm" value={member.role} disabled={pending || isSelf} onChange={(e) => update(e.target.value as UserRole, member.is_active)}>
          <option value="super_admin">Super Admin</option>
          <option value="admin">Admin</option>
          <option value="staff">Staff (no access yet)</option>
        </NativeSelect>
        <label className="flex items-center gap-2 text-xs">
          <Switch checked={member.is_active} disabled={pending || isSelf} onCheckedChange={(v) => update(member.role, v)} aria-label={`Active: ${member.email}`} />
          Active
        </label>
      </div>
    </li>
  );
}

export function TeamTable({ team, currentUserId }: { team: ProfileRow[]; currentUserId: string }) {
  return (
    <ul className="divide-y">
      {team.map((m) => (
        <MemberRow key={m.id} member={m} isSelf={m.id === currentUserId} />
      ))}
    </ul>
  );
}
