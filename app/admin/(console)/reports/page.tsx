import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Download, FileBarChart2, Star, Users } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { EmptyState } from "@/components/admin/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BranchAverageChart, MarkDistributionChart, MarkLegend, QuestionMarksBar } from "@/components/reports/rating-charts";
import { requirePermissionPage } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { formatAverage, monthLabel, nextDate, parsePeriod, periodLabel, periodQuery, previousDate, previousMonth } from "@/lib/reports/rating";
import { cn, formatNumber } from "@/lib/utils";
import { listBranchOptions } from "@/services/forms/admin";
import { currentDate, loadRatingData, reportFor } from "@/services/reports/rating";
import { EmailReportButton } from "./email-report-button";

export const metadata: Metadata = { title: "Reports" };

function Tile({ label, value, hint, icon: Icon }: { label: string; value: React.ReactNode; hint?: string; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-3 p-5">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">{value}</p>
          {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
        </div>
        <span className="flex size-9 items-center justify-center rounded-lg bg-accent text-primary">
          <Icon className="size-4" aria-hidden />
        </span>
      </CardContent>
    </Card>
  );
}

export default async function ReportsPage(props: PageProps<"/admin/reports">) {
  const session = await requirePermissionPage("analytics.view");
  const sp = await props.searchParams;
  const tz = env.timezone();
  const today = currentDate(tz);
  const thisMonth = today.slice(0, 7);
  // Daily report for today by default; switch to Monthly with ?view=month.
  const period = parsePeriod(sp, today);
  // Load the branch list and the report together; the requested branch is
  // validated against the list afterwards (re-queried for all branches if unknown).
  const requested = typeof sp.branch === "string" && /^[0-9a-f-]{36}$/i.test(sp.branch) ? sp.branch : null;
  const client = await createClient();
  const [branches, firstData] = await Promise.all([listBranchOptions(), loadRatingData(client, period, tz, requested)]);
  const branchId = requested && branches.some((b) => b.id === requested) ? requested : null;
  const branchName = branchId ? branches.find((b) => b.id === branchId)!.name : "All branches";
  const data = branchId === requested ? firstData : await loadRatingData(client, period, tz, null);
  const report = reportFor(data);
  const months = Array.from({ length: 12 }, (_, i) => i).reduce<string[]>((acc) => [...acc, acc.length ? previousMonth(acc[acc.length - 1]!) : thisMonth], []);
  const csvHref = `/api/admin/reports/export?${periodQuery(period, branchId)}`;
  const isCurrent = period.kind === "day" ? period.date === today : period.month === thisMonth;
  const viewHref = (view: "day" | "month") =>
    `/admin/reports?${periodQuery(view === "day" ? { kind: "day", date: today } : { kind: "month", month: thisMonth }, branchId)}`;

  return (
    <>
      <PageHeader
        title="Reports"
        description="Daily and monthly ratings from your feedback forms, for all branches or one branch."
        actions={
          <>
            <Button asChild variant="outline">
              <a href={csvHref} download>
                <Download /> CSV
              </a>
            </Button>
            {session.isAdmin && <EmailReportButton period={period} />}
          </>
        }
      />

      <nav aria-label="Report type" className="mb-3 inline-flex rounded-lg bg-muted p-1">
        {(["day", "month"] as const).map((v) => (
          <Link
            key={v}
            href={viewHref(v)}
            aria-current={period.kind === v ? "page" : undefined}
            className={cn(
              "rounded-md px-4 py-1.5 text-sm font-medium text-muted-foreground transition-colors",
              period.kind === v ? "bg-card text-foreground shadow-sm" : "hover:text-foreground",
            )}
          >
            {v === "day" ? "Daily" : "Monthly"}
          </Link>
        ))}
      </nav>

      <Card className="mb-6">
        <form className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end" role="search" aria-label="Report filters">
          <input type="hidden" name="view" value={period.kind} />
          {period.kind === "day" ? (
            <label className="flex-1 space-y-1.5 text-sm font-medium">
              Date
              <Input type="date" name="date" defaultValue={period.date} max={today} required />
            </label>
          ) : (
            <label className="flex-1 space-y-1.5 text-sm font-medium">
              Month
              <NativeSelect name="month" defaultValue={period.month}>
                {months.map((m) => (
                  <option key={m} value={m}>
                    {monthLabel(m)}
                    {m === thisMonth ? " (this month)" : ""}
                  </option>
                ))}
              </NativeSelect>
            </label>
          )}
          <label className="flex-1 space-y-1.5 text-sm font-medium">
            Branch
            <NativeSelect name="branch" defaultValue={branchId ?? ""}>
              {(session.branchIds.length === 0 || branches.length > 1) && <option value="">All branches</option>}
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </NativeSelect>
          </label>
          <Button type="submit">
            <FileBarChart2 /> Generate report
          </Button>
        </form>
      </Card>

      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">
            {period.kind === "day" ? "Daily report" : "Monthly report"} · {periodLabel(period)} · {branchName}
          </h2>
          <p className="text-sm text-muted-foreground">
            {isCurrent ? (period.kind === "day" ? "Today so far. " : "Month to date. ") : ""}
            Each month&apos;s full report is also emailed on the 1st to the &ldquo;Recipients for all forms&rdquo; list.
          </p>
        </div>
        {period.kind === "day" && (
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href={`/admin/reports?${periodQuery({ kind: "day", date: previousDate(period.date) }, branchId)}`}>
                <ChevronLeft /> Previous day
              </Link>
            </Button>
            {period.date < today && (
              <Button asChild variant="outline" size="sm">
                <Link href={`/admin/reports?${periodQuery({ kind: "day", date: nextDate(period.date) }, branchId)}`}>
                  Next day <ChevronRight />
                </Link>
              </Button>
            )}
          </div>
        )}
      </div>

      {report.ratings === 0 ? (
        <Card>
          <EmptyState
            icon={Star}
            title="No ratings for this period"
            description={`Reports use radio questions whose options are numbers, such as 5, 4, 3, 2, 1 (or “5 - Excellent” … “1 - Poor”). Add one to a form, or pick another ${period.kind === "day" ? "day" : "month"}.`}
          />
        </Card>
      ) : (
        <>
          <section aria-label="Summary" className="grid grid-cols-2 gap-3 sm:gap-4">
            <Tile
              label="Average rating"
              value={
                <>
                  {formatAverage(report.average)}
                  <span className="text-base font-normal text-muted-foreground"> / {report.maxScore}</span>
                </>
              }
              icon={Star}
            />
            <Tile label="Customers" value={formatNumber(report.customers)} icon={Users} hint="Submissions with ratings" />
          </section>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <Card className={report.branches.length > 1 ? "" : "lg:col-span-2"}>
              <CardHeader>
                <CardTitle>Ratings given</CardTitle>
                <CardDescription>How many times each rating was given across all rating questions</CardDescription>
              </CardHeader>
              <CardContent>
                <MarkDistributionChart marks={report.marks} maxScore={report.maxScore} />
              </CardContent>
            </Card>
            {report.branches.length > 1 && (
              <Card>
                <CardHeader>
                  <CardTitle>Average rating by branch</CardTitle>
                  <CardDescription>Average rating out of {report.maxScore}</CardDescription>
                </CardHeader>
                <CardContent>
                  <BranchAverageChart branches={report.branches} maxScore={report.maxScore} />
                </CardContent>
              </Card>
            )}
          </div>

          <Card className="mt-6 overflow-hidden">
            <CardHeader className="gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <CardTitle>Question-wise ratings</CardTitle>
                <CardDescription>Number of customers who gave each rating, per question</CardDescription>
              </div>
              <MarkLegend marks={report.marks} maxScore={report.maxScore} />
            </CardHeader>
            <CardContent className="px-0 sm:px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[220px]">Question</TableHead>
                    <TableHead className="min-w-[160px]">Ratings</TableHead>
                    {report.marks.map((m) => (
                      <TableHead key={m.score} className="text-right">
                        Rating {m.score}
                      </TableHead>
                    ))}
                    <TableHead className="border-l text-right">Customers</TableHead>
                    <TableHead className="border-l text-right">Average</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.questions.map((q) => (
                    <TableRow key={q.key}>
                      <TableCell className="font-medium whitespace-normal">{q.question}</TableCell>
                      <TableCell>
                        <QuestionMarksBar q={q} />
                      </TableCell>
                      {report.marks.map((m) => (
                        <TableCell key={m.score} className="text-right tabular-nums">
                          {formatNumber(q.marks.find((x) => x.score === m.score)?.count ?? 0)}
                        </TableCell>
                      ))}
                      <TableCell className="border-l text-right tabular-nums">{formatNumber(q.customers)}</TableCell>
                      <TableCell className="border-l text-right font-semibold tabular-nums">{formatAverage(q.average)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-muted/40">
                    <TableCell className="font-semibold">All rating questions</TableCell>
                    <TableCell />
                    {report.marks.map((m) => (
                      <TableCell key={m.score} className="text-right font-semibold tabular-nums">
                        {formatNumber(m.count)}
                      </TableCell>
                    ))}
                    <TableCell className="border-l text-right font-semibold tabular-nums">{formatNumber(report.customers)}</TableCell>
                    <TableCell className="border-l text-right font-semibold tabular-nums">{formatAverage(report.average)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </>
  );
}
