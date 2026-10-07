import Link from "next/link";
import { Logo } from "@/components/brand/logo";

/** Shared chrome for the public pages (home, privacy policy, terms). */
export function SiteShell({ children, orgName }: { children: React.ReactNode; orgName: string }) {
  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <header className="border-b">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-4 sm:px-6">
          <Link href="/" aria-label="Synergy Feedback home">
            <Logo tagline={orgName} />
          </Link>
          <Link href="/admin/login" className="text-sm font-medium text-primary hover:underline">
            Staff login
          </Link>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t bg-slate-50">
        <div className="mx-auto flex max-w-4xl flex-col gap-2 px-4 py-6 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>© {new Date().getFullYear()} {orgName}. All rights reserved.</p>
          <nav aria-label="Legal" className="flex gap-4">
            <Link href="/privacy" className="hover:text-foreground hover:underline">Privacy Policy</Link>
            <Link href="/terms" className="hover:text-foreground hover:underline">Terms of Service</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}

export function LegalArticle({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <article className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <h1 className="text-3xl font-semibold tracking-tight text-slate-900">{title}</h1>
      <p className="mt-2 text-sm text-slate-500">Last updated: {updated}</p>
      <div className="mt-8 space-y-4 text-[15px] leading-relaxed text-slate-700 [&_a]:font-medium [&_a]:text-primary [&_a]:underline-offset-2 hover:[&_a]:underline [&_h2]:mt-10 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-slate-900 [&_h3]:mt-6 [&_h3]:font-semibold [&_h3]:text-slate-900 [&_li]:ml-5 [&_li]:list-disc [&_li]:pl-1 [&_ul]:space-y-1.5">
        {children}
      </div>
    </article>
  );
}
