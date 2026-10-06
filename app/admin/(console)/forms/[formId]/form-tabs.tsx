"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function FormTabs({ formId }: { formId: string }) {
  const pathname = usePathname();
  const tabs = [
    { href: `/admin/forms/${formId}`, label: "Overview" },
    { href: `/admin/forms/${formId}/builder`, label: "Builder" },
    { href: `/admin/forms/${formId}/settings`, label: "Settings" },
    { href: `/admin/forms/${formId}/preview`, label: "Preview" },
    { href: `/admin/submissions?form=${formId}`, label: "Submissions" },
  ];
  return (
    <nav aria-label="Form sections" className="-mx-4 mb-6 overflow-x-auto border-b px-4 sm:mx-0 sm:px-0">
      <ul className="flex gap-1">
        {tabs.map((t) => {
          const active = t.href === pathname;
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors",
                  active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
