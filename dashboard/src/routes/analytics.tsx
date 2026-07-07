import { useLoaderData } from 'react-router';
import type { ClientLoaderFunctionArgs } from 'react-router';
import { getBrowserClient } from '@/lib/supabase';
import {
  CategoryBreakdown,
  MonthlyTrend,
  HeatmapEntry,
  PeriodComparison,
  DailySpending,
  TopTransaction,
} from '@/types';
import { formatRupiah } from '@/lib/utils';
import CategoryChart from '@/components/charts/CategoryChart';
import MonthlyBarChart from '@/components/charts/MonthlyBarChart';
import HeatmapChart from '@/components/charts/HeatmapChart';
import DailySpendingChart from '@/components/charts/DailySpendingChart';
import AnalyticsSummaryPanel from '@/components/analytics/AnalyticsSummaryPanel';
import TopTransactionsList from '@/components/analytics/TopTransactionsList';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import AnalyticsPeriodSwitcher from '@/components/analytics/AnalyticsPeriodSwitcher';
import CategoryListClient from '@/components/analytics/CategoryListClient';
import dayjs from 'dayjs';
import quarterOfYear from 'dayjs/plugin/quarterOfYear';
import 'dayjs/locale/id';

dayjs.extend(quarterOfYear);
dayjs.locale('id');

type Period = 'week' | 'month' | 'quarter' | 'year';

function getPeriodBounds(
  period: Period,
  anchor: string
): {
  start: string;
  end: string;
  prevStart: string;
  prevEnd: string;
  label: string;
  trendMonths: number;
} {
  const d = dayjs(anchor);
  switch (period) {
    case 'week': {
      const start = d.startOf('week');
      const end = d.endOf('week');
      return {
        start: start.format('YYYY-MM-DD'),
        end: end.format('YYYY-MM-DD'),
        prevStart: start.subtract(1, 'week').format('YYYY-MM-DD'),
        prevEnd: end.subtract(1, 'week').format('YYYY-MM-DD'),
        label: `${start.format('D MMM')} – ${end.format('D MMM YYYY')}`,
        trendMonths: 8,
      };
    }
    case 'quarter': {
      const start = d.startOf('quarter');
      const end = d.endOf('quarter');
      return {
        start: start.format('YYYY-MM-DD'),
        end: end.format('YYYY-MM-DD'),
        prevStart: start.subtract(1, 'quarter').format('YYYY-MM-DD'),
        prevEnd: end.subtract(1, 'quarter').format('YYYY-MM-DD'),
        label: `Q${d.quarter()} ${d.year()}`,
        trendMonths: 12,
      };
    }
    case 'year': {
      const start = d.startOf('year');
      const end = d.endOf('year');
      return {
        start: start.format('YYYY-MM-DD'),
        end: end.format('YYYY-MM-DD'),
        prevStart: start.subtract(1, 'year').format('YYYY-MM-DD'),
        prevEnd: end.subtract(1, 'year').format('YYYY-MM-DD'),
        label: `${d.year()}`,
        trendMonths: 24,
      };
    }
    default: {
      const start = d.startOf('month');
      const end = d.endOf('month');
      return {
        start: start.format('YYYY-MM-DD'),
        end: end.format('YYYY-MM-DD'),
        prevStart: start.subtract(1, 'month').format('YYYY-MM-DD'),
        prevEnd: end.subtract(1, 'month').format('YYYY-MM-DD'),
        label: start.format('MMMM YYYY'),
        trendMonths: 12,
      };
    }
  }
}

