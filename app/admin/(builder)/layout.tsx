import { requireAdminPage } from "@/lib/auth/session";

/** Full-screen layout (no sidebar) for the form builder. */
export default async function BuilderLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage();
  return children;
}
