import Link from "next/link";
import { Logo } from "@/components/brand/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-gradient-to-br from-teal-50 via-white to-slate-100 px-4 py-10">
      <div aria-hidden className="pointer-events-none absolute -top-40 -right-40 size-[28rem] rounded-full bg-teal-200/40 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-40 -left-40 size-[28rem] rounded-full bg-amber-100/60 blur-3xl" />
      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Logo tagline="Synergy Wellness" />
        </div>
        {children}
        <p className="mt-8 text-center text-xs text-muted-foreground">© {new Date().getFullYear()} Synergy Wellness. Authorised staff only.</p>
        <p className="mt-1 text-center text-xs text-muted-foreground">
          <Link href="/privacy" className="hover:underline">Privacy Policy</Link>
          <span aria-hidden> · </span>
          <Link href="/terms" className="hover:underline">Terms of Service</Link>
        </p>
      </div>
    </main>
  );
}
