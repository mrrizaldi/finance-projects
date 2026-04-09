'use client';

import { useState } from 'react';
import TransactionRow from './TransactionRow';
import TransactionDetailDialog from './TransactionDetailDialog';
import TransactionEditDialog from './TransactionEditDialog';
import TransactionDeleteDialog from './TransactionDeleteDialog';
import { VTransaction, Category, Account } from '@/types';

interface Props {
  transactions: VTransaction[];
  categories: Category[];
  accounts: Account[];
}

type DialogMode = 'detail' | 'edit' | 'delete' | null;

export default function TransactionListClient({ transactions, categories, accounts }: Props) {
  const [selected, setSelected] = useState<VTransaction | null>(null);
  const [mode, setMode] = useState<DialogMode>(null);

  function open(tx: VTransaction, m: DialogMode) {
    setSelected(tx);
    setMode(m);
  }

  function closeAll() {
    setMode(null);
  }

  return (
    <>
      {transactions.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground">
          <p className="text-3xl mb-2">🔍</p>
          <p className="text-sm">Tidak ada transaksi yang sesuai filter</p>
        </div>
      ) : (
        transactions.map((tx) => (
          <TransactionRow
            key={tx.id}
            tx={tx}
            onClick={() => open(tx, 'detail')}
          />
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
        onSuccess={closeAll}
      />

      <TransactionDeleteDialog
        tx={selected}
        open={mode === 'delete'}
        onOpenChange={(o) => !o && closeAll()}
        onSuccess={closeAll}
      />
    </>
  );
}
