'use client';

import { useEffect, useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { formatRupiah } from '@/lib/utils';
import dayjs from 'dayjs';
import 'dayjs/locale/id';

dayjs.locale('id');

interface Transaction {
  id: string;
  type: string;
  amount: number;
  description?: string;
  merchant?: string;
  account_name?: string;
  transaction_date: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  categoryId: string | null;
  categoryName: string | null;
  categoryColor: string | null;
  start: string;
  end: string;
}

type SortKey = 'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc';

const SORT_OPTIONS: { value: SortKey; label: string; arrow: string }[] = [
  { value: 'date_desc', label: 'Tanggal', arrow: '↓' },
  { value: 'date_asc', label: 'Tanggal', arrow: '↑' },
  { value: 'amount_desc', label: 'Jumlah', arrow: '↓' },
  { value: 'amount_asc', label: 'Jumlah', arrow: '↑' },
];

export default function CategoryTransactionsModal({
  open,
  onClose,
  categoryId,
  categoryName,
  categoryColor,
  start,
  end,
}: Props) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [sort, setSort] = useState<SortKey>('date_desc');

  const fetchTransactions = useCallback(async () => {
    if (!categoryId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ category_id: categoryId, start, end, sort });
      const res = await fetch(`/api/transactions?${params}`);
      const data = await res.json();
      setTransactions(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }, [categoryId, start, end, sort]);

  useEffect(() => {
    if (open && categoryId) fetchTransactions();
  }, [open, fetchTransactions]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="w-[90vw] max-w-3xl max-h-[85vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-6 pt-5 pb-3 border-b border-border">
          <div className="flex items-center gap-2">
            {categoryColor && (
              <div
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ background: categoryColor }}
              />
            )}
            <DialogTitle className="text-base font-semibold">{categoryName}</DialogTitle>
          </div>
          <div className="mt-3 flex gap-2 flex-nowrap">
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setSort(opt.value)}
                className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors border ${
                  sort === opt.value
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-transparent text-muted-foreground border-border hover:bg-muted/50 hover:text-foreground'
                }`}
              >
                {opt.label}
                <span>{opt.arrow}</span>
              </button>
            ))}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-3">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
              Memuat...
            </div>
          ) : transactions.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
              Tidak ada transaksi
            </div>
          ) : (
            <div className="space-y-0">
              {transactions.map((tx) => (
                <div
                  key={tx.id}
                  className="flex items-start justify-between gap-3 py-2.5 border-b border-border/50 last:border-0"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {tx.merchant || tx.description || '—'}
                    </p>
                    {tx.merchant && tx.description && (
                      <p className="text-xs text-muted-foreground truncate">{tx.description}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {dayjs(tx.transaction_date).format('D MMM YYYY')}
                      {tx.account_name && ` · ${tx.account_name}`}
                    </p>
                  </div>
                  <span
                    className={`text-sm font-semibold flex-shrink-0 ${
                      tx.type === 'income' ? 'text-emerald-400' : 'text-foreground'
                    }`}
                  >
                    {tx.type === 'income' ? '+' : '-'}{formatRupiah(tx.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-6 py-3 border-t border-border text-xs text-muted-foreground">
          {transactions.length} transaksi
        </div>
      </DialogContent>
    </Dialog>
  );
}
