'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';

export default function TransactionSort({ currentSort }: { currentSort: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const handleSortChange = useCallback(
    (sortValue: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (sortValue) {
        params.set('sort', sortValue);
      } else {
        params.delete('sort');
      }
      router.push(`${pathname}?${params.toString()}`);
    },
    [searchParams, pathname, router]
  );

  return (
    <select
      value={currentSort}
      onChange={(e) => handleSortChange(e.target.value)}
      className="text-xs border border-input rounded px-2 py-1.5 h-8 min-w-[118px] focus:outline-none bg-background text-foreground"
    >
      <option value="date_desc">Tanggal ↓</option>
      <option value="date_asc">Tanggal ↑</option>
      <option value="amount_desc">Jumlah ↓</option>
      <option value="amount_asc">Jumlah ↑</option>
    </select>
  );
}