export async function clientLoader({ request }: ClientLoaderFunctionArgs) {
  const url = new URL(request.url);
  const sp = url.searchParams;

  const period = (['week', 'month', 'quarter', 'year'].includes(sp.get('period') || '')
    ? sp.get('period')
    : 'month') as Period;

  const anchor = sp.get('anchor') || dayjs().startOf('month').format('YYYY-MM-DD');
  const { start, end, prevStart, prevEnd, label, trendMonths } = getPeriodBounds(period, anchor);

  const supabase = getBrowserClient();

  const [expCatRes, incCatRes, trendRes, heatmapRes, compRes, dailyRes, topTxRes] =
    await Promise.all([
      supabase.rpc('get_category_breakdown', {
        p_start_date: start,
        p_end_date: end,
        p_type: 'expense',
      }),
      supabase.rpc('get_category_breakdown', {
        p_start_date: start,
        p_end_date: end,
        p_type: 'income',
      }),
      supabase.rpc('get_monthly_trend', { p_months: trendMonths }),
      supabase.rpc('get_expense_heatmap', { p_start_date: start, p_end_date: end }),
      supabase.rpc('get_period_comparison', {
        p_start: start,
        p_end: end,
        p_prev_start: prevStart,
        p_prev_end: prevEnd,
      }),
      supabase.rpc('get_daily_spending', { p_start: start, p_end: end }),
      supabase.rpc('get_top_transactions', { p_start: start, p_end: end, p_limit: 5 }),
    ]);

  return {
    period,
    anchor,
    label,
    trendMonths,
    expCategories: (expCatRes.data ?? []) as CategoryBreakdown[],
    incCategories: (incCatRes.data ?? []) as CategoryBreakdown[],
    trend: (trendRes.data ?? []) as MonthlyTrend[],
    heatmap: (heatmapRes.data ?? []) as HeatmapEntry[],
    comparison: (compRes.data?.[0] ?? null) as PeriodComparison | null,
    dailySpending: (dailyRes.data ?? []) as DailySpending[],
    topTransactions: (topTxRes.data ?? []) as TopTransaction[],
  };
}

export default function AnalyticsPage() {
  const {
    period, anchor, label, trendMonths,
    expCategories, incCategories, trend, heatmap,
    comparison, dailySpending, topTransactions,
  } = useLoaderData<typeof clientLoader>();

  const totalExpense = expCategories.reduce((s, c) => s + Number(c.total_amount), 0);
  const totalIncome = incCategories.reduce((s, c) => s + Number(c.total_amount), 0);

  // Re-derive start/end for CategoryListClient (needed for drill-down links)
  const { start, end } = getPeriodBounds(period, anchor);

  return (
    <div className="p-4 sm:p-6 min-h-screen" style={{ background: 'var(--bg)' }}>
      <AnalyticsPeriodSwitcher period={period} anchor={anchor} label={label} />

      {comparison && (
        <AnalyticsSummaryPanel comparison={comparison} trend={trend} period={period} />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <Card>
          <div className="flex gap-4 p-5">
            <div className="flex flex-col w-[220px] flex-shrink-0">
              <p className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text-dim)' }}>
                Pengeluaran per Kategori
              </p>
              <p className="num text-xl font-bold mt-1 leading-tight" style={{ color: 'var(--negative)' }}>
                {formatRupiah(totalExpense)}
              </p>
              <div className="mt-1">
                <CategoryChart data={expCategories} />
              </div>
            </div>
            <div className="w-px self-stretch" style={{ background: 'var(--border-faint)' }} />
            <div className="flex-1 min-w-0">
              <CategoryListClient categories={expCategories} start={start} end={end} />
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex gap-4 p-5">
            <div className="flex flex-col w-[220px] flex-shrink-0">
              <p className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text-dim)' }}>
                Pemasukan per Kategori
              </p>
              <p className="num text-xl font-bold mt-1 leading-tight" style={{ color: 'var(--positive)' }}>
                {formatRupiah(totalIncome)}
              </p>
              <div className="mt-1">
                <CategoryChart data={incCategories} />
              </div>
            </div>
            <div className="w-px self-stretch" style={{ background: 'var(--border-faint)' }} />
            <div className="flex-1 min-w-0">
              <CategoryListClient categories={incCategories} start={start} end={end} />
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-muted-foreground">
              Pengeluaran Harian &amp; Kumulatif
            </CardTitle>
            <p className="text-xs text-muted-foreground">{label}</p>
          </CardHeader>
          <CardContent>
            <DailySpendingChart data={dailySpending} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-muted-foreground">
              Tren Bulanan ({trendMonths} Bulan)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <MonthlyBarChart data={trend} />
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-muted-foreground">
              5 Pengeluaran Terbesar
            </CardTitle>
            <p className="text-xs text-muted-foreground">{label}</p>
          </CardHeader>
          <CardContent>
            <TopTransactionsList transactions={topTransactions} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-muted-foreground">
              Heatmap Pengeluaran
            </CardTitle>
            <p className="text-xs text-muted-foreground">{label} — hari × jam</p>
          </CardHeader>
          <CardContent>
            <HeatmapChart data={heatmap} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
