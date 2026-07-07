'use client';

import { useMemo } from 'react';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { rp } from '@/lib/utils';

export interface DailyDataPoint {
  date: string; // YYYY-MM-DD
  income: number;
  expense: number;
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  return (
    <div
      className="rounded-lg border p-2.5 text-xs shadow-lg"
      style={{ background: 'var(--surface)', borderColor: 'var(--border-faint)' }}
    >
      <p className="font-semibold mb-1.5" style={{ color: 'var(--text-mid)' }}>
        Hari ke-{d?.day}
      </p>
      {d?.income > 0 && (
        <div className="flex items-center gap-2">
          <span
            className="inline-block w-2 h-2 rounded-sm"
            style={{ background: 'var(--positive)' }}
          />
          <span style={{ color: 'var(--text-dim)' }}>Masuk:</span>
          <span className="num font-medium" style={{ color: 'var(--positive)' }}>
            {rp(d.income, true)}
          </span>
        </div>
      )}
      {d?.expenseRaw > 0 && (
        <div className="flex items-center gap-2">
          <span
            className="inline-block w-2 h-2 rounded-sm"
            style={{ background: 'var(--negative)' }}
          />
          <span style={{ color: 'var(--text-dim)' }}>Keluar:</span>
          <span className="num font-medium" style={{ color: 'var(--negative)' }}>
            {rp(d.expenseRaw, true)}
          </span>
        </div>
      )}
      <div
        className="flex items-center gap-2 mt-1 pt-1"
        style={{ borderTop: '1px solid var(--border-faint)' }}
      >
        <span
          className="inline-block w-3 h-px"
          style={{ background: 'var(--accent-hi)' }}
        />
        <span style={{ color: 'var(--text-dim)' }}>Kumulatif:</span>
        <span className="num font-medium" style={{ color: 'var(--accent-hi)' }}>
          {rp(d.cumulative, true)}
        </span>
      </div>
    </div>
  );
}

export function DailyCumulativeChart({ data }: { data: DailyDataPoint[] }) {
  const chartData = useMemo(() => {
    let cum = 0;
    return data.map((d) => {
      cum += d.income - d.expense;
      return {
        day: new Date(d.date + 'T00:00:00').getDate(),
        income: d.income,
        expense: -d.expense, // negative so bars extend below zero line
        expenseRaw: d.expense,
        cumulative: cum,
      };
    });
  }, [data]);

  if (data.length === 0) {
    return (
      <div
        className="h-44 flex items-center justify-center text-sm"
        style={{ color: 'var(--text-dim)' }}
      >
        Belum ada transaksi bulan ini
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={176}>
      <ComposedChart data={chartData} margin={{ top: 8, right: 40, bottom: 0, left: -24 }}>
        <XAxis
          dataKey="day"
          tick={{ fontSize: 10, fill: 'var(--text-dim)' }}
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          yAxisId="bar"
          tick={{ fontSize: 9, fill: 'var(--text-dim)' }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) =>
            v === 0 ? '0' : `${(Math.abs(v) / 1_000_000).toFixed(1)}jt`
          }
        />
        <YAxis
          yAxisId="line"
          orientation="right"
          tick={{ fontSize: 9, fill: 'var(--accent-hi)' }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => `${(v / 1_000_000).toFixed(1)}jt`}
          width={40}
        />
        <ReferenceLine y={0} yAxisId="bar" stroke="var(--border-faint)" strokeWidth={1} />
        <Tooltip
          content={<CustomTooltip />}
          cursor={{ fill: 'var(--surface-hi)', opacity: 0.4 }}
        />
        <Bar
          dataKey="income"
          yAxisId="bar"
          fill="var(--positive)"
          opacity={0.8}
          radius={[2, 2, 0, 0]}
          maxBarSize={8}
        />
        <Bar
          dataKey="expense"
          yAxisId="bar"
          fill="var(--negative)"
          opacity={0.8}
          radius={[0, 0, 2, 2]}
          maxBarSize={8}
        />
        <Line
          type="monotone"
          dataKey="cumulative"
          yAxisId="line"
          stroke="var(--accent-hi)"
          strokeWidth={1.5}
          dot={false}
          activeDot={{ r: 3, fill: 'var(--accent-hi)' }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
