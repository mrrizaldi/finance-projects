// dashboard/src/components/analytics/AnalyticsSummaryPanel.tsx
import { PeriodComparison } from '@/types';
import { formatRupiah } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

type Period = 'week' | 'month' | 'quarter' | 'year';

const PERIOD_LABEL: Record<Period, string> = {
  week: 'vs minggu lalu',
  month: 'vs bulan lalu',
  quarter: 'vs kuartal lalu',
  year: 'vs tahun lalu',
};

function calcDeltaPct(curr: number, prev: number): number | null {
  if (prev === 0) return null;
  return ((curr - prev) / Math.abs(prev)) * 100;
}

function DeltaBadge({ delta, invert = false }: { delta: number | null; invert?: boolean }) {
  if (delta === null) return <span className="text-xs text-muted-foreground">–</span>;
  const abs = Math.abs(delta);
  const neutral = abs < 0.5;
  // "good" means improvement: for invert=true (expense), lower is good
  const good = neutral ? null : invert ? delta < 0 : delta > 0;
  return (
    <span
      className={cn(
        'text-xs font-medium flex items-center gap-0.5',
        neutral
          ? 'text-muted-foreground'
          : good
          ? 'text-emerald-500'
          : 'text-red-500'
      )}
    >
      {neutral ? (
        <Minus size={10} />
      ) : delta > 0 ? (
        <TrendingUp size={10} />
      ) : (
        <TrendingDown size={10} />
      )}
      {abs.toFixed(1)}%
    </span>
  );
}

interface Props {
  comparison: PeriodComparison;
  period: Period;
}

export default function AnalyticsSummaryPanel({ comparison, period }: Props) {
  const {
    curr_income, curr_expense, curr_net, curr_tx_count, curr_avg_daily,
    prev_income, prev_expense, prev_net, prev_tx_count, prev_avg_daily,
  } = comparison;

  const currSavings = curr_income > 0 ? ((curr_income - curr_expense) / curr_income) * 100 : 0;
  const prevSavings = prev_income > 0 ? ((prev_income - prev_expense) / prev_income) * 100 : 0;
  const savingsDelta = currSavings - prevSavings; // absolute pp difference

  const periodLabel = PERIOD_LABEL[period];

  const metrics: {
    title: string;
    value: string;
    delta: number | null;
    invert: boolean;
    tone: string;
  }[] = [
    {
      title: 'Total Pemasukan',
      value: formatRupiah(curr_income),
      delta: calcDeltaPct(curr_income, prev_income),
      invert: false,
      tone: 'text-emerald-600',
    },
    {
      title: 'Total Pengeluaran',
      value: formatRupiah(curr_expense),
      delta: calcDeltaPct(curr_expense, prev_expense),
      invert: true,
      tone: 'text-red-500',
    },
    {
      title: 'Net Cashflow',
      value: formatRupiah(curr_net),
      delta: calcDeltaPct(curr_net, prev_net),
      invert: false,
      tone: curr_net >= 0 ? 'text-blue-600' : 'text-orange-500',
    },
    {
      title: 'Savings Rate',
      value: `${currSavings.toFixed(1)}%`,
      delta: Math.abs(savingsDelta) < 0.5 ? 0 : savingsDelta,
      invert: false,
      tone: 'text-purple-600',
    },
    {
      title: 'Rata-rata Harian',
      value: formatRupiah(curr_avg_daily),
      delta: calcDeltaPct(curr_avg_daily, prev_avg_daily),
      invert: true,
      tone: 'text-yellow-600',
    },
    {
      title: 'Total Transaksi',
      value: String(curr_tx_count),
      delta: calcDeltaPct(curr_tx_count, prev_tx_count),
      invert: false,
      tone: 'text-muted-foreground',
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
      {metrics.map((m) => (
        <Card key={m.title}>
          <CardContent className="p-4">
            <p className={cn('text-xs font-medium uppercase tracking-wide truncate', m.tone)}>
              {m.title}
            </p>
            <p className="text-lg font-bold text-foreground mt-0.5 truncate">{m.value}</p>
            <div className="flex items-center gap-1 mt-1">
              <DeltaBadge delta={m.delta} invert={m.invert} />
              <span className="text-xs text-muted-foreground">{periodLabel}</span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
