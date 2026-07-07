'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import TransactionRow, { TransactionRowMobile, TX_GRID } from './TransactionRow';
import TransactionDetailDialog from './TransactionDetailDialog';
import TransactionEditDialog from './TransactionEditDialog';
import TransactionDeleteDialog from './TransactionDeleteDialog';
import { VTransaction, Category, Account, Installment } from '@/types';

interface Props {
  transactions: VTransaction[];
  categories: Category[];
  accounts: Account[];
  installments: Pick<Installment, 'id' | 'name' | 'monthly_amount' | 'status'>[];
}

type DialogMode = 'detail' | 'edit' | 'delete' | null;

const TABLE_HEADERS = ['TANGGAL', 'DESKRIPSI', 'KATEGORI', 'AKUN', 'JUMLAH', ''];

export default function TransactionListClient({ transactions, categories, accounts, installments }: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<VTransaction | null>(null);
  const [mode, setMode] = useState<DialogMode>(null);
  const [isRefreshing, startRefresh] = useTransition();

  function open(tx: VTransaction, m: DialogMode) {
    setSelected(tx);
    setMode(m);
  }

  function closeAll() {
    setMode(null);
  }

  function handleWriteSuccess() {
    closeAll();
    startRefresh(() => {
      router.refresh();
    });
  }

  return (
    <>
      {isRefreshing && (
        <div className="fixed inset-0 z-[120] bg-black/70 backdrop-blur-sm flex items-center justify-center">
          <div className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground shadow-xl">
            Memuat ulang transaksi...
          </div>
        </div>
      )}

      {/* Desktop table header */}
      <div
        className={`hidden sm:grid items-center gap-3 px-4 py-2.5 border-b ${TX_GRID}`}
        style={{ borderColor: 'var(--border-faint)', background: 'var(--surface-hi)' }}
      >
        {TABLE_HEADERS.map((h, i) => (
          <span
            key={i}
            className={`label-up ${i === TABLE_HEADERS.length - 2 ? 'text-right' : ''}`}
          >
            {h}
          </span>
        ))}
      </div>

      {transactions.length === 0 ? (
        <div className="py-16 text-center" style={{ color: 'var(--text-dim)' }}>
          <p className="text-sm">Tidak ada transaksi yang sesuai filter</p>
        </div>
      ) : (
        transactions.map((tx) => (
          <div key={tx.id} className="group">
            <TransactionRow tx={tx} onClick={() => open(tx, 'detail')} />
            <TransactionRowMobile tx={tx} onClick={() => open(tx, 'detail')} />
          </div>
        ))
      )}

      <TransactionDetailDialog
        tx={selected}
        open={mode === 'detail'}
        onOpenChange={(o) => !o && closeAll()}
        onEdit={() => setMode('edit')}
        onDelete={() => setMode('delete')}
      />

      <TransactionEditDialog
        tx={selected}
        open={mode === 'edit'}
        onOpenChange={(o) => !o && closeAll()}
        categories={categories}
        accounts={accounts}
        installments={installments}
        onSuccess={handleWriteSuccess}
      />

      <TransactionDeleteDialog
        tx={selected}
        open={mode === 'delete'}
        onOpenChange={(o) => !o && closeAll()}
        onSuccess={handleWriteSuccess}
      />
    </>
  );
}
