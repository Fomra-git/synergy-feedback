/** One aggregated row from public.get_rating_report. */
export interface RatingRow {
  branch_id: string | null;
  branch_name: string;
  question_key: string;
  question: string;
  score: number;
  max_score: number;
  responses: number;
}

export interface CustomerRow {
  branch_id: string | null;
  customers: number;
}

export interface MarkCount {
  score: number;
  count: number;
}

export interface QuestionStat {
  key: string;
  question: string;
  maxScore: number;
  average: number | null;
  /** Customers who answered this question (one answer per customer). */
  customers: number;
  marks: MarkCount[];
}

export interface BranchStat {
  id: string | null;
  name: string;
  average: number | null;
  ratings: number;
  customers: number;
  /** Average per question key, for the branch comparison table. */
  questionAverages: Record<string, number | null>;
}

export interface RatingReport {
  average: number | null;
  /** Most common scale top (5 for 1–5 questions). */
  maxScore: number;
  ratings: number;
  customers: number;
  marks: MarkCount[];
  questions: QuestionStat[];
  branches: BranchStat[];
}

const avg = (marks: MarkCount[]) => {
  const n = marks.reduce((s, m) => s + m.count, 0);
  return n ? marks.reduce((s, m) => s + m.score * m.count, 0) / n : null;
};

/** Every mark from the scale top down to 1 (so empty marks still show), plus any odd values seen. */
function scaleMarks(maxScore: number, seen: Map<number, number>): MarkCount[] {
  const scores = new Set<number>(seen.keys());
  if (Number.isInteger(maxScore) && maxScore >= 2 && maxScore <= 10) for (let s = 1; s <= maxScore; s++) scores.add(s);
  return [...scores].sort((a, b) => b - a).map((score) => ({ score, count: seen.get(score) ?? 0 }));
}

function mostCommonMax(rows: RatingRow[]): number {
  const tally = new Map<number, number>();
  for (const r of rows) tally.set(r.max_score, (tally.get(r.max_score) ?? 0) + r.responses);
  return [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 5;
}

function questionStats(rows: RatingRow[]): QuestionStat[] {
  const byKey = new Map<string, { question: string; max: number; seen: Map<number, number> }>();
  for (const r of rows) {
    const q = byKey.get(r.question_key) ?? { question: r.question, max: 0, seen: new Map() };
    q.max = Math.max(q.max, r.max_score);
    q.seen.set(r.score, (q.seen.get(r.score) ?? 0) + r.responses);
    byKey.set(r.question_key, q);
  }
  return [...byKey.entries()]
    .map(([key, q]) => {
      const marks = scaleMarks(q.max, q.seen);
      return { key, question: q.question, maxScore: q.max, average: avg(marks), customers: marks.reduce((s, m) => s + m.count, 0), marks };
    })
    .sort((a, b) => a.question.localeCompare(b.question));
}

/** Builds the report for all rows given (filter rows first for a single branch). */
export function buildRatingReport(rows: RatingRow[], customerRows: CustomerRow[]): RatingReport {
  const clean = rows.map((r) => ({ ...r, score: Number(r.score), max_score: Number(r.max_score), responses: Number(r.responses) }));
  const maxScore = mostCommonMax(clean);
  const seen = new Map<number, number>();
  for (const r of clean) seen.set(r.score, (seen.get(r.score) ?? 0) + r.responses);
  const marks = scaleMarks(maxScore, seen);
  const customersByBranch = new Map(customerRows.map((c) => [c.branch_id, Number(c.customers)]));

  const branchIds = [...new Set(clean.map((r) => r.branch_id))];
  const branches: BranchStat[] = branchIds
    .map((id) => {
      const br = clean.filter((r) => r.branch_id === id);
      const qs = questionStats(br);
      const all = new Map<number, number>();
      for (const r of br) all.set(r.score, (all.get(r.score) ?? 0) + r.responses);
      const m = [...all.entries()].map(([score, count]) => ({ score, count }));
      return {
        id,
        name: br[0]!.branch_name,
        average: avg(m),
        ratings: br.reduce((s, r) => s + r.responses, 0),
        customers: customersByBranch.get(id) ?? 0,
        questionAverages: Object.fromEntries(qs.map((q) => [q.key, q.average])),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    average: avg(marks),
    maxScore,
    ratings: clean.reduce((s, r) => s + r.responses, 0),
    customers: customerRows.reduce((s, c) => s + Number(c.customers), 0),
    marks,
    questions: questionStats(clean),
    branches,
  };
}

/** "2026-10" → its first day and the first day of the next month. */
export function monthBounds(month: string): { start: string; next: string } {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  return { start: `${month}-01`, next: `${next}-01` };
}

export function previousMonth(month: string): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 1)));
}

export function formatAverage(v: number | null): string {
  return v === null ? "—" : v.toFixed(2);
}

/** Five-step diverging colours, low mark → high mark (validated for CVD separation). */
export const MARK_COLORS = ["#b8322f", "#f0874f", "#cfcec8", "#5c9ae8", "#1d5fb6"] as const;

/** Colour for a mark on a scale of `max`, bucketed into the five steps. */
export function markColor(score: number, max: number): string {
  if (max <= 1) return MARK_COLORS[4];
  const t = Math.min(1, Math.max(0, (score - 1) / (max - 1)));
  return MARK_COLORS[Math.round(t * 4)]!;
}
