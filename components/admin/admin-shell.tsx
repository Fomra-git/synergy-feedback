"use client";

import { useState } from "react";
import Link from "next/link";
import { LogOut, Menu, UserCircle2 } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { SidebarNav } from "./sidebar-nav";
import { signOutAction } from "@/app/admin/(auth)/actions";

interface ShellUser {
  name: string;
  email: string;
  role: string;
}

function SidebarBody({ user, onNavigate }: { user: ShellUser; onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col bg-sidebar">
      <div className="flex h-16 items-center border-b border-sidebar-border px-5">
        <Link href="/admin/dashboard" onClick={onNavigate} aria-label="Synergy Feedback dashboard">
          <Logo inverted tagline="Synergy Wellness" />
        </Link>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-4">
        <SidebarNav onNavigate={onNavigate} />
      </div>
      <div className="border-t border-sidebar-border p-3">
        <div className="flex items-center gap-3 rounded-lg px-2 py-2">
          <UserCircle2 className="size-8 text-slate-400" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">{user.name}</p>
            <p className="truncate text-xs text-slate-400">{user.role === "super_admin" ? "Super Admin" : "Admin"}</p>
          </div>
        </div>
        <form action={signOutAction}>
          <button
            type="submit"
            className="mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent/60 hover:text-white"
          >
            <LogOut className="size-4" aria-hidden />
            Logout
          </button>
        </form>
      </div>
    </div>
  );
}

export function AdminShell({ user, children }: { user: ShellUser; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-dvh">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2 focus:shadow">
        Skip to content
      </a>
      {/* Fixed to the viewport so it stays put while the page scrolls; its own nav scrolls if long. */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[260px] lg:block">
        <SidebarBody user={user} />
      </aside>
      <div className="flex min-h-dvh min-w-0 flex-col lg:pl-[260px]">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-card/90 px-4 backdrop-blur lg:hidden">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Open navigation">
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[280px] border-0 p-0">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <SidebarBody user={user} onNavigate={() => setOpen(false)} />
            </SheetContent>
          </Sheet>
          <Logo />
        </header>
        <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
