import { Suspense } from 'react';
import { createAuthServerClient } from '@/lib/supabase-server';
import { VTransaction, Category, Account, Installment } from '@/types';
import TransactionListClient from '@/components/transactions/TransactionListClient';
import TransactionFilters from './TransactionFilters';
import TransactionPageHeader from './TransactionPageHeader';
import TransactionSidebar, { CategoryStat, AccountStat } from './TransactionSidebar';
import { formatRupiah } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import dayjs from 'dayjs';
import 'dayjs/locale/id';

dayjs.locale('id');

export const revalidate = 60;

const PAGE_SIZE = 25;
const TX_LIST_COLUMNS = [
  'id', 'type', 'amount', 'description', 'merchant',
  'category_id', 'account_id', 'to_account_id', 'installment_id',
  'source', 'balance_before', 'balance_after',
  'to_balance_before', 'to_balance_after',
  'is_adjustment', 'adjustment_note',
  'transaction_date', 'created_at', 'updated_at',
  'category_name', 'category_color', 'account_name', 'to_account_name', 'installment_name',
].join(', ');

interface Props {
  searchParams: {
    page?: string;
    type?: string;
    category?: string;
    account?: string;
    search?: string;
    start?: string;
    end?: string;
    sort?: string;
    min_amount?: string;
    max_amount?: string;
  };
}

async function getTransactionReferences() {
  const supabase = await createAuthServerClient();
  const [catRes, accRes, instRes] = await Promise.all([
    supabase.from('categories').select('id, name, type, color, budget_monthly, sort_order, is_active').eq('is_active', true).order('sort_order'),
    supabase.from('accounts').select('id, name, type, balance, is_active').eq('is_active', true).order('name'),
    supabase.from('installments').select('id, name, monthly_amount, status').eq('status', 'active').order('name'),
  ]);
  return {
    categories: (catRes.data ?? []) as Category[],
    accounts: (accRes.data ?? []) as Account[],
    installments: (instRes.data ?? []) as Pick<Installment, 'id' | 'name' | 'monthly_amount' | 'status'>[],
  };
}

async function getData(searchParams: Props['searchParams']) {
  const supabase = await createAuthServerClient();
  const page = Math.max(1, parseInt(searchParams.page || '1'));
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE;

  let query = supabase.from('v_transactions').select(TX_LIST_COLUMNS);

  if (searchParams.type) query = query.eq('type', searchParams.type);
  if (searchParams.category) query = query.eq('category_id', searchParams.category);
  if (searchParams.account) query = query.or(`account_id.eq.${searchParams.account},to_account_id.eq.${searchParams.account}`);
  if (searchParams.search) query = query.or(`description.ilike.%${searchParams.search}%,merchant.ilike.%${searchParams.search}%`);
  const effectiveStart = searchParams.start || dayjs().startOf('month').format('YYYY-MM-DD');
  const effectiveEnd = searchParams.end || dayjs().endOf('month').format('YYYY-MM-DD');
  query = query.gte('transaction_date', `${effectiveStart}T00:00:00`);
  query = query.lte('transaction_date', `${effectiveEnd}T23:59:59`);
  if (searchParams.min_amount) query = query.gte('amount', Number(searchParams.min_amount));
  if (searchParams.max_amount) query = query.lte('amount', Number(searchParams.max_amount));

  const sort = searchParams.sort || 'date_desc';
  switch (sort) {
    case 'date_asc': query = query.order('transaction_date', { ascending: true }); break;
    case 'amount_desc': query = query.order('amount', { ascending: false }); break;
    case 'amount_asc': query = query.order('amount', { ascending: true }); break;
    default: query = query.order('transaction_date', { ascending: false });
  }

  query = query.range(from, to);

  const [txRes, refs] = await Promise.all([query, getTransactionReferences()]);
  const rows = ((txRes.data ?? []) as unknown[]) as VTransaction[];
  const hasMore = rows.length > PAGE_SIZE;
  const transactions = hasMore ? rows.slice(0, PAGE_SIZE) : rows;

  return { transactions, hasMore, page, ...refs };
}

