import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/page-header";
import { Card } from "@/components/ui/card";
import { requireAdminRolePage } from "@/lib/auth/session";
import { canManageUser } from "@/lib/auth/user-admin";
import { isEmailConfigured } from "@/lib/env";
import { listBranchOptions } from "@/services/forms/admin";
import { listUsersWithScope } from "@/services/users";
import { UsersManager, type UserRowData } from "./users-table";

export const metadata: Metadata = { title: "Users" };

export default async function UsersPage() {
  const session = await requireAdminRolePage();
  const [all, branches] = await Promise.all([listUsersWithScope(), listBranchOptions()]);
  const manager = { userId: session.userId, role: session.profile.role, branchIds: session.branchIds };
  const scoped = !session.isSuperAdmin && session.branchIds.length > 0;

  // Branch-limited admins only see people inside their branches (and themselves).
  const visible = all.filter(
    (u) => u.id === session.userId || !scoped || (u.branchIds.length > 0 && u.branchIds.every((b) => session.branchIds.includes(b))),
  );
  const rows: UserRowData[] = visible.map((u) => ({
    id: u.id,
    email: u.email,
    fullName: u.full_name ?? "",
    role: u.role,
    isActive: u.is_active,
    branchIds: u.branchIds,
    permissions: u.permissions,
    isSelf: u.id === session.userId,
    canManage: canManageUser(manager, { id: u.id, role: u.role, branchIds: u.branchIds }),
  }));

  return (
    <>
      <PageHeader
        title="Users"
        description="Add admins and staff, and choose which branches and features each person can use."
      />
      <Card className="overflow-hidden">
        <UsersManager
          users={rows}
          branches={branches.map((b) => ({ id: b.id, name: b.name }))}
          viewer={{ isSuperAdmin: session.isSuperAdmin, branchIds: session.branchIds }}
          emailConfigured={isEmailConfigured()}
        />
      </Card>
    </>
  );
}
