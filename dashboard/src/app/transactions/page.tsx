import { Suspense } from 'react';
import { createServerClient } from '@/lib/supabase';
import { VTransaction, Category, Account } from '@/types';
import TransactionListClient from '@/components/transactions/TransactionListClient';
import TransactionFilters from './TransactionFilters';
import { formatRupiah } from '@/lib/utils';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export const revalidate = 30;

const PAGE_SIZE = 25;

interface Props {
  searchParams: {
    page?: string;
    type?: string;
    category?: string;
    search?: string;
    start?: string;
    end?: string;
    sort?: string;
  };
}

async function getData(searchParams: Props['searchParams']) {
  const supabase = createServerClient();
  const page = Math.max(1, parseInt(searchParams.page || '1'));
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = supabase
    .from('v_transactions')
    .select('*', { count: 'exact' });

  if (searchParams.type) query = query.eq('type', searchParams.type);
  if (searchParams.category) query = query.eq('category_id', searchParams.category);
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

  const [txRes, catRes, accRes] = await Promise.all([
    query,
    supabase.from('categories').select('*').order('sort_order'),
    supabase.from('accounts').select('id, name, type, balance, icon').order('name'),
  ]);

  return {
    transactions: (txRes.data ?? []) as VTransaction[],
    total: txRes.count ?? 0,
    categories: (catRes.data ?? []) as Category[],
    accounts: (accRes.data ?? []) as Account[],
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
  const { transactions, total, categories, accounts, page } = await getData(searchParams);
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const buildPageUrl = (p: number) => {
    const params = new URLSearchParams();
    if (searchParams.type) params.set('type', searchParams.type);
    if (searchParams.category) params.set('category', searchParams.category);
    if (searchParams.search) params.set('search', searchParams.search);
    if (searchParams.start) params.set('start', searchParams.start);
    if (searchParams.end) params.set('end', searchParams.end);
    if (searchParams.sort) params.set('sort', searchParams.sort);
    params.set('page', String(p));
    return `/transactions?${params.toString()}`;
  };

  // Calculate totals for current filtered view
  const incomeTotal = transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expenseTotal = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Transaksi</h1>
        <p className="text-muted-foreground text-sm mt-1">{total} transaksi ditemukan</p>
      </div>

      <Suspense fallback={null}>
        <TransactionFilters categories={categories} />
      </Suspense>

      {/* Sort + summary bar */}
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-4 text-sm">
          <span className="text-emerald-600 font-medium">+{formatRupiah(incomeTotal)}</span>
          <span className="text-red-500 font-medium">-{formatRupiah(expenseTotal)}</span>
        </div>
        <form className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">Urut:</label>
          <select
            name="sort"
            defaultValue={searchParams.sort || 'date_desc'}
            className="text-xs border border-input rounded px-2 py-1 focus:outline-none bg-background text-foreground"
          >
            <option value="date_desc">Tanggal ↓</option>
            <option value="date_asc">Tanggal ↑</option>
            <option value="amount_desc">Jumlah ↓</option>
            <option value="amount_asc">Jumlah ↑</option>
          </select>
        </form>
      </div>

      {/* Transaction list */}
      <Card>
        <TransactionListClient transactions={transactions} categories={categories} accounts={accounts} />
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-muted-foreground">
            Halaman {page} dari {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <PaginationLink href={buildPageUrl(page - 1)} disabled={page <= 1}>
              <ChevronLeft className="h-4 w-4" />
            </PaginationLink>
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
            <PaginationLink href={buildPageUrl(page + 1)} disabled={page >= totalPages}>
              <ChevronRight className="h-4 w-4" />
            </PaginationLink>
          </div>
        </div>
      )}
    </div>
  );
}
