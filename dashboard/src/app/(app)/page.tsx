import { createAuthServerClient } from '@/lib/supabase-server';
import { rp } from '@/lib/utils';
import { Summary, CategoryBreakdown, VTransaction } from '@/types';
import { DailyCumulativeChart, DailyDataPoint } from '@/components/charts/DailyCumulativeChart';
import { DateStepper } from '@/components/home/DateStepper';
import TransactionRow from '@/components/transactions/TransactionRow';
import Link from 'next/link';
import {
  Plus,
  TrendingUp,
  TrendingDown,
  Minus,
  Sparkles,
  Utensils,
  Car,
  MoreHorizontal,
} from 'lucide-react';
import dayjs from 'dayjs';
import 'dayjs/locale/id';

dayjs.locale('id');

export const dynamic = 'force-dynamic';

// --- Types ---

interface AccountRow {
  id: string;
  name: string;
  balance: number;
  is_active: boolean;
}

interface CategoryWithBudget {
  id: string;
  name: string;
  budget_monthly: number | null;
  spent: number;
  color: string | null;
}

interface MonthTx {
  type: string;
  amount: number;
  transaction_date: string;
}

// --- Data fetching ---

async function getHomeData(start: string, end: string) {
  const supabase = await createAuthServerClient();

  const [summaryRes, accountsRes, txMonthRes, categoryRes, budgetCatsRes, recentTxRes] =
    await Promise.all([
      supabase.rpc('get_summary', { p_start_date: start, p_end_date: end }),
      supabase.from('accounts').select('id, name, balance, is_active').eq('is_active', true),
      supabase
        .from('v_transactions')
        .select('type, amount, transaction_date')
        .gte('transaction_date', start)
        .lte('transaction_date', end)
        .neq('type', 'transfer'),
      supabase.rpc('get_category_breakdown', {
        p_start_date: start,
        p_end_date: end,
        p_type: 'expense',
      }),
      supabase
        .from('categories')
        .select('id, name, color, budget_monthly')
        .in('type', ['expense', 'both'])
        .eq('is_active', true)
        .order('sort_order', { ascending: true }),
      supabase
        .from('v_transactions')
        .select(
          'id, type, amount, description, merchant, category_id, account_id, to_account_id, installment_id, source, balance_after, is_adjustment, transaction_date, category_name, category_color, account_name, to_account_name, installment_name'
        )
        .order('transaction_date', { ascending: false })
        .limit(5),
    ]);

  return {
    summary: (summaryRes.data?.[0] ?? null) as Summary | null,
    accounts: (accountsRes.data ?? []) as AccountRow[],
    monthlyTx: (txMonthRes.data ?? []) as MonthTx[],
    categoryBreakdown: (categoryRes.data ?? []) as CategoryBreakdown[],
    budgetCategories: (budgetCatsRes.data ?? []) as {
      id: string;
      name: string;
      color: string | null;
      budget_monthly: number | null;
    }[],
    recentTx: (recentTxRes.data ?? []) as VTransaction[],
  };
}

// --- Helpers ---

function buildDailyData(transactions: MonthTx[], start: Date, end: Date): DailyDataPoint[] {
  const map = new Map<string, { income: number; expense: number }>();
  for (const tx of transactions) {
    if (tx.type === 'transfer') continue;
    const date = tx.transaction_date.slice(0, 10);
    if (!map.has(date)) map.set(date, { income: 0, expense: 0 });
    const entry = map.get(date)!;
    if (tx.type === 'income') entry.income += Number(tx.amount);
    else if (tx.type === 'expense') entry.expense += Number(tx.amount);
  }

  const result: DailyDataPoint[] = [];
  const cursor = new Date(start);
  const today = new Date();
  const cap = today < end ? today : end;

  while (cursor <= cap) {
    const dateStr = cursor.toISOString().slice(0, 10);
    result.push({ date: dateStr, ...(map.get(dateStr) ?? { income: 0, expense: 0 }) });
    cursor.setDate(cursor.getDate() + 1);
  }
  return result;
}

function buildBudgetSnapshot(
  budgetCategories: {
    id: string;
    name: string;
    color: string | null;
    budget_monthly: number | null;
  }[],
  categoryBreakdown: CategoryBreakdown[]
): CategoryWithBudget[] {
  const spendMap = new Map<string, number>();
  for (const b of categoryBreakdown) {
    spendMap.set(b.category_id, Number(b.total_amount));
  }

  return budgetCategories
    .map((cat) => ({ ...cat, spent: spendMap.get(cat.id) ?? 0 }))
    .filter((cat) => cat.spent > 0 || cat.budget_monthly != null)
    .sort((a, b) => b.spent - a.spent)
    .slice(0, 4);
}

// --- Sub-components ---

