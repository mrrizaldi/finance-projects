// dashboard/src/components/analytics/TopTransactionsList.tsx
import { TopTransaction } from '@/types';
import { formatRupiah, formatDate } from '@/lib/utils';

interface Props {
  transactions: TopTransaction[];
}

export default function TopTransactionsList({ transactions }: Props) {
  if (!transactions.length) {
    return (
      <p className="text-sm text-muted-foreground text-center py-6">
        Tidak ada transaksi di periode ini
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {transactions.map((tx, i) => (
        <div key={tx.id} className="flex items-center gap-3">
          {/* Rank */}
          <span className="text-xs font-bold text-muted-foreground w-4 shrink-0">
            {i + 1}
          </span>
          {/* Category color dot */}
          <span
            className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{ background: tx.category_color ?? '#94a3b8' }}
          />
          {/* Description */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">
              {tx.description || tx.merchant || 'Tanpa keterangan'}
            </p>
            <p className="text-xs text-muted-foreground">
              {tx.category_name ?? '–'} · {formatDate(tx.transaction_date)}
            </p>
          </div>
          {/* Amount */}
          <span className="text-sm font-bold text-red-500 shrink-0">
            {formatRupiah(tx.amount)}
          </span>
        </div>
      ))}
    </div>
  );
}
