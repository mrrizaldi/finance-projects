'use client';

import { useState } from 'react';
import { TransactionForm } from './TransactionForm';
import { TransferForm } from './TransferForm';
import type { Account, Category } from '@/types';

interface Props {
  accounts: Account[];
  categories: Category[];
  defaultAccountId: string | null;
  onSuccess?: () => void;
}

export function AddPageClient({ accounts, categories, defaultAccountId, onSuccess }: Props) {
  const [mode, setMode] = useState<'transaction' | 'transfer'>('transaction');

  return (
    <div className="space-y-6">
      {/* Mode toggle */}
      <div className="flex rounded-lg bg-muted p-1">
        <button
          type="button"
          onClick={() => setMode('transaction')}
          className={`flex-1 rounded-md py-2 text-sm font-semibold transition-colors ${
            mode === 'transaction' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'
          }`}
        >
          Pengeluaran / Pemasukan
        </button>
        <button
          type="button"
          onClick={() => setMode('transfer')}
          className={`flex-1 rounded-md py-2 text-sm font-semibold transition-colors ${
            mode === 'transfer' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'
          }`}
        >
          Transfer
        </button>
      </div>

      {mode === 'transaction' ? (
        <TransactionForm
          accounts={accounts}
          categories={categories}
          defaultAccountId={defaultAccountId}
          onSuccess={onSuccess}
        />
      ) : (
        <TransferForm accounts={accounts} onSuccess={onSuccess} />
      )}
    </div>
  );
}
