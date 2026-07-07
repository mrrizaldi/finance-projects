'use client';

import { useCallback } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Category, Account } from '@/types';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';

interface Props {
  categories: Category[];
  accounts: Account[];
  defaultStart: string;
  defaultEnd: string;
}

const SORT_OPTIONS = [
  { value: 'date_desc', label: 'Tanggal terbaru' },
  { value: 'date_asc', label: 'Tanggal terlama' },
  { value: 'amount_desc', label: 'Jumlah terbesar' },
  { value: 'amount_asc', label: 'Jumlah terkecil' },
];

const AMOUNT_RANGES = [
  { value: 'all', label: 'Apa saja', min: null, max: null },
  { value: 'lt50k', label: '< Rp 50rb', min: null, max: '50000' },
  { value: '50k500k', label: 'Rp 50rb – 500rb', min: '50000', max: '500000' },
  { value: '500k5jt', label: 'Rp 500rb – 5jt', min: '500000', max: '5000000' },
  { value: 'gt5jt', label: '> Rp 5jt', min: '5000000', max: null },
];

function activeStyle(active: boolean) {
  if (!active) return {};
  return {
    border: '1.5px solid var(--accent-hi)',
    color: 'var(--accent-hi)',
    background: 'var(--accent-soft)',
  };
}

function FilterTrigger({
  label,
  value,
  active,
}: {
  label: string;
  value: string;
  active: boolean;
}) {
  return (
    <div
      className="flex items-center gap-0.5 text-sm whitespace-nowrap"
      style={active ? { color: 'var(--accent-hi)' } : { color: 'var(--text-mid)' }}
    >
      <span style={{ color: active ? 'var(--accent-hi)' : 'var(--text-dim)' }}>{label}:</span>
      <span className="font-medium ml-0.5">{value}</span>
    </div>
  );
}

