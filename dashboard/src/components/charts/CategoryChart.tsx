'use client';

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { CategoryBreakdown } from '@/types';
import { formatRupiah } from '@/lib/utils';

interface Props {
  data: CategoryBreakdown[];
  title?: string;
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const item = payload[0].payload as CategoryBreakdown;
  return (
    <div className="bg-popover border border-border rounded-lg shadow-lg p-3 text-sm text-popover-foreground">
      <p className="font-medium text-foreground">
        {item.category_icon} {item.category_name}
      </p>
      <p className="text-muted-foreground mt-1">{formatRupiah(item.total_amount)}</p>
      <p className="text-muted-foreground/80">{item.percentage}% · {item.transaction_count} transaksi</p>
    </div>
  );
}

function renderCustomLabel({ cx, cy, midAngle, innerRadius, outerRadius, percentage }: any) {
  if (percentage < 5) return null;
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={600}>
      {`${percentage.toFixed(0)}%`}
    </text>
  );
}

export default function CategoryChart({ data }: Props) {
  if (!data.length) {
    return (
      <div className="h-64 flex items-center justify-center text-gray-400 text-sm">
        Belum ada data kategori
      </div>
    );
  }

  const top10 = data.slice(0, 10);

  return (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie
          data={top10}
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={110}
          dataKey="total_amount"
          nameKey="category_name"
          labelLine={false}
          label={renderCustomLabel}
        >
          {top10.map((entry, index) => (
            <Cell key={entry.category_id} fill={entry.category_color || `hsl(${index * 36}, 70%, 55%)`} />
          ))}
        </Pie>
        <Tooltip content={<CustomTooltip />} />
        <Legend
          formatter={(value, entry: any) => `${entry.payload.category_icon} ${value}`}
          wrapperStyle={{ fontSize: 11 }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
