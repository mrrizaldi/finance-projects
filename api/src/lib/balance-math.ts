export type TransactionType = 'income' | 'expense' | 'transfer';

export type TxBalanceState = {
  type: TransactionType;
  amount: number;
  account_id: string | null;
  to_account_id: string | null;
};

export type BalanceSnapshot = {
  balance_before: number | null;
  balance_after: number | null;
  to_balance_before: number | null;
  to_balance_after: number | null;
};

export function getEffects(tx: TxBalanceState): Record<string, number> {
  const effects: Record<string, number> = {};

  if (tx.type === 'income') {
    if (tx.account_id) effects[tx.account_id] = (effects[tx.account_id] ?? 0) + tx.amount;
    return effects;
  }

  if (tx.type === 'expense') {
    if (tx.account_id) effects[tx.account_id] = (effects[tx.account_id] ?? 0) - tx.amount;
    return effects;
  }

  // transfer
  if (tx.account_id) effects[tx.account_id] = (effects[tx.account_id] ?? 0) - tx.amount;
  if (tx.to_account_id) effects[tx.to_account_id] = (effects[tx.to_account_id] ?? 0) + tx.amount;
  return effects;
}

export function diffEffects(
  before: Record<string, number>,
  after: Record<string, number>
): Record<string, number> {
  const out: Record<string, number> = {};
  const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));
  for (const key of keys) {
    const delta = (after[key] ?? 0) - (before[key] ?? 0);
    if (Math.abs(delta) > 0.000001) out[key] = delta;
  }
  return out;
}

export function invertEffects(effects: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, value] of Object.entries(effects)) {
    out[id] = -value;
  }
  return out;
}

export function buildSnapshotForState(
  nextState: TxBalanceState,
  existingState: TxBalanceState,
  updates: Map<string, { before: number; after: number }>,
  fallback?: BalanceSnapshot
): BalanceSnapshot {
  const from = nextState.account_id ? updates.get(nextState.account_id) : undefined;
  const to = nextState.to_account_id ? updates.get(nextState.to_account_id) : undefined;

  const balance_before = nextState.account_id !== existingState.account_id
    ? (from?.before ?? fallback?.balance_before ?? null)
    : (fallback?.balance_before ?? null);

  const to_balance_before = nextState.type === 'transfer'
    ? (nextState.to_account_id !== existingState.to_account_id
        ? (to?.before ?? fallback?.to_balance_before ?? null)
        : (fallback?.to_balance_before ?? null))
    : null;

  return {
    balance_before,
    balance_after: nextState.account_id !== existingState.account_id
      ? (from?.after ?? null)
      : (from?.after ?? fallback?.balance_after ?? null),
    to_balance_before,
    to_balance_after: nextState.type === 'transfer'
      ? (nextState.to_account_id !== existingState.to_account_id
          ? (to?.after ?? null)
          : (to?.after ?? fallback?.to_balance_after ?? null))
      : null,
  };
}
