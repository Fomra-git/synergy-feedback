import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BarList, TimeSeriesChart } from "@/components/dashboard/charts";
import { SyncStatusTiles } from "@/components/dashboard/sync-status-tiles";
import { getByBranch, getByForm, getSyncCounts, getTimeseries, parseRange, RANGES } from "@/services/analytics";
import { cn, formatNumber } from "@/lib/utils";

export const metadata: Metadata = { title: "Analytics" };

export default async function AnalyticsPage(props: PageProps<"/admin/analytics">) {
  const sp = await props.searchParams;
  const days = parseRange(sp.range);
  const [series, byBranch, byForm, sync] = await Promise.all([
    getTimeseries(Math.max(days, 1)),
    getByBranch(days),
    getByForm(days),
    getSyncCounts(),
  ]);
  const total = series.reduce((s, d) => s + d.total, 0);
  const rangeLabel = RANGES.find((r) => r.days === days)?.label ?? "Last 30 days";

  return (
    <>
      <PageHeader title="Analytics" description="Submission trends by time, branch and form." />

      <nav aria-label="Time range" className="mb-6 inline-flex rounded-lg bg-muted p-1">
        {RANGES.map((r) => (
          <Link
            key={r.id}
            href={`/admin/analytics?range=${r.id}`}
            aria-current={r.days === days ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors",
              r.days === days ? "bg-card text-foreground shadow-sm" : "hover:text-foreground",
            )}
          >
            {r.label}
          </Link>
        ))}
      </nav>

      <Card>
        <CardHeader>
          <CardTitle>Submissions over time</CardTitle>
          <CardDescription>
            {formatNumber(total)} submissions · {rangeLabel}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {days === 1 ? (
            <p className="py-10 text-center">
              <span className="block text-5xl font-semibold tabular-nums">{formatNumber(total)}</span>
              <span className="text-sm text-muted-foreground">submissions today</span>
            </p>
          ) : (
            <TimeSeriesChart data={series} />
          )}
        </CardContent>
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Submissions by branch</CardTitle>
            <CardDescription>{rangeLabel}</CardDescription>
          </CardHeader>
          <CardContent>
            <BarList items={byBranch} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Submissions by form</CardTitle>
            <CardDescription>Top 20 · {rangeLabel}</CardDescription>
          </CardHeader>
          <CardContent>
            <BarList items={byForm} />
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Google Sheets sync status</CardTitle>
          <CardDescription>All submissions with a connected sheet</CardDescription>
        </CardHeader>
        <CardContent className="max-w-xl">
          <SyncStatusTiles counts={sync} />
        </CardContent>
      </Card>
    </>
  );
}
