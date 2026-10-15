import { describe, expect, it } from "vitest";
import { buildRatingReport, type RatingRow } from "@/lib/reports/rating";
import { buildReportEmail } from "@/services/reports/monthly-email";

const row = (branch: string, q: string, score: number, responses: number): RatingRow => ({
  branch_id: branch,
  branch_name: branch === "a" ? "Anna Nagar" : "Porur <script>",
  question_key: q.toLowerCase(),
  question: q,
  score,
  max_score: 5,
  responses,
});

describe("buildReportEmail", () => {
  const rows = [row("a", "Staff", 5, 3), row("b", "Staff", 2, 1)];
  const all = buildRatingReport(rows, [{ branch_id: "a", customers: 3 }, { branch_id: "b", customers: 1 }]);
  const perBranch = all.branches.map((b) => ({ name: b.name, report: buildRatingReport(rows.filter((r) => r.branch_id === b.id), []) }));
  const email = buildReportEmail({ kind: "month", month: "2026-09" }, "Synergy Wellness", all, perBranch);

  it("names the month and includes every section", () => {
    expect(email.subject).toBe("Synergy Wellness monthly feedback report — September 2026");
    expect(email.html).toContain("Average rating by branch");
    expect(email.html).toContain("Question-wise ratings — all branches");
    expect(email.html).toContain("Rating 5");
    expect(email.html).not.toMatch(/\bMark\b/);
    expect(email.html).toContain("Anna Nagar");
    expect(email.html).toContain("/admin/reports?view=month&amp;month=2026-09");
  });
  it("escapes branch and question names", () => {
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("Porur &lt;script&gt;");
  });
  it("attaches a CSV with all-branch and per-branch rows", () => {
    expect(email.csv).toContain("2026-09,All branches,Staff,4.25,4,3,0,0,1,0");
    expect(email.csv).toContain("Anna Nagar,Staff,5.00");
  });
  it("builds a daily report for a single day", () => {
    const daily = buildReportEmail({ kind: "day", date: "2026-10-15" }, "Synergy Wellness", all, perBranch);
    expect(daily.subject).toMatch(/^Synergy Wellness daily feedback report — .*15 October 2026$/);
    expect(daily.html).toContain("Daily feedback report");
    expect(daily.html).toContain("view=day&amp;date=2026-10-15");
    expect(daily.csv).toContain("2026-10-15,All branches,Staff");
  });
});
