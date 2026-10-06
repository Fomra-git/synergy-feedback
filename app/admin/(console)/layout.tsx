import { requireAdminPage } from "@/lib/auth/session";
import { AdminShell } from "@/components/admin/admin-shell";

export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAdminPage();
  return (
    <AdminShell
      user={{
        name: session.profile.full_name || session.email.split("@")[0]!,
        email: session.email,
        role: session.profile.role,
      }}
    >
      {children}
    </AdminShell>
  );
}
