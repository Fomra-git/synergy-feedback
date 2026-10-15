import { describe, expect, it } from "vitest";
import { buildRatingReport, markColor, monthBounds, previousMonth, type RatingRow } from "@/lib/reports/rating";

const row = (branch: string, q: string, score: number, responses: number, max = 5): RatingRow => ({
  branch_id: branch,
  branch_name: branch.toUpperCase(),
  question_key: q.toLowerCase(),
  question: q,
  score,
  max_score: max,
  responses,
});

describe("buildRatingReport", () => {
  const rows = [row("a", "Staff", 5, 3), row("a", "Staff", 4, 1), row("b", "Staff", 2, 2), row("a", "Clean", 3, 4)];
  const r = buildRatingReport(rows, [{ branch_id: "a", customers: 4 }, { branch_id: "b", customers: 2 }]);

  it("computes the overall average and totals", () => {
    // (5*3 + 4*1 + 2*2 + 3*4) / 10 = 3.5
    expect(r.average).toBeCloseTo(3.5);
    expect(r.ratings).toBe(10);
    expect(r.customers).toBe(6);
  });
  it("lists every mark 5→1, including empty ones", () => {
    expect(r.marks.map((m) => [m.score, m.count])).toEqual([[5, 3], [4, 1], [3, 4], [2, 2], [1, 0]]);
  });
  it("aggregates question-wise across branches with customer counts", () => {
    const staff = r.questions.find((q) => q.key === "staff")!;
    expect(staff.customers).toBe(6);
    expect(staff.average).toBeCloseTo((15 + 4 + 4) / 6);
    expect(staff.marks.find((m) => m.score === 2)!.count).toBe(2);
  });
  it("gives per-branch averages", () => {
    const a = r.branches.find((b) => b.id === "a")!;
    expect(a.average).toBeCloseTo((15 + 4 + 12) / 8);
    expect(a.questionAverages.clean).toBe(3);
    expect(r.branches.find((b) => b.id === "b")!.questionAverages.clean).toBeUndefined();
  });
  it("handles no data", () => {
    const e = buildRatingReport([], []);
    expect(e.average).toBeNull();
    expect(e.marks).toHaveLength(5);
  });
});

describe("month helpers and colours", () => {
  it("handles year boundaries", () => {
    expect(monthBounds("2026-12")).toEqual({ start: "2026-12-01", next: "2027-01-01" });
    expect(previousMonth("2027-01")).toBe("2026-12");
  });
  it("maps marks onto the diverging scale", () => {
    expect(markColor(1, 5)).toBe("#b8322f");
    expect(markColor(3, 5)).toBe("#cfcec8");
    expect(markColor(10, 10)).toBe("#1d5fb6");
  });
});

import { parsePeriod, periodBounds, periodLabel, periodQuery } from "@/lib/reports/rating";

describe("report periods", () => {
  const today = "2026-10-15";
  it("defaults to today's daily report", () => {
    expect(parsePeriod({}, today)).toEqual({ kind: "day", date: today });
  });
  it("reads days and months, rejecting the future and junk", () => {
    expect(parsePeriod({ view: "day", date: "2026-10-03" }, today)).toEqual({ kind: "day", date: "2026-10-03" });
    expect(parsePeriod({ view: "day", date: "2026-10-16" }, today)).toEqual({ kind: "day", date: today });
    expect(parsePeriod({ view: "month", month: "2026-09" }, today)).toEqual({ kind: "month", month: "2026-09" });
    expect(parsePeriod({ view: "month", month: "2026-11" }, today)).toEqual({ kind: "month", month: "2026-10" });
    expect(parsePeriod({ month: "2026-08" }, today)).toEqual({ kind: "month", month: "2026-08" });
  });
  it("bounds a day across month ends", () => {
    expect(periodBounds({ kind: "day", date: "2026-10-31" })).toEqual({ start: "2026-10-31", next: "2026-11-01" });
  });
  it("labels and links periods", () => {
    expect(periodLabel({ kind: "month", month: "2026-10" })).toBe("October 2026");
    expect(periodLabel({ kind: "day", date: "2026-10-15" })).toContain("15 October 2026");
    expect(periodQuery({ kind: "day", date: "2026-10-15" }, "b1")).toBe("view=day&date=2026-10-15&branch=b1");
  });
});
