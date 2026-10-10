import { cn } from "@/lib/utils";

/** Synergy Wellness mark (three rising leaves) on a white rounded tile, so it reads on light and dark backgrounds. */
export function LogoMark({ className }: { className?: string; color?: string }) {
  return (
    <svg viewBox="0 0 40 40" aria-hidden className={cn("size-8", className)}>
      <rect width="40" height="40" rx="10" fill="#fff" />
      <g transform="translate(6 3) scale(0.27)">
        <path fill="#4a78ab" d="M0 51C7 51.4 14 52.4 20 54C21.5 80 27.5 103 44 115.5C52.5 121.5 63 124.5 76 126H52C34.5 124 24.5 114 18.5 100C11.5 84 5 66.5 0 51Z" />
        <path fill="#02334c" d="M15.5 29C24.5 30 33.5 33.5 40 40.5L42 92C43.5 108 55 119.5 73 125.5H58C42.5 121.5 33 112 28.5 99.5C23 84 18.5 58 15.5 29Z" />
        <path fill="#b4b6b3" d="M38 0C49 1 58.5 8.5 61.5 20.5L62 89C63.5 106 76.5 118.5 104 126H78C56 122.5 40.5 110 39 91.5Z" />
      </g>
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
