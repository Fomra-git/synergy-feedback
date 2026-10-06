import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatNumber } from "@/lib/utils";

export function Pagination({
  page,
  pageSize,
  total,
  basePath,
  params,
}: {
  page: number;
  pageSize: number;
  total: number;
  basePath: string;
  params: Record<string, string | undefined>;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;
  const href = (p: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v && k !== "page") sp.set(k, v);
    if (p > 1) sp.set("page", String(p));
    const qs = sp.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-3 border-t px-4 py-3 text-sm sm:px-6">
      <p className="text-muted-foreground">
        {formatNumber(from)}–{formatNumber(to)} of {formatNumber(total)}
      </p>
      <div className="flex gap-2">
        {page > 1 ? (
          <Button asChild variant="outline" size="sm">
            <Link href={href(page - 1)} rel="prev"><ChevronLeft /> Previous</Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled><ChevronLeft /> Previous</Button>
        )}
        {page < pages ? (
          <Button asChild variant="outline" size="sm">
            <Link href={href(page + 1)} rel="next">Next <ChevronRight /></Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled>Next <ChevronRight /></Button>
        )}
      </div>
    </nav>
  );
}
