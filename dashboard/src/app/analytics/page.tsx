import { createServerClient } from '@/lib/supabase';
import { CategoryBreakdown, MonthlyTrend, HeatmapEntry } from '@/types';
import { startOfMonth, endOfMonth, formatRupiah } from '@/lib/utils';
import CategoryChart from '@/components/charts/CategoryChart';
import MonthlyBarChart from '@/components/charts/MonthlyBarChart';
import HeatmapChart from '@/components/charts/HeatmapChart';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export const revalidate = 60;

async function getAnalyticsData() {
  const supabase = createServerClient();
  const now = new Date();
  const start = startOfMonth(now);
  const end = endOfMonth(now);

  const [expCatRes, incCatRes, trendRes, heatmapRes] = await Promise.all([
    supabase.rpc('get_category_breakdown', { p_start_date: start, p_end_date: end, p_type: 'expense' }),
    supabase.rpc('get_category_breakdown', { p_start_date: start, p_end_date: end, p_type: 'income' }),
    supabase.rpc('get_monthly_trend', { p_months: 12 }),
    supabase.rpc('get_expense_heatmap', {
      p_start_date: new Date(Date.now() - 30 * 86400 * 1000).toISOString(),
      p_end_date: new Date().toISOString(),
    }),
  ]);

  return {
    expCategories: (expCatRes.data ?? []) as CategoryBreakdown[],
    incCategories: (incCatRes.data ?? []) as CategoryBreakdown[],
    trend: (trendRes.data ?? []) as MonthlyTrend[],
    heatmap: (heatmapRes.data ?? []) as HeatmapEntry[],
  };
}

export default async function AnalyticsPage() {
  const { expCategories, incCategories, trend, heatmap } = await getAnalyticsData();

  const totalExpense = expCategories.reduce((s, c) => s + Number(c.total_amount), 0);
  const totalIncome = incCategories.reduce((s, c) => s + Number(c.total_amount), 0);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Analitik</h1>
        <p className="text-muted-foreground text-sm mt-1">Visualisasi pola keuangan kamu</p>
      </div>

      {/* Category donut charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-muted-foreground">Pengeluaran per Kategori</CardTitle>
              <span className="text-sm font-medium text-red-500">{formatRupiah(totalExpense)}</span>
            </div>
          </CardHeader>
          <CardContent>
            <CategoryChart data={expCategories} />
            {/* Top breakdown list */}
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
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-muted-foreground">Pemasukan per Kategori</CardTitle>
              <span className="text-sm font-medium text-emerald-600">{formatRupiah(totalIncome)}</span>
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
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Monthly bar chart */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-muted-foreground">Perbandingan Bulanan (12 Bulan)</CardTitle>
        </CardHeader>
        <CardContent>
          <MonthlyBarChart data={trend} />
        </CardContent>
      </Card>

      {/* Heatmap */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-muted-foreground">Heatmap Pengeluaran</CardTitle>
          <p className="text-xs text-muted-foreground">30 hari terakhir — hari × jam</p>
        </CardHeader>
        <CardContent>
          <HeatmapChart data={heatmap} />
        </CardContent>
      </Card>
    </div>
  );
}
