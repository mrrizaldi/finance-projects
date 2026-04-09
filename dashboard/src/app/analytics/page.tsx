import { Suspense } from 'react';
import { createServerClient } from '@/lib/supabase';
import { CategoryBreakdown, MonthlyTrend, HeatmapEntry } from '@/types';
import { formatRupiah } from '@/lib/utils';
import CategoryChart from '@/components/charts/CategoryChart';
import MonthlyBarChart from '@/components/charts/MonthlyBarChart';
import HeatmapChart from '@/components/charts/HeatmapChart';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import AnalyticsPeriodSwitcher from '@/components/analytics/AnalyticsPeriodSwitcher';
import dayjs from 'dayjs';
import quarterOfYear from 'dayjs/plugin/quarterOfYear';
import 'dayjs/locale/id';

dayjs.extend(quarterOfYear);
dayjs.locale('id');

export const revalidate = 0;

type Period = 'week' | 'month' | 'quarter' | 'year';

interface Props {
  searchParams: {
    period?: string;
    anchor?: string;
  };
}

function getPeriodBounds(period: Period, anchor: string): { start: string; end: string; label: string; trendMonths: number } {
  const d = dayjs(anchor);
  switch (period) {
    case 'week': {
      const start = d.startOf('week');
      const end = d.endOf('week');
      return {
        start: start.toISOString(),
        end: end.toISOString(),
        label: `${start.format('D MMM')} – ${end.format('D MMM YYYY')}`,
        trendMonths: 8,
      };
    }
    case 'quarter': {
      const start = d.startOf('quarter');
      const end = d.endOf('quarter');
      return {
        start: start.toISOString(),
        end: end.toISOString(),
        label: `Q${d.quarter()} ${d.year()}`,
        trendMonths: 12,
      };
    }
    case 'year': {
      const start = d.startOf('year');
      const end = d.endOf('year');
      return {
        start: start.toISOString(),
        end: end.toISOString(),
        label: `${d.year()}`,
        trendMonths: 24,
      };
    }
    default: {
      const start = d.startOf('month');
      const end = d.endOf('month');
      return {
        start: start.toISOString(),
        end: end.toISOString(),
        label: start.format('MMMM YYYY'),
        trendMonths: 12,
      };
    }
  }
}

async function getAnalyticsData(period: Period, start: string, end: string, trendMonths: number) {
  const supabase = createServerClient();

  const [expCatRes, incCatRes, trendRes, heatmapRes] = await Promise.all([
    supabase.rpc('get_category_breakdown', { p_start_date: start, p_end_date: end, p_type: 'expense' }),
    supabase.rpc('get_category_breakdown', { p_start_date: start, p_end_date: end, p_type: 'income' }),
    supabase.rpc('get_monthly_trend', { p_months: trendMonths }),
    supabase.rpc('get_expense_heatmap', {
      p_start_date: start,
      p_end_date: end,
    }),
  ]);

  return {
    expCategories: (expCatRes.data ?? []) as CategoryBreakdown[],
    incCategories: (incCatRes.data ?? []) as CategoryBreakdown[],
    trend: (trendRes.data ?? []) as MonthlyTrend[],
    heatmap: (heatmapRes.data ?? []) as HeatmapEntry[],
  };
}

export default async function AnalyticsPage({ searchParams }: Props) {
  const period = (['week', 'month', 'quarter', 'year'].includes(searchParams.period || '')
    ? searchParams.period
    : 'month') as Period;

  const anchor = searchParams.anchor || dayjs().startOf('month').toISOString();
  const { start, end, label, trendMonths } = getPeriodBounds(period, anchor);

  const { expCategories, incCategories, trend, heatmap } = await getAnalyticsData(period, start, end, trendMonths);

  const totalExpense = expCategories.reduce((s, c) => s + Number(c.total_amount), 0);
  const totalIncome = incCategories.reduce((s, c) => s + Number(c.total_amount), 0);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-foreground">Analitik</h1>
        <p className="text-muted-foreground text-sm mt-1">Visualisasi pola keuangan kamu</p>
      </div>

      {/* Period switcher */}
      <div className="mb-6">
        <Suspense fallback={null}>
          <AnalyticsPeriodSwitcher period={period} anchor={anchor} label={label} />
        </Suspense>
      </div>

      {/* Category donut charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-muted-foreground">Pengeluaran per Kategori</CardTitle>
              <span className="text-sm font-medium text-red-400">{formatRupiah(totalExpense)}</span>
            </div>
          </CardHeader>
          <CardContent>
            <CategoryChart data={expCategories} />
            <div className="mt-4 space-y-2">
              {expCategories.slice(0, 5).map((cat) => (
                <div key={cat.category_id} className="flex items-center gap-2">
                  <div
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ background: cat.category_color || '#6b7280' }}
                  />
                  <span className="text-xs text-muted-foreground flex-1 truncate">
                    {cat.category_icon} {cat.category_name}
                  </span>
                  <span className="text-xs font-medium text-foreground">{formatRupiah(cat.total_amount)}</span>
                  <span className="text-xs text-muted-foreground w-10 text-right">{cat.percentage}%</span>
                </div>
              ))}
              {expCategories.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">Tidak ada data pengeluaran</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-muted-foreground">Pemasukan per Kategori</CardTitle>
              <span className="text-sm font-medium text-emerald-400">{formatRupiah(totalIncome)}</span>
            </div>
          </CardHeader>
          <CardContent>
            <CategoryChart data={incCategories} />
            <div className="mt-4 space-y-2">
              {incCategories.slice(0, 5).map((cat) => (
                <div key={cat.category_id} className="flex items-center gap-2">
                  <div
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ background: cat.category_color || '#6b7280' }}
                  />
                  <span className="text-xs text-muted-foreground flex-1 truncate">
                    {cat.category_icon} {cat.category_name}
                  </span>
                  <span className="text-xs font-medium text-foreground">{formatRupiah(cat.total_amount)}</span>
                  <span className="text-xs text-muted-foreground w-10 text-right">{cat.percentage}%</span>
                </div>
              ))}
              {incCategories.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">Tidak ada data pemasukan</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Monthly bar chart */}
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

      {/* Heatmap */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-muted-foreground">Heatmap Pengeluaran</CardTitle>
          <p className="text-xs text-muted-foreground">{label} — hari × jam</p>
        </CardHeader>
        <CardContent>
          <HeatmapChart data={heatmap} />
        </CardContent>
      </Card>
    </div>
  );
}
