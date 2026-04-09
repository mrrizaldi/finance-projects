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
} from 'recharts';
import { MonthlyTrend } from '@/types';
import { formatRupiah } from '@/lib/utils';

interface Props {
  data: MonthlyTrend[];
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover border border-border rounded-lg shadow-lg p-3 text-sm text-popover-foreground">
      <p className="font-medium text-foreground mb-2">{label}</p>
      {payload.map((entry: any) => (
        <div key={entry.name} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: entry.color }} />
          <span className="text-muted-foreground">{entry.name}:</span>
          <span className="font-medium" style={{ color: entry.color }}>
            {formatRupiah(entry.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function CashflowChart({ data }: Props) {
  if (!data.length) {
    return (
      <div className="h-64 flex items-center justify-center text-gray-400 text-sm">
        Belum ada data transaksi
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis
          dataKey="month"
          tick={{ fontSize: 12, fill: '#6b7280' }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: '#6b7280' }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => `${(v / 1000000).toFixed(1)}jt`}
          width={45}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend
          wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
          formatter={(value) => (value === 'income' ? 'Pemasukan' : value === 'expense' ? 'Pengeluaran' : 'Net')}
        />
        <Line
          type="monotone"
          dataKey="income"
          stroke="#10b981"
          strokeWidth={2}
          dot={{ fill: '#10b981', r: 3 }}
          activeDot={{ r: 5 }}
        />
        <Line
          type="monotone"
          dataKey="expense"
          stroke="#ef4444"
          strokeWidth={2}
          dot={{ fill: '#ef4444', r: 3 }}
          activeDot={{ r: 5 }}
        />
        <Line
          type="monotone"
          dataKey="net"
          stroke="#6366f1"
          strokeWidth={2}
          strokeDasharray="4 2"
          dot={{ fill: '#6366f1', r: 3 }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
