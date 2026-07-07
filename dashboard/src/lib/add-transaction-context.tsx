'use client';

import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';

type TxMode = 'transaction' | 'transfer';
type TxType = 'expense' | 'income';

interface ModalState {
  open: boolean;
  mode: TxMode;
  type: TxType;
}

interface AddTransactionCtx {
  state: ModalState;
  openModal: (opts?: { mode?: TxMode; type?: TxType }) => void;
  closeModal: () => void;
}

const Ctx = createContext<AddTransactionCtx | null>(null);

export function AddTransactionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ModalState>({
    open: false,
    mode: 'transaction',
    type: 'expense',
  });

  const openModal = (opts?: { mode?: TxMode; type?: TxType }) => {
    setState({
      open: true,
      mode: opts?.mode ?? 'transaction',
      type: opts?.type ?? 'expense',
    });
  };

  const closeModal = () => setState((s) => ({ ...s, open: false }));

  return <Ctx.Provider value={{ state, openModal, closeModal }}>{children}</Ctx.Provider>;
}

export function useAddTransaction(): AddTransactionCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAddTransaction must be inside AddTransactionProvider');
  return ctx;
}
