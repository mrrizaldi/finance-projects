import { describe, it, expect } from 'vitest';
import {
  getEffects,
  diffEffects,
  invertEffects,
  buildSnapshotForState,
  type TxBalanceState,
  type BalanceSnapshot,
} from '../../src/lib/balance-math.js';

// ── getEffects ────────────────────────────────────────────────────────────────

describe('getEffects', () => {
  it('expense subtracts from account_id', () => {
    expect(getEffects({ type: 'expense', amount: 50000, account_id: 'bca', to_account_id: null }))
      .toEqual({ bca: -50000 });
  });

  it('income adds to account_id', () => {
    expect(getEffects({ type: 'income', amount: 100000, account_id: 'bca', to_account_id: null }))
      .toEqual({ bca: 100000 });
  });

  it('transfer subtracts from account_id, adds to to_account_id', () => {
    expect(getEffects({ type: 'transfer', amount: 200000, account_id: 'bca', to_account_id: 'bsi' }))
      .toEqual({ bca: -200000, bsi: 200000 });
  });

  it('transfer beda nominal: keluar=amount, masuk=to_amount (admin fee)', () => {
    // Bug lama: tujuan dikredit amount (200335) padahal cuma 200000 yg masuk -> over-credit fee.
    expect(getEffects({ type: 'transfer', amount: 200335, to_amount: 200000, account_id: 'bsi', to_account_id: 'bca' }))
      .toEqual({ bsi: -200335, bca: 200000 });
  });

  it('transfer to_amount null = nominal sama (fallback ke amount)', () => {
    expect(getEffects({ type: 'transfer', amount: 100000, to_amount: null, account_id: 'bca', to_account_id: 'bsi' }))
      .toEqual({ bca: -100000, bsi: 100000 });
  });

  it('edit transfer beda nominal: diff kredit tujuan pakai to_amount', () => {
    // expense 20000 di BCA -> jadi transfer BCA->GoPay dgn fee (masuk 19000)
    const before = getEffects({ type: 'expense', amount: 20000, account_id: 'bca', to_account_id: null });
    const after = getEffects({ type: 'transfer', amount: 20000, to_amount: 19000, account_id: 'bca', to_account_id: 'gopay' });
    // BCA: dari -20000 ke -20000 (no change), GoPay: 0 -> +19000
    expect(diffEffects(before, after)).toEqual({ gopay: 19000 });
  });

  it('expense with null account_id returns empty effects', () => {
    expect(getEffects({ type: 'expense', amount: 50000, account_id: null, to_account_id: null }))
      .toEqual({});
  });

  it('income with null account_id returns empty effects', () => {
    expect(getEffects({ type: 'income', amount: 50000, account_id: null, to_account_id: null }))
      .toEqual({});
  });
});

// ── diffEffects ───────────────────────────────────────────────────────────────

describe('diffEffects', () => {
  it('identical states produce empty diff', () => {
    expect(diffEffects({ bca: -50000 }, { bca: -50000 })).toEqual({});
  });

  it('amount change same account produces delta', () => {
    const before = { bca: -358762 };
    const after = { bca: -200000 };
    expect(diffEffects(before, after)).toEqual({ bca: 158762 });
  });

  it('account change removes old, adds new', () => {
    const before = { bca: -100000 };
    const after = { bsi: -100000 };
    expect(diffEffects(before, after)).toEqual({ bca: 100000, bsi: -100000 });
  });

  it('expense → income on same account flips double', () => {
    const before = getEffects({ type: 'expense', amount: 100000, account_id: 'bca', to_account_id: null });
    const after = getEffects({ type: 'income', amount: 100000, account_id: 'bca', to_account_id: null });
    expect(diffEffects(before, after)).toEqual({ bca: 200000 });
  });

  it('near-zero delta filtered out (floating point tolerance)', () => {
    expect(diffEffects({ bca: -0.0000001 }, { bca: 0 })).toEqual({});
  });
});

// ── invertEffects ─────────────────────────────────────────────────────────────

