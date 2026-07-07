import { createAuthServerClient } from '@/lib/supabase-server';
import { rp } from '@/lib/utils';
import { Summary, CategoryBreakdown, VTransaction } from '@/types';
import { DailyCumulativeChart, DailyDataPoint } from '@/components/charts/DailyCumulativeChart';
import { HomeHeader } from '@/components/home/HomeHeader';
import { AiInsightWidget } from '@/components/home/AiInsightWidget';
import { QuickAddCard } from '@/components/home/QuickAddCard';
import TransactionRow from '@/components/transactions/TransactionRow';
import Link from 'next/link';
import type { ReactNode } from 'react';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import 'dayjs/locale/id';

dayjs.locale('id');

export const dynamic = 'force-dynamic';

// --- Types ---

interface AccountRow {
  id: string;
  name: string;
  balance: number;
  is_active: boolean;
  type: string;
  color: string | null;
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
      supabase.from('accounts').select('id, name, balance, is_active, type, color').eq('is_active', true).order('balance', { ascending: false }),
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
        .limit(10),
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

function buildDailyData(transactions: MonthTx[], startDate: Dayjs, endDate: Dayjs): DailyDataPoint[] {
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
  const today = dayjs();
  const cap = today.isBefore(endDate) ? today : endDate;
  let cursor = startDate;

  while (!cursor.isAfter(cap)) {
    const dateStr = cursor.format('YYYY-MM-DD');
    result.push({ date: dateStr, ...(map.get(dateStr) ?? { income: 0, expense: 0 }) });
    cursor = cursor.add(1, 'day');
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
    .slice(0, 5);
}

// --- Sub-components ---


function SummaryStatsSection({ summary }: { summary: Summary | null }) {
  if (!summary) return null;
  const net = summary.net_cashflow;
  const issurplus = net >= 0;

  const cards = [
    {
      label: 'Avg. harian',
      value: rp(summary.avg_daily_expense, true),
      sub: 'rata-rata pengeluaran',
    },
    {
      label: 'Kategori terbesar',
      value: summary.top_expense_category || '—',
      sub: rp(summary.top_expense_amount, true),
    },
    {
      label: 'Net cashflow',
      value: rp(Math.abs(net), true),
      sub: issurplus ? 'Surplus' : 'Defisit',
      subColor: issurplus ? 'var(--positive)' : 'var(--negative)',
    },
    {
      label: 'Total transaksi',
      value: String(summary.transaction_count),
      sub: 'transaksi bulan ini',
    },
  ];

  return (
    <div className="grid grid-cols-4 gap-2">
      {cards.map(({ label, value, sub, subColor }) => (
        <div
          key={label}
          className="rounded-xl border px-3 py-2.5"
          style={{ background: 'var(--surface)', borderColor: 'var(--border-faint)' }}
        >
          <p className="text-xs mb-0.5" style={{ color: 'var(--text-dim)' }}>{label}</p>
          <p className="text-sm font-bold num truncate" style={{ color: 'var(--text-mid)' }}>{value}</p>
          {sub && (
            <p className="text-xs mt-0.5 truncate" style={{ color: subColor ?? 'var(--text-dim)' }}>{sub}</p>
          )}
        </div>
      ))}
    </div>
  );
}

function SectionCard({
  children,
  className = '',
}: {
  children: ReactNode;
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

const ACCOUNT_TYPE_LABEL: Record<string, string> = {
  bank: 'Bank',
  ewallet: 'E-Wallet',
  cash: 'Tunai',
  marketplace: 'Marketplace',
  other: 'Lainnya',
};

function BalanceSummaryCard({
  netWorth,
  accounts,
  income,
  expense,
  net,
}: {
  netWorth: number;
  accounts: AccountRow[];
  income: number;
  expense: number;
  net: number;
}) {
  const prevBalance = netWorth - net;
  const changePct = prevBalance !== 0 ? (net / Math.abs(prevBalance)) * 100 : 0;
  const savingsRate = income > 0 ? (net / income) * 100 : 0;
  const total = income + expense;
  const incomePct = total > 0 ? (income / total) * 100 : 50;

  return (
    <SectionCard>
      <div className="grid grid-cols-1 md:grid-cols-[3fr_2fr]">
        {/* Left: Net worth */}
        <div className="p-4 md:border-r flex flex-col" style={{ borderColor: 'var(--border-faint)' }}>
          {/* Top */}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="label-up">Total Saldo Bersih</span>
              <span
                className="text-xs font-medium px-2 py-0.5 rounded-full"
                style={{ background: 'var(--surface-hi)', color: 'var(--text-dim)' }}
              >
                {accounts.length} akun
              </span>
            </div>
            <p className="num text-3xl font-bold mb-2" style={{ color: 'var(--text-hi)' }}>
              {rp(netWorth)}
            </p>
            {net !== 0 && (
              <div className="flex items-center gap-1.5 text-xs font-medium mb-4">
                <span
                  className="px-1.5 py-0.5 rounded-full text-xs font-semibold"
                  style={{
                    background: net >= 0 ? 'var(--positive-soft)' : 'var(--negative-soft)',
                    color: net >= 0 ? 'var(--positive)' : 'var(--negative)',
                  }}
                >
                  {net >= 0 ? '+' : ''}{changePct.toFixed(1)}%
                </span>
                <span style={{ color: 'var(--text-dim)' }}>
                  {net >= 0 ? '+' : ''}{rp(net, true)} sejak bulan lalu
                </span>
              </div>
            )}
          </div>

          {/* Middle: income vs expense split bar */}
          {total > 0 && (
            <div className="flex-1 flex flex-col justify-center py-2">
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span style={{ color: 'var(--positive)' }}>↑ {rp(income, true)}</span>
                <span className="text-xs" style={{ color: 'var(--text-dim)' }}>
                  {savingsRate >= 0 ? 'Savings' : 'Overspend'} {Math.abs(savingsRate).toFixed(0)}%
                </span>
                <span style={{ color: 'var(--negative)' }}>↓ {rp(expense, true)}</span>
              </div>
              <div className="h-2 rounded-full overflow-hidden flex" style={{ background: 'var(--surface-hi)' }}>
                <div
                  className="h-full rounded-l-full transition-all"
                  style={{ width: `${incomePct}%`, background: 'var(--positive)', opacity: 0.8 }}
                />
                <div
                  className="h-full rounded-r-full transition-all"
                  style={{ width: `${100 - incomePct}%`, background: 'var(--negative)', opacity: 0.8 }}
                />
              </div>
            </div>
          )}

          {/* Bottom: stats row */}
          <div
            className="grid grid-cols-4 gap-2 pt-3"
            style={{ borderTop: '1px solid var(--border-faint)' }}
          >
            {[
              { label: 'TOTAL PEMASUKAN', value: income, color: 'var(--positive)' },
              { label: 'TOTAL PENGELUARAN', value: expense, color: 'var(--negative)' },
              { label: 'NET CASHFLOW', value: net, color: net >= 0 ? 'var(--positive)' : 'var(--negative)' },
              { label: 'SAVINGS RATE', custom: `${savingsRate.toFixed(1)}%`, color: savingsRate >= 0 ? 'var(--positive)' : 'var(--negative)' },
            ].map(({ label, value, custom, color }) => (
              <div key={label}>
                <p className="label-up text-[9px] mb-0.5 leading-tight">{label}</p>
                <p className="num text-sm font-bold" style={{ color }}>
                  {custom ?? rp(value!, true)}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Per-account list */}
        <div className="p-4">
          <p className="label-up mb-3">Saldo Per Akun</p>
          <div className="space-y-2.5">
            {accounts.map((acc) => {
              const isNegative = acc.balance < 0;
              return (
                <div key={acc.id} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="flex-shrink-0 w-2.5 h-2.5 rounded-full"
                      style={{ background: acc.color ?? 'var(--text-dim)' }}
                    />
                    <span
                      className="text-xs font-medium truncate"
                      style={{ color: 'var(--text-mid)' }}
                    >
                      {acc.name}
                    </span>
                    <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-dim)' }}>
                      {ACCOUNT_TYPE_LABEL[acc.type] ?? acc.type}
                    </span>
                  </div>
                  <span
                    className="num text-xs font-medium flex-shrink-0"
                    style={{ color: isNegative ? 'var(--negative)' : 'var(--text-mid)' }}
                  >
                    {isNegative ? '-' : ''}{rp(Math.abs(acc.balance), false)}
                  </span>
                </div>
              );
            })}
          </div>
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

function BudgetSnapshotCard({ items, month }: { items: CategoryWithBudget[]; month: string }) {
  const monthLabel = dayjs(`${month}-01`).format('MMMM YYYY');
  return (
    <SectionCard className="p-4">
      <div className="flex items-center justify-between mb-0.5">
        <p className="text-sm font-semibold" style={{ color: 'var(--text-mid)' }}>Budget Bulan Ini</p>
        <Link href="/budget" className="text-xs font-medium flex items-center gap-0.5" style={{ color: 'var(--text-dim)' }}>
          Detail →
        </Link>
      </div>
      <p className="text-xs mb-3" style={{ color: 'var(--text-dim)' }}>
        Konsumsi vs cap · {monthLabel}
      </p>
      {items.length === 0 ? (
        <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
          Belum ada pengeluaran bulan ini.
        </p>
      ) : (
        <div className="space-y-3">
          {(() => {
            const maxSpent = Math.max(...items.map((i) => i.spent), 1);
            return items.map((item) => {
            const hasLimit = item.budget_monthly != null && item.budget_monthly > 0;
            const rawPct = hasLimit
              ? (item.spent / item.budget_monthly!) * 100
              : (item.spent / maxSpent) * 100;
            const barPct = Math.min(rawPct, 100);
            const isOver = hasLimit && item.spent > item.budget_monthly!;
            const barColor = item.color ?? 'var(--accent-hi)';

            return (
              <div key={item.id}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span
                      className="flex-shrink-0 w-2 h-2 rounded-full"
                      style={{ background: item.color ?? 'var(--text-dim)' }}
                    />
                    <span
                      className="text-xs font-medium truncate"
                      style={{ color: 'var(--text-mid)' }}
                    >
                      {item.name}
                    </span>
                  </div>
                  <span className="num text-xs flex-shrink-0 ml-2" style={{ color: isOver ? 'var(--negative)' : 'var(--text-mute)' }}>
                    {rp(item.spent, true)}
                    {hasLimit && (
                      <span style={{ color: 'var(--text-dim)' }}> / {rp(item.budget_monthly!, true)}</span>
                    )}
                  </span>
                </div>
                <div
                  className="h-1.5 rounded-full overflow-hidden"
                  style={{ background: 'var(--surface-hi)' }}
                >
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${barPct}%`,
                      background: isOver ? 'var(--negative)' : barColor,
                    }}
                  />
                </div>
              </div>
            );
          });
          })()}
        </div>
      )}
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

  const dailyData = buildDailyData(monthlyTx, startDate, endDate);
  const budgetSnapshot = buildBudgetSnapshot(budgetCategories, categoryBreakdown);

  const hasOverrun = budgetSnapshot.some(
    (i) => i.budget_monthly != null && i.spent > i.budget_monthly
  );

  return (
    <div className="p-4 sm:p-6 min-h-screen" style={{ background: 'var(--bg)' }}>
      {/* Header */}
      <HomeHeader month={month} />

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left column */}
        <div className="lg:col-span-8 space-y-4">
          <BalanceSummaryCard
            netWorth={netWorth}
            accounts={accounts}
            income={income}
            expense={expense}
            net={net}
          />
          <SummaryStatsSection summary={summary} />
          <DailyChartCard dailyData={dailyData} />
          <RecentTransactionsCard transactions={recentTx} />
        </div>

        {/* Right column */}
        <div className="lg:col-span-4 space-y-4">
          <QuickAddCard />
          <BudgetSnapshotCard items={budgetSnapshot} month={month} />
          <AiInsightWidget month={month} hasOverrun={hasOverrun} />
        </div>
      </div>
    </div>
  );
}
