'use client';

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { SavingsRateTrend } from '@/types';

interface Props {
  data: SavingsRateTrend[];
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover border border-border rounded-lg shadow-lg p-3 text-sm text-popover-foreground">
      <p className="font-medium text-foreground mb-2">{label}</p>
      {payload.map((entry: any) => (
        <div key={entry.name} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: entry.color }} />
          <span className="text-muted-foreground">
            {entry.name === 'cashflow_rate' ? 'Savings rate' : 'Rate investasi'}:
          </span>
          <span className="font-medium">{entry.value}%</span>
        </div>
      ))}
    </div>
  );
}

export default function SavingsRateChart({ data }: Props) {
  if (!data.length) {
    return (
      <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
        Belum ada data bulanan
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 4, right: 8, left: 4, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-faint)" vertical={false} />
        <XAxis
          dataKey="month"
          tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))', fontFamily: 'var(--font-geist-mono)' }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))', fontFamily: 'var(--font-geist-mono)' }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => `${v}%`}
          width={36}
        />
        <ReferenceLine y={0} stroke="var(--border-faint)" />
        <Tooltip content={<CustomTooltip />} />
        <Legend
          wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
          formatter={(value) => (value === 'cashflow_rate' ? 'Savings rate' : 'Rate investasi')}
        />
        <Line
          type="monotone"
          dataKey="cashflow_rate"
          stroke="oklch(var(--chart-1))"
          strokeWidth={2}
          dot={{ r: 3 }}
        />
        <Line
          type="monotone"
          dataKey="investment_rate"
          stroke="oklch(var(--chart-4))"
          strokeWidth={2}
          dot={{ r: 3 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