export default function TransactionFilters({ categories, accounts, defaultStart, defaultEnd }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const createQueryString = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === '') params.delete(key);
        else params.set(key, value);
        if (key !== 'page') params.delete('page');
      }
      return params.toString();
    },
    [searchParams]
  );

  const push = (updates: Record<string, string | null>) =>
    router.push(`${pathname}?${createQueryString(updates)}`);

  const type = searchParams.get('type') || '';
  const category = searchParams.get('category') || '';
  const account = searchParams.get('account') || '';
  const search = searchParams.get('search') || '';
  const startDate = searchParams.get('start') || defaultStart;
  const endDate = searchParams.get('end') || defaultEnd;
  const minAmount = searchParams.get('min_amount') || '';
  const maxAmount = searchParams.get('max_amount') || '';
  const sort = searchParams.get('sort') || 'date_desc';

  const isTypeActive = !!type && type !== 'all';
  const isCategoryActive = !!category && category !== 'all';
  const isAccountActive = !!account && account !== 'all';
  const isAmountActive = !!minAmount || !!maxAmount;
  const isDateActive = !!searchParams.get('start') || !!searchParams.get('end');
  const hasFilters = isTypeActive || isCategoryActive || isAccountActive || isAmountActive || isDateActive;

  const activeAmountRange =
    AMOUNT_RANGES.find(
      (r) => r.min === (minAmount || null) && r.max === (maxAmount || null)
    )?.value || 'all';

  const typeName = !type || type === 'all'
    ? 'Semua'
    : type === 'expense' ? 'Pengeluaran' : type === 'income' ? 'Pemasukan' : 'Transfer';

  const categoryName = isCategoryActive
    ? (categories.find((c) => c.id === category)?.name || 'Semua')
    : 'Semua';

  const accountName = isAccountActive
    ? (accounts.find((a) => a.id === account)?.name || 'Semua')
    : 'Semua';

  const amountName =
    AMOUNT_RANGES.find((r) => r.value === activeAmountRange)?.label || 'Apa saja';

  const sortLabel =
    SORT_OPTIONS.find((s) => s.value === sort)?.label || 'Tanggal terbaru';

  return (
    <div
      className="rounded-xl mb-4 overflow-hidden"
      style={{ background: 'var(--surface)', border: '1px solid var(--border-faint)' }}
    >
      {/* Row 1: search + filter dropdowns */}
      <div className="flex flex-wrap items-center gap-2 p-3">
        {/* Search */}
        <div
          className="flex items-center gap-2 flex-1 min-w-[160px] h-9 px-3 rounded-lg"
          style={{ border: '1px solid var(--border-faint)', background: 'var(--bg)' }}
        >
          <svg className="h-3.5 w-3.5 flex-shrink-0" style={{ color: 'var(--text-dim)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Cari nama, kategori, akun..."
            value={search}
            onChange={(e) => push({ search: e.target.value || null })}
            className="flex-1 bg-transparent text-sm focus:outline-none placeholder:text-[var(--text-dim)]"
            style={{ color: 'var(--text-hi)' }}
          />
        </div>

        {/* Divider */}
        <div className="hidden sm:block w-px h-5" style={{ background: 'var(--border-faint)' }} />

        {/* Tipe */}
        <Select value={type || 'all'} onValueChange={(v) => push({ type: v === 'all' ? null : v })}>
          <SelectTrigger
            className="h-9 px-3 text-sm w-auto gap-1 rounded-lg"
            style={activeStyle(isTypeActive)}
          >
            <FilterTrigger label="Tipe" value={typeName} active={isTypeActive} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua</SelectItem>
            <SelectItem value="expense">Pengeluaran</SelectItem>
            <SelectItem value="income">Pemasukan</SelectItem>
            <SelectItem value="transfer">Transfer</SelectItem>
          </SelectContent>
        </Select>

        {/* Kategori */}
        <Select value={category || 'all'} onValueChange={(v) => push({ category: v === 'all' ? null : v })}>
          <SelectTrigger
            className="h-9 px-3 text-sm w-auto gap-1 rounded-lg"
            style={activeStyle(isCategoryActive)}
          >
            <FilterTrigger label="Kategori" value={categoryName} active={isCategoryActive} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua</SelectItem>
            {categories.map((cat) => (
              <SelectItem key={cat.id} value={cat.id}>
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: cat.color }} />
                  {cat.name}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Akun */}
        <Select value={account || 'all'} onValueChange={(v) => push({ account: v === 'all' ? null : v })}>
          <SelectTrigger
            className="h-9 px-3 text-sm w-auto gap-1 rounded-lg"
            style={activeStyle(isAccountActive)}
          >
            <FilterTrigger label="Akun" value={accountName} active={isAccountActive} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua</SelectItem>
            {accounts.map((acc) => (
              <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Jumlah */}
        <Select
          value={activeAmountRange}
          onValueChange={(v) => {
            const range = AMOUNT_RANGES.find((r) => r.value === v);
            push({ min_amount: range?.min ?? null, max_amount: range?.max ?? null });
          }}
        >
          <SelectTrigger
            className="h-9 px-3 text-sm w-auto gap-1 rounded-lg"
            style={activeStyle(isAmountActive)}
          >
            <FilterTrigger label="Jumlah" value={amountName} active={isAmountActive} />
          </SelectTrigger>
          <SelectContent>
            {AMOUNT_RANGES.map((r) => (
              <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Row 2: Tanggal + Sort */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 pb-2.5">
        {/* Tanggal */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm" style={{ color: 'var(--text-dim)' }}>Tanggal:</span>
          <div
            className="flex items-center gap-2 h-9 px-3 rounded-lg text-sm"
            style={{ border: '1px solid var(--border-faint)', background: 'var(--bg)' }}
          >
            <input
              type="date"
              value={startDate}
              onChange={(e) => push({ start: e.target.value || null })}
              className="bg-transparent text-sm focus:outline-none"
              style={{ color: 'var(--text-hi)' }}
            />
            <span style={{ color: 'var(--text-dim)' }}>–</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => push({ end: e.target.value || null })}
              className="bg-transparent text-sm focus:outline-none"
              style={{ color: 'var(--text-hi)' }}
            />
          </div>
          {hasFilters && (
            <button
              onClick={() => router.push(pathname)}
              className="h-9 px-3 rounded-lg text-sm font-medium transition-colors hover:bg-[var(--surface-hi)]"
              style={{ color: 'var(--negative)', border: '1px solid var(--border-faint)' }}
            >
              Reset semua
            </button>
          )}
        </div>

        {/* Sort */}
        <div className="flex items-center gap-2">
          <span className="text-sm" style={{ color: 'var(--text-dim)' }}>Urut:</span>
          <Select value={sort} onValueChange={(v) => push({ sort: v })}>
            <SelectTrigger className="h-9 px-3 text-sm w-auto gap-1 rounded-lg" style={{ border: '1px solid var(--border-faint)' }}>
              <span className="text-sm font-medium" style={{ color: 'var(--text-mid)' }}>{sortLabel}</span>
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((s) => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
