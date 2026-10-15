"use client";

import { useState } from "react";
import { formatNumber } from "@/lib/utils";
import { formatAverage, markColor, type BranchStat, type MarkCount, type QuestionStat } from "@/lib/reports/rating";

/** Legend for the low → high rating colours. Always shown next to coloured marks. */
export function MarkLegend({ marks, maxScore }: { marks: MarkCount[]; maxScore: number }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Rating colours">
      {[...marks].reverse().map((m) => (
        <li key={m.score} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: markColor(m.score, maxScore) }} aria-hidden />
          Rating {m.score}
        </li>
      ))}
    </ul>
  );
}

/** One horizontal bar per rating (highest first); count + share at the tip, tooltip on hover. */
export function MarkDistributionChart({ marks, maxScore }: { marks: MarkCount[]; maxScore: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const total = marks.reduce((s, m) => s + m.count, 0);
  const peak = Math.max(1, ...marks.map((m) => m.count));
  return (
    <div className="space-y-2" role="list" aria-label="Number of times each rating was given">
      {marks.map((m) => {
        const pct = total ? (m.count / total) * 100 : 0;
        return (
          <div
            key={m.score}
            role="listitem"
            className="relative grid grid-cols-[72px_1fr_96px] items-center gap-3 rounded-md px-1 py-1 hover:bg-muted/60"
            onMouseEnter={() => setHover(m.score)}
            onMouseLeave={() => setHover(null)}
          >
            <span className="text-sm font-medium">Rating {m.score}</span>
            <div className="h-5 rounded bg-muted/70">
              <div
                className="h-5 rounded-r transition-[width]"
                style={{ width: `${(m.count / peak) * 100}%`, minWidth: m.count ? 4 : 0, background: markColor(m.score, maxScore) }}
              />
            </div>
            <span className="text-right text-sm tabular-nums">
              {formatNumber(m.count)} <span className="text-muted-foreground">({Math.round(pct)}%)</span>
            </span>
            {hover === m.score && (
              <div role="tooltip" className="pointer-events-none absolute -top-9 left-20 z-10 rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-md">
                <span className="font-medium">Rating {m.score}</span>: {formatNumber(m.count)} of {formatNumber(total)} ratings ({pct.toFixed(1)}%)
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Average rating per branch on a shared 0→max scale; value at the bar tip. */
export function BranchAverageChart({ branches, maxScore }: { branches: BranchStat[]; maxScore: number }) {
  const [hover, setHover] = useState<string | null>(null);
  const sorted = [...branches].sort((a, b) => (b.average ?? 0) - (a.average ?? 0));
  return (
    <div className="space-y-2" role="list" aria-label="Average rating by branch">
      {sorted.map((b) => {
        const key = b.id ?? "none";
        return (
          <div
            key={key}
            role="listitem"
            className="relative grid grid-cols-[minmax(80px,140px)_1fr_56px] items-center gap-3 rounded-md px-1 py-1 hover:bg-muted/60"
            onMouseEnter={() => setHover(key)}
            onMouseLeave={() => setHover(null)}
          >
            <span className="truncate text-sm font-medium" title={b.name}>
              {b.name}
            </span>
            <div className="h-5 rounded bg-muted/70">
              <div className="h-5 rounded-r bg-[#1d5fb6]" style={{ width: `${((b.average ?? 0) / (maxScore || 5)) * 100}%` }} />
            </div>
            <span className="text-right text-sm font-semibold tabular-nums">{formatAverage(b.average)}</span>
            {hover === key && (
              <div role="tooltip" className="pointer-events-none absolute -top-9 left-24 z-10 rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-md">
                <span className="font-medium">{b.name}</span>: average {formatAverage(b.average)} / {maxScore} · {formatNumber(b.ratings)} ratings ·{" "}
                {formatNumber(b.customers)} customers
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** 100% stacked bar of ratings for one question (2px surface gaps between segments). */
export function QuestionMarksBar({ q }: { q: QuestionStat }) {
  const [hover, setHover] = useState<number | null>(null);
  const total = q.customers || 1;
  const parts = [...q.marks].reverse().filter((m) => m.count > 0);
  return (
    <div className="relative">
      <div className="flex h-3.5 w-full gap-[2px] overflow-hidden rounded" aria-hidden>
        {parts.map((m) => (
          <div
            key={m.score}
            className="h-full first:rounded-l last:rounded-r"
            style={{ width: `${(m.count / total) * 100}%`, background: markColor(m.score, q.maxScore), opacity: hover === null || hover === m.score ? 1 : 0.45 }}
            onMouseEnter={() => setHover(m.score)}
            onMouseLeave={() => setHover(null)}
          />
        ))}
      </div>
      {hover !== null && (
        <div role="tooltip" className="pointer-events-none absolute -top-9 left-0 z-10 whitespace-nowrap rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-md">
          Rating {hover}: {formatNumber(q.marks.find((m) => m.score === hover)?.count ?? 0)} customers (
          {Math.round(((q.marks.find((m) => m.score === hover)?.count ?? 0) / total) * 100)}%)
        </div>
      )}
    </div>
  );
}
