import { describe, it, expect } from 'vitest';

// Mirrors the state machine in TransferForm.tsx
function makeTransferState(accounts: { id: string; name: string }[]) {
  let fromAccountId = accounts[0]?.id ?? '';
  let toAccountId = accounts[1]?.id ?? '';

  return {
    get fromAccountId() { return fromAccountId; },
    get toAccountId() { return toAccountId; },
    get isButtonDisabled() { return fromAccountId === toAccountId; },

    // Buggy version (no swap)
    changeFromBuggy(newFrom: string) {
      fromAccountId = newFrom;
    },

    // Fixed version (with swap)
    changeFromFixed(newFrom: string) {
      if (newFrom === toAccountId) toAccountId = fromAccountId;
      fromAccountId = newFrom;
    },
  };
}

const ACCOUNTS = [
  { id: 'bca-001', name: 'BCA' },
  { id: 'bsi-002', name: 'BSI' },
  { id: 'gopay-003', name: 'GoPay' },
];

describe('TransferForm account swap — BUG reproduction', () => {
  it('buggy: changing "Dari Akun" to same as "Ke Akun" disables button', () => {
    const state = makeTransferState(ACCOUNTS);
    state.changeFromBuggy('bsi-002');
    expect(state.fromAccountId).toBe('bsi-002');
    expect(state.toAccountId).toBe('bsi-002'); // not swapped
    expect(state.isButtonDisabled).toBe(true);  // BUG
  });
});

describe('TransferForm account swap — FIX', () => {
  it('changing "Dari Akun" to collision value auto-swaps "Ke Akun"', () => {
    const state = makeTransferState(ACCOUNTS);
    state.changeFromFixed('bsi-002');
    expect(state.fromAccountId).toBe('bsi-002');
    expect(state.toAccountId).toBe('bca-001'); // swapped
    expect(state.isButtonDisabled).toBe(false);
  });

  it('no collision: "Ke Akun" unchanged', () => {
    const state = makeTransferState(ACCOUNTS);
    state.changeFromFixed('gopay-003');
    expect(state.toAccountId).toBe('bsi-002'); // unchanged
    expect(state.isButtonDisabled).toBe(false);
  });

  it('swap back works correctly', () => {
    const state = makeTransferState(ACCOUNTS);
    state.changeFromFixed('bsi-002'); // from=BSI, to=BCA
    state.changeFromFixed('bca-001'); // from=BCA → collision with to=BCA → swap → to=BSI
    expect(state.fromAccountId).toBe('bca-001');
    expect(state.toAccountId).toBe('bsi-002');
    expect(state.isButtonDisabled).toBe(false);
  });
});
