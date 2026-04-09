'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';
import { Category, Account } from '@/types';
import { Search, X, Filter } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface Props {
  categories: Category[];
  accounts: Account[];
}

export default function TransactionFilters({ categories, accounts }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const createQueryString = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === '') {
          params.delete(key);
        } else {
          params.set(key, value);
        }
        // Reset page on filter change
        if (key !== 'page') params.delete('page');
      }
      return params.toString();
    },
    [searchParams]
  );

  const push = (updates: Record<string, string | null>) => {
    router.push(`${pathname}?${createQueryString(updates)}`);
  };

  const type = searchParams.get('type') || '';
  const category = searchParams.get('category') || '';
  const account = searchParams.get('account') || '';
  const search = searchParams.get('search') || '';
  const startDate = searchParams.get('start') || '';
  const endDate = searchParams.get('end') || '';

  const hasFilters = type || category || account || search || startDate || endDate;

  return (
    <Card className="mb-6 bg-card border-border shadow-sm">
      <CardContent className="p-4">
        <div className="flex flex-col md:flex-row gap-4">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Cari deskripsi, merchant..."
              value={search}
              onChange={(e) => push({ search: e.target.value || null })}
              className="pl-9 h-10 bg-background/50 border-input w-full"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Type */}
            <Select
              value={type}
              onValueChange={(val) => push({ type: val === 'all' ? null : val })}
            >
              <SelectTrigger className="w-[140px] h-10 bg-background/50">
                <div data-slot="select-value" className="flex flex-1 text-left items-center gap-1.5">
                  {type && type !== 'all' ? (
                    type === 'expense' ? 'Pengeluaran' : type === 'income' ? 'Pemasukan' : 'Transfer'
                  ) : (
                    <span className="text-muted-foreground">Semua tipe</span>
                  )}
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua tipe</SelectItem>
                <SelectItem value="expense">Pengeluaran</SelectItem>
                <SelectItem value="income">Pemasukan</SelectItem>
                <SelectItem value="transfer">Transfer</SelectItem>
              </SelectContent>
            </Select>

            {/* Category */}
            <Select
              value={category}
              onValueChange={(val) => push({ category: val === 'all' ? null : val })}
            >
              <SelectTrigger className="w-[180px] h-10 bg-background/50">
                <div data-slot="select-value" className="flex flex-1 text-left items-center gap-1.5">
                  {category && category !== 'all' && categories.find((c) => c.id === category) ? (
                    <>
                      {categories.find((c) => c.id === category)?.icon}{' '}
                      {categories.find((c) => c.id === category)?.name}
                    </>
                  ) : (
                    <span className="text-muted-foreground">Semua kategori</span>
                  )}
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua kategori</SelectItem>
                {categories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    <span className="flex items-center gap-2">
                      <span className="w-5 h-5 flex items-center justify-center text-xs rounded-full bg-muted">
                        {cat.icon}
                      </span>
                      {cat.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Account */}
            <Select
              value={account}
              onValueChange={(val) => push({ account: val === 'all' ? null : val })}
            >
              <SelectTrigger className="w-[160px] h-10 bg-background/50">
                <div data-slot="select-value" className="flex flex-1 text-left items-center gap-1.5">
                  {account && account !== 'all' && accounts.find((a) => a.id === account) ? (
                    <>
                      {accounts.find((a) => a.id === account)?.icon}{' '}
                      {accounts.find((a) => a.id === account)?.name}
                    </>
                  ) : (
                    <span className="text-muted-foreground">Semua akun</span>
                  )}
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua akun</SelectItem>
                {accounts.map((acc) => (
                  <SelectItem key={acc.id} value={acc.id}>
                    <span className="flex items-center gap-2">
                      <span className="w-5 h-5 flex items-center justify-center text-xs rounded-full bg-muted">
                        {acc.icon}
                      </span>
                      {acc.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Date range */}
            <div className="flex items-center gap-2 bg-background/50 border border-input rounded-lg px-3 h-10">
              <input
                type="date"
                value={startDate}
                onChange={(e) => push({ start: e.target.value || null })}
                className="bg-transparent text-sm text-foreground focus:outline-none w-auto"
              />
              <span className="text-muted-foreground text-sm">-</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => push({ end: e.target.value || null })}
                className="bg-transparent text-sm text-foreground focus:outline-none w-auto"
              />
            </div>

            {/* Reset */}
            {hasFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push(pathname)}
                className="h-10 px-3 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4 mr-2" />
                Reset
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}