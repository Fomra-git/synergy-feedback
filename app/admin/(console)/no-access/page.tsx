import type { Metadata } from "next";
import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PERMISSIONS } from "@/lib/auth/permissions";

export const metadata: Metadata = { title: "No access" };

export default async function NoAccessPage(props: PageProps<"/admin/no-access">) {
  const sp = await props.searchParams;
  const need = PERMISSIONS.find((p) => p.key === sp.need);
  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-20 text-center">
      <span className="mb-4 flex size-12 items-center justify-center rounded-full bg-amber-100 text-amber-700">
        <ShieldAlert className="size-6" aria-hidden />
      </span>
      <h1 className="text-xl font-semibold">You don&apos;t have access to this page</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {need ? (
          <>
            It needs the <strong className="text-foreground">{need.label}</strong> permission.{" "}
          </>
        ) : null}
        Ask an admin to update your access in Users.
      </p>
      <Button asChild className="mt-6">
        <Link href="/admin/dashboard">Back to dashboard</Link>
      </Button>
    </div>
  );
}