describe('invertEffects', () => {
  it('inverts all signs', () => {
    expect(invertEffects({ bca: -100000, bsi: 100000 })).toEqual({ bca: 100000, bsi: -100000 });
  });

  it('empty effects stays empty', () => {
    expect(invertEffects({})).toEqual({});
  });
});

// ── buildSnapshotForState ─────────────────────────────────────────────────────

const BASE_EXISTING: TxBalanceState = {
  type: 'expense',
  amount: 358762,
  account_id: 'bca',
  to_account_id: null,
};

const BASE_FALLBACK: BalanceSnapshot = {
  balance_before: 736036,
  balance_after: 377274,
  to_balance_before: null,
  to_balance_after: null,
};

describe('buildSnapshotForState', () => {
  it('no-diff edit: fallback values preserved unchanged', () => {
    const snapshot = buildSnapshotForState(BASE_EXISTING, BASE_EXISTING, new Map(), BASE_FALLBACK);
    expect(snapshot.balance_before).toBe(736036);
    expect(snapshot.balance_after).toBe(377274);
  });

  it('amount edit same account: balance_before = historical, balance_after = from.after', () => {
    const nextState = { ...BASE_EXISTING, amount: 200000 };
    const updates = new Map([['bca', { before: 377274, after: 536036 }]]);
    const snapshot = buildSnapshotForState(nextState, BASE_EXISTING, updates, BASE_FALLBACK);
    expect(snapshot.balance_before).toBe(736036);   // historical preserved
    expect(snapshot.balance_after).toBe(536036);    // from.after
    expect(snapshot.balance_after).toBe(snapshot.balance_before! - nextState.amount);
  });

  it('account change: balance_before = new account pre-diff balance', () => {
    const nextState = { ...BASE_EXISTING, account_id: 'bsi' };
    const updates = new Map([
      ['bca', { before: 377274, after: 736036 }], // restored
      ['bsi', { before: 500000, after: 141238 }], // new account
    ]);
    const snapshot = buildSnapshotForState(nextState, BASE_EXISTING, updates, BASE_FALLBACK);
    expect(snapshot.balance_before).toBe(500000);  // new account's before
    expect(snapshot.balance_after).toBe(141238);
  });

  it('transfer: to_account unchanged → to_balance_before preserved from fallback', () => {
    const existing: TxBalanceState = { type: 'transfer', amount: 100000, account_id: 'bca', to_account_id: 'bsi' };
    const fallback: BalanceSnapshot = { balance_before: 800000, balance_after: 700000, to_balance_before: 200000, to_balance_after: 300000 };
    const nextState = { ...existing, amount: 150000 };
    const updates = new Map([
      ['bca', { before: 700000, after: 750000 }],
      ['bsi', { before: 300000, after: 250000 }],
    ]);
    const snapshot = buildSnapshotForState(nextState, existing, updates, fallback);
    expect(snapshot.to_balance_before).toBe(200000); // preserved
    expect(snapshot.to_balance_after).toBe(250000);  // from.after
  });

  it('transfer: to_account changed → to_balance_before from new account', () => {
    const existing: TxBalanceState = { type: 'transfer', amount: 100000, account_id: 'bca', to_account_id: 'bsi' };
    const fallback: BalanceSnapshot = { balance_before: 800000, balance_after: 700000, to_balance_before: 200000, to_balance_after: 300000 };
    const nextState = { ...existing, to_account_id: 'gopay' };
    const updates = new Map([
      ['bsi', { before: 300000, after: 400000 }],   // restored
      ['gopay', { before: 50000, after: 150000 }],  // new destination
    ]);
    const snapshot = buildSnapshotForState(nextState, existing, updates, fallback);
    expect(snapshot.to_balance_before).toBe(50000);  // gopay before
    expect(snapshot.to_balance_after).toBe(150000);
  });

  it('non-transfer: to_balance fields always null', () => {
    const snapshot = buildSnapshotForState(BASE_EXISTING, BASE_EXISTING, new Map(), BASE_FALLBACK);
    expect(snapshot.to_balance_before).toBeNull();
    expect(snapshot.to_balance_after).toBeNull();
  });
});
