import { csvRow } from "@/lib/forms/format";
import { formatAverage, type RatingReport } from "./rating";

/** Question-wise marks for each scope ("All branches" first, then each branch). */
export function ratingReportCsv(month: string, scopes: { name: string; report: RatingReport }[]): string {
  const maxScore = Math.max(5, ...scopes.map((s) => s.report.maxScore));
  const markCols = Array.from({ length: maxScore }, (_, i) => maxScore - i);
  const lines = [csvRow(["Month", "Scope", "Question", "Average", "Customers", ...markCols.map((m) => `Mark ${m}`)])];
  for (const { name, report } of scopes) {
    lines.push(csvRow([month, name, "All rating questions", formatAverage(report.average), report.customers, ...markCols.map((m) => report.marks.find((x) => x.score === m)?.count ?? 0)]));
    for (const q of report.questions) {
      lines.push(csvRow([month, name, q.question, formatAverage(q.average), q.customers, ...markCols.map((m) => q.marks.find((x) => x.score === m)?.count ?? 0)]));
    }
  }
  return "\uFEFF" + lines.join("");
}