function SectionCard({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border ${className}`}
      style={{ background: 'var(--surface)', borderColor: 'var(--border-faint)' }}
    >
      {children}
    </div>
  );
}

function NetWorthHero({
  netWorth,
  income,
  expense,
  net,
  month,
}: {
  netWorth: number;
  income: number;
  expense: number;
  net: number;
  month: string;
}) {
  const monthLabel = dayjs(`${month}-01`).format('MMMM YYYY');

  return (
    <SectionCard className="p-4">
      <div className="flex items-start justify-between mb-3">
        <span className="label-up">Kekayaan Bersih</span>
        <span className="label-up capitalize">{monthLabel}</span>
      </div>
      <p className="num text-3xl font-bold mb-4" style={{ color: 'var(--text-mid)' }}>
        {rp(netWorth)}
      </p>
      <div
        className="flex items-center gap-3 pt-3 flex-wrap"
        style={{ borderTop: '1px solid var(--border-faint)' }}
      >
        <div
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
          style={{ background: 'var(--positive-soft)', color: 'var(--positive)' }}
        >
          <TrendingUp className="h-3 w-3" />
          <span className="num">{rp(income, true)}</span>
          <span style={{ color: 'var(--text-dim)' }}>masuk</span>
        </div>
        <div
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
          style={{ background: 'var(--negative-soft)', color: 'var(--negative)' }}
        >
          <TrendingDown className="h-3 w-3" />
          <span className="num">{rp(expense, true)}</span>
          <span style={{ color: 'var(--text-dim)' }}>keluar</span>
        </div>
        <div
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
          style={{
            background: net >= 0 ? 'var(--positive-soft)' : 'var(--negative-soft)',
            color: net >= 0 ? 'var(--positive)' : 'var(--negative)',
          }}
        >
          <Minus className="h-3 w-3" />
          <span className="num">{rp(net, true)}</span>
          <span style={{ color: 'var(--text-dim)' }}>net</span>
        </div>
      </div>
    </SectionCard>
  );
}

function DailyChartCard({ dailyData }: { dailyData: DailyDataPoint[] }) {
  return (
    <SectionCard className="p-4">
      <p className="label-up mb-3">Arus Kas Harian</p>
      <DailyCumulativeChart data={dailyData} />
      <div className="flex items-center gap-4 mt-2">
        <div className="flex items-center gap-1.5">
          <span
            className="inline-block w-2.5 h-2 rounded-sm"
            style={{ background: 'var(--positive)', opacity: 0.75 }}
          />
          <span className="text-xs" style={{ color: 'var(--text-dim)' }}>
            Pemasukan
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className="inline-block w-2.5 h-2 rounded-sm"
            style={{ background: 'var(--negative)', opacity: 0.75 }}
          />
          <span className="text-xs" style={{ color: 'var(--text-dim)' }}>
            Pengeluaran
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className="inline-block w-6 h-px"
            style={{ background: 'var(--accent-hi)' }}
          />
          <span className="text-xs" style={{ color: 'var(--text-dim)' }}>
            Kumulatif
          </span>
        </div>
      </div>
    </SectionCard>
  );
}

function RecentTransactionsCard({ transactions }: { transactions: VTransaction[] }) {
  return (
    <SectionCard>
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: '1px solid var(--border-faint)' }}
      >
        <span className="text-sm font-semibold" style={{ color: 'var(--text-mid)' }}>
          Transaksi Terbaru
        </span>
        <Link
          href="/transactions"
          className="text-xs font-medium"
          style={{ color: 'var(--accent-hi)' }}
        >
          Lihat semua →
        </Link>
      </div>
      {transactions.length === 0 ? (
        <div className="py-10 text-center text-sm" style={{ color: 'var(--text-dim)' }}>
          Belum ada transaksi
        </div>
      ) : (
        <div>
          {transactions.map((tx) => (
            <TransactionRow key={tx.id} tx={tx} />
          ))}
        </div>
      )}
    </SectionCard>
  );
}

function QuickAddCard() {
  return (
    <SectionCard className="p-4">
      <p className="label-up mb-3">Tambah Cepat</p>
      <Link href="/add">
        <button
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold text-white mb-3 transition-opacity hover:opacity-90"
          style={{ background: 'var(--accent-hi)' }}
        >
          <Plus className="h-4 w-4" />
          Tambah Transaksi
        </button>
      </Link>
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Makan', icon: Utensils, href: '/add?type=expense' },
          { label: 'Transport', icon: Car, href: '/add?type=expense' },
          { label: 'Lainnya', icon: MoreHorizontal, href: '/add' },
        ].map(({ label, icon: Icon, href }) => (
          <Link key={label} href={href}>
            <div
              className="w-full flex flex-col items-center gap-1 py-2 rounded-lg text-xs font-medium cursor-pointer"
              style={{ background: 'var(--surface-2)', color: 'var(--text-mute)' }}
            >
              <Icon className="h-4 w-4" />
              {label}
            </div>
          </Link>
        ))}
      </div>
    </SectionCard>
  );
}

function BudgetSnapshotCard({ items }: { items: CategoryWithBudget[] }) {
  return (
    <SectionCard className="p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="label-up">Budget Bulan Ini</p>
        <Link href="/budget" className="text-xs font-medium" style={{ color: 'var(--accent-hi)' }}>
          Atur →
        </Link>
      </div>
      {items.length === 0 ? (
        <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
          Belum ada pengeluaran bulan ini.
        </p>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const hasLimit = item.budget_monthly != null && item.budget_monthly > 0;
            const pct = hasLimit ? Math.min((item.spent / item.budget_monthly!) * 100, 100) : null;
            const isOver = hasLimit && item.spent > item.budget_monthly!;

            return (
              <div key={item.id}>
                <div className="flex items-center justify-between mb-1">
                  <span
                    className="text-xs font-medium truncate max-w-[60%]"
                    style={{ color: 'var(--text-mid)' }}
                  >
                    {item.name}
                  </span>
                  <span
                    className="num text-xs"
                    style={{ color: isOver ? 'var(--negative)' : 'var(--text-mute)' }}
                  >
                    {rp(item.spent, true)}
                    {hasLimit && (
                      <span style={{ color: 'var(--text-dim)' }}>
                        {' '}
                        / {rp(item.budget_monthly!, true)}
                      </span>
                    )}
                  </span>
                </div>
                {hasLimit && (
                  <div
                    className="h-1.5 rounded-full overflow-hidden"
                    style={{ background: 'var(--surface-hi)' }}
                  >
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${pct}%`,
                        background:
                          isOver
                            ? 'var(--negative)'
                            : (pct ?? 0) > 80
                              ? 'var(--warn)'
                              : 'var(--positive)',
                      }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}

