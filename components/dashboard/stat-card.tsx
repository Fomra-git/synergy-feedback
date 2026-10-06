import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn, formatNumber } from "@/lib/utils";

export function StatCard({
  label,
  value,
  icon: Icon,
  hint,
  href,
  tone = "default",
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  hint?: string;
  href?: string;
  tone?: "default" | "warning" | "danger";
}) {
  const body = (
    <div
      className={cn(
        "group flex h-full flex-col justify-between rounded-xl border bg-card p-4 shadow-xs transition-shadow sm:p-5",
        href && "hover:shadow-md",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <span
          className={cn(
            "flex size-8 items-center justify-center rounded-lg",
            tone === "danger" ? "bg-red-50 text-red-600" : tone === "warning" ? "bg-amber-50 text-amber-600" : "bg-accent text-primary",
          )}
        >
          <Icon className="size-4" aria-hidden />
        </span>
      </div>
      <div className="mt-3">
        <p className="text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl">{formatNumber(value)}</p>
        {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      </div>
    </div>
  );
  return href ? (
    <Link href={href} className="block rounded-xl focus-visible:ring-2 focus-visible:ring-ring">
      {body}
    </Link>
  ) : (
    body
  );
}
