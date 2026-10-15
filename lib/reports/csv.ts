import { csvRow } from "@/lib/forms/format";
import { formatAverage, type RatingReport } from "./rating";

/** Question-wise ratings for each scope ("All branches" first, then each branch). */
export function ratingReportCsv(period: string, scopes: { name: string; report: RatingReport }[]): string {
  const maxScore = Math.max(5, ...scopes.map((s) => s.report.maxScore));
  const markCols = Array.from({ length: maxScore }, (_, i) => maxScore - i);
  const lines = [csvRow(["Period", "Scope", "Question", "Average rating", "Customers", ...markCols.map((m) => `Rating ${m}`)])];
  for (const { name, report } of scopes) {
    lines.push(csvRow([period, name, "All rating questions", formatAverage(report.average), report.customers, ...markCols.map((m) => report.marks.find((x) => x.score === m)?.count ?? 0)]));
    for (const q of report.questions) {
      lines.push(csvRow([period, name, q.question, formatAverage(q.average), q.customers, ...markCols.map((m) => q.marks.find((x) => x.score === m)?.count ?? 0)]));
    }
  }
  return "\uFEFF" + lines.join("");
}
