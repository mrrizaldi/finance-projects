import { Suspense } from 'react';
import { createAuthServerClient } from '@/lib/supabase-server';
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

export const dynamic = 'force-dynamic';

type Period = 'week' | 'month' | 'quarter' | 'year';

interface Props {
  searchParams: {
    period?: string;
    anchor?: string;
  };
}

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

async function loadAnalyticsData(
  start: string,
  end: string,
  prevStart: string,
  prevEnd: string,
  trendMonths: number
) {
  const supabase = await createAuthServerClient();

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
    expCategories: (expCatRes.data ?? []) as CategoryBreakdown[],
    incCategories: (incCatRes.data ?? []) as CategoryBreakdown[],
    trend: (trendRes.data ?? []) as MonthlyTrend[],
    heatmap: (heatmapRes.data ?? []) as HeatmapEntry[],
    comparison: (compRes.data?.[0] ?? null) as PeriodComparison | null,
    dailySpending: (dailyRes.data ?? []) as DailySpending[],
    topTransactions: (topTxRes.data ?? []) as TopTransaction[],
  };
}

export default async function AnalyticsPage({ searchParams }: Props) {
  const period = (['week', 'month', 'quarter', 'year'].includes(searchParams.period || '')
    ? searchParams.period
    : 'month') as Period;

  const anchor = searchParams.anchor || dayjs().startOf('month').format('YYYY-MM-DD');
  const { start, end, prevStart, prevEnd, label, trendMonths } = getPeriodBounds(period, anchor);

  const { expCategories, incCategories, trend, heatmap, comparison, dailySpending, topTransactions } =
    await loadAnalyticsData(start, end, prevStart, prevEnd, trendMonths);

  const totalExpense = expCategories.reduce((s, c) => s + Number(c.total_amount), 0);
  const totalIncome = incCategories.reduce((s, c) => s + Number(c.total_amount), 0);

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Analitik</h1>
        <p className="text-muted-foreground text-sm mt-1">Visualisasi pola keuangan kamu</p>
      </div>

      {/* Period switcher */}
      <div className="mb-6">
        <Suspense fallback={null}>
          <AnalyticsPeriodSwitcher period={period} anchor={anchor} label={label} />
        </Suspense>
      </div>

      {/* Summary stats with period comparison */}
      {comparison && (
        <AnalyticsSummaryPanel comparison={comparison} period={period} />
      )}

      {/* Category donut charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-muted-foreground">
                Pengeluaran per Kategori
              </CardTitle>
              <span className="text-sm font-medium text-red-400">{formatRupiah(totalExpense)}</span>
            </div>
          </CardHeader>
          <CardContent>
            <CategoryChart data={expCategories} />
            <CategoryListClient categories={expCategories} start={start} end={end} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-muted-foreground">
                Pemasukan per Kategori
              </CardTitle>
              <span className="text-sm font-medium text-emerald-400">
                {formatRupiah(totalIncome)}
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <CategoryChart data={incCategories} />
            <CategoryListClient categories={incCategories} start={start} end={end} />
          </CardContent>
        </Card>
      </div>

      {/* Daily spending chart */}
      <Card className="mb-6">
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

      {/* Monthly trend */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-muted-foreground">
            Tren Bulanan ({trendMonths} Bulan)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <MonthlyBarChart data={trend} />
        </CardContent>
      </Card>

      {/* Top 5 transactions */}
      <Card className="mb-6">
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

      {/* Heatmap */}
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
  );
}
