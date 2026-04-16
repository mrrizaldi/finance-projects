import { Suspense } from 'react';
import { unstable_cache } from 'next/cache';
import { createServerClient } from '@/lib/supabase';
import { VTransaction, Category, Account, Installment } from '@/types';
import TransactionListClient from '@/components/transactions/TransactionListClient';
import TransactionFilters from './TransactionFilters';
import TransactionSort from './TransactionSort';
import { formatRupiah } from '@/lib/utils';
import { Card } from '@/components/ui/card';

export const revalidate = 60;

const PAGE_SIZE = 25;
const TX_LIST_COLUMNS = [
  'id',
  'type',
  'amount',
  'description',
  'merchant',
  'category_id',
  'account_id',
  'to_account_id',
  'installment_id',
  'source',
  'balance_before',
  'balance_after',
  'to_balance_before',
  'to_balance_after',
  'is_adjustment',
  'adjustment_note',
  'transaction_date',
  'created_at',
  'updated_at',
  'category_name',
  'category_color',
  'account_name',
  'to_account_name',
  'installment_name',
].join(', ');
const REFERENCE_TTL_SECONDS = 300;

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
  };
}

const getTransactionReferences = unstable_cache(
  async () => {
    const supabase = createServerClient();
    const [catRes, accRes, instRes] = await Promise.all([
      supabase
        .from('categories')
        .select('id, name, type, color, budget_monthly, sort_order, is_active')
        .eq('is_active', true)
        .order('sort_order'),
      supabase
        .from('accounts')
        .select('id, name, type, balance, is_active')
        .eq('is_active', true)
        .order('name'),
      supabase
        .from('installments')
        .select('id, name, monthly_amount, status')
        .eq('status', 'active')
        .order('name'),
    ]);

    return {
      categories: (catRes.data ?? []) as Category[],
      accounts: (accRes.data ?? []) as Account[],
      installments: (instRes.data ?? []) as Pick<Installment, 'id' | 'name' | 'monthly_amount' | 'status'>[],
    };
  },
  ['transactions-references'],
  { revalidate: REFERENCE_TTL_SECONDS, tags: ['accounts', 'categories', 'installments', 'transactions-references'] }
);

async function getData(searchParams: Props['searchParams']) {
  const supabase = createServerClient();
  const page = Math.max(1, parseInt(searchParams.page || '1'));
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE;

  let query = supabase
    .from('v_transactions')
    .select(TX_LIST_COLUMNS);

  if (searchParams.type) query = query.eq('type', searchParams.type);
  if (searchParams.category) query = query.eq('category_id', searchParams.category);
  if (searchParams.account) {
    query = query.or(`account_id.eq.${searchParams.account},to_account_id.eq.${searchParams.account}`);
  }
  if (searchParams.search) {
    query = query.or(
      `description.ilike.%${searchParams.search}%,merchant.ilike.%${searchParams.search}%`
    );
  }
  if (searchParams.start) {
    query = query.gte('transaction_date', `${searchParams.start}T00:00:00`);
  }
  if (searchParams.end) {
    query = query.lte('transaction_date', `${searchParams.end}T23:59:59`);
  }

  const sort = searchParams.sort || 'date_desc';
  switch (sort) {
    case 'date_asc': query = query.order('transaction_date', { ascending: true }); break;
    case 'amount_desc': query = query.order('amount', { ascending: false }); break;
    case 'amount_asc': query = query.order('amount', { ascending: true }); break;
    default: query = query.order('transaction_date', { ascending: false });
  }

  query = query.range(from, to);

  const [txRes, refs] = await Promise.all([
    query,
    getTransactionReferences(),
  ]);

  const rows = ((txRes.data ?? []) as unknown[]) as VTransaction[];
  const hasMore = rows.length > PAGE_SIZE;
  const transactions = hasMore ? rows.slice(0, PAGE_SIZE) : rows;

  return {
    transactions,
    hasMore,
    categories: refs.categories,
    accounts: refs.accounts,
    installments: refs.installments,
    page,
  };
}

function PaginationLink({ href, children, disabled }: { href: string; children: React.ReactNode; disabled?: boolean }) {
  if (disabled) {
    return (
      <span className="px-3 py-2 text-sm text-muted-foreground border border-border rounded-lg cursor-not-allowed flex items-center">
        {children}
      </span>
    );
  }
  return (
    <a href={href} className="px-3 py-2 text-sm text-foreground border border-border rounded-lg hover:bg-muted flex items-center transition-colors">
      {children}
    </a>
  );
}

export default async function TransactionsPage({ searchParams }: Props) {
  const { transactions, hasMore, categories, accounts, installments, page } = await getData(searchParams);
  const estimatedTotal = (page - 1) * PAGE_SIZE + transactions.length + (hasMore ? 1 : 0);
  const totalPages = Math.max(page, Math.ceil(estimatedTotal / PAGE_SIZE));

  const buildPageUrl = (p: number) => {
    const params = new URLSearchParams();
    if (searchParams.type) params.set('type', searchParams.type);
    if (searchParams.category) params.set('category', searchParams.category);
    if (searchParams.account) params.set('account', searchParams.account);
    if (searchParams.search) params.set('search', searchParams.search);
    if (searchParams.start) params.set('start', searchParams.start);
    if (searchParams.end) params.set('end', searchParams.end);
    if (searchParams.sort) params.set('sort', searchParams.sort);
    params.set('page', String(p));
    return `/transactions?${params.toString()}`;
  };

  // Calculate totals for current filtered view
  const nonAdjustmentTransactions = transactions.filter((t) => !t.is_adjustment);
  const incomeTotal = nonAdjustmentTransactions
    .filter((t) => t.type === 'income')
    .reduce((s, t) => s + t.amount, 0);
  const expenseTotal = nonAdjustmentTransactions
    .filter((t) => t.type === 'expense')
    .reduce((s, t) => s + t.amount, 0);

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Transaksi</h1>
        <p className="text-muted-foreground text-sm mt-1">{transactions.length === 0 ? '0' : `~${estimatedTotal}`} transaksi ditemukan</p>
      </div>

      <Suspense fallback={null}>
        <TransactionFilters categories={categories} accounts={accounts} />
      </Suspense>

      {/* Sort + summary bar */}
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <span className="text-emerald-600 font-medium">+{formatRupiah(incomeTotal)}</span>
          <span className="text-red-500 font-medium">-{formatRupiah(expenseTotal)}</span>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <label className="text-xs text-muted-foreground">Urut:</label>
          <TransactionSort currentSort={searchParams.sort || 'date_desc'} />
        </div>
      </div>

      {/* Transaction list */}
      <Card>
        <TransactionListClient transactions={transactions} categories={categories} accounts={accounts} installments={installments} />
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-muted-foreground">
            Halaman {page} dari {totalPages}
          </p>
          <div className="flex items-center gap-2">
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
                  className={`px-3 py-2 text-sm rounded-lg border transition-colors ${
                    p === page
                      ? 'bg-foreground text-background border-foreground'
                      : 'border-border text-foreground hover:bg-muted'
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
  );
}
