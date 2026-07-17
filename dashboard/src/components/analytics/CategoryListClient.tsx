'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CategoryBreakdown } from '@/types';
import { formatRupiah } from '@/lib/utils';
import CategoryTransactionsModal from './CategoryTransactionsModal';

interface Props {
  categories: CategoryBreakdown[];
  start: string;
  end: string;
}

export default function CategoryListClient({ categories, start, end }: Props) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<CategoryBreakdown | null>(null);
  const max = Number(categories[0]?.percentage ?? 100);

  return (
    <>
      <div className="space-y-3 pt-1">
        {categories.slice(0, 6).map((cat) => {
          const pct = Number(cat.percentage);
          return (
            <button
              key={cat.category_id}
              onClick={() => setSelected(cat)}
              className="w-full text-left rounded-md px-1 py-0.5 hover:bg-muted/40 transition-colors"
            >
              {/* Row 1: dot + name + amount */}
              <div className="flex items-center gap-2">
                <div
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ background: cat.category_color || '#6b7280' }}
                />
                <span className="text-sm flex-1 truncate font-medium" style={{ color: 'var(--text-hi)' }}>
                  {cat.category_name}
                </span>
                <span className="num text-sm font-semibold" style={{ color: 'var(--text-hi)' }}>
                  {formatRupiah(cat.total_amount)}
                </span>
              </div>
              {/* Row 2: progress bar + % */}
              <div className="flex items-center gap-2 mt-1 ml-4">
                <div className="flex-1 h-0.5 rounded-full" style={{ background: 'var(--border-faint)' }}>
                  <div
                    className="h-0.5 rounded-full"
                    style={{
                      width: `${(pct / max) * 100}%`,
                      background: cat.category_color || 'var(--accent-hi)',
                    }}
                  />
                </div>
                <span className="num text-xs w-8 text-right flex-shrink-0" style={{ color: 'var(--text-dim)' }}>
                  {pct.toFixed(1)}%
                </span>
              </div>
            </button>
          );
        })}
        {categories.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4">{t('common.noData')}</p>
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
