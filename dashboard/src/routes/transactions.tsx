import { useLoaderData } from 'react-router';
import type { ClientLoaderFunctionArgs } from 'react-router';
import { getBrowserClient } from '@/lib/supabase';
import { VTransaction, Category, Account, Installment } from '@/types';
import TransactionListClient from '@/components/transactions/TransactionListClient';
import TransactionFilters from '@/components/transactions/TransactionFilters';
import TransactionPageHeader from '@/components/transactions/TransactionPageHeader';
import TransactionSidebar, { CategoryStat, AccountStat } from '@/components/transactions/TransactionSidebar';
import { formatRupiah } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import dayjs from 'dayjs';
import 'dayjs/locale/id';

dayjs.locale('id');

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

export async function clientLoader({ request }: ClientLoaderFunctionArgs) {
  const url = new URL(request.url);
  const sp = url.searchParams;

  const page = Math.max(1, parseInt(sp.get('page') || '1'));
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE;

  const supabase = getBrowserClient();

  let query = supabase.from('v_transactions').select(TX_LIST_COLUMNS);

  if (sp.get('type')) query = query.eq('type', sp.get('type')!);
  if (sp.get('category')) query = query.eq('category_id', sp.get('category')!);
  if (sp.get('account')) query = query.or(`account_id.eq.${sp.get('account')},to_account_id.eq.${sp.get('account')}`);
  if (sp.get('search')) query = query.or(`description.ilike.%${sp.get('search')}%,merchant.ilike.%${sp.get('search')}%`);

  const effectiveStart = sp.get('start') || dayjs().startOf('month').format('YYYY-MM-DD');
  const effectiveEnd = sp.get('end') || dayjs().endOf('month').format('YYYY-MM-DD');
  query = query.gte('transaction_date', `${effectiveStart}T00:00:00`);
  query = query.lte('transaction_date', `${effectiveEnd}T23:59:59`);

  if (sp.get('min_amount')) query = query.gte('amount', Number(sp.get('min_amount')));
  if (sp.get('max_amount')) query = query.lte('amount', Number(sp.get('max_amount')));

  const sort = sp.get('sort') || 'date_desc';
  switch (sort) {
    case 'date_asc': query = query.order('transaction_date', { ascending: true }); break;
    case 'amount_desc': query = query.order('amount', { ascending: false }); break;
    case 'amount_asc': query = query.order('amount', { ascending: true }); break;
    default: query = query.order('transaction_date', { ascending: false });
  }

  query = query.range(from, to);

  const [txRes, catRes, accRes, instRes] = await Promise.all([
    query,
    supabase.from('categories').select('id, name, type, color, budget_monthly, sort_order, is_active').eq('is_active', true).order('sort_order'),
    supabase.from('accounts').select('id, name, type, balance, is_active').eq('is_active', true).order('name'),
    supabase.from('installments').select('id, name, monthly_amount, status').eq('status', 'active').order('name'),
  ]);

  const rows = ((txRes.data ?? []) as unknown[]) as VTransaction[];
  const hasMore = rows.length > PAGE_SIZE;
  const transactions = hasMore ? rows.slice(0, PAGE_SIZE) : rows;

  return {
    transactions,
    hasMore,
    page,
    categories: (catRes.data ?? []) as Category[],
    accounts: (accRes.data ?? []) as Account[],
    installments: (instRes.data ?? []) as Pick<Installment, 'id' | 'name' | 'monthly_amount' | 'status'>[],
    // Pass search param values so the page can use them without re-reading URL
    filterStart: sp.get('start') || effectiveStart,
    filterEnd: sp.get('end') || effectiveEnd,
    startParam: sp.get('start') || '',
    endParam: sp.get('end') || '',
    sortParam: sort,
    searchParam: sp.get('search') || '',
    typeParam: sp.get('type') || '',
    categoryParam: sp.get('category') || '',
    accountParam: sp.get('account') || '',
    minAmountParam: sp.get('min_amount') || '',
    maxAmountParam: sp.get('max_amount') || '',
  };
}

export default function TransactionsPage() {
  const {
    transactions, hasMore, page, categories, accounts, installments,
    filterStart, filterEnd, startParam, endParam, sortParam,
    searchParam, typeParam, categoryParam, accountParam, minAmountParam, maxAmountParam,
  } = useLoaderData<typeof clientLoader>();

  const estimatedTotal = (page - 1) * PAGE_SIZE + transactions.length + (hasMore ? 1 : 0);
  const totalPages = Math.max(page, Math.ceil(estimatedTotal / PAGE_SIZE));

  const nonAdj = transactions.filter((t) => !t.is_adjustment);
  const incomeTotal = nonAdj.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expenseTotal = nonAdj.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const net = incomeTotal - expenseTotal;

  const anchor = startParam ? dayjs(startParam) : dayjs().startOf('month');
  const periodEnd = endParam ? dayjs(endParam) : anchor.endOf('month');
  const days = Math.max(1, periodEnd.diff(anchor, 'day') + 1);
  const avgDaily = expenseTotal / days;
  const periodLabel = anchor.format('MMMM YYYY');

  const categoryStats = computeCategoryStats(transactions);
  const accountStats = computeAccountStats(transactions, accounts);

  const buildPageUrl = (p: number) => {
    const params = new URLSearchParams();
    if (typeParam) params.set('type', typeParam);
    if (categoryParam) params.set('category', categoryParam);
    if (accountParam) params.set('account', accountParam);
    if (searchParam) params.set('search', searchParam);
    if (startParam) params.set('start', startParam);
    if (endParam) params.set('end', endParam);
    if (sortParam) params.set('sort', sortParam);
    if (minAmountParam) params.set('min_amount', minAmountParam);
    if (maxAmountParam) params.set('max_amount', maxAmountParam);
    params.set('page', String(p));
    return `/transactions?${params.toString()}`;
  };

  return (
    <div className="p-4 sm:p-6 min-h-screen" style={{ background: 'var(--bg)' }}>
      <TransactionPageHeader txCount={transactions.length} estimatedTotal={estimatedTotal} />

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

      <TransactionFilters categories={categories} accounts={accounts} defaultStart={filterStart} defaultEnd={filterEnd} />

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_268px] gap-6">
        <div className="min-w-0">
          <Card className="overflow-hidden">
            <TransactionListClient
              transactions={transactions}
              categories={categories}
              accounts={accounts}
              installments={installments}
            />
          </Card>

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
