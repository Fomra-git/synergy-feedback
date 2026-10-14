import { describe, expect, it } from "vitest";
import { buildRatingReport, type RatingRow } from "@/lib/reports/rating";
import { buildMonthlyReportEmail } from "@/services/reports/monthly-email";

const row = (branch: string, q: string, score: number, responses: number): RatingRow => ({
  branch_id: branch,
  branch_name: branch === "a" ? "Anna Nagar" : "Porur <script>",
  question_key: q.toLowerCase(),
  question: q,
  score,
  max_score: 5,
  responses,
});

describe("buildMonthlyReportEmail", () => {
  const rows = [row("a", "Staff", 5, 3), row("b", "Staff", 2, 1)];
  const all = buildRatingReport(rows, [{ branch_id: "a", customers: 3 }, { branch_id: "b", customers: 1 }]);
  const perBranch = all.branches.map((b) => ({ name: b.name, report: buildRatingReport(rows.filter((r) => r.branch_id === b.id), []) }));
  const email = buildMonthlyReportEmail("2026-09", "Synergy Wellness", all, perBranch);

  it("names the month and includes every section", () => {
    expect(email.subject).toBe("Synergy Wellness feedback report — September 2026");
    expect(email.html).toContain("Average by branch");
    expect(email.html).toContain("Question-wise marks — all branches");
    expect(email.html).toContain("Anna Nagar");
    expect(email.html).toContain("/admin/reports?month=2026-09");
  });
  it("escapes branch and question names", () => {
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("Porur &lt;script&gt;");
  });
  it("attaches a CSV with all-branch and per-branch rows", () => {
    expect(email.csv).toContain("2026-09,All branches,Staff,4.25,4,3,0,0,1,0");
    expect(email.csv).toContain("Anna Nagar,Staff,5.00");
  });
});
