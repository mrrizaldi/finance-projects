'use client';

import { useMemo } from 'react';
import { rp } from '@/lib/utils';

export interface DailyDataPoint {
  date: string; // YYYY-MM-DD
  income: number;
  expense: number;
}

export function DailyCumulativeChart({ data }: { data: DailyDataPoint[] }) {
  const W = 600;
  const H = 160;
  const PAD = { top: 14, right: 52, bottom: 20, left: 4 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const midY = PAD.top + innerH / 2;

  const { barMax, cumData, minCum, maxCum } = useMemo(() => {
    let cum = 0;
    const cumData = data.map((d) => {
      cum += d.income - d.expense;
      return { ...d, cum };
    });
    const barMax = Math.max(...data.map((d) => Math.max(d.income, d.expense)), 1);
    const minCum = Math.min(...cumData.map((d) => d.cum), 0);
    const maxCum = Math.max(...cumData.map((d) => d.cum), 1);
    return { barMax, cumData, minCum, maxCum };
  }, [data]);

  if (data.length === 0) {
    return (
      <div className="h-40 flex items-center justify-center text-sm" style={{ color: 'var(--text-dim)' }}>
        Belum ada transaksi bulan ini
      </div>
    );
  }

  const n = data.length;
  const slotW = innerW / n;
  const barW = Math.max(2, slotW - 2);
  const xOf = (i: number) => PAD.left + (i + 0.5) * slotW;

  // Bar scale: half of innerH for each direction, 85% fill
  const barScale = (v: number) => (v / barMax) * (innerH / 2) * 0.85;

  // Cumulative line scale: full innerH
  const cumRange = Math.max(maxCum - minCum, 1);
  const cumY = (v: number) => PAD.top + innerH - ((v - minCum) / cumRange) * innerH;

  // Build SVG line path
  const linePath = cumData
    .map((d, i) => `${i === 0 ? 'M' : 'L'} ${xOf(i).toFixed(1)} ${cumY(d.cum).toFixed(1)}`)
    .join(' ');

  // X-axis label indices (evenly spaced, always include last)
  const labelIndices = Array.from(new Set([
    0,
    Math.round(n * 0.25),
    Math.round(n * 0.5),
    Math.round(n * 0.75),
    n - 1,
  ])).filter((i) => i < n);

  const lastPoint = cumData[cumData.length - 1];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      style={{ height: '160px', display: 'block' }}
      aria-label="Arus kas harian"
    >
      {/* Zero midline */}
      <line
        x1={PAD.left}
        y1={midY}
        x2={W - PAD.right}
        y2={midY}
        stroke="var(--border-faint)"
        strokeWidth={1}
      />

      {/* Bars */}
      {data.map((d, i) => {
        const x = xOf(i) - barW / 2;
        const incH = barScale(d.income);
        const expH = barScale(d.expense);
        return (
          <g key={d.date}>
            {d.income > 0 && (
              <rect
                x={x}
                y={midY - incH}
                width={barW}
                height={incH}
                fill="var(--positive)"
                opacity={0.75}
                rx={1}
              />
            )}
            {d.expense > 0 && (
              <rect
                x={x}
                y={midY}
                width={barW}
                height={expH}
                fill="var(--negative)"
                opacity={0.75}
                rx={1}
              />
            )}
          </g>
        );
      })}

      {/* Cumulative line */}
      <path d={linePath} fill="none" stroke="var(--accent-hi)" strokeWidth={1.5} strokeLinejoin="round" />

      {/* Last point dot */}
      <circle
        cx={xOf(n - 1)}
        cy={cumY(lastPoint.cum)}
        r={3}
        fill="var(--accent-hi)"
      />

      {/* Right-axis label: last cumulative value */}
      <text
        x={W - PAD.right + 4}
        y={cumY(lastPoint.cum) + 4}
        fontSize={9}
        fill="var(--accent-hi)"
        fontFamily="var(--font-geist-mono)"
      >
        {rp(lastPoint.cum, true)}
      </text>

      {/* X-axis day labels */}
      {labelIndices.map((i) => (
        <text
          key={i}
          x={xOf(i)}
          y={H - 2}
          textAnchor="middle"
          fontSize={9}
          fill="var(--text-dim)"
        >
          {new Date(data[i].date + 'T00:00:00').getDate()}
        </text>
      ))}
    </svg>
  );
}