function AiInsightCard() {
  return (
    <SectionCard className="p-4">
      <div className="flex items-center gap-2 mb-2">
        <Sparkles className="h-4 w-4" style={{ color: 'var(--accent-hi)' }} />
        <p className="text-sm font-semibold" style={{ color: 'var(--text-mid)' }}>
          AI Insight
        </p>
      </div>
      <p className="text-xs leading-relaxed mb-3" style={{ color: 'var(--text-mute)' }}>
        Aktifkan AI Insights untuk mendapatkan analisis otomatis pengeluaran kamu setiap bulan.
      </p>
      <Link href="/insights">
        <button
          className="w-full py-2 rounded-lg text-xs font-semibold transition-colors"
          style={{ background: 'var(--accent-soft)', color: 'var(--accent-hi)' }}
        >
          Lihat Insights
        </button>
      </Link>
    </SectionCard>
  );
}

// --- Page ---

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const params = await searchParams;
  const monthParam = params.month;
  const month =
    monthParam && /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : dayjs().format('YYYY-MM');

  const startDate = dayjs(`${month}-01`).startOf('month');
  const endDate = dayjs(`${month}-01`).endOf('month');
  const start = startDate.toISOString();
  const end = endDate.toISOString();

  const { summary, accounts, monthlyTx, categoryBreakdown, budgetCategories, recentTx } =
    await getHomeData(start, end);

  const netWorth = accounts.reduce((sum, acc) => sum + Number(acc.balance ?? 0), 0);
  const income = summary?.total_income ?? 0;
  const expense = summary?.total_expense ?? 0;
  const net = income - expense;

  const dailyData = buildDailyData(monthlyTx, startDate.toDate(), endDate.toDate());
  const budgetSnapshot = buildBudgetSnapshot(budgetCategories, categoryBreakdown);

  return (
    <div className="p-4 sm:p-6 min-h-screen" style={{ background: 'var(--bg)' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <DateStepper month={month} />
        <Link href="/add">
          <button
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{ background: 'var(--accent-hi)' }}
          >
            <Plus className="h-3.5 w-3.5" />
            Tambah
          </button>
        </Link>
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left column */}
        <div className="lg:col-span-8 space-y-4">
          <NetWorthHero
            netWorth={netWorth}
            income={income}
            expense={expense}
            net={net}
            month={month}
          />
          <DailyChartCard dailyData={dailyData} />
          <RecentTransactionsCard transactions={recentTx} />
        </div>

        {/* Right column */}
        <div className="lg:col-span-4 space-y-4">
          <QuickAddCard />
          <BudgetSnapshotCard items={budgetSnapshot} />
          <AiInsightCard />
        </div>
      </div>
    </div>
  );
}
