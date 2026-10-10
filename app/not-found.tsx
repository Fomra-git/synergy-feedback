import Link from "next/link";
import { LogoMark } from "@/components/brand/logo";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <LogoMark className="mb-6 size-12" />
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="mt-2 max-w-sm text-muted-foreground">The page you are looking for doesn&apos;t exist or is no longer available.</p>
      <Link href="/" className="mt-6 text-sm font-medium text-primary hover:underline">
        Go to staff login
      </Link>
    </main>
  );
}