function computeCategoryStats(transactions: VTransaction[]): CategoryStat[] {
  const map = new Map<string, CategoryStat>();
  const expenses = transactions.filter((t) => t.type === 'expense' && !t.is_adjustment);
  const totalExpense = expenses.reduce((s, t) => s + t.amount, 0);

  for (const tx of expenses) {
    const id = tx.category_id || 'uncategorized';
    const existing = map.get(id);
    if (existing) {
      existing.total += tx.amount;
    } else {
      map.set(id, {
        category_id: id,
        category_name: tx.category_name || 'Tanpa Kategori',
        category_color: tx.category_color || null,
        total: tx.amount,
        percentage: 0,
      });
    }
  }

  return Array.from(map.values())
    .sort((a, b) => b.total - a.total)
    .map((c) => ({ ...c, percentage: totalExpense > 0 ? (c.total / totalExpense) * 100 : 0 }));
}

function computeAccountStats(transactions: VTransaction[], accounts: Account[]): AccountStat[] {
  const map = new Map<string, AccountStat>();
  const expenses = transactions.filter((t) => t.type === 'expense' && !t.is_adjustment);
  const totalExpense = expenses.reduce((s, t) => s + t.amount, 0);
  const accTypeMap = new Map(accounts.map((a) => [a.id, a.type]));

  for (const tx of expenses) {
    const id = tx.account_id || 'unknown';
    const existing = map.get(id);
    if (existing) {
      existing.total += tx.amount;
    } else {
      map.set(id, {
        account_id: id,
        account_name: tx.account_name || 'Tidak diketahui',
        account_type: accTypeMap.get(id) || '',
        total: tx.amount,
        percentage: 0,
      });
    }
  }

  return Array.from(map.values())
    .sort((a, b) => b.total - a.total)
    .map((a) => ({ ...a, percentage: totalExpense > 0 ? (a.total / totalExpense) * 100 : 0 }));
}

function SummaryCard({ label, value, valueColor }: { label: string; value: string; valueColor: string }) {
  return (
    <div
      className="rounded-xl p-4 flex flex-col gap-1"
      style={{ background: 'var(--surface)', border: '1px solid var(--border-faint)' }}
    >
      <p className="label-up">{label}</p>
      <p className="num text-xl font-bold leading-tight" style={{ color: valueColor }}>{value}</p>
    </div>
  );
}

function PaginationLink({ href, children, disabled }: { href: string; children: React.ReactNode; disabled?: boolean }) {
  if (disabled) return (
    <span className="px-3 py-1.5 text-xs text-muted-foreground border border-border rounded-lg cursor-not-allowed flex items-center">
      {children}
    </span>
  );
  return (
    <a href={href} className="px-3 py-1.5 text-xs text-foreground border border-border rounded-lg hover:bg-muted flex items-center transition-colors">
      {children}
    </a>
  );
}

