'use client';

import { useState } from 'react';
import { CategoryBreakdown } from '@/types';
import { formatRupiah } from '@/lib/utils';
import CategoryTransactionsModal from './CategoryTransactionsModal';

interface Props {
  categories: CategoryBreakdown[];
  start: string;
  end: string;
}

export default function CategoryListClient({ categories, start, end }: Props) {
  const [selected, setSelected] = useState<CategoryBreakdown | null>(null);

  return (
    <>
      <div className="mt-4 space-y-2">
        {categories.slice(0, 5).map((cat) => (
          <button
            key={cat.category_id}
            onClick={() => setSelected(cat)}
            className="w-full flex items-center gap-2 text-left rounded-md px-1 py-1 hover:bg-muted/50 transition-colors cursor-pointer"
          >
            <div
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ background: cat.category_color || '#6b7280' }}
            />
            <span className="text-xs text-muted-foreground flex-1 truncate">{cat.category_name}</span>
            <span className="text-xs font-medium text-foreground">{formatRupiah(cat.total_amount)}</span>
            <span className="text-xs text-muted-foreground w-10 text-right">{cat.percentage}%</span>
          </button>
        ))}
        {categories.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4">Tidak ada data</p>
        )}
      </div>

      <CategoryTransactionsModal
        open={!!selected}
        onClose={() => setSelected(null)}
        categoryId={selected?.category_id ?? null}
        categoryName={selected?.category_name ?? null}
        categoryColor={selected?.category_color ?? null}
        start={start}
        end={end}
      />
    </>
  );
}
