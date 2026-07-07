'use client';

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { CategoryBreakdown } from '@/types';
import { formatRupiah } from '@/lib/utils';

interface Props {
  data: CategoryBreakdown[];
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const item = payload[0].payload as CategoryBreakdown;
  return (
    <div className="rounded-lg p-3 text-xs shadow-xl" style={{ background: 'var(--surface)', border: '1px solid var(--border-faint)', color: 'var(--text-hi)', opacity: 1 }}>
      <p className="font-medium text-foreground">{item.category_name}</p>
      <p className="text-muted-foreground mt-1">{formatRupiah(item.total_amount)}</p>
      <p className="text-muted-foreground/80">
        {Number(item.percentage).toFixed(1)}% · {item.transaction_count} transaksi
      </p>
    </div>
  );
}

export default function CategoryChart({ data }: Props) {
  if (!data.length) {
    return (
      <div className="h-[210px] flex items-center justify-center text-xs text-muted-foreground">
        Belum ada data
      </div>
    );
  }

  const top = data[0];

  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={210}>
        <PieChart>
          <Pie
            data={data.slice(0, 10)}
            cx="50%"
            cy="50%"
            innerRadius={62}
            outerRadius={92}
            dataKey="total_amount"
            nameKey="category_name"
            strokeWidth={0}
            paddingAngle={1}
          >
            {data.slice(0, 10).map((entry, index) => (
              <Cell
                key={entry.category_id}
                fill={entry.category_color || `hsl(${index * 36}, 65%, 55%)`}
              />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
        </PieChart>
      </ResponsiveContainer>
      {/* Center label */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none gap-0">
        <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text-dim)' }}>
          {data.length} kategori
        </span>
        <span className="num text-lg font-bold leading-tight" style={{ color: 'var(--text-hi)' }}>
          {Number(top.percentage).toFixed(0)}%
        </span>
        <span
          className="text-[10px] text-center px-2 leading-tight truncate max-w-[90px]"
          style={{ color: 'var(--text-dim)' }}
        >
          {top.category_name}
        </span>
      </div>
    </div>
  );
}
