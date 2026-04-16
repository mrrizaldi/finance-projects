import { unstable_cache } from 'next/cache';
import { createServerClient } from '@/lib/supabase';
import { formatRupiah, startOfMonth, endOfMonth } from '@/lib/utils';
import { Summary, MonthlyTrend, CategoryBreakdown, VTransaction } from '@/types';
import CashflowChart from '@/components/charts/CashflowChart';
import CategoryChart from '@/components/charts/CategoryChart';
import TransactionRow from '@/components/transactions/TransactionRow';
import { cn } from '@/lib/utils';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export const revalidate = 60; // Revalidate every minute

const getOverviewData = unstable_cache(
  async () => {
    const supabase = createServerClient();
    const now = new Date();
    const start = startOfMonth(now);
    const end = endOfMonth(now);

    const [summaryRes, trendRes, categoryRes, txRes] = await Promise.all([
      supabase.rpc('get_summary', { p_start_date: start, p_end_date: end }),
      supabase.rpc('get_monthly_trend', { p_months: 6 }),
      supabase.rpc('get_category_breakdown', { p_start_date: start, p_end_date: end, p_type: 'expense' }),
      supabase
        .from('v_transactions')
        .select(
          'id, type, amount, description, merchant, category_id, account_id, to_account_id, installment_id, source, balance_after, is_adjustment, transaction_date, category_name, category_color, account_name, to_account_name, installment_name'
        )
        .order('transaction_date', { ascending: false })
        .limit(10),
    ]);

    return {
      summary: (summaryRes.data?.[0] ?? null) as Summary | null,
      trend: (trendRes.data ?? []) as MonthlyTrend[],
      categories: (categoryRes.data ?? []) as CategoryBreakdown[],
      transactions: (txRes.data ?? []) as VTransaction[],
    };
  },
  ['overview-data'],
  { revalidate: 60, tags: ['overview', 'analytics', 'chat-context'] }
);

function StatCard({
  title,
  value,
  sub,
  positive,
  tone,
}: {
  title: string;
  value: string;
  sub?: string;
  positive?: boolean;
  tone: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex-1 min-w-0">
          <p className={cn('text-xs font-medium uppercase tracking-wide', tone)}>{title}</p>
          <p className="text-xl font-bold text-foreground mt-0.5 truncate">{value}</p>
          {sub && (
            <p className={cn('text-xs mt-1', positive === true ? 'text-emerald-600' : positive === false ? 'text-red-500' : 'text-muted-foreground')}>
              {sub}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default async function OverviewPage() {
  const { summary, trend, categories, transactions } = await getOverviewData();

  const income = summary?.total_income ?? 0;
  const expense = summary?.total_expense ?? 0;
  const net = income - expense;

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Overview</h1>
        <p className="text-muted-foreground text-sm mt-1">Ringkasan keuangan bulan ini</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <StatCard
          title="Total Pemasukan"
          value={formatRupiah(income)}
          sub={`${summary?.transaction_count ?? 0} transaksi bulan ini`}
          tone="text-emerald-600"
        />
        <StatCard
          title="Total Pengeluaran"
          value={formatRupiah(expense)}
          sub={`Terbesar: ${summary?.top_expense_category ?? '-'}`}
          tone="text-red-500"
        />
        <StatCard
          title="Net Cashflow"
          value={formatRupiah(Math.abs(net))}
          sub={net >= 0 ? 'Surplus bulan ini' : 'Defisit bulan ini'}
          positive={net >= 0}
          tone={net >= 0 ? 'text-blue-600' : 'text-orange-500'}
        />
      </div>

      {/* Quick stats footer */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="px-4 py-3">
              <p className="text-xs text-muted-foreground">Avg. harian</p>
              <p className="text-sm font-semibold text-foreground mt-0.5">
                {formatRupiah(summary.avg_daily_expense)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="px-4 py-3">
              <p className="text-xs text-muted-foreground">Kategori terbesar</p>
              <p className="text-sm font-semibold text-foreground mt-0.5">
                {summary.top_expense_category || '–'}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="px-4 py-3">
              <p className="text-xs text-muted-foreground">Pengeluaran top</p>
              <p className="text-sm font-semibold text-foreground mt-0.5">
                {formatRupiah(summary.top_expense_amount)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="px-4 py-3">
              <p className="text-xs text-muted-foreground">Total transaksi</p>
              <p className="text-sm font-semibold text-foreground mt-0.5">
                {summary.transaction_count}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        {/* Cashflow Chart */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-muted-foreground">Cashflow 6 Bulan Terakhir</CardTitle>
          </CardHeader>
          <CardContent>
            <CashflowChart data={trend} />
          </CardContent>
        </Card>

        {/* Category Pie */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-muted-foreground">Pengeluaran per Kategori</CardTitle>
          </CardHeader>
          <CardContent>
            <CategoryChart data={categories} />
          </CardContent>
        </Card>
      </div>

      {/* Recent Transactions */}
      <Card>
        <div className="px-4 py-4 border-b border-border flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Transaksi Terbaru</h2>
          <a href="/transactions" className="text-xs text-blue-600 hover:underline">
            Lihat semua
          </a>
        </div>
        {transactions.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground text-sm">
            Belum ada transaksi
          </div>
        ) : (
          <div>
            {transactions.map((tx) => (
              <TransactionRow key={tx.id} tx={tx} />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
