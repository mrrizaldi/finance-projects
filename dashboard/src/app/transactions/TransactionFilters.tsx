'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';
import { Category } from '@/types';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

interface Props {
  categories: Category[];
}

export default function TransactionFilters({ categories }: Props) {
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
  const search = searchParams.get('search') || '';
  const startDate = searchParams.get('start') || '';
  const endDate = searchParams.get('end') || '';

  const hasFilters = type || category || search || startDate || endDate;

  return (
    <Card className="mb-4">
      <CardContent className="pt-4">
        <div className="flex flex-wrap gap-3">
          {/* Search */}
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Cari deskripsi, merchant..."
              value={search}
              onChange={(e) => push({ search: e.target.value || null })}
              className="pl-9"
            />
          </div>

          {/* Type */}
          <select
            value={type}
            onChange={(e) => push({ type: e.target.value || null })}
            className="text-sm border border-input rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring bg-background text-foreground"
          >
            <option value="">Semua tipe</option>
            <option value="expense">Pengeluaran</option>
            <option value="income">Pemasukan</option>
            <option value="transfer">Transfer</option>
          </select>

          {/* Category */}
          <select
            value={category}
            onChange={(e) => push({ category: e.target.value || null })}
            className="text-sm border border-input rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring bg-background text-foreground"
          >
            <option value="">Semua kategori</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.icon} {cat.name}
              </option>
            ))}
          </select>

          {/* Date range */}
          <Input
            type="date"
            value={startDate}
            onChange={(e) => push({ start: e.target.value || null })}
            className="w-auto"
          />
          <Input
            type="date"
            value={endDate}
            onChange={(e) => push({ end: e.target.value || null })}
            className="w-auto"
          />

          {/* Reset */}
          {hasFilters && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push(pathname)}
              className="gap-1.5"
            >
              <X className="h-3.5 w-3.5" />
              Reset
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
