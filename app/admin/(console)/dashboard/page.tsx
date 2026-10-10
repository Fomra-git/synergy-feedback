import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  Building2,
  CalendarDays,
  CalendarRange,
  CheckCircle2,
  FilePen,
  FilePlus2,
  FileText,
  Inbox,
  Sheet,
  Sun,
  CalendarClock,
} from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { TimeSeriesChart, BarList } from "@/components/dashboard/charts";
import { SyncStatusTiles } from "@/components/dashboard/sync-status-tiles";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SyncStatusBadge } from "@/components/admin/status-badges";
import { EmptyState } from "@/components/admin/empty-state";
import { FormsOverview } from "@/components/dashboard/forms-overview";
import { listDashboardForms } from "@/services/forms/admin";
import { requireAdminPage } from "@/lib/auth/session";
import { getByBranch, getDashboardStats, getRecentSubmissions, getSyncCounts, getTimeseries } from "@/services/analytics";
import { formatDateTime } from "@/lib/forms/format";
import { env } from "@/lib/env";
import type { SyncStatus } from "@/types/db";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const tz = env.timezone();
  // Today's date in the clinic timezone (en-CA formats as YYYY-MM-DD).
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
  const [session, forms, stats, series, byBranch, sync, recent] = await Promise.all([
    requireAdminPage(),
    listDashboardForms(today, tz),
    getDashboardStats(),
    getTimeseries(30),
    getByBranch(30),
    getSyncCounts(),
    getRecentSubmissions(8),
  ]);

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Overview of forms, submissions and Google Sheets sync across Synergy Wellness."
        actions={
          <Button asChild>
            <Link href="/admin/forms/new">
              <FilePlus2 /> Create Form
            </Link>
          </Button>
        }
      />

      {stats.sheetsNeedingAttention > 0 && (
        <div role="alert" className="mb-6 flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900 sm:flex-row sm:items-center">
          <AlertTriangle className="size-5 shrink-0" aria-hidden />
          <p className="flex-1 text-sm">
            {stats.sheetsNeedingAttention} Google Sheet connection{stats.sheetsNeedingAttention > 1 ? "s need" : " needs"} attention (reauthorization or access problem). Submissions are safely stored and will sync once fixed.
          </p>
          <Button asChild size="sm" variant="outline">
            <Link href="/admin/integrations/google-sheets">Review</Link>
          </Button>
        </div>
      )}

      <FormsOverview forms={forms} today={today} isSuperAdmin={session.isSuperAdmin} />

      <section aria-label="Key metrics" className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        <StatCard label="Total Forms" value={stats.totalForms} icon={FileText} href="/admin/forms" />
        <StatCard label="Published" value={stats.publishedForms} icon={CheckCircle2} href="/admin/forms?status=published" />
        <StatCard label="Drafts" value={stats.draftForms} icon={FilePen} href="/admin/forms?status=draft" />
        <StatCard label="Total Responses" value={stats.totalSubmissions} icon={Inbox} href="/admin/submissions" />
        <StatCard label="Branches" value={stats.totalBranches} icon={Building2} hint={`${stats.activeBranches} active`} href="/admin/branches" />
        <StatCard label="Today" value={stats.submissionsToday} icon={Sun} />
        <StatCard label="This Week" value={stats.submissionsThisWeek} icon={CalendarDays} />
        <StatCard label="This Month" value={stats.submissionsThisMonth} icon={CalendarRange} />
        <StatCard label="Google Sheets" value={stats.sheetConnections} icon={Sheet} hint="Connected forms" href="/admin/integrations/google-sheets" />
        <StatCard
          label="Sync Errors"
          value={stats.failedSyncs}
          icon={AlertTriangle}
          tone={stats.failedSyncs ? "danger" : "default"}
          hint={stats.pendingSyncs ? `${stats.pendingSyncs} pending` : "All caught up"}
          href="/admin/submissions?sync=failed"
        />
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Submissions over time</CardTitle>
            <CardDescription>Daily responses, last 30 days</CardDescription>
          </CardHeader>
          <CardContent>
            <TimeSeriesChart data={series} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>By branch</CardTitle>
            <CardDescription>Last 30 days</CardDescription>
          </CardHeader>
          <CardContent>
            <BarList items={byBranch.slice(0, 6)} />
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>Recent submissions</CardTitle>
              <CardDescription>Latest responses across all forms</CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href="/admin/submissions">View all</Link>
            </Button>
          </CardHeader>
          <CardContent className="px-0 sm:px-0">
            {recent.length === 0 ? (
              <EmptyState icon={Inbox} title="No submissions yet." description="Responses will appear here when someone submits your form." />
            ) : (
              <ul className="divide-y">
                {recent.map((s) => {
                  const log = Array.isArray(s.google_sheet_sync_logs) ? s.google_sheet_sync_logs[0] : s.google_sheet_sync_logs;
                  return (
                    <li key={s.id}>
                      <Link href={`/admin/submissions/${s.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-muted/50 sm:px-6">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{s.forms?.name ?? "Form"}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {s.submission_number} · {s.branches?.name ?? "No branch"}
                          </p>
                        </div>
                        <div className="hidden text-right sm:block">
                          <SyncStatusBadge status={(log?.status as SyncStatus) ?? null} />
                        </div>
                        <p className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                          <CalendarClock className="size-3.5" aria-hidden />
                          {formatDateTime(s.submitted_at, tz)}
                        </p>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Google Sheets sync</CardTitle>
            <CardDescription>All-time sync status</CardDescription>
          </CardHeader>
          <CardContent>
            <SyncStatusTiles counts={sync} />
            {sync.failed > 0 && (
              <Button asChild variant="outline" size="sm" className="mt-4 w-full">
                <Link href="/admin/submissions?sync=failed">Review failed syncs</Link>
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
