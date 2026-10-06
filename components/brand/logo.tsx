import { cn } from "@/lib/utils";

/** Synergy Wellness mark: two interlocking arcs forming a figure in motion. */
export function LogoMark({ className, color = "currentColor" }: { className?: string; color?: string }) {
  return (
    <svg viewBox="0 0 40 40" aria-hidden className={cn("size-8", className)} fill="none">
      <rect width="40" height="40" rx="10" fill={color} />
      <circle cx="20" cy="11" r="3.4" fill="#fff" />
      <path d="M10.5 27.5c3.2-6.4 7.2-9.6 12-9.6 2.6 0 4.8.8 6.9 2.4" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
      <path d="M29.5 21.5c-2.6 5.8-6.4 8.7-11.3 8.7-2.3 0-4.3-.6-6.2-1.8" stroke="#99f6e4" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({
  className,
  name = "Synergy Feedback",
  tagline,
  logoUrl,
  color,
  inverted,
}: {
  className?: string;
  name?: string;
  tagline?: string;
  logoUrl?: string;
  color?: string;
  inverted?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- admin-configured external logo
        <img src={logoUrl} alt="" className="h-8 w-auto max-w-[120px] object-contain" />
      ) : (
        <LogoMark color={color ?? "#0f766e"} />
      )}
      <span className="flex flex-col leading-tight">
        <span className={cn("text-[15px] font-semibold tracking-tight", inverted ? "text-white" : "text-foreground")}>{name}</span>
        {tagline ? <span className={cn("text-[11px]", inverted ? "text-slate-400" : "text-muted-foreground")}>{tagline}</span> : null}
      </span>
    </span>
  );
}
