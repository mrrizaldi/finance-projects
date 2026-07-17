'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatRupiah } from '@/lib/utils';
import CategoryTransactionsModal from '@/components/analytics/CategoryTransactionsModal';

export interface CategoryStat {
  category_id: string;
  category_name: string;
  category_color: string | null;
  total: number;
  percentage: number;
}

export interface AccountStat {
  account_id: string;
  account_name: string;
  account_type: string;
  total: number;
  percentage: number;
}

interface Props {
  categoryStats: CategoryStat[];
  accountStats: AccountStat[];
  start: string;
  end: string;
  periodLabel: string;
}

function SidebarSection({ title, subtitle, children }: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-xl p-4"
      style={{ background: 'var(--surface)', border: '1px solid var(--border-faint)' }}
    >
      <p className="text-sm font-semibold mb-0.5" style={{ color: 'var(--text-hi)' }}>{title}</p>
      <p className="text-xs mb-3" style={{ color: 'var(--text-dim)' }}>{subtitle}</p>
      {children}
    </div>
  );
}

function StatRow({
  color,
  name,
  subLabel,
  total,
  percentage,
  max,
  onClick,
}: {
  color: string | null;
  name: string;
  subLabel?: string;
  total: number;
  percentage: number;
  max: number;
  onClick?: () => void;
}) {
  const barWidth = max > 0 ? (percentage / max) * 100 : 0;

  return (
    <button
      className="w-full text-left rounded-md px-1 py-1.5 transition-colors hover:bg-[var(--surface-hi)] disabled:cursor-default"
      onClick={onClick}
      disabled={!onClick}
    >
      <div className="flex items-start gap-2">
        <div
          className="w-2 h-2 rounded-full flex-shrink-0 mt-0.5"
          style={{ background: color || '#6b7280' }}
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate" style={{ color: 'var(--text-hi)' }}>{name}</p>
          {subLabel && (
            <p className="text-[10px]" style={{ color: 'var(--text-dim)' }}>{subLabel}</p>
          )}
        </div>
        <div className="text-right flex-shrink-0">
          <p className="num text-sm font-semibold" style={{ color: 'var(--text-hi)' }}>
            {formatRupiah(total)}
          </p>
          <p className="num text-xs" style={{ color: 'var(--text-dim)' }}>
            {percentage.toFixed(1)}%
          </p>
        </div>
      </div>
      {/* Progress bar */}
      <div className="h-0.5 rounded-full ml-4 mt-1.5" style={{ background: 'var(--border-faint)' }}>
        <div
          className="h-0.5 rounded-full"
          style={{ width: `${barWidth}%`, background: color || 'var(--accent-hi)' }}
        />
      </div>
    </button>
  );
}

export default function TransactionSidebar({
  categoryStats,
  accountStats,
  start,
  end,
  periodLabel,
}: Props) {
  const { t } = useTranslation();
  const [selectedCat, setSelectedCat] = useState<CategoryStat | null>(null);
  const maxCatPct = categoryStats[0]?.percentage ?? 100;
  const maxAccPct = accountStats[0]?.percentage ?? 100;

  return (
    <>
      <div className="flex flex-col gap-4">
        {/* Per Kategori */}
        <SidebarSection title={t('sidebar.perCategory')} subtitle={periodLabel}>
          {categoryStats.length === 0 ? (
            <p className="text-xs text-center py-4" style={{ color: 'var(--text-dim)' }}>
              {t('common.noData')}
            </p>
          ) : (
            <div className="space-y-0.5">
              {categoryStats.slice(0, 7).map((cat) => (
                <StatRow
                  key={cat.category_id}
                  color={cat.category_color}
                  name={cat.category_name}
                  total={cat.total}
                  percentage={cat.percentage}
                  max={maxCatPct}
                  onClick={() => setSelectedCat(cat)}
                />
              ))}
            </div>
          )}
        </SidebarSection>

        {/* Per Akun */}
        <SidebarSection title={t('sidebar.perAccount')} subtitle={periodLabel}>
          {accountStats.length === 0 ? (
            <p className="text-xs text-center py-4" style={{ color: 'var(--text-dim)' }}>
              {t('common.noData')}
            </p>
          ) : (
            <div className="space-y-0.5">
              {accountStats.slice(0, 6).map((acc) => (
                <StatRow
                  key={acc.account_id}
                  color={null}
                  name={acc.account_name}
                  subLabel={acc.account_type}
                  total={acc.total}
                  percentage={acc.percentage}
                  max={maxAccPct}
                />
              ))}
            </div>
          )}
        </SidebarSection>
      </div>

      {/* Category transactions modal */}
      <CategoryTransactionsModal
        open={!!selectedCat}
        onClose={() => setSelectedCat(null)}
        categoryId={selectedCat?.category_id ?? null}
        categoryName={selectedCat?.category_name ?? null}
        categoryColor={selectedCat?.category_color ?? null}
        start={start}
        end={end}
      />
    </>
  );
}
