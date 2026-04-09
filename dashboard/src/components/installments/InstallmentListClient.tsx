'use client';

import { useState } from 'react';
import { Installment, Category, Account } from '@/types';
import InstallmentCard from './InstallmentCard';
import InstallmentDetailDialog from './InstallmentDetailDialog';
import InstallmentEditDialog from './InstallmentEditDialog';

interface Props {
  installments: Installment[];
  categories: Category[];
  accounts: Account[];
  title: string;
  count: number;
}

type DialogMode = 'detail' | 'edit' | null;

export default function InstallmentListClient({ installments, categories, accounts, title, count }: Props) {
  const [selected, setSelected] = useState<Installment | null>(null);
  const [mode, setMode] = useState<DialogMode>(null);

  if (installments.length === 0) return null;

  function open(inst: Installment, m: DialogMode) {
    setSelected(inst);
    setMode(m);
  }

  function closeAll() {
    setMode(null);
  }

  return (
    <div className="mb-6">
      <h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
        {title} ({count})
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {installments.map((inst) => (
          <InstallmentCard
            key={inst.id}
            inst={inst}
            onClick={() => open(inst, 'detail')}
          />
        ))}
      </div>

      <InstallmentDetailDialog
        inst={selected}
        open={mode === 'detail'}
        onOpenChange={(o) => !o && closeAll()}
        onEdit={() => setMode('edit')}
      />

      <InstallmentEditDialog
        inst={selected}
        open={mode === 'edit'}
        onOpenChange={(o) => !o && closeAll()}
        categories={categories}
        accounts={accounts}
        onSuccess={closeAll}
      />
    </div>
  );
}