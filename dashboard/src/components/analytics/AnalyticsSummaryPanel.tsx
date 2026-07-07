'use client';

import { PeriodComparison, MonthlyTrend } from '@/types';
import { formatRupiah } from '@/lib/utils';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

type Period = 'week' | 'month' | 'quarter' | 'year';

const PERIOD_LABEL: Record<Period, string> = {
  week: 'minggu lalu',
  month: 'bulan lalu',
  quarter: 'kuartal lalu',
  year: 'tahun lalu',
};

function calcDeltaPct(curr: number, prev: number): number | null {
  if (prev === 0) return null;
  return ((curr - prev) / Math.abs(prev)) * 100;
}

function Sparkline({
  data,
  color,
  gradientId,
}: {
  data: number[];
  color: string;
  gradientId: string;
}) {
  const points = data.map((v) => ({ v }));
  if (points.length < 2) return <div className="h-10" />;
  return (
    <ResponsiveContainer width="100%" height={40}>
      <AreaChart data={points} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.18} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="v"
          stroke={color}
          strokeWidth={1.5}
          fill={`url(#${gradientId})`}
          dot={false}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function DeltaBadge({
  delta,
  invert = false,
}: {
  delta: number | null;
  invert?: boolean;
}) {
  if (delta === null) return <span className="text-xs" style={{ color: 'var(--text-dim)' }}>–</span>;
  const abs = Math.abs(delta);
  const neutral = abs < 0.5;
  const good = neutral ? null : invert ? delta < 0 : delta > 0;

  const color = neutral
    ? 'var(--text-dim)'
    : good
    ? 'var(--positive)'
    : 'var(--negative)';

  const bg = neutral
    ? 'var(--surface-hi)'
    : good
    ? 'var(--positive-soft)'
    : 'var(--negative-soft)';

  return (
    <span
      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs font-semibold"
      style={{ color, background: bg }}
    >
      {neutral ? (
        <Minus size={9} />
      ) : delta > 0 ? (
        <TrendingUp size={9} />
      ) : (
        <TrendingDown size={9} />
      )}
      <span className="num">{neutral ? '~' : `${delta > 0 ? '+' : ''}${delta.toFixed(1)}%`}</span>
    </span>
  );
}

interface CardDef {
  id: string;
  title: string;
  value: string;
  delta: number | null;
  invert: boolean;
  color: string;
  sparkData: number[];
  note?: string;
}

interface Props {
  comparison: PeriodComparison;
  trend: MonthlyTrend[];
  period: Period;
}

export default function AnalyticsSummaryPanel({ comparison, trend, period }: Props) {
  const {
    curr_income,
    curr_expense,
    curr_net,
    curr_tx_count,
    curr_avg_daily,
    prev_income,
    prev_expense,
    prev_net,
    prev_tx_count,
    prev_avg_daily,
  } = comparison;

  const currSavings =
    curr_income > 0 ? ((curr_income - curr_expense) / curr_income) * 100 : 0;
  const prevSavings =
    prev_income > 0 ? ((prev_income - prev_expense) / prev_income) * 100 : 0;
  const savingsDelta = currSavings - prevSavings;

  // Use last 10 months of trend data for sparklines
  const recent = trend.slice(-10);

  const cards: CardDef[] = [
    {
      id: 'income',
      title: 'Total Pemasukan',
      value: formatRupiah(curr_income),
      delta: calcDeltaPct(curr_income, prev_income),
      invert: false,
      color: 'var(--positive)',
      sparkData: recent.map((t) => t.income),
    },
    {
      id: 'expense',
      title: 'Total Pengeluaran',
      value: formatRupiah(curr_expense),
      delta: calcDeltaPct(curr_expense, prev_expense),
      invert: true,
      color: 'var(--negative)',
      sparkData: recent.map((t) => t.expense),
    },
    {
      id: 'net',
      title: 'Net Cashflow',
      value: curr_net >= 0 ? formatRupiah(curr_net) : `-${formatRupiah(Math.abs(curr_net))}`,
      delta: calcDeltaPct(curr_net, prev_net),
      invert: false,
      color: curr_net >= 0 ? 'var(--positive)' : 'var(--negative)',
      sparkData: recent.map((t) => t.net),
    },
    {
      id: 'savings',
      title: 'Savings Rate',
      value: `${currSavings >= 0 ? '' : ''}${currSavings.toFixed(1)}%`,
      delta: Math.abs(savingsDelta) < 0.5 ? 0 : savingsDelta,
      invert: false,
      color: currSavings >= 0 ? 'var(--positive)' : 'var(--negative)',
      sparkData: recent.map((t) =>
        t.income > 0 ? ((t.income - t.expense) / t.income) * 100 : 0
      ),
    },
    {
      id: 'avg',
      title: 'Rata-rata Harian',
      value: formatRupiah(curr_avg_daily),
      delta: calcDeltaPct(curr_avg_daily, prev_avg_daily),
      invert: true,
      color: 'var(--negative)',
      sparkData: recent.map((t) => t.expense),
    },
    {
      id: 'txcount',
      title: 'Total Transaksi',
      value: String(curr_tx_count),
      delta: calcDeltaPct(curr_tx_count, prev_tx_count),
      invert: false,
      color: 'var(--info)',
      sparkData: recent.map((t) => t.income + t.expense),
    },
  ];

  const periodLabel = PERIOD_LABEL[period];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
      {cards.map((card) => (
        <div
          key={card.id}
          className="rounded-xl p-4 flex flex-col gap-0"
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border-faint)',
          }}
        >
          {/* Label */}
          <p
            className="label-up mb-2"
            style={{ color: 'var(--text-dim)' }}
          >
            {card.title}
          </p>

          {/* Value */}
          <p
            className="num text-lg font-bold leading-tight truncate"
            style={{ color: card.color }}
          >
            {card.value}
          </p>

          {/* Sparkline */}
          <div className="my-2 -mx-1">
            <Sparkline
              data={card.sparkData}
              color={card.color}
              gradientId={`spark-grad-${card.id}`}
            />
          </div>

          {/* Delta + period */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs" style={{ color: 'var(--text-dim)' }}>
              vs
            </span>
            <DeltaBadge delta={card.delta} invert={card.invert} />
            <span className="text-xs" style={{ color: 'var(--text-dim)' }}>
              {periodLabel}
            </span>
          </div>

          {card.note && (
            <p className="text-xs mt-1" style={{ color: 'var(--text-dim)' }}>
              {card.note}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
