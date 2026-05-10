// dashboard/src/components/charts/DailySpendingChart.tsx
'use client';

import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { DailySpending } from '@/types';
import dayjs from 'dayjs';
import 'dayjs/locale/id';

dayjs.locale('id');

interface Props {
  data: DailySpending[];
}

function formatAmount(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}jt`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}rb`;
  return String(v);
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const daily = payload.find((p: any) => p.dataKey === 'daily_expense');
  const cumulative = payload.find((p: any) => p.dataKey === 'cumulative_expense');
  return (
    <div className="bg-background border border-border rounded-lg p-3 text-xs shadow-lg">
      <p className="font-medium mb-1">{dayjs(label).format('D MMM YYYY')}</p>
      {daily && (
        <p className="text-red-400">
          Harian: Rp {Number(daily.value).toLocaleString('id-ID')}
        </p>
      )}
      {cumulative && (
        <p className="text-blue-400">
          Kumulatif: Rp {Number(cumulative.value).toLocaleString('id-ID')}
        </p>
      )}
    </div>
  );
}

export default function DailySpendingChart({ data }: Props) {
  if (!data.length) {
    return (
      <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">
        Tidak ada data pengeluaran
      </div>
    );
  }

  // Show only every N-th label to avoid crowding
  const tickInterval = data.length > 20 ? Math.floor(data.length / 10) : data.length > 10 ? 2 : 1;

  return (
    <ResponsiveContainer width="100%" height={220}>
      <ComposedChart data={data} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis
          dataKey="day"
          tickFormatter={(v) => dayjs(v).format('D')}
          interval={tickInterval - 1}
          tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          yAxisId="left"
          tickFormatter={formatAmount}
          tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
          axisLine={false}
          tickLine={false}
          width={40}
        />
        <YAxis
          yAxisId="right"
          orientation="right"
          tickFormatter={formatAmount}
          tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
          axisLine={false}
          tickLine={false}
          width={40}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend
          formatter={(value) =>
            value === 'daily_expense' ? 'Harian' : 'Kumulatif'
          }
          wrapperStyle={{ fontSize: 11 }}
        />
        <Bar
          yAxisId="left"
          dataKey="daily_expense"
          fill="hsl(var(--destructive))"
          opacity={0.7}
          radius={[2, 2, 0, 0]}
        />
        <Line
          yAxisId="right"
          dataKey="cumulative_expense"
          stroke="hsl(var(--primary))"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
