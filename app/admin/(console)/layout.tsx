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
        access: {
          createForm: session.can("forms.create"),
          submissions: session.can("submissions.view"),
          analytics: session.can("analytics.view"),
          integrations: session.can("integrations.manage"),
          admin: session.isAdmin,
        },
      }}
    >
      {children}
    </AdminShell>
  );
}
