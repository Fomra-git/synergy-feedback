"use client";

import { useState } from "react";
import { formatNumber } from "@/lib/utils";

const BAR = "#0f766e";
const BAR_HOVER = "#115e59";

function niceMax(v: number): number {
  if (v <= 5) return 5;
  const pow = 10 ** Math.floor(Math.log10(v));
  const n = v / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow;
}

function formatDay(day: string, long = false) {
  const d = new Date(`${day}T00:00:00Z`);
  return new Intl.DateTimeFormat("en-IN", long ? { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" } : { day: "numeric", month: "short", timeZone: "UTC" }).format(d);
}

/** Single-series daily bar chart with hover tooltip and an accessible data table. */
export function TimeSeriesChart({ data, label = "Submissions" }: { data: { day: string; total: number }[]; label?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = niceMax(Math.max(0, ...data.map((d) => d.total)));
  const W = 720;
  const H = 220;
  const pad = { top: 12, right: 8, bottom: 26, left: 36 };
  const innerW = W - pad.left - pad.right;
  const innerH = H - pad.top - pad.bottom;
  const slot = innerW / Math.max(data.length, 1);
  const barW = Math.max(2, Math.min(28, slot - 2));
  const ticks = [0, max / 2, max];
  const labelEvery = Math.ceil(data.length / 8);

  return (
    <figure className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-56 w-full" role="img" aria-label={`${label} per day`} onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => {
          const y = pad.top + innerH - (t / max) * innerH;
          return (
            <g key={t}>
              <line x1={pad.left} x2={W - pad.right} y1={y} y2={y} stroke="#e2e8f0" strokeWidth={1} />
              <text x={pad.left - 6} y={y + 4} textAnchor="end" fontSize="11" fill="#64748b">
                {formatNumber(t)}
              </text>
            </g>
          );
        })}
        {data.map((d, i) => {
          const h = (d.total / max) * innerH;
          const x = pad.left + i * slot + (slot - barW) / 2;
          const y = pad.top + innerH - h;
          const r = Math.min(4, barW / 2, h);
          return (
            <g key={d.day}>
              {/* hit target larger than the mark */}
              <rect x={pad.left + i * slot} y={pad.top} width={slot} height={innerH} fill="transparent" onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} />
              {h > 0 && (
                <path
                  d={`M${x},${pad.top + innerH} V${y + r} Q${x},${y} ${x + r},${y} H${x + barW - r} Q${x + barW},${y} ${x + barW},${y + r} V${pad.top + innerH} Z`}
                  fill={hover === i ? BAR_HOVER : BAR}
                  pointerEvents="none"
                />
              )}
              {i % labelEvery === 0 && (
                <text x={pad.left + i * slot + slot / 2} y={H - 8} textAnchor="middle" fontSize="11" fill="#64748b">
                  {formatDay(d.day)}
                </text>
              )}
            </g>
          );
        })}
        <line x1={pad.left} x2={W - pad.right} y1={pad.top + innerH} y2={pad.top + innerH} stroke="#cbd5e1" />
      </svg>
      {hover !== null && data[hover] && (
        <div
          className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-md"
          style={{ left: `${((pad.left + hover * slot + slot / 2) / W) * 100}%` }}
          role="status"
        >
          <p className="text-muted-foreground">{formatDay(data[hover]!.day, true)}</p>
          <p className="font-semibold text-foreground tabular-nums">
            {formatNumber(data[hover]!.total)} {label.toLowerCase()}
          </p>
        </div>
      )}
      <table className="sr-only">
        <caption>{label} per day</caption>
        <thead>
          <tr>
            <th>Day</th>
            <th>{label}</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.day}>
              <td>{d.day}</td>
              <td>{d.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

/** Ranked horizontal bars (single hue, magnitude). Values printed in text ink. */
export function BarList({ items, empty = "No data for this period." }: { items: { label: string; value: number; href?: string }[]; empty?: string }) {
  if (!items.length) return <p className="py-8 text-center text-sm text-muted-foreground">{empty}</p>;
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.label} className="group" title={`${item.label}: ${formatNumber(item.value)}`}>
          <div className="mb-1 flex items-center justify-between gap-3 text-sm">
            <span className="truncate font-medium">{item.label}</span>
            <span className="text-muted-foreground tabular-nums">{formatNumber(item.value)}</span>
          </div>
          <div className="h-2 rounded-full bg-slate-100">
            <div className="h-2 rounded-full transition-colors group-hover:opacity-90" style={{ width: `${Math.max(2, (item.value / max) * 100)}%`, background: BAR }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
