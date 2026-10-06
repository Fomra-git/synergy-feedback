"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Building2,
  FilePlus2,
  FileText,
  Inbox,
  LayoutDashboard,
  Plug,
  ScrollText,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  {
    label: "Forms",
    icon: FileText,
    href: "/admin/forms",
    children: [
      { href: "/admin/forms", label: "All Forms", icon: FileText, exact: true },
      { href: "/admin/forms/new", label: "Create Form", icon: FilePlus2 },
    ],
  },
  { href: "/admin/submissions", label: "Submissions", icon: Inbox },
  { href: "/admin/branches", label: "Branches", icon: Building2 },
  { href: "/admin/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/admin/integrations", label: "Integrations", icon: Plug },
  { href: "/admin/settings", label: "Settings", icon: Settings },
  { href: "/admin/audit-log", label: "Audit Log", icon: ScrollText },
] as const;

function isActive(pathname: string, href: string, exact?: boolean) {
  if (exact) return pathname === href || (pathname.startsWith(href + "/") && !pathname.startsWith("/admin/forms/new"));
  return pathname === href || pathname.startsWith(href + "/");
}

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const linkClass = (active: boolean) =>
    cn(
      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
      active ? "bg-sidebar-accent text-white" : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-white",
    );

  return (
    <nav aria-label="Main" className="flex flex-col gap-1">
      {NAV.map((item) =>
        "children" in item ? (
          <div key={item.label} className="flex flex-col gap-0.5">
            <span className="flex items-center gap-3 px-3 pt-2 pb-1 text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
              {item.label}
            </span>
            {item.children.map((child) => {
              const active = isActive(pathname, child.href, "exact" in child ? child.exact : false);
              return (
                <Link key={child.href} href={child.href} onClick={onNavigate} aria-current={active ? "page" : undefined} className={linkClass(active)}>
                  <child.icon className="size-4" aria-hidden />
                  {child.label}
                </Link>
              );
            })}
            <div className="h-1" />
          </div>
        ) : (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={isActive(pathname, item.href) ? "page" : undefined}
            className={linkClass(isActive(pathname, item.href))}
          >
            <item.icon className="size-4" aria-hidden />
            {item.label}
          </Link>
        ),
      )}
    </nav>
  );
}