export default async function TransactionsPage({ searchParams }: Props) {
  const { transactions, hasMore, categories, accounts, installments, page } = await getData(searchParams);
  const estimatedTotal = (page - 1) * PAGE_SIZE + transactions.length + (hasMore ? 1 : 0);
  const totalPages = Math.max(page, Math.ceil(estimatedTotal / PAGE_SIZE));

  // Summary totals
  const nonAdj = transactions.filter((t) => !t.is_adjustment);
  const incomeTotal = nonAdj.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expenseTotal = nonAdj.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const net = incomeTotal - expenseTotal;

  // Avg daily: based on period range or fallback to days in current month
  const startParam = searchParams.start;
  const endParam = searchParams.end;
  const anchor = startParam ? dayjs(startParam) : dayjs().startOf('month');
  const periodEnd = endParam ? dayjs(endParam) : anchor.endOf('month');
  const days = Math.max(1, periodEnd.diff(anchor, 'day') + 1);
  const avgDaily = expenseTotal / days;

  const periodLabel = anchor.format('MMMM YYYY');

  // Sidebar data
  const categoryStats = computeCategoryStats(transactions);
  const accountStats = computeAccountStats(transactions, accounts);

  // Period start/end for sidebar modal
  const filterStart = startParam || anchor.format('YYYY-MM-DD');
  const filterEnd = endParam || anchor.endOf('month').format('YYYY-MM-DD');

  const buildPageUrl = (p: number) => {
    const params = new URLSearchParams();
    if (searchParams.type) params.set('type', searchParams.type);
    if (searchParams.category) params.set('category', searchParams.category);
    if (searchParams.account) params.set('account', searchParams.account);
    if (searchParams.search) params.set('search', searchParams.search);
    if (searchParams.start) params.set('start', searchParams.start);
    if (searchParams.end) params.set('end', searchParams.end);
    if (searchParams.sort) params.set('sort', searchParams.sort);
    if (searchParams.min_amount) params.set('min_amount', searchParams.min_amount);
    if (searchParams.max_amount) params.set('max_amount', searchParams.max_amount);
    params.set('page', String(p));
    return `/transactions?${params.toString()}`;
  };

  return (
    <div className="p-4 sm:p-6 min-h-screen" style={{ background: 'var(--bg)' }}>
      {/* Header */}
      <Suspense fallback={null}>
        <TransactionPageHeader txCount={transactions.length} estimatedTotal={estimatedTotal} />
      </Suspense>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_268px] gap-6">
        {/* LEFT: summary + filters + table */}
        <div className="min-w-0">
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <SummaryCard label="Total Pemasukan" value={formatRupiah(incomeTotal)} valueColor="var(--positive)" />
            <SummaryCard label="Total Pengeluaran" value={formatRupiah(expenseTotal)} valueColor="var(--negative)" />
            <SummaryCard
              label="Net"
              value={net >= 0 ? formatRupiah(net) : `−${formatRupiah(Math.abs(net))}`}
              valueColor={net >= 0 ? 'var(--positive)' : 'var(--negative)'}
            />
            <SummaryCard label="Rata-rata / Hari" value={formatRupiah(avgDaily)} valueColor="var(--text-hi)" />
          </div>

          {/* Filters + sort (combined) */}
          <Suspense fallback={null}>
            <TransactionFilters categories={categories} accounts={accounts} defaultStart={filterStart} defaultEnd={filterEnd} />
          </Suspense>

          {/* Transaction table */}
          <Card className="overflow-hidden">
            <TransactionListClient
              transactions={transactions}
              categories={categories}
              accounts={accounts}
              installments={installments}
            />
          </Card>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
                Halaman {page} dari {totalPages}
              </p>
              <div className="flex items-center gap-1.5">
                <PaginationLink href={buildPageUrl(page - 1)} disabled={page <= 1}>Prev</PaginationLink>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let p: number;
                  if (totalPages <= 5) p = i + 1;
                  else if (page <= 3) p = i + 1;
                  else if (page >= totalPages - 2) p = totalPages - 4 + i;
                  else p = page - 2 + i;
                  return (
                    <a
                      key={p}
                      href={buildPageUrl(p)}
                      className={`px-2.5 py-1.5 text-xs rounded-lg border transition-colors ${
                        p === page ? 'bg-foreground text-background border-foreground' : 'border-border text-foreground hover:bg-muted'
                      }`}
                    >
                      {p}
                    </a>
                  );
                })}
                <PaginationLink href={buildPageUrl(page + 1)} disabled={!hasMore}>Next</PaginationLink>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT: sidebar */}
        <div className="xl:sticky xl:top-6 xl:self-start">
          <TransactionSidebar
            categoryStats={categoryStats}
            accountStats={accountStats}
            start={filterStart}
            end={filterEnd}
            periodLabel={periodLabel}
          />
        </div>
      </div>
    </div>
  );
}
