import type { Metadata } from "next";
import { ClipboardCheck, Download, FileBarChart2, MessageSquareText, Star, Users } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { EmptyState } from "@/components/admin/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BranchAverageChart, MarkDistributionChart, MarkLegend, QuestionMarksBar } from "@/components/reports/rating-charts";
import { requirePermissionPage } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { formatAverage, monthLabel, previousMonth } from "@/lib/reports/rating";
import { formatNumber } from "@/lib/utils";
import { listBranchOptions } from "@/services/forms/admin";
import { currentMonth, loadRatingData, reportFor } from "@/services/reports/rating";
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
  const thisMonth = currentMonth(tz);
  const month = typeof sp.month === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.month) && sp.month <= thisMonth ? sp.month : thisMonth;
  const branches = await listBranchOptions();
  const branchId = typeof sp.branch === "string" && branches.some((b) => b.id === sp.branch) ? sp.branch : null;
  const branchName = branchId ? branches.find((b) => b.id === branchId)!.name : "All branches";

  const data = await loadRatingData(await createClient(), month, tz, branchId);
  const report = reportFor(data);
  const months = Array.from({ length: 12 }, (_, i) => i).reduce<string[]>((acc) => [...acc, acc.length ? previousMonth(acc[acc.length - 1]!) : thisMonth], []);
  const csvHref = `/api/admin/reports/export?month=${month}${branchId ? `&branch=${branchId}` : ""}`;
  const isCurrent = month === thisMonth;

  return (
    <>
      <PageHeader
        title="Reports"
        description="Average marks and question-wise marks from rating questions, for all branches or one branch."
        actions={
          <>
            <Button asChild variant="outline">
              <a href={csvHref} download>
                <Download /> CSV
              </a>
            </Button>
            {session.isAdmin && <EmailReportButton month={month} />}
          </>
        }
      />

      <Card className="mb-6">
        <form className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end" role="search" aria-label="Report filters">
          <label className="flex-1 space-y-1.5 text-sm font-medium">
            Month
            <NativeSelect name="month" defaultValue={month}>
              {months.map((m) => (
                <option key={m} value={m}>
                  {monthLabel(m)}
                  {m === thisMonth ? " (this month)" : ""}
                </option>
              ))}
            </NativeSelect>
          </label>
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

      <div className="mb-4">
        <h2 className="text-lg font-semibold">
          {monthLabel(month)} · {branchName}
        </h2>
        <p className="text-sm text-muted-foreground">
          {isCurrent ? "Month to date. " : ""}The full report for each month is emailed on the 1st to the &ldquo;Recipients for all forms&rdquo; list.
        </p>
      </div>

      {report.ratings === 0 ? (
        <Card>
          <EmptyState
            icon={Star}
            title="No ratings for this period"
            description="Reports use radio questions whose options are numbers, such as 5, 4, 3, 2, 1 (or “5 - Excellent” … “1 - Poor”). Add one to a form, or pick another month."
          />
        </Card>
      ) : (
        <>
          <section aria-label="Summary" className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <Tile
              label="Average mark"
              value={
                <>
                  {formatAverage(report.average)}
                  <span className="text-base font-normal text-muted-foreground"> / {report.maxScore}</span>
                </>
              }
              icon={Star}
            />
            <Tile label="Ratings given" value={formatNumber(report.ratings)} icon={ClipboardCheck} hint="Answers to rating questions" />
            <Tile label="Customers" value={formatNumber(report.customers)} icon={Users} hint="Submissions with ratings" />
            <Tile label="Rating questions" value={formatNumber(report.questions.length)} icon={MessageSquareText} />
          </section>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <Card className={report.branches.length > 1 ? "" : "lg:col-span-2"}>
              <CardHeader>
                <CardTitle>Marks given</CardTitle>
                <CardDescription>How many times each mark was given across all rating questions</CardDescription>
              </CardHeader>
              <CardContent>
                <MarkDistributionChart marks={report.marks} maxScore={report.maxScore} />
              </CardContent>
            </Card>
            {report.branches.length > 1 && (
              <Card>
                <CardHeader>
                  <CardTitle>Average by branch</CardTitle>
                  <CardDescription>Average mark out of {report.maxScore}</CardDescription>
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
                <CardTitle>Question-wise marks</CardTitle>
                <CardDescription>Number of customers who gave each mark, per question</CardDescription>
              </div>
              <MarkLegend marks={report.marks} maxScore={report.maxScore} />
            </CardHeader>
            <CardContent className="px-0 sm:px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[220px]">Question</TableHead>
                    <TableHead className="min-w-[160px]">Marks</TableHead>
                    {report.marks.map((m) => (
                      <TableHead key={m.score} className="text-right">
                        {m.score}
                      </TableHead>
                    ))}
                    <TableHead className="text-right">Customers</TableHead>
                    <TableHead className="text-right">Average</TableHead>
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
                      <TableCell className="text-right tabular-nums">{formatNumber(q.customers)}</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{formatAverage(q.average)}</TableCell>
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
                    <TableCell className="text-right font-semibold tabular-nums">{formatNumber(report.customers)}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{formatAverage(report.average)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {report.branches.length > 1 && (
            <Card className="mt-6 overflow-hidden">
              <CardHeader>
                <CardTitle>Branch-wise comparison</CardTitle>
                <CardDescription>Average mark per question for each branch. Pick a branch above for its full report.</CardDescription>
              </CardHeader>
              <CardContent className="px-0 sm:px-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Branch</TableHead>
                      {report.questions.map((q) => (
                        <TableHead key={q.key} className="max-w-[160px] text-right whitespace-normal">
                          {q.question}
                        </TableHead>
                      ))}
                      <TableHead className="text-right">Customers</TableHead>
                      <TableHead className="text-right">Average</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.branches.map((b) => (
                      <TableRow key={b.id ?? "none"}>
                        <TableCell className="font-medium">
                          {b.id ? (
                            <a className="hover:text-primary hover:underline" href={`/admin/reports?month=${month}&branch=${b.id}`}>
                              {b.name}
                            </a>
                          ) : (
                            b.name
                          )}
                        </TableCell>
                        {report.questions.map((q) => (
                          <TableCell key={q.key} className="text-right tabular-nums">
                            {formatAverage(b.questionAverages[q.key] ?? null)}
                          </TableCell>
                        ))}
                        <TableCell className="text-right tabular-nums">{formatNumber(b.customers)}</TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">{formatAverage(b.average)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </>
  );
}